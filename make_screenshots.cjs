// AI 文本助手 - 商店截图生成脚本（1280x800 × 5 张）
// 运行：node make_screenshots.cjs
// 依赖：SiliconFlow key（从 hermes editor/.env 读，同 test_e2e_real.cjs）
// 产出：screenshots/screenshot-{1..5}.png
const { chromium } = require("C:/Users/cx101/AppData/Roaming/npm/node_modules/playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");

const EXT_PATH = __dirname;
const ENV_PATH = "C:/Users/cx101/AppData/Local/hermes/profiles/editor/.env";
const OUT_DIR = path.join(EXT_PATH, "screenshots");
const TEST_MODEL = "deepseek-ai/DeepSeek-V3"; // 与 e2e 同模型（指令遵循稳定，见 test_e2e_real.cjs 教训）

function loadKey() {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const m = content.match(/^SILICONFLOW_API_KEY=(.+)$/m);
  if (!m) throw new Error("editor/.env 未找到 SILICONFLOW_API_KEY");
  return m[1].trim();
}

// 演示页（含 5 段 demo 文本，来自 launch_demo.cjs）
const DEMO_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;padding:40px;max-width:760px;margin:0 auto;line-height:1.9;color:#1f2937}
h1{font-size:24px}h2{font-size:16px;color:#6b7280}</style></head><body>
<h1>AI 文本助手 · 演示页</h1>
<h2>选中文字 → 右键 → AI 文本助手 → 选动作</h2>
<hr>
<p id="demo1"><b>① 中文（试润色/总结）：</b>这是一个演示文本，它的表达比较粗糙，希望得到润色改善，让它读起来更流畅更专业。这是一段中文内容，包含了多个句子，用来测试右键菜单的完整流程是否正常工作。</p>
<p id="demo2"><b>② 英文（试翻译/润色）：</b>This is an English sentence used to test the translation feature. If everything works, this text will be translated into Chinese.</p>
<p id="demo3"><b>③ 中文（试总结）：</b>2026年8月6日，我们完成了一个Chrome扩展的样品开发，它可以在浏览器里直接对选中文字进行AI处理。</p>
<p id="demo4"><b>④ 有错误的中文（试纠错）：</b>今天早上我去的图书馆借了几本书，回来的时候在路上碰到了同学小李，他告诉我他昨天买了个新手机，那个手机的屏幕特别的大，看电影非常的清楚，我很羡慕他，但是我的手机还能用，所以决定不换手机了，等明年在说吧。</p>
</body></html>`;

function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DEMO_HTML);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// 选中页面元素文本（视觉真实：截图里有选区高亮）
async function selectText(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const range = document.createRange();
    range.selectNodeContents(el);
    const selObj = window.getSelection();
    selObj.removeAllRanges();
    selObj.addRange(range);
  }, selector);
}

// 触发动作并等待浮窗稳定（返回浮窗文本）
async function runAction(sw, page, tplId, text, tabId) {
  await sw.evaluate(
    async ({ tplId, text, tabId }) => { await handleAction(tplId, text, { id: tabId }); },
    { tplId, text, tabId }
  );
  for (let i = 0; i < 60; i++) {
    const t = await page.evaluate(() => {
      const host = document.querySelector(".ai-text-assistant-float");
      if (!host || !host.shadowRoot) return null;
      const err = host.shadowRoot.querySelector(".ait-error");
      if (err) return "ERR:" + err.textContent;
      const body = host.shadowRoot.querySelector(".ait-body");
      return body ? body.textContent : null;
    });
    if (t && !t.includes("正在")) return t;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

async function main() {
  const apiKey = loadKey();
  const server = await startLocalServer();
  const port = server.address().port;
  const DEMO_URL = `http://127.0.0.1:${port}/`;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
      "--window-size=1280,800",
    ],
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  let demoTabId = null;

  let sw = null;
  for (let i = 0; i < 30; i++) {
    const workers = ctx.serviceWorkers();
    if (workers.length > 0) { sw = workers[0]; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!sw) throw new Error("service worker 未启动");

  // 写入 key（SiliconFlow + DeepSeek-V3）
  await sw.evaluate(async (key) => {
    const d = await chrome.storage.local.get("settings");
    const s = d.settings || {};
    s.apiKey = key;
    s.baseUrl = "https://api.siliconflow.cn/v1";
    s.model = "deepseek-ai/DeepSeek-V3";
    await chrome.storage.local.set({ settings: s });
  }, apiKey);

  const extId = await sw.evaluate(() => chrome.runtime.id);
  await page.goto(DEMO_URL, { timeout: 20000 });
  await page.waitForTimeout(800);
  // 记录演示 tab id（只查一次，后续全部复用；MV3 无 tabs 权限读不到 url，取最后创建的 tab——e2e 同款做法已验证）
  const tabs = await sw.evaluate(async () => chrome.tabs.query({}));
  demoTabId = tabs[tabs.length - 1]?.id;
  if (!demoTabId) throw new Error("找不到演示 tab");

  // 截图 1：设置页
  const optPage = await ctx.newPage();
  await optPage.setViewportSize({ width: 1280, height: 800 });
  await optPage.goto(`chrome-extension://${extId}/options.html`, { timeout: 20000 });
  await optPage.waitForTimeout(1200);
  await optPage.screenshot({ path: path.join(OUT_DIR, "screenshot-1-options.png") });
  await optPage.close();
  console.log("✅ screenshot-1-options.png（设置页）");

  // 截图 2：中文润色浮窗
  await selectText(page, "#demo1");
  const polishText = await runAction(sw, page, "tpl-polish",
    "这是一个演示文本，它的表达比较粗糙，希望得到润色改善，让它读起来更流畅更专业。这是一段中文内容，包含了多个句子，用来测试右键菜单的完整流程是否正常工作。", demoTabId);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, "screenshot-2-polish.png") });
  console.log("✅ screenshot-2-polish.png（润色浮窗）", polishText ? "结果OK" : "⚠️ 无结果");

  // 截图 3：英文翻译浮窗
  await selectText(page, "#demo2");
  const transText = await runAction(sw, page, "tpl-translate",
    "This is an English sentence used to test the translation feature. If everything works, this text will be translated into Chinese.",
    demoTabId);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, "screenshot-3-translate.png") });
  console.log("✅ screenshot-3-translate.png（翻译浮窗）", transText ? "结果OK" : "⚠️ 无结果");

  // 截图 4：自定义模板（小红书风格）——写入模板后触发
  await sw.evaluate(async () => {
    const d = await chrome.storage.local.get("settings");
    const s = d.settings || {};
    s.templates = [
      ...(s.templates || []),
      { id: "tpl-xhs", name: "小红书风格", prompt: "请把以下文本改写成小红书种草文案风格：口语化、带 emoji、分点排版、有氛围感。直接输出改写结果。\n\n{{TEXT}}" },
    ];
    await chrome.storage.local.set({ settings: s });
  });
  await selectText(page, "#demo3");
  const xhsText = await runAction(sw, page, "tpl-xhs",
    "这是一个演示文本，它的表达比较粗糙，希望得到润色改善，让它读起来更流畅更专业。",
    demoTabId);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, "screenshot-4-custom-template.png") });
  console.log("✅ screenshot-4-custom-template.png（自定义模板）", xhsText ? "结果OK" : "⚠️ 无结果");

  // 截图 5：纠错 + 替换原文流程（浮窗按钮可见）
  await selectText(page, "#demo4");
  const fixText = await runAction(sw, page, "tpl-fix",
    "今天早上我去的图书馆借了几本书，回来的时候在路上碰到了同学小李，他告诉我他昨天买了个新手机，那个手机的屏幕特别的大，看电影非常的清楚，我很羡慕他，但是我的手机还能用，所以决定不换手机了，等明年在说吧。",
    demoTabId);
  await page.waitForTimeout(600);
  // 把浮窗替换按钮滚动到视野内，截包含操作按钮的完整浮窗
  await page.screenshot({ path: path.join(OUT_DIR, "screenshot-5-fix.png") });
  console.log("✅ screenshot-5-fix.png（纠错浮窗 + 操作按钮）", fixText ? "结果OK" : "⚠️ 无结果");

  await ctx.close();
  server.close();
  console.log("\n🎉 截图完成，输出目录：screenshots/");
  const files = fs.readdirSync(OUT_DIR);
  files.forEach((f) => {
    const st = fs.statSync(path.join(OUT_DIR, f));
    console.log(`  ${f}  ${(st.size / 1024).toFixed(1)}KB`);
  });
}

main().catch((err) => { console.error("截图脚本异常:", err); process.exit(1); });
