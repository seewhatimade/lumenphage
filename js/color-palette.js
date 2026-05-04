import { toast } from "./main.js";
import { World } from "./world.js";

// ColorPalette — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   COLOR PALETTES
// ============================================================
//
// Named (inside / outside / edge) trios. Built-ins ship hard-coded;
// user palettes round-trip through localStorage. The level designer
// exposes apply / save / delete; nothing else in the codebase reads
// from this — palettes mutate `World.{inside,outside,edge}Color` and
// then the design carries those colors via its own serializer.

export const ColorPalette = {
  // Lumenphage = light-eater. Each preset is a small abyss / glow
  // pairing: a near-black backdrop, a slightly lit playable interior,
  // and a luminous edge that reads as the creature's bioluminescent
  // halo. Ordered roughly cool → warm → exotic.
  BUILTINS: [
    { name: "Abyssal",        inside: "#0a1828", outside: "#040a14", edge: "#8cdcff" },
    { name: "Bioluminescent", inside: "#062028", outside: "#02060c", edge: "#5cf0d8" },
    { name: "Hadal Trench",   inside: "#0a1224", outside: "#000305", edge: "#a8c8ff" },
    { name: "Aurora",         inside: "#0a2418", outside: "#020a08", edge: "#7effb8" },
    { name: "Voidlight",      inside: "#10141c", outside: "#020306", edge: "#e0e8f0" },
    { name: "Anglerfish",     inside: "#080a14", outside: "#01030a", edge: "#fff8a0" },
    { name: "Hydrothermal",   inside: "#2a0e08", outside: "#0c0402", edge: "#ffa040" },
    { name: "Witchfire",      inside: "#140820", outside: "#06020c", edge: "#c870ff" },
    { name: "Phosphor Bloom", inside: "#1c0e2a", outside: "#0a020e", edge: "#ff66cc" },
    { name: "Neon Predator",  inside: "#0a0420", outside: "#020208", edge: "#ff2dac" },
  ],
  KEY: "lumenphage.palettes",

  loadUser() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(p => p && p.name) : [];
    } catch { return []; }
  },
  saveUser(arr) {
    try { localStorage.setItem(this.KEY, JSON.stringify(arr)); }
    catch { toast("Save failed"); }
  },

  // Push a palette's three colors onto World. Caller is responsible for
  // marking the editor dirty / re-rendering.
  apply(p) {
    World.insideColor  = p.inside;
    World.outsideColor = p.outside;
    World.edgeColor    = p.edge;
  },

  isBuiltin(name)   { return this.BUILTINS.some(p => p.name === name); },
  findBuiltin(name) { return this.BUILTINS.find(p => p.name === name); },
};
