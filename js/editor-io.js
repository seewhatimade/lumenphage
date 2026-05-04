import { Audio_ } from "./audio.js";
import { Circle } from "./circle.js";
import { TAU, VICTORY_CONDITIONS } from "./core.js";
import { Editor } from "./editor.js";
import { Game } from "./game.js";
import { Kinds } from "./kinds.js";
import { Campaign, editorBar, editorHelp, hud, toast } from "./main.js";
import { Player } from "./player.js";
import { Presets } from "./presets.js";
import { Settings } from "./settings.js";
import { Shape } from "./shape.js";
import { UI } from "./ui.js";
import { View } from "./view.js";
import { World } from "./world.js";

// Editor — split across multiple files (see js/editor.js for state
// + dispatcher; this file holds one method group).
// Method group "io" — extracted from editor.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(Editor, {


  serialize() {
    const circles = World.circles.map(c => ({
      x: c.x, y: c.y, r: c.r, kind: c.kind, hue: c.hue,
      vx: c.vx, vy: c.vy
    }));
    return {
      type: World.type,
      bounds: World.bounds,
      // Explicit playable-area shape if the editor authored one;
      // otherwise omit and let deserialize derive from bounds.
      shape: World.shape && World.shape.length ? World.shape : null,
      insideColor:  World.insideColor,
      outsideColor: World.outsideColor,
      edgeColor:    World.edgeColor,
      gravityCenters: World.gravityCenters,
      randomVelocity: this.randomVelocity,
      victoryCondition: this.victoryCondition,
      victoryParam: this.victoryParam,
      // Embed any user-kind defs referenced by these circles. On load these
      // take precedence over the local registry so a shared level plays the
      // same regardless of what's in the recipient's library.
      kinds: Kinds.collectUsedKinds(circles),
      circles
    };
  },

  deserialize(data) {
    World.reset();
    // Apply level-embedded kind defs *first* so anything that reads
    // KIND_META during/after deserialize (rendering, AI dispatch) sees the
    // level's view of each kind.
    Kinds.applyLevelOverrides(data.kinds || []);
    World.type   = data.type;
    World.bounds = data.bounds;
    // Migration: legacy designs (no `shape`) play as a single rect
    // derived from `bounds` via World.activeShape().
    World.shape  = (Array.isArray(data.shape) && data.shape.length) ? data.shape : null;
    if (typeof data.insideColor  === "string") World.insideColor  = data.insideColor;
    if (typeof data.outsideColor === "string") World.outsideColor = data.outsideColor;
    if (typeof data.edgeColor    === "string") World.edgeColor    = data.edgeColor;
    // When an explicit shape is present, snap bounds to its AABB so
    // bounds/shape can't disagree (camera + grid + spawn helpers all
    // read from bounds).
    if (World.shape) {
      const ab = Shape.aabb(World.shape);
      World.bounds = { x: ab.x, y: ab.y, w: ab.w, h: ab.h };
    }
    if (Array.isArray(data.gravityCenters)) {
      World.gravityCenters = data.gravityCenters.map(w => ({ ...w }));
    } else if (data.gravityCenter) {
      // Backward compat with the single-well save format.
      World.gravityCenters = [{
        x: data.gravityCenter.x, y: data.gravityCenter.y,
        strength: data.gravityStrength || 2_000_000
      }];
    }
    this.selectedType     = data.type;
    this.randomVelocity   = !!data.randomVelocity;
    this.victoryCondition = data.victoryCondition || VICTORY_CONDITIONS.ABSORB_ALL;
    this.victoryParam     = data.victoryParam || 60;
    for (const cd of data.circles) {
      const c = new Circle(cd.x, cd.y, cd.r, {
        kind: cd.kind, hue: cd.hue, vx: cd.vx || 0, vy: cd.vy || 0
      });
      if (cd.kind === "player") World.player = c;
      World.circles.push(c);
    }
    this._matchAppliedPalette();
  },

  // Apply editor-controlled options to the world right before play begins.
  applySettingsToWorld() {
    World.victoryCondition = this.victoryCondition;
    World.victoryParam     = this.victoryParam;
    if (this.randomVelocity) {
      for (const c of World.circles) {
        if (c === World.player) continue;
        const a = World.rand() * TAU;
        const v = 20 + World.rand() * 50;
        c.vx = Math.cos(a) * v;
        c.vy = Math.sin(a) * v;
      }
    }
  },

  // Read all designs, with one-time migration of the old single-slot key.
  _readDesigns() {
    let designs = [];
    try {
      const raw = localStorage.getItem("lumenphage.designs");
      designs = raw ? JSON.parse(raw) : [];
    } catch { designs = []; }
    try {
      const old = localStorage.getItem("lumenphage.level");
      if (old && !designs.some(d => d.name === "Migrated")) {
        designs.push({ name: "Migrated", data: JSON.parse(old) });
        localStorage.setItem("lumenphage.designs", JSON.stringify(designs));
        localStorage.removeItem("lumenphage.level");
      }
    } catch {}
    return designs;
  },
  _writeDesigns(arr) {
    try { localStorage.setItem("lumenphage.designs", JSON.stringify(arr)); }
    catch (e) { toast("Save failed"); }
  },

  save() {
    UI.prompt({
      title: "SAVE DESIGN",
      message: "Name this design:",
      defaultValue: this._lastSavedName || "Untitled",
      yesLabel: "Save",
      onYes: (name) => {
        this._lastSavedName = name;
        const designs = this._readDesigns();
        const idx = designs.findIndex(d => d.name === name);
        const data = this.serialize();
        const writeAt = (i) => {
          if (i >= 0) designs[i] = { name, data };
          else designs.push({ name, data });
          this._writeDesigns(designs);
          this.dirty = false;
          toast(`Saved "${name}"`);
        };
        if (idx >= 0) {
          UI.confirm({
            title: "OVERWRITE DESIGN",
            message: `A design named "${name}" already exists. Overwrite it?`,
            yesLabel: "Overwrite",
            danger: true,
            onYes: () => writeAt(idx)
          });
        } else writeAt(idx);
      }
    });
  },

  load() {
    const userDesigns = this._readDesigns();
    const entries = userDesigns.map(d => ({
      source: "user",
      name: d.name,
      data: d.data,
      deletable: true
    }));

    // Dev mode pulls in every campaign level and preset for inspection in
    // the editor. They run their own build() functions on load rather than
    // being deserialized from saved JSON.
    if (Campaign.devModeEnabled()) {
      for (const lvl of Campaign.levels) {
        entries.push({
          source: "campaign",
          name: `Campaign · ${String(lvl.id).padStart(2, "0")}. ${lvl.name}`,
          info: `Stage: ${lvl.stage}`,
          deletable: false,
          build: lvl.build
        });
      }
      for (const p of Presets.list) {
        entries.push({
          source: "preset",
          name: `Preset · ${p.name}`,
          info: p.desc || "(preset)",
          deletable: false,
          build: p.build
        });
      }
    }

    if (entries.length === 0) { toast("No saved designs yet"); return; }

    const backToDesigner = () => {
      Game.state = "designer";
      UI.clearOverlay();
    };
    UI.renderDesignList(entries, (name, action) => {
      const e = entries.find(x => x.name === name);
      if (!e) return;
      if (action === "load") {
        if (e.source === "user") {
          this.selection.clear();
          this._ring = null; this._lineMode = null; this._moveDrag = null; this._velDragMote = null;
          this.deserialize(e.data);
          this._lastSavedName = e.name;
          this._recenterCamera();
          this.renderBar();
          this.dirty = false;
        } else {
          this._loadFromBuilder(e.build, e.name);
        }
        backToDesigner();
        toast(`Loaded "${e.name}"`);
      } else if (action === "delete") {
        if (!e.deletable) return;
        UI.confirm({
          title: "DELETE DESIGN",
          message: `Permanently delete design "${e.name}"?`,
          yesLabel: "Delete",
          danger: true,
          onYes: () => {
            const next = userDesigns.filter(x => x.name !== e.name);
            this._writeDesigns(next);
            toast(`Deleted "${e.name}"`);
          },
          restore: () => this.load()    // re-show updated list
        });
      }
    }, /*forPlay=*/false, /*onBack=*/backToDesigner);
  },

  // Run a level builder (campaign or preset) and pull the resulting world
  // into the editor. Builders typically call World.reset() themselves; we
  // also reset victory defaults so a builder that leaves them untouched
  // doesn't inherit stale values from a previous load.
  _loadFromBuilder(buildFn, name) {
    this.selection.clear();
    this._ring = null; this._lineMode = null; this._moveDrag = null; this._velDragMote = null;
    World.reset();
    World.victoryCondition = VICTORY_CONDITIONS.ABSORB_ALL;
    World.victoryParam = 60;
    buildFn();
    this.selectedType = World.type;
    this.victoryCondition = World.victoryCondition;
    this.victoryParam = World.victoryParam;
    this.randomVelocity = false;
    this._lastSavedName = name;
    this._recenterCamera();
    this.renderBar();
    this.dirty = false;
  },

  // ---- Import: read a previously-exported JSON file ----------------
  importLevel() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          // Accept either an envelope or a raw level object.
          const data = (parsed && parsed.format && parsed.format.startsWith("lumenphage-level/"))
            ? parsed.data
            : parsed;
          if (!data || !data.circles) { toast("Not a valid level file"); return; }
          this.pushHistory();
          this.deserialize(data);
          if (parsed && parsed.name) this._lastSavedName = parsed.name;
          this._recenterCamera();
          this.renderBar();
          toast(`Imported${parsed && parsed.name ? ` "${parsed.name}"` : ""}`);
        } catch (e) {
          toast("Import failed: " + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  // Export the current design as a downloadable JSON file. Wrapped in an
  // envelope so format/version checks are possible.
  exportLevel() {
    if (World.circles.length === 0) { toast("Nothing to export"); return; }
    const defaultName = (this._lastSavedName || "untitled").replace(/[^a-z0-9_-]+/gi, "_");
    UI.prompt({
      title: "EXPORT DESIGN",
      message: "Filename (without .json extension):",
      defaultValue: defaultName,
      yesLabel: "Download",
      onYes: (rawName) => {
        const name = rawName.replace(/[^a-z0-9_-]+/gi, "_");
        const payload = {
          format: "lumenphage-level/v1",
          name,
          exportedAt: new Date().toISOString(),
          data: this.serialize()
        };
        try {
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = name + ".json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          toast(`Exported "${name}.json"`);
        } catch (e) {
          toast("Export failed");
        }
      }
    });
  },

  // Used from the main menu's "Play custom level..." entry.
  loadAndPlay() {
    const designs = this._readDesigns();
    if (designs.length === 0) { toast("No saved designs yet — design one first"); return; }
    UI.renderDesignList(designs, (name, action) => {
      const d = designs.find(x => x.name === name);
      if (!d) return;
      if (action === "load") {
        this._launchDesign(name, d.data);
      } else if (action === "delete") {
        UI.confirm({
          title: "DELETE DESIGN",
          message: `Permanently delete design "${name}"?`,
          yesLabel: "Delete",
          danger: true,
          onYes: () => {
            const next = designs.filter(x => x.name !== name);
            this._writeDesigns(next);
            toast(`Deleted "${name}"`);
          },
          restore: () => this.loadAndPlay()
        });
      }
    }, /*forPlay=*/true, /*onBack=*/() => Game.toMenu());
  },

  // Shared launch path for "play a saved design" — used by both the initial
  // load-and-play and the post-death replay. Returns true if launched.
  _launchDesign(name, data) {
    Audio_.init(); Audio_.resume(); Audio_.startMusic();
    this.deserialize(data);
    if (!World.player) { toast("This design has no player — open it in the editor"); return false; }
    this.applySettingsToWorld();
    Player.aim = 0;
    View.snapToPlayer({ intro: !!Settings.load().introZoom, duration: Settings.load().introZoomDuration });
    Game.state = "playing"; Game.paused = false; Game.endHandled = false;
    Game.campaignLevelId = null;
    Game.currentStatsKey = null;
    // Bypass the generic replay/reroll plumbing — design replay uses
    // Editor._lastPlayedDesign instead, and we don't want a stale
    // "New random" button to show up on the end screen.
    Game._replay = null; Game._replayMusic = null; Game._reroll = null;
    World.levelName = name;
    UI.clearOverlay();
    hud.classList.remove("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Editor.active = false;
    Editor.testStash = null;   // not a test session
    // Snapshot so "Try again" can replay the same design rather than
    // falling through to a randomly generated level of the same type.
    Editor._lastPlayedDesign = { name, data: JSON.parse(JSON.stringify(data)) };
    return true;
  },

  play() {
    if (!World.player) { toast("Place a player circle first"); return; }
    Audio_.init(); Audio_.resume(); Audio_.startMusic();
    // Snapshot the editor state so we can come back here if the player dies.
    this.testStash = this.serialize();
    this.applySettingsToWorld();
    World.levelName = (this._lastSavedName || "Custom design") + " — testing";
    Player.aim = 0;
    View.snapToPlayer({ intro: !!Settings.load().introZoom, duration: Settings.load().introZoomDuration });
    Game.state = "playing"; Game.paused = false; Game.endHandled = false;
    hud.classList.remove("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    this.active = false;
  },

  // "Play again" from the win/lose screen of a designer test session —
  // re-deserializes the stashed design and starts a fresh play with the
  // same testStash intact, so post-replay still offers Return to designer.
  replayTest() {
    if (!this.testStash) return false;
    Audio_.init(); Audio_.resume(); Audio_.startMusic();
    this.deserialize(this.testStash);
    if (!World.player) { toast("Stashed design has no player"); return false; }
    this.applySettingsToWorld();
    World.levelName = (this._lastSavedName || "Custom design") + " — testing";
    Player.aim = 0;
    View.snapToPlayer({ intro: !!Settings.load().introZoom, duration: Settings.load().introZoomDuration });
    Game.state = "playing"; Game.paused = false; Game.endHandled = false;
    Game.endHandled = false;
    Game.campaignLevelId = null;
    Game.currentStatsKey = null;
    Game._replay = null; Game._replayMusic = null; Game._reroll = null;
    UI.clearOverlay();
    hud.classList.remove("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    this.active = false;
    return true;
  },

  // Restore the editor with the snapshot taken at Play time.
  returnFromTest() {
    if (!this.testStash) { Game.toMenu(); return; }
    const stash = this.testStash;
    this.testStash = null;
    Audio_.stopMusic();
    Game.state = "designer";
    Game.endHandled = false;
    this.deserialize(stash);
    this.active = true;
    UI.clearOverlay();
    hud.classList.add("hidden");
    editorBar.classList.remove("hidden"); editorHelp.classList.remove("hidden");
    this._centerOnPlayer();
    this.renderBar();
    toast("Back to designer");
  },

  saveTestCase(opts = {}) {
    const tc = this.testCaseMode;
    if (!tc) return;
    const kind = Kinds.userKinds().find(k => k.id === tc.kindId);
    if (!kind) { toast("Kind missing"); return; }
    const tests = (kind.tests || []).map(t => t.id === tc.testId
      ? { ...t, layout: this.serialize(), seed: tc.seed }
      : t);
    Kinds.update(tc.kindId, { tests });
    this.dirty = false;
    tc.dirty = false;
    if (!opts.silent) toast(`Saved test "${tc.name}"`);
  },
});
