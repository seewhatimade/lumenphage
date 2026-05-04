import { _shapeSampleCache } from "./main.js";

// Shape — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

export const Shape = {
  SAMPLE_SPACING: 8,

  // Default shape from a (w, h) rectangle — used by migration of legacy
  // levels that only had bounds.
  fromBounds(w, h) {
    return [{ type: "rect", cx: w / 2, cy: h / 2, w, h, sign: "+" }];
  },

  // Predicate: is (x, y) inside the playable area? Uses ordered
  // (painter's-algorithm) CSG — each primitive that contains the
  // point overrides the previous result, so a sequence like "+ rect,
  // - hole, + bridge" gives back the bridge in the carved area. Order
  // in the World.shape array matters; later primitives win where they
  // overlap earlier ones.
  isInside(shape, x, y) {
    let inside = false;
    for (const p of shape) {
      if (this._inPrimitive(p, x, y)) inside = (p.sign === "+");
    }
    return inside;
  },

  // Compute the playable state at (x, y), optionally substituting an
  // explicit containment value for one primitive (so callers can ask
  // "what would the state be if p's interior included this point /
  // didn't include this point?"). Used by `_onUnionBoundary` to
  // detect whether a primitive's edge actually contributes to the
  // union boundary by toggling that primitive's containment.
  _stateAt(shape, x, y, pIgnore, pIncludeOverride) {
    let inside = false;
    for (const p of shape) {
      const contains = (p === pIgnore) ? pIncludeOverride : this._inPrimitive(p, x, y);
      if (contains) inside = (p.sign === "+");
    }
    return inside;
  },

  // True iff (x, y) is inside the closed extent of a single primitive.
  _inPrimitive(p, x, y) {
    if (p.type === "rect") {
      const hx = p.w / 2, hy = p.h / 2;
      return Math.abs(x - p.cx) <= hx && Math.abs(y - p.cy) <= hy;
    }
    if (p.type === "circle") {
      const dx = x - p.cx, dy = y - p.cy;
      return dx * dx + dy * dy <= p.r * p.r;
    }
    if (p.type === "polygon") {
      // Standard ray-cast for the strict interior, then a closed-boundary
      // fallback so points lying exactly ON a polygon edge are also
      // "inside". Without this, a "+" primitive's edge that runs along
      // a "-" polygon's edge would be considered "not buried", and the
      // carve wouldn't suppress it — the rect/circle _inPrimitive uses
      // closed boundaries, so polygons match that convention.
      const pts = p.points;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        if (((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      if (inside) return true;
      const TOL = 0.5;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        if (this._pointToSegmentDistance(x, y, pts[i].x, pts[i].y, pts[j].x, pts[j].y) <= TOL) return true;
      }
      return false;
    }
    return false;
  },

  // True iff (x, y) is strictly inside the primitive's interior, beyond
  // a tolerance `tol` from any edge. Used by the boundary-visibility
  // filter so points lying *on* a shared edge are not rejected.
  _strictlyInside(p, x, y, tol) {
    if (p.type === "rect") {
      const hx = p.w / 2 - tol, hy = p.h / 2 - tol;
      return Math.abs(x - p.cx) < hx && Math.abs(y - p.cy) < hy;
    }
    if (p.type === "circle") {
      const rr = p.r - tol;
      if (rr <= 0) return false;
      const dx = x - p.cx, dy = y - p.cy;
      return dx * dx + dy * dy < rr * rr;
    }
    if (p.type === "polygon") {
      if (!this._inPrimitive(p, x, y)) return false;
      const pts = p.points;
      for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        if (this._pointToSegmentDistance(x, y, pts[i].x, pts[i].y, pts[j].x, pts[j].y) < tol) return false;
      }
      return true;
    }
    return false;
  },

  // Distance from (px, py) to the segment from (ax, ay) to (bx, by).
  _pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  },

  // Signed polygon area in canvas (Y-down) coordinates. Positive = CW
  // visually, negative = CCW. Used to pick a consistent outward-normal
  // direction when sampling polygon edges.
  _polygonSignedArea(points) {
    let s = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      s += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return s / 2;
  },

  // Construct a polygon primitive from a list of {x, y} points, copying
  // them and reorienting so signed area > 0 (CW in y-down). The sample
  // walker assumes that orientation when emitting outward normals.
  makePolygon(points, sign) {
    const copy = points.map(p => ({ x: p.x, y: p.y }));
    if (this._polygonSignedArea(copy) < 0) copy.reverse();
    return { type: "polygon", points: copy, sign };
  },

  // Axis-aligned bounding box across all "+" primitives. "-" primitives
  // never grow the AABB. Returns { x, y, w, h }; { 0,0,0,0 } if empty.
  aabb(shape) {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const p of shape) {
      if (p.sign !== "+") continue;
      let l, t, r, b;
      if (p.type === "rect") {
        l = p.cx - p.w / 2; t = p.cy - p.h / 2;
        r = p.cx + p.w / 2; b = p.cy + p.h / 2;
      } else if (p.type === "circle") {
        l = p.cx - p.r; t = p.cy - p.r;
        r = p.cx + p.r; b = p.cy + p.r;
      } else if (p.type === "polygon") {
        l = Infinity; t = Infinity; r = -Infinity; b = -Infinity;
        for (const v of p.points) {
          if (v.x < l) l = v.x;
          if (v.y < t) t = v.y;
          if (v.x > r) r = v.x;
          if (v.y > b) b = v.y;
        }
        if (!isFinite(l)) continue;
      } else continue;
      if (l < xMin) xMin = l;
      if (t < yMin) yMin = t;
      if (r > xMax) xMax = r;
      if (b > yMax) yMax = b;
    }
    if (!isFinite(xMin)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
  },

  // Generate every boundary sample on the primitive's perimeter, with
  // its primitive-local outward normal. Caller filters which samples
  // lie on the union boundary.
  _samplePrimitive(p, out) {
    const SP = this.SAMPLE_SPACING;
    if (p.type === "rect") {
      const l = p.cx - p.w / 2, t = p.cy - p.h / 2;
      const r = p.cx + p.w / 2, b = p.cy + p.h / 2;
      const edges = [
        { x0: l, y0: t, x1: r, y1: t, nx:  0, ny: -1 },
        { x0: r, y0: t, x1: r, y1: b, nx:  1, ny:  0 },
        { x0: r, y0: b, x1: l, y1: b, nx:  0, ny:  1 },
        { x0: l, y0: b, x1: l, y1: t, nx: -1, ny:  0 },
      ];
      for (const e of edges) {
        const len = Math.hypot(e.x1 - e.x0, e.y1 - e.y0);
        const n = Math.max(2, Math.ceil(len / SP));
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          out.push({
            p, px: e.x0 + (e.x1 - e.x0) * u, py: e.y0 + (e.y1 - e.y0) * u,
            nx: e.nx, ny: e.ny,
            sx0: e.x0, sy0: e.y0, sx1: e.x1, sy1: e.y1,
          });
        }
      }
    } else if (p.type === "circle") {
      const circumference = 2 * Math.PI * p.r;
      const n = Math.max(8, Math.ceil(circumference / SP));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const ux = Math.cos(a), uy = Math.sin(a);
        out.push({
          p, px: p.cx + ux * p.r, py: p.cy + uy * p.r, nx: ux, ny: uy,
        });
      }
    } else if (p.type === "polygon") {
      // Polygons are normalized to positive signed area (CW in y-down)
      // by makePolygon, so the outward normal of edge (i → i+1) is
      // (dy, -dx) / |d|. Walk each edge at SAMPLE_SPACING.
      const pts = p.points;
      for (let i = 0; i < pts.length; i++) {
        const v0 = pts[i], v1 = pts[(i + 1) % pts.length];
        const dx = v1.x - v0.x, dy = v1.y - v0.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        const nx = dy / len, ny = -dx / len;
        const n = Math.max(2, Math.ceil(len / SP));
        for (let k = 0; k <= n; k++) {
          const u = k / n;
          out.push({
            p, px: v0.x + dx * u, py: v0.y + dy * u, nx, ny,
            sx0: v0.x, sy0: v0.y, sx1: v1.x, sy1: v1.y,
          });
        }
      }
    }
  },

  // Compute the union-boundary sample list for the given shape. Uses
  // the same `_onUnionBoundary` predicate as the renderer so physics
  // and visuals agree on which edges are walls. The sample's nx/ny
  // (in primitive-local outward direction) is what the predicate
  // needs for its perpendicular-displacement test.
  _computeSamples(shape) {
    const raw = [];
    for (const p of shape) this._samplePrimitive(p, raw);
    const out = [];
    for (const s of raw) {
      if (!this._onUnionBoundary(s.p, s.px, s.py, s.nx, s.ny, shape)) continue;
      const nx = s.p.sign === "-" ? -s.nx : s.nx;
      const ny = s.p.sign === "-" ? -s.ny : s.ny;
      out.push({
        px: s.px, py: s.py, nx, ny, p: s.p,
        sx0: s.sx0, sy0: s.sy0, sx1: s.sx1, sy1: s.sy1,
      });
    }
    return out;
  },

  _samples(shape) {
    let s = _shapeSampleCache.get(shape);
    if (!s) { s = this._computeSamples(shape); _shapeSampleCache.set(shape, s); }
    return s;
  },

  // Drop the cached samples for the given shape. Call after mutating
  // any primitive in place (the editor uses immutable replacement
  // when possible to avoid this).
  invalidate(shape) { _shapeSampleCache.delete(shape); },

  // Nearest point on the union boundary to (x, y).
  // Returns { px, py, nx, ny, distance, signedDistance } where:
  //   - (px, py) is the sample's contact point on the union boundary
  //   - (nx, ny) is the playable-area outward normal at that point
  //   - distance / signedDistance is the analytical perpendicular
  //     distance to the source primitive's edge (so single-rect
  //     levels reproduce legacy wall-bounce exactly within float
  //     precision; rect-corner cases still pinball axis-by-axis,
  //     same as the 4-wall code)
  //   - signedDistance < 0 inside playable area, > 0 outside
  // Returns null for an empty shape.
  nearestBoundary(shape, x, y) {
    const samples = this._samples(shape);
    if (!samples.length) return null;
    let bestD2 = Infinity, best = null;
    for (const s of samples) {
      const dx = x - s.px, dy = y - s.py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = s; }
    }
    if (!best) return null;
    // Refine to analytical distance. Sample-only Euclidean distance
    // overestimates true wall depth by up to ~SAMPLE_SPACING/2 px,
    // which would let cells slide past walls without bouncing. For
    // straight segments (rect, polygon), the perpendicular projection
    // is clamped to the segment — when (x, y) projects past either
    // endpoint, distance and bounce normal switch to corner-to-player
    // so the player slides around the corner instead of teleporting
    // through a phantom wall continuation.
    const p = best.p;
    let distance;
    let nx = best.nx, ny = best.ny;
    let pxBest = best.px, pyBest = best.py;
    if (p && (p.type === "rect" || p.type === "polygon")) {
      const dx = best.sx1 - best.sx0, dy = best.sy1 - best.sy0;
      const len2 = dx * dx + dy * dy;
      let t = 0.5;
      if (len2 > 1e-9) {
        t = ((x - best.sx0) * dx + (y - best.sy0) * dy) / len2;
      }
      if (t <= 0 || t >= 1) {
        const ex = (t <= 0) ? best.sx0 : best.sx1;
        const ey = (t <= 0) ? best.sy0 : best.sy1;
        const ddx = x - ex, ddy = y - ey;
        distance = Math.hypot(ddx, ddy);
        if (distance > 1e-9) {
          // Bounce normal points from the endpoint toward the player,
          // so subtracting it pushes the player outward.
          nx = ddx / distance;
          ny = ddy / distance;
          // Apply the same "-" flip as the sample's stored normal
          // would have had — the corner direction is geometric, but
          // for "-" primitives the sample we picked already had its
          // normal flipped at sample time. Here we want the playable-
          // area outward at the corner. For convex carve corners
          // (e.g., the inside corner of a "-" shape), the corner-to-
          // player direction is correct as-is. For "+", same. So no
          // further flip is needed.
        }
        pxBest = ex; pyBest = ey;
      } else {
        distance = Math.abs((x - best.px) * best.nx + (y - best.py) * best.ny);
      }
    } else if (p && p.type === "circle") {
      const dxc = x - p.cx, dyc = y - p.cy;
      distance = Math.abs(Math.hypot(dxc, dyc) - p.r);
    } else {
      distance = Math.sqrt(bestD2);
    }
    const inside = this.isInside(shape, x, y);
    return {
      px: pxBest, py: pyBest, nx, ny,
      distance, signedDistance: inside ? -distance : distance,
    };
  },

  // Random point inside the shape via rejection sampling on the AABB.
  // `rng` is a () => [0,1) function (defaults to Math.random).
  randomInside(shape, rng = Math.random, tries = 200) {
    const bb = this.aabb(shape);
    if (bb.w <= 0 || bb.h <= 0) return null;
    for (let i = 0; i < tries; i++) {
      const x = bb.x + rng() * bb.w;
      const y = bb.y + rng() * bb.h;
      if (this.isInside(shape, x, y)) return { x, y };
    }
    return null;
  },

  // True iff a circle of radius r at (cx, cy) lies fully within the shape.
  containsCircle(shape, cx, cy, r) {
    if (!this.isInside(shape, cx, cy)) return false;
    const nb = this.nearestBoundary(shape, cx, cy);
    if (!nb) return false;
    return -nb.signedDistance >= r;
  },

  // True iff primitive p's edge at (x, y) contributes to the union
  // boundary under ordered CSG. Perpendicular-displacement test:
  // sample isInside slightly to either side of the edge along its
  // outward normal (nx, ny) and see if the state differs. This
  // captures every overlap case correctly — including coincident
  // edges where a toggle test would fail. eps must exceed any
  // primitive's closed-boundary tolerance (TOL=0.5 for polygons), so
  // 1 px is safe; finer constructions where two edges sit within
  // 1 px of each other would need a smaller eps.
  _onUnionBoundary(p, x, y, nx, ny, shape) {
    const eps = 1.0;
    const ix = x - nx * eps, iy = y - ny * eps;
    const ox = x + nx * eps, oy = y + ny * eps;
    return this.isInside(shape, ix, iy) !== this.isInside(shape, ox, oy);
  },

  // Bisect between u0 (validity = vAtU0) and u1 (validity != vAtU0)
  // along a parametric edge to find the exact transition point. 14
  // iterations resolves the transition to ~1/16384 of the edge length.
  _bisectEdge(p, x0, y0, x1, y1, nx, ny, u0, u1, vAtU0, shape) {
    let lo = u0, hi = u1;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      const mx = x0 + (x1 - x0) * mid;
      const my = y0 + (y1 - y0) * mid;
      if (this._onUnionBoundary(p, mx, my, nx, ny, shape) === vAtU0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  },
  // Same bisection for an arc parameterised by angle. Normal is
  // recomputed at each test point (radial outward from circle's
  // centre).
  _bisectArc(p, a0, a1, vAtA0, shape) {
    let lo = a0, hi = a1;
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      const nx = Math.cos(mid), ny = Math.sin(mid);
      const mx = p.cx + nx * p.r;
      const my = p.cy + ny * p.r;
      if (this._onUnionBoundary(p, mx, my, nx, ny, shape) === vAtA0) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  },

  // Walk a straight edge from (x0,y0) to (x1,y1) belonging to primitive
  // p, append visible segments to `out`. Shared by rect and polygon.
  // (nx, ny) is the edge's outward normal (any consistent perpendicular
  // — the perpendicular-displacement test in `_onUnionBoundary`
  // doesn't depend on direction).
  _emitVisibleEdge(p, x0, y0, x1, y1, nx, ny, shape, out) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const STEPS = Math.max(8, Math.ceil(len / this.SAMPLE_SPACING));
    let runU0 = -1, prevValid = false;
    for (let i = 0; i <= STEPS; i++) {
      const u = i / STEPS;
      const px = x0 + (x1 - x0) * u;
      const py = y0 + (y1 - y0) * u;
      const valid = this._onUnionBoundary(p, px, py, nx, ny, shape);
      if (i === 0) {
        if (valid) runU0 = 0;
      } else if (valid !== prevValid) {
        const tu = this._bisectEdge(p, x0, y0, x1, y1, nx, ny, (i - 1) / STEPS, u, prevValid, shape);
        if (prevValid) {
          const ux = x0 + (x1 - x0) * runU0, uy = y0 + (y1 - y0) * runU0;
          const vx = x0 + (x1 - x0) * tu,    vy = y0 + (y1 - y0) * tu;
          out.push({ type: "line", x0: ux, y0: uy, x1: vx, y1: vy });
          runU0 = -1;
        } else {
          runU0 = tu;
        }
      }
      prevValid = valid;
    }
    if (runU0 >= 0) {
      const ux = x0 + (x1 - x0) * runU0, uy = y0 + (y1 - y0) * runU0;
      out.push({ type: "line", x0: ux, y0: uy, x1, y1 });
    }
  },

  // Build a list of visible boundary segments — the runs of each
  // primitive's edge that lie on the union boundary. Returns a list
  // of segment descriptors:
  //   { type: "line", x0, y0, x1, y1 }
  //   { type: "arc",  cx, cy, r, a0, a1 }
  // Sample-by-sample walk locates each validity transition between
  // adjacent samples, then bisection refines the exact transition
  // point — so segment endpoints land on the geometric crossing
  // instead of snapping to a coarse sample, giving clean joins
  // between "+" and "-" boundaries.
  visibleSegments(shape) {
    const out = [];
    for (const p of shape) {
      if (p.type === "rect") {
        const l = p.cx - p.w / 2, t = p.cy - p.h / 2;
        const r = p.cx + p.w / 2, b = p.cy + p.h / 2;
        // Each edge with its outward normal (axis-aligned).
        const edges = [
          [l, t, r, t,  0, -1], // top
          [r, t, r, b,  1,  0], // right
          [r, b, l, b,  0,  1], // bottom
          [l, b, l, t, -1,  0], // left
        ];
        for (const [x0, y0, x1, y1, nx, ny] of edges) {
          this._emitVisibleEdge(p, x0, y0, x1, y1, nx, ny, shape, out);
        }
      } else if (p.type === "polygon") {
        // Polygon edge outward normal in CW (y-down) is (dy, -dx) / |d|.
        const pts = p.points;
        for (let i = 0; i < pts.length; i++) {
          const v0 = pts[i], v1 = pts[(i + 1) % pts.length];
          const dx = v1.x - v0.x, dy = v1.y - v0.y;
          const len = Math.hypot(dx, dy);
          if (len < 1e-9) continue;
          const nx = dy / len, ny = -dx / len;
          this._emitVisibleEdge(p, v0.x, v0.y, v1.x, v1.y, nx, ny, shape, out);
        }
      } else if (p.type === "circle") {
        const STEPS = 128;
        // Per-sample radial normal — unlike straight edges, the
        // perpendicular changes around the arc.
        let runA0 = null, prevValid = false;
        for (let i = 0; i <= STEPS; i++) {
          const a = (i / STEPS) * Math.PI * 2;
          const nx = Math.cos(a), ny = Math.sin(a);
          const px = p.cx + nx * p.r;
          const py = p.cy + ny * p.r;
          const valid = i < STEPS ? this._onUnionBoundary(p, px, py, nx, ny, shape) : prevValid;
          if (i === 0) {
            if (valid) runA0 = 0;
          } else if (valid !== prevValid) {
            const ta = this._bisectArc(p, (i - 1) * (2 * Math.PI) / STEPS, a, prevValid, shape);
            if (prevValid) {
              out.push({ type: "arc", cx: p.cx, cy: p.cy, r: p.r, a0: runA0, a1: ta });
              runA0 = null;
            } else {
              runA0 = ta;
            }
          }
          prevValid = valid;
        }
        if (runA0 !== null) {
          out.push({ type: "arc", cx: p.cx, cy: p.cy, r: p.r, a0: runA0, a1: 2 * Math.PI });
        }
      }
    }
    return out;
  },
};
