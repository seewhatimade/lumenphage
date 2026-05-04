import { Audio_ } from "./audio.js";
import { ColorPalette } from "./color-palette.js";
import { KIND_META, LEVEL_TYPES, TAU, VICTORY_CONDITIONS } from "./core.js";
import { Game } from "./game.js";
import { JsonPanel } from "./json-panel.js";
import { Kinds } from "./kinds.js";
import { Campaign, EDITOR_KIND_DESC, H, W, ctx, editorBar, editorHelp, hud, hueColor, isPadPressed, isPressed, justPressed, mouse, toast } from "./main.js";
import { Settings } from "./settings.js";
import { Shape } from "./shape.js";
import { UI } from "./ui.js";
import { View } from "./view.js";
import { World } from "./world.js";

// Editor — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   LEVEL EDITOR
// ============================================================

export const Editor = {

  active: false,
  selectedSize: 25,
  selectedKind: "player",
  selectedType: LEVEL_TYPES.SPARSE,
  randomVelocity: false,
  victoryCondition: VICTORY_CONDITIONS.ABSORB_ALL,
  victoryParam: 60,
  hoverWorld: null,

  // Phase 4: when set the designer is editing a kind's test-case layout.
  // Save/Load/Export/Import/Play/Menu are replaced with Save test / Run /
  // Done — see renderBar.
  testCaseMode: null,   // null | { kindId, testId, name, seed, dirty }

  // Power tools
  tool: "place",                 // "place" | "select" | "velocity" | "shape"
  selection: new Set(),          // selected Circle objects
  _ring: null,                   // active ring-placement preview, or null
  // Active "move to line" preview: { motes: [{c, ox, oy}], start, end, drawing }
  // Captured at button press; motes stay put until release-to-commit so the
  // dashed connectors visibly preview where each will land.
  _lineMode: null,
  clipboard: [],                 // copied descriptors {x, y, r, kind, hue, dx, dy}
  mirror: "none",                // "none" | "horizontal" | "vertical" | "both"
  snap:   0,                     // 0 = off, otherwise grid size in px
  _selDragStart: null,           // world coords when starting a drag-select
  _aimingPlayer: false,          // true between player-place and the second click that sets initial vx/vy

  // Shape tool — editing the playable-area composition. The first time
  // the user enters the Shape tool, World.shape is materialized from
  // bounds so they have a visible default rect to edit.
  _shapeAddType: "circle",       // "rect" | "circle" | "polygon"
  _shapeAddSign: "+",            // "+" | "-" — adds vs carves
  _shapeDragStart: null,         // {x, y} world coords during a rect/circle drag
  _polyDraft: null,              // [{x, y}, ...] while authoring a polygon, else null

  // Currently-applied color palette so the Theme dropdown can highlight
  // it and the Delete button can know which user palette to remove.
  // Format: "builtin:<name>" or "user:<name>", or null when the user has
  // hand-edited a color away from any known palette.
  _appliedPalette: null,

  // Controller-friendly cursor. Doubles as the mouse hover position so a
  // single source of truth drives placement, regardless of input device.
  // `focus` is which surface input edits: the canvas cursor, or the toolbar.
  cursor: { x: 0, y: 0 },
  focus: "canvas",               // "canvas" | "toolbar"
  _lastMouseX: 0,
  _lastMouseY: 0,
  // Per-direction edge + repeat state for D-pad value-tweaking on focused
  // toolbar fields. Pad-only (keyboard arrows reach the field natively).
  _padDirPrev:  { up: false, down: false, left: false, right: false },
  _padDirHoldT: { up: 0, down: 0, left: 0, right: 0 },
  _padDirNext:  { up: 0, down: 0, left: 0, right: 0 },
  // Edge + repeat state for the L/R shoulder buttons (cursor size on canvas).
  _padShoulderPrev:  { L: false, R: false },
  _padShoulderHoldT: { L: 0, R: 0 },
  _padShoulderNext:  { L: 0, R: 0 },

  open() {
    Audio_.init();
    Game.state = "designer";
    this.testCaseMode = null;
    World.reset();
    World.type = LEVEL_TYPES.SPARSE;
    World.bounds = { x: 0, y: 0, w: 2176, h: 1472 };
    // Camera centered
    World.cameraX = World.bounds.w / 2;
    World.cameraY = World.bounds.h / 2;
    World.cameraScale = Math.min(W / World.bounds.w, H / World.bounds.h) * 0.85;
    this.active = true;
    this.focus = "canvas";
    this.cursor = { x: World.bounds.w / 2, y: World.bounds.h / 2 };
    this._lastMouseX = mouse.x;
    this._lastMouseY = mouse.y;
    hud.classList.add("hidden");
    editorBar.classList.remove("hidden"); editorHelp.classList.remove("hidden");
    UI.clearOverlay();
    this._matchAppliedPalette();
    this.renderBar();
  },

  // Phase 4: open the level designer in test-case mode. Loads the test's
  // saved layout, swaps in the test-mode toolbar (Save test / Run / Done).
  openTestCase(kindId, testId) {
    const kind = Kinds.userKinds().find(k => k.id === kindId);
    if (!kind) { toast("Kind missing"); return; }
    const tests = kind.tests || [];
    const test = tests.find(t => t.id === testId);
    if (!test) { toast("Test missing"); return; }
    Audio_.init();
    Game.state = "designer";
    this.testCaseMode = {
      kindId, testId,
      name: test.name || "",
      seed: test.seed !== undefined ? test.seed : 42,
      dirty: false
    };
    this.active = true;
    this.focus = "canvas";
    // Default place-kind to the kind under test — that's almost always
    // what the user wants to drop into the layout. Switching kinds is
    // still one dropdown click away.
    this.selectedKind = kindId;
    // Layout-shaped data round-trips through deserialize.
    this.deserialize(test.layout || { type: "sparse", bounds: { x:0, y:0, w:1216, h:832 }, circles: [] });
    World.cameraX = World.bounds.w / 2;
    World.cameraY = World.bounds.h / 2;
    World.cameraScale = Math.min(W / World.bounds.w, H / World.bounds.h) * 0.85;
    this.cursor = { x: World.bounds.w / 2, y: World.bounds.h / 2 };
    hud.classList.add("hidden");
    editorBar.classList.remove("hidden"); editorHelp.classList.remove("hidden");
    UI.clearOverlay();
    this.renderBar();
  },

  exitTestCase() {
    const tc = this.testCaseMode;
    if (!tc) { Game.toMenu(); return; }
    const finish = () => {
      this.testCaseMode = null;
      this.active = false;
      hud.classList.add("hidden");
      editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
      UI.renderKindEditor(tc.kindId);
    };
    if (this.dirty) {
      UI.confirm({
        title: "DISCARD CHANGES?",
        message: "Unsaved layout changes will be lost.",
        yesLabel: "Discard", danger: true,
        onYes: finish
      });
    } else finish();
  },

  renderBar() {
    // Preserve toolbar focus across re-renders (eg. when changing Type or
    // Victory triggers a re-render and the active <select> gets replaced).
    const focusId = this.focus === "toolbar" && document.activeElement &&
                    editorBar.contains(document.activeElement)
                      ? document.activeElement.id : null;
    // Place size only matters for tools that change circle radius:
    //   Place — sets the radius of newly placed circles
    //   Select — wheel grows / shrinks every selected circle
    // Velocity / Shape don't read it, so the slider is hidden in those.
    const showSize = this.tool === "place" || this.tool === "select";
    // Row 2 hosts the shape primitive controls (Tool=Shape) OR the
    // selection inspector + alignment (when ≥1 circle is selected).
    // The two are mutually exclusive in practice — switching to Shape
    // clears the selection — so we pick one based on the current tool.
    const showShapeRow  = this.tool === "shape";
    const showSelRow    = !showShapeRow && this.selection.size > 0;
    // Wells cluster (Ring around well + Orbit pair) appears whenever the
    // level has ≥1 gravity well, regardless of selection — Orbit operates
    // on the selection if any, else on every non-player circle.
    const showWellsRow  = !showShapeRow && World.gravityCenters.length > 0;
    const showRing      = !!this._ring;
    const row2Visible   = showShapeRow || showSelRow || showWellsRow || showRing;
    const escTest = (this.testCaseMode && this.testCaseMode.name || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;");
    const jsonLabel = JsonPanel.visible ? "Hide JSON" : "Show JSON";
    editorBar.innerHTML = `
      <div class="ed-bar-row-1">
        <label>Tool
          <select id="ed-tool">
            <option value="place"    ${this.tool==="place"   ?"selected":""}>Place</option>
            <option value="select"   ${this.tool==="select"  ?"selected":""}>Select</option>
            <option value="velocity" ${this.tool==="velocity"?"selected":""}>Velocity</option>
            <option value="shape"    ${this.tool==="shape"   ?"selected":""}>Shape</option>
          </select>
        </label>
        <label>Kind
          <select id="ed-kind">
            ${Object.entries(KIND_META).map(([k, m]) =>
              `<option value="${k}">${m.label}</option>`).join("")}
            <option value="player">Player (only one)</option>
            <option value="well">Gravity well</option>
            ${Campaign.devModeEnabled()
              ? `<option value="__kut__">Kind under test (preview placeholder)</option>` : ""}
          </select>
        </label>
        <span class="ed-info-icon" id="ed-kind-info" title="">ⓘ</span>
        ${showSize ? `<label>Size
          <input id="ed-size" type="range" min="6" max="120" value="${this.selectedSize}">
          <span id="ed-size-v">${this.selectedSize}</span>
        </label>` : ""}
        <label>Mirror
          <select id="ed-mirror">
            <option value="none"       ${this.mirror==="none"      ?"selected":""}>off</option>
            <option value="horizontal" ${this.mirror==="horizontal"?"selected":""}>horizontal</option>
            <option value="vertical"   ${this.mirror==="vertical"  ?"selected":""}>vertical</option>
            <option value="both"       ${this.mirror==="both"      ?"selected":""}>both</option>
          </select>
        </label>
        <label>Snap
          <select id="ed-snap">
            <option value="0"  ${this.snap===0 ?"selected":""}>off</option>
            <option value="8"  ${this.snap===8 ?"selected":""}>8</option>
            <option value="16" ${this.snap===16?"selected":""}>16</option>
            <option value="32" ${this.snap===32?"selected":""}>32</option>
            <option value="64" ${this.snap===64?"selected":""}>64</option>
          </select>
        </label>
        <span class="ed-right-cluster">
          <button id="ed-level-settings" title="Level settings — type, bounds, colors, victory, drift, wells">⚙ Level…</button>
          ${this.testCaseMode ? `
            <span class="ed-test-chip">TEST: ${escTest}</span>
            <button id="ed-clear" title="Remove every circle and gravity well from the level">Clear</button>
            <button id="ed-json-toggle" title="Show/hide a live JSON view of the level">${jsonLabel}</button>
            <button id="ed-test-save">Save test</button>
            <button id="ed-test-run">Run</button>
            <button id="ed-test-done">Done</button>
          ` : `
            <span class="ed-file-wrap">
              <button id="ed-file-toggle" title="File menu — save / load / export / import / clear / JSON / back to menu">File ▾</button>
              <div id="ed-file-menu" class="ed-file-menu hidden">
                <div class="item" id="ed-save">Save</div>
                <div class="item" id="ed-load">Load</div>
                <div class="item" id="ed-export">Export</div>
                <div class="item" id="ed-import">Import</div>
                <div class="sep"></div>
                <div class="item" id="ed-clear">Clear</div>
                <div class="item" id="ed-json-toggle">${jsonLabel}</div>
                <div class="sep"></div>
                <div class="item" id="ed-back">Back to menu</div>
              </div>
            </span>
            <button id="ed-play" class="ed-play">▶ Play</button>
          `}
        </span>
      </div>
      ${row2Visible ? `<div class="ed-bar-row-2">
        ${showShapeRow ? `
          <label title="Primitive type. Rect / Circle: drag corner-to-corner. Polygon: click to add vertices, right-click to finish.">Primitive
            <select id="ed-shape-type">
              <option value="rect"    ${this._shapeAddType==="rect"   ?"selected":""}>Rect</option>
              <option value="circle"  ${this._shapeAddType==="circle" ?"selected":""}>Circle</option>
              <option value="polygon" ${this._shapeAddType==="polygon"?"selected":""}>Polygon</option>
            </select>
          </label>
          <label title="Add to playable area or carve a hole">Sign
            <select id="ed-shape-sign">
              <option value="+" ${this._shapeAddSign==="+"?"selected":""}>+ add</option>
              <option value="-" ${this._shapeAddSign==="-"?"selected":""}>− carve</option>
            </select>
          </label>
          <button id="ed-shape-reset" title="Reset shape to a single + rect matching bounds">Reset</button>
        ` : ""}
        ${showSelRow ? `
          <span class="ed-sel-chip">Selection · ${this.selection.size}</span>
          <label title="Change kind on every selected circle">kind
            <select id="ed-skind">
              <option value="">—</option>
              ${Object.entries(KIND_META).filter(([k]) => k !== "mote")
                .map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("")}
              ${Campaign.devModeEnabled()
                ? `<option value="__kut__">Kind under test (preview placeholder)</option>` : ""}
            </select>
          </label>
          <label title="Radius (px) for selected circles. Empty = mixed values.">r <input id="ed-sr" type="number" min="6" max="120" step="1" style="width:60px;"></label>
          <label title="X velocity (px/s) for selected circles. Empty = mixed values.">vx <input id="ed-vx" type="number" step="10" style="width:64px;"></label>
          <label title="Y velocity (px/s) for selected circles. Empty = mixed values.">vy <input id="ed-vy" type="number" step="10" style="width:64px;"></label>
          <button id="ed-vclear" title="Set velocity to 0 on every selected circle">Clear v</button>
          ${this.selection.size >= 2 ? `<span class="ed-divider"></span>
            <button id="ed-align-l"  title="Align left edges to leftmost">⇤</button>
            <button id="ed-align-r"  title="Align right edges to rightmost">⇥</button>
            <button id="ed-align-t"  title="Align top edges to topmost">⤒</button>
            <button id="ed-align-b"  title="Align bottom edges to bottommost">⤓</button>
            <button id="ed-align-vm" title="Align vertical middle (same Y)">↕</button>
            <button id="ed-align-hm" title="Align horizontal middle (same X)">↔</button>
            <button id="ed-dist-v" ${this.selection.size < 3 ? "disabled" : ""} title="Distribute equally along the vertical axis (equal Y gaps; needs ≥ 3)">≡</button>
            <button id="ed-dist-h" ${this.selection.size < 3 ? "disabled" : ""} title="Distribute equally along the horizontal axis (equal X gaps; needs ≥ 3)">⦀</button>
            <button id="ed-align-line" title="Move to line: click and drag to draw a line; selected circles snap to the nearest point on it. Hold Shift to constrain the line to 0° / 45° / 90°.">⟋</button>
          ` : ""}
        ` : ""}
        ${showWellsRow ? `
          ${showSelRow ? `<span class="ed-divider"></span>` : ""}
          ${showSelRow && !this._ring ? `<button id="ed-ring" title="Reposition selected motes onto a circle around the nearest well; scroll/L+R to adjust radius before committing">Ring around well</button>` : ""}
          <button id="ed-orbit" title="Set tangential velocity around the nearest gravity well — applies to selection if any, else all non-player circles">${this.selection.size > 0 ? "Orbit selection" : "Orbit all"}</button>
          <button id="ed-orbit-reverse" title="Same as Orbit, counter-rotating">${this.selection.size > 0 ? "Reverse-orbit selection" : "Reverse orbit"}</button>
        ` : ""}
        ${showRing
          ? `<button id="ed-ring-even" title="Toggle even angular spacing (shortcut: E)">Spacing: ${this._ring.evenSpacing ? "even" : "preserve"}</button>`
          : ""}
      </div>` : ""}
    `;
    const $ = id => document.getElementById(id);
    if ($("ed-size")) {
      $("ed-size").oninput = e => {
        this.selectedSize = +e.target.value;
        $("ed-size-v").textContent = this.selectedSize;
      };
    }
    $("ed-kind").value = this.selectedKind;
    // Kind description used to live inline next to the dropdown; now it's
    // surfaced as a tooltip on the small ⓘ icon to keep the bar slim.
    const updateKindDesc = () => {
      const k = this.selectedKind;
      const desc = (KIND_META[k] && KIND_META[k].desc) || EDITOR_KIND_DESC[k] || "";
      const info = $("ed-kind-info");
      if (info) info.title = desc;
    };
    $("ed-kind").onchange = e => {
      this.selectedKind = e.target.value;
      updateKindDesc();
      // Picking a kind while authoring the playable area is almost always
      // a "I'm done with the shape, time to place that new kind" signal,
      // so flip back to Place. Toggleable via the Settings panel.
      if (this.tool === "shape" && Settings.load().editorAutoSwitchToPlace) {
        this.tool = "place";
        this._shapeDragStart = null;
        this._polyDraft = null;
        this.renderBar();
      }
    };
    updateKindDesc();
    $("ed-tool").onchange   = e => {
      this.tool = e.target.value;
      this.selection.clear();
      this._velDragMote = null;
      this._shapeDragStart = null;
      this._polyDraft = null;
      // Materialize World.shape on first entry to the Shape tool so the
      // user has a visible default rect to manipulate.
      if (this.tool === "shape") this._ensureShape();
      this.renderBar();
    };
    if ($("ed-shape-type")) $("ed-shape-type").onchange = e => {
      this._shapeAddType = e.target.value;
      // Switching primitive type drops any in-progress polygon draft.
      this._polyDraft = null;
      this._shapeDragStart = null;
    };
    if ($("ed-shape-sign")) $("ed-shape-sign").onchange = e => { this._shapeAddSign = e.target.value; };
    if ($("ed-shape-reset")) $("ed-shape-reset").onclick = () => {
      this.pushHistory();
      const b = World.bounds;
      World.shape = [{ type: "rect", cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, sign: "+" }];
      Shape.invalidate(World.shape);
      this._syncBoundsToShape();
      this.dirty = true;
      this.renderBar();
    };
    $("ed-mirror").onchange = e => { this.mirror = e.target.value; };
    $("ed-snap").onchange   = e => {
      this.snap = +e.target.value;
      // Aligning bounds to the new grid lets the player snap along the
      // box's full width and height (both edges become snap points).
      this._quantizeBoundsToSnap();
      this.renderBar();
    };
    const wireV = (id, prop) => {
      const el = $(id);
      if (!el) return;
      el.onchange = e => {
        if (this.selection.size === 0) return;
        this.pushHistory();
        const v = +e.target.value || 0;
        for (const c of this.selection) c[prop] = v;
        this.dirty = true;
      };
    };
    wireV("ed-vx", "vx");
    wireV("ed-vy", "vy");
    if ($("ed-vclear")) {
      $("ed-vclear").onclick = () => {
        if (this.selection.size === 0) return;
        this.pushHistory();
        for (const c of this.selection) { c.vx = 0; c.vy = 0; }
        this.dirty = true;
        this._refreshVelocityInspector();
      };
    }
    const alignBtn = (id, mode) => {
      const el = $(id);
      if (el) el.onclick = () => this.alignSelection(mode);
    };
    alignBtn("ed-align-l",  "left");
    alignBtn("ed-align-r",  "right");
    alignBtn("ed-align-t",  "top");
    alignBtn("ed-align-b",  "bottom");
    alignBtn("ed-align-vm", "vmid");
    alignBtn("ed-align-hm", "hmid");
    const distBtn = (id, axis) => {
      const el = $(id);
      if (el) el.onclick = () => this.distributeSelection(axis);
    };
    distBtn("ed-dist-v", "v");
    distBtn("ed-dist-h", "h");
    if ($("ed-align-line")) $("ed-align-line").onclick = () => this.enterLineMode();
    if ($("ed-skind")) {
      $("ed-skind").onchange = e => {
        const newKind = e.target.value;
        if (!newKind || this.selection.size === 0) return;
        this.pushHistory();
        const meta = KIND_META[newKind];
        for (const c of this.selection) {
          if (newKind === "player") {
            if (World.player && World.player !== c) World.player.kind = "neutral";
            World.player = c;
          } else if (c === World.player) {
            World.player = null;
          }
          c.kind = newKind;
          if (meta) c.hue = meta.hue;
        }
        this.dirty = true;
        e.target.value = "";   // reset to placeholder so re-selecting same kind re-applies
      };
    }
    if ($("ed-sr")) {
      $("ed-sr").onchange = e => {
        if (this.selection.size === 0) return;
        const r = Math.max(6, Math.min(120, +e.target.value || 0));
        if (!r) return;
        this.pushHistory();
        for (const c of this.selection) c.r = r;
        this.dirty = true;
      };
    }
    if ($("ed-ring")) $("ed-ring").onclick = () => this.enterRing();
    if ($("ed-orbit"))         $("ed-orbit").onclick         = () => this.orbitAll(false);
    if ($("ed-orbit-reverse")) $("ed-orbit-reverse").onclick = () => this.orbitAll(true);
    if ($("ed-ring-even")) {
      $("ed-ring-even").onclick = () => {
        if (!this._ring) return;
        this._ring.evenSpacing = !this._ring.evenSpacing;
        this._applyRingPositions();
        this.renderBar();
      };
    }
    this._refreshVelocityInspector();
    // ⚙ Level… opens the level-wide settings modal (Type, bounds,
    // colors / theme, victory, drift, wells). Always available.
    if ($("ed-level-settings")) {
      $("ed-level-settings").onclick = () => UI.openLevelSettings();
    }
    // File menu — toggle visibility on the trigger; clicking outside or
    // on any item closes it. The items themselves keep their original
    // IDs / handlers so behavior is unchanged.
    const closeFileMenu = () => {
      const menu = $("ed-file-menu");
      if (menu) menu.classList.add("hidden");
    };
    if ($("ed-file-toggle")) {
      $("ed-file-toggle").onclick = e => {
        e.stopPropagation();
        const menu = $("ed-file-menu");
        if (!menu) return;
        const willOpen = menu.classList.contains("hidden");
        menu.classList.toggle("hidden");
        if (willOpen) {
          // Defer attaching the outside-click closer by one frame so the
          // click that opened the menu doesn't immediately close it.
          setTimeout(() => {
            const off = ev => {
              if (menu.classList.contains("hidden")) {
                document.removeEventListener("click", off);
                return;
              }
              if (!menu.contains(ev.target) && ev.target.id !== "ed-file-toggle") {
                menu.classList.add("hidden");
                document.removeEventListener("click", off);
              }
            };
            document.addEventListener("click", off);
          }, 0);
        }
      };
    }
    // Clear / Show JSON live in both the File ▾ menu (normal mode) and
    // inline in the test-mode cluster, so guard with `if ($(...))`.
    if ($("ed-clear")) {
      $("ed-clear").onclick = () => {
        closeFileMenu();
        this.pushHistory();
        World.circles = []; World.player = null; World.gravityCenters = [];
      };
    }
    if ($("ed-json-toggle")) {
      $("ed-json-toggle").onclick = () => {
        closeFileMenu();
        JsonPanel.toggle();
      };
    }
    if (this.testCaseMode) {
      const tc = this.testCaseMode;
      $("ed-test-save").onclick = () => this.saveTestCase();
      $("ed-test-run").onclick  = () => {
        // Save first so the run uses the just-edited layout.
        this.saveTestCase({ silent: true });
        const kind = Kinds.userKinds().find(k => k.id === tc.kindId);
        const test = kind && (kind.tests || []).find(t => t.id === tc.testId);
        Game.startObservation({
          kindId: tc.kindId, testId: tc.testId, seed: tc.seed,
          layout: this.serialize(),
          name: tc.name, returnTo: "test-designer",
          ghostPlayer: !!(test && test.ghostPlayer)
        });
      };
      $("ed-test-done").onclick = () => this.exitTestCase();
    } else {
      if ($("ed-save"))   $("ed-save").onclick   = () => { closeFileMenu(); this.save(); };
      if ($("ed-load"))   $("ed-load").onclick   = () => { closeFileMenu(); this.load(); };
      if ($("ed-export")) $("ed-export").onclick = () => { closeFileMenu(); this.exportLevel(); };
      if ($("ed-import")) $("ed-import").onclick = () => { closeFileMenu(); this.importLevel(); };
      if ($("ed-back"))   $("ed-back").onclick   = () => { closeFileMenu(); this.exit(); };
      if ($("ed-play"))   $("ed-play").onclick   = () => this.play();
    }

    if (focusId) {
      const restore = document.getElementById(focusId);
      if (restore) restore.focus();
    }
  },

  // Scan built-in + user palettes for an exact (inside / outside / edge)
  // color match against current World values, and set `_appliedPalette`
  // accordingly. Lets the Theme dropdown auto-select the right entry
  // after opening a fresh designer or loading a saved level.
  _matchAppliedPalette() {
    const i = (World.insideColor  || "").toLowerCase();
    const o = (World.outsideColor || "").toLowerCase();
    const e = (World.edgeColor    || "").toLowerCase();
    const eq = p => p.inside.toLowerCase()  === i
                 && p.outside.toLowerCase() === o
                 && p.edge.toLowerCase()    === e;
    const b = ColorPalette.BUILTINS.find(eq);
    if (b) { this._appliedPalette = `builtin:${b.name}`; return; }
    const u = ColorPalette.loadUser().find(eq);
    this._appliedPalette = u ? `user:${u.name}` : null;
  },

  // ---- Undo/redo --------------------------------------------------
  // Snapshot-based history. Calls to pushHistory() before any mutation save
  // the current state; undo/redo move snapshots between two stacks.
  history: [],
  future:  [],
  dirty:   false,

  // Confirm before leaving if there's unsaved work in the world.
  exit() {
    const reallyExit = () => {
      this.active = false;
      this.dirty = false;
      this.history.length = 0;
      this.future.length = 0;
      this.selection.clear();
      Game.toMenu();
    };
    if (this.dirty && (World.circles.length > 0 || World.gravityCenters.length > 0)) {
      UI.confirm({
        title: "UNSAVED CHANGES",
        message: "Your designer work has not been saved. Exit to the main menu anyway?",
        yesLabel: "Exit without saving",
        noLabel:  "Stay here",
        danger: true,
        onYes: reallyExit
      });
      return;
    }
    reallyExit();
  },

  // Mouse + controller handling, called every frame while editor is active
  update(dt) {
    if (!this.active) return;
    if (Game.state !== "designer") return;
    this._syncToolbarToSelection();

    // Update cursor: mouse motion takes priority (so wiggling the mouse
    // immediately re-syncs the cursor); otherwise the held D-pad/arrows
    // glide the cursor when the canvas has focus.
    const mouseMoved = this._lastMouseX !== mouse.x || this._lastMouseY !== mouse.y;
    if (mouseMoved) {
      const wp = View.screenToWorld(mouse.x, mouse.y);
      this.cursor.x = wp.x; this.cursor.y = wp.y;
      this._lastMouseX = mouse.x; this._lastMouseY = mouse.y;
    } else if (this.focus === "canvas" && !this._lineMode) {
      // Suppressed during line-mode authoring so 'a' / 'd' (which the
      // KEY_FALLBACK table maps to DPAD_LEFT / DPAD_RIGHT) only adjust
      // the bounce count and don't accidentally also slew the cursor.
      let dx = 0, dy = 0;
      if (isPressed("DPAD_LEFT"))  dx -= 1;
      if (isPressed("DPAD_RIGHT")) dx += 1;
      if (isPressed("DPAD_UP"))    dy -= 1;
      if (isPressed("DPAD_DOWN"))  dy += 1;
      if (dx || dy) {
        const speed = 700 / Math.max(World.cameraScale, 0.2);
        const len = Math.hypot(dx, dy) || 1;
        this.cursor.x += (dx / len) * speed * dt;
        this.cursor.y += (dy / len) * speed * dt;
        // Auto-pan the camera so the cursor stays on screen.
        const sp = View.worldToScreen(this.cursor.x, this.cursor.y);
        const margin = 80;
        if (sp.x < margin)          World.cameraX += (sp.x - margin) / World.cameraScale;
        else if (sp.x > W - margin) World.cameraX += (sp.x - (W - margin)) / World.cameraScale;
        if (sp.y < margin)          World.cameraY += (sp.y - margin) / World.cameraScale;
        else if (sp.y > H - margin) World.cameraY += (sp.y - (H - margin)) / World.cameraScale;
      }
    }
    // Shape tool can extend the playable area, so leave the cursor free
    // to roam outside the current bounds. Bounds are re-synced to the
    // primitive AABB after each add/delete.
    if (this.tool !== "shape") {
      const b = World.bounds;
      this.cursor.x = Math.max(b.x, Math.min(b.x + b.w, this.cursor.x));
      this.cursor.y = Math.max(b.y, Math.min(b.y + b.h, this.cursor.y));
    }
    this.hoverWorld = { x: this.cursor.x, y: this.cursor.y };

    // Always sample edges so a button held while focus is elsewhere doesn't
    // fire a stray "just pressed" the moment focus returns to the canvas.
    const aJust = justPressed("A");
    const bJust = justPressed("B");
    const xJust = justPressed("X");
    const yJust = justPressed("Y");
    const lJust = justPressed("L");
    const rJust = justPressed("R");
    if (xJust) this.toggleFocus();
    if (yJust) editorHelp.open = !editorHelp.open;
    if (this.focus === "toolbar") {
      // After a dialog closes the active element falls back to <body>.
      // Re-grab the last-focused field (or the first one) so L/R/D-pad
      // have something to act on.
      const ae = document.activeElement;
      if (!ae || ae === document.body || !editorBar.contains(ae)) {
        const last = this._lastFocusId && document.getElementById(this._lastFocusId);
        const restore = (last && editorBar.contains(last) ? last : null)
                        || editorBar.querySelector("select, input, button");
        if (restore) restore.focus();
      }
      if (lJust) this._toolbarNav(-1);
      if (rJust) this._toolbarNav(+1);
      // Pad-only D-pad with hold-repeat tweaks the focused field. Keyboard
      // arrows reach selects / sliders natively (we scoped preventDefault
      // out for them), so we use isPadPressed to avoid double-firing.
      const padNow = {
        up:    isPadPressed("DPAD_UP"),
        down:  isPadPressed("DPAD_DOWN"),
        left:  isPadPressed("DPAD_LEFT"),
        right: isPadPressed("DPAD_RIGHT"),
      };
      const dirs = [
        { k: "up",    x:  0, y: -1 },
        { k: "down",  x:  0, y:  1 },
        { k: "left",  x: -1, y:  0 },
        { k: "right", x:  1, y:  0 },
      ];
      for (const d of dirs) {
        const now = padNow[d.k], was = this._padDirPrev[d.k];
        if (now && !was) {
          this._padAdjustField(d.x, d.y);
          this._padDirHoldT[d.k] = 0;
          this._padDirNext[d.k]  = 0.4;          // initial delay before repeat
        } else if (now && was) {
          this._padDirHoldT[d.k] += dt;
          if (this._padDirHoldT[d.k] >= this._padDirNext[d.k]) {
            this._padAdjustField(d.x, d.y);
            this._padDirNext[d.k] += 0.07;       // ~14 Hz repeat
          }
        } else {
          this._padDirHoldT[d.k] = 0;
          this._padDirNext[d.k]  = 0;
        }
        this._padDirPrev[d.k] = now;
      }
      if (aJust) this._padActivateField();
    } else {
      // Reset hold tracking when leaving toolbar focus.
      for (const k of ["up", "down", "left", "right"]) {
        this._padDirPrev[k]  = false;
        this._padDirHoldT[k] = 0;
        this._padDirNext[k]  = 0;
      }
    }

    // L/R adjust placement size while the canvas has focus (mirrors the
    // mouse wheel). Tracked every frame so a held shoulder doesn't fire a
    // stray edge when the user toggles back to canvas focus.
    for (const [name, sign] of [["L", -1], ["R", +1]]) {
      const now = isPressed(name);
      const was = this._padShoulderPrev[name];
      const acted = this.focus === "canvas";
      if (now && !was) {
        if (acted) this._adjustSize(sign * 3);
        this._padShoulderHoldT[name] = 0;
        this._padShoulderNext[name]  = 0.4;
      } else if (now && was) {
        this._padShoulderHoldT[name] += dt;
        if (this._padShoulderHoldT[name] >= this._padShoulderNext[name]) {
          if (acted) this._adjustSize(sign * 3);
          this._padShoulderNext[name] += 0.07;
        }
      } else {
        this._padShoulderHoldT[name] = 0;
        this._padShoulderNext[name]  = 0;
      }
      this._padShoulderPrev[name] = now;
    }

    const justDown = mouse.down && !mouse.wasDown;
    const justUp   = !mouse.down && mouse.wasDown;
    mouse.wasDown  = mouse.down;
    // A click on the canvas implicitly returns focus there.
    if (justDown && this.focus !== "canvas") {
      this.focus = "canvas";
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }

    // Camera pan via Shift + left-drag — initiated by the canvas mousedown
    // listener. Active throughout the drag and trumps tool clicks.
    if (this._panDrag) {
      if (mouse.down) {
        const dx = mouse.x - this._panDrag.startX;
        const dy = mouse.y - this._panDrag.startY;
        World.cameraX = this._panDrag.startCamX - dx / World.cameraScale;
        World.cameraY = this._panDrag.startCamY - dy / World.cameraScale;
      } else {
        this._panDrag = null;
      }
      return;
    }

    // Ring-placement modal — intercepts clicks/A/B before any tool sees them.
    if (this._ring) {
      if (justDown && mouse.button === 0) this._commitRing();
      else if (justDown && mouse.button === 2) this._cancelRing();
      else if (this.focus === "canvas" && aJust) this._commitRing();
      else if (this.focus === "canvas" && bJust) this._cancelRing();
      return;
    }
    // Move-to-line modal — same idea, press-drag-release. The first
    // left-click anchors the line's start; subsequent cursor motion
    // streams into `end`; mouseup commits (or cancels if the drag was
    // too short to be intentional). Right-click cancels at any time.
    if (this._lineMode) {
      if (justDown && mouse.button === 2) { this._cancelLineMode(); return; }
      if (this.focus === "canvas" && bJust) { this._cancelLineMode(); return; }
      if (justDown && mouse.button === 0 && !this._lineMode.start) {
        this._lineMode.start = { x: this.hoverWorld.x, y: this.hoverWorld.y };
        this._lineMode.end   = { x: this.hoverWorld.x, y: this.hoverWorld.y };
        this._lineMode.drawing = true;
        return;
      }
      if (this._lineMode.drawing) {
        this._lineMode.end = this._lineEffectiveEnd();
        if (justUp) {
          const dx = this._lineMode.end.x - this._lineMode.start.x;
          const dy = this._lineMode.end.y - this._lineMode.start.y;
          if (Math.hypot(dx, dy) < 6) {
            this._cancelLineMode();
            toast("Line too short — drag farther");
          } else {
            this._commitLineMode();
          }
          return;
        }
      }
      return;
    }

    // Pad place / erase mirrors the place-tool's left / right click.
    if (this.focus === "canvas" && this.tool === "place") {
      if (aJust) this._padPlace();
      if (bJust) this._padErase();
    }

    // ---- Select tool ----------------------------------------------
    if (this.tool === "select") {
      if (justDown && mouse.button === 0) {
        const target = this._nearestCircle(this.hoverWorld);
        if (target) {
          // Standard selection model:
          //  - Plain click on an unselected circle replaces the
          //    selection with just that circle.
          //  - Plain click on an already-selected circle keeps the
          //    current selection so a drag can move the group; on
          //    mouseup-without-drag it reduces to the clicked one.
          //  - Shift+click on an unselected circle adds it to the
          //    selection.
          //  - Shift+click on an already-selected circle, with no
          //    drag, toggles it off (removed on mouseup).
          //  - Either way, a click prepares a move-drag — Shift held
          //    during the drag locks the displacement to a 45° step.
          const wasSelected = this.selection.has(target);
          if (mouse.shift) {
            if (!wasSelected) this.selection.add(target);
          } else {
            if (!wasSelected) {
              this.selection.clear();
              this.selection.add(target);
            }
          }
          this._moveDrag = {
            target,
            startWorld: { x: this.hoverWorld.x, y: this.hoverWorld.y },
            motes: [...this.selection].map(c => ({ c, ox: c.x, oy: c.y })),
            moved: false,
            committed: false,
            shiftClick: !!mouse.shift,
            wasSelected,
          };
          this._selDragStart = null;
        } else {
          this._selDragStart = { x: this.hoverWorld.x, y: this.hoverWorld.y };
        }
      }
      // Drive an in-progress move-drag.
      if (this._moveDrag) {
        const md = this._moveDrag;
        let dx = this.hoverWorld.x - md.startWorld.x;
        let dy = this.hoverWorld.y - md.startWorld.y;
        // Hold Shift while moving to lock the displacement vector to a
        // 45° step (cursor distance preserved). Live — toggling Shift
        // mid-drag flips between snapped and raw on the next frame.
        if (mouse.shift) {
          const len = Math.hypot(dx, dy);
          if (len > 1e-6) {
            const STEP = Math.PI / 4;
            const ang = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
            dx = Math.cos(ang) * len;
            dy = Math.sin(ang) * len;
          }
        }
        if (!md.moved && Math.hypot(dx, dy) > 5) md.moved = true;
        if (md.moved) {
          if (!md.committed) { this.pushHistory(); md.committed = true; }
          for (const m of md.motes) { m.c.x = m.ox + dx; m.c.y = m.oy + dy; }
        }
        if (justUp) {
          if (!md.moved) {
            // No drag — apply the click's deferred selection change.
            if (md.shiftClick) {
              // Shift+click on a previously-selected circle toggles
              // it off; shift+click on a previously-unselected one
              // already added it on mousedown, so nothing more to do.
              if (md.wasSelected) this.selection.delete(md.target);
            } else if (md.wasSelected && this.selection.size > 1) {
              // Plain click on a circle that was part of a multi-
              // selection: collapse to just the clicked one.
              this.selection.clear();
              this.selection.add(md.target);
            }
            // Other plain-click cases (single already-selected, or
            // unselected → replaced on mousedown) need no further
            // action — the selection is already correct.
          } else {
            this.dirty = true;
          }
          this._moveDrag = null;
        }
        return;
      }
      if (justUp && this._selDragStart) {
        const a = this._selDragStart, b = this.hoverWorld;
        const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
        if (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4) {
          this.selection.clear();
          for (const c of World.circles) {
            if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) this.selection.add(c);
          }
        } else {
          // Click on empty space (no drag) — deselect.
          this.selection.clear();
        }
        this._selDragStart = null;
      }
      // (Right-click is reserved here — Select tool no longer
      // hijacks it for deselect, since left-click in empty space
      // already does that and we may want a context menu in future.)
      return;
    }

    // ---- Shape tool -----------------------------------------------
    if (this.tool === "shape") {
      // Polygon mode — multi-click vertex authoring with right-click
      // commit. Falls through to rect/circle drag mode otherwise.
      if (this._shapeAddType === "polygon") {
        if (justDown && mouse.button === 0) {
          if (!this._polyDraft) this._polyDraft = [];
          // Snap-to-first-vertex closes the draft (within 12 screen px).
          // Tested against the raw cursor (close-snap is independent
          // of the angle-snap modifier).
          if (this._polyDraft.length >= 3) {
            const first = this._polyDraft[0];
            const sa = View.worldToScreen(first.x, first.y);
            const sb = View.worldToScreen(this.hoverWorld.x, this.hoverWorld.y);
            if (Math.hypot(sa.x - sb.x, sa.y - sb.y) < 12) {
              this._commitPolyDraft();
              return;
            }
          }
          // Hold Shift to snap the new vertex to a 45° increment from
          // the previous vertex (cursor distance preserved).
          const v = this._polyEffectiveCursor();
          this._polyDraft.push({ x: v.x, y: v.y });
        }
        if (justDown && mouse.button === 2) {
          if (this._polyDraft && this._polyDraft.length > 0) {
            // Right-click while drafting: commit (or drop if invalid).
            this._commitPolyDraft();
          } else {
            // Not drafting: same as rect/circle mode — delete the
            // topmost primitive at the cursor (mirror-aware).
            this._shapeDeleteAtCursor();
          }
        }
        return;
      }
      // Right-click deletes the topmost primitive at the cursor — and
      // its mirror counterparts when mirroring is active. Refuses to
      // leave the shape empty.
      if (justDown && mouse.button === 2) {
        this._shapeDeleteAtCursor();
        return;
      }
      // Left-click + drag places a new primitive. Drag start is the
      // primitive's center for circle, and the rect's center is the
      // midpoint of the drag. Both endpoints grid-snap when snap is on,
      // so circle radii land on grid points and rect corners do too.
      if (justDown && mouse.button === 0) {
        const wp = this._snap(this.hoverWorld);
        this._shapeDragStart = { x: wp.x, y: wp.y };
      }
      if (justUp && this._shapeDragStart) {
        const a = this._shapeDragStart;
        const b = this._snap(this.hoverWorld);
        this._shapeDragStart = null;
        const MIN = 12;
        if (this._shapeAddType === "circle") {
          const r = Math.hypot(b.x - a.x, b.y - a.y);
          if (r >= MIN) {
            this.pushHistory();
            this._pushMirrored({ type: "circle", cx: a.x, cy: a.y, r, sign: this._shapeAddSign });
            Shape.invalidate(World.shape);
            this._syncBoundsToShape();
            this.dirty = true;
            this.renderBar();
          }
        } else {
          const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
          if (w >= MIN && h >= MIN) {
            this.pushHistory();
            this._pushMirrored({
              type: "rect", cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
              w, h, sign: this._shapeAddSign,
            });
            Shape.invalidate(World.shape);
            this._syncBoundsToShape();
            this.dirty = true;
            this.renderBar();
          }
        }
      }
      return;
    }

    // ---- Velocity tool --------------------------------------------
    if (this.tool === "velocity") {
      if (justDown && mouse.button === 0) {
        const target = this._nearestCircle(this.hoverWorld);
        if (target) this._velDragMote = target;
      }
      if (justUp && this._velDragMote) {
        const m = this._velDragMote;
        // Hold Shift during the drag (or at release) to lock the
        // velocity vector to a 45° step; cursor distance still picks |v|.
        const tip = this._velEffectiveCursor();
        const dx = tip.x - m.x;
        const dy = tip.y - m.y;
        if (Math.hypot(dx, dy) > 5) {
          this.pushHistory();
          m.vx = dx; m.vy = dy;
          // Mirror-aware: also set reflected velocities on any mote whose
          // position matches the mirrored counterpart of the dragged one.
          if (this.mirror !== "none") {
            const positions = this._mirrorPositions({ x: m.x, y: m.y });
            for (let i = 1; i < positions.length; i++) {
              const p = positions[i];
              const partner = this._nearestCircle(p);
              if (partner && partner !== m) {
                partner.vx = dx * p.sx;
                partner.vy = dy * p.sy;
              }
            }
          }
          this.dirty = true;
        }
        this._velDragMote = null;
      }
      if (justDown && mouse.button === 2) {
        const target = this._nearestCircle(this.hoverWorld);
        if (target && (target.vx || target.vy)) {
          this.pushHistory();
          target.vx = 0; target.vy = 0;
          this.dirty = true;
        }
      }
      return;
    }

    // ---- Place tool (default) -------------------------------------
    // Aim mode: the click that placed the player armed `_aimingPlayer`.
    // The next click in the canvas commits its initial velocity (left = set,
    // any other button = cancel and leave it at zero).
    if (this._aimingPlayer && justDown) {
      if (mouse.button === 0 && World.player) {
        // Hold Shift while clicking to lock the velocity vector to a
        // 45° step (same as the polygon-vertex angle snap).
        const aim = this._aimEffectiveCursor();
        const dx = aim.x - World.player.x;
        const dy = aim.y - World.player.y;
        if (Math.hypot(dx, dy) > 5) {
          World.player.vx = dx; World.player.vy = dy;
          this.dirty = true;
        }
      }
      this._aimingPlayer = false;
      return;
    }
    if (justDown) {
      this.pushHistory();
      const wp = this._snap(this.hoverWorld);
      const hueFor = kind => kind === "player" ? 180 :
                              kind === "__kut__" ? 320 :
                              KIND_META[kind] ? KIND_META[kind].hue : 200 + Math.random()*80;

      if (mouse.button === 2) {
        const target = this._nearestCircle(wp);
        if (target) {
          if (target === World.player) World.player = null;
          World.circles = World.circles.filter(c => c !== target);
        } else {
          const w = this._nearestWell(wp);
          if (w) World.gravityCenters = World.gravityCenters.filter(o => o !== w);
        }
      } else if (mouse.button === 1) {
        const target = this._nearestCircle(wp);
        if (!target) return;
        const newKind = this.selectedKind;
        if (newKind === "well") {
          if (target === World.player) World.player = null;
          World.circles = World.circles.filter(c => c !== target);
          World.gravityCenters.push({ x: target.x, y: target.y, strength: 2_000_000 });
        } else if (newKind === "player") {
          if (World.player && World.player !== target) World.player.kind = "neutral";
          target.kind = "player"; target.hue = hueFor("player");
          World.player = target;
        } else {
          if (target === World.player) World.player = null;
          target.kind = newKind; target.hue = hueFor(newKind);
        }
      } else {
        // LEFT — place, with optional mirror duplication.
        const places = this._mirrorPositions(wp);
        for (const pos of places) this._placeAt(pos.x, pos.y, hueFor);
        // Newly placed/moved player → arm aim mode for initial direction.
        if (this.selectedKind === "player" && World.player) {
          this._aimingPlayer = true;
        }
      }
    }
  },

  toggleFocus() {
    if (this.focus === "canvas") {
      this.focus = "toolbar";
      // Return to the field the user was last on, so X→tweak→X→X lands
      // back on (e.g.) the Kind dropdown instead of the first field.
      const last = this._lastFocusId && document.getElementById(this._lastFocusId);
      const target = (last && editorBar.contains(last) ? last : null)
                     || editorBar.querySelector("select, input, button");
      if (target) target.focus();
    } else {
      this.focus = "canvas";
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }
  },

  // Render hover preview
  drawOverlay() {
    if (!this.active || !this.hoverWorld) return;
    ctx.save();
    if (this.focus !== "canvas") ctx.globalAlpha = 0.35;

    // Mirror axes — dashed magenta line(s) marking where reflections
    // happen. "Horizontal" mirror flips left↔right, so its axis is a
    // vertical line at the world's horizontal center; "vertical" is the
    // converse. Drawn first so primitives and tool previews render on
    // top.
    if (this.mirror !== "none") {
      const b = World.bounds;
      const cxW = b.x + b.w / 2;
      const cyW = b.y + b.h / 2;
      ctx.save();
      ctx.strokeStyle = "rgba(255,140,220,0.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 6]);
      if (this.mirror === "horizontal" || this.mirror === "both") {
        const top = View.worldToScreen(cxW, b.y);
        const bot = View.worldToScreen(cxW, b.y + b.h);
        ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
      }
      if (this.mirror === "vertical" || this.mirror === "both") {
        const left  = View.worldToScreen(b.x,         cyW);
        const right = View.worldToScreen(b.x + b.w,   cyW);
        ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y); ctx.stroke();
      }
      ctx.restore();
    }

    // Shape tool — fill the playable area faintly so the editable
    // region reads at a glance, but make carved regions match the
    // outside (so the player sees one unified "off-limits" colour
    // whether they're outside the shape or inside a hole). Boundary
    // is drawn afterwards as a single uniform stroke covering only
    // the union edges (no internal seams, no carve walls outside the
    // union).
    if (this.tool === "shape" && Array.isArray(World.shape)) {
      ctx.save();
      const fillPrim = (p) => {
        if (p.type === "rect") {
          const tl = View.worldToScreen(p.cx - p.w / 2, p.cy - p.h / 2);
          const br = View.worldToScreen(p.cx + p.w / 2, p.cy + p.h / 2);
          ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        } else if (p.type === "circle") {
          const c = View.worldToScreen(p.cx, p.cy);
          ctx.beginPath();
          ctx.arc(c.x, c.y, p.r * World.cameraScale, 0, TAU);
          ctx.fill();
        } else if (p.type === "polygon") {
          ctx.beginPath();
          for (let i = 0; i < p.points.length; i++) {
            const v = p.points[i];
            const s = View.worldToScreen(v.x, v.y);
            if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
          }
          ctx.closePath();
          ctx.fill();
        }
      };
      // Walk primitives in order and paint each one's region with the
      // playable / unplayable colour. Ordered CSG means a later "+"
      // restores area carved by an earlier "-", and a later "-"
      // re-carves area added by a "+". Translucent cyan accumulates
      // slightly on overlapping "+" regions but reads as "playable".
      for (const p of World.shape) {
        ctx.fillStyle = p.sign === "+" ? "rgba(120,200,255,0.10)" : "#040a14";
        fillPrim(p);
      }
      // Step 3: stroke the union boundary uniformly — same look for
      // edges contributed by "+" rects, "+" circles, or "-" carves.
      ctx.strokeStyle = World.edgeColor || "#8cdcff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const seg of Shape.visibleSegments(World.shape)) {
        if (seg.type === "line") {
          const a = View.worldToScreen(seg.x0, seg.y0);
          const b = View.worldToScreen(seg.x1, seg.y1);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        } else {
          const c = View.worldToScreen(seg.cx, seg.cy);
          ctx.moveTo(c.x + Math.cos(seg.a0) * seg.r * World.cameraScale,
                     c.y + Math.sin(seg.a0) * seg.r * World.cameraScale);
          ctx.arc(c.x, c.y, seg.r * World.cameraScale, seg.a0, seg.a1);
        }
      }
      ctx.stroke();
      // Small framed text badge for live shape-dimension readouts. World
      // coords; clamped to canvas so the label stays visible at the edges.
      const drawDimBadge = (sx, sy, text, color) => {
        ctx.save();
        ctx.setLineDash([]);
        ctx.font = "12px ui-monospace, Menlo, monospace";
        ctx.textBaseline = "top";
        const padX = 5, padY = 2;
        const tw = ctx.measureText(text).width;
        const bw = tw + padX * 2;
        const bh = 12 + padY * 2 + 2;
        const x = Math.max(2, Math.min(W - bw - 2, sx));
        const y = Math.max(2, Math.min(H - bh - 2, sy));
        ctx.fillStyle = "rgba(4,12,22,0.85)";
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = color;
        ctx.fillText(text, x + padX, y + padY + 1);
        ctx.restore();
      };
      // Live placement preview during a drag — show the candidate
      // primitive's outline so the user sees what they're about to
      // commit. Sign distinguishes the preview style only because the
      // user hasn't committed yet (committed shapes use the uniform
      // boundary above).
      if (this._shapeDragStart) {
        const a = this._shapeDragStart;
        // Preview reflects the snapped end so the dashed outline and
        // dimension readout match what the upcoming mouseup will commit.
        const b = this._snap(this.hoverWorld);
        const sub = this._shapeAddSign === "-";
        const stroke = sub ? "rgba(255,170,200,0.95)" : "rgba(140,220,255,0.95)";
        const labelColor = sub ? "rgba(255,210,225,1)" : "rgba(190,235,255,1)";
        // Reflect drag endpoints across each active mirror axis so the
        // dashed preview shows every primitive the mouseup will spawn.
        const axes = this._mirrorAxes();
        const cxW = World.bounds.x + World.bounds.w / 2;
        const cyW = World.bounds.y + World.bounds.h / 2;
        for (let i = 0; i < axes.length; i++) {
          const [sx, sy] = axes[i];
          const fx = (x) => sx === -1 ? 2 * cxW - x : x;
          const fy = (y) => sy === -1 ? 2 * cyW - y : y;
          const ma = { x: fx(a.x), y: fy(a.y) };
          const mb = { x: fx(b.x), y: fy(b.y) };
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          // Mirror copies render slightly faded so the original reads as
          // the "primary" placement that the user is steering directly.
          ctx.globalAlpha = i === 0 ? 1 : 0.55;
          if (this._shapeAddType === "circle") {
            const sa = View.worldToScreen(ma.x, ma.y);
            const r = Math.hypot(mb.x - ma.x, mb.y - ma.y) * World.cameraScale;
            ctx.beginPath(); ctx.arc(sa.x, sa.y, r, 0, TAU); ctx.stroke();
          } else {
            const sa = View.worldToScreen(Math.min(ma.x, mb.x), Math.min(ma.y, mb.y));
            const sb = View.worldToScreen(Math.max(ma.x, mb.x), Math.max(ma.y, mb.y));
            ctx.strokeRect(sa.x, sa.y, sb.x - sa.x, sb.y - sa.y);
          }
          ctx.globalAlpha = 1;
          // Dimension badge only on the original — reading the same
          // numbers four times is just clutter.
          if (i === 0) {
            ctx.setLineDash([]);
            if (this._shapeAddType === "circle") {
              const sb = View.worldToScreen(mb.x, mb.y);
              drawDimBadge(sb.x + 10, sb.y + 10,
                `r ${Math.round(Math.hypot(mb.x - ma.x, mb.y - ma.y))}`, labelColor);
            } else {
              const cs = View.worldToScreen(mb.x, mb.y);
              drawDimBadge(cs.x + 10, cs.y + 10,
                `${Math.round(Math.abs(mb.x - ma.x))} × ${Math.round(Math.abs(mb.y - ma.y))}`,
                labelColor);
            }
          }
        }
        ctx.setLineDash([]);
      }
      // Polygon draft preview — committed vertices joined with solid
      // lines, the rubber band from the last vertex to the cursor
      // dashed. A pulsing ring on the first vertex indicates the
      // snap-to-close hit zone.
      if (this._polyDraft && this._polyDraft.length > 0) {
        const sub = this._shapeAddSign === "-";
        const stroke = sub ? "rgba(255,170,200,0.95)" : "rgba(140,220,255,0.95)";
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        const first = this._polyDraft[0];
        const fs = View.worldToScreen(first.x, first.y);
        ctx.moveTo(fs.x, fs.y);
        for (let i = 1; i < this._polyDraft.length; i++) {
          const v = this._polyDraft[i];
          const s = View.worldToScreen(v.x, v.y);
          ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();
        // Vertices.
        ctx.fillStyle = stroke;
        for (const v of this._polyDraft) {
          const s = View.worldToScreen(v.x, v.y);
          ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, TAU); ctx.fill();
        }
        // Rubber band — to angle-snapped target if Shift is held,
        // else to the raw cursor.
        if (this.hoverWorld) {
          const target = this._polyEffectiveCursor();
          const last = this._polyDraft[this._polyDraft.length - 1];
          const ls = View.worldToScreen(last.x, last.y);
          const ts = View.worldToScreen(target.x, target.y);
          // When snapping, brighten the rubber band so the user sees
          // it took effect.
          ctx.strokeStyle = mouse.shift ? "rgba(255,230,140,0.95)" : stroke;
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = mouse.shift ? 2 : 1.5;
          ctx.beginPath();
          ctx.moveTo(ls.x, ls.y); ctx.lineTo(ts.x, ts.y);
          ctx.stroke();
          ctx.setLineDash([]);
          // Pending-segment length — shown on the rubber band so the
          // user can dial in vertex spacing without committing first.
          const segLen = Math.hypot(target.x - last.x, target.y - last.y);
          if (segLen > 1) {
            const labelColor = sub ? "rgba(255,210,225,1)" : "rgba(190,235,255,1)";
            drawDimBadge((ls.x + ts.x) / 2 + 10, (ls.y + ts.y) / 2 + 10,
              `${Math.round(segLen)}`, labelColor);
          }
          // Snap-to-first indicator — thicker ring when the cursor
          // is within the snap radius of the first vertex (uses raw
          // cursor, since close-snap is independent of angle-snap).
          if (this._polyDraft.length >= 3) {
            const cs = View.worldToScreen(this.hoverWorld.x, this.hoverWorld.y);
            const dx = cs.x - fs.x, dy = cs.y - fs.y;
            const near = Math.hypot(dx, dy) < 12;
            ctx.strokeStyle = near ? "rgba(255,230,140,1)" : stroke;
            ctx.lineWidth = near ? 2 : 1;
            ctx.beginPath(); ctx.arc(fs.x, fs.y, 8, 0, TAU); ctx.stroke();
          }
        }
        // Mirror previews — faded copies of the in-progress draft so
        // the user can see every polygon the eventual commit will spawn.
        if (this.mirror !== "none") {
          const cxW = World.bounds.x + World.bounds.w / 2;
          const cyW = World.bounds.y + World.bounds.h / 2;
          const axes = this._mirrorAxes();
          ctx.save();
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = stroke;
          ctx.fillStyle = stroke;
          ctx.lineWidth = 2;
          for (let i = 1; i < axes.length; i++) {
            const [sx, sy] = axes[i];
            const fx = (x) => sx === -1 ? 2 * cxW - x : x;
            const fy = (y) => sy === -1 ? 2 * cyW - y : y;
            ctx.setLineDash([]);
            ctx.beginPath();
            const m0 = View.worldToScreen(fx(this._polyDraft[0].x), fy(this._polyDraft[0].y));
            ctx.moveTo(m0.x, m0.y);
            for (let j = 1; j < this._polyDraft.length; j++) {
              const v = this._polyDraft[j];
              const s = View.worldToScreen(fx(v.x), fy(v.y));
              ctx.lineTo(s.x, s.y);
            }
            ctx.stroke();
            for (const v of this._polyDraft) {
              const s = View.worldToScreen(fx(v.x), fy(v.y));
              ctx.beginPath(); ctx.arc(s.x, s.y, 3, 0, TAU); ctx.fill();
            }
            if (this.hoverWorld) {
              const target = this._polyEffectiveCursor();
              const last = this._polyDraft[this._polyDraft.length - 1];
              const mls = View.worldToScreen(fx(last.x), fy(last.y));
              const mts = View.worldToScreen(fx(target.x), fy(target.y));
              ctx.setLineDash([6, 4]);
              ctx.beginPath();
              ctx.moveTo(mls.x, mls.y); ctx.lineTo(mts.x, mts.y);
              ctx.stroke();
              ctx.setLineDash([]);
            }
          }
          ctx.restore();
        }
      }
      // Snap-target indicator — semi-transparent yellow ring at the
      // point the next click/release will commit to (rect corner,
      // circle radius endpoint, polygon vertex). Only shown when grid
      // snap is on; angle-snap (Shift) gets its own brightened rubber
      // band already.
      if (this.snap && this.hoverWorld) {
        const t = this._shapeTargetPoint();
        const s = View.worldToScreen(t.x, t.y);
        ctx.save();
        ctx.setLineDash([]);
        ctx.fillStyle   = "rgba(255,230,140,0.22)";
        ctx.strokeStyle = "rgba(255,230,140,0.85)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, TAU);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Selection halos
    if (this.selection.size > 0) {
      ctx.strokeStyle = "rgba(255,230,120,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      for (const c of this.selection) {
        const sp = View.worldToScreen(c.x, c.y);
        const sr = (c.r + 4) * World.cameraScale;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sr, 0, TAU); ctx.stroke();
      }
    }

    // Arrow helper — used by player-direction marker and velocity tool below.
    const drawArrow = (sx, sy, ex, ey, color, headLen) => {
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      const ang = Math.atan2(ey - sy, ex - sx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.45) * headLen, ey - Math.sin(ang - 0.45) * headLen);
      ctx.lineTo(ex - Math.cos(ang + 0.45) * headLen, ey - Math.sin(ang + 0.45) * headLen);
      ctx.closePath(); ctx.fill();
    };

    // Player initial-direction marker — always visible in the designer,
    // regardless of which tool is active. Velocity-tool below skips the
    // player so this brighter arrow isn't overdrawn.
    if (World.player && (Math.abs(World.player.vx) > 0.1 || Math.abs(World.player.vy) > 0.1)) {
      const p = World.player;
      const a = View.worldToScreen(p.x, p.y);
      const b = View.worldToScreen(p.x + p.vx, p.y + p.vy);
      ctx.lineWidth = 2.5; ctx.setLineDash([]);
      drawArrow(a.x, a.y, b.x, b.y, "rgba(120,220,255,0.95)", 12);
    }

    // Aim-mode preview — after placing the player, draw a live arrow from
    // the player to the cursor until the user clicks (sets) or interacts
    // with a control (cancels, leaving vx/vy at zero).
    if (this._aimingPlayer && World.player) {
      const p = World.player;
      const a = View.worldToScreen(p.x, p.y);
      const aim = this._aimEffectiveCursor();
      const b = View.worldToScreen(aim.x, aim.y);
      ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      // Brighten the rubber band when angle-snap is active, mirroring
      // the polygon-rubber-band cue.
      drawArrow(a.x, a.y, b.x, b.y,
        mouse.shift ? "rgba(255,230,140,0.95)" : "rgba(120,220,255,0.7)", 11);
      ctx.setLineDash([]);
    }

    // Velocity-tool overlay — show current vx/vy as arrows on every moving
    // circle, plus a brighter live arrow during a drag.
    if (this.tool === "velocity") {
      ctx.lineWidth = 1.5; ctx.setLineDash([]);
      for (const c of World.circles) {
        if (c === World.player) continue;        // drawn above as player marker
        if (Math.abs(c.vx) < 0.5 && Math.abs(c.vy) < 0.5) continue;
        if (c === this._velDragMote) continue;   // drawn brighter below
        const a = View.worldToScreen(c.x, c.y);
        const b = View.worldToScreen(c.x + c.vx, c.y + c.vy);
        drawArrow(a.x, a.y, b.x, b.y, "rgba(255,200,80,0.5)", 8);
      }
      if (this._velDragMote) {
        const m = this._velDragMote;
        const a = View.worldToScreen(m.x, m.y);
        // Tip = Shift-snapped (when held) so the on-screen arrow tracks
        // exactly what mouseup will commit.
        const tip = this._velEffectiveCursor();
        const b = View.worldToScreen(tip.x, tip.y);
        const arrowColor = mouse.shift ? "rgba(255,230,140,0.95)" : "rgba(255,220,120,0.95)";
        ctx.lineWidth = 2;
        drawArrow(a.x, a.y, b.x, b.y, arrowColor, 11);
        // Speed readout near the cursor
        const v = Math.hypot(tip.x - m.x, tip.y - m.y);
        ctx.font = "11px ui-monospace, Menlo, monospace";
        ctx.fillStyle = arrowColor;
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(`|v|=${v.toFixed(0)}`, b.x + 10, b.y + 12);
        // Direction readout — same form as the move-to-line tool.
        // Anchored at the circle being dragged so the angle and the
        // arrow's tail share an origin.
        this._drawAngleBadge(a, tip.x - m.x, tip.y - m.y, arrowColor);
      }
    }

    // Active drag-rectangle (select tool)
    if (this.tool === "select" && this._selDragStart) {
      const a = View.worldToScreen(this._selDragStart.x, this._selDragStart.y);
      const b = View.worldToScreen(this.hoverWorld.x, this.hoverWorld.y);
      ctx.strokeStyle = "rgba(255,230,120,0.6)";
      ctx.fillStyle   = "rgba(255,230,120,0.08)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    // Shift+move-drag snap helpers — for each circle in the move-drag,
    // fan eight dashed lines out from its original position along the
    // 45° snap directions, each cut to the current drag distance.
    // Visualizes the eight possible landing points so the user can
    // see which axis they're committing to. The active direction
    // (where the drag is currently snapping) renders brighter.
    if (this._moveDrag && mouse.shift) {
      const md = this._moveDrag;
      const dxRaw = this.hoverWorld.x - md.startWorld.x;
      const dyRaw = this.hoverWorld.y - md.startWorld.y;
      const len = Math.hypot(dxRaw, dyRaw);
      if (len > 1e-3) {
        const STEP = Math.PI / 4;
        // Index of the direction the drag is currently snapping to,
        // normalized into [0, 8).
        let activeIdx = Math.round(Math.atan2(dyRaw, dxRaw) / STEP);
        activeIdx = ((activeIdx % 8) + 8) % 8;
        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        for (const m of md.motes) {
          const op = View.worldToScreen(m.ox, m.oy);
          for (let i = 0; i < 8; i++) {
            const a = i * STEP;
            const ex = m.ox + Math.cos(a) * len;
            const ey = m.oy + Math.sin(a) * len;
            const ep = View.worldToScreen(ex, ey);
            ctx.strokeStyle = (i === activeIdx)
              ? "rgba(255,230,140,0.95)"
              : "rgba(255,230,140,0.30)";
            ctx.beginPath();
            ctx.moveTo(op.x, op.y);
            ctx.lineTo(ep.x, ep.y);
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Ring-placement preview — guide ring + spokes from anchor to motes
    if (this._ring) {
      const r = this._ring;
      const a = View.worldToScreen(r.anchor.x, r.anchor.y);
      const screenR = r.radius * World.cameraScale;
      ctx.strokeStyle = "rgba(140,220,255,0.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.arc(a.x, a.y, screenR, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(140,220,255,0.22)";
      ctx.lineWidth = 1;
      for (const m of r.motes) {
        const mp = View.worldToScreen(m.c.x, m.c.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mp.x, mp.y); ctx.stroke();
      }
      // Modal banner — drawn in screen space, top-left.
      ctx.font = "12px ui-monospace, Menlo, monospace";
      const text = `RING  r=${r.radius.toFixed(0)}  ·  wheel/L+R: radius  ·  E: ${r.evenSpacing ? "even ✓" : "preserve angles"}  ·  click/A: commit  ·  Esc/B: cancel`;
      const w = ctx.measureText(text).width + 16;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(20, 20, w, 24);
      ctx.fillStyle = "rgba(220,240,255,0.95)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(text, 28, 32);
    }

    // Move-to-line preview — the dragged polyline (with bounds-wall
    // ricochets) plus dashed connectors from each selected circle to
    // its closest perpendicular foot across all segments, and a small
    // dot at every landing point.
    if (this._lineMode) {
      const lm = this._lineMode;
      if (lm.start && lm.end) {
        const ricochet = !!mouse.ctrl;
        const segments = this._buildLineRicochets(lm.start, lm.end, ricochet, lm.bounces);
        const lineColor = mouse.shift ? "rgba(255,230,140,0.95)" : "rgba(140,220,255,0.85)";
        const startScr = View.worldToScreen(lm.start.x, lm.start.y);
        // Angle of the first leg, displayed near the line's start so
        // the user can copy it onto a phage's velocity / aim setup.
        // Helper places the badge perpendicular to the line so it's
        // visible past the line itself.
        const seg0 = segments[0];
        this._drawAngleBadge(
          startScr,
          seg0.b.x - seg0.a.x, seg0.b.y - seg0.a.y,
          lineColor,
        );
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([]);
        for (const seg of segments) {
          const a = View.worldToScreen(seg.a.x, seg.a.y);
          const b = View.worldToScreen(seg.b.x, seg.b.y);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        // Vertex markers — start, every ricochet bounce, and final end.
        ctx.fillStyle = lineColor;
        ctx.beginPath(); ctx.arc(startScr.x, startScr.y, 3, 0, TAU); ctx.fill();
        for (let i = 0; i < segments.length; i++) {
          const v = segments[i].b;
          const s = View.worldToScreen(v.x, v.y);
          // Slightly smaller dot for intermediate bounce points so the
          // line's true endpoints stand out visually.
          const r = (i === segments.length - 1) ? 3 : 2.25;
          ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
        }
        // Dashed connectors from each circle to its closest foot.
        ctx.strokeStyle = "rgba(255,230,120,0.6)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        for (const m of lm.motes) {
          const proj = this._projectOntoSegments(m.c, segments);
          if (!proj) continue;
          const mp = View.worldToScreen(m.c.x, m.c.y);
          const pp = View.worldToScreen(proj.x, proj.y);
          ctx.beginPath(); ctx.moveTo(mp.x, mp.y); ctx.lineTo(pp.x, pp.y); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,230,120,0.85)";
        for (const m of lm.motes) {
          const proj = this._projectOntoSegments(m.c, segments);
          if (!proj) continue;
          const pp = View.worldToScreen(proj.x, proj.y);
          ctx.beginPath(); ctx.arc(pp.x, pp.y, 3, 0, TAU); ctx.fill();
        }
      }
      // Modal banner — top-left, mirrors the ring banner's style. The
      // bounce indicator only shows while Ctrl is held, since that's
      // the only state where it actually shapes the polyline.
      ctx.font = "12px ui-monospace, Menlo, monospace";
      const ricoTag = mouse.ctrl
        ? `  ·  RICOCHET (${lm.bounces} bounce${lm.bounces === 1 ? "" : "s"})  ·  a/d adjust`
        : `  ·  Ctrl: ricochet`;
      const text = lm.start
        ? `LINE  ·  release to commit  ·  Shift: 0°/45°/90°${ricoTag}  ·  Esc/B: cancel`
        : `LINE  ·  click and drag to define the line${ricoTag}  ·  Esc/B: cancel`;
      const w = ctx.measureText(text).width + 16;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(20, 20, w, 24);
      ctx.fillStyle = "rgba(220,240,255,0.95)";
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      ctx.fillText(text, 28, 32);
    }

    // Place-tool hover preview
    if (this.tool === "place") {
      const wp = this._snap(this.hoverWorld);
      const positions = this._mirrorPositions(wp);
      if (this.selectedKind === "well") {
        const ring = (60 + this.selectedSize * 2) * World.cameraScale;
        ctx.strokeStyle = "rgba(255,180,80,0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        for (let i = 0; i < positions.length; i++) {
          const mp = View.worldToScreen(positions[i].x, positions[i].y);
          ctx.globalAlpha = i === 0 ? 1 : 0.5;
          ctx.beginPath(); ctx.arc(mp.x, mp.y, ring, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(mp.x, mp.y, ring * 0.4, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        const r = this.selectedSize * World.cameraScale;
        ctx.globalCompositeOperation = "lighter";
        const k = this.selectedKind;
        const hue = k === "player" ? 180 : (KIND_META[k] ? KIND_META[k].hue : 250);
        ctx.strokeStyle = hueColor(hue, 80, 70, 0.7);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        for (let i = 0; i < positions.length; i++) {
          const mp = View.worldToScreen(positions[i].x, positions[i].y);
          ctx.globalAlpha = i === 0 ? 1 : 0.5;
          ctx.beginPath(); ctx.arc(mp.x, mp.y, r, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  },
};
