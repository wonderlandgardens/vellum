# Vellum overlay redesign

**Date:** 2026-04-29
**Status:** Approved (pending user review of this spec)

## Summary

Vellum becomes a drop-in overlay that makes the text on *any* webpage editable and exports the resulting edits as agent-ready markdown. The current bundled-diagrams `index.html` is replaced by a slim demo page; the product is a single `vellum.js` file served via jsdelivr, plus a thin `npm i vellum` wrapper for app authors.

The redesign is inspired by [benjitaylor/agentation](https://github.com/benjitaylor/agentation) — specifically its element-identification and markdown-output strategy — but stays single-file, no-build, no-React.

## Goals

- Drop vellum on any page (own, third-party, SPA, static) and edit its text.
- Output a markdown payload an AI coding agent can parse to find-and-replace in source.
- Preserve vellum's "open `index.html`, no build, no framework" ethos: a script tag and a bookmarklet must work.
- Offer an npm install path for app authors who prefer it.

## Non-goals

- Visual feedback (annotations, screenshots, bounding boxes, computed styles, accessibility info, React component detection, source-file detection). That's agentation's territory; vellum is *only* about text edits.
- A workspace / monorepo / pnpm setup, MCP server, or React component. Explicitly ruled out by the user.
- Server-side persistence. Edits live in `localStorage`.
- Mobile support. Desktop browser only (matches agentation).

## File layout

```
repo root
├── vellum.js                            ← THE PRODUCT. Plain JS IIFE, sectioned modules.
├── vellum.test.js                       ← node:test, runs against vellum.js in jsdom.
├── index.html                           ← Demo page: pitch + install snippets + editable paragraphs.
├── package.json                         ← npm wrapper that injects vellum.js.
├── index.js                             ← npm entry: exports `mount()`.
├── README.md                            ← Rewritten pitch + 3 install paths.
├── LICENSE
└── docs/superpowers/specs/2026-04-29-vellum-overlay-design.md
```

`vellum.js` is the source of truth. Everything else exists to ship it or demo it.

## Distribution

- **jsdelivr CDN** auto-serves any GitHub repo, no infra needed: `https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js`. Versioned by branch, tag, or commit SHA.
- **Bookmarklet:** `javascript:(()=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js';document.head.appendChild(s);})()`.
- **Script tag:** `<script src="https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js"></script>` for pages whose source you control.
- **npm:** `npm i vellum` → `import { mount } from "vellum"; mount();`. The wrapper injects the same jsdelivr `<script>` once.

`@main` for latest, `@v1.2.3` for pinned. Tags created manually on release.

## Architecture

`vellum.js` is one outer IIFE containing six sectioned internal modules. Each module is itself an IIFE returning a small surface object. No build step; reads top-to-bottom like real modules.

```js
(() => {
  const Selector = (() => { /* ... */ return { pathOf, nameOf }; })();
  const Snapshot = (() => { /* ... */ return { capture, get, clear, all }; })();
  const Storage  = (() => { /* ... */ return { load, save, key, clear }; })();
  const Scanner  = (() => { /* ... */ return { armAll, armOne, disarmAll }; })();
  const Output   = (() => { /* ... */ return { markdown, json }; })();
  const Toolbar  = (() => { /* ... */ return { mount, setMode, flash }; })();

  // glue:
  Storage.load();
  Toolbar.mount();
  Scanner.armAll();
  window.Vellum = { mount, unmount, copy, reset, setMode, version };
})();
```

### Module responsibilities

**Selector** (pure, no DOM mutation, no storage)
- `pathOf(el)`: agentation-style chain, extended for uniqueness. At each level pick `#id` if present, else a "meaningful" class (longer than 2 chars, not matching `^[a-z]{1,2}$`, with CSS-module hashes stripped via the patterns `_[a-zA-Z0-9]{5,}` and trailing `[A-Z0-9]{5,}`), else tag. Skip `<html>` and `<body>`. Join with `" > "`.
- **Vellum-specific extension** (not in agentation): if the chosen identifier at any level is *not* unique among the parent's children matching the same tag, append `:nth-of-type(n)`. This is required because vellum round-trips paths via `document.querySelector` to re-apply saved edits across page reloads, whereas agentation only displays paths. Depth limit lifts from 4 to "as deep as needed for uniqueness from the document root" — depth-4 is fine when an `#id` anchors the chain; without one, the chain may run longer.
- `nameOf(el)`: tag-aware human-readable label. Examples: `h2 "Welcome to…"`, `paragraph: "Lorem ipsum…"`, `button "Sign up"`, `link "Read more"`, `list item: "First entry"`. Truncate text to ≤40 chars with `…` suffix.

**Snapshot** (in-memory + persisted via `Storage`)
- `capture(path, originalHTML)`: stores `originalHTML` only if no entry yet for `path`. First-edit-only — repeated edits don't overwrite the original.
- `get(path)`: returns saved original, or `undefined`.
- `all()`: returns `[{ path, before }]` for every captured snapshot.
- `clear()`: empties the snapshot store.
- The "original" is read from a per-element cache `Scanner` populates *at arm time*, not at first-keystroke time (which would already be mutated).

**Storage** (only module that touches `localStorage`)
- `key()`: returns `"vellum:" + location.origin + location.pathname`. Recomputed on SPA navigation.
- `load()`: reads `localStorage[key()]`, parses JSON, hydrates `Snapshot` in memory, and returns `{ edits, mode }` for the caller to apply. **Does not touch the DOM** — DOM application is the caller's job, done after `Scanner.armAll()` so target elements exist.
- `save(path, html)`: debounced 200ms; serializes `{ edits, snapshots, mode }` to `localStorage[key()]`.
- `clear()`: removes the entry for the current key.
- All operations wrapped in `try/catch`. On failure (quota, disabled, corrupt) vellum continues in-memory and Toolbar shows a "storage unavailable" badge.

**Scanner** (DOM mutator)
- `armAll()`: walks the document, sets `contenteditable="true"` on every text-bearing element matching the criteria below. Mode = `always-on` default; mode = `click-to-arm` skips this and instead installs hover-highlight + click-to-arm listeners.
- `armOne(el)`: arms a single element (used by click-to-arm mode).
- `disarmAll()`: removes `contenteditable` and listeners.
- Wires a single delegated `input` listener on `document`. On each keystroke in an armed element: if `Snapshot.get(path)` is empty, calls `Snapshot.capture(path, originalHTMLCache.get(el))`, then `Storage.save(path, el.innerHTML)`, then `Toolbar.flash()`.
- **Editable criteria** (Q1 answer = "everything textual"):
  - Tag is one of: `h1` `h2` `h3` `h4` `h5` `h6` `p` `li` `blockquote` `figcaption` `caption` `dt` `dd` `td` `th` `span` `a` `button` `label` `legend` `summary` `q` `cite`.
  - Element has at least one direct text-node child whose `textContent.trim()` is non-empty.
  - Element is not inside `<head>`, `<script>`, `<style>`, the toolbar's host element, or a shadow root vellum doesn't own.
  - Element is not already `[contenteditable="false"]`.
- Ignored regions: `[data-vellum-ignore]` and any descendants. Authors can opt elements out without forking vellum.
- A single shared `MutationObserver` on `<body>` serves two purposes:
  1. Re-arm newly added text-bearing nodes (lazy content, dynamic inserts).
  2. Detect SPA navigation by re-running `Storage.key()` — if the key changed, trigger the SPA-navigation flow described under "Data flow".
  This observer is owned by `Scanner` and triggers both behaviors from the same callback.

**Output** (pure)
- `markdown(edits)`: returns the standard format (see "Output format" below).
- `json(edits)`: returns the JSON shape (see "Output format" below).
- `edits` is `[{ path, name, before, after, removed }]`. Caller (Toolbar) builds this list by iterating `Snapshot.all()`, looking up the live element, and skipping entries where `before === after`.

**Toolbar** (UI)
- Shadow-DOM-rooted floating panel attached to `<body>`. Host-page CSS cannot leak in; vellum's CSS cannot leak out.
- Buttons: **Copy markdown**, **Copy JSON**, **Reset**, mode toggle (always-on / click-to-arm).
- Edit-count badge updates via `flash()`.
- "Reset" is a confirm dialog that calls `Snapshot.all()`, writes each `before` back into the live element's `innerHTML` *in place* (no reload), then clears `Snapshot` and `Storage`.
- Position: bottom-right, fixed, `z-index: 2147483647` (max int — common practice for overlays).

### Public API

`window.Vellum` is the only escape hatch from the IIFE:

```ts
{
  mount(): void;            // idempotent; no-op if already mounted
  unmount(): void;          // disarmAll + remove toolbar; doesn't clear storage
  copy(format?: "markdown" | "json"): Promise<string>;
  reset(): void;            // confirm + restore originals
  setMode(mode: "always-on" | "click-to-arm"): void;
  version: string;
}
```

Configuration before script load:

```html
<script>window.VELLUM_MODE = "click-to-arm";</script>
<script src=".../vellum.js"></script>
```

## Data flow

### On script load
1. IIFE runs.
2. `Toolbar.mount()` attaches Shadow-DOM root to `<body>`.
3. `Storage.load()` reads `localStorage[key()]` → `{ edits, snapshots, mode }`.
4. `Scanner.armAll()` walks DOM, marks elements `contenteditable`, builds the original-HTML cache.
5. For each saved edit, look up the element via `document.querySelector(path)` and write the saved `innerHTML`. Restores previous-session edits.
6. If `mode === "click-to-arm"`, `Scanner.disarmAll()` then install hover/click listeners.

### On user keystroke
1. Delegated `input` listener fires.
2. `Snapshot.capture(pathOf(el), originalHTMLCache.get(el))` (no-op if already captured).
3. `Storage.save(pathOf(el), el.innerHTML)` (debounced 200ms).
4. `Toolbar.flash()` updates the edit-count badge.

### On "Copy markdown"
1. `Toolbar` calls `buildEditList()`:
   - For each `{ path, before }` in `Snapshot.all()`, find live element via `document.querySelector(path)` (best-effort).
   - If found: `{ path, name: nameOf(el), before, after: el.innerHTML, removed: false }`.
   - If not found: `{ path, name: "(removed)", before, after: null, removed: true }`.
   - Skip entries where `before === after`.
2. Pipe `Output.markdown(list)` to `navigator.clipboard.writeText`. Fallback to `prompt()` on rejection.

### On "Reset"
1. Confirm dialog.
2. For each path in `Snapshot.all()`, find live element and write `before` back into `el.innerHTML`.
3. `Storage.clear()`. `Snapshot.clear()`. `Toolbar.flash()` resets count to 0.

### On SPA navigation
A `popstate` listener and Scanner's shared `MutationObserver` both call the same handler, which re-runs `Storage.key()`. If the key changed:
1. `Scanner.disarmAll()`.
2. `Snapshot.clear()` (in-memory only — disk entries for other keys remain independent).
3. `Storage.load()` for the new key, returning `{ edits, mode }`.
4. `Scanner.armAll()`.
5. Apply each saved edit's `innerHTML` to its live element via `document.querySelector(path)`.

### Edge case — element removed between edit and copy
- `buildEditList` includes the entry with `removed: true`. Output marks it `**Status:** element no longer present` instead of `**Location:**`. Agent still gets the path and the before/after text so it can still find-and-replace in source.

## Output format

### Markdown (default)

```markdown
# Vellum edits — /pricing

**URL:** https://example.com/pricing
**Viewport:** 1440×900
**Edits:** 2

---

## 1. h1 "Pricing"
**Location:** main > section > h1
**Before:**
Pricing

**After:**
Plans & pricing

## 2. paragraph: "Start free, upgrade when…"
**Location:** main > section > p:nth-of-type(2)
**Before:**
Start free, upgrade when you're ready.

**After:**
Start free. Upgrade any time.
```

Rules:
- Heading uses `Selector.nameOf(el)`.
- `**Location:**` is `Selector.pathOf(el)`.
- `**Before:** / **After:**` on their own lines so multi-line edits read cleanly. Leading/trailing whitespace preserved verbatim.
- HTML preserved literally if the element had nested formatting (e.g., `<strong>`).
- Removed-element edits use `**Status:** element no longer present` instead of `**Location:**`.
- One detail level (Standard). Agentation's compact/detailed/forensic modes are out of scope.

### JSON (power users / round-tripping)

```json
{
  "url": "https://example.com/pricing",
  "viewport": "1440x900",
  "edits": [
    {
      "path": "main > section > h1",
      "name": "h1 \"Pricing\"",
      "before": "Pricing",
      "after": "Plans & pricing",
      "removed": false
    }
  ]
}
```

## Error handling

Boundary-only — no defensive padding for impossible cases.

- `Storage` wraps every `localStorage` call in `try/catch`. Failure → in-memory mode, "storage unavailable" badge, no thrown error.
- `navigator.clipboard.writeText` rejection → fallback to `window.prompt("Copy this:", payload)`. Matches the existing `index.html` line 539 behavior.
- `Scanner` does not wrap user code in `try/catch`. Real errors must bubble to `window.onerror`.
- `Selector.pathOf` walks at most up to `<body>` (which is hard-stopped), so no runaway loops are possible. A safety cap at 20 levels guards against pathological detached trees.
- The toolbar's Shadow DOM isolates host CSS in both directions.

## Testing

`vellum.test.js` using `node:test` + `jsdom`. No external test framework, no build, no `npm test` script needed for vellum itself (`node --test vellum.test.js` runs it).

The IIFE exposes its internals only when the test flag is set:

```js
if (globalThis.__VELLUM_TEST__) {
  globalThis.__vellumInternals = { Selector, Snapshot, Storage, Output };
}
```

Coverage targets:

- **`Selector.pathOf`**: id wins over class wins over tag; hash-class filter strips `_abc12345` and `ABCDE12345`; skips `<html>` and `<body>`; appends `:nth-of-type(n)` when an identifier is non-unique among same-tag siblings; resulting selector resolves to the same element via `document.querySelector` (round-trip property — verified by selecting random elements in a fixture, calling `pathOf`, then asserting `querySelector(path) === el`).
- **`Selector.nameOf`**: each tag branch (h1-h6, p, button, a, span, label, li, code, img, input, container fallback).
- **`Output.markdown`**: zero edits → empty string; one edit; multi edits; removed-element edit; multi-line text preserved verbatim; nested HTML preserved.
- **`Output.json`**: shape matches schema.
- **`Snapshot.capture`**: first call stores; subsequent calls for same path are no-ops; different paths coexist.

No DOM-render tests for `Toolbar` or end-to-end Scanner tests — too brittle for a one-file overlay; eyeballed via `index.html` instead.

## The npm wrapper

```js
// package.json
{
  "name": "vellum",
  "version": "1.0.0",
  "description": "Drop-in editable-text overlay with agent-ready output",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js"
  },
  "files": ["index.js"],
  "license": "MIT",
  "repository": "<owner>/vellum"
}
```

```js
// index.js
const SRC = "https://cdn.jsdelivr.net/gh/<owner>/vellum@main/vellum.js";

export function mount(opts = {}) {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (window.Vellum) return Promise.resolve(window.Vellum);
  if (opts.mode) window.VELLUM_MODE = opts.mode;
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

Side-effect-free import. Caller does:
```js
import { mount } from "vellum";
mount();                                  // anywhere
useEffect(() => { mount(); }, []);        // React
```

No React peer dep, no JSX, no TypeScript, no build step.

## `index.html` (the demo page)

Replace entirely:
- Strip the diagram markup, leader-line script, anime.js script, and the inline edit-tracking script (current lines 393–565).
- Keep only: minimal landing copy, install snippets (bookmarklet button, `<script>` tag snippet, `npm i vellum` snippet), one or two paragraphs of editable content, and `<script src="./vellum.js"></script>` at the bottom.
- Open from filesystem → toolbar appears → edit a paragraph → "Copy markdown" → output matches the format above.

## `README.md`

Rewrite around: "Drop vellum on any page. Click text. Edit it. Copy edits as agent-ready markdown. Paste into your AI agent."

Three install paths in order:
1. Bookmarklet (one-click drag-to-bookmarks-bar link).
2. `<script>` tag with jsdelivr URL.
3. `npm i vellum`.

Then: a worked example of the markdown output, and the configuration knob (`window.VELLUM_MODE`).

No mention of bundled diagrams or the previous demo content.

## Out of scope (future work)

- Compact / detailed / forensic detail levels for output.
- Visual annotations or screenshots.
- React component detection or source-file resolution.
- MCP server for direct edit application.
- Mobile support.
- Server-side edit persistence.
- Per-element "lock" so an editor can mark certain edits as ready for export and skip drafts.
