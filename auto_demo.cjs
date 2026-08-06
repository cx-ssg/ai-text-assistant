// AI 文本助手 - 演示录屏脚本（playwright recordVideo，输出 demos/demo.webm）
// 运行：node auto_demo.cjs
// 流程：演示页 → 依次触发 润色/翻译/总结/纠错（真实 API）→ 每步停顿让视频有节奏
const { chromium } = require("C:/Users/cx101/AppData/Roaming/npm/node_modules/playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");

const EXT_PATH = __dirname;
const ENV_PATH = "C:/Users/cx101/AppData/Local/hermes/profiles/editor/.env";
const OUT_DIR = path.join(EXT_PATH, "demos");
const MODEL = "deepseek-ai/DeepSeek-V3"; // e2e 验证过的稳定模型

function loadKey() {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const m = content.match(/^SILICONFLOW_API_KEY=(.+)$/m);
  if (!m) throw new Error("editor/.env 未找到 SILICONFLOW_API_KEY");
  return m[1].trim();
}

const DEMO_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<style>body{font-family:sans-serif;padding:40px;max-width:760px;margin:0 auto;line-height:1.9;color:#1f2937}
h1{font-size:24px}.hint{font-size:14px;color:#6b7280;margin-bottom:24px}</style></head><body>
<h1>AI 文本助手 · 演示</h1>
<p class="hint">选中文字 → 右键「AI 文本助手」→ 润色 / 翻译 / 总结 / 纠错 / 自定义模板</p>
<hr>
<p id="demo1"><b>① 中文（润色）：</b>这是一个演示文本，它的表达比较粗糙，希望得到润色改善，让它读起来更流畅更专业。</p>
<p id="demo2"><b>② 英文（翻译）：</b>This is an English sentence used to test the translation feature. If everything works, this text will be translated into Chinese.</p>
<p id="demo3"><b>③ 中文（总结）：</b>2026年8月6日，我们完成了一个Chrome扩展的样品开发，它可以在浏览器里直接对选中文字进行AI处理，包括润色、翻译、总结和纠错等功能。</p>
<p id="demo4"><b>④ 中文（纠错）：</b>今天早上我去的图书馆借了几本书，回来的时候在路上碰到了同学小李，他告诉我他昨天买了个新手机，那个手机的屏幕特别的大，看电影非常的清楚，我很羡慕他，但是我的手机还能用，所以决定不换手机了，等明年在说吧。</p>
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

async function selectText(page, sel) {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    const range = document.createRange();
    range.selectNodeContents(el);
    const selObj = window.getSelection();
    selObj.removeAllRanges();
    selObj.addRange(range);
  }, sel);
}

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
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 800 } },
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
      "--window-size=1280,800",
    ],
  });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  let sw = null;
  for (let i = 0; i < 30; i++) {
    const workers = ctx.serviceWorkers();
    if (workers.length > 0) { sw = workers[0]; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!sw) throw new Error("service worker 未启动");

  await sw.evaluate(async (key) => {
    const d = await chrome.storage.local.get("settings");
    const s = d.settings || {};
    s.apiKey = key;
    s.baseUrl = "https://api.siliconflow.cn/v1";
    s.model = "deepseek-ai/DeepSeek-V3";
    await chrome.storage.local.set({ settings: s });
  }, apiKey);

  await page.goto(`http://127.0.0.1:${port}/`, { timeout: 20000 });
  await page.waitForTimeout(1000);
  const demoTabId = (await sw.evaluate(async () => chrome.tabs.query({}))).pop()?.id;

  const acts = [
    { sel: "#demo1", tpl: "tpl-polish", text: "这是一个演示文本，它的表达比较粗糙，希望得到润色改善，让它读起来更流畅更专业。", label: "润色" },
    { sel: "#demo2", tpl: "tpl-translate", text: "This is an English sentence used to test the translation feature. If everything works, this text will be translated into Chinese.", label: "翻译" },
    { sel: "#demo3", tpl: "tpl-summary", text: "2026年8月6日，我们完成了一个Chrome扩展的样品开发，它可以在浏览器里直接对选中文字进行AI处理，包括润色、翻译、总结和纠错等功能。", label: "总结" },
    { sel: "#demo4", tpl: "tpl-fix", text: "今天早上我去的图书馆借了几本书，回来的时候在路上碰到了同学小李，他告诉我他昨天买了个新手机，那个手机的屏幕特别的大，看电影非常的清楚，我很羡慕他，但是我的手机还能用，所以决定不换手机了，等明年在说吧。", label: "纠错" },
  ];

  for (const a of acts) {
    await selectText(page, a.sel);
    await page.waitForTimeout(1200); // 让观众看到选中高亮
    const r = await runAction(sw, page, a.tpl, a.text, demoTabId);
    console.log(`${a.label}: ${r ? "OK " + r.slice(0, 40) + "…" : "无结果"}`);
    await page.waitForTimeout(2500); // 结果展示停顿
  }

  await page.waitForTimeout(1500);
  // 稳妥方式：close 后视频文件自动落盘，再从 video.path() 复制（saveAs 在 context 开着时会挂起等待 flush）
  const video = page.video();
  const vpath = video ? await video.path() : null;
  await ctx.close();
  server.close();
  if (vpath && fs.existsSync(vpath)) {
    const out = path.join(OUT_DIR, "demo.webm");
    fs.copyFileSync(vpath, out);
    const st = fs.statSync(out);
    console.log(`\n🎬 演示视频: ${out} (${(st.size / 1024 / 1024).toFixed(1)}MB)`);
  } else {
    console.log("⚠️ 无视频记录");
  }
}

main().catch((err) => { console.error("录屏脚本异常:", err); process.exit(1); });
