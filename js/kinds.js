import { KIND_META } from "./core.js";
import { KIND_BUILTINS } from "./kind-builtins.js";
import { toast } from "./main.js";

// Kinds — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// User-authored kinds: storage, registry merge, import/export, level embedding.
// Phase 1 keeps user kinds drift-only (no AI rules yet). The schema fields
// reserved here (movement, contact, abilities, tests) are populated in later
// phases — saved files from this phase will migrate forward via schemaVersion.
export const Kinds = {
  storageKey:    "lumenphage.kinds.v1",
  capStorageKey: "lumenphage.kindCap.v1",
  defaultCap:    30,
  _userKinds:    [],

  init() {
    this._userKinds = this._readUserKinds();
    this._rebuildKindMeta();
  },

  _readUserKinds() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  },
  _writeUserKinds() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this._userKinds)); }
    catch { toast("Save failed"); }
  },

  // Rebuild KIND_META in-place so existing references stay live. Built-ins
  // first, then user kinds shimmed into the same shape.
  _rebuildKindMeta() {
    for (const k of Object.keys(KIND_META)) delete KIND_META[k];
    // Built-ins go through the same shape function as user kinds — single
    // source of truth for behavior / fieldStrength / hasMind derivation.
    for (const id of Object.keys(KIND_BUILTINS)) {
      KIND_META[id] = this._kindMetaShape(KIND_BUILTINS[id], true);
    }
    for (const k of this._userKinds) {
      KIND_META[k.id] = this._kindMetaShape(k, false);
    }
  },

  // Unified meta shape for both built-ins and user kinds. Reads movement
  // and abilities off the source `k`; derives behavior / fieldStrength
  // / hasMind. The runtime reads .movement / .abilities via meta._data
  // (consistent regardless of source).
  _kindMetaShape(k, isBuiltin) {
    const mvType = k.movement && k.movement.type;
    const preset = (k.movement && k.movement.active && k.movement.active.preset) || "drift";
    const isField  = mvType === "field";
    const isActive = mvType === "active" && preset !== "drift";
    const fieldStrength = isField
      ? (k.movement.field && k.movement.field.strength) || 0
      : undefined;
    return {
      id: k.id,
      schemaVersion: k.schemaVersion || 1,
      builtin: isBuiltin,
      label: k.label || k.name || "Unnamed kind",
      hue: typeof k.hue === "number" ? k.hue : 220,
      desc: k.desc || k.description || "",
      behavior: isField ? "field" : isActive ? "active" : "passive",
      fieldStrength,
      hasMind: k.hasMind !== undefined ? !!k.hasMind : isActive,
      // _data is the shared accessor for movement / abilities / rules.
      // _user retains its previous semantics — only set for user kinds —
      // so existing call sites that branch on user-vs-builtin don't change.
      _data: k,
      _user: isBuiltin ? undefined : k
    };
  },
  _userKindToMeta(k) { return this._kindMetaShape(k, false); },   // legacy alias

  newId() {
    return "k_" + Math.random().toString(36).slice(2, 8) +
                  Math.random().toString(36).slice(2, 6);
  },

  byId(id)        { return KIND_META[id] || null; },
  isBuiltin(id)   { return !!KIND_BUILTINS[id]; },
  userKinds()     { return this._userKinds.slice(); },
  builtinKinds()  { return Object.values(KIND_BUILTINS); },

  add(kind) {
    if (!kind.id) kind.id = this.newId();
    if (!kind.schemaVersion) kind.schemaVersion = 1;
    this._userKinds.push(kind);
    this._writeUserKinds();
    this._rebuildKindMeta();
    this.checkCap();
    return kind;
  },

  update(id, patch) {
    const idx = this._userKinds.findIndex(k => k.id === id);
    if (idx < 0) return false;
    this._userKinds[idx] = { ...this._userKinds[idx], ...patch, id };
    this._writeUserKinds();
    this._rebuildKindMeta();
    return true;
  },

  delete(id) {
    const before = this._userKinds.length;
    this._userKinds = this._userKinds.filter(k => k.id !== id);
    if (this._userKinds.length === before) return false;
    this._writeUserKinds();
    this._rebuildKindMeta();
    return true;
  },

  // Duplicate a user kind, or fork a built-in into an editable user kind.
  // For built-ins we map to the closest Phase 2 preset so the fork actually
  // does something resembling the source — Hunter→hunt, Avoider→flee, etc.
  duplicate(id) {
    const orig = this._userKinds.find(k => k.id === id);
    const builtin = KIND_BUILTINS[id];
    let copy;
    if (orig) copy = JSON.parse(JSON.stringify(orig));
    else if (builtin) copy = this._builtinAsUserShape(builtin);
    else return null;
    copy.id   = this.newId();
    copy.name = (copy.name || "Kind") + " (copy)";
    delete copy.builtin;
    delete copy.native;
    this._userKinds.push(copy);
    this._writeUserKinds();
    this._rebuildKindMeta();
    this.checkCap();
    return copy;
  },

  // Built-in → user-kind shape (Phase 6 migration). The runtime keeps
  // hard-coded aiThink branches for built-ins, but forking now produces
  // a faithful rule/ability/field replica so users can see how each
  // built-in's behaviour decomposes — and edit a fork as their starting
  // point. Approximations are noted inline; full fidelity requires
  // engine extensions we haven't shipped (e.g. avoider's vector-summed
  // danger field becomes "flee score-danger target" here).
  _builtinAsUserShape(b) {
    const id = b.id;
    const base = {
      schemaVersion: 6,
      name:        b.label,
      description: b.desc,
      hue:         b.hue,
      hasMind:     !!b.hasMind,
      movement:    { type: "drift" }
    };
    const thrust = { thrustFraction: 0.005, thrustSpeed: 450, cooldown: 0.05 };
    const customWith = (rules) => ({
      type: "active", active: { preset: "custom", ...thrust, rules }
    });
    if (id === "hunter") {
      base.movement = customWith([{
        priority: 10, when: { type: "always" },
        who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "score-hunter" },
        what: { type: "approach" }
      }]);
    } else if (id === "avoider") {
      // Engine sums a danger vector across every nearby larger circle;
      // the rule grammar picks one target, so we flee the highest-
      // scoring threat instead. Visually similar in most scenarios.
      base.movement = customWith([{
        priority: 50, when: { type: "always" },
        who: { filter: { kind: "any", mass: "larger", distance: "within", distanceValue: 280 }, pick: "score-danger" },
        what: { type: "flee" }
      }]);
    } else if (id === "predator") {
      // Two-stage brain: flee danger first, otherwise hunt. The engine
      // also has a player-bonus utility multiplier when bigger; we
      // approximate with a dedicated kind=player rule at higher priority
      // so the fork commits hard to the player whenever it can eat them.
      base.movement = customWith([
        { priority: 50, when: { type: "always" },
          who: { filter: { kind: "any", mass: "larger", distance: "within", distanceValue: 280 }, pick: "score-danger" },
          what: { type: "flee" } },
        { priority: 30, when: { type: "always" },
          who: { filter: { kind: "player", mass: "smaller", distance: "any" }, pick: "closest" },
          what: { type: "approach" } },
        { priority: 10, when: { type: "always" },
          who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "score-hunter" },
          what: { type: "approach" } }
      ]);
    } else if (id === "pup") {
      // Like predator but prefers the smallest prey for safe growth.
      base.movement = customWith([
        { priority: 50, when: { type: "always" },
          who: { filter: { kind: "any", mass: "larger", distance: "within", distanceValue: 320 }, pick: "score-danger" },
          what: { type: "flee" } },
        { priority: 10, when: { type: "always" },
          who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "smallest" },
          what: { type: "approach" } }
      ]);
    } else if (id === "glutton") {
      base.movement = { type: "drift" };
      base.abilities = [{
        enabled: true,
        trigger: { type: "continuous" },
        effect:  { type: "drain-field", reachMul: 2.6, rate: 40 }
      }];
    } else if (id === "pulsar") {
      base.movement = { type: "drift" };
      base.abilities = [{
        enabled: true,
        trigger: { type: "every", interval: 3.0, jitter: 0.5 },
        effect:  { type: "pulse", range: 280, strength: 240 }
      }];
    } else if (id === "splitter") {
      base.movement = { type: "drift" };
      base.abilities = [{
        enabled: true,
        trigger: { type: "on-touched-by-bigger" },
        effect:  { type: "split", count: 5 }
      }];
    } else if (id === "magnet") {
      base.movement = { type: "field", field: { strength: 220000 } };
    } else if (id === "repeller") {
      base.movement = { type: "field", field: { strength: -300000 } };
    } else if (id === "singchild") {
      base.movement = { type: "field", field: { strength: 900000 } };
    }
    // Anti and neutral fall through to drift — annihilation contact is
    // still engine-baked (no `annihilate` effect yet). Pickups copy
    // their pickup config so forking gives a working clone.
    if (b.pickup) base.pickup = JSON.parse(JSON.stringify(b.pickup));
    return base;
  },

  exportSingle(id) {
    const k = this._userKinds.find(k => k.id === id);
    if (!k) return null;
    return {
      format:       "lumenphage-kind/v1",
      schemaVersion: 1,
      exportedAt:    new Date().toISOString(),
      kind:          JSON.parse(JSON.stringify(k))
    };
  },

  importSingle(payload) {
    if (!payload || typeof payload !== "object") throw new Error("Not a kind file");
    const kind = payload.kind || payload;
    if (!kind || typeof kind !== "object" || !kind.name) throw new Error("Missing kind data");
    const clean = JSON.parse(JSON.stringify(kind));
    if (!clean.id) clean.id = this.newId();
    if (!clean.schemaVersion) clean.schemaVersion = 1;
    // Avoid id collisions with built-ins or existing user kinds — issue a
    // fresh id rather than silently overwriting.
    if (this._userKinds.some(k => k.id === clean.id) || KIND_BUILTINS[clean.id]) {
      clean.id = this.newId();
    }
    delete clean.builtin;
    delete clean.native;
    this._userKinds.push(clean);
    this._writeUserKinds();
    this._rebuildKindMeta();
    this.checkCap();
    return clean;
  },

  // Soft cap — no hard limit, just nudges the user when their library grows.
  getCap() {
    try {
      const raw = localStorage.getItem(this.capStorageKey);
      const n = raw ? parseInt(raw, 10) : NaN;
      return isFinite(n) && n > 0 ? n : this.defaultCap;
    } catch { return this.defaultCap; }
  },
  setCap(n) {
    const v = Math.max(1, parseInt(n, 10) || this.defaultCap);
    try { localStorage.setItem(this.capStorageKey, String(v)); } catch {}
    return v;
  },
  checkCap() {
    const cap = this.getCap();
    if (this._userKinds.length >= cap) {
      toast(`Custom kinds: ${this._userKinds.length} / soft cap ${cap} — performance may degrade with many kinds.`);
    }
  },

  // Collect every user-kind def referenced by the given circles, for
  // embedding in a level export. Built-ins are not embedded — they live in
  // the engine and are always available.
  collectUsedKinds(circleArr) {
    const ids = new Set();
    for (const c of circleArr) ids.add(c.kind);
    const out = [];
    for (const id of ids) {
      const k = this._userKinds.find(uk => uk.id === id);
      if (k) out.push(JSON.parse(JSON.stringify(k)));
    }
    return out;
  },

  // Apply level-embedded kinds with precedence over the registry: a kind
  // defined inside a level wins over a same-id kind in the user library
  // for the duration of that level's play. We rebuild from scratch first so
  // the previous level's overrides don't leak into the next one.
  applyLevelOverrides(arr) {
    this._rebuildKindMeta();
    if (!Array.isArray(arr)) return;
    for (const k of arr) {
      if (!k || typeof k !== "object" || !k.id) continue;
      KIND_META[k.id] = this._userKindToMeta(k);
    }
  }
};
