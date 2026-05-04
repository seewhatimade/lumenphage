import { _ACTIVE_THRUST } from "./core.js";

// KIND_BUILTINS — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

export const KIND_BUILTINS = {
  neutral: {
    id: "neutral", schemaVersion: 1, builtin: true,
    label: "Neutral", hue: 220,
    desc: "Drifts. Color shifts toward red as it grows past your mass, blue when smaller.",
    movement: { type: "drift" }
  },
  hunter: {
    id: "hunter", schemaVersion: 1, builtin: true,
    label: "Hunter", hue: 30, hasMind: true,
    desc: "Chases the closest prey it can absorb. Doesn't flee from danger.",
    movement: { type: "active", active: { preset: "custom", ..._ACTIVE_THRUST, rules: [
      { priority: 10, when: { type: "always" },
        who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "score-hunter" },
        what: { type: "approach" } }
    ]}}
  },
  avoider: {
    id: "avoider", schemaVersion: 1, builtin: true,
    label: "Avoider", hue: 130, hasMind: true,
    desc: "Flees from anything bigger nearby. Doesn't pursue prey.",
    movement: { type: "active", active: { preset: "custom", ..._ACTIVE_THRUST, rules: [
      { priority: 50, when: { type: "always" },
        who: { filter: { kind: "any", mass: "larger", distance: "within", distanceValue: 280 }, pick: "score-danger" },
        what: { type: "flee" } }
    ]}}
  },
  predator: {
    id: "predator", schemaVersion: 1, builtin: true,
    label: "Predator", hue: 350, hasMind: true,
    desc: "Plans ahead — flees danger, hunts otherwise. Commits to the player once bigger.",
    movement: { type: "active", active: { preset: "custom", ..._ACTIVE_THRUST, rules: [
      { priority: 50, when: { type: "always" },
        who: { filter: { kind: "any", mass: "larger", distance: "within", distanceValue: 280 }, pick: "score-danger" },
        what: { type: "flee" } },
      { priority: 30, when: { type: "always" },
        who: { filter: { kind: "player", mass: "smaller", distance: "any" }, pick: "closest" },
        what: { type: "approach" } },
      { priority: 10, when: { type: "always" },
        who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "score-hunter" },
        what: { type: "approach" } }
    ]}}
  },
  pup: {
    id: "pup", schemaVersion: 1, builtin: true,
    label: "Predator pup", hue: 340, hasMind: true,
    desc: "Like a predator but picks the smallest prey for safe, steady growth.",
    movement: { type: "active", active: { preset: "custom", ..._ACTIVE_THRUST, rules: [
      { priority: 50, when: { type: "always" },
        who: { filter: { kind: "any", mass: "larger", distance: "within", distanceValue: 320 }, pick: "score-danger" },
        what: { type: "flee" } },
      { priority: 10, when: { type: "always" },
        who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "smallest" },
        what: { type: "approach" } }
    ]}}
  },
  anti: {
    id: "anti", schemaVersion: 1, builtin: true,
    label: "Anti-mote", hue: 290,
    desc: "Annihilates with motes on contact. Both shrink. Ignored by other anti-motes.",
    movement: { type: "drift" }
    // Annihilation is engine-baked in _processPair — no ability equivalent yet.
  },
  splitter: {
    id: "splitter", schemaVersion: 1, builtin: true,
    label: "Splitter", hue: 60,
    desc: "Bursts into 4–6 children when touched by something larger. Toucher gains nothing.",
    movement: { type: "drift" },
    abilities: [{
      enabled: true,
      trigger: { type: "on-touched-by-bigger" },
      // Children are neutrals (matching the original engine behaviour) —
      // not more splitters. Mass is conserved into the children.
      effect: { type: "split", count: 5, childKind: "neutral" }
    }]
  },
  magnet: {
    id: "magnet", schemaVersion: 1, builtin: true,
    label: "Magnet", hue: 200,
    desc: "Carries a small gravity well around itself — pulls every nearby circle inward.",
    movement: { type: "field", field: { strength: 220_000 } }
  },
  repeller: {
    id: "repeller", schemaVersion: 1, builtin: true,
    label: "Repeller", hue: 280,
    desc: "Inverse magnet: pushes every nearby circle gently away.",
    movement: { type: "field", field: { strength: -300_000 } }
  },
  glutton: {
    id: "glutton", schemaVersion: 1, builtin: true,
    label: "Glutton", hue: 35,
    desc: "Passively drains any smaller non-mote within reach. Slow but inexorable.",
    movement: { type: "drift" },
    abilities: [{
      enabled: true,
      trigger: { type: "continuous" },
      effect: { type: "drain-field", reachMul: 2.6, rate: 40 }
    }]
  },
  pulsar: {
    id: "pulsar", schemaVersion: 1, builtin: true,
    label: "Pulsar", hue: 50,
    desc: "Every few seconds emits an outward shockwave that kicks nearby circles.",
    movement: { type: "drift" },
    abilities: [{
      enabled: true,
      trigger: { type: "every", interval: 3.0, jitter: 0.5 },
      effect: { type: "pulse", range: 280, strength: 240 }
    }]
  },
  singchild: {
    id: "singchild", schemaVersion: 1, builtin: true,
    label: "Singularity child", hue: 270,
    desc: "Small body, big personal gravity well — slings everything around it like a comet.",
    movement: { type: "field", field: { strength: 900_000 } }
  },
  attractPickup: {
    id: "attractPickup", schemaVersion: 1, builtin: true,
    label: "Pickup: Attract", hue: 200,
    desc: "Touch to collect. Press the Use Pickup button to fire a brief attract burst around you.",
    movement: { type: "drift" },
    // Pickup collection: touch by player → enters inventory in the
    // "attract" slot. Activating fires the effect with the PLAYER as
    // the actor. The original engine's attract burst is a 360px pulse
    // with negative strength (force points inward toward the player).
    pickup: {
      enabled: true,
      slot: "attract",
      effect: { type: "pulse", range: 360, strength: -260 }
    }
  },
  repelPickup: {
    id: "repelPickup", schemaVersion: 1, builtin: true,
    label: "Pickup: Repel", hue: 0,
    desc: "Touch to collect. Press the Use Pickup button to fire a brief repel burst around you.",
    movement: { type: "drift" },
    pickup: {
      enabled: true,
      slot: "repel",
      effect: { type: "pulse", range: 360, strength: 260 }
    }
  }
};
