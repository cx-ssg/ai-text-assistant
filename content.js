// AI 文本助手 - content.js
// 职责：接收 background 消息 → 渲染结果浮窗 → 复制 / 替换原文

(() => {
  if (window.__AI_TEXT_ASSISTANT_LOADED__) return;
  window.__AI_TEXT_ASSISTANT_LOADED__ = true;

  const FLOAT_CLASS = "ai-text-assistant-float";

  let hostEl = null; // 浮窗宿主
  let shadow = null;
  let lastRange = null; // 替换原文用的选区快照

  // ---------- 浮窗 UI（shadow DOM 隔离页面样式） ----------

  const STYLE = `
    :host { all: initial; }
    .ait-float {
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      width: 380px; max-height: 70vh; display: flex; flex-direction: column;
      font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #ffffff; color: #1f2937;
      border: 1px solid #e5e7eb; border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.18);
      font-size: 14px; line-height: 1.6;
    }
    .ait-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; border-bottom: 1px solid #f3f4f6;
      font-weight: 600; font-size: 13px; color: #374151;
    }
    .ait-close { cursor: pointer; border: none; background: none; font-size: 16px; color: #9ca3af; padding: 0 4px; }
    .ait-close:hover { color: #4b5563; }
    .ait-body { padding: 12px 14px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; }
    .ait-loading { display: flex; align-items: center; gap: 10px; color: #6b7280; }
    .ait-spinner {
      width: 16px; height: 16px; border: 2px solid #e5e7eb; border-top-color: #2563eb;
      border-radius: 50%; animation: ait-spin 0.8s linear infinite; flex-shrink: 0;
    }
    @keyframes ait-spin { to { transform: rotate(360deg); } }
    .ait-error { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 12px; }
    .ait-error a { color: #2563eb; cursor: pointer; }
    .ait-foot {
      display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid #f3f4f6;
    }
    .ait-btn {
      flex: 1; padding: 8px 0; border: none; border-radius: 8px; cursor: pointer;
      font-size: 13px; font-weight: 500;
    }
    .ait-btn-primary { background: #2563eb; color: #fff; }
    .ait-btn-primary:hover { background: #1d4ed8; }
    .ait-btn-ghost { background: #f3f4f6; color: #374151; }
    .ait-btn-ghost:hover { background: #e5e7eb; }
    .ait-copied { color: #16a34a; font-size: 12px; text-align: center; padding-top: 6px; }
  `;

  function ensureHost() {
    if (hostEl) return;
    hostEl = document.createElement("div");
    hostEl.className = FLOAT_CLASS;
    shadow = hostEl.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);
    (document.body || document.documentElement).appendChild(hostEl);
  }

  function renderFrame() {
    ensureHost();
    shadow.innerHTML = `
      <div class="ait-float">
        <div class="ait-head">
          <span class="ait-title">AI 文本助手</span>
          <button class="ait-close" title="关闭">✕</button>
        </div>
        <div class="ait-body"></div>
        <div class="ait-foot" hidden></div>
        <div class="ait-copied" hidden>✅ 已复制到剪贴板</div>
      </div>`;
    shadow.querySelector(".ait-close").addEventListener("click", closeFloat);
  }

  function closeFloat() {
    if (hostEl) hostEl.remove();
    hostEl = null;
    shadow = null;
  }

  function setBody(htmlOrText) {
    const body = shadow.querySelector(".ait-body");
    body.innerHTML = htmlOrText;
  }

  function setFoot(buttons) {
    const foot = shadow.querySelector(".ait-foot");
    foot.innerHTML = "";
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.className = `ait-btn ${b.primary ? "ait-btn-primary" : "ait-btn-ghost"}`;
      btn.textContent = b.label;
      btn.addEventListener("click", b.onClick);
      foot.appendChild(btn);
    }
    foot.hidden = false;
  }

  // ---------- 选区快照（替换原文用） ----------

  function snapshotSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      lastRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function replaceSelection(text) {
    if (!lastRange || !lastRange.startContainer || !lastRange.startContainer.isConnected) {
      return false;
    }
    lastRange.deleteContents();
    const node = document.createTextNode(text);
    lastRange.insertNode(node);
    // 光标移到结果末尾
    lastRange.setStartAfter(node);
    lastRange.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(lastRange);
    return true;
  }

  // ---------- 消息处理 ----------

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "AI_LOADING") {
      snapshotSelection();
      renderFrame();
      setBody(`<div class="ait-loading"><div class="ait-spinner"></div>正在「${escapeHtml(msg.action || "")}」…</div>`);
      shadow.querySelector(".ait-foot").hidden = true;
      return;
    }
    if (msg.type === "AI_RESULT") {
      renderFrame();
      setBody(escapeHtml(msg.result || ""));
      setFoot([
        {
          label: "📋 复制",
          primary: true,
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(msg.result || "");
            } catch {
              // 剪贴板 API 受限时降级
              const ta = document.createElement("textarea");
              ta.value = msg.result || "";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              ta.remove();
            }
            shadow.querySelector(".ait-copied").hidden = false;
            setTimeout(() => {
              if (shadow) shadow.querySelector(".ait-copied").hidden = true;
            }, 2000);
          },
        },
        {
          label: "♻️ 替换原文",
          onClick: () => {
            if (replaceSelection(msg.result || "")) {
              closeFloat();
            } else {
              shadow.querySelector(".ait-copied").textContent = "⚠️ 原文选区已失效，无法替换（可复制）";
              shadow.querySelector(".ait-copied").hidden = false;
            }
          },
        },
      ]);
      return;
    }
    if (msg.type === "AI_ERROR") {
      renderFrame();
      const err = msg.error || "UNKNOWN";
      if (err === "NO_API_KEY") {
        setBody(
          `<div class="ait-error">🔑 尚未配置 API Key。<a id="ait-open-options">去设置页配置</a>（支持 DeepSeek，国内直连）</div>`
        );
        shadow.querySelector("#ait-open-options").addEventListener("click", () => {
          chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
        });
      } else if (err === "EMPTY_SELECTION") {
        setBody(`<div class="ait-error">⚠️ 未检测到选中文字，请先选中文本再右键。</div>`);
      } else if (String(err).startsWith("API_ERROR:401")) {
        setBody(`<div class="ait-error">❌ API Key 无效或已过期（401）。<a id="ait-open-options">去设置页检查</a></div>`);
        shadow.querySelector("#ait-open-options")?.addEventListener("click", () => {
          chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
        });
      } else {
        setBody(`<div class="ait-error">❌ 处理失败：${escapeHtml(String(err))}</div>`);
      }
      return;
    }
  });

  // 打开设置页（由 background 转发，因为 content 不能直接 chrome.runtime.openOptionsPage）
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "OPEN_OPTIONS_FORWARD") {
      chrome.runtime.openOptionsPage();
    }
  });

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
})();
