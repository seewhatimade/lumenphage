import { Editor } from "./editor.js";
import { toast } from "./main.js";
import { World } from "./world.js";

// Editor — split across multiple files (see js/editor.js for state
// + dispatcher; this file holds one method group).
// Method group "history" — extracted from editor.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(Editor, {
    // unsaved-work tracker for the exit confirm
  // Snapshot selection as circle-array indices so it can survive deserialize,
  // which replaces every Circle instance and would otherwise leave the
  // selection Set holding orphaned references.
  _snapshotSelection() {
    const idx = [];
    for (let i = 0; i < World.circles.length; i++) {
      if (this.selection.has(World.circles[i])) idx.push(i);
    }
    return idx;
  },
  _restoreSelection(idx) {
    this.selection.clear();
    if (!idx) return;
    for (const i of idx) {
      if (i >= 0 && i < World.circles.length) this.selection.add(World.circles[i]);
    }
  },
  _snapshot() {
    return { json: JSON.stringify(this.serialize()), sel: this._snapshotSelection() };
  },
  pushHistory() {
    try {
      this.history.push(this._snapshot());
      if (this.history.length > 80) this.history.shift();
      this.future.length = 0;
      this.dirty = true;
    } catch {}
  },
  undo() {
    if (this.history.length === 0) { toast("Nothing to undo"); return; }
    try {
      this.future.push(this._snapshot());
      const prev = this.history.pop();
      this.deserialize(JSON.parse(prev.json));
      this._restoreSelection(prev.sel);
      this._ring = null;   // stale Circle refs after deserialize
      // If the user is editing the shape, keep the visible default rect.
      if (this.tool === "shape") this._ensureShape();
      this._recenterCamera();
      this.renderBar();
    } catch {}
  },
  redo() {
    if (this.future.length === 0) { toast("Nothing to redo"); return; }
    try {
      this.history.push(this._snapshot());
      const next = this.future.pop();
      this.deserialize(JSON.parse(next.json));
      this._restoreSelection(next.sel);
      this._ring = null;
      if (this.tool === "shape") this._ensureShape();
      this._recenterCamera();
      this.renderBar();
    } catch {}
  },
});
