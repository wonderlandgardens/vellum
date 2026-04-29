/* Vellum — drop-in editable-text overlay. MIT.
 * https://github.com/<owner>/vellum
 */
(() => {
  const VERSION = "1.0.0";

  // Internal modules — populated by subsequent tasks.
  const Selector = (() => {
  const HASH_CLASS_PATTERNS = [
    /_[a-zA-Z0-9]{5,}.*$/,        // CSS-modules style: card_abc12345
    /[A-Z0-9]{5,}.*$/,            // Adjacent uppercase/digit hash run: ABCDE12345
  ];

  function meaningfulClass(el) {
    const raw = el.className;
    if (typeof raw !== "string" || !raw) return null;
    for (const cls of raw.trim().split(/\s+/)) {
      const cleaned = HASH_CLASS_PATTERNS.reduce((c, re) => c.replace(re, ""), cls);
      if (cleaned.length > 2 && !/^[a-z]{1,2}$/.test(cleaned)) {
        return cleaned;
      }
    }
    return null;
  }

  function identifierFor(el) {
    if (el.id) return `#${el.id}`;
    const cls = meaningfulClass(el);
    if (cls) return `.${cls}`;
    return el.tagName.toLowerCase();
  }

  function isIdentifierUnique(el, identifier, parent) {
    const tag = el.tagName.toLowerCase();
    const sameTagSiblings = Array.from(parent.children).filter(
      (c) => c.tagName.toLowerCase() === tag
    );
    if (sameTagSiblings.length === 1) return true;
    if (identifier.startsWith("#")) return true; // ids are unique by definition
    return false;
  }

  function pathOf(el) {
    const parts = [];
    let current = el;
    let depth = 0;
    while (current && depth < 20) {
      const tag = current.tagName?.toLowerCase();
      if (!tag || tag === "html" || tag === "body") break;
      let identifier = identifierFor(current);
      const parent = current.parentElement;
      if (parent && !isIdentifierUnique(current, identifier, parent)) {
        const sameTagSiblings = Array.from(parent.children).filter(
          (c) => c.tagName.toLowerCase() === tag
        );
        const idx = sameTagSiblings.indexOf(current) + 1;
        identifier = `${tag}:nth-of-type(${idx})`;
      }
      parts.unshift(identifier);
      current = current.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function truncate(s, n) {
    s = (s || "").trim();
    if (s.length <= n) return s;
    return s.slice(0, n) + "…";
  }

  function nameOf(el) {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return "(unknown)";
    const text = el.textContent?.trim() || "";
    if (/^h[1-6]$/.test(tag)) return text ? `${tag} "${truncate(text, 35)}"` : tag;
    if (tag === "p") return text ? `paragraph: "${truncate(text, 40)}"` : "paragraph";
    if (tag === "button") return text ? `button "${truncate(text, 25)}"` : "button";
    if (tag === "a") return text ? `link "${truncate(text, 25)}"` : "link";
    if (tag === "li") return text ? `list item: "${truncate(text, 35)}"` : "list item";
    if (tag === "code") return text ? `code: \`${truncate(text, 30)}\`` : "code";
    if (tag === "span" || tag === "label") return text ? `"${truncate(text, 40)}"` : tag;
    if (tag === "blockquote") return "blockquote";
    return tag;
  }

  return { pathOf, nameOf };
})();
  const Snapshot = (() => {
  let store = new Map();

  function capture(path, originalHTML) {
    if (!store.has(path)) store.set(path, originalHTML);
  }

  function get(path) {
    return store.get(path);
  }

  function clear() {
    store = new Map();
  }

  function all() {
    return Array.from(store.entries()).map(([path, before]) => ({ path, before }));
  }

  function hydrate(obj) {
    store = new Map(Object.entries(obj || {}));
  }

  function serialize() {
    return Object.fromEntries(store);
  }

  return { capture, get, clear, all, hydrate, serialize };
})();
  const Storage = (() => {
  const PREFIX = "vellum:";
  let unavailable = false;
  let saveTimer = null;
  let pendingPayload = null;

  function key() {
    const loc = window.location;
    return `${PREFIX}${loc.origin}${loc.pathname}`;
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(key());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      unavailable = true;
      return null;
    }
  }

  function writeNow(payload) {
    try {
      window.localStorage.setItem(key(), JSON.stringify(payload));
    } catch (e) {
      unavailable = true;
    }
  }

  function save(payload, { debounce = false } = {}) {
    pendingPayload = payload;
    if (!debounce) {
      writeNow(payload);
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      writeNow(pendingPayload);
      saveTimer = null;
    }, 200);
  }

  function clear() {
    try {
      window.localStorage.removeItem(key());
    } catch (e) {
      unavailable = true;
    }
  }

  return {
    key,
    load,
    save,
    clear,
    get unavailable() { return unavailable; },
  };
})();
  const Scanner = (() => {
  const EDITABLE_TAGS = new Set([
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "li", "blockquote", "figcaption", "caption",
    "dt", "dd", "td", "th",
    "span", "a", "button", "label", "legend", "summary", "q", "cite",
  ]);

  const ARM_MARKER = "data-vellum-armed";
  const originalHTMLCache = new WeakMap();
  let mutationObserver = null;
  let inputHandler = null;
  let onEditCallback = null;
  let toolbarHostRef = null;
  let mode = "always-on";

  function isInsideExcluded(el) {
    let cur = el;
    while (cur) {
      const tag = cur.tagName?.toLowerCase();
      if (tag === "head" || tag === "script" || tag === "style") return true;
      if (cur === toolbarHostRef) return true;
      if (cur.hasAttribute && cur.hasAttribute("data-vellum-ignore")) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function hasOwnText(el) {
    for (const child of el.childNodes) {
      if (child.nodeType === 3 /* TEXT_NODE */ && child.nodeValue.trim() !== "") return true;
    }
    return false;
  }

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (!EDITABLE_TAGS.has(tag)) return false;
    if (el.getAttribute("contenteditable") === "false") return false;
    if (isInsideExcluded(el)) return false;
    if (!hasOwnText(el)) return false;
    return true;
  }

  function armElement(el) {
    if (el.hasAttribute(ARM_MARKER)) return;
    el.setAttribute(ARM_MARKER, "");
    el.setAttribute("contenteditable", "true");
    originalHTMLCache.set(el, el.innerHTML);
  }

  function disarmElement(el) {
    el.removeAttribute(ARM_MARKER);
    el.removeAttribute("contenteditable");
  }

  function armAll() {
    if (mode !== "always-on") return;
    document.querySelectorAll("*").forEach((el) => {
      if (isEditable(el)) armElement(el);
    });
  }

  function disarmAll() {
    document.querySelectorAll(`[${ARM_MARKER}]`).forEach(disarmElement);
  }

  function armOne(el) {
    if (isEditable(el)) armElement(el);
  }

  function setMode(newMode) {
    mode = newMode;
    if (mode === "always-on") armAll();
    else disarmAll();
  }

  function getOriginalHTML(el) {
    return originalHTMLCache.get(el);
  }

  function init({ onEdit, toolbarHost, initialMode = "always-on" }) {
    onEditCallback = onEdit;
    toolbarHostRef = toolbarHost;
    mode = initialMode;

    inputHandler = (ev) => {
      const target = ev.target;
      if (!target || !target.hasAttribute || !target.hasAttribute(ARM_MARKER)) return;
      onEditCallback?.(target);
    };
    document.addEventListener("input", inputHandler, true);

    mutationObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (mode !== "always-on") return;
          if (isEditable(n)) armElement(n);
          n.querySelectorAll?.("*").forEach((child) => {
            if (isEditable(child)) armElement(child);
          });
        });
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    armAll();
  }

  function destroy() {
    if (inputHandler) document.removeEventListener("input", inputHandler, true);
    if (mutationObserver) mutationObserver.disconnect();
    disarmAll();
    inputHandler = null;
    mutationObserver = null;
  }

  return {
    init,
    destroy,
    armAll,
    armOne,
    disarmAll,
    setMode,
    getOriginalHTML,
    isEditable,
  };
})();
  const Output   = (() => {
  function markdown(edits, ctx) {
    if (!edits || edits.length === 0) return "";
    const lines = [];
    lines.push(`# Vellum edits — ${ctx.pathname}`);
    lines.push("");
    lines.push(`**URL:** ${ctx.url}`);
    lines.push(`**Viewport:** ${ctx.viewport}`);
    lines.push(`**Edits:** ${edits.length}`);
    lines.push("");
    lines.push("---");
    lines.push("");
    edits.forEach((e, i) => {
      lines.push(`## ${i + 1}. ${e.name}`);
      if (e.removed) {
        lines.push(`**Status:** element no longer present`);
      } else {
        lines.push(`**Location:** ${e.path}`);
      }
      lines.push(`**Before:**`);
      lines.push(e.before ?? "");
      lines.push("");
      lines.push(`**After:**`);
      lines.push(e.after ?? "");
      lines.push("");
    });
    return lines.join("\n").trimEnd();
  }

  function json(edits, ctx) {
    return JSON.stringify({
      url: ctx.url,
      pathname: ctx.pathname,
      viewport: ctx.viewport,
      edits: edits.map((e) => ({
        path: e.path,
        name: e.name,
        before: e.before,
        after: e.after,
        removed: !!e.removed,
      })),
    }, null, 2);
  }

  return { markdown, json };
})();
  const Toolbar = (() => {
  let host = null;
  let shadow = null;
  let countEl = null;
  let modeBtn = null;
  let onCopyMd = null;
  let onCopyJson = null;
  let onReset = null;
  let onModeChange = null;
  let currentMode = "always-on";

  const STYLES = `
    :host { all: initial; }
    .panel {
      position: fixed; bottom: 16px; right: 16px;
      z-index: 2147483647;
      display: flex; gap: 6px; align-items: center;
      font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
      background: #111; color: #fff;
      padding: 6px 8px; border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    }
    .panel button {
      font: inherit; color: #fff;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 5px; padding: 4px 8px;
      cursor: pointer;
    }
    .panel button:hover { background: rgba(255,255,255,0.16); }
    .count {
      background: rgba(255,255,255,0.12);
      border-radius: 999px; padding: 2px 8px;
    }
    .badge-warn {
      background: #b45309; padding: 2px 6px; border-radius: 4px;
      font-size: 11px;
    }
  `;

  function mount(opts) {
    onCopyMd = opts.onCopyMarkdown;
    onCopyJson = opts.onCopyJson;
    onReset = opts.onReset;
    onModeChange = opts.onModeChange;
    currentMode = opts.initialMode || "always-on";

    host = document.createElement("div");
    host.setAttribute("data-vellum-toolbar", "");
    shadow = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "panel";

    countEl = document.createElement("span");
    countEl.className = "count";
    countEl.textContent = "0 edits";
    panel.appendChild(countEl);

    const copyMd = document.createElement("button");
    copyMd.textContent = "Copy markdown";
    copyMd.addEventListener("click", () => onCopyMd?.());
    panel.appendChild(copyMd);

    const copyJson = document.createElement("button");
    copyJson.textContent = "Copy JSON";
    copyJson.addEventListener("click", () => onCopyJson?.());
    panel.appendChild(copyJson);

    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => onReset?.());
    panel.appendChild(resetBtn);

    modeBtn = document.createElement("button");
    modeBtn.textContent = currentMode === "always-on" ? "Mode: always-on" : "Mode: click-to-arm";
    modeBtn.addEventListener("click", () => {
      currentMode = currentMode === "always-on" ? "click-to-arm" : "always-on";
      modeBtn.textContent = currentMode === "always-on" ? "Mode: always-on" : "Mode: click-to-arm";
      onModeChange?.(currentMode);
    });
    panel.appendChild(modeBtn);

    shadow.appendChild(panel);
    document.body.appendChild(host);

    return host;
  }

  function flash(count) {
    if (countEl) countEl.textContent = `${count} edit${count === 1 ? "" : "s"}`;
  }

  function showStorageBadge() {
    if (!shadow) return;
    if (shadow.querySelector(".badge-warn")) return;
    const badge = document.createElement("span");
    badge.className = "badge-warn";
    badge.textContent = "storage unavailable";
    shadow.querySelector(".panel").prepend(badge);
  }

  function unmount() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
  }

  function getHost() {
    return host;
  }

  return { mount, flash, unmount, getHost, showStorageBadge };
})();

  // Public API — populated as modules come online.
  const Vellum = {
    version: VERSION,
    mount() {},
    unmount() {},
    copy() {},
    reset() {},
    setMode() {},
  };

  if (typeof window !== "undefined") {
    window.Vellum = Vellum;

    // Only the four pure modules are exposed for unit testing; Scanner and
    // Toolbar have DOM side effects and are smoke-tested via index.html.
    if (globalThis.__VELLUM_TEST__ || (typeof window !== "undefined" && window.__VELLUM_TEST__)) {
      globalThis.__vellumInternals = { Selector, Snapshot, Storage, Output };
    }
  }
})();
