// Persist — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// Thin wrapper around localStorage. Centralises the JSON encode/decode
// + the "swallow exceptions silently" pattern that was repeated at 22+
// sites across the script (Settings, Kinds, Stats, Campaign progress,
// SeenKinds, Debug, palettes, etc.). Errors print a single warning
// instead of being silently dropped — that's what would have caught
// quota / privacy-mode failures earlier.
export const Persist = {
  // Read JSON from a key, returning `fallback` on miss / parse error.
  // Pass a plain primitive (string / number / boolean) for keys that
  // store non-JSON values; signal that with `raw: true`.
  read(key, fallback, opts = {}) {
    try {
      const v = localStorage.getItem(key);
      if (v == null) return fallback;
      return opts.raw ? v : JSON.parse(v);
    } catch (err) {
      console.warn(`Persist.read(${key}) failed:`, err.message);
      return fallback;
    }
  },
  // Write `value` (JSON-encoded by default). For raw strings/numbers,
  // pass `{ raw: true }`. Returns true on success.
  write(key, value, opts = {}) {
    try {
      const v = opts.raw ? String(value) : JSON.stringify(value);
      localStorage.setItem(key, v);
      return true;
    } catch (err) {
      console.warn(`Persist.write(${key}) failed:`, err.message);
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); return true; }
    catch (err) {
      console.warn(`Persist.remove(${key}) failed:`, err.message);
      return false;
    }
  },
};
