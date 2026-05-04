// Core constants + math helpers shared by every other module. Loaded
// FIRST among the extracted scripts so any module whose top-level
// references these (e.g. `World = { type: LEVEL_TYPES.SPARSE, … }` in
// world.js or `..._ACTIVE_THRUST` in kind-builtins.js) can resolve
// the names at parse time. Classic scripts share one Script Record
// per document, so these `const` bindings are visible to every later
// script (extracted or inline) at runtime too.

export const TAU = Math.PI * 2;
export const massToRadius = m => Math.sqrt(Math.max(m, 0) / Math.PI);
export const radiusToMass = r => Math.PI * r * r;

// Smallest mote we ever spawn or keep alive. Below this, motes get
// absorbed outright instead of lingering as sub-pixel debris. Pure-
// fraction ejection can't drop below this either — too small a body
// simply can't propel.
export const MIN_MOTE_MASS = 1.5;

// Default thrust knob shared by every active-AI built-in (predator,
// hunter, avoider, pup). Spread into each one's movement.active
// block; tuning here changes everyone in lockstep.
export const _ACTIVE_THRUST = { thrustFraction: 0.005, thrustSpeed: 450, cooldown: 0.05 };

// Merged kind registry view. Rebuilt by `Kinds._rebuildKindMeta()` at
// startup, after every user-kind mutation, and when a level loads
// kinds with precedence. Every call site reads `KIND_META[c.kind]`.
export const KIND_META = {};

export const LEVEL_TYPES = {
  GRAVITY: "gravity",
  PACKED:  "packed",
  SPARSE:  "sparse",
};

export const VICTORY_CONDITIONS = {
  ABSORB_ALL:     "absorb_all",
  BECOME_LARGEST: "become_largest",
  SURVIVE:        "survive",
  PACIFY:         "pacify",
};

// Seedable RNG (mulberry32). Deterministic; used by procedural level
// builders, AI jitter, etc. Game-side seeds come from World._seed
// which World.reset() initialises from a Date.now() default or a
// pending test seed.
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
