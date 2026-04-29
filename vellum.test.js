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
