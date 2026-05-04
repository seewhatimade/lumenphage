import { Editor } from "./editor.js";
import { mouse, toast } from "./main.js";
import { Shape } from "./shape.js";
import { World } from "./world.js";

// Editor — split across multiple files (see js/editor.js for state
// + dispatcher; this file holds one method group).
// Method group "shape" — extracted from editor.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(Editor, {


  // Shape-tool helpers ----------------------------------------------
  // Materialize World.shape from bounds if the level is still on the
  // null/derived branch — gives the user something tangible to edit.
  _ensureShape() {
    if (Array.isArray(World.shape) && World.shape.length) return;
    const b = World.bounds;
    World.shape = [{
      type: "rect", cx: b.x + b.w / 2, cy: b.y + b.h / 2,
      w: b.w, h: b.h, sign: "+",
    }];
    Shape.invalidate(World.shape);
  },
  // Snap World.bounds to a 64-aligned superset of the shape's AABB.
  // Aligning to the LCM of the available snap sizes (8 / 16 / 32 / 64)
  // means any later choice of Snap still lands on the same grid lines:
  // levels stay offset-consistent as the player extends the playable
  // area outward, and the toolbar w/h fields update to the new size.
  _syncBoundsToShape() {
    if (!World.shape || !World.shape.length) return;
    const ab = Shape.aabb(World.shape);
    const ALIGN = 64;
    const x0 = Math.floor(ab.x / ALIGN) * ALIGN;
    const y0 = Math.floor(ab.y / ALIGN) * ALIGN;
    const x1 = Math.ceil((ab.x + ab.w) / ALIGN) * ALIGN;
    const y1 = Math.ceil((ab.y + ab.h) / ALIGN) * ALIGN;
    World.bounds = {
      x: x0, y: y0,
      w: Math.max(1, x1 - x0),
      h: Math.max(1, y1 - y0),
    };
  },
  // Topmost primitive whose interior contains (x, y), or -1.
  _shapeIndexAt(x, y) {
    if (!World.shape) return -1;
    for (let i = World.shape.length - 1; i >= 0; i--) {
      if (Shape._inPrimitive(World.shape[i], x, y)) return i;
    }
    return -1;
  },
  // While drafting, the next vertex's effective position. Snaps the
  // cursor's angle (relative to the last vertex) to the nearest 45°
  // when Shift is held; preserves the cursor's distance. Without Shift
  // the cursor grid-snaps when snap is on (else passes through raw).
  _polyEffectiveCursor() {
    if (mouse.shift && this._polyDraft && this._polyDraft.length > 0) {
      const last = this._polyDraft[this._polyDraft.length - 1];
      const dx = this.hoverWorld.x - last.x, dy = this.hoverWorld.y - last.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return this.hoverWorld;
      const STEP = Math.PI / 4;  // 45°
      const a = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
      return { x: last.x + Math.cos(a) * len, y: last.y + Math.sin(a) * len };
    }
    return this._snap(this.hoverWorld);
  },
  // Effective placement point under the cursor for the shape tool — the
  // location a click/release would commit (rect corner, circle radius
  // endpoint, or polygon vertex). Routes through `_polyEffectiveCursor`
  // when authoring polygons so Shift's angle-snap is honored there.
  _shapeTargetPoint() {
    if (this._shapeAddType === "polygon") return this._polyEffectiveCursor();
    return this._snap(this.hoverWorld);
  },
  // Shift-angle-snap for the velocity tool. Anchored on the circle
  // currently being dragged; cursor distance preserved so |v| is still
  // controlled freely while the angle locks to the nearest 45° step.
  _velEffectiveCursor() {
    if (!mouse.shift || !this._velDragMote) return this.hoverWorld;
    const m = this._velDragMote;
    const dx = this.hoverWorld.x - m.x, dy = this.hoverWorld.y - m.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return this.hoverWorld;
    const STEP = Math.PI / 4;
    const a = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
    return { x: m.x + Math.cos(a) * len, y: m.y + Math.sin(a) * len };
  },
  // Same Shift-angle-snap as polygon vertex placement, but anchored on
  // the player so initial-velocity setting can be locked to a 45° step.
  // Cursor distance is preserved so the user still controls speed.
  _aimEffectiveCursor() {
    if (!mouse.shift || !World.player) return this.hoverWorld;
    const p = World.player;
    const dx = this.hoverWorld.x - p.x, dy = this.hoverWorld.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return this.hoverWorld;
    const STEP = Math.PI / 4;
    const a = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
    return { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len };
  },
  // Finish the in-progress polygon draft. ≥ 3 vertices and non-trivial
  // area required; otherwise the draft is dropped silently with a
  // toast hint.
  _commitPolyDraft() {
    const draft = this._polyDraft;
    this._polyDraft = null;
    if (!draft || draft.length < 3) {
      if (draft && draft.length > 0) toast("Polygon needs at least 3 vertices");
      return;
    }
    if (Math.abs(Shape._polygonSignedArea(draft)) < 100) {
      toast("Polygon area too small");
      return;
    }
    this.pushHistory();
    this._pushMirrored(Shape.makePolygon(draft, this._shapeAddSign));
    Shape.invalidate(World.shape);
    this._syncBoundsToShape();
    this.dirty = true;
    this.renderBar();
  },
  // Returns the cursor position plus its mirrored copies. Each entry also
  // carries velocity sign multipliers (sx, sy) so callers that care about
  // motion (velocity tool, paste) can reflect vx/vy across the same axes.
  _mirrorPositions(wp) {
    const out = [{ x: wp.x, y: wp.y, sx: 1, sy: 1 }];
    if (this.mirror === "none") return out;
    const cx = World.bounds.x + World.bounds.w / 2;
    const cy = World.bounds.y + World.bounds.h / 2;
    if (this.mirror === "horizontal" || this.mirror === "both") out.push({ x: 2*cx - wp.x, y: wp.y,         sx: -1, sy:  1 });
    if (this.mirror === "vertical"   || this.mirror === "both") out.push({ x: wp.x,         y: 2*cy - wp.y, sx:  1, sy: -1 });
    if (this.mirror === "both")                                 out.push({ x: 2*cx - wp.x, y: 2*cy - wp.y, sx: -1, sy: -1 });
    return out;
  },
  // Active mirror axes as (sx, sy) sign pairs, original first. Used by
  // shape-tool placement / removal / preview to mirror primitives across
  // the world bounds center.
  _mirrorAxes() {
    const out = [[1, 1]];
    if (this.mirror === "horizontal" || this.mirror === "both") out.push([-1, 1]);
    if (this.mirror === "vertical"   || this.mirror === "both") out.push([1, -1]);
    if (this.mirror === "both")                                 out.push([-1, -1]);
    return out;
  },
  // Reflect a single shape primitive across the active mirror axes.
  // Returns a copy for the identity axis too, so callers can iterate
  // uniformly. Polygons are re-canonicalized to CW since flipping
  // reverses winding.
  _mirrorPrimitive(p, sx, sy) {
    const cxW = World.bounds.x + World.bounds.w / 2;
    const cyW = World.bounds.y + World.bounds.h / 2;
    const fx = (x) => sx === -1 ? 2 * cxW - x : x;
    const fy = (y) => sy === -1 ? 2 * cyW - y : y;
    if (p.type === "rect")
      return { type: "rect", cx: fx(p.cx), cy: fy(p.cy), w: p.w, h: p.h, sign: p.sign };
    if (p.type === "circle")
      return { type: "circle", cx: fx(p.cx), cy: fy(p.cy), r: p.r, sign: p.sign };
    if (p.type === "polygon")
      return Shape.makePolygon(p.points.map(v => ({ x: fx(v.x), y: fy(v.y) })), p.sign);
    return { ...p };
  },
  // Right-click delete in the shape tool. With mirroring active, also
  // removes the topmost primitive at each mirrored cursor position, so
  // a single right-click clears all mirror counterparts at once.
  _shapeDeleteAtCursor() {
    const positions = this._mirrorPositions(this.hoverWorld);
    const toRemove = new Set();
    for (const pos of positions) {
      const idx = this._shapeIndexAt(pos.x, pos.y);
      if (idx >= 0) toRemove.add(idx);
    }
    if (toRemove.size === 0) return;
    if (World.shape.length - toRemove.size < 1) {
      toast("Can't delete the last primitive — use Reset");
      return;
    }
    this.pushHistory();
    [...toRemove].sort((a, b) => b - a).forEach(i => World.shape.splice(i, 1));
    Shape.invalidate(World.shape);
    this._syncBoundsToShape();
    this.dirty = true;
    this.renderBar();
  },
  // Push `prim` plus its mirror copies into World.shape. Skips a mirror
  // copy that's geometrically identical to the original — happens when
  // the primitive's center sits on the mirror axis (a centered rect with
  // horizontal mirror would otherwise duplicate itself).
  _pushMirrored(prim) {
    const eq = (n, m) => Math.abs(n - m) < 1e-3;
    const same = (a, b) => {
      if (!a || !b || a.type !== b.type || a.sign !== b.sign) return false;
      if (a.type === "rect")   return eq(a.cx, b.cx) && eq(a.cy, b.cy) && eq(a.w, b.w) && eq(a.h, b.h);
      if (a.type === "circle") return eq(a.cx, b.cx) && eq(a.cy, b.cy) && eq(a.r, b.r);
      if (a.type === "polygon") {
        if (a.points.length !== b.points.length) return false;
        return a.points.every((p, i) => eq(p.x, b.points[i].x) && eq(p.y, b.points[i].y));
      }
      return false;
    };
    const out = [];
    for (const [sx, sy] of this._mirrorAxes()) {
      const m = (sx === 1 && sy === 1) ? prim : this._mirrorPrimitive(prim, sx, sy);
      if (!out.some(q => same(q, m))) out.push(m);
    }
    for (const p of out) World.shape.push(p);
  },
});
