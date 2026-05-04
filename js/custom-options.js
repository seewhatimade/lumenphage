import { Circle } from "./circle.js";
import { KIND_META, LEVEL_TYPES, TAU } from "./core.js";
import { World } from "./world.js";

// CustomOptions — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   CUSTOM OPTIONS — full configurable game builder
// ============================================================

export const CustomOptions = {
  // Persisted to localStorage so a user's last config is remembered
  storageKey: "lumenphage.customOpts.v1",

  // Default config
  defaults: {
    type: "sparse",
    boxW: 2400, boxH: 1700,
    playerSize: 22,
    sizeMin: 5, sizeMax: 40,
    counts: {
      neutral:       { min: 25, max: 40 },
      hunter:        { min: 0,  max: 0 },
      avoider:       { min: 0,  max: 0 },
      predator:      { min: 0,  max: 0 },
      pup:           { min: 0,  max: 0 },
      anti:          { min: 0,  max: 0 },
      splitter:      { min: 0,  max: 0 },
      magnet:        { min: 0,  max: 0 },
      repeller:      { min: 0,  max: 0 },
      glutton:       { min: 0,  max: 0 },
      pulsar:        { min: 0,  max: 0 },
      singchild:     { min: 0,  max: 0 },
      attractPickup: { min: 0,  max: 0 },
      repelPickup:   { min: 0,  max: 0 }
    },
    wells: 0,
    wellStrength: 2_000_000,
    randomDrift: false,
    victory: "absorb_all",
    surviveTime: 60,
    music: "calm"
  },

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const stored = raw ? JSON.parse(raw) : {};
      return this._mergeWithDefaults(stored);
    } catch { return JSON.parse(JSON.stringify(this.defaults)); }
  },
  save(cfg) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(cfg)); } catch {}
  },
  _mergeWithDefaults(stored) {
    const cfg = JSON.parse(JSON.stringify(this.defaults));
    Object.assign(cfg, stored || {});
    cfg.counts = { ...cfg.counts };
    // Cover every kind in KIND_META, not just defaults — that way a newly
    // added kind gets a {0,0} entry instead of crashing the form.
    const allKinds = new Set([...Object.keys(this.defaults.counts), ...Object.keys(KIND_META)]);
    for (const k of allKinds) {
      const def = this.defaults.counts[k] || { min: 0, max: 0 };
      cfg.counts[k] = { ...def, ...((stored && stored.counts && stored.counts[k]) || {}) };
    }
    return cfg;
  },

  // Named presets — separate storage so the user can keep multiple configs.
  presetsKey: "lumenphage.customOpts.presets.v1",
  loadPresets() {
    try {
      const raw = localStorage.getItem(this.presetsKey);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },
  savePresets(arr) {
    try { localStorage.setItem(this.presetsKey, JSON.stringify(arr)); } catch {}
  },
  savePresetByName(name, cfg) {
    const all = this.loadPresets();
    const idx = all.findIndex(p => p.name === name);
    const entry = { name, cfg: JSON.parse(JSON.stringify(cfg)) };
    if (idx >= 0) all[idx] = entry; else all.push(entry);
    this.savePresets(all);
  },
  deletePresetByName(name) {
    this.savePresets(this.loadPresets().filter(p => p.name !== name));
  },

  // Build a world from a configuration. Distributes circles uniformly inside
  // the bounds, skipping a clear bubble around the player spawn.
  build(cfg) {
    World.reset();
    World.type = cfg.type;
    World.bounds = { x: 0, y: 0, w: cfg.boxW, h: cfg.boxH };
    World.victoryCondition = cfg.victory;
    World.victoryParam = cfg.surviveTime;

    const cx = cfg.boxW / 2, cy = cfg.boxH / 2;
    const rint = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
    const placeNear = (radius) => {
      // Try several positions, pick one not overlapping existing circles too much.
      for (let t = 0; t < 40; t++) {
        const x = 60 + Math.random() * (cfg.boxW - 120);
        const y = 60 + Math.random() * (cfg.boxH - 120);
        if (Math.hypot(x - cx, y - cy) < radius + 60) continue;
        let ok = true;
        for (const c of World.circles) {
          if (Math.hypot(c.x - x, c.y - y) < c.r + radius + 4) { ok = false; break; }
        }
        if (ok) return { x, y };
      }
      return { x: 60 + Math.random() * (cfg.boxW - 120),
               y: 60 + Math.random() * (cfg.boxH - 120) };
    };

    // Player at center
    World.player = World.spawn(new Circle(cx, cy, cfg.playerSize, { kind:"player", hue:180 }));

    // Gravity wells (only meaningful for type=gravity, but allowed in others too)
    if (cfg.wells > 0) {
      if (cfg.wells === 1) {
        World.gravityCenters.push({ x: cx, y: cy, strength: cfg.wellStrength });
      } else {
        for (let i = 0; i < cfg.wells; i++) {
          const ang = (i / cfg.wells) * TAU;
          const dist = Math.min(cfg.boxW, cfg.boxH) * 0.28;
          World.gravityCenters.push({ x: cx + Math.cos(ang) * dist,
                                       y: cy + Math.sin(ang) * dist,
                                       strength: cfg.wellStrength });
        }
      }
    }

    // Each kind: pick a count from [min, max] uniformly, then spawn that many.
    for (const [kind, range] of Object.entries(cfg.counts)) {
      const n = rint(Math.max(0, range.min), Math.max(range.min, range.max));
      for (let i = 0; i < n; i++) {
        const r = cfg.sizeMin + Math.random() * (cfg.sizeMax - cfg.sizeMin);
        const meta = KIND_META[kind];
        const pos = placeNear(r);
        const opts = { kind, hue: meta ? meta.hue : 220 };
        if (cfg.randomDrift) {
          const a = Math.random() * TAU;
          const v = 20 + Math.random() * 50;
          opts.vx = Math.cos(a) * v; opts.vy = Math.sin(a) * v;
        }
        // For gravity-type levels, give them a tangential orbital seed instead
        if (cfg.type === LEVEL_TYPES.GRAVITY && cfg.wells > 0 && !cfg.randomDrift) {
          // orbit the nearest well
          let nearest = World.gravityCenters[0];
          let nd = Infinity;
          for (const w of World.gravityCenters) {
            const d = Math.hypot(w.x - pos.x, w.y - pos.y);
            if (d < nd) { nd = d; nearest = w; }
          }
          const dx = pos.x - nearest.x, dy = pos.y - nearest.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 60) {
            const v = Math.sqrt(nearest.strength / dist);
            opts.vx = -dy / dist * v;
            opts.vy =  dx / dist * v;
          }
        }
        World.spawn(new Circle(pos.x, pos.y, r, opts));
      }
    }

    World.levelName = "Custom (options)";
  }
};
