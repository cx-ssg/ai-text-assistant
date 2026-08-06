// AI 文本助手 - 真实 DeepSeek key 端到端测试
// 运行：node test_e2e_real.cjs
// ⚠️ 依赖外部环境：真实 API key 从 C:/Users/cx101/AppData/Local/hermes/profiles/editor/.env 读取
//    （SILICONFLOW_API_KEY），换机/无此 key 时本测试不可复现，且真实调用产生微量费用。
// 安全：key 从 Hermes .env 读取，仅注入测试进程，输出全程打码（sk-***末4位）
const { chromium } = require("C:/Users/cx101/AppData/Roaming/npm/node_modules/playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");

const EXT_PATH = __dirname;
const ENV_PATH = "C:/Users/cx101/AppData/Local/hermes/profiles/editor/.env";
// 实测（2026-08-06）：DeepSeek 官方 key 已失效（08-04 切 Go），SiliconFlow/DashScope 可用。
// 扩展 manifest 已含 api.siliconflow.cn → 用 SiliconFlow 做真实端到端。
// 模型选择教训（#35 语义断言引出）：Qwen2.5-7B-Instruct 翻译/润色全抽风（幻觉乱码）；
// Qwen2.5-72B 翻译正常但中文润色输出英文（指令遵循不稳定）；
// deepseek-ai/DeepSeek-V3 两者均稳定（润色保持中文 ✅ / 翻译输出含中文 ✅）——测试用模型定 DeepSeek-V3。
const TEST_BASE_URL = "https://api.siliconflow.cn/v1";
const TEST_MODEL = "deepseek-ai/DeepSeek-V3";

function loadKey() {
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  const m = content.match(/^SILICONFLOW_API_KEY=(.+)$/m);
  if (!m) throw new Error("editor/.env 未找到 SILICONFLOW_API_KEY");
  return m[1].trim();
}

function mask(key) {
  if (!key) return "(empty)";
  return key.slice(0, 6) + "***" + key.slice(-4);
}

let results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

// #35 语义断言：翻译必须输出中文、润色必须保持输入语言
function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

// 本地测试页服务器：测试只依赖本机，不依赖外网可达性（example.com 曾两次超时，
// 根因：playwright Chromium 不走系统代理，外网页面不可控）
function startLocalServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"></head>
        <body><p id="target">这是一段用于端到端测试的文本，它的表达比较粗糙，希望得到润色改善。</p>
        <p id="target-en">This is a short English sentence for translation testing.</p></body></html>`);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const apiKey = loadKey();
  console.log(`读取 key：${mask(apiKey)}`);

  const server = await startLocalServer();
  const port = server.address().port;
  const TEST_PAGE = `http://127.0.0.1:${port}/`;

  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
    ],
  });

  let sw = null;
  for (let i = 0; i < 30; i++) {
    const workers = ctx.serviceWorkers();
    if (workers.length > 0) { sw = workers[0]; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  check("service worker 启动", !!sw);
  if (!sw) { await ctx.close(); process.exit(1); }

  // 写入真实 key + 测试模型
  await sw.evaluate(async (key) => {
    const d = await chrome.storage.local.get("settings");
    const s = d.settings || {};
    s.apiKey = key;
    s.baseUrl = "https://api.siliconflow.cn/v1";
    s.model = "deepseek-ai/DeepSeek-V3";
    await chrome.storage.local.set({ settings: s });
  }, apiKey);
  check("真实 key 已写入 storage（打码）", true);

  // 打开内容页（content script 注入）——本地页，不依赖外网
  const page = await ctx.newPage();
  await page.goto(TEST_PAGE, { timeout: 20000 });
  await page.waitForTimeout(800);

  const tabs = await sw.evaluate(async () => chrome.tabs.query({}));
  const targetTab = tabs[tabs.length - 1];
  check("目标 tab 获取", !!targetTab?.id);

  // 直调 handleAction（= 用户右键点击「润色」的完整链路）
  const t0 = Date.now();
  const testText = "这是一段用于端到端测试的文本，它的表达比较粗糙，希望得到润色改善。";
  await sw.evaluate(
    async ({ tplId, text, tabId }) => {
      await handleAction(tplId, text, { id: tabId });
    },
    { tplId: "tpl-polish", text: testText, tabId: targetTab.id }
  );

  // 等待浮窗出现结果（真实 API 调用，最多 30s）
  let floatText = null;
  for (let i = 0; i < 60; i++) {
    floatText = await page.evaluate(() => {
      const host = document.querySelector(".ai-text-assistant-float");
      if (!host || !host.shadowRoot) return null;
      const body = host.shadowRoot.querySelector(".ait-body");
      const err = host.shadowRoot.querySelector(".ait-error");
      if (err) return "ERR:" + err.textContent;
      return body ? body.textContent : null;
    });
    if (floatText && floatText !== "正在「润色」…") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  check("真实润色调用返回结果（非错误）",
    !!floatText && !floatText.startsWith("ERR:"),
    `耗时 ${elapsed}s`);
  if (floatText && !floatText.startsWith("ERR:")) {
    check("结果有实际内容", floatText.length > 20, `前 80 字：${floatText.slice(0, 80)}…`);
    check("结果与输入不同（真的润色了）", floatText !== testText);
    // #35：输入为中文 → 润色输出必须仍是中文（防"润色英文被翻成中文"类回归）
    check("润色输出保持中文（同语言）", hasChinese(floatText), hasChinese(floatText) ? "" : `输出无中文字符：${floatText.slice(0, 60)}`);
  } else {
    console.log("  错误详情:", floatText);
  }

  // 翻译动作也真实跑一次（验证多模板链路）
  await sw.evaluate(
    async ({ tplId, text, tabId }) => {
      await handleAction(tplId, text, { id: tabId });
    },
    { tplId: "tpl-translate", text: "This is a short English sentence for translation testing.", tabId: targetTab.id }
  );
  let translateText = null;
  for (let i = 0; i < 60; i++) {
    translateText = await page.evaluate(() => {
      const host = document.querySelector(".ai-text-assistant-float");
      if (!host || !host.shadowRoot) return null;
      const body = host.shadowRoot.querySelector(".ait-body");
      return body ? body.textContent : null;
    });
    if (translateText && !translateText.includes("正在")) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  // #35：输入为英文 → 翻译输出必须含中文（原来只查 length>5 的弱断言，乱码/原文透传也算过）
  check("翻译输出为中文（语义断言）",
    !!translateText && !translateText.startsWith("ERR:") && hasChinese(translateText) && translateText.length > 5,
    translateText ? `前 60 字：${translateText.slice(0, 60)}…（含中文: ${hasChinese(translateText || "")}）` : "无结果");

  await ctx.close();
  server.close();
  console.log("\n=== 结果 ===");
  console.log(results.filter((r) => r.ok).length + "/" + results.length + " 通过");
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error("测试执行异常:", err);
  process.exit(1);
});
