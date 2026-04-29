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
  const Snapshot = (() => { return {}; })();
  const Storage  = (() => { return {}; })();
  const Scanner  = (() => { return {}; })();
  const Output   = (() => { return {}; })();
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
