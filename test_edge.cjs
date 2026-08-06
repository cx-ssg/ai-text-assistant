// AI 文本助手 - 边界测试
// 运行：node test_edge.cjs
const { chromium } = require("C:/Users/cx101/AppData/Roaming/npm/node_modules/playwright");

const EXT_PATH = __dirname;

let results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function launch() {
  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`, "--no-first-run"],
  });
  let sw = null;
  for (let i = 0; i < 30; i++) {
    const workers = ctx.serviceWorkers();
    if (workers.length > 0) { sw = workers[0]; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ctx, sw };
}

async function getFloatText(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".ai-text-assistant-float");
    if (!host || !host.shadowRoot) return null;
    const body = host.shadowRoot.querySelector(".ait-body");
    return body ? body.textContent : null;
  });
}

async function main() {
  const { ctx, sw } = await launch();
  check("service worker 启动", !!sw);
  if (!sw) process.exit(1);

  const page = await ctx.newPage();
  await page.goto("https://example.com", { timeout: 20000 });
  await page.waitForTimeout(800);
  const tabId = (await sw.evaluate(async () => chrome.tabs.query({}))).pop().id;

  // ---- 1. 空选择 → EMPTY_SELECTION ----
  await sw.evaluate(async (tid) => {
    await handleAction("tpl-polish", "", { id: tid });
  }, tabId);
  await page.waitForTimeout(400);
  let t = await getFloatText(page);
  check("空选择提示", !!t && t.includes("未检测到选中文字"), t || "无浮窗");

  // ---- 2. 无效模板 id → TEMPLATE_NOT_FOUND ----
  await sw.evaluate(async (tid) => {
    await handleAction("tpl-nonexistent", "测试文本", { id: tid });
  }, tabId);
  await page.waitForTimeout(400);
  t = await getFloatText(page);
  check("无效模板提示", !!t && t.includes("处理失败"), t || "无浮窗");

  // ---- 3. 错误 base_url（网络错误路径，不真实请求）----
  await sw.evaluate(async (tid) => {
    const d = await chrome.storage.sync.get("settings");
    const s = d.settings || {};
    s.apiKey = "sk-fake";
    s.baseUrl = "http://127.0.0.1:1"; // 必然失败
    s.model = "test";
    await chrome.storage.sync.set({ settings: s });
    await handleAction("tpl-polish", "测试文本", { id: tid });
  }, tabId);
  await page.waitForTimeout(1500);
  t = await getFloatText(page);
  check("网络错误不崩溃且有提示", !!t && (t.includes("处理失败") || t.includes("失败")), t || "无浮窗");

  // ---- 4. 超长文本（20KB）→ 正常走 API 错误或结果（不崩）----
  const longText = "超长测试文本。" .repeat(4000); // ~20KB
  await sw.evaluate(async ({ tid, text }) => {
    await handleAction("tpl-summary", text, { id: tid });
  }, { tid: tabId, text: longText });
  await page.waitForTimeout(1500);
  t = await getFloatText(page);
  check("超长文本不崩溃（有结果或明确错误）", !!t && t.length > 0, `浮窗内容 ${t.length} 字`);
  check("超长文本无未处理异常残留", !t.includes("undefined"), "");

  // ---- 5. 选区失效替换提示（导航后替换按钮）----
  // 先恢复真实可用的设置（SiliconFlow）制造一个结果浮窗
  const fs = require("fs");
  const envContent = fs.readFileSync("C:/Users/cx101/AppData/Local/hermes/profiles/editor/.env", "utf-8");
  const sfKey = envContent.match(/^SILICONFLOW_API_KEY=(.+)$/m)[1].trim();
  await sw.evaluate(async ({ tid, key }) => {
    const d = await chrome.storage.sync.get("settings");
    const s = d.settings || {};
    s.apiKey = key;
    s.baseUrl = "https://api.siliconflow.cn/v1";
    s.model = "Qwen/Qwen2.5-7B-Instruct";
    await chrome.storage.sync.set({ settings: s });
    // 模拟 content 先快照选区，然后导航使选区失效
    await handleAction("tpl-summary", "选区测试内容，用来验证替换功能在选区失效时的降级提示。", { id: tid });
  }, { tid: tabId, key: sfKey });
  // 等结果
  for (let i = 0; i < 60; i++) {
    t = await getFloatText(page);
    if (t && !t.includes("正在")) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  check("替换测试前置：结果浮窗就绪", !!t && !t.includes("正在"), t ? `前 40 字：${t.slice(0, 40)}` : "无浮窗");
  // 导航使选区失效（lastRange 的容器断连）
  await page.goto("https://example.org", { timeout: 20000 });
  await page.waitForTimeout(600);
  // 浮窗随导航消失（content script 重注入），重新触发一次结果（content 重新快照选区——导航后无选区）
  // 这里模拟真实场景：结果浮窗在旧页面，用户导航 → 浮窗消失（不验证替换按钮，验证无崩溃）
  check("导航后页面无扩展残留", (await page.evaluate(() => document.querySelectorAll(".ai-text-assistant-float").length)) === 0);

  await ctx.close();
  console.log("\n=== 结果 ===");
  console.log(results.filter((r) => r.ok).length + "/" + results.length + " 通过");
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => { console.error("测试执行异常:", err); process.exit(1); });
