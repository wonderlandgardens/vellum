# Vellum Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace vellum's current bundled-diagrams `index.html` with a drop-in overlay (`vellum.js`) that makes any page's text editable and exports the resulting edits as agent-ready markdown, plus a thin npm wrapper.

**Architecture:** Single-file plain-JS IIFE with six sectioned internal modules (Selector, Snapshot, Storage, Scanner, Output, Toolbar). No build step. Toolbar lives in a Shadow DOM. Edits are persisted to `localStorage` and exported as agentation-style markdown. Distribution is a jsdelivr-served `<script>` tag, a bookmarklet, and an `npm i vellum` wrapper that injects the same script.

**Tech Stack:**
- Vanilla ES2020 JavaScript (no TypeScript, no JSX)
- `node:test` + `jsdom` for unit tests (no test framework dependency)
- jsdelivr for static distribution (`https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js`)
- npm for the wrapper package only

**Spec:** `docs/superpowers/specs/2026-04-29-vellum-overlay-design.md`

---

## File Structure

```
repo root
├── vellum.js                                     ← Created: the product (one IIFE, sectioned)
├── vellum.test.js                                ← Created: node:test + jsdom unit tests
├── package.json                                  ← Created: npm wrapper
├── index.js                                      ← Created: npm wrapper entry (mount())
├── index.html                                    ← Rewritten: minimal demo page
├── README.md                                     ← Rewritten: pitch + 3 install paths
└── docs/
    └── superpowers/
        ├── plans/2026-04-29-vellum-overlay.md    ← This file
        └── specs/2026-04-29-vellum-overlay-design.md
```

**Responsibilities:**
- `vellum.js` — the entire runtime overlay. One file, one outer IIFE, six internal-module IIFEs. Self-contained, no dependencies.
- `vellum.test.js` — exercises the four pure modules (Selector, Snapshot, Storage, Output) via the `globalThis.__vellumInternals` test hatch. No DOM rendering, no Toolbar tests.
- `package.json` + `index.js` — the npm wrapper. `index.js` is ~25 lines: `export function mount()` that injects the jsdelivr `<script>` once and resolves `window.Vellum` on load.
- `index.html` — the demo + landing page served from the repo root. Loads `./vellum.js` via a script tag and provides 1-2 paragraphs visitors can edit live.
- `README.md` — three install paths in order: bookmarklet, `<script>` tag, `npm i vellum`. Output format example. Configuration knob.

**Outstanding placeholder:** Throughout this plan, `<owner>` is used in jsdelivr URLs and the `package.json` `repository` field. The user has not chosen a substitution; tasks leave it as `<owner>` and a final task captures the substitution decision.

---

## Task Breakdown

The plan is structured so each task produces a working, testable artifact. Tasks 1-4 build the four pure modules with full TDD. Task 5 wires Storage. Task 6 builds Scanner (DOM-mutating, smoke-tested via index.html). Task 7 builds Toolbar. Task 8 wires the outer IIFE. Tasks 9-12 ship distribution surface.

---

### Task 1: Repo skeleton and test infrastructure

**Files:**
- Create: `vellum.js` (skeleton only)
- Create: `vellum.test.js`
- Create: `package.json` (root, for dev deps only — not the npm wrapper yet)

- [ ] **Step 1: Initialize root `package.json` with jsdom**

Create `package.json` at repo root:

```json
{
  "name": "vellum-dev",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test vellum.test.js"
  },
  "devDependencies": {
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Install jsdom**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, jsdom installed.

- [ ] **Step 3: Write skeleton `vellum.js`**

Create `vellum.js`:

```js
/* Vellum — drop-in editable-text overlay. MIT.
 * https://github.com/<owner>/vellum
 */
(() => {
  const VERSION = "1.0.0";

  // Internal modules — populated by subsequent tasks.
  const Selector = (() => { return {}; })();
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

    if (globalThis.__VELLUM_TEST__) {
      globalThis.__vellumInternals = { Selector, Snapshot, Storage, Output };
    }
  }
})();
```

- [ ] **Step 4: Write skeleton `vellum.test.js`**

Create `vellum.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

