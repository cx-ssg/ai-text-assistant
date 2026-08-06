// AI 文本助手 - 冒烟测试（playwright 加载未打包扩展）
// 运行：node test_smoke.cjs
const { chromium } = require("C:/Users/cx101/AppData/Roaming/npm/node_modules/playwright");
const path = require("path");

const EXT_PATH = __dirname;

let results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  const ctx = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
    ],
  });

  // 1. 等待 service worker 启动
  let sw = null;
  for (let i = 0; i < 30; i++) {
    const workers = ctx.serviceWorkers();
    if (workers.length > 0) {
      sw = workers[0];
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  check("service worker 启动", !!sw);
  if (!sw) {
    await ctx.close();
    console.log("\n=== 结果 ===");
    console.log(results.filter((r) => r.ok).length + "/" + results.length + " 通过");
    process.exit(1);
  }

  const extId = new URL(sw.url()).host;
  check("扩展 ID 获取", !!extId, extId);

  // 2. manifest 检查
  const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
  check("manifest_version=3", manifest.manifest_version === 3, String(manifest.manifest_version));
  check("权限含 contextMenus+storage",
    manifest.permissions.includes("contextMenus") && manifest.permissions.includes("storage"),
    manifest.permissions.join(","));
  check("background 为 service_worker", !!manifest.background?.service_worker,
    manifest.background?.service_worker);
  check("content_scripts 注入 all_urls", manifest.content_scripts?.[0]?.matches?.includes("<all_urls>"));

  // 3. 默认设置已写入 storage（onInstalled 异步，轮询等待）
  let settings = null;
  for (let i = 0; i < 10; i++) {
    settings = await sw.evaluate(async () => {
      const d = await chrome.storage.local.get("settings");
      return d.settings || null;
    });
    if (settings) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  check("默认设置已初始化", !!settings && settings.baseUrl === "https://api.deepseek.com", JSON.stringify(settings && { baseUrl: settings.baseUrl, model: settings.model, tplCount: settings.templates?.length }));
  check("默认 4 模板", settings?.templates?.length === 4, String(settings?.templates?.length));

  // 4. options 页：填表保存
  const optionsPage = await ctx.newPage();
  await optionsPage.goto(`chrome-extension://${extId}/options.html`);
  await optionsPage.waitForSelector("#apiKey");
  await optionsPage.fill("#apiKey", "sk-test-fake-key-123456");
  await optionsPage.fill("#model", "deepseek-chat");
  await optionsPage.click("#saveBtn");
  await optionsPage.waitForTimeout(500);
  const statusText = await optionsPage.textContent("#status");
  check("options 保存提示", statusText.includes("已保存"), statusText);

  const saved = await sw.evaluate(async () => {
    const d = await chrome.storage.local.get("settings");
    return d.settings;
  });
  check("storage 持久化 key", saved?.apiKey === "sk-test-fake-key-123456");

  // 5. options 添加自定义模板
  await optionsPage.click("#addTplBtn");
  const tplItems = await optionsPage.locator(".tpl-item").count();
  check("添加模板成功", tplItems === 5, `tpl 数量=${tplItems}`);
  const lastTpl = optionsPage.locator(".tpl-item").last();
  await lastTpl.locator(".tpl-name").fill("小红书风格");
  await lastTpl.locator(".tpl-prompt").fill("请把以下文本改写成小红书风格，带 emoji 和话题标签：\n\n{{TEXT}}");
  await optionsPage.click("#saveBtn");
  await optionsPage.waitForTimeout(500);
  const saved2 = await sw.evaluate(async () => {
    const d = await chrome.storage.local.get("settings");
    return d.settings?.templates?.length;
  });
  check("自定义模板已保存", saved2 === 5, `tpl 数量=${saved2}`);

  // 6. PING_API 错误路径（假 key → 401）——从 options 扩展页发（真实通道：设置页测试按钮）
  const pingResp = await optionsPage.evaluate(async () => {
    return await chrome.runtime.sendMessage({
      type: "PING_API",
      settings: { apiKey: "sk-fake-invalid", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
    });
  });
  check("假 key 返回明确错误", pingResp?.ok === false && /401/.test(pingResp?.error || ""),
    JSON.stringify(pingResp?.error?.slice(0, 80)));

  // 7. 内容页浮窗渲染（真实链路：SW → tabs.sendMessage → content script → 浮窗）
  // 注：content script 不注入 data:/file: 页面，用 example.com（系统代理可访问）
  const page = await ctx.newPage();
  await page.goto("https://example.com", { timeout: 20000 });
  await page.waitForTimeout(800); // 等 content script 注入
  const tabs = await sw.evaluate(async () => chrome.tabs.query({}));
  // 无 tabs 权限时 url 为 null，用最后一个 tab（刚打开的 example.com）
  const targetTab = tabs[tabs.length - 1];
  check("content script 注入页面可查询", !!targetTab?.id, `tabs 数=${tabs.length}`);

  if (targetTab) {
    await sw.evaluate(
      (tabId) => chrome.tabs.sendMessage(tabId, { type: "AI_RESULT", action: "润色", result: "这是一段测试结果文本。" }),
      targetTab.id
    );
    await page.waitForTimeout(600);
    const floatVisible = await page.evaluate(() => {
      const host = document.querySelector(".ai-text-assistant-float");
      return !!host && !!host.shadowRoot && host.shadowRoot.textContent.includes("测试结果文本");
    });
    check("浮窗渲染结果", floatVisible);

    // 8. 浮窗按钮存在
    const btnCount = await page.evaluate(() => {
      const host = document.querySelector(".ai-text-assistant-float");
      return host?.shadowRoot?.querySelectorAll(".ait-btn").length || 0;
    });
    check("浮窗按钮（复制/替换）", btnCount >= 2, `按钮数=${btnCount}`);

    // 9. AI_ERROR NO_API_KEY 路径
    await sw.evaluate(
      (tabId) => chrome.tabs.sendMessage(tabId, { type: "AI_ERROR", error: "NO_API_KEY" }),
      targetTab.id
    );
    await page.waitForTimeout(500);
    const errVisible = await page.evaluate(() => {
      const host = document.querySelector(".ai-text-assistant-float");
      return !!host && host.shadowRoot.textContent.includes("API Key");
    });
    check("未配置 key 引导提示", errVisible);
  }

  await ctx.close();

  console.log("\n=== 结果 ===");
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} 通过`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("测试执行异常:", err);
  process.exit(1);
});
