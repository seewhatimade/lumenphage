// highlightJSON — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   JSON EDITOR PANEL
// ============================================================
//
// Floating side-panel for the level designer. Mirrors `Editor.serialize()`
// in a syntax-highlighted code editor; the user can re-parse and apply
// edits via Update. Two badges signal de-sync:
//   - "edits"        — textarea text differs from the last sync.
//   - "level changed" — the level has changed since the last sync (so
//                       the textarea is showing stale JSON).
// "Last sync" is whichever of Refresh / Update last ran. Theme is two
// CSS variables (--json-fg, --json-bg); token colours stay fixed.

// Minimal JSON syntax highlighter. Single-pass regex: a string followed
// by ":" is a key; a bare string is a value; numbers and the literal
// keywords get their own classes. Whitespace and punctuation pass
// through unstyled, taking the panel's --json-fg.
export function highlightJSON(text) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, kw, num) => {
      if (str && colon) return `<span class="tok-key">${str}</span>${colon}`;
      if (str) return `<span class="tok-string">${str}</span>`;
      if (kw)  return `<span class="tok-kw">${kw}</span>`;
      if (num) return `<span class="tok-num">${num}</span>`;
      return m;
    }
  );
}
