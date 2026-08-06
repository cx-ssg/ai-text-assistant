# Chrome 扩展 MVP Spec — AI 文本助手（样品）

- 版本：v0.1（brainstorming 收敛稿）
- 日期：2026-08-06
- 定位：**样品/作品集**（Upwork 敲门砖 + AI 开发能力证明 + 产品流程练习），非创业赌市场
- 状态：⏳ 待用户确认 → 确认后解锁编码（Process-over-Prompt 门控）

---

## 1. 产品定位

> 选中网页任意文字 → 右键 → AI 处理（润色/翻译/总结/纠错）→ 浮窗结果 → 一键复制或替换原文

**一句话**：浏览器里最快的 AI 文本处理右键菜单。

**差异化**（样品定位下是"故事点"而非"市场策略"）：
- BYOK（用户自带 API key）→ 零开发成本、用户按量付费几分钱
- DeepSeek 默认（国内直连免代理）→ 中文用户零门槛
- 无后端服务器 → 零运维、隐私好（文本只发用户自己的 key 对应的 API）

## 2. 目标用户

中文内容创作者/办公人群（写文案、回邮件、翻译文献）。样品阶段实际使用者 = 自己 + 演示给 Upwork 甲方看。

## 3. 核心功能（MVP 范围，2-3 天）

| # | 功能 | 说明 |
|---|------|------|
| F1 | 右键菜单 | 选中文字 → 右键 → 「AI 润色 / AI 翻译 / AI 总结 / AI 纠错 / 自定义模板」 |
| F2 | 结果浮窗 | 点击菜单项后弹出浮窗显示结果（加载中 → 完成），按钮：复制 / 替换原文 |
| F3 | 设置页 | API Key（DeepSeek 默认，兼容 OpenAI 协议）、模型选择、自定义 prompt 模板（增删改） |
| F4 | 自定义模板 | 用户可加任意动作（如"改成小红书风格"），右键菜单动态生成 |
| F5 | 快捷键 | （可选，MVP 可不做）Ctrl+Shift+K 触发默认动作 |

## 4. 技术方案

- **Manifest V3** + vanilla JS（无框架、无构建步骤——AI 集群写起来最快、审核最稳）
- 权限：`contextMenus` + `storage`（极小权限 → 官方口径审核快）
- 架构：
  ```
  manifest.json
  background.js      # service worker：右键菜单注册 + API 调用 + 浮窗消息
  content.js         # 注入页面：读选中文字、渲染浮窗、替换原文
  options.html/js    # 设置页：key/模型/模板
  styles.css
  icons/ (128/48/16)
  ```
- API 调用：background 直接 fetch（`host_permissions` 指向 API 域名，如 `https://api.deepseek.com`），OpenAI 兼容协议（`/chat/completions`）
- 数据流：content 取选中文本 → 发消息给 background → background fetch API → 结果回 content → 浮窗显示
- 替换原文：`document.execCommand('insertText')` 或选区替换（content script 操作）

## 5. 交互流程

1. 用户在任意网页选中一段文字
2. 右键 → 菜单出现「AI 助手」子菜单（润色/翻译/总结/纠错/自定义模板…）
3. 点击 → 浮窗出现（loading 动画）→ 结果返回
4. 浮窗按钮：📋 复制 / ♻️ 替换原文 / ✕ 关闭
5. 未配置 key 时 → 浮窗引导去设置页

## 6. 明确不做（MVP 排除）

- ❌ 侧边栏聊天/对话式 UI
- ❌ 账号系统、云同步、多设备
- ❌ 付费/订阅（上架先免费冲安装量）
- ❌ 流式输出（v1 一次性返回；如实现简单可加）
- ❌ 采集/爬取类功能（ToS 风险）
- ❌ 任何后端服务

## 7. 验收标准（R8 三要素：Driver 验证 + Hermes 审计 + 用户验收）

1. 本地开发者模式加载无报错，右键菜单出现，五类动作可用
2. 真实调用 DeepSeek API 返回结果（用户 key），浮窗显示 + 复制/替换生效
3. 设置页保存 key/模型/自定义模板，重启后持久化
4. 未配置 key / API 错误 / 网络错误 → 友好提示不崩溃
5. 权限清单仅 contextMenus + storage（+ API 域名 host_permissions）
6. 全流程演示录屏（用户验收）

## 8. 上架准备（后续步骤，非 MVP 编码范围）

- 注册 Chrome Web Store 开发者账号：$5 一次性（需代理，已实测可行）
- 上架材料：标题/描述/截图/隐私政策（BYOK 模式下隐私声明简单："数据仅发送至用户配置的 API 提供商"）
- 审核注意：权限越小越快；manifest 根目录 zip 上传

## 9. 待确认问题

- [ ] 快捷键（F5）MVP 做不做
- [ ] 项目目录命名（建议 `global-workspace/chrome-ai-text/`）
- [ ] 是否先本地自测（开发者模式）再上架
