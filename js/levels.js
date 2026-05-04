import { Circle } from "./circle.js";
import { KIND_META, LEVEL_TYPES, TAU, mulberry32 } from "./core.js";
import { World } from "./world.js";

// Levels — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   LEVEL GENERATORS
// ============================================================

export const Levels = {
  // ----- "Sparse box" — scattered circles, some large, some small ----
  sparse(seed = 1) {
    World.reset();
    World.type = LEVEL_TYPES.SPARSE;
    World.bounds = { x: 0, y: 0, w: 2400, h: 1600 };
    const rand = mulberry32(seed * 1009 + 7);

    const px = World.bounds.w / 2, py = World.bounds.h / 2;
    World.player = World.spawn(new Circle(px, py, 22, { kind: "player", hue: 180 }));

    // Mostly small prey so the player has plenty to grow on, with a handful of
    // peers and a few apex predators for stakes.
    const tiers = [
      { weight: 0.62, rMin: 4,  rMax: 14, kindBias: 0.05 }, // small prey
      { weight: 0.22, rMin: 14, rMax: 21, kindBias: 0.10 }, // near-player
      { weight: 0.10, rMin: 24, rMax: 34, kindBias: 0.30 }, // larger
      { weight: 0.06, rMin: 36, rMax: 54, kindBias: 0.55 }, // apex
    ];
    const pickTier = () => {
      const roll = rand();
      let acc = 0;
      for (const t of tiers) { acc += t.weight; if (roll < acc) return t; }
      return tiers[tiers.length - 1];
    };

    const count = 70;
    for (let i = 0; i < count; i++) {
      const tier = pickTier();
      let x, y, r, tries = 0;
      do {
        x = 100 + rand() * (World.bounds.w - 200);
        y = 100 + rand() * (World.bounds.h - 200);
        r = tier.rMin + rand() * (tier.rMax - tier.rMin);
        tries++;
      } while (tries < 60 && (Math.hypot(x - px, y - py) < 180 || World.circles.some(c => Math.hypot(c.x - x, c.y - y) < c.r + r + 6)));
      const kind = rand() < tier.kindBias
        ? (rand() < 0.5 ? "hunter" : "avoider")
        : "neutral";
      World.spawn(new Circle(x, y, r, { kind, hue: 140 + rand() * 180 }));
    }
    World.levelName = "Drift — sparse";
  },

  // ----- "Packed" — tightly-filled grid, eat your way out ----
  packed(seed = 1) {
    World.reset();
    World.type = LEVEL_TYPES.PACKED;
    World.bounds = { x: 0, y: 0, w: 1800, h: 1200 };
    const rand = mulberry32(seed * 2027 + 11);

    const cellSize = 64;
    const cols = Math.floor((World.bounds.w - 80) / cellSize);
    const rows = Math.floor((World.bounds.h - 80) / cellSize);
    const offsetX = (World.bounds.w - cols * cellSize) / 2 + cellSize / 2;
    const offsetY = (World.bounds.h - rows * cellSize) / 2 + cellSize / 2;

    const playerCol = Math.floor(cols / 2);
    const playerRow = Math.floor(rows / 2);
    const playerR   = 20;

    // Tiered distribution: ~half are smaller than the player so there's always
    // food nearby, ~quarter are peers, ~quarter are bigger threats. Sizes fit
    // within their grid cell so neighbors don't overlap at spawn.
    const tiers = [
      { weight: 0.50, rMin: 6,  rMax: 17 },
      { weight: 0.28, rMin: 18, rMax: 24 },
      { weight: 0.16, rMin: 25, rMax: 28 },
      { weight: 0.06, rMin: 28, rMax: 30 }
    ];
    const pickTier = () => {
      const roll = rand();
      let acc = 0;
      for (const t of tiers) { acc += t.weight; if (roll < acc) return t; }
      return tiers[tiers.length - 1];
    };

    // Most cells are neutral, but a small fraction roll a non-neutral kind to
    // spice things up. Cells immediately around the player stay neutral so the
    // opening move is always safe.
    const exoticKinds = [
      { kind: "hunter",   weight: 0.30 },
      { kind: "avoider",  weight: 0.18 },
      { kind: "predator", weight: 0.10 },
      { kind: "pup",      weight: 0.10 },
      { kind: "splitter", weight: 0.12 },
      { kind: "anti",     weight: 0.08 },
      { kind: "magnet",   weight: 0.05 },
      { kind: "repeller", weight: 0.04 },
      { kind: "glutton",  weight: 0.03 }
    ];
    const exoticTotal = exoticKinds.reduce((s, e) => s + e.weight, 0);
    const pickExoticKind = () => {
      let roll = rand() * exoticTotal, acc = 0;
      for (const e of exoticKinds) { acc += e.weight; if (roll < acc) return e.kind; }
      return "neutral";
    };

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = offsetX + col * cellSize;
        const y = offsetY + row * cellSize;
        if (col === playerCol && row === playerRow) {
          World.player = World.spawn(new Circle(x, y, playerR, { kind: "player", hue: 180 }));
          continue;
        }
        const dCol = Math.abs(col - playerCol), dRow = Math.abs(row - playerRow);
        // Adjacent ring stays small + neutral so there's always prey to start.
        const adjacentRing = dCol + dRow === 1;
        const tier = adjacentRing ? tiers[0] : pickTier();
        const r = tier.rMin + rand() * (tier.rMax - tier.rMin);
        // Roll for a non-neutral kind (skipped for the safe ring around player).
        // ~12% chance of an exotic; bigger tiers slightly more likely to be one.
        const exoticChance = adjacentRing ? 0
          : (tier === tiers[0] ? 0.06 : tier === tiers[1] ? 0.14 : 0.22);
        const kind = rand() < exoticChance ? pickExoticKind() : "neutral";
        const hue = kind === "neutral" ? (200 + rand() * 80) : KIND_META[kind].hue;
        World.spawn(new Circle(x, y, r, { kind, hue }));
      }
    }
    World.levelName = "Hatch — packed cluster";
  },

  // ----- "Gravity" — central attractor with orbital rings ----
  gravity(seed = 1) {
    World.reset();
    World.type = LEVEL_TYPES.GRAVITY;
    World.bounds = { x: 0, y: 0, w: 3500, h: 3500 };
    const rand = mulberry32(seed * 3041 + 13);

    const cx = World.bounds.w / 2, cy = World.bounds.h / 2;
    // Strong enough that orbits are tight and visible. v_orbit = sqrt(G/r):
    // at r=700 → ~57 px/s, period ~77s.
    const G = 2_300_000;
    World.gravityCenters = [{ x: cx, y: cy, strength: G }];

    const orbitalSpeed = r => Math.sqrt(G / r);

    // Player starts in a mid orbit
    const pAng = rand() * TAU;
    const pR   = 700;
    const pv = orbitalSpeed(pR);
    World.player = World.spawn(new Circle(
      cx + Math.cos(pAng) * pR,
      cy + Math.sin(pAng) * pR,
      24,
      { kind: "player", hue: 180,
        vx: -Math.sin(pAng) * pv, vy: Math.cos(pAng) * pv }
    ));

    // Multiple concentric rings, all rotating the same way. Density ~ radius
    // so outer rings get more circles.
    const rings = [
      { r: 280,  count: 8,  sizeMin: 6,  sizeMax: 16 },
      { r: 420,  count: 11, sizeMin: 8,  sizeMax: 22 },
      { r: 560,  count: 14, sizeMin: 8,  sizeMax: 24 },
      { r: 720,  count: 17, sizeMin: 6,  sizeMax: 28 },
      { r: 880,  count: 20, sizeMin: 8,  sizeMax: 30 },
      { r: 1040, count: 24, sizeMin: 10, sizeMax: 36 },
      { r: 1220, count: 28, sizeMin: 10, sizeMax: 42 },
      { r: 1420, count: 32, sizeMin: 14, sizeMax: 48 }
    ];
    const playerR = pR;
    for (const ring of rings) {
      const v = orbitalSpeed(ring.r);
      // Skip the band right around the player so we don't spawn on top of them
      const skipPlayer = Math.abs(ring.r - playerR) < 60;
      for (let i = 0; i < ring.count; i++) {
        const ang = (i / ring.count) * TAU + rand() * 0.05;
        if (skipPlayer) {
          // angular distance from player
          const da = Math.abs(((ang - pAng + Math.PI * 3) % TAU) - Math.PI);
          if (da < 0.4) continue;
        }
        const sz = ring.sizeMin + rand() * (ring.sizeMax - ring.sizeMin);
        const kind = rand() < 0.12 ? (rand() < 0.5 ? "hunter" : "avoider") : "neutral";
        World.spawn(new Circle(
          cx + Math.cos(ang) * ring.r,
          cy + Math.sin(ang) * ring.r,
          sz,
          { kind, hue: 220 + rand() * 120,
            vx: -Math.sin(ang) * v, vy: Math.cos(ang) * v }
        ));
      }
    }

    // The central attractor itself: a visible bright body at the well.
    // It gets pulled toward itself by zero force, so it just sits.
    World.spawn(new Circle(cx, cy, 36, { kind: "neutral", hue: 30 }));

    World.levelName = "Whirlpool — gravity well";
  }
};
