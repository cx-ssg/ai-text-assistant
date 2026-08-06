// AI 文本助手 - background.js (MV3 service worker)
// 职责：右键菜单注册/重建、OpenAI 兼容 API 调用、消息路由

const MENU_ROOT_ID = "ai-text-assistant-root";

const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com", // 默认 DeepSeek（国内直连）
  model: "deepseek-chat",
  templates: [
    { id: "tpl-polish", name: "润色", prompt: "请润色以下文本，使其更通顺、专业、有感染力，保持原意。直接输出润色后的结果，不要解释。\n\n{{TEXT}}" },
    { id: "tpl-translate", name: "翻译", prompt: "请将以下文本翻译成中文（若原文是中文则翻译成英文）。直接输出译文，不要解释。\n\n{{TEXT}}" },
    { id: "tpl-summary", name: "总结", prompt: "请用简洁的中文总结以下文本的核心要点，分条列出。\n\n{{TEXT}}" },
    { id: "tpl-fix", name: "纠错", prompt: "请纠正以下文本中的错别字、语法错误和标点问题，保持原意和风格。直接输出修正后的文本，不要解释。\n\n{{TEXT}}" },
  ],
};

// ---------- 存储 ----------

async function getSettings() {
  const data = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

// ---------- 菜单 ----------

function buildTemplatesSubmenu() {
  return {
    id: MENU_ROOT_ID,
    title: "AI 文本助手",
    contexts: ["selection"],
    children: [], // 动态填充
  };
}

async function rebuildMenus() {
  await chrome.contextMenus.removeAll();
  const settings = await getSettings();

  const root = chrome.contextMenus.create({
    id: MENU_ROOT_ID,
    title: "AI 文本助手",
    contexts: ["selection"],
  });

  for (const tpl of settings.templates) {
    chrome.contextMenus.create({
      id: `tpl:${tpl.id}`,
      parentId: root,
      title: tpl.name,
      contexts: ["selection"],
    });
  }
}

// ---------- API 调用（OpenAI 兼容协议） ----------

async function callAI({ apiKey, baseUrl, model }, prompt) {
  if (!apiKey) {
    throw new Error("NO_API_KEY");
  }
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!resp.ok) {
    const detail = scrubSecret(await resp.text().catch(() => ""));
    throw new Error(`API_ERROR:${resp.status}:${detail.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("API_EMPTY_RESPONSE");
  }
  return text.trim();
}


// 错误详情脱敏：防止第三方 API 回显完整 key/凭据
function scrubSecret(text) {
  return String(text)
    .replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "$1***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1***");
}

function renderPrompt(templatePrompt, selectedText) {
  return templatePrompt.replaceAll("{{TEXT}}", selectedText);
}

// ---------- 事件 ----------

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  // 首次安装：写入默认设置
  await saveSettings(settings);
  await rebuildMenus();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildMenus();
});

// 设置页改动 → 重建菜单（模板增删即时生效）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    rebuildMenus();
  }
});

// 核心动作：菜单项点击 → API 调用 → 通知页面（抽取供测试直调）
async function handleAction(tplId, selectionText, tab) {
  if (!selectionText) {
    notifyContent(tab, { type: "AI_ERROR", error: "EMPTY_SELECTION" });
    return;
  }

  const settings = await getSettings();
  const tpl = settings.templates.find((t) => t.id === tplId);
  if (!tpl) {
    notifyContent(tab, { type: "AI_ERROR", error: "TEMPLATE_NOT_FOUND" });
    return;
  }

  // 通知页面开始处理
  notifyContent(tab, {
    type: "AI_LOADING",
    action: tpl.name,
    templateId: tplId,
  });

  try {
    const prompt = renderPrompt(tpl.prompt, selectionText);
    const result = await callAI(settings, prompt);
    notifyContent(tab, {
      type: "AI_RESULT",
      action: tpl.name,
      templateId: tplId,
      result,
    });
  } catch (err) {
    console.error("[AI助手] API 调用失败:", err);
    notifyContent(tab, {
      type: "AI_ERROR",
      error: err.message || "UNKNOWN",
    });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;
  if (typeof menuId !== "string" || !menuId.startsWith("tpl:")) {
    return;
  }
  await handleAction(menuId.slice(4), (info.selectionText || "").trim(), tab);
});

function notifyContent(tab, payload) {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, payload).catch(() => {
    // 页面可能未加载 content script（如 chrome:// 页面），忽略
  });
}

// 供测试/设置页调用：验证 key 连通性
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PING_API") {
    callAI(msg.settings, "ping")
      .then((text) => sendResponse({ ok: true, text: text.slice(0, 100) }))
      .catch((err) => sendResponse({ ok: false, error: String(err.message || err) }));
    return true; // 异步响应
  }
  if (msg?.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return undefined;
});
