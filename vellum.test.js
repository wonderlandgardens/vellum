import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

function loadVellum(t, html = "<!doctype html><html><body></body></html>") {
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  dom.window.__VELLUM_TEST__ = true;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.__VELLUM_TEST__ = true;

  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.__VELLUM_TEST__;
  });

  const code = readFileSync(new URL("./vellum.js", import.meta.url), "utf-8");
  eval(code);

  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    internals: globalThis.__vellumInternals,
  };
}

test("vellum loads without throwing and exposes test internals", (t) => {
  const { window, internals } = loadVellum(t);
  assert.ok(window.Vellum);
  assert.equal(window.Vellum.version, "1.0.0");
  assert.ok(internals);
  assert.ok(internals.Selector);
  assert.ok(internals.Snapshot);
  assert.ok(internals.Storage);
  assert.ok(internals.Output);
});

test("pathOf returns id-anchored path when ancestor has id", (t) => {
  const html = `<!doctype html><html><body>
    <main id="root"><section><h1>Hi</h1></section></main>
  </body></html>`;
  const { internals, document } = loadVellum(t, html);
  const h1 = document.querySelector("h1");
  assert.equal(internals.Selector.pathOf(h1), "#root > section > h1");
});

test("pathOf prefers meaningful class over tag", (t) => {
  const html = `<!doctype html><html><body>
    <main><div class="hero card"><p>Hi</p></div></main>
  </body></html>`;
  const { internals, document } = loadVellum(t, html);
  const p = document.querySelector("p");
  assert.equal(internals.Selector.pathOf(p), "main > .hero > p");
});

test("pathOf strips CSS-module hash classes", (t) => {
  const html = `<!doctype html><html><body>
    <main><div class="card_abc12345"><p>Hi</p></div></main>
  </body></html>`;
  const { internals, document } = loadVellum(t, html);
  const p = document.querySelector("p");
  assert.equal(internals.Selector.pathOf(p), "main > .card > p");
});

test("pathOf skips short and uppercase-hash classes", (t) => {
  const html = `<!doctype html><html><body>
    <main><div class="xs ABCDE12345 hero"><p>Hi</p></div></main>
  </body></html>`;
  const { internals, document } = loadVellum(t, html);
  const p = document.querySelector("p");
  assert.equal(internals.Selector.pathOf(p), "main > .hero > p");
});

test("pathOf skips html and body", (t) => {
  const html = `<!doctype html><html><body><p>Hi</p></body></html>`;
  const { internals, document } = loadVellum(t, html);
  const p = document.querySelector("p");
  assert.equal(internals.Selector.pathOf(p), "p");
});

test("pathOf appends nth-of-type when sibling tag is duplicated", (t) => {
  const html = `<!doctype html><html><body>
    <main><p>One</p><p>Two</p><p>Three</p></main>
  </body></html>`;
  const { internals, document } = loadVellum(t, html);
  const ps = document.querySelectorAll("p");
  assert.equal(internals.Selector.pathOf(ps[0]), "main > p:nth-of-type(1)");
  assert.equal(internals.Selector.pathOf(ps[1]), "main > p:nth-of-type(2)");
  assert.equal(internals.Selector.pathOf(ps[2]), "main > p:nth-of-type(3)");
});

test("pathOf round-trips: querySelector(pathOf(el)) === el", (t) => {
  const html = `<!doctype html><html><body>
    <main id="root">
      <section class="hero"><h1>Title</h1><p>One</p><p>Two</p></section>
      <article><p>A</p><p>B</p></article>
    </main>
  </body></html>`;
  const { internals, document } = loadVellum(t, html);
  for (const el of document.querySelectorAll("h1, p")) {
    const path = internals.Selector.pathOf(el);
    assert.equal(document.querySelector(path), el, `path "${path}" should resolve back to its element`);
  }
});

