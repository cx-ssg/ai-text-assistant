# Chrome Web Store 上架材料包（AI 文本助手）

> 用途：上架 chrome.google.com/webstore 时直接复制。
> 版本对应：manifest v0.1.0（2026-08-06）· 上架前建议把 version 升 0.2.0（图标重做 + e2e 断言已入）

## 一、基础信息

| 字段 | 值 |
|------|-----|
| 名称（Name） | AI 文本助手 - 选中即用 |
| 名称（英文备选） | AI Text Assistant - Select & Go |
| 摘要（Summary，≤132 字符） | 选中网页文字，右键一键 AI 润色/翻译/总结/纠错。自带 Key 模式（BYOK），支持 DeepSeek 及 OpenAI 兼容接口，国内直连免代理。 |
| 类别（Category） | Productivity（生产力） |
| 语言 | 中文（zh-CN）为主，可加 English |
| 图标 | icons/icon128.png（128x128） |
| 截图 | 见下（screenshots/ 目录，1280x800） |
| 可见性 | 公开上架（样品定位，冲安装量） |
| 单次注册费 | $5（Chrome Web Store 开发者账号，一次性） |

## 二、完整描述（Description，≤4000 字符）

### 中文版

**浏览器里最快的 AI 文本处理右键菜单。**

选中网页任意文字 → 右键 → 「AI 文本助手」→ 一键完成：

- ✍️ **润色**：让文字更通顺、专业、有感染力
- 🌐 **翻译**：中英互译，自动修正原文语法错误
- 📌 **总结**：快速提炼核心要点
- ✅ **纠错**：修正错别字、语法、标点
- 🎨 **自定义模板**：任意指令（如"改成小红书风格"），右键菜单动态生成

**为什么用「AI 文本助手」？**

- **自带 Key 模式（BYOK）**：填入你自己的 API Key 即可使用，无中间商、按量付费几分钱
- **国内直连免代理**：默认 DeepSeek，中文用户零门槛
- **零后端服务器**：文本只发送到你配置的 API 提供商，不经过任何第三方
- **最小权限**：仅使用右键菜单和本地存储，无广告、无追踪、无账号

**使用方法：**
1. 点击工具栏图标打开设置页
2. 填入你的 API Key（DeepSeek / OpenAI / SiliconFlow 等 OpenAI 兼容接口）
3. 选中网页文字 → 右键 → 选动作 → 结果浮窗 → 复制或一键替换原文

支持所有 OpenAI 兼容接口（/chat/completions），自定义 Base URL 和模型名。

### English Version

**The fastest AI text processing right-click menu in your browser.**

Select any text on a webpage → right-click → "AI Text Assistant" → done in one click:

- ✍️ **Polish**: Make your writing smoother and more professional
- 🌐 **Translate**: Chinese-English translation with automatic grammar correction
- 📌 **Summarize**: Extract key points instantly
- ✅ **Fix**: Correct typos, grammar and punctuation
- 🎨 **Custom templates**: Any instruction (e.g. "rewrite in Xiaohongshu style")

**Why AI Text Assistant?**

- **BYOK (Bring Your Own Key)**: Use your own API key — no middleman, pay pennies per use
- **No backend server**: Text is sent only to the API provider you configure
- **Minimal permissions**: contextMenus + local storage only. No ads, no tracking, no account

**How to use:**
1. Click the toolbar icon to open settings
2. Enter your API key (DeepSeek / OpenAI / SiliconFlow or any OpenAI-compatible endpoint)
3. Select text → right-click → choose an action → copy or replace the original text

Works with any OpenAI-compatible API (/chat/completions) via custom Base URL and model name.

## 三、隐私政策（Privacy Policy）

BYOK 模式下的隐私声明（商店"隐私"栏勾选"不收集任何用户数据"，并提供本声明 URL 或文本）：

> **AI 文本助手隐私声明（2026-08-06）**
>
> 本扩展**不收集、不上传、不存储**任何用户个人数据，也没有任何分析、广告或追踪组件。
>
> 1. **文本处理**：你选中的文本仅在触发处理时发送至**你自己配置的 API 提供商**（如 DeepSeek/OpenAI/SiliconFlow），这是完成润色/翻译等功能的必要条件。扩展本身没有服务器，不经过任何第三方中转。
> 2. **本地存储**：你的 API Key、模型配置、自定义模板仅保存在浏览器本地（chrome.storage.local），不会同步到任何服务器。
> 3. **第三方**：除你主动配置的 API 提供商外，扩展不与其他任何第三方通信。
> 4. **权限**：仅使用 contextMenus（右键菜单）与 storage（本地配置）两项权限。
> 5. **删除**：卸载扩展即删除全部本地数据；如需在设置页手动清除，删除 Key 字段并保存即可。
>
> 联系/问题：Chrome 商店开发者页面留言。

## 四、截图清单（screenshots/，1280x800）

| 图 | 内容 | 建议 |
|----|------|------|
| screenshot-1.png | 设置页全貌（API 配置 + 模板管理） | 首图，展示"BYOK 简单配置" |
| screenshot-2.png | 选中中文 → 润色浮窗结果 | 核心功能演示 |
| screenshot-3.png | 选中英文 → 翻译浮窗结果 | 核心功能演示 |
| screenshot-4.png | 自定义模板（如"小红书风格"） | 差异化卖点 |
| screenshot-5.png | 浮窗操作：复制/替换原文 | 操作闭环 |

生成方式：`node make_screenshots.cjs`（playwright 本地演示页 + SiliconFlow key 真实调用）。

## 五、上架流程（操作时用）

1. 注册开发者账号：https://chrome.google.com/webstore/devconsole → $5 一次性（需 Google 账号 + 国际信用卡/Google Play 余额；国内支付方式受限 → 备选方案见待办清单备注）
2. 上传：根目录 `zip`（manifest.json 必须在 zip 根，**不含** profile-demo/、node_modules、.git、测试文件）
3. 填 listing：复制本文档内容
4. 提交审核：通常几小时到 3 天；权限小 → 一般走快速通道

**zip 打包命令（Windows）：**
```
cd chrome-ai-text
tar -a -c -f ai-text-assistant-0.2.0.zip manifest.json background.js content.js options.html options.js icons/
```
