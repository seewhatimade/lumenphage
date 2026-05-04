import { Audio_ } from "./audio.js";
import { Circle } from "./circle.js";
import { KIND_META, LEVEL_TYPES, MIN_MOTE_MASS, TAU, VICTORY_CONDITIONS, mulberry32 } from "./core.js";
import { Game } from "./game.js";
import { isPlayerGhost, toast } from "./main.js";
import { Player } from "./player.js";
import { Shape } from "./shape.js";

// World — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

export const World = {
  circles: [],
  player: null,
  type: LEVEL_TYPES.SPARSE,
  bounds: { x: 0, y: 0, w: 4000, h: 3000 },
  // Optional explicit playable shape (a list of Shape primitives). When
  // null the playable area is derived from `bounds` — every legacy level
  // and every procedural builder lives in this branch and stays a plain
  // rectangle without code changes. Set explicitly by the editor and by
  // designs that ship a `shape`. Always read via `activeShape()`.
  shape: null,
  _derivedShape: null,
  _derivedBoundsKey: "",
  gravityCenters: [],   // [{x, y, strength}, ...] — supports multi-well systems
  time: 0,
  cameraX: 0, cameraY: 0, cameraScale: 1,
  won: false, lost: false, endTime: 0,
  winReason: null,
  levelName: "",
  victoryCondition: VICTORY_CONDITIONS.ABSORB_ALL,
  victoryParam: 60,
  // Backdrop fills — playable-area interior vs everything outside it,
  // plus the boundary outline color. Editable per-design via the
  // level-designer toolbar; serialized with the level. Defaults preserve
  // the historical look.
  insideColor:  "#0a1828",
  outsideColor: "#040a14",
  edgeColor:    "#8cdcff",

  // Seedable RNG used at gameplay-critical sites (splitter spread, pulsar
  // period, mote spawn jitter). When a test case sets a seed via Game's
  // pending-seed handoff, World.reset() picks it up so a re-run reproduces
  // the same chaotic trajectory. Default seed is Date.now() so non-test
  // play stays unpredictable.
  _rng: null,
  _seed: 0,
  rand() { return this._rng(); },
  seed(s) {
    this._seed = (s >>> 0) || 1;
    this._rng = mulberry32(this._seed);
  },

  reset() {
    this.circles = []; this.player = null; this.gravityCenters = [];
    this.time = 0; this.won = false; this.lost = false; this.endTime = 0;
    this.winReason = null;
    this.cameraX = 0; this.cameraY = 0; this.cameraScale = 1;
    this.victoryCondition = VICTORY_CONDITIONS.ABSORB_ALL;
    this.victoryParam = 60;
    this.insideColor  = "#0a1828";
    this.outsideColor = "#040a14";
    this.edgeColor    = "#8cdcff";
    this._cappedToastShown = false;
    // Reset playable-shape state — level builders set bounds, designs may
    // additionally set an explicit shape via Editor.deserialize.
    this.shape = null;
    this._derivedShape = null;
    this._derivedBoundsKey = "";
    // Pending seed wins for one reset (for test reruns); otherwise wall-clock.
    const s = (Game._pendingSeed != null) ? Game._pendingSeed : (Date.now() & 0xfffffff);
    Game._pendingSeed = null;
    this.seed(s);
  },

  spawn(c) { this.circles.push(c); return c; },

  // Current playable-area shape. Returns the explicit `shape` if set;
  // otherwise lazily derives a single-rect shape from `bounds`. The
  // derived value is cached and re-derived only when bounds change so
  // Shape's WeakMap-keyed sample cache stays warm.
  activeShape() {
    if (this.shape && this.shape.length) return this.shape;
    const b = this.bounds;
    const key = `${b.x}|${b.y}|${b.w}|${b.h}`;
    if (!this._derivedShape || this._derivedBoundsKey !== key) {
      this._derivedShape = Shape.fromBounds(b.w, b.h);
      this._derivedBoundsKey = key;
    }
    return this._derivedShape;
  },

  // Physics step --------------------------------------------------
  step(dt) {
    if (this.won || this.lost) {
      this.endTime += dt;
    }
    this.time += dt;

    // 1. Apply gravity (if any) before integration so it shapes velocities.
    // Forces sum across (a) static gravity wells, and (b) "field" kinds —
    // magnets, repellers, singularity-children — which carry their own well
    // around with them.
    const wells = this.gravityCenters;
    const fieldMotes = this.circles.filter(c => c.alive && KIND_META[c.kind] && KIND_META[c.kind].behavior === "field");
    const ghost = isPlayerGhost();
    if (wells.length > 0 || fieldMotes.length > 0) {
      const minR = 20;
      for (const c of this.circles) {
        if (!c.alive) continue;
        let ax = 0, ay = 0;
        for (const w of wells) {
          const dx = w.x - c.x, dy = w.y - c.y;
          let d  = Math.hypot(dx, dy);
          if (d < minR) d = minR;
          const a = w.strength / (d * d);
          ax += (dx / d) * a;
          ay += (dy / d) * a;
        }
        // Field-mote gravity bypasses the player in ghost mode.
        const skipFields = ghost && c === this.player;
        if (!skipFields) for (const m of fieldMotes) {
          if (m === c) continue;
          const dx = m.x - c.x, dy = m.y - c.y;
          let d = Math.hypot(dx, dy);
          if (d < minR) d = minR;
          const strength = KIND_META[m.kind].fieldStrength;
          const a = strength / (d * d);
          ax += (dx / d) * a;
          ay += (dy / d) * a;
        }
        c.vx += ax * dt;
        c.vy += ay * dt;
      }
    }

    // 2. AI thinks
    for (const c of this.circles) {
      if (!c.alive) continue;
      c.age += dt;
      if (c.thrustCooldown > 0) c.thrustCooldown -= dt;
      if (KIND_META[c.kind] && KIND_META[c.kind].behavior === "active") this.aiThink(c, dt);
      this._tickAbilities(c, dt);
    }

    // 3. Integrate positions — vacuum, no drag
    for (const c of this.circles) {
      if (!c.alive) continue;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }

    // 4. (mote lifespan removed — matter is conserved)

    // 5. Wall bounce — perfectly elastic against the playable-area
    // boundary (a union of rect + circle primitives, possibly with
    // subtractions). For a single-rect shape this reduces to the
    // legacy 4-axis behaviour. Outward normal at the contact point is
    // queried from Shape; reflection flips the outward component of
    // velocity, position is corrected by the penetration depth.
    const shape = this.activeShape();
    for (const c of this.circles) {
      if (!c.alive) continue;
      const r = c.r;
      const nb = Shape.nearestBoundary(shape, c.x, c.y);
      if (!nb) continue;
      const overlap = r + nb.signedDistance;
      if (overlap <= 0) continue;
      c.x -= nb.nx * overlap;
      c.y -= nb.ny * overlap;
      const vn = c.vx * nb.nx + c.vy * nb.ny;
      if (vn > 0) {
        c.vx -= 2 * vn * nb.nx;
        c.vy -= 2 * vn * nb.ny;
        if (c === this.player) {
          const speed = Math.hypot(c.vx, c.vy);
          if (speed > 30) Audio_.sfxBounce(Math.min(2, speed / 200));
        }
      }
    }

    // 6. Collisions / absorption
    this.collide(dt);

    // 6b. on-death event sweep — fires once per newly-dead circle. Done
    // before culling so spawn-child / pulse / etc. can read the dying
    // circle's position. Mass at fire time is typically 0 (absorption
    // and drains zero it before alive=false), so on-death effects that
    // depend on absolute parameters (spawn-child radius, pulse range)
    // work cleanly while mass-conserving ones (split) silently no-op.
    for (const c of this.circles) {
      if (c.alive || c._deathProcessed) continue;
      c._deathProcessed = true;
      this._fireEventAbilities(c, "on-death");
    }

    // 7. Cull dead
    if (this.circles.some(c => !c.alive)) {
      this.circles = this.circles.filter(c => c.alive || c === this.player);
    }

    // 8. Win/lose check
    if (!this.won && !this.lost && this.player && this.player.alive) {
      let met = false;
      let reason = null;
      const others = this.circles.filter(c => c !== this.player && c.alive && c.kind !== "mote");
      if (this.victoryCondition === VICTORY_CONDITIONS.ABSORB_ALL) {
        if (others.length === 0) { met = true; reason = "absorb_all"; }
      } else if (this.victoryCondition === VICTORY_CONDITIONS.BECOME_LARGEST) {
        if (others.length === 0) {
          met = true; reason = "become_largest_alone";
        } else if (others.every(c => c.mass < this.player.mass)) {
          let mindMass = 0, totalMass = 0;
          for (const c of this.circles) {
            if (!c.alive) continue;
            totalMass += c.mass;
            if (c === this.player || (KIND_META[c.kind] && KIND_META[c.kind].hasMind)) {
              mindMass += c.mass;
            }
          }
          if (totalMass > 0 && mindMass / totalMass > 0.8) {
            met = true; reason = "become_largest_apex";
          }
        }
      } else if (this.victoryCondition === VICTORY_CONDITIONS.SURVIVE) {
        if (this.time >= this.victoryParam) { met = true; reason = "survive"; }
      } else if (this.victoryCondition === VICTORY_CONDITIONS.PACIFY) {
        if (!others.some(c => KIND_META[c.kind] && KIND_META[c.kind].hasMind)) {
          met = true; reason = "pacify";
        }
      }
      if (met) {
        this.won = true; this.endTime = 0;
        this.winReason = reason;
        Audio_.sfxWin();
      }
    }
    if (!this.lost && this.player && !this.player.alive) {
      this.lost = true; this.endTime = 0;
      Audio_.sfxLose();
    }
  },

  // ----- Pairwise circle collisions / absorption ---------------
  // Spatial-hash broadphase: bucket circles by AABB into grid cells, then only
  // check pairs that share at least one cell. Pairs are deduped via a Set so
  // big circles spanning multiple cells aren't tested multiple times.
  collide(dt) {
    const cellSize = 100;
    const grid = new Map();
    for (const c of this.circles) {
      if (!c.alive) continue;
      const r = c.r;
      const x0 = Math.floor((c.x - r) / cellSize);
      const x1 = Math.floor((c.x + r) / cellSize);
      const y0 = Math.floor((c.y - r) / cellSize);
      const y1 = Math.floor((c.y + r) / cellSize);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          // Pack two ints into one key — avoids string allocation per cell.
          const key = (cx + 50000) * 100000 + (cy + 50000);
          let bucket = grid.get(key);
          if (!bucket) { bucket = []; grid.set(key, bucket); }
          bucket.push(c);
        }
      }
    }
    const checked = new Set();
    for (const bucket of grid.values()) {
      const len = bucket.length;
      if (len < 2) continue;
      for (let i = 0; i < len; i++) {
        const a = bucket[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < len; j++) {
          const b = bucket[j];
          if (!b.alive) continue;
          // Order-stable pair key: lower id first
          const lo = a.id < b.id ? a.id : b.id;
          const hi = a.id < b.id ? b.id : a.id;
          const pairKey = lo * 1_000_000 + hi;
          if (checked.has(pairKey)) continue;
          checked.add(pairKey);
          this._processPair(a, b, dt);
        }
      }
    }
  },

  _processPair(a, b, dt) {
    const ghost = isPlayerGhost();
    if (ghost && (a === this.player || b === this.player)) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d  = Math.hypot(dx, dy);
    const ar = a.r, br = b.r;
    if (d >= ar + br) return;

    // Pickup collection — player touches any kind whose data has a
    // `pickup` block. Inventory entries are objects so user pickups ride
    // alongside built-ins; entry stores the slot and effect to fire on
    // activation. FIFO with hard cap of 9 (oldest dropped if over cap).
    const playerSide = a === this.player ? a : (b === this.player ? b : null);
    const otherSide  = playerSide === a ? b : (playerSide === b ? a : null);
    if (playerSide && otherSide) {
      const otherMeta = KIND_META[otherSide.kind];
      const pk = otherMeta && otherMeta._data && otherMeta._data.pickup;
      if (pk && pk.enabled !== false && (pk.slot === "attract" || pk.slot === "repel")) {
        Player.inventory = Player.inventory || [];
        Player.inventory.push({
          slot: pk.slot,
          kindId: otherSide.kind,
          effect: pk.effect ? JSON.parse(JSON.stringify(pk.effect)) : null
        });
        if (Player.inventory.length > 9) Player.inventory.shift();
        otherSide.alive = false; otherSide.mass = 0;
        Audio_.sfxAbsorb(0.6);
        return;
      }
    }

    const aMote = a.kind === "mote", bMote = b.kind === "mote";
    const aAnti = a.kind === "anti", bAnti = b.kind === "anti";

    // Anti-mote annihilation — on contact, both lose mass equal to the
    // smaller's full mass. The smaller is fully consumed; the larger keeps
    // the difference. Equal masses → both vanish.
    if ((aAnti || bAnti) && !(aAnti && bAnti)) {
      // Shield bypass: if either side is shielded, no annihilation, just
      // separate. Lets shield abilities tank an anti-mote hit cleanly.
      if (this._isShielded(a) || this._isShielded(b)) {
        this.separate(a, b, dx, dy, d, 0.4);
        return;
      }
      const drain = Math.min(a.mass, b.mass);
      a.mass -= drain;
      b.mass -= drain;
      if (a.mass <= MIN_MOTE_MASS) { a.alive = false; a.mass = 0; }
      if (b.mass <= MIN_MOTE_MASS) { b.alive = false; b.mass = 0; }
      if (a === this.player || b === this.player) {
        Audio_.sfxAnnihilate(Math.min(1.5, drain / 60));
      }
      // on-hit-by-anti fires for the non-anti circle (the kind authored
      // the ability, not the engine's anti-mote). Exactly one side is the
      // anti-mote here (the outer if ensures XOR), so we fire once on
      // whichever side isn't anti. Don't gate on alive — the kind may
      // have died in the annihilation, but its abilities should still
      // get a chance to fire (on-death handles the actual death event).
      const nonAnti = aAnti ? b : a;
      this._fireEventAbilities(nonAnti, "on-hit-by-anti");
      return;
    }

    const big = a.mass >= b.mass ? a : b;
    const sml = big === a ? b : a;

    // Mote-vs-mote: just nudge apart
    if (aMote && bMote) {
      this.separate(a, b, dx, dy, d);
      return;
    }

    // on-touched-by-bigger fires before absorption physics for any kind
    // (built-in or user) whose data has the trigger. The built-in
    // Splitter is now expressed as `on-touched-by-bigger → split count:5`
    // in KIND_BUILTINS — same code path, no special-case branch.
    if (big.mass > sml.mass && this._fireOnTouchedAbilities(sml, big)) {
      return;
    }

    // Same-size standoff (within 5%): no absorption, just nudge apart.
    const sizeRatio = big.mass / sml.mass;
    if (sizeRatio < 1.05) {
      this.separate(a, b, dx, dy, d, 0.4);
      return;
    }

    // Shield bypass: shielded circles can't be absorbed (and aren't
    // suction-accelerated). Just separate physically.
    if (this._isShielded(sml) || this._isShielded(big)) {
      this.separate(a, b, dx, dy, d, 0.4);
      return;
    }

    // Mass-transfer rate.
    const overlap = (ar + br) - d;
    const xferRate = overlap * (ar + br) * 4.0;

    const xfer = Math.min(sml.mass, xferRate * dt);
    if (xfer > 0) {
      const newBigMass = big.mass + xfer;
      big.vx = (big.mass * big.vx + xfer * sml.vx) / newBigMass;
      big.vy = (big.mass * big.vy + xfer * sml.vy) / newBigMass;
      big.mass = newBigMass;
    }
    sml.mass -= xfer;

    // Suction: equal and opposite — total momentum preserved.
    if (d > 0.001) {
      const force = Math.min(1, (sizeRatio - 1) * 0.4) * 800;
      const nx = dx / d, ny = dy / d;
      a.vx +=  nx * force * dt / a.mass;
      a.vy +=  ny * force * dt / a.mass;
      b.vx += -nx * force * dt / b.mass;
      b.vy += -ny * force * dt / b.mass;
    }

    big.flashAt = this.time;
    sml.flashAt = this.time;

    if (xfer > 0.5) {
      if (big === this.player)      Audio_.sfxAbsorb(Math.min(1.5, xfer / 8));
      else if (sml === this.player) Audio_.sfxAbsorbed();
    }

    // When the smaller drops below the mote floor, transfer remainder and cull.
    if (sml.mass <= MIN_MOTE_MASS) {
      big.mass += sml.mass;
      sml.mass = 0;
      sml.alive = false;
      // on-absorb fires for the absorber whenever it finishes consuming
      // another circle (one fire per absorbed prey, not per tick of
      // contact). on-death fires for sml in the end-of-step sweep.
      this._fireEventAbilities(big, "on-absorb");
    }
  },

  separate(a, b, dx, dy, d, push = 0.5) {
    if (d === 0) { dx = 1; dy = 0; d = 1; }
    const overlap = (a.r + b.r) - d;
    if (overlap <= 0) return;
    const nx = dx / d, ny = dy / d;
    const totalMass = a.mass + b.mass;
    const aShare = b.mass / totalMass;
    const bShare = a.mass / totalMass;
    a.x -= nx * overlap * push * aShare;
    a.y -= ny * overlap * push * aShare;
    b.x += nx * overlap * push * bShare;
    b.y += ny * overlap * push * bShare;
  },

  // ----- AI thinking ------------------------------------------
  // Phase 6 migration: built-ins and user kinds both go through the same
  // rule evaluator. Each kind's rules / abilities live as data on
  // KIND_BUILTINS or the user-kind store; this dispatches based on the
  // unified meta._data. Hard-coded hunter/avoider/predator/pup/glutton/
  // pulsar branches are gone.
  aiThink(c, dt) {
    if (c.thrustCooldown > 0) return;
    if (this._isFrozen(c)) return;     // freeze-self: skip all AI / thrust this tick
    this.aiThinkUserKind(c, dt);       // unified dispatch — name retained for callers
  },

  // Generic rule evaluator for user-authored kinds. Phase 2 supports two
  // pre-canned presets — hunt and flee — wired to the same target-search
  // shape that Hunter/Avoider use natively. Phase 3 adds preset="custom",
  // which evaluates a user-authored rules[] array. The preset + thrust
  // params come from k.movement.active, which the kind editor writes.
  // Returns true if the kind was handled (so aiThink skips its built-in
  // branches, which key off c.kind === "hunter" etc. and won't match user
  // ids anyway — early return is just for clarity).
  aiThinkUserKind(c, dt) {
    const meta = KIND_META[c.kind];
    if (!meta || !meta._data) return false;
    const mv = meta._data.movement;
    if (!mv || mv.type !== "active") return false;
    const cfg = mv.active || {};
    const preset = cfg.preset || "drift";
    if (preset === "drift") return true;     // active+drift = no-op (still handled)

    const opts = {
      fraction: cfg.thrustFraction !== undefined ? cfg.thrustFraction : 0.005,
      speed:    cfg.thrustSpeed    !== undefined ? cfg.thrustSpeed    : 450,
      cooldown: cfg.cooldown       !== undefined ? cfg.cooldown       : 0.05
    };
    const ghost = isPlayerGhost();
    const skip = o => o === c || !o.alive || o.kind === "mote" ||
                      (ghost && o === this.player) || this._isCamouflaged(o);

    if (preset === "custom") {
      this.aiThinkRulesArray(c, dt, cfg, opts, ghost);
      return true;
    }

    if (preset === "hunt") {
      // Same target shape as the built-in Hunter: closest+fattest smaller.
      let target = null, best = -Infinity;
      for (const o of this.circles) {
        if (skip(o)) continue;
        if (o.mass >= c.mass * 0.95) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        const d  = Math.hypot(dx, dy) + 1;
        const score = o.mass / (d * d) * 1000;
        if (score > best) { best = score; target = o; }
      }
      if (target) {
        const dx = target.x - c.x, dy = target.y - c.y;
        const d = Math.hypot(dx, dy);
        const tx = dx / d, ty = dy / d;
        const vAlong = c.vx * tx + c.vy * ty;
        if (vAlong < 80) this.thrust(c, tx, ty, opts);
      }
      return true;
    }

    if (preset === "flee") {
      // Sum a danger vector from every nearby larger circle, thrust away.
      let dangerX = 0, dangerY = 0;
      for (const o of this.circles) {
        if (skip(o)) continue;
        if (o.mass <= c.mass * 1.05) continue;
        const dx = c.x - o.x, dy = c.y - o.y;
        const d  = Math.hypot(dx, dy) + 1;
        const range = o.r + c.r * 4;
        if (d > range) continue;
        const w = (range - d) / range;
        dangerX += dx / d * w;
        dangerY += dy / d * w;
      }
      const m = Math.hypot(dangerX, dangerY);
      if (m > 0.2) this.thrust(c, dangerX / m, dangerY / m, opts);
      return true;
    }

    // Unknown preset — let aiThink fall through (will no-op for user IDs).
    return false;
  },

  // ----- Phase 3 rule-array evaluator --------------------------
  // Each rule = { priority, when, who:{filter,pick}, what:{type,...} }
  // Evaluation: sort by priority desc; first rule whose when() matches and
  // whose target search yields a candidate (or whose action doesn't need
  // one) wins, fires its action, and stops further evaluation. This is the
  // same shape the doc sketches for the §4 grammar — Phase 3 ships a
  // useful subset and Phase 5 fills in the long tail.
  aiThinkRulesArray(c, dt, cfg, opts, ghost) {
    const rules = (cfg.rules || []).filter(r => r && r.enabled !== false);
    if (rules.length === 0) return;
    // Stable sort by priority desc — equal priorities keep authored order.
    const sorted = rules.map((r, i) => ({ r, i }))
      .sort((a, b) => (b.r.priority || 0) - (a.r.priority || 0) || (a.i - b.i))
      .map(x => x.r);
    for (const rule of sorted) {
      if (!this._ruleWhen(c, rule.when)) continue;
      const action = (rule.what && rule.what.type) || "stand-ground";
      let target = null;
      if (action !== "stand-ground") {
        target = this._rulePick(c, rule.who, ghost);
        if (!target) continue;        // no target — try next rule
      }
      this._ruleAct(c, target, rule.what || {}, action, opts);
      // Phase 5: capture which rule fired and where it pointed so the
      // observation debug overlay can draw target lines, and aggregate
      // fire counts across the run for the post-test stats panel.
      const ruleIdx = (cfg.rules || []).indexOf(rule);
      c._lastRule = {
        ruleIdx, action,
        tx: target ? target.x : c.x,
        ty: target ? target.y : c.y,
        hasTarget: !!target
      };
      if (Game.observation && Game.observation.kindId === c.kind) {
        const fires = Game.observation.ruleFires || (Game.observation.ruleFires = {});
        fires[ruleIdx] = (fires[ruleIdx] || 0) + 1;
      }
      return;
    }
  },

  _ruleWhen(c, when) {
    // Phase 3 v1 keeps when simple — just "always". Conditions land in v2
    // (self.mass thresholds, world.timeSinceStart, etc.).
    if (!when || when.type === "always") return true;
    return true;
  },

  _rulePick(c, who, ghost) {
    const filter = (who && who.filter) || {};
    const pick = (who && who.pick) || "closest";
    const wantMote = filter.kind === "mote";
    let best = null, bestScore = -Infinity;
    for (const o of this.circles) {
      if (o === c || !o.alive) continue;
      if (ghost && o === this.player) continue;
      if (this._isCamouflaged(o)) continue;     // camo'd circles aren't seen by rules
      // Motes are skipped unless the rule explicitly asked for kind:"mote".
      if (o.kind === "mote" && !wantMote) continue;

      // kind filter
      const fk = filter.kind;
      if (fk && fk !== "any") {
        if (fk === "player") { if (o !== this.player) continue; }
        else if (fk === "mote") { if (o.kind !== "mote") continue; }
        else if (fk === "mind") {
          const m = KIND_META[o.kind];
          if (!(m && m.hasMind)) continue;
        }
        else if (fk === "non-mind") {
          const m = KIND_META[o.kind];
          if (m && m.hasMind) continue;
          if (o === this.player) continue;
        }
        else if (o.kind !== fk) continue;   // specific kind id
      }

      // mass filter
      const fm = filter.mass;
      if (fm === "smaller") {
        if (o.mass >= c.mass * 0.95) continue;
      } else if (fm === "larger") {
        if (o.mass <= c.mass * 1.05) continue;
      } else if (fm === "within-pct") {
        const pct = (filter.massValue !== undefined ? filter.massValue : 0.2);
        if (Math.abs(o.mass - c.mass) > c.mass * pct) continue;
      }

      const dx = o.x - c.x, dy = o.y - c.y;
      const d  = Math.hypot(dx, dy) + 1;

      // distance filter
      const fd = filter.distance;
      const dv = filter.distanceValue !== undefined ? filter.distanceValue : 280;
      if (fd === "within") { if (d > dv) continue; }
      else if (fd === "beyond") { if (d < dv) continue; }

      // pick scoring
      let score;
      switch (pick) {
        case "farthest":      score =  d;                    break;
        case "largest":       score =  o.mass;               break;
        case "smallest":      score = -o.mass;               break;
        case "score-hunter":  score =  o.mass / (d * d) * 1000; break;
        // "danger": prefer the nearest big thing — same shape as Hunter
        // score, but the caller is fleeing rather than chasing.
        case "score-danger":  score =  o.mass / (d * d) * 1000; break;
        case "closest":
        default:              score = -d;
      }
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return best;
  },

  _ruleAct(c, target, what, action, opts) {
    if (action === "stand-ground") return;
    if (!target) return;
    if (action === "approach") {
      const dx = target.x - c.x, dy = target.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 1) return;
      const tx = dx / d, ty = dy / d;
      const vAlong = c.vx * tx + c.vy * ty;
      if (vAlong < 80) this.thrust(c, tx, ty, opts);
    } else if (action === "flee") {
      const dx = c.x - target.x, dy = c.y - target.y;
      const d  = Math.hypot(dx, dy) + 1;
      this.thrust(c, dx / d, dy / d, opts);
    } else if (action === "intercept") {
      // Linear-extrapolated lookahead. Aim at where the target *will be*
      // half a second from now — works against drifting prey.
      const tAhead = what.lookahead !== undefined ? what.lookahead : 0.5;
      const fx = target.x + target.vx * tAhead;
      const fy = target.y + target.vy * tAhead;
      const dx = fx - c.x, dy = fy - c.y;
      const d  = Math.hypot(dx, dy);
      if (d < 1) return;
      const tx = dx / d, ty = dy / d;
      const vAlong = c.vx * tx + c.vy * ty;
      if (vAlong < 80) this.thrust(c, tx, ty, opts);
    } else if (action === "orbit") {
      // Mostly tangential, with a gentle radial correction toward the
      // configured radius — produces stable orbit-style motion.
      const R  = what.orbitRadius !== undefined ? what.orbitRadius : 200;
      const dx = target.x - c.x, dy = target.y - c.y;
      const d  = Math.hypot(dx, dy);
      if (d < 1) return;
      const tx = dx / d, ty = dy / d;
      const ttx = -ty, tty = tx;          // CCW tangent
      const radialDir = d > R ? 1 : -1;   // pull in vs. push out
      let fx = ttx * 0.7 + tx * radialDir * 0.3;
      let fy = tty * 0.7 + ty * radialDir * 0.3;
      const fnorm = Math.hypot(fx, fy);
      if (fnorm < 0.001) return;
      this.thrust(c, fx / fnorm, fy / fnorm, opts);
    }
  },

  // ----- Phase 6 abilities — timed side effects on user kinds ----
  // Each ability is { trigger: { type, ... }, effect: { type, ... } }.
  // v1 supports trigger.type === "every" (interval + jitter). Effects:
  //   pulse       — outward velocity impulse + visible shockwave (Pulsar).
  //   emit-mote   — eject a mass-fraction mote in a random direction.
  //   split       — divide self into N children of the same kind.
  // Per-circle state lives on c._abilityCooldowns[i]; first fire is
  // randomised within the interval so co-spawned instances desync.
  _tickAbilities(c, dt) {
    if (!c.alive) return;
    const meta = KIND_META[c.kind];
    if (!meta || !meta._data) return;
    const list = meta._data.abilities;
    if (!Array.isArray(list) || list.length === 0) return;
    if (!c._abilityCooldowns) c._abilityCooldowns = [];
    if (!c._growthCrossed) c._growthCrossed = {};
    for (let i = 0; i < list.length; i++) {
      const ab = list[i];
      if (!ab || ab.enabled === false) continue;
      const trig = ab.trigger || {};
      if (trig.type === "continuous") {
        // Fires every simulation tick. Conditions still gate. Drain-field
        // and other "always on" effects (future shield, future regen) use
        // this trigger.
        if (this._abilityConditionsPass(c, ab.conditions)) {
          this._fireAbility(c, ab, dt);
          if (!c.alive) return;
        }
        continue;
      }
      if (trig.type === "on-growth-cross") {
        // One-shot when mass crosses the configured threshold upward.
        // Per-circle state remembers whether we've already fired so we
        // don't re-trigger every tick while the kind sits above.
        const threshold = trig.threshold !== undefined ? trig.threshold : 200;
        const above = c.mass >= threshold;
        const fired = c._growthCrossed[i] === true;
        if (above && !fired) {
          c._growthCrossed[i] = true;
          if (this._abilityConditionsPass(c, ab.conditions)) {
            this._fireAbility(c, ab, dt);
            if (!c.alive) return;
          }
        } else if (!above && fired) {
          // Reset on dropping back below — lets a kind fire again if it
          // shrinks (e.g., absorption) and grows past the threshold again.
          c._growthCrossed[i] = false;
        }
        continue;
      }
      if (trig.type === "on-near-edge") {
        // One-shot when the circle enters the configured edge band. Re-arms
        // when it leaves, so successive edge-encounters fire.
        if (!c._nearEdgeFlag) c._nearEdgeFlag = {};
        const distVal = trig.distance !== undefined ? trig.distance : 80;
        const b = this.bounds;
        const d = Math.min(c.x - b.x, b.x + b.w - c.x, c.y - b.y, b.y + b.h - c.y);
        const near = d < distVal;
        const fired = c._nearEdgeFlag[i] === true;
        if (near && !fired) {
          c._nearEdgeFlag[i] = true;
          if (this._abilityConditionsPass(c, ab.conditions)) {
            this._fireAbility(c, ab, dt);
            if (!c.alive) return;
          }
        } else if (!near && fired) {
          c._nearEdgeFlag[i] = false;
        }
        continue;
      }
      if (trig.type !== "every") continue;
      const interval = Math.max(0.05, trig.interval || 1);
      const jitter = Math.max(0, trig.jitter || 0);
      if (c._abilityCooldowns[i] === undefined) {
        // Spread initial fires across [0.5×interval, 1.5×interval].
        c._abilityCooldowns[i] = interval * (0.5 + this.rand());
      }
      c._abilityCooldowns[i] -= dt;
      if (c._abilityCooldowns[i] <= 0) {
        c._abilityCooldowns[i] = interval + (this.rand() * 2 - 1) * jitter;
        // Conditions gate the fire (all-must-pass / AND). Cooldown still
        // resets when conditions fail, so we attempt again next interval
        // rather than firing every tick once they finally pass.
        if (this._abilityConditionsPass(c, ab.conditions)) {
          this._fireAbility(c, ab, dt);
          if (!c.alive) return;   // split kills the parent — bail before next ability
        }
      }
    }
  },

  // All conditions must pass for the ability to fire (AND). Empty/missing
  // conditions array short-circuits to true. v1 conditions:
  //   selfMassGt  — c.mass > value
  //   selfMassLt  — c.mass < value (reserved for follow-up)
  //   kindCountLt — number of alive circles of c.kind < value
  _abilityConditionsPass(c, conditions) {
    if (!Array.isArray(conditions) || conditions.length === 0) return true;
    for (const cond of conditions) {
      if (!cond || cond.enabled === false) continue;
      const v = +cond.value;
      if (cond.type === "selfMassGt") {
        if (!(c.mass > v)) return false;
      } else if (cond.type === "selfMassLt") {
        if (!(c.mass < v)) return false;
      } else if (cond.type === "kindCountLt") {
        let count = 0;
        for (const o of this.circles) {
          if (o.alive && o.kind === c.kind) count++;
          if (count >= v) return false;   // early exit
        }
        if (!(count < v)) return false;
      } else if (cond.type === "timeAliveGt") {
        if (!((c.age || 0) > v)) return false;
      } else if (cond.type === "timeAliveLt") {
        if (!((c.age || 0) < v)) return false;
      } else if (cond.type === "worldKindCountLt") {
        // Count of any specific kind (built-in or user) currently alive.
        // cond.kind names which kind to count; v is the upper bound.
        const target = cond.kind || "any";
        let count = 0;
        for (const o of this.circles) {
          if (!o.alive) continue;
          if (target === "any" || o.kind === target) count++;
          if (count >= v) return false;
        }
        if (!(count < v)) return false;
      } else if (cond.type === "nearEdge") {
        // True if c is within `value` px of any bounds wall.
        const b = this.bounds;
        const d = Math.min(c.x - b.x, b.x + b.w - c.x, c.y - b.y, b.y + b.h - c.y);
        if (!(d < v)) return false;
      } else if (cond.type === "nearWell") {
        // True if c is within `value` px of any static gravity well centre.
        let near = false;
        for (const w of this.gravityCenters) {
          if (Math.hypot(w.x - c.x, w.y - c.y) < v) { near = true; break; }
        }
        if (!near) return false;
      }
    }
    return true;
  },

  _fireAbility(c, ab, dt = 0) {
    const eff = ab.effect || {};
    const ghost = isPlayerGhost();
    if (eff.type === "drain-field") {
      // Glutton-equivalent: passive continuous drain on every smaller
      // non-mote / non-anti circle within reach. Drain rate falls
      // linearly from rate at the centre to 0 at reach. Same shape as
      // the built-in Glutton at index.html:2728 — externalised here.
      const reach = c.r * (eff.reachMul !== undefined ? eff.reachMul : 2.6);
      const rate = eff.rate !== undefined ? eff.rate : 40;
      for (const o of this.circles) {
        if (o === c || !o.alive) continue;
        if (ghost && o === this.player) continue;
        if (o.kind === "anti" || o.kind === "mote") continue;
        if (o.mass >= c.mass) continue;
        if (this._isShielded(o)) continue;     // shielded prey can't be drained
        const dx = c.x - o.x, dy = c.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d > reach) continue;
        const closeness = 1 - d / reach;
        const drain = Math.min(o.mass, rate * closeness * dt);
        o.mass -= drain;
        c.mass += drain;
        if (o.mass <= MIN_MOTE_MASS) {
          c.mass += o.mass; o.mass = 0; o.alive = false;
        }
      }
      return;
    }
    if (eff.type === "pulse") {
      const range = Math.max(10, eff.range || 280);
      const strength = eff.strength !== undefined ? eff.strength : 240;
      // Re-use Pulsar's render hook; the generic shockwave renderer reads
      // c.pulseAt + c.pulseRange to draw the expanding ring.
      c.pulseAt = this.time;
      c.pulseRange = range;
      for (const o of this.circles) {
        if (o === c || !o.alive) continue;
        if (ghost && o === this.player) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d > range || d < 1) continue;
        const w = (range - d) / range;
        const push = strength * w;
        o.vx += (dx / d) * push;
        o.vy += (dy / d) * push;
      }
      Audio_.sfxPulsarPulse(Audio_.proximity(c, this.player, 400, 1400));
    } else if (eff.type === "emit-mote") {
      // Eject a mote in a random direction. Same physics path as the
      // player's thrust — momentum is conserved.
      const ang = this.rand() * TAU;
      const fraction = eff.massFraction !== undefined ? eff.massFraction : 0.005;
      const speed = eff.speed !== undefined ? eff.speed : 250;
      this.thrust(c, Math.cos(ang), Math.sin(ang),
        { fraction, speed, cooldown: 0 });
    } else if (eff.type === "split") {
      const count = Math.max(2, Math.min(10, eff.count || 4));
      // Bail if too small to viably split into N children (each child
      // must clear MIN_MOTE_MASS or it'll just be reabsorbed instantly).
      if (c.mass < count * MIN_MOTE_MASS * 1.5) return;
      // Children inherit the parent's kind by default ("self"), but a
      // specific kind can be named so e.g. the built-in Splitter spawns
      // neutrals instead of more splitters. childKind: "self" / kind id.
      let childKindId = eff.childKind || "self";
      if (childKindId === "self") childKindId = c.kind;
      const childMeta = KIND_META[childKindId];
      const childHue = childMeta && typeof childMeta.hue === "number" ? childMeta.hue : c.hue;
      const childMass = c.mass / count;
      const childR = Math.sqrt(childMass / Math.PI);
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * TAU + this.rand() * 0.4;
        const v = 90 + this.rand() * 80;
        this.circles.push(new Circle(c.x, c.y, childR, {
          kind: childKindId, hue: childHue,
          vx: c.vx + Math.cos(ang) * v,
          vy: c.vy + Math.sin(ang) * v
        }));
      }
      Audio_.sfxSplitterPop(Math.min(1.4, c.mass / 200) * Audio_.proximity(c, this.player));
      c.mass = 0; c.alive = false;
    }

    if (eff.type === "dash") {
      // One-shot velocity impulse. Direction modes:
      //   random          — uniform random angle (default).
      //   current         — keep heading; speed up if already moving,
      //                     otherwise fall back to random.
      //   away-from-edge  — vector away from the nearest bounds wall.
      // maxSpeed caps the final velocity magnitude so repeated dashes
      // don't accumulate indefinitely (the bouncy-near-edge preset hit
      // exactly this — without a cap, each fire kept piling on speed).
      const speed = eff.speed !== undefined ? eff.speed : 400;
      const cap = eff.maxSpeed !== undefined ? eff.maxSpeed : 600;
      const mode = eff.direction || "random";
      let dx, dy;
      if (mode === "current") {
        const cur = Math.hypot(c.vx, c.vy);
        if (cur > 1) {
          dx = c.vx / cur; dy = c.vy / cur;
        } else {
          const ang = this.rand() * TAU;
          dx = Math.cos(ang); dy = Math.sin(ang);
        }
      } else if (mode === "away-from-edge") {
        const b = this.bounds;
        const dl = c.x - b.x, dr = b.x + b.w - c.x;
        const dtw = c.y - b.y, db = b.y + b.h - c.y;
        const minD = Math.min(dl, dr, dtw, db);
        if      (minD === dl)  { dx =  1; dy =  0; }
        else if (minD === dr)  { dx = -1; dy =  0; }
        else if (minD === dtw) { dx =  0; dy =  1; }
        else                   { dx =  0; dy = -1; }
      } else {
        const ang = this.rand() * TAU;
        dx = Math.cos(ang); dy = Math.sin(ang);
      }
      c.vx += dx * speed;
      c.vy += dy * speed;
      const v = Math.hypot(c.vx, c.vy);
      if (v > cap) {
        const s = cap / v;
        c.vx *= s; c.vy *= s;
      }
      return;
    }
    if (eff.type === "shield") {
      // Temporary invincibility: can't be absorbed, drained, annihilated
      // by anti-motes, or hit by drain-field abilities. Visual is a faint
      // ring drawn in drawCircle while active.
      const dur = Math.max(0.05, eff.duration !== undefined ? eff.duration : 2);
      c._shieldedUntil = this.time + dur;
      return;
    }
    if (eff.type === "camo") {
      // Hidden from AI vision (built-in aiThink skip + rule pick + user-
      // kind aiThink skip). Doesn't block absorption — touch still works.
      const dur = Math.max(0.05, eff.duration !== undefined ? eff.duration : 3);
      c._camoUntil = this.time + dur;
      return;
    }
    if (eff.type === "freeze-self") {
      // Stand-still for the duration: aiThink early-returns, velocity is
      // zeroed once. Useful for ambush patterns or "play dead" tactics.
      const dur = Math.max(0.05, eff.duration !== undefined ? eff.duration : 1);
      c._frozenUntil = this.time + dur;
      c.vx = 0; c.vy = 0;
      return;
    }
    if (eff.type === "play-sound") {
      // Procedural SFX preset, attenuated by distance to the player so a
      // chorus of distant kinds doesn't drown out nearby ones.
      const preset = eff.preset || "blip";
      const intensity = (eff.intensity !== undefined ? eff.intensity : 1)
                      * Audio_.proximity(c, this.player, 320, 1400);
      Audio_.sfxKindEvent(preset, intensity);
      return;
    }
    if (eff.type === "convert-target") {
      // Turn smaller-than-self circles within range into self's kind.
      // Powerful — gate carefully (kindCountLt / cooldown / mass).
      const range = eff.range !== undefined ? eff.range : 200;
      const maxConvert = Math.max(1, eff.count || 1);
      const filterMass = eff.massFilter || "smaller";   // "smaller" | "any"
      let converted = 0;
      for (const o of this.circles) {
        if (o === c || !o.alive) continue;
        if (o === this.player) continue;            // don't convert the player
        if (o.kind === "mote" || o.kind === "anti") continue;
        if (o.kind === c.kind) continue;            // already same kind
        if (filterMass === "smaller" && o.mass >= c.mass) continue;
        const dx = o.x - c.x, dy = o.y - c.y;
        if (Math.hypot(dx, dy) > range) continue;
        o.kind = c.kind;
        o.hue  = c.hue;
        // Reset per-circle ability state so the converted circle's
        // timers etc. are fresh for its new kind.
        o._abilityCooldowns = []; o._growthCrossed = {}; o._nearEdgeFlag = {};
        converted++;
        if (converted >= maxConvert) break;
      }
      return;
    }
    if (eff.type === "spawn-child") {
      // Resolve "self" to the parent's kind so a kind can spawn copies
      // of itself without referencing its own id by hand. Otherwise
      // expects an existing kind id (built-in or user).
      let childKindId = eff.kind || "self";
      if (childKindId === "self") childKindId = c.kind;
      const childMeta = KIND_META[childKindId];
      if (!childMeta) return;     // unknown kind — silently skip
      const childHue = (typeof childMeta.hue === "number") ? childMeta.hue : c.hue;
      const count = Math.max(1, Math.min(20, eff.count || 1));
      const childR = Math.max(2, eff.radius || 8);
      const speed = eff.speed !== undefined ? eff.speed : 80;

      // On-death spawns happen AFTER absorption has scrambled the parent's
      // velocity (suction force pulled it into the absorber at speed) and
      // zeroed its mass. Don't inherit velocity in that case — otherwise
      // children rocket across the map at the suction speed. Other triggers
      // (every / continuous / on-absorb) still inherit so children naturally
      // carry the parent's drift, but we cap at 200 px/s as a sanity floor
      // against any other path that might pump the parent's speed.
      const isOnDeath = ab.trigger && ab.trigger.type === "on-death";
      let baseVx = 0, baseVy = 0;
      if (!isOnDeath) {
        const ps = Math.hypot(c.vx, c.vy);
        const cap = 200;
        const scale = ps > cap ? cap / ps : 1;
        baseVx = c.vx * scale;
        baseVy = c.vy * scale;
      }
      // Radial spawn offset — children spawn just outside the parent body
      // so they're not sitting inside whatever just killed it. For on-death
      // the parent has mass=0 / r=0 from the absorption, so we use an
      // absolute floor (covers typical absorber sizes).
      const offset = isOnDeath
        ? Math.max(childR * 3 + 4, 18)
        : (c.r || 0) + childR + 2;
      // Hard cap on world population. Without this a spawn-child cascade
      // (self-spawning on-death without a kindCountLt condition) can crash
      // the browser. Cap is well above any realistic level — if you hit
      // it, the simulation degrades gracefully instead of exploding.
      const WORLD_CIRCLE_CAP = 500;
      for (let i = 0; i < count; i++) {
        if (this.circles.length >= WORLD_CIRCLE_CAP) {
          if (!World._cappedToastShown) {
            World._cappedToastShown = true;
            toast(`World circle cap (${WORLD_CIRCLE_CAP}) reached — spawn-child throttled`);
          }
          break;
        }
        const ang = (i / count) * TAU + this.rand() * 0.4;
        this.circles.push(new Circle(
          c.x + Math.cos(ang) * offset,
          c.y + Math.sin(ang) * offset,
          childR, {
            kind: childKindId, hue: childHue,
            vx: baseVx + Math.cos(ang) * speed,
            vy: baseVy + Math.sin(ang) * speed
          }));
      }
    }
  },

  // Time-window predicates for the timed-state effects. shield/camo/
  // freeze each set a `c._<state>Until` timestamp; these helpers check
  // whether the state is still active. Stateless and cheap.
  _isShielded(c) { return c && c._shieldedUntil !== undefined && this.time < c._shieldedUntil; },
  _isCamouflaged(c) { return c && c._camoUntil !== undefined && this.time < c._camoUntil; },
  _isFrozen(c) { return c && c._frozenUntil !== undefined && this.time < c._frozenUntil; },

  // Phase: shared dispatcher for event-triggered abilities (on-death,
  // on-absorb). Doesn't bail on c.alive — on-death legitimately fires
  // on dead circles. Conditions are evaluated against c at fire time.
  _fireEventAbilities(c, eventType) {
    const meta = KIND_META[c.kind];
    if (!meta || !meta._data) return;
    const list = meta._data.abilities;
    if (!Array.isArray(list)) return;
    for (const ab of list) {
      if (!ab || ab.enabled === false) continue;
      const trig = ab.trigger || {};
      if (trig.type !== eventType) continue;
      if (this._abilityConditionsPass(c, ab.conditions)) {
        this._fireAbility(c, ab, 0);
      }
    }
  },

  // Fires sml's on-touched-by-bigger abilities BEFORE absorption physics
  // runs. Returns true if any handler ran and killed sml — the caller
  // (_processPair) bails so the bigger gains nothing (proper Splitter-
  // equivalent semantics with mass conservation). When paired with
  // `split`, sml's mass is divided into children at fire time, while
  // it's still alive and full-mass.
  _fireOnTouchedAbilities(sml, big) {
    const meta = KIND_META[sml.kind];
    if (!meta || !meta._data) return false;
    const list = meta._data.abilities;
    if (!Array.isArray(list)) return false;
    let fired = false;
    for (const ab of list) {
      if (!ab || ab.enabled === false) continue;
      const trig = ab.trigger || {};
      if (trig.type !== "on-touched-by-bigger") continue;
      if (this._abilityConditionsPass(sml, ab.conditions)) {
        this._fireAbility(sml, ab, 0);
        fired = true;
        if (!sml.alive) break;     // sml committed (e.g., split) — stop
      }
    }
    return fired && !sml.alive;
  },

  // ----- Propulsion (player + AI use this) ---------------------
  // tx,ty is the direction the entity wants to GO. We eject mass opposite.
  thrust(c, tx, ty, opts = {}) {
    if (c.thrustCooldown > 0) return false;
    const ejectFraction = opts.fraction !== undefined ? opts.fraction : 0.005;
    const ejectSpeed    = opts.speed    !== undefined ? opts.speed    : 450;
    const minMass = 1.5;
    if (c.mass < minMass * 1.2) return false;
    // Pure fraction — ejected mass scales with body mass, so ΔV per eject is
    // identical regardless of size. Steering and braking feel the same whether
    // you're a speck or a leviathan. ...except below MIN_MOTE_MASS, where the
    // body is too small to expel a viable mote and just can't thrust.
    const ejected = c.mass * ejectFraction;
    if (ejected < MIN_MOTE_MASS) return false;
    if (ejected >= c.mass - minMass) return false;
    const newMass = c.mass - ejected;

    // Eject opposite of desired direction
    const ex = -tx, ey = -ty;

    // Velocity of mote relative to world
    const moteVx = c.vx + ex * ejectSpeed;
    const moteVy = c.vy + ey * ejectSpeed;

    // Conservation of momentum:
    // newMass * newV  +  ejected * moteV  =  oldMass * oldV
    c.vx = (c.mass * c.vx - ejected * moteVx) / newMass;
    c.vy = (c.mass * c.vy - ejected * moteVy) / newMass;
    c.mass = newMass;

    // Spawn the mote slightly outside the body. No lifespan — matter is conserved.
    const spawnDist = c.r + Math.sqrt(ejected / Math.PI) + 1;
    const mote = new Circle(
      c.x + ex * spawnDist,
      c.y + ey * spawnDist,
      Math.sqrt(ejected / Math.PI),
      { kind: "mote", vx: moteVx, vy: moteVy, hue: c.hue }
    );
    this.circles.push(mote);

    c.thrustCooldown = opts.cooldown !== undefined ? opts.cooldown : 0.06;
    if (c === this.player) Audio_.sfxThrust();
    return true;
  }
};