test("nameOf produces tag-aware human-readable names", (t) => {
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
  const { internals, document } = loadVellum(t, html);
  assert.equal(internals.Selector.nameOf(document.querySelector("h1")), 'h1 "Welcome to our site"');
  assert.match(internals.Selector.nameOf(document.querySelector("p")), /^paragraph: "Lorem ipsum dolor sit amet/);
  assert.equal(internals.Selector.nameOf(document.querySelector("button")), 'button "Sign up"');
  assert.equal(internals.Selector.nameOf(document.querySelector("a")), 'link "Read more"');
  assert.equal(internals.Selector.nameOf(document.querySelector("li")), 'list item: "First entry"');
  assert.equal(internals.Selector.nameOf(document.querySelector("code")), 'code: `npm install`');
  assert.equal(internals.Selector.nameOf(document.querySelector("span")), '"label"');
});

test("Snapshot.capture stores original only on first call per path", (t) => {
  const { internals } = loadVellum(t);
  const Snapshot = internals.Snapshot;
  Snapshot.capture("main > h1", "Original");
  Snapshot.capture("main > h1", "Modified");      // should be ignored
  assert.equal(Snapshot.get("main > h1"), "Original");
});

test("Snapshot.capture stores independent values per path", (t) => {
  const { internals } = loadVellum(t);
  const Snapshot = internals.Snapshot;
  Snapshot.capture("a", "one");
  Snapshot.capture("b", "two");
  assert.equal(Snapshot.get("a"), "one");
  assert.equal(Snapshot.get("b"), "two");
});

test("Snapshot.all returns one entry per captured path", (t) => {
  const { internals } = loadVellum(t);
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

test("Snapshot.clear empties the store", (t) => {
  const { internals } = loadVellum(t);
  const Snapshot = internals.Snapshot;
  Snapshot.capture("a", "one");
  Snapshot.clear();
  assert.equal(Snapshot.get("a"), undefined);
  assert.equal(Snapshot.all().length, 0);
});

test("Snapshot.hydrate replaces all entries from a serialized object", (t) => {
  const { internals } = loadVellum(t);
  const Snapshot = internals.Snapshot;
  Snapshot.capture("a", "one");
  Snapshot.hydrate({ b: "two", c: "three" });
  assert.equal(Snapshot.get("a"), undefined);
  assert.equal(Snapshot.get("b"), "two");
  assert.equal(Snapshot.get("c"), "three");
});

test("Output.markdown returns empty string for zero edits", (t) => {
  const { internals } = loadVellum(t);
  assert.equal(internals.Output.markdown([], { url: "x", pathname: "/x", viewport: "1x1" }), "");
});

test("Output.markdown formats a single edit", (t) => {
  const { internals } = loadVellum(t);
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

test("Output.markdown handles multiple edits with separate sections", (t) => {
  const { internals } = loadVellum(t);
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

test("Output.markdown emits Status for removed elements", (t) => {
  const { internals } = loadVellum(t);
  const out = internals.Output.markdown(
    [{ path: "main > h1", name: "(removed)", before: "Gone", after: null, removed: true }],
    { url: "u", pathname: "/", viewport: "1x1" }
  );
  assert.match(out, /\*\*Status:\*\* element no longer present/);
  assert.doesNotMatch(out, /\*\*Location:\*\*/);
  assert.match(out, /\*\*Before:\*\*\nGone/);
});

test("Output.markdown preserves multi-line before/after verbatim", (t) => {
  const { internals } = loadVellum(t);
  const before = "Line 1\nLine 2\nLine 3";
  const after = "New 1\n\nNew 3";
  const out = internals.Output.markdown(
    [{ path: "p", name: "paragraph", before, after, removed: false }],
    { url: "u", pathname: "/", viewport: "1x1" }
  );
  assert.match(out, /\*\*Before:\*\*\nLine 1\nLine 2\nLine 3/);
  assert.match(out, /\*\*After:\*\*\nNew 1\n\nNew 3/);
});

test("Output.json produces stable shape", (t) => {
  const { internals } = loadVellum(t);
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
