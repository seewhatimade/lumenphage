import { Editor } from "./editor.js";
import { Levels } from "./levels.js";
import { World } from "./world.js";

// LevelStore — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   CAMPAIGN — 30 levels organised as a branching tree
// ============================================================
//
// Branch shape:
//
//   1 → 2 → 3 → 4 → 5 ──┬─→ 6 → 7 → 8 → 9 → 10 ──┐
//                       │                          ↓
//                       └─→ 11→12→13→14→15 ──→ 16 → 17 → 18 → 19 → 20 ──┬─→ 21→22→23→24→25
//                                                                       └─→ 26→27→28→29→30

// LevelStore: loads campaign + preset definitions from disk-side JSON
// files (see `levels/<dir>/manifest.json` + `levels/<dir>/<file>.json`).
// Each entry exposes a `.build()` method that re-applies the saved
// level data via Editor.deserialize(), or for procedural builders
// (Levels.sparse / .packed / .gravity), invokes the named builder
// with its committed seed. Loaded once at boot — see the boot block
// at the bottom of this script.
export const LevelStore = {
  campaignManifestUrl: "./levels/campaign/manifest.json",
  presetsManifestUrl:  "./levels/presets/manifest.json",
  campaign: [],   // populated by load()
  presets:  [],   // populated by load()

  async load() {
    try {
      // Production single-file build embeds every manifest + level
      // JSON into <script type="application/json" id="lumenphage-levels">
      // — read from there if present, so the page works from file://
      // and the network round-trips disappear.
      const inline = this._readInlineBundle();
      const [cm, pm] = inline
        ? [inline.campaign["manifest.json"], inline.presets["manifest.json"]]
        : await Promise.all([
            this._fetchJSON(this.campaignManifestUrl),
            this._fetchJSON(this.presetsManifestUrl),
          ]);
      this.campaign = await Promise.all((cm.levels || []).map(e => this._hydrate(e, "campaign", inline)));
      this.presets  = await Promise.all((pm.presets || []).map(e => this._hydrate(e, "presets", inline)));
    } catch (err) {
      console.error("LevelStore.load failed:", err);
      this.campaign = []; this.presets = [];
    }
  },
  _readInlineBundle() {
    if (typeof document === "undefined") return null;
    const el = document.getElementById("lumenphage-levels");
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch { return null; }
  },
  async _fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  },
  async _hydrate(entry, dir, inline) {
    const out = { ...entry };
    if (entry.file) {
      out.data = inline
        ? inline[dir][entry.file]
        : await this._fetchJSON(`./levels/${dir}/${entry.file}`);
    }
    // Attach a build() method so existing call sites keep working.
    out.build = () => LevelStore.apply(out);
    return out;
  },
  // Apply a level entry to the runtime: deserialize JSON if present,
  // else dispatch to the named procedural builder. After the body
  // runs, optional `victoryOverride` re-stamps the win condition (so
  // e.g. The Wall can run packed(20) and then become a survive
  // level), and `name` is copied to World.levelName.
  apply(entry) {
    if (entry.data) {
      Editor.deserialize(entry.data);
    } else if (entry.procedural) {
      const fn = Levels[entry.procedural.builder];
      if (typeof fn !== "function") {
        throw new Error(`unknown procedural builder ${entry.procedural.builder}`);
      }
      fn.call(Levels, entry.procedural.seed);
    } else {
      throw new Error(`level "${entry.name}" has neither data nor procedural`);
    }
    if (entry.victoryOverride) {
      const v = entry.victoryOverride;
      if (v.condition) World.victoryCondition = v.condition;
      if (typeof v.param === "number") World.victoryParam = v.param;
    }
    if (entry.name) World.levelName = entry.name;
  },
};
