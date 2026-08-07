# Changelog

## 2026-08-07
- #39 发布前敏感扫描固化：新增 `tools/pre_publish_scan.cjs`（敏感路径 + 真实密钥模式 + 未追踪敏感文件，15 项自测），README 加「发布前检查」小节
- #40 demo.webm 回归保护：`auto_demo.cjs` 4 动作全部加语义断言（润色保持中文/翻译输出中文/输出≠输入），任一失败不更新 demo.webm 并 exit 1
- 修复：CHANGELOG.md 历史乱码（GBK 写入 UTF-8 导致 `??`，按事实重建）

## 2026-08-06
- 🔧 Chrome 图标重做：`icon32.png` 补 16/32/48/128px 全尺寸（Codex gpt-5.6-luna 委托，白字线+青绿笔划几何风）
- 🎨 `tools/make_icons.py`（Pillow 生成）+ `test_icons.cjs`（尺寸/像素多样性校验 4/4）
- ⚠️ 注：本文件曾因编码事故损坏（?? 占位），2026-08-07 按事实重建
