import { Circle } from "./circle.js";
import { KIND_META, radiusToMass } from "./core.js";
import { Editor } from "./editor.js";
import { editorBar, toast } from "./main.js";
import { World } from "./world.js";

// Editor — split across multiple files (see js/editor.js for state
// + dispatcher; this file holds one method group).
// Method group "selection" — extracted from editor.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(Editor, {


  // Align every selected circle along one axis. Edge-aligned (uses radius) so
  // mixed sizes stay flush. "vmid" = same Y at the bbox vertical centerline,
  // "hmid" = same X at the bbox horizontal centerline.
  alignSelection(mode) {
    if (this.selection.size < 2) return;
    this.pushHistory();
    const sel = [...this.selection];
    const minLeft   = Math.min(...sel.map(c => c.x - c.r));
    const maxRight  = Math.max(...sel.map(c => c.x + c.r));
    const minTop    = Math.min(...sel.map(c => c.y - c.r));
    const maxBottom = Math.max(...sel.map(c => c.y + c.r));
    if (mode === "left")   for (const c of sel) c.x = minLeft + c.r;
    if (mode === "right")  for (const c of sel) c.x = maxRight - c.r;
    if (mode === "top")    for (const c of sel) c.y = minTop + c.r;
    if (mode === "bottom") for (const c of sel) c.y = maxBottom - c.r;
    if (mode === "vmid")   { const cy = (minTop + maxBottom) / 2; for (const c of sel) c.y = cy; }
    if (mode === "hmid")   { const cx = (minLeft + maxRight) / 2; for (const c of sel) c.x = cx; }
    this.dirty = true;
  },

  // Distribute selected circles evenly along an axis. Endpoints are pinned;
  // middle items are repositioned so the gap between consecutive edges is
  // constant (edge-aware, mirroring alignSelection's radius handling).
  // axis: "v" = distribute along Y, "h" = along X.
  distributeSelection(axis) {
    if (this.selection.size < 3) return;
    this.pushHistory();
    const sel = [...this.selection];
    const get  = axis === "v" ? c => c.y : c => c.x;
    const set  = axis === "v" ? (c, v) => { c.y = v; } : (c, v) => { c.x = v; };
    sel.sort((a, b) => (get(a) - a.r) - (get(b) - b.r));
    const start = get(sel[0]) - sel[0].r;
    const end   = get(sel[sel.length - 1]) + sel[sel.length - 1].r;
    const totalDiameter = sel.reduce((s, c) => s + 2 * c.r, 0);
    const gap = ((end - start) - totalDiameter) / (sel.length - 1);
    let cursor = start;
    for (const c of sel) {
      set(c, cursor + c.r);
      cursor += 2 * c.r + gap;
    }
    this.dirty = true;
  },

  // Toolbar isn't re-rendered on selection changes (those happen via mouse
  // clicks/drags), so each frame we (a) re-render when emptiness flips so
  // the velocity inspector appears/disappears, and (b) cheaply update the
  // orbit button labels and inspector field values otherwise.
  _syncToolbarToSelection() {
    const hasSel = this.selection.size > 0;
    const hasRing = !!this._ring;
    const hasWells = World.gravityCenters.length > 0;
    if (!!hasSel !== !!this._prevHasSel ||
        hasRing !== !!this._prevHasRing ||
        hasWells !== !!this._prevHasWells) {
      this._prevHasSel = hasSel;
      this._prevHasRing = hasRing;
      this._prevHasWells = hasWells;
      this.renderBar();
      return;
    }
    this._refreshOrbitButtons();
    this._refreshVelocityInspector();
  },
  _refreshOrbitButtons() {
    const a = document.getElementById("ed-orbit");
    const b = document.getElementById("ed-orbit-reverse");
    if (!a || !b) return;
    const sel = this.selection.size > 0;
    const aLabel = sel ? "Orbit selection" : "Orbit all";
    const bLabel = sel ? "Reverse-orbit selection" : "Reverse orbit";
    if (a.textContent !== aLabel) a.textContent = aLabel;
    if (b.textContent !== bLabel) b.textContent = bLabel;
  },
  _selectionCommon(prop) {
    const items = [...this.selection];
    if (items.length === 0) return null;
    const first = items[0][prop];
    for (const c of items) if (Math.abs(c[prop] - first) > 0.001) return "";
    return Math.round(first);
  },
  _refreshVelocityInspector() {
    const focused = document.activeElement;
    const setIf = (el, val) => {
      if (!el || el === focused) return;
      const s = val === "" || val === null ? "" : String(val);
      if (el.value !== s) el.value = s;
    };
    setIf(document.getElementById("ed-vx"), this._selectionCommon("vx"));
    setIf(document.getElementById("ed-vy"), this._selectionCommon("vy"));
    setIf(document.getElementById("ed-sr"), this._selectionCommon("r"));
  },

  _nearestCircle(wp) {
    let best = null, bestD = Infinity;
    for (const c of World.circles) {
      const d = Math.hypot(c.x - wp.x, c.y - wp.y);
      if (d < c.r + 6 && d < bestD) { best = c; bestD = d; }
    }
    return best;
  },
  _nearestWell(wp) {
    let best = null, bestD = Infinity;
    for (const w of World.gravityCenters) {
      const d = Math.hypot(w.x - wp.x, w.y - wp.y);
      if (d < 60 && d < bestD) { best = w; bestD = d; }
    }
    return best;
  },
  _placeAt(x, y, hueFor) {
    if (this.selectedKind === "well") {
      const strength = Math.round(40_000 * Math.pow(this.selectedSize, 1.6));
      World.gravityCenters.push({ x, y, strength });
    } else if (this.selectedKind === "player") {
      if (World.player) {
        World.player.x = x; World.player.y = y;
        World.player.mass = radiusToMass(this.selectedSize);
      } else {
        World.player = new Circle(x, y, this.selectedSize, { kind: "player", hue: 180 });
        World.circles.push(World.player);
      }
    } else {
      World.circles.push(new Circle(x, y, this.selectedSize,
        { kind: this.selectedKind, hue: hueFor(this.selectedKind) }));
    }
  },

  // Tweak the focused toolbar field by one step. Selects accept either axis;
  // sliders / numbers prefer the horizontal axis but also respond to up/down.
  _padAdjustField(dx, dy) {
    const ae = document.activeElement;
    if (!ae || !editorBar.contains(ae)) return;
    if (ae.tagName === "SELECT") {
      const n = ae.options.length;
      if (n === 0) return;
      const dir = dy !== 0 ? dy : dx;
      let idx = ae.selectedIndex + dir;
      idx = Math.max(0, Math.min(n - 1, idx));
      if (idx !== ae.selectedIndex) {
        ae.selectedIndex = idx;
        ae.dispatchEvent(new Event("input",  { bubbles: true }));
        ae.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else if (ae.tagName === "INPUT" && (ae.type === "range" || ae.type === "number")) {
      const step = +(ae.step || 1) || 1;
      const min  = ae.min !== "" ? +ae.min : -Infinity;
      const max  = ae.max !== "" ? +ae.max :  Infinity;
      const dir  = dx !== 0 ? dx : -dy;     // up = +, down = -
      const cur  = +ae.value || 0;
      const next = Math.max(min, Math.min(max, cur + dir * step));
      if (next !== cur) {
        ae.value = next;
        ae.dispatchEvent(new Event("input",  { bubbles: true }));
        ae.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  },

  // A on a focused button or checkbox activates it (parallel to a mouse click).
  _padActivateField() {
    const ae = document.activeElement;
    if (!ae || !editorBar.contains(ae)) return;
    if (ae.tagName === "BUTTON") ae.click();
    else if (ae.tagName === "INPUT" && (ae.type === "checkbox" || ae.type === "radio")) ae.click();
  },

  // Step the placement size, clamped to the slider's min/max, and keep the
  // toolbar slider + readout in sync. While ring-placement preview is active,
  // the same input adjusts the ring's radius instead.
  _adjustSize(delta) {
    if (this._ring) {
      const speedup = Math.abs(delta) > 1 ? 4 : 2;
      this._ring.radius = Math.max(0, this._ring.radius + delta * speedup);
      this._applyRingPositions();
      return;
    }
    const next = Math.max(6, Math.min(120, this.selectedSize + delta));
    if (next === this.selectedSize) return;
    this.selectedSize = next;
    const v = document.getElementById("ed-size-v");
    const i = document.getElementById("ed-size");
    if (v) v.textContent = next;
    if (i) i.value = next;
  },
  // Grow / shrink every selected circle by `delta` px, clamped to the
  // standard radius range. Coalesces rapid wheel ticks into a single
  // undo entry so a long scroll burst is one Ctrl-Z to revert.
  _adjustSelectionRadius(delta) {
    if (this.selection.size === 0) return;
    if (!this._radiusBurstActive) {
      this.pushHistory();
      this._radiusBurstActive = true;
    }
    clearTimeout(this._radiusBurstTimer);
    this._radiusBurstTimer = setTimeout(() => { this._radiusBurstActive = false; }, 250);
    let any = false;
    for (const c of this.selection) {
      const next = Math.max(6, Math.min(120, c.r + delta));
      if (next !== c.r) { c.r = next; any = true; }
    }
    if (any) {
      this.dirty = true;
      // Mirror the new value into the toolbar's r field (or blank when
      // selection radii diverge after clamping).
      this._syncToolbarToSelection();
    }
  },

  _padPlace() {
    this.pushHistory();
    const wp = this._snap(this.hoverWorld);
    const hueFor = kind => kind === "player" ? 180 :
                            kind === "__kut__" ? 320 :
                            KIND_META[kind] ? KIND_META[kind].hue : 200 + Math.random()*80;
    for (const pos of this._mirrorPositions(wp)) this._placeAt(pos.x, pos.y, hueFor);
  },

  _padErase() {
    const wp = this._snap(this.hoverWorld);
    const target = this._nearestCircle(wp);
    if (target) {
      this.pushHistory();
      if (target === World.player) World.player = null;
      World.circles = World.circles.filter(c => c !== target);
      return;
    }
    const w = this._nearestWell(wp);
    if (w) {
      this.pushHistory();
      World.gravityCenters = World.gravityCenters.filter(o => o !== w);
    }
  },

  // Selection commands ---------------------------------------------
  deleteSelection() {
    if (this.selection.size === 0) return;
    this.pushHistory();
    for (const c of this.selection) {
      if (c === World.player) World.player = null;
    }
    World.circles = World.circles.filter(c => !this.selection.has(c));
    this.selection.clear();
  },
  copySelection() {
    if (this.selection.size === 0) return;
    // Anchor relative to the centroid of the selection so paste lands at the cursor.
    let cx = 0, cy = 0, n = 0;
    for (const c of this.selection) { cx += c.x; cy += c.y; n++; }
    cx /= n; cy /= n;
    this.clipboard = [...this.selection].map(c => ({
      dx: c.x - cx, dy: c.y - cy, r: c.r,
      kind: c.kind === "player" ? "neutral" : c.kind, hue: c.hue,
      vx: c.vx || 0, vy: c.vy || 0
    }));
    toast(`Copied ${n} circle${n>1?"s":""}`);
  },
  pasteAtCursor() {
    if (this.clipboard.length === 0) return;
    if (!this.hoverWorld) return;
    this.pushHistory();
    const wp = this._snap(this.hoverWorld);
    const placed = [];
    // Paste once per mirror copy; mirrored copies get reflected positions
    // (relative to the pasted-anchor's mirror) AND reflected velocities.
    const anchors = this._mirrorPositions(wp);
    for (const a of anchors) {
      for (const e of this.clipboard) {
        const c = new Circle(a.x + e.dx * a.sx, a.y + e.dy * a.sy, e.r,
          { kind: e.kind, hue: e.hue, vx: e.vx * a.sx, vy: e.vy * a.sy });
        World.circles.push(c);
        placed.push(c);
      }
    }
    this.selection = new Set(placed);
  },
  duplicateSelection() {
    if (this.selection.size === 0) return;
    this.copySelection();
    // Offset slightly so duplicates don't overlap the originals.
    for (const e of this.clipboard) { e.dx += 12; e.dy += 12; }
    this.pasteAtCursor();
  },
});
