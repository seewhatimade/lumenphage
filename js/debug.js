import { Campaign } from "./main.js";

// Debug — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

export const Debug = {
  storageKey: "lumenphage.debug.v1",
  defaults: { showKindLabels: false, showSizeLabels: false, showMassLabels: false, showTrajectories: false, ghostMode: false, showMusicName: false, unlimitedPickups: false, showGravityWarp: false, gravityWarpScale: 1.0 },

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? Object.assign({}, this.defaults, JSON.parse(raw)) : { ...this.defaults };
    } catch { return { ...this.defaults }; }
  },
  save(s) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(s)); } catch {}
  },
  // Cached active settings, refreshed by the menu when toggled.
  active: null,
  get(key) {
    if (!this.active) this.active = this.load();
    // Debug toggles only take effect while Dev mode is on. The stored
    // values are preserved so re-enabling Dev mode restores the user's
    // previous selections instead of unchecking them.
    if (!Campaign.devModeEnabled()) return this.defaults[key];
    return this.active[key];
  },
  set(key, val) {
    if (!this.active) this.active = this.load();
    this.active[key] = val;
    this.save(this.active);
  }
};
