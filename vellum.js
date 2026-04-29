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

    // Only the four pure modules are exposed for unit testing; Scanner and
    // Toolbar have DOM side effects and are smoke-tested via index.html.
    if (globalThis.__VELLUM_TEST__ || (typeof window !== "undefined" && window.__VELLUM_TEST__)) {
      globalThis.__vellumInternals = { Selector, Snapshot, Storage, Output };
    }
  }
})();
