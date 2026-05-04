import { H, W, actionJustPressed, actionPressed } from "./main.js";
import { World } from "./world.js";

// View — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   RENDERING — bioluminescent
// ============================================================

export const View = {
  followPlayer: true,
  zoomMod: 1,            // user-controlled persistent multiplier
  _lastZoomTap: { zoomOut: -10, zoomIn: -10 },   // for double-tap detection

  // Time-based intro zoom timer. While > 0, View.update overrides the
  // normal lerp and the main loop suspends Player.update + World.step so
  // the simulation is paused for the full duration the user configured.
  _introTimer: 0,
  _introDuration: 0,
  _introTarget: 1,
  introActive() { return this._introTimer > 0; },

  // Snap the camera to the player at play start so the user doesn't see
  // the camera slide across the world from World.reset()'s 0,0 origin.
  // With `intro: true` the scale starts at 25% of target and View.update
  // animates it to target over `duration` seconds. Reads as a drop-in
  // onto the player rather than a slide-from-corner.
  snapToPlayer(opts = {}) {
    if (!World.player) { this._introTimer = 0; return; }
    World.cameraX = World.player.x;
    World.cameraY = World.player.y;
    const baseScale = Math.min(1.4, Math.max(0.45, 24 / World.player.r));
    const target = baseScale * this.zoomMod;
    if (opts.intro) {
      const dur = Math.max(0.05, opts.duration || 1.0);
      this._introTimer    = dur;
      this._introDuration = dur;
      this._introTarget   = target;
      World.cameraScale   = target * 0.25;
    } else {
      this._introTimer = 0;
      World.cameraScale = target;
    }
  },

  update(dt) {
    if (!this.followPlayer || !World.player) return;

    // Active intro: time-based scale interpolation, smoothstepped. Camera
    // stays glued to the player. Bypasses the normal lerp and zoom-control
    // input — the user-configured duration is the single source of truth.
    if (this._introTimer > 0) {
      this._introTimer -= dt;
      const dur = this._introDuration;
      const tgt = this._introTarget;
      const t = Math.max(0, Math.min(1, 1 - this._introTimer / dur));
      const eased = t * t * (3 - 2 * t);            // smoothstep
      World.cameraScale = (tgt * 0.25) + (tgt - tgt * 0.25) * eased;
      World.cameraX = World.player.x;
      World.cameraY = World.player.y;
      if (this._introTimer <= 0) {
        this._introTimer = 0;
        World.cameraScale = tgt;
      }
      return;
    }

    // Hold L/R to adjust the persistent zoom modifier. No decay on release —
    // your zoom level sticks until you change it again.
    if (actionPressed("zoomOut")) this.zoomMod = Math.max(0.12, this.zoomMod * Math.pow(0.35, dt));
    if (actionPressed("zoomIn"))  this.zoomMod = Math.min(8,    this.zoomMod * Math.pow(2.8,  dt));

    // Double-tap either zoomOut or zoomIn binding within 350ms resets
    // to standard zoom. Uses wall-clock time so the 350ms window stays
    // consistent in both real-time play and while paused (where
    // World.time would otherwise stop advancing and treat every press
    // as a double-tap).
    const now = performance.now() / 1000;
    for (const act of ["zoomOut", "zoomIn"]) {
      if (actionJustPressed(act)) {
        if (now - this._lastZoomTap[act] < 0.35) this.zoomMod = 1;
        this._lastZoomTap[act] = now;
      }
    }

    const baseScale   = Math.min(1.4, Math.max(0.45, 24 / World.player.r));
    const targetScale = baseScale * this.zoomMod;
    World.cameraScale += (targetScale - World.cameraScale) * Math.min(1, dt * 4);
    const cx = World.player.x, cy = World.player.y;
    World.cameraX += (cx - World.cameraX) * Math.min(1, dt * 4);
    World.cameraY += (cy - World.cameraY) * Math.min(1, dt * 4);
  },
  worldToScreen(x, y) {
    const s = World.cameraScale;
    return {
      x: (x - World.cameraX) * s + W/2,
      y: (y - World.cameraY) * s + H/2
    };
  },
  screenToWorld(x, y) {
    const s = World.cameraScale;
    return {
      x: (x - W/2) / s + World.cameraX,
      y: (y - H/2) / s + World.cameraY
    };
  }
};
