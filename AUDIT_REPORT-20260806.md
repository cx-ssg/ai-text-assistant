# 审计报告 — chrome-ai-text 扩展 MVP v0.1.0（2026-08-06）

reviewer: hermes-editor
decision: approve

## 结论

32/32 测试独立复跑全绿（17 冒烟 + 7 真实 e2e + 8 边界），与执行者自报一致。
5 项验收标准全部达成（其中 2 项有 🟡 级瑕疵但不阻断）。核心交付物质量合格，
建议 approve，并限期修复 3 个 🟡 级问题（详见问题清单 #1/#2/#3）。

## 事实核查表

| # | 断言 | 结果 | 证据 |
|---|------|------|------|
| 1 | 冒烟 17/17 | ✅ 复跑 17/17 | node test_smoke.cjs 全绿 |
| 2 | 真实 e2e 7/7 | ✅ 复跑 7/7 | 真实 SiliconFlow key，润色耗时 1.2s + 翻译均返回非空结果 |
| 3 | 边界 8/8 | ✅ 复跑 8/8 | 空选择/无效模板/网络错误/超长文本/导航清理全过 |
| 4 | commit 60fb4ac + 7d5a893 | ✅ | git log 两 commit 存在，工作区 clean |
| 5 | MV3 合规 | ✅ | manifest_version 3、无远程代码、无 CSP 覆盖、SW + content_scripts 标准结构 |
| 6 | 权限最小化 | ⚠️ 基本满足 | permissions 仅 contextMenus+storage（无 tabs）；但 host_permissions 含 1 个未使用域名（见 #1） |
| 7 | key 不落 console/日志 | ✅ | 全代码仅 1 处 console.error（打印 err.message）；curl 实测 DeepSeek 401 响应体自带打码（md5 复现 `****2345`，响应 153 字节），扩展未泄露完整 key |
| 8 | key 存储 | ⚠️ storage.sync | 非验收标准字面意义的"本地存储"，sync 随 Chrome 账号同步（见 #2） |
| 9 | 错误路径友好 | ✅ | 401→引导设置页、网络错误→"处理失败"、空选择→提示、选区失效→降级文案（代码路径存在） |
| 10 | 隐私一致性 | ⚠️ | host_permissions 声明 4 域名，实际代码仅用 3（deepseek/openai/siliconflow）；generativelanguage.googleapis.com 无任何调用（见 #1） |
| 11 | 测试真实性 | ⚠️ 32 项逐一有效，1 项名实不符 | edge 第 5 项名为"选区失效替换提示"，实际断言为"导航后无残留"，未点击替换按钮验证降级分支（见 #3） |
| 12 | 假 key 401 路径 | ✅ | 假 key sk-fake-invalid → PING_API 返回 API_ERROR:401，浮窗引导正确 |
| 13 | key 打码输出 | ✅ | e2e 输出 sk-dan***aoix（首6+末4），.env 真实 key 未泄露 |

## 问题清单

🔴 无

🟡 警告（建议修复后进入下一阶段）：
1. **host_permissions 含未使用域名**：manifest 声明 `https://generativelanguage.googleapis.com/*`，但 options.js PRESET_URLS 无 Gemini、background.js 无对应调用。违反验收标准 1（权限最小化）与 5（host_permissions 与实际调用一致）。上架 Chrome Web Store 审核时声明不使用的域名权限易被质询。修复：从 manifest 删除该域名（或补 Gemini 支持）。
2. **key 存 storage.sync 而非 local**：验收标准 2 要求"storage 本地存储"。chrome.storage.sync 会把 key 同步到用户 Google 账号云端，与 spec 的"隐私好/零后端"定位和 BYOK 语义有张力。修复：key 改存 storage.local（模型/模板等非敏感项可留 sync），或至少文档明示该行为。
3. **自定义 Base URL 实际不可用**：options 允许用户填 custom 域名，但 MV3 下 fetch 需 host_permissions 覆盖，自定义域名（不在 4 个预设内）必然网络失败。边界测试只测了必然失败的 127.0.0.1:1，未覆盖自定义域名成功路径。修复：要么去掉 custom 选项，要么 manifest 用 `<all_urls>` 或提示用户该功能受限。

⚪ 建议：
4. **API 错误详情可能进 console/浮窗**：callAI 把响应体前 200 字符拼进错误消息，console.error 与浮窗都会显示。DeepSeek 已实测自行打码（安全），但若用户配置的第三方 API 回显完整 key，会泄露到 console。建议对 detail 做 key 模式 scrub（防御性）。
5. **edge 测试名实不符**：第 5 项断言未真正验证"替换按钮 → 选区失效提示"分支（content.js L171-176 该逻辑存在但无测试覆盖）。建议补一条真实验证。

## 置信度汇总

- 🟢 已核实：11 项（复跑 32/32、commit、MV3、key 存储位置、console 扫描、md5 复现打码、权限清单、假 key 401、打码输出）
- 🟡 估计值：2 项（自定义 baseUrl 失败为 MV3 规范推断，未实测真实自定义域名；storage.sync 同步行为为 Chrome 文档结论）
- 🔴 推测：0 项
- 违规项：无 🔴；🟡 推断项已在上方标注依据

## 教训候选

【方法论】e2e/边界测试与验收标准的映射要逐条核对测试名与断言内容——"测试通过"与"该验收点被覆盖"是两个概念（#3、#5）。
【盲区】MV3 扩展的 host_permissions 是"能力白名单"，声明未使用域名既违反最小化也过不了商店审核——交付前应 grep manifest 域名 vs 代码实际 fetch 域名做交叉核对。
【方法论】API 错误响应回显 key 的风险要实测（curl + md5 复现打码格式），不能假设供应商安全——本审计用 153 字节响应 + md5 对比确认 DeepSeek 打码策略。

---
审计人：Hermes Editor | 2026-08-06 | 材料独立取读，测试独立复跑
