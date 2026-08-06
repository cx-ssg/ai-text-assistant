// AI 文本助手 - 演示窗口启动器（预加载扩展 + 预配 key，窗口保持打开）
// 运行：node launch_demo.cjs
// 用途：用户"先试试"——启动一个带扩展且已配置好 DeepSeek key 的 Chrome 窗口
const { chromium } = require("C:/Users/cx101/AppData/Roaming/npm/node_modules/playwright");
const path = require("path");

const EXT_PATH = __dirname;
const PROFILE_DIR = path.join(EXT_PATH, "profile-demo");
const API_KEY = process.env.AI_EXT_DEMO_KEY || "";
const BASE_URL = "https://api.deepseek.com";
const MODEL = "deepseek-chat";

async function main() {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      "--no-first-run",
      "--window-size=1280,800",
    ],
  });

  // 等待 service worker 并写入 key
  let sw = null;
  for (let i = 0; i < 30; i++) {
    const workers = ctx.serviceWorkers();
    if (workers.length > 0) { sw = workers[0]; break; }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!sw) {
    console.error("service worker 未启动");
    process.exit(1);
  }

  if (API_KEY) {
    await sw.evaluate(async (key) => {
      const d = await chrome.storage.local.get("settings");
      const s = d.settings || {};
      s.apiKey = key;
      s.baseUrl = "https://api.deepseek.com";
      s.model = "deepseek-chat";
      await chrome.storage.local.set({ settings: s });
    }, API_KEY);
    console.log("✅ DeepSeek key 已写入扩展配置（打码:", API_KEY.slice(0, 6) + "***" + API_KEY.slice(-4), "）");
  } else {
    console.log("⚠️ 未提供 key（AI_EXT_DEMO_KEY 环境变量）——需手动在设置页填写");
  }

  // 打开一个可测试的页面
  const page = await ctx.newPage();
  await page.goto("https://example.com", { timeout: 20000 });
  await page.waitForTimeout(800);
  // 页面上放一段可选的文本
  await page.evaluate(() => {
    document.body.innerHTML = `<div style="font-family:sans-serif;padding:40px;max-width:760px;margin:0 auto;line-height:1.9">
      <h1>AI 文本助手 · 演示页</h1>
      <p>1. 用鼠标选中下面任意一段文字</p>
      <p>2. 右键 → 「AI 文本助手」→ 选一个动作（润色/翻译/总结/纠错）</p>
      <p>3. 浮窗出现结果 → 复制或替换原文</p>
      <hr>
      <p id="demo1"><b>① 简单中文（试润色/总结）：</b>这是一个演示文本，它的表达比较粗糙，希望得到润色改善，让它读起来更流畅更专业。这是一段中文内容，包含了多个句子，用来测试右键菜单的完整流程是否正常工作。</p>
      <p id="demo2"><b>② 简单英文（试翻译/润色）：</b>This is an English sentence used to test the translation feature. If everything works, this text will be translated into Chinese.</p>
      <p id="demo3"><b>③ 中文（试总结）：</b>2026年8月6日，我们完成了一个Chrome扩展的样品开发，它可以在浏览器里直接对选中文字进行AI处理。</p>
      <p id="demo4"><b>④ 复杂长句（试润色/总结深度）：</b>在数字化转型浪潮的推动下，传统制造业企业正面临着一个前所未有的结构性挑战：如何在保持既有供应链稳定性的同时，通过数据驱动的方式重构其核心业务流程，进而实现从经验驱动向智能决策的范式转换——这不仅是技术层面的革新，更牵涉组织能力重塑与商业模式升级的系统性工程，需要企业从战略高度统筹规划、分步推进，并持续投入资源进行能力建设与人才培养。</p>
      <p id="demo5"><b>⑤ 有错误的中文（试纠错）：</b>今天早上我去的图书馆借了几本书，回来的时候在路上碰到了同学小李，他告诉我他昨天买了个新手机，那个手机的屏幕特别的大，看电影非常的清楚，我很羡慕他，但是我的手机还能用，所以决定不换手机了，等明年在说吧。</p>
      <p id="demo6"><b>⑥ 有错误的英文（试纠错/翻译）：</b>This sentence have several grammer mistakes. He don't like apples, and she doesn't likes oranges. They was going to the store yesterday but it was closed.</p>
    </div>`;
  });

  console.log("🎉 演示窗口已打开（Chrome 窗口，标签页「example.com」）");
  console.log("   选中文字 → 右键 → AI 文本助手 → 选动作即可使用");
  console.log("   扩展图标 → 打开设置页可查看/修改 key（已预填 DeepSeek）");
  console.log("   注意：这是独立 profile 的 Chrome，与你平时浏览器互不影响");
  console.log("   用完直接关窗口即可；本脚本保持运行直到窗口关闭");

  // 保持进程存活直到浏览器关闭
  ctx.on("close", () => {
    console.log("浏览器窗口已关闭，脚本退出");
    process.exit(0);
  });
  // 保持事件循环（playwright 的持久上下文通常自带，这里兜底）
  setInterval(() => {}, 1000);
}

main().catch((err) => { console.error("启动异常:", err); process.exit(1); });
