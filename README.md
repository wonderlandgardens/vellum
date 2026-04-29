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
javascript:(()=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/gh/wonderlandgardens/vellum@main/vellum.js';document.head.appendChild(s);})()
```

Click it on any page to load vellum.

### Script tag

```html
<script src="https://cdn.jsdelivr.net/gh/wonderlandgardens/vellum@main/vellum.js"></script>
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

Vellum is text-only. It doesn't capture screenshots, computed styles, accessibility info, React component locations, or visual annotations.

## License

MIT. See [LICENSE](LICENSE).
