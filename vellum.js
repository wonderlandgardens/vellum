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
  const Storage  = (() => { return {}; })();
  const Scanner  = (() => { return {}; })();
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
  const Toolbar  = (() => { return {}; })();

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
