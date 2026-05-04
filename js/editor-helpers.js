import { Editor } from "./editor.js";
import { H, W, editorBar } from "./main.js";
import { Shape } from "./shape.js";
import { World } from "./world.js";

// Editor — split across multiple files (see js/editor.js for state
// + dispatcher; this file holds one method group).
// Method group "helpers" — extracted from editor.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(Editor, {

  // World.reset() inside deserialize zeros the camera. Restore the same
  // centered fit-to-bounds view the editor opens with.
  _recenterCamera() {
    World.cameraX = World.bounds.w / 2;
    World.cameraY = World.bounds.h / 2;
    World.cameraScale = Math.min(W / World.bounds.w, H / World.bounds.h) * 0.85;
  },
  // Like _recenterCamera but anchored on the player when present —
  // used after returning from a test play so the user lands looking at
  // the spot they were just steering rather than the bounds center.
  _centerOnPlayer() {
    this._recenterCamera();
    if (World.player) {
      World.cameraX = World.player.x;
      World.cameraY = World.player.y;
    }
  },
  _snap(wp) {
    if (!this.snap) return { x: wp.x, y: wp.y };
    const s = this.snap;
    // Anchor the grid to the bounds origin so the box's near corner is
    // always a snap point. Combined with bounds w/h being quantized to
    // multiples of `s` (see `_quantizeBoundsToSnap`), the far corner is
    // also a snap point and the user can snap along all four walls.
    const b = World.bounds;
    return {
      x: b.x + Math.round((wp.x - b.x) / s) * s,
      y: b.y + Math.round((wp.y - b.y) / s) * s,
    };
  },
  // Round bounds to multiples of the current snap size. Mirrors the
  // wireBound flow: when an explicit shape is set, mutates the first
  // `+` rect and re-derives bounds from the new AABB; otherwise mutates
  // raw bounds. No-op when snap is off, the level already aligns, or
  // there's no `+` rect to grow.
  _quantizeBoundsToSnap() {
    if (!this.snap) return;
    const s = this.snap;
    const round = (v) => Math.max(s, Math.round(v / s) * s);
    const w = round(World.bounds.w);
    const h = round(World.bounds.h);
    if (w === World.bounds.w && h === World.bounds.h) return;
    if (Array.isArray(World.shape) && World.shape.length) {
      const idx = World.shape.findIndex(p => p.type === "rect" && p.sign === "+");
      if (idx >= 0) {
        World.shape[idx].w = w;
        World.shape[idx].h = h;
        Shape.invalidate(World.shape);
        this._syncBoundsToShape();
      } else {
        World.bounds.w = w; World.bounds.h = h;
      }
    } else {
      World.bounds.w = w; World.bounds.h = h;
    }
    this.dirty = true;
  },

  _toolbarNav(dir) {
    const fields = Array.from(editorBar.querySelectorAll("select, input, button"));
    if (!fields.length) return;
    let idx = fields.indexOf(document.activeElement);
    if (idx < 0) idx = dir > 0 ? -1 : 0;
    idx = (idx + dir + fields.length) % fields.length;
    fields[idx].focus();
  },
});
