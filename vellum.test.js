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
  dom.window.eval(code);

  const internals = dom.window.__vellumInternals;
  // Node 22 deepStrictEqual checks prototype identity across realms.
  // Wrap Snapshot.all to deserialize through JSON so returned objects
  // live in the host realm and pass strict equality checks.
  if (internals?.Snapshot?.all) {
    const _all = internals.Snapshot.all.bind(internals.Snapshot);
    internals.Snapshot.all = () => JSON.parse(JSON.stringify(_all()));
  }

  return {
    dom,
    window: dom.window,
    document: dom.window.document,
    internals,
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
