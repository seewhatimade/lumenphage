import { Audio_ } from "./audio.js";
import { Debug } from "./debug.js";
import { Editor } from "./editor.js";
import { Game } from "./game.js";
import { actionJustPressed, actionPressed } from "./main.js";
import { Touch } from "./touch.js";
import { World } from "./world.js";

// Player — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   PLAYER CONTROL
// ============================================================

export const Player = {
  aim: 0,           // radians; 0 = right
  rotateSpeed: 3.0, // rad/sec
  thrustHeld: false,
  inventory: [],    // FIFO queue of "attract" / "repel" pickups
  // Discrete "tap" boost
  tryBoost(c) {
    World.thrust(c, Math.cos(this.aim), Math.sin(this.aim),
      { fraction: 0.06, speed: 520, cooldown: 0.18 });
  },
  // Fire a brief radial impulse around the player. Each pickup type has its
  // own dedicated trigger button — attract pulls everything in, repel pushes
  // it out. Range / strength tuned to feel decisive but not game-breaking.
  _firePickup(slot) {
    if (!World.player || !World.player.alive) return;
    // Inventory entries are { slot, kindId, effect }. Find the most
    // recent matching the requested slot, consume, and run the effect
    // with the player as the actor.
    let entry = null;
    if (Debug.get("unlimitedPickups")) {
      // Debug bypass: synthesise a default attract / repel burst even
      // when the inventory is empty so the buttons keep firing.
      entry = {
        slot,
        kindId: slot === "attract" ? "attractPickup" : "repelPickup",
        effect: { type: "pulse", range: 360, strength: slot === "attract" ? -260 : 260 }
      };
    } else {
      this.inventory = this.inventory || [];
      let idx = -1;
      for (let i = this.inventory.length - 1; i >= 0; i--) {
        const e = this.inventory[i];
        if (e && typeof e === "object" && e.slot === slot) { idx = i; break; }
      }
      if (idx < 0) return;
      entry = this.inventory.splice(idx, 1)[0];
    }
    const p = World.player;
    const eff = entry && entry.effect;
    if (eff && eff.type) {
      // Run via the same _fireAbility dispatcher used by ability effects
      // — passing the player as `c` so pulses, dashes, etc. originate at
      // the player's position.
      World._fireAbility(p, { effect: eff }, 0);
    } else {
      // Empty effect → fall back to the original built-in burst so an
      // older saved pickup without effect data still works.
      const range = 360;
      const baseImpulse = slot === "attract" ? -260 : 260;
      for (const o of World.circles) {
        if (o === p || !o.alive) continue;
        const dx = o.x - p.x, dy = o.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > range || d < 1) continue;
        const w = (range - d) / range;
        const push = baseImpulse * w;
        o.vx += (dx / d) * push;
        o.vy += (dy / d) * push;
      }
    }
    Audio_.sfxThrust();
  },
  update(dt) {
    if (!World.player || !World.player.alive) return;

    if (Touch.enabled && Touch.aimActive) {
      // Touch stick provides absolute aim direction.
      this.aim = Touch.aim;
    } else {
      // D-pad / arrow keys are held-intent: pressing a direction picks a
      // target angle (combining adjacent presses into 45° diagonals) and
      // the aim slews toward it along the shorter arc. No snap, no fire.
      let dx = 0, dy = 0;
      if (actionPressed("aimRight")) dx += 1;
      if (actionPressed("aimLeft"))  dx -= 1;
      if (actionPressed("aimDown"))  dy += 1;
      if (actionPressed("aimUp"))    dy -= 1;
      if (dx || dy) {
        const target = Math.atan2(dy, dx);
        const TWO_PI = Math.PI * 2;
        let delta = (target - this.aim) % TWO_PI;
        if (delta >  Math.PI) delta -= TWO_PI;
        if (delta < -Math.PI) delta += TWO_PI;
        const step = this.rotateSpeed * dt;
        this.aim += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;
      }
    }

    // Boost supersedes thrust: if both fire on the same frame, the small
    // continuous thrust would set a 50ms cooldown that swallows the boost
    // (which uses the same cooldown gate). Run boost first and skip the
    // tiny thrust on that frame so the boost actually fires.
    const boostJust = actionJustPressed("boost");
    if (boostJust) this.tryBoost(World.player);
    if (!boostJust && actionPressed("thrust")) {
      World.thrust(World.player, Math.cos(this.aim), Math.sin(this.aim),
        { fraction: 0.005, speed: 450, cooldown: 0.05 });
    }
    if (actionJustPressed("attract")) this._firePickup("attract");
    if (actionJustPressed("repel"))   this._firePickup("repel");
    if (actionJustPressed("pause")) Game.togglePause();
    if (actionJustPressed("back")) {
      if (Game.observation) Game.endObservation();
      else if (Editor.testStash) Editor.returnFromTest();
      else Game.toMenu();
    }
  }
};