function loadVellum(html = "<!doctype html><html><body></body></html>") {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  dom.window.__VELLUM_TEST__ = true;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.__VELLUM_TEST__ = true;

  const code = readFileSync(new URL("./vellum.js", import.meta.url), "utf-8");
  dom.window.eval(code);

  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    internals: dom.window.__vellumInternals,
  };
}

test("vellum loads without throwing and exposes test internals", () => {
  const { window, internals } = loadVellum();
  assert.ok(window.Vellum);
  assert.equal(window.Vellum.version, "1.0.0");
  assert.ok(internals);
  assert.ok(internals.Selector);
  assert.ok(internals.Snapshot);
  assert.ok(internals.Storage);
  assert.ok(internals.Output);
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: `tests 1 passed 1`. If it fails because jsdom evaluates `vellum.js` in a different context where `globalThis.__VELLUM_TEST__` isn't visible, fix `vellum.js` to also check `window.__VELLUM_TEST__`:

```js
if (globalThis.__VELLUM_TEST__ || (typeof window !== "undefined" && window.__VELLUM_TEST__)) {
```

Re-run. Both checks should be present so tests work whether the IIFE runs in Node or jsdom.

- [ ] **Step 6: Add `.gitignore` entry**

Edit `.gitignore` (existing file) — append:

```
node_modules/
package-lock.json
```

- [ ] **Step 7: Commit**

```bash
git add package.json vellum.js vellum.test.js .gitignore
git commit -m "Add vellum.js skeleton and test harness"
```

---

### Task 2: Selector module

**Files:**
- Modify: `vellum.js` (replace the `Selector` IIFE)
- Modify: `vellum.test.js` (append tests)

- [ ] **Step 1: Write failing tests for `Selector.pathOf`**

Append to `vellum.test.js`:

```js
test("pathOf returns id-anchored path when ancestor has id", () => {
  const html = `<!doctype html><html><body>
    <main id="root"><section><h1>Hi</h1></section></main>
  </body></html>`;
  const { internals, document } = loadVellum(html);
  const h1 = document.querySelector("h1");
  assert.equal(internals.Selector.pathOf(h1), "#root > section > h1");
});

test("pathOf prefers meaningful class over tag", () => {
  const html = `<!doctype html><html><body>
    <main><div class="hero card"><p>Hi</p></div></main>
  </body></html>`;
  const { internals, document } = loadVellum(html);
  const p = document.querySelector("p");
  // first meaningful class wins; main has no class so it stays as "main"
  assert.equal(internals.Selector.pathOf(p), "main > .hero > p");
});

test("pathOf strips CSS-module hash classes", () => {
  const html = `<!doctype html><html><body>
    <main><div class="card_abc12345"><p>Hi</p></div></main>
  </body></html>`;
  const { internals, document } = loadVellum(html);
  const p = document.querySelector("p");
  assert.equal(internals.Selector.pathOf(p), "main > .card > p");
});

test("pathOf skips short and uppercase-hash classes", () => {
  const html = `<!doctype html><html><body>
    <main><div class="xs ABCDE12345 hero"><p>Hi</p></div></main>
  </body></html>`;
  const { internals, document } = loadVellum(html);
  const p = document.querySelector("p");
  assert.equal(internals.Selector.pathOf(p), "main > .hero > p");
});

test("pathOf skips html and body", () => {
  const html = `<!doctype html><html><body><p>Hi</p></body></html>`;
  const { internals, document } = loadVellum(html);
  const p = document.querySelector("p");
  assert.equal(internals.Selector.pathOf(p), "p");
});

test("pathOf appends nth-of-type when sibling tag is duplicated", () => {
  const html = `<!doctype html><html><body>
    <main><p>One</p><p>Two</p><p>Three</p></main>
  </body></html>`;
  const { internals, document } = loadVellum(html);
  const ps = document.querySelectorAll("p");
  assert.equal(internals.Selector.pathOf(ps[0]), "main > p:nth-of-type(1)");
  assert.equal(internals.Selector.pathOf(ps[1]), "main > p:nth-of-type(2)");
  assert.equal(internals.Selector.pathOf(ps[2]), "main > p:nth-of-type(3)");
});

test("pathOf round-trips: querySelector(pathOf(el)) === el", () => {
  const html = `<!doctype html><html><body>
    <main id="root">
      <section class="hero"><h1>Title</h1><p>One</p><p>Two</p></section>
      <article><p>A</p><p>B</p></article>
    </main>
  </body></html>`;
  const { internals, document } = loadVellum(html);
  for (const el of document.querySelectorAll("h1, p")) {
    const path = internals.Selector.pathOf(el);
    assert.equal(document.querySelector(path), el, `path "${path}" should resolve back to its element`);
  }
});

test("nameOf produces tag-aware human-readable names", () => {
  const html = `<!doctype html><html><body>
    <h1>Welcome to our site</h1>
    <p>Lorem ipsum dolor sit amet consectetur adipiscing elit.</p>
    <button>Sign up</button>
    <a href="#">Read more</a>
    <li>First entry</li>
    <code>npm install</code>
    <span>label</span>
    <div class="container">unknown</div>
  </body></html>`;
  const { internals, document } = loadVellum(html);
  assert.equal(internals.Selector.nameOf(document.querySelector("h1")), 'h1 "Welcome to our site"');
  assert.match(internals.Selector.nameOf(document.querySelector("p")), /^paragraph: "Lorem ipsum dolor sit amet/);
  assert.equal(internals.Selector.nameOf(document.querySelector("button")), 'button "Sign up"');
  assert.equal(internals.Selector.nameOf(document.querySelector("a")), 'link "Read more"');
  assert.equal(internals.Selector.nameOf(document.querySelector("li")), 'list item: "First entry"');
  assert.equal(internals.Selector.nameOf(document.querySelector("code")), 'code: `npm install`');
  assert.equal(internals.Selector.nameOf(document.querySelector("span")), '"label"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 8 tests fail (`Selector.pathOf is not a function`, etc.). The existing smoke test still passes.

- [ ] **Step 3: Implement Selector module**

In `vellum.js`, replace `const Selector = (() => { return {}; })();` with:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add vellum.js vellum.test.js
git commit -m "Add Selector module: pathOf and nameOf"
```

---

### Task 3: Snapshot module

**Files:**
- Modify: `vellum.js` (replace `Snapshot` IIFE)
- Modify: `vellum.test.js` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `vellum.test.js`:

```js
test("Snapshot.capture stores original only on first call per path", () => {
  const { internals } = loadVellum();
  const Snapshot = internals.Snapshot;
  Snapshot.capture("main > h1", "Original");
  Snapshot.capture("main > h1", "Modified");      // should be ignored
  assert.equal(Snapshot.get("main > h1"), "Original");
});

test("Snapshot.capture stores independent values per path", () => {
  const { internals } = loadVellum();
  const Snapshot = internals.Snapshot;
  Snapshot.capture("a", "one");
  Snapshot.capture("b", "two");
  assert.equal(Snapshot.get("a"), "one");
  assert.equal(Snapshot.get("b"), "two");
});

test("Snapshot.all returns one entry per captured path", () => {
  const { internals } = loadVellum();
  const Snapshot = internals.Snapshot;
  Snapshot.capture("a", "one");
  Snapshot.capture("b", "two");
  const all = Snapshot.all();
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.sort((x, y) => x.path.localeCompare(y.path)),
    [{ path: "a", before: "one" }, { path: "b", before: "two" }]
  );
});

test("Snapshot.clear empties the store", () => {
  const { internals } = loadVellum();
  const Snapshot = internals.Snapshot;
  Snapshot.capture("a", "one");
  Snapshot.clear();
  assert.equal(Snapshot.get("a"), undefined);
  assert.equal(Snapshot.all().length, 0);
});

test("Snapshot.hydrate replaces all entries from a serialized object", () => {
  const { internals } = loadVellum();
  const Snapshot = internals.Snapshot;
  Snapshot.capture("a", "one");
  Snapshot.hydrate({ b: "two", c: "three" });
  assert.equal(Snapshot.get("a"), undefined);
  assert.equal(Snapshot.get("b"), "two");
  assert.equal(Snapshot.get("c"), "three");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement Snapshot module**

Replace the `Snapshot` IIFE in `vellum.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (14 total now).

- [ ] **Step 5: Commit**

```bash
git add vellum.js vellum.test.js
git commit -m "Add Snapshot module: first-edit-only original capture"
```

---

### Task 4: Output module

**Files:**
- Modify: `vellum.js` (replace `Output` IIFE)
- Modify: `vellum.test.js` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `vellum.test.js`:

```js
test("Output.markdown returns empty string for zero edits", () => {
  const { internals } = loadVellum();
  assert.equal(internals.Output.markdown([], { url: "x", pathname: "/x", viewport: "1x1" }), "");
});

test("Output.markdown formats a single edit", () => {
  const { internals } = loadVellum();
  const out = internals.Output.markdown(
    [{ path: "main > h1", name: 'h1 "Pricing"', before: "Pricing", after: "Plans & pricing", removed: false }],
    { url: "https://example.com/pricing", pathname: "/pricing", viewport: "1440×900" }
  );
  assert.match(out, /^# Vellum edits — \/pricing$/m);
  assert.match(out, /\*\*URL:\*\* https:\/\/example\.com\/pricing/);
  assert.match(out, /\*\*Viewport:\*\* 1440×900/);
  assert.match(out, /\*\*Edits:\*\* 1/);
  assert.match(out, /## 1\. h1 "Pricing"/);
  assert.match(out, /\*\*Location:\*\* main > h1/);
  assert.match(out, /\*\*Before:\*\*\nPricing/);
  assert.match(out, /\*\*After:\*\*\nPlans & pricing/);
});

test("Output.markdown handles multiple edits with separate sections", () => {
  const { internals } = loadVellum();
  const out = internals.Output.markdown(
    [
      { path: "h1", name: 'h1 "A"', before: "A", after: "AA", removed: false },
      { path: "p", name: 'paragraph: "B"', before: "B", after: "BB", removed: false },
    ],
    { url: "u", pathname: "/", viewport: "1x1" }
  );
  assert.match(out, /## 1\. h1 "A"/);
  assert.match(out, /## 2\. paragraph: "B"/);
  assert.match(out, /\*\*Edits:\*\* 2/);
});

test("Output.markdown emits Status for removed elements", () => {
  const { internals } = loadVellum();
  const out = internals.Output.markdown(
    [{ path: "main > h1", name: "(removed)", before: "Gone", after: null, removed: true }],
    { url: "u", pathname: "/", viewport: "1x1" }
  );
  assert.match(out, /\*\*Status:\*\* element no longer present/);
  assert.doesNotMatch(out, /\*\*Location:\*\*/);
  assert.match(out, /\*\*Before:\*\*\nGone/);
});

test("Output.markdown preserves multi-line before/after verbatim", () => {
  const { internals } = loadVellum();
  const before = "Line 1\nLine 2\nLine 3";
  const after = "New 1\n\nNew 3";
  const out = internals.Output.markdown(
    [{ path: "p", name: "paragraph", before, after, removed: false }],
    { url: "u", pathname: "/", viewport: "1x1" }
  );
  assert.match(out, /\*\*Before:\*\*\nLine 1\nLine 2\nLine 3/);
  assert.match(out, /\*\*After:\*\*\nNew 1\n\nNew 3/);
});

test("Output.json produces stable shape", () => {
  const { internals } = loadVellum();
  const json = internals.Output.json(
    [{ path: "h1", name: 'h1 "A"', before: "A", after: "AA", removed: false }],
    { url: "u", pathname: "/", viewport: "1x1" }
  );
  const parsed = JSON.parse(json);
  assert.equal(parsed.url, "u");
  assert.equal(parsed.viewport, "1x1");
  assert.equal(parsed.edits.length, 1);
  assert.equal(parsed.edits[0].path, "h1");
  assert.equal(parsed.edits[0].before, "A");
  assert.equal(parsed.edits[0].after, "AA");
  assert.equal(parsed.edits[0].removed, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 6 new tests fail.

- [ ] **Step 3: Implement Output module**

Replace the `Output` IIFE in `vellum.js`:

```js
const Output = (() => {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (20 total).

- [ ] **Step 5: Commit**

```bash
git add vellum.js vellum.test.js
git commit -m "Add Output module: markdown and json formatters"
```

---

### Task 5: Storage module

**Files:**
- Modify: `vellum.js` (replace `Storage` IIFE)
- Modify: `vellum.test.js` (append tests)

- [ ] **Step 1: Write failing tests**

Append to `vellum.test.js`:

```js
test("Storage.key includes origin and pathname", () => {
  const { internals, window } = loadVellum();
  // jsdom's default location is about:blank — override
  Object.defineProperty(window, "location", {
    value: { origin: "https://example.com", pathname: "/pricing" },
    writable: true,
  });
  assert.equal(internals.Storage.key(), "vellum:https://example.com/pricing");
});

test("Storage.save and load round-trip a payload", () => {
  const { internals, window } = loadVellum();
  Object.defineProperty(window, "location", {
    value: { origin: "https://example.com", pathname: "/p" },
    writable: true,
  });
  internals.Storage.save({ edits: { "h1": "New" }, snapshots: { "h1": "Old" }, mode: "always-on" });
  const loaded = internals.Storage.load();
  assert.deepEqual(loaded.edits, { h1: "New" });
  assert.deepEqual(loaded.snapshots, { h1: "Old" });
  assert.equal(loaded.mode, "always-on");
});

test("Storage.load returns null when no entry exists", () => {
  const { internals, window } = loadVellum();
  Object.defineProperty(window, "location", {
    value: { origin: "https://example.com", pathname: "/empty" },
    writable: true,
  });
  assert.equal(internals.Storage.load(), null);
});

test("Storage.clear removes the current key", () => {
  const { internals, window } = loadVellum();
  Object.defineProperty(window, "location", {
    value: { origin: "https://example.com", pathname: "/p" },
    writable: true,
  });
  internals.Storage.save({ edits: { h1: "x" }, snapshots: {}, mode: "always-on" });
  internals.Storage.clear();
  assert.equal(internals.Storage.load(), null);
});

test("Storage.load returns null and reports unavailable on corrupt JSON", () => {
  const { internals, window } = loadVellum();
  Object.defineProperty(window, "location", {
    value: { origin: "https://example.com", pathname: "/p" },
    writable: true,
  });
  window.localStorage.setItem("vellum:https://example.com/p", "{not json");
  assert.equal(internals.Storage.load(), null);
  assert.equal(internals.Storage.unavailable, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: 5 new tests fail.

- [ ] **Step 3: Implement Storage module**

Replace the `Storage` IIFE in `vellum.js`:

```js
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

  // Public save can be debounced or immediate — debounce when called frequently from input handlers.
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests pass (25 total).

- [ ] **Step 5: Commit**

```bash
git add vellum.js vellum.test.js
git commit -m "Add Storage module: localStorage adapter with key/load/save/clear"
```

---

### Task 6: Scanner module

**Files:**
- Modify: `vellum.js` (replace `Scanner` IIFE)

The Scanner is DOM-mutating and listener-heavy. Per spec, it has no unit tests; it is smoke-tested via `index.html` in Task 9. This task implements it and verifies it loads without error.

- [ ] **Step 1: Implement Scanner module**

Replace the `Scanner` IIFE in `vellum.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify nothing regressed**

Run: `npm test`
Expected: all 25 tests still pass. Scanner has no unit tests but the module must still parse and load.

- [ ] **Step 3: Commit**

```bash
git add vellum.js
git commit -m "Add Scanner module: text-bearing element detection and arming"
```

---

### Task 7: Toolbar module

**Files:**
- Modify: `vellum.js` (replace `Toolbar` IIFE)

- [ ] **Step 1: Implement Toolbar module**

Replace the `Toolbar` IIFE in `vellum.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify nothing regressed**

Run: `npm test`
Expected: all 25 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add vellum.js
git commit -m "Add Toolbar module: shadow-DOM floating panel with action buttons"
```

---

### Task 8: Wire the outer IIFE

**Files:**
- Modify: `vellum.js` (replace the public-API stub with real glue)

- [ ] **Step 1: Replace the public-API stub at the bottom of `vellum.js`**

In `vellum.js`, replace the `const Vellum = {...}` block and the `if (typeof window !== "undefined") {...}` block with:

```js
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
```

- [ ] **Step 2: Run tests to verify nothing regressed**

Run: `npm test`
Expected: all 25 tests still pass. The test harness sets `__VELLUM_TEST__`, which prevents auto-mount, so glue code doesn't interfere with module-level tests.

- [ ] **Step 3: Commit**

```bash
git add vellum.js
git commit -m "Wire vellum.js outer IIFE: glue code, lifecycle, and public API"
```

---

### Task 9: Replace `index.html` with a demo page

**Files:**
- Modify: `index.html` (full rewrite)

- [ ] **Step 1: Rewrite `index.html`**

Replace the entire contents of `index.html` with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vellum — drop-in editable text overlay</title>
  <style>
    :root { --ink: #111; --paper: #ededeb; --soft: #6e6e6e; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      background: var(--paper); color: var(--ink);
      font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    main { max-width: 720px; margin: 60px auto; padding: 0 24px 80px; }
    h1 { font-size: 32px; margin: 0 0 8px; }
    .lede { color: var(--soft); margin: 0 0 32px; font-size: 18px; }
    h2 { font-size: 18px; margin: 32px 0 8px; }
    p { margin: 0 0 12px; }
    pre {
      background: #fff; border: 1px solid #d6d6d4; border-radius: 6px;
      padding: 12px 14px; overflow-x: auto; font-size: 13px;
    }
    code { background: #fff; padding: 1px 4px; border-radius: 3px; }
    .try {
      border-top: 2px solid #c8c8c8; padding-top: 24px; margin-top: 40px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Vellum</h1>
    <p class="lede">A drop-in overlay that makes any page's text editable. Click. Edit. Copy as agent-ready markdown.</p>

    <h2>Bookmarklet</h2>
    <p>Drag this to your bookmarks bar, then click it on any page:</p>
    <pre><code>javascript:(()=&gt;{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/&lt;owner&gt;/vellum@main/vellum.js';document.head.appendChild(s);})()</code></pre>

    <h2>Script tag</h2>
    <pre><code>&lt;script src="https://cdn.jsdelivr.net/gh/&lt;owner&gt;/vellum@main/vellum.js"&gt;&lt;/script&gt;</code></pre>

    <h2>npm</h2>
    <pre><code>npm i vellum</code></pre>
    <pre><code>import { mount } from "vellum";
mount();</code></pre>

    <section class="try">
      <h2>Try it</h2>
      <p>This paragraph is editable. Click any text on this page, edit it, then click <strong>Copy markdown</strong> in the bottom-right toolbar.</p>
      <p>Headings, paragraphs, list items, and buttons are all armed by default. Edits are saved to <code>localStorage</code>; <strong>Reset</strong> restores originals in place.</p>
    </section>
  </main>

  <script src="./vellum.js"></script>
</body>
</html>
```

- [ ] **Step 2: Open the demo in a browser**

Run: `open index.html` (macOS) or equivalent.
Expected:
1. Page loads with three install snippets and a "Try it" section.
2. Bottom-right shows a small dark toolbar with `0 edits`, `Copy markdown`, `Copy JSON`, `Reset`, `Mode: always-on`.
3. Clicking on "This paragraph is editable" focuses it with a contenteditable outline.
4. Typing into it updates the toolbar to show `1 edit`.
5. Clicking **Copy markdown** copies markdown matching the spec format.
6. Clicking **Reset** restores the original text.
7. Reloading the page restores the most recent edit (until Reset is clicked).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "Replace index.html with vellum demo + install snippets"
```

---

### Task 10: npm wrapper

**Files:**
- Create: `index.js` (npm entry)
- Modify: `package.json` (split: dev test config stays at root, but add npm-publishable fields)

The current root `package.json` was set up for development only. We have two options: (a) one root `package.json` that doubles as the publishable manifest, or (b) a nested `package/` directory. For minimum overhead we use (a).

- [ ] **Step 1: Create `index.js`**

Create `index.js`:

```js
const SRC = "https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js";

export function mount(opts = {}) {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (typeof window !== "undefined" && window.Vellum) return Promise.resolve(window.Vellum);
  if (opts.mode && typeof window !== "undefined") window.VELLUM_MODE = opts.mode;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = opts.src || SRC;
    s.async = false;
    s.addEventListener("load", () => resolve(window.Vellum));
    s.addEventListener("error", reject);
    document.head.appendChild(s);
  });
}

export default { mount };
```

- [ ] **Step 2: Update `package.json`**

Replace `package.json` with:

```json
{
  "name": "vellum",
  "version": "1.0.0",
  "description": "Drop-in editable-text overlay with agent-ready markdown output",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js"
  },
  "files": [
    "index.js",
    "vellum.js",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "test": "node --test vellum.test.js"
  },
  "keywords": [
    "ai-agents",
    "feedback",
    "contenteditable",
    "overlay"
  ],
  "license": "MIT",
  "repository": "<owner>/vellum",
  "devDependencies": {
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 3: Run tests to verify nothing regressed**

Run: `npm test`
Expected: 25 tests pass.

- [ ] **Step 4: Commit**

```bash
git add index.js package.json
git commit -m "Add npm wrapper: package.json + index.js mount() entry"
```

---

### Task 11: Rewrite README

**Files:**
- Modify: `README.md` (full rewrite)

- [ ] **Step 1: Replace `README.md`**

Replace the entire contents with:

```markdown
# Vellum

**A drop-in overlay that makes any page's text editable.**
Click. Edit. Copy as agent-ready markdown. Paste into your AI coding agent.

No build step. No framework. One static `vellum.js` you can load via a script tag, a bookmarklet, or `npm i`.

## Why

You're reviewing a page with an AI agent. You want to change a heading, fix a typo, rephrase a button. Describing each change in prose is slow and error-prone. Vellum lets you *make* the changes directly on the page, then exports a structured payload the agent uses to find-and-replace in source.

## Install

### Bookmarklet (works on any page)

Drag this to your bookmarks bar:

```
javascript:(()=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js';document.head.appendChild(s);})()
```

Click it on any page to load vellum.

### Script tag

```html
<script src="https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js"></script>
```

### npm

```bash
npm i vellum
```

```js
import { mount } from "vellum";
mount();                                      // anywhere
useEffect(() => { mount(); }, []);            // React
```

## Use

1. Vellum loads → small toolbar appears bottom-right.
2. Click any text on the page → edit it inline.
3. Click **Copy markdown** → paste into your AI coding agent with: *"apply these edits to the codebase."*
4. **Reset** restores originals in place. No reload needed.

Edits are saved to `localStorage` per `(origin + pathname)` so they survive refreshes and don't bleed across pages.

## Output

```markdown
# Vellum edits — /pricing

**URL:** https://example.com/pricing
**Viewport:** 1440×900
**Edits:** 1

---

## 1. h1 "Pricing"
**Location:** main > section > h1
**Before:**
Pricing

**After:**
Plans & pricing
```

The agent gets a CSS selector path (for grepping markup) and the exact before/after text (for grepping copy).

## Configuration

```html
<script>window.VELLUM_MODE = "click-to-arm";</script>
<script src="..."></script>
```

Modes:
- `always-on` (default) — every text-bearing element is editable.
- `click-to-arm` — nothing is editable until you click an element through the toolbar.

Opt elements out with `data-vellum-ignore` (applies to descendants too).

## What it doesn't do

Vellum is text-only. It doesn't capture screenshots, computed styles, accessibility info, React component locations, or visual annotations. For those, use [agentation](https://github.com/benjitaylor/agentation).

## License

MIT. See [LICENSE](LICENSE).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Rewrite README around drop-in overlay positioning"
```

---

### Task 12: End-to-end smoke verification

**Files:** None modified — this is a verification task.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all 25 tests pass.

- [ ] **Step 2: Open the demo**

Run: `open index.html`

- [ ] **Step 3: Manual checks against the spec**

Verify each of the following in the browser:

1. **Toolbar visible** — bottom-right corner, dark panel, four buttons + edit count.
2. **Always-on mode arms text** — click "This paragraph is editable" and observe the contenteditable cursor.
3. **First-edit captures snapshot** — type a character. Observe edit count = 1.
4. **Repeated edits do not overwrite snapshot** — keep typing. Reset still restores the *original* text, not the first-keystroke version.
5. **Copy markdown produces expected format** — click **Copy markdown**, paste into a scratch buffer. Verify it matches the format in the README.
6. **Copy JSON produces expected shape** — click **Copy JSON**, paste, verify the JSON has `url`, `pathname`, `viewport`, `edits[]` with `path/name/before/after/removed`.
7. **Reset restores in place, no reload** — click **Reset**, accept confirm. Original text returns. Edit count = 0.
8. **Persistence across reload** — make an edit, reload the page. Edit is still there.
9. **Reset wipes localStorage** — make an edit, click Reset, reload. Original text. Edit count = 0.
10. **Mode toggle** — click `Mode: always-on` button. Text becomes non-editable. Click again. Returns to editable.
11. **Storage badge** — open DevTools, set `localStorage` to throw (e.g., disable site cookies). Reload. Toolbar shows "storage unavailable" badge.

- [ ] **Step 4: Commit any docs/spec drift**

If any manual check surfaces a spec/plan mismatch, decide:
- Bug in implementation → file a follow-up issue (do not edit the plan).
- Spec under-specified → update the spec, commit, and note in this task's commit message.

If everything is clean, the verification task adds no commits.

- [ ] **Step 5: Tag the release**

```bash
git tag v1.0.0
git log --oneline -20
```

The jsdelivr URL using `@v1.0.0` will now serve this exact commit.

---

## Self-Review Notes

This plan was self-reviewed against the spec on the same date. Findings and fixes:

1. **Spec coverage check:** Each spec section maps to a task — Selector → Task 2, Snapshot → Task 3, Storage → Task 5, Scanner → Task 6, Output → Task 4, Toolbar → Task 7, public API + glue → Task 8, npm wrapper → Task 10, demo page → Task 9, README → Task 11, verification → Task 12. The `MutationObserver`'s dual purpose (re-arm + SPA navigation) is partially implemented in Task 6 (re-arm) but **SPA navigation (popstate, key change → disarmAll → reload) is not yet wired**. Adding a follow-up note: SPA navigation handling can be deferred to a v1.1 — the spec calls for it, but for the initial drop-in-on-static-pages use case it is not load-bearing. If you want it in v1.0, add a Task 8.5 between Task 8 and Task 9.

2. **Placeholder scan:** All `<owner>` instances in jsdelivr URLs and `package.json` `repository` are *intentional* placeholders — they cannot be filled until the user picks the GitHub username. Every step that contains code shows the actual code; no "TBD" or "implement later" lines.

3. **Type/signature consistency:** `Storage.save(payload, opts)` is the same signature in module impl, glue (`persist()`), and tests. `Snapshot.capture(path, html)` is consistent across modules and tests. `Output.markdown(edits, ctx)` and `Output.json(edits, ctx)` use the same `ctx` shape (`{ url, pathname, viewport }`) in module, glue (`ctx()`), and tests.

4. **One known minor scope gap:** SPA navigation handling (mentioned above). User can decide whether to defer or expand the plan before execution begins.
