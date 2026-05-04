import { Circle } from "./circle.js";
import { LEVEL_TYPES, TAU } from "./core.js";
import { Editor } from "./editor.js";
import { H, W, ctx, mouse, toast } from "./main.js";
import { Shape } from "./shape.js";
import { World } from "./world.js";

// Editor — split across multiple files (see js/editor.js for state
// + dispatcher; this file holds one method group).
// Method group "modes" — extracted from editor.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(Editor, {


  // Fill the box with a randomized packed grid, leaving the center cell empty
  // for the player. Tiered sizes so the level is playable: ~half are small prey,
  // some peers, a handful of larger threats.
  // Enter ring-placement preview: snap selected circles onto a circle around
  // the well nearest to the selection's centroid, at the average of their
  // current distances. While previewing, wheel/L+R adjust the radius, E
  // toggles even angular spacing, click commits, Esc / right-click cancels.
  enterRing() {
    if (this._ring) return;
    if (this.selection.size === 0) { toast("Select some motes first"); return; }
    if (World.gravityCenters.length === 0) { toast("Place a gravity well first"); return; }
    let cx = 0, cy = 0;
    for (const c of this.selection) { cx += c.x; cy += c.y; }
    cx /= this.selection.size; cy /= this.selection.size;
    let anchor = World.gravityCenters[0], best = Infinity;
    for (const w of World.gravityCenters) {
      const d = Math.hypot(w.x - cx, w.y - cy);
      if (d < best) { best = d; anchor = w; }
    }
    const motes = [];
    let distSum = 0;
    let i = 0;
    const N = this.selection.size;
    for (const c of this.selection) {
      const dx = c.x - anchor.x, dy = c.y - anchor.y;
      const dist = Math.hypot(dx, dy);
      const angle = dist > 0.001 ? Math.atan2(dy, dx) : (i / N) * TAU;
      motes.push({ c, angle, originalX: c.x, originalY: c.y });
      distSum += dist;
      i++;
    }
    const avg = distSum / N;
    const radius = avg > 1 ? avg : 200;
    this.pushHistory();
    this._ring = { anchor, motes, radius, evenSpacing: false };
    this._applyRingPositions();
  },

  _applyRingPositions() {
    const r = this._ring;
    if (!r) return;
    const N = r.motes.length;
    const baseAngle = r.motes[0].angle;
    for (let i = 0; i < N; i++) {
      const m = r.motes[i];
      const angle = r.evenSpacing ? baseAngle + (i / N) * TAU : m.angle;
      m.c.x = r.anchor.x + Math.cos(angle) * r.radius;
      m.c.y = r.anchor.y + Math.sin(angle) * r.radius;
    }
  },

  _commitRing() {
    if (!this._ring) return;
    const n = this._ring.motes.length;
    const radius = this._ring.radius;
    this._ring = null;
    this.dirty = true;
    toast(`Ring committed: ${n} circle${n === 1 ? "" : "s"} at r=${radius.toFixed(0)}`);
  },

  // ---- Move-to-line modal -----------------------------------------
  // Enter the modal. Captures the current selection but does not move
  // any motes — circles stay put until the drag's mouseup commits, so
  // the user sees dashed connectors from each circle to its preview
  // landing point on the line and can re-aim freely.
  enterLineMode() {
    if (this._lineMode || this._ring) return;
    if (this.selection.size < 2) { toast("Select at least 2 circles"); return; }
    const motes = [];
    for (const c of this.selection) motes.push({ c, ox: c.x, oy: c.y });
    // bounces: number of wall reflections when Ctrl-ricochet is active.
    // 0 = line stops at the first wall it hits; 1 = bounce once (default
    // when ricochet is engaged); 'a' / 'd' adjust during the drag.
    this._lineMode = { motes, start: null, end: null, drawing: false, bounces: 1 };
    this.renderBar();
    toast("Click and drag a line. Shift = 45°/90°. Hold Ctrl to ricochet (a/d adjust bounces). Esc to cancel.");
  },
  // Cursor used as the line's far endpoint: raw cursor by default;
  // angle-snapped to 45° steps from `start` while Shift is held.
  _lineEffectiveEnd() {
    if (!this._lineMode || !this._lineMode.start) return this.hoverWorld;
    const start = this._lineMode.start;
    const raw = this.hoverWorld;
    if (!mouse.shift) return { x: raw.x, y: raw.y };
    const dx = raw.x - start.x, dy = raw.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x: raw.x, y: raw.y };
    const STEP = Math.PI / 4;   // 8 directions: 0°/45°/90°/…
    const a = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
    return { x: start.x + Math.cos(a) * len, y: start.y + Math.sin(a) * len };
  },
  // Closest point on the segment A→B to point P. Clamped to [A, B] so
  // the projection lands on the visible segment — the user-facing line
  // is the polyline they drew (post-ricochet); circles shouldn't snap
  // to phantom extensions past the line's ends.
  _projectOntoLine(P, A, B) {
    const dx = B.x - A.x, dy = B.y - A.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return { x: A.x, y: A.y };
    let t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return { x: A.x + t * dx, y: A.y + t * dy };
  },
  // Render an angle readout for a direction vector (dx, dy) anchored
  // at a screen-space point. Used by the move-to-line tool (anchored
  // at the line's start) and the velocity tool (anchored at the circle
  // being dragged). Placed perpendicular to the direction so the line
  // itself doesn't slice through the badge, and flipped to the upper
  // side of the direction when possible. Clamped to canvas so it's
  // always visible at the edges.
  _drawAngleBadge(anchor, dx, dy, color) {
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return;
    // Math convention: 0° = +x, 90° = up, normalized to [0, 360).
    let deg = -Math.atan2(dy, dx) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    const text = `${deg.toFixed(1)}°`;
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top"; ctx.textAlign = "left";
    const padX = 5, padY = 2;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2, bh = 14 + padY * 2;
    // Perpendicular offset (CCW); flip if it ends up below the anchor
    // so the badge defaults to "above the line" visually.
    const ux = dx / len, uy = dy / len;
    let perpX = -uy, perpY = ux;
    if (perpY > 0) { perpX = -perpX; perpY = -perpY; }
    // Push the badge clear of the line by half its larger dimension
    // plus a small margin — the line then runs cleanly past it.
    const offset = Math.max(bw, bh) * 0.5 + 14;
    const cx = anchor.x + perpX * offset;
    const cy = anchor.y + perpY * offset;
    const bx = Math.max(2, Math.min(W - bw - 2, cx - bw / 2));
    const by = Math.max(2, Math.min(H - bh - 2, cy - bh / 2));
    ctx.fillStyle = "rgba(4,12,22,0.85)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = color;
    ctx.fillText(text, bx + padX, by + padY + 1);
  },
  // Pick the closest projection across a list of segments.
  _projectOntoSegments(P, segments) {
    let best = null, bestSq = Infinity;
    for (const seg of segments) {
      const q = this._projectOntoLine(P, seg.a, seg.b);
      const dsq = (q.x - P.x) ** 2 + (q.y - P.y) ** 2;
      if (dsq < bestSq) { best = q; bestSq = dsq; }
    }
    return best;
  },
  // Build the polyline that the alignment line should render as. Two
  // modes:
  //   ricochet === false → a single finite segment from `start` to
  //                        `end` (the cursor); drag length is the line.
  //   ricochet === true  → ignore drag length entirely. Walk from
  //                        `start` in the direction (end - start),
  //                        bouncing off the playable-area boundary —
  //                        the same boundary the runtime collides
  //                        circles against, so `−` carves and `+`
  //                        circle/polygon walls reflect the path.
  //                        Falls back to bounds-only reflection when
  //                        the level has no Shape (legacy single-rect).
  //                        Total segments = bounces + 1; the last one
  //                        terminates at a wall instead of reflecting.
  // If `start` is outside the playable area we degrade gracefully to
  // the simple straight segment so the user still sees something.
  _buildLineRicochets(start, end, ricochet, bounces) {
    if (!ricochet) {
      return [{ a: { x: start.x, y: start.y }, b: { x: end.x, y: end.y } }];
    }
    const b = World.bounds;
    const shape = World.shape;
    const hasShape = Array.isArray(shape) && shape.length > 0;
    const dx = end.x - start.x, dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [{ a: { x: start.x, y: start.y }, b: { x: end.x, y: end.y } }];
    const insideStart = hasShape
      ? Shape.isInside(shape, start.x, start.y)
      : (start.x >= b.x - 1e-3 && start.x <= b.x + b.w + 1e-3 &&
         start.y >= b.y - 1e-3 && start.y <= b.y + b.h + 1e-3);
    if (!insideStart) return [{ a: { x: start.x, y: start.y }, b: { x: end.x, y: end.y } }];
    let dir = { x: dx / len, y: dy / len };
    let cur = { x: start.x, y: start.y };
    const segments = [];
    const total = Math.max(1, (bounces | 0) + 1);   // segments to draw
    const FAR = Math.max(b.w, b.h) * 2;             // fallback span when no wall hit
    for (let i = 0; i < total; i++) {
      const hit = hasShape
        ? this._rayHitShapeWall(cur, dir, shape)
        : this._rayHitBoundsWall(cur, dir, b);
      if (!hit) {
        segments.push({
          a: { x: cur.x, y: cur.y },
          b: { x: cur.x + dir.x * FAR, y: cur.y + dir.y * FAR },
        });
        break;
      }
      const hp = { x: cur.x + dir.x * hit.t, y: cur.y + dir.y * hit.t };
      segments.push({ a: { x: cur.x, y: cur.y }, b: hp });
      if (i < total - 1) {
        const dn = dir.x * hit.nx + dir.y * hit.ny;
        dir = { x: dir.x - 2 * dn * hit.nx, y: dir.y - 2 * dn * hit.ny };
        // Nudge a hair off the wall along the new direction so the next
        // iteration doesn't immediately re-hit the same edge at t≈0.
        cur = { x: hp.x + dir.x * 1e-3, y: hp.y + dir.y * 1e-3 };
      }
    }
    return segments;
  },
  // First-wall hit: nearest positive-t crossing of any of the four
  // bounds walls. Normal points back into the box. Returns null when
  // the ray exits without crossing any wall in front of it.
  _rayHitBoundsWall(from, dir, b) {
    const eps = 1e-6;
    let best = null;
    const consider = (t, nx, ny, axis) => {
      if (t <= eps) return;
      // For x-axis walls verify the y coord lies inside the y range,
      // and vice versa — the ray must hit the wall *segment*, not the
      // infinite plane.
      if (axis === "x") {
        const y = from.y + dir.y * t;
        if (y < b.y - 1e-3 || y > b.y + b.h + 1e-3) return;
      } else {
        const x = from.x + dir.x * t;
        if (x < b.x - 1e-3 || x > b.x + b.w + 1e-3) return;
      }
      if (!best || t < best.t) best = { t, nx, ny };
    };
    if (dir.x >  eps) consider((b.x + b.w - from.x) / dir.x, -1, 0, "x");
    if (dir.x < -eps) consider((b.x       - from.x) / dir.x,  1, 0, "x");
    if (dir.y >  eps) consider((b.y + b.h - from.y) / dir.y,  0, -1, "y");
    if (dir.y < -eps) consider((b.y       - from.y) / dir.y,  0,  1, "y");
    return best;
  },
  // Shape-aware first-wall hit. Walks every primitive in the shape,
  // intersects the ray against its edges (4 line segments for a rect,
  // N for a polygon, full circle for a circle), validates each hit
  // against the union boundary so edges buried inside other primitives
  // don't trigger a phantom bounce, and returns the smallest positive-
  // t hit with a playable-area-outward normal. For `−` carves the
  // primitive-local outward normal points into the carve; we flip it
  // here so reflection treats the carve like a wall facing the player.
  _rayHitShapeWall(from, dir, shape) {
    const eps = 1e-3;
    let best = null;
    const consider = (t, nx, ny, hpx, hpy, p) => {
      if (t <= eps) return;
      if (!Shape._onUnionBoundary(p, hpx, hpy, nx, ny, shape)) return;
      const fnx = (p.sign === "-") ? -nx : nx;
      const fny = (p.sign === "-") ? -ny : ny;
      if (!best || t < best.t) best = { t, nx: fnx, ny: fny };
    };
    for (const p of shape) {
      if (p.type === "rect") {
        const l = p.cx - p.w / 2, t0 = p.cy - p.h / 2;
        const r = p.cx + p.w / 2, btm = p.cy + p.h / 2;
        const edges = [
          [l, t0,  r, t0,   0, -1],
          [r, t0,  r, btm,  1,  0],
          [r, btm, l, btm,  0,  1],
          [l, btm, l, t0,  -1,  0],
        ];
        for (const [x0, y0, x1, y1, nx, ny] of edges) {
          const tHit = this._raySegmentT(from, dir, x0, y0, x1, y1);
          if (tHit === null) continue;
          consider(tHit, nx, ny, from.x + dir.x * tHit, from.y + dir.y * tHit, p);
        }
      } else if (p.type === "polygon") {
        const pts = p.points;
        for (let i = 0; i < pts.length; i++) {
          const v0 = pts[i], v1 = pts[(i + 1) % pts.length];
          const ex = v1.x - v0.x, ey = v1.y - v0.y;
          const elen = Math.hypot(ex, ey);
          if (elen < 1e-9) continue;
          // CW (y-down) winding → outward normal = (dy, -dx) / |d|.
          const nx = ey / elen, ny = -ex / elen;
          const tHit = this._raySegmentT(from, dir, v0.x, v0.y, v1.x, v1.y);
          if (tHit === null) continue;
          consider(tHit, nx, ny, from.x + dir.x * tHit, from.y + dir.y * tHit, p);
        }
      } else if (p.type === "circle") {
        const ox = from.x - p.cx, oy = from.y - p.cy;
        const B = 2 * (ox * dir.x + oy * dir.y);
        const C = ox * ox + oy * oy - p.r * p.r;
        const disc = B * B - 4 * C;                  // dir is unit, A=1
        if (disc < 0) continue;
        const sq = Math.sqrt(disc);
        for (const tHit of [(-B - sq) / 2, (-B + sq) / 2]) {
          if (tHit <= eps) continue;
          const hpx = from.x + dir.x * tHit;
          const hpy = from.y + dir.y * tHit;
          consider(tHit, (hpx - p.cx) / p.r, (hpy - p.cy) / p.r, hpx, hpy, p);
        }
      }
    }
    return best;
  },
  // Ray-vs-line-segment in 2D. Returns the ray parameter t (≥ 0 when
  // in front of the ray's origin) at which `from + t*dir` crosses the
  // segment from (x0, y0) to (x1, y1), or null when they don't meet.
  _raySegmentT(from, dir, x0, y0, x1, y1) {
    const sx = x1 - x0, sy = y1 - y0;
    const det = sx * dir.y - sy * dir.x;
    if (Math.abs(det) < 1e-12) return null;
    const ax = x0 - from.x, ay = y0 - from.y;
    const t = (sx * ay - sy * ax) / det;
    const u = (dir.x * ay - dir.y * ax) / det;
    if (u < -1e-9 || u > 1 + 1e-9) return null;
    return t;
  },
  _commitLineMode() {
    if (!this._lineMode || !this._lineMode.start || !this._lineMode.end) return;
    const lm = this._lineMode;
    // Ctrl held at release engages ricochet; otherwise the line is the
    // straight finite drag the user sees on screen.
    const ricochet = !!mouse.ctrl;
    const segments = this._buildLineRicochets(lm.start, lm.end, ricochet, lm.bounces);
    this.pushHistory();
    for (const m of lm.motes) {
      const p = this._projectOntoSegments(m.c, segments);
      if (p) { m.c.x = p.x; m.c.y = p.y; }
    }
    const n = lm.motes.length;
    const bounces = segments.length - 1;
    this._lineMode = null;
    this.dirty = true;
    this.renderBar();
    const suffix = bounces > 0 ? ` (${bounces} bounce${bounces === 1 ? "" : "s"})` : "";
    toast(`Aligned ${n} circle${n === 1 ? "" : "s"} to line${suffix}`);
  },
  _cancelLineMode() {
    if (!this._lineMode) return;
    this._lineMode = null;
    this.renderBar();
    toast("Line cancelled");
  },

  _cancelRing() {
    if (!this._ring) return;
    for (const m of this._ring.motes) {
      m.c.x = m.originalX; m.c.y = m.originalY;
    }
    this._ring = null;
    toast("Ring cancelled");
  },

  orbitAll(reverse = false) {
    if (World.gravityCenters.length === 0) {
      toast("Place a gravity well first");
      return;
    }
    const usingSelection = this.selection.size > 0;
    const targets = (usingSelection ? [...this.selection] : World.circles)
      .filter(c => c !== World.player);
    if (targets.length === 0) {
      toast("Nothing to orbit");
      return;
    }
    this.pushHistory();
    const sign = reverse ? -1 : 1;
    let n = 0;
    for (const c of targets) {
      let nearest = World.gravityCenters[0];
      let nd = Infinity;
      for (const w of World.gravityCenters) {
        const d = Math.hypot(w.x - c.x, w.y - c.y);
        if (d < nd) { nd = d; nearest = w; }
      }
      const dx = c.x - nearest.x, dy = c.y - nearest.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      const v = Math.sqrt(nearest.strength / dist);
      c.vx = -dy / dist * v * sign;
      c.vy =  dx / dist * v * sign;
      n++;
    }
    this.dirty = true;
    const verb = reverse ? "Reverse-orbit" : "Orbit";
    const scope = usingSelection ? "selection" : "all";
    toast(`${verb} ${scope}: ${n} circle${n === 1 ? "" : "s"}`);
  },

  randomize() {
    if (this.selectedType !== LEVEL_TYPES.PACKED) {
      toast("Randomize is only for Packed box");
      return;
    }
    this.pushHistory();
    World.circles = [];
    if (World.player) World.player = null;

    const cellSize = 64;
    const b = World.bounds;
    const cols = Math.floor((b.w - 80) / cellSize);
    const rows = Math.floor((b.h - 80) / cellSize);
    const offsetX = (b.w - cols * cellSize) / 2 + cellSize / 2;
    const offsetY = (b.h - rows * cellSize) / 2 + cellSize / 2;
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);

    const tiers = [
      { weight: 0.50, rMin: 6,  rMax: 17 },
      { weight: 0.28, rMin: 18, rMax: 24 },
      { weight: 0.16, rMin: 25, rMax: 28 },
      { weight: 0.06, rMin: 28, rMax: 30 }
    ];
    const pickTier = () => {
      const roll = Math.random();
      let acc = 0;
      for (const t of tiers) { acc += t.weight; if (roll < acc) return t; }
      return tiers[tiers.length - 1];
    };

    const shape = World.activeShape();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (col === centerCol && row === centerRow) continue;     // leave for player
        const tier = pickTier();
        const r = tier.rMin + Math.random() * (tier.rMax - tier.rMin);
        const x = offsetX + col * cellSize;
        const y = offsetY + row * cellSize;
        // Skip cells that fall in carved regions of compound shapes.
        if (!Shape.containsCircle(shape, x, y, r)) continue;
        World.circles.push(new Circle(x, y, r, { kind: "neutral", hue: 200 + Math.random() * 80 }));
      }
    }
    toast(`Placed ${World.circles.length} circles — center is open`);
  },
});
