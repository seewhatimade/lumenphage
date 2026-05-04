import { KIND_META } from "./core.js";
import { World } from "./world.js";

// SeenKinds — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   SEEN KINDS — first-encounter awareness for nameplate intros
// ============================================================
//
// Tracks which kinds the player has *seen* across all sessions. When a level
// is built, any unfamiliar kind in the world triggers a one-shot nameplate
// intro before play begins.

export const SeenKinds = {
  storageKey: "lumenphage.seenKinds.v1",
  cache: null,
  load() {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.cache = new Set(raw ? JSON.parse(raw) : []);
    } catch { this.cache = new Set(); }
    return this.cache;
  },
  save() {
    try { localStorage.setItem(this.storageKey, JSON.stringify([...this.load()])); } catch {}
  },
  has(kind) { return this.load().has(kind); },
  markSeen(kind) {
    const s = this.load();
    if (!s.has(kind)) { s.add(kind); this.save(); }
  },
  // Find every kind in the current world that the player hasn't seen yet.
  newKindsInWorld() {
    const s = this.load();
    const found = [];
    for (const c of World.circles) {
      if (!c.alive) continue;
      if (!KIND_META[c.kind]) continue;             // only "real" kinds
      if (s.has(c.kind)) continue;
      if (!found.includes(c.kind)) found.push(c.kind);
    }
    return found;
  }
};
