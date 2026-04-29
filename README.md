# Vellum

**An editable single-page diagram canvas.**
Lay out boxes in plain HTML, connect them with [leader-line](https://github.com/anseki/leader-line), edit any text directly in the browser, and copy the result back as JSON to commit to your repo.

No build step. No framework. One static `index.html` you can open from the filesystem.

## Why

SVG diagrams are great until you want to change a label. Vellum keeps the *boxes and arrows* aesthetic but makes every piece of text directly editable in the page — no Figma, no Illustrator, no SVG hand-editing.

## Use

```bash
open index.html
```

That's it. The page loads with three example diagrams (modality columns, a stack-mapping comparison, and a knowledge-graph flow). Click any text to edit it. Edits are saved to `localStorage` automatically and survive refreshes.

### Workflow

1. **Edit text** in any box. Auto-saved to `localStorage` as you type.
2. **Copy as JSON** (button bottom-right) — copies all editable content, keyed by DOM path, to your clipboard.
3. **Paste into your AI agent / a teammate / a PR** with the instruction: *"apply these edits to `index.html`"*. The DOM paths uniquely identify which line to change.
4. **Reset edits** wipes `localStorage` and reloads the page.

## How it works

- **Boxes**: plain HTML, styled with CSS Grid and `border` outlines.
- **Connectors**: [leader-line](https://github.com/anseki/leader-line) draws SVG paths between two DOM nodes after layout. Repositioned automatically on `resize` and on `input` for any contenteditable element.
- **Animation**: [anime.js](https://animejs.com/) staggers the box fade-in on load, then triggers leader-line's built-in `'draw'` effect on each connector.
- **Editing**: HTML5 `contenteditable="true"` on every text node. No editor framework.
- **Persistence**: `localStorage` keyed by index across all `[contenteditable="true"]` nodes.

## Customising

Open `index.html` and edit the markup directly. Three sections to know:

| Section | What it controls |
|---|---|
| `<style>` | colour palette via CSS variables (`--ink`, `--paper`, etc.), box styling, layout grids |
| `<main>` | the diagrams themselves — each `<article class="diagram">` is one. IDs on boxes are referenced by leader-line. |
| `<script>` (`buildLines`) | which boxes connect to which, plus per-line options (path shape, dash, label, socket gravity) |

To add a new connection between two existing boxes: give them `id`s, then add a `connect('source-id', 'target-id')` call inside `buildLines()`.

## Credits

- [leader-line-new](https://github.com/anseki/leader-line) — SVG arrow drawing between DOM nodes
- [anime.js](https://animejs.com/) — entrance animations

## License

MIT. See [LICENSE](LICENSE).
