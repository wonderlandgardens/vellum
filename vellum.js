/* Vellum — drop-in editable-text overlay. MIT.
 * https://github.com/wonderlandgardens/vellum
 */
(() => {
  const VERSION = "1.0.1";

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
  let mouseoverHandler = null;
  let mouseoutHandler = null;
  let clickHandler = null;
  let stylesInjected = false;

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

  function injectHoverStyles() {
    if (stylesInjected) return;
    if (document.getElementById("vellum-hover-styles")) { stylesInjected = true; return; }
    const s = document.createElement("style");
    s.id = "vellum-hover-styles";
    s.textContent = `[data-vellum-hover] { outline: 2px dashed #b45309 !important; outline-offset: 2px !important; cursor: pointer !important; }`;
    document.head.appendChild(s);
    stylesInjected = true;
  }

  function findEditableAncestor(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (cur === toolbarHostRef) return null;
      if (isEditable(cur) && !cur.hasAttribute(ARM_MARKER)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function installClickToArmListeners() {
    injectHoverStyles();
    mouseoverHandler = (ev) => {
      const candidate = findEditableAncestor(ev.target);
      if (candidate) candidate.setAttribute("data-vellum-hover", "");
    };
    mouseoutHandler = (ev) => {
      if (ev.target.removeAttribute) ev.target.removeAttribute("data-vellum-hover");
    };
    clickHandler = (ev) => {
      const candidate = findEditableAncestor(ev.target);
      if (!candidate) return;
      ev.preventDefault();
      ev.stopPropagation();
      candidate.removeAttribute("data-vellum-hover");
      armElement(candidate);
      candidate.focus();
    };
    document.addEventListener("mouseover", mouseoverHandler, true);
    document.addEventListener("mouseout", mouseoutHandler, true);
    document.addEventListener("click", clickHandler, true);
  }

  function removeClickToArmListeners() {
    if (mouseoverHandler) document.removeEventListener("mouseover", mouseoverHandler, true);
    if (mouseoutHandler) document.removeEventListener("mouseout", mouseoutHandler, true);
    if (clickHandler) document.removeEventListener("click", clickHandler, true);
    mouseoverHandler = null;
    mouseoutHandler = null;
    clickHandler = null;
    document.querySelectorAll("[data-vellum-hover]").forEach(el => el.removeAttribute("data-vellum-hover"));
  }

  function setMode(newMode) {
    mode = newMode;
    if (mode === "always-on") {
      removeClickToArmListeners();
      scheduleHydrationSafeArm();
    } else {
      disarmAll();
      installClickToArmListeners();
    }
  }

  function isLikelyHydrating() {
    if (document.getElementById("__NEXT_DATA__")) return true;
    if (document.querySelector('script[data-rsc]')) return true;
    if (document.querySelector('script[id^="$R"]')) return true;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) {
      const data = walker.currentNode.nodeValue;
      if (data === "$" || data === "/$" || data === "$?" || data === "$!") return true;
    }
    return false;
  }

  function scheduleHydrationSafeArm() {
    const run = () => {
      if (isLikelyHydrating()) {
        requestAnimationFrame(() => requestAnimationFrame(armAll));
      } else if (typeof requestIdleCallback === "function") {
        requestIdleCallback(armAll, { timeout: 500 });
      } else {
        setTimeout(armAll, 100);
      }
    };
    if (document.readyState === "complete") {
      run();
    } else {
      window.addEventListener("load", run, { once: true });
    }
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

    if (mode === "click-to-arm") {
      installClickToArmListeners();
    } else {
      scheduleHydrationSafeArm();
    }
  }

  function destroy() {
    if (inputHandler) document.removeEventListener("input", inputHandler, true);
    if (mutationObserver) mutationObserver.disconnect();
    removeClickToArmListeners();
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
  let lastCount = 0;
  let copyMdBtn = null;
  let copyJsonBtn = null;
  let resetBtnRef = null;

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
      transition: background 120ms ease, opacity 120ms ease;
    }
    .panel button:hover { background: rgba(255,255,255,0.16); }
    .panel button:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .panel button:active:not(:disabled) {
      background: rgba(255,255,255,0.24);
    }
    .panel button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .count {
      background: rgba(255,255,255,0.12);
      border-radius: 999px; padding: 2px 8px;
    }
    .count.pulse {
      animation: vellum-pulse 320ms ease-out;
    }
    @keyframes vellum-pulse {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.12); }
      100% { transform: scale(1); }
    }
    .badge-warn {
      background: #b45309; padding: 2px 6px; border-radius: 4px;
      font-size: 11px;
    }
    .panel button.icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 6px;
    }
    .panel button.icon svg {
      display: block;
    }
  `;

  async function withCopyFeedback(btn, fn) {
    const original = btn.textContent;
    try {
      await fn();
      btn.textContent = "Copied ✓";
    } catch (e) {
      btn.textContent = "Failed";
    }
    setTimeout(() => { btn.textContent = original; }, 1500);
  }

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
    panel.setAttribute("role", "toolbar");
    panel.setAttribute("aria-label", "Vellum editing toolbar");

    countEl = document.createElement("span");
    countEl.className = "count";
    countEl.textContent = "0 edits";
    panel.appendChild(countEl);

    copyMdBtn = document.createElement("button");
    copyMdBtn.textContent = "Copy markdown";
    copyMdBtn.addEventListener("click", () => withCopyFeedback(copyMdBtn, () => onCopyMd?.()));
    panel.appendChild(copyMdBtn);

    copyJsonBtn = document.createElement("button");
    copyJsonBtn.textContent = "Copy JSON";
    copyJsonBtn.addEventListener("click", () => withCopyFeedback(copyJsonBtn, () => onCopyJson?.()));
    panel.appendChild(copyJsonBtn);

    resetBtnRef = document.createElement("button");
    resetBtnRef.className = "icon";
    resetBtnRef.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="3 6 5 6 21 6"></polyline>
  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
  <path d="M10 11v6"></path>
  <path d="M14 11v6"></path>
  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
</svg>`;
    resetBtnRef.setAttribute("aria-label", "Discard edits and restore originals");
    resetBtnRef.setAttribute("title", "Discard edits and restore originals");
    resetBtnRef.addEventListener("click", () => {
      onReset?.();
      if (countEl) {
        countEl.textContent = "Restored";
        setTimeout(() => flash(lastCount), 1200);
      }
    });
    panel.appendChild(resetBtnRef);

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
    lastCount = count;
    if (countEl) {
      countEl.textContent = `${count} edit${count === 1 ? "" : "s"}`;
      countEl.classList.remove("pulse");
      void countEl.offsetWidth;
      countEl.classList.add("pulse");
    }
    const empty = count === 0;
    [copyMdBtn, copyJsonBtn, resetBtnRef].forEach(btn => {
      if (btn) btn.disabled = empty;
    });
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

  function viewport() {
    return `${window.innerWidth}×${window.innerHeight}`;
  }

  function ctx() {
    return {
      url: window.location.href,
      pathname: window.location.pathname,
      viewport: viewport(),
    };
  }

  function buildEditList() {
    const list = [];
    for (const { path, before } of Snapshot.all()) {
      let live = null;
      try { live = document.querySelector(path); } catch (e) {}
      if (live) {
        const after = live.innerHTML;
        if (before === after) continue;
        list.push({ path, name: Selector.nameOf(live), before, after, removed: false });
      } else {
        list.push({ path, name: "(removed)", before, after: null, removed: true });
      }
    }
    return list;
  }

  function persist() {
    const edits = {};
    for (const { path } of Snapshot.all()) {
      const live = (() => { try { return document.querySelector(path); } catch (e) { return null; } })();
      if (live) edits[path] = live.innerHTML;
    }
    Storage.save({
      edits,
      snapshots: Snapshot.serialize(),
      mode: currentMode,
    }, { debounce: true });
  }

  function applySavedEdits(edits) {
    for (const [path, html] of Object.entries(edits || {})) {
      let live = null;
      try { live = document.querySelector(path); } catch (e) {}
      if (live) live.innerHTML = html;
    }
  }

  let currentMode = (typeof window !== "undefined" && window.VELLUM_MODE) || "always-on";

  async function copy(format = "markdown") {
    const list = buildEditList();
    const payload = format === "json"
      ? Output.json(list, ctx())
      : Output.markdown(list, ctx());
    try {
      await navigator.clipboard.writeText(payload);
    } catch (e) {
      window.prompt("Copy this:", payload);
    }
    return payload;
  }

  function reset() {
    if (!window.confirm("Reset all edits to original?")) return;
    for (const { path, before } of Snapshot.all()) {
      let live = null;
      try { live = document.querySelector(path); } catch (e) {}
      if (live) live.innerHTML = before;
    }
    Snapshot.clear();
    Storage.clear();
    Toolbar.flash(0);
  }

  function setMode(newMode) {
    currentMode = newMode;
    Scanner.setMode(newMode);
    persist();
  }

  function mount() {
    if (window.__vellumMounted) return;
    window.__vellumMounted = true;

    const saved = Storage.load() || {};
    if (saved.snapshots) Snapshot.hydrate(saved.snapshots);
    if (saved.mode) currentMode = saved.mode;

    const host = Toolbar.mount({
      initialMode: currentMode,
      onCopyMarkdown: () => copy("markdown"),
      onCopyJson: () => copy("json"),
      onReset: reset,
      onModeChange: setMode,
    });

    Scanner.init({
      toolbarHost: host,
      initialMode: currentMode,
      onEdit: (el) => {
        const path = Selector.pathOf(el);
        const original = Scanner.getOriginalHTML(el);
        Snapshot.capture(path, original);
        persist();
        Toolbar.flash(Snapshot.all().length);
      },
    });

    if (saved.edits) applySavedEdits(saved.edits);
    Toolbar.flash(Snapshot.all().length);

    if (Storage.unavailable) Toolbar.showStorageBadge();
  }

  function unmount() {
    Scanner.destroy();
    Toolbar.unmount();
    window.__vellumMounted = false;
  }

  const Vellum = { version: VERSION, mount, unmount, copy, reset, setMode };

  if (typeof window !== "undefined") {
    window.Vellum = Vellum;

    if (globalThis.__VELLUM_TEST__ || window.__VELLUM_TEST__) {
      globalThis.__vellumInternals = { Selector, Snapshot, Storage, Output };
      window.__vellumInternals = { Selector, Snapshot, Storage, Output };
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount, { once: true });
    } else {
      mount();
    }
  }
})();
