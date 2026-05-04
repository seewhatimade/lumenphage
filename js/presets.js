import { LevelStore } from "./level-store.js";
import { Levels } from "./levels.js";
import { World } from "./world.js";

// Presets — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   PROCEDURAL — random + preset configurations
// ============================================================
//
// A Preset is a description of how to assemble a world. The Random Game
// button picks one at random; the Custom Game screen lets the user pick
// from a curated list.

export const Presets = {
  // Preset roster lives in LevelStore.presets, populated from
  // levels/presets/manifest.json at boot. Each entry exposes a
  // build() that re-applies the saved level data via
  // Editor.deserialize() (or dispatches to a procedural builder).
  get list() { return LevelStore.presets; },


  random(spec) {
    // If `spec` is given, rebuild that exact roll; otherwise roll a fresh
    // (kind, seed). Returns the spec used so callers can replay it later.
    if (!spec) {
      const r = Math.random();
      const kind = r < 0.4 ? "sparse" : r < 0.7 ? "packed" : "gravity";
      spec = { kind, seed: Date.now() };
    }
    if      (spec.kind === "sparse")  Levels.sparse(spec.seed);
    else if (spec.kind === "packed")  Levels.packed(spec.seed);
    else                              Levels.gravity(spec.seed);
    World.levelName = "Random — " + World.levelName;
    return spec;
  },

};
