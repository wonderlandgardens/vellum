const SRC = "https://cdn.jsdelivr.net/gh/wonderlandgardens/vellum@main/vellum.js";

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
