// AI 文本助手 - options.js（设置页逻辑）

const PRESET_URLS = {
  "https://api.deepseek.com": "https://api.deepseek.com",
  "https://api.openai.com": "https://api.openai.com",
  "https://api.siliconflow.cn": "https://api.siliconflow.cn",
};

const DEFAULTS = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  templates: [
    { id: "tpl-polish", name: "润色", prompt: "请润色以下文本，使其更通顺、专业、有感染力，保持原意和原文语言（原文是英文就输出英文，原文是中文就输出中文）。直接输出润色后的结果，不要解释。\n\n{{TEXT}}" },
    { id: "tpl-translate", name: "翻译", prompt: "请将以下文本翻译成中文（若原文是中文则翻译成英文）。如原文有语法或拼写错误，按修正后的意思翻译。直接输出译文，不要解释。\n\n{{TEXT}}" },
    { id: "tpl-summary", name: "总结", prompt: "请总结以下文本的核心要点，使用与原文相同的语言（原文英文就英文总结，原文中文就中文总结），分条列出。直接输出总结内容本身，不要任何引导句、前言或解释。\n\n{{TEXT}}" },
    { id: "tpl-fix", name: "纠错", prompt: "请纠正以下文本中的错别字、语法错误和标点问题，保持原意、风格和原文语言（原文是英文就输出英文）。直接输出修正后的文本，不要解释。\n\n{{TEXT}}" },
  ],
};

let current = null;

const $ = (id) => document.getElementById(id);

async function loadSettings() {
  const data = await chrome.storage.local.get("settings");
  current = { ...DEFAULTS, ...(data.settings || {}), templates: (data.settings?.templates || DEFAULTS.templates) };
  if (!Array.isArray(current.templates) || current.templates.length === 0) {
    current.templates = DEFAULTS.templates;
  }
}

function fillForm() {
  $("apiKey").value = current.apiKey || "";
  $("model").value = current.model || "";
  $("baseUrl").value = current.baseUrl;
  renderTemplates();
}

function collectForm() {
  const baseUrl = $("baseUrl").value;
  const templates = [];
  document.querySelectorAll(".tpl-item").forEach((item) => {
    const id = item.dataset.id;
    const name = item.querySelector(".tpl-name").value.trim();
    const prompt = item.querySelector(".tpl-prompt").value.trim();
    if (name && prompt) {
      templates.push({ id, name, prompt });
    }
  });
  if (templates.length === 0) {
    throw new Error("至少保留一个模板");
  }
  return {
    apiKey: $("apiKey").value.trim(),
    baseUrl,
    model: $("model").value.trim() || "deepseek-chat",
    templates,
  };
}

function renderTemplates() {
  const list = $("tplList");
  list.innerHTML = "";
  for (const tpl of current.templates) {
    const item = document.createElement("div");
    item.className = "tpl-item";
    item.dataset.id = tpl.id;
    item.innerHTML = `
      <div class="tpl-head">
        <input class="tpl-name" value="${escapeAttr(tpl.name)}" placeholder="菜单名称" />
        <button class="btn-danger tpl-del">删除</button>
      </div>
      <textarea class="tpl-prompt" placeholder="提示词，用 {{TEXT}} 代表选中文本">${escapeAttr(tpl.prompt)}</textarea>`;
    item.querySelector(".tpl-del").addEventListener("click", () => {
      item.remove();
    });
    list.appendChild(item);
  }
}

function escapeAttr(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function setStatus(text, ok) {
  const el = $("status");
  el.textContent = text;
  el.className = "status " + (ok ? "ok" : "err");
}

async function save() {
  try {
    const settings = collectForm();
    await chrome.storage.local.set({ settings });
    current = settings;
    setStatus("✅ 已保存（右键菜单模板已同步）", true);
  } catch (err) {
    setStatus("❌ " + err.message, false);
  }
}

async function testConnection() {
  let settings;
  try {
    settings = collectForm();
  } catch (err) {
    setStatus("❌ " + err.message, false);
    return;
  }
  if (!settings.apiKey) {
    setStatus("❌ 请先填写 API Key", false);
    return;
  }
  setStatus("⏳ 测试中…", false);
  const resp = await chrome.runtime.sendMessage({ type: "PING_API", settings });
  if (resp?.ok) {
    setStatus(`✅ 连接成功！响应：${resp.text}`, true);
  } else {
    setStatus("❌ 连接失败：" + (resp?.error || "未知错误"), false);
  }
}

function addTemplate() {
  const id = "tpl-" + Date.now().toString(36);
  current.templates.push({ id, name: "新模板", prompt: "{{TEXT}}" });
  renderTemplates();
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  fillForm();
  $("saveBtn").addEventListener("click", save);
  $("testBtn").addEventListener("click", testConnection);
  $("addTplBtn").addEventListener("click", addTemplate);

});
