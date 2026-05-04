import { Audio_ } from "./audio.js";
import { KIND_META, TAU } from "./core.js";
import { Debug } from "./debug.js";
import { Editor } from "./editor.js";
import { Game } from "./game.js";
import { JsonPanel } from "./json-panel.js";
import { Kinds } from "./kinds.js";
import { LevelStore } from "./level-store.js";
import { Persist } from "./persist.js";
import { Player } from "./player.js";
import { Settings } from "./settings.js";
import { Shape } from "./shape.js";
import { Stats } from "./stats.js";
import { Touch } from "./touch.js";
import { UI } from "./ui.js";
import { View } from "./view.js";
import { World } from "./world.js";

// Side-effect imports — these partial modules attach methods to the
// Editor / UI god-objects via `Object.assign`. They must evaluate so
// the methods are present before any consumer calls them. The
// partials each import the parent object themselves; this just
// triggers their evaluation in the module graph.
import "./editor-history.js";
import "./editor-io.js";
import "./editor-selection.js";
import "./editor-shape.js";
import "./editor-modes.js";
import "./editor-helpers.js";
import "./ui-menus.js";
import "./ui-modals.js";
import "./ui-settings.js";
import "./ui-kinds.js";

// ============================================================
//   LUMENPHAGE — bioluminescent drift
// ============================================================

export const canvas = document.getElementById("game");
export const ctx    = canvas.getContext("2d");
export const overlay = document.getElementById("overlay");
export const hud     = document.getElementById("hud");
export const hudL    = document.getElementById("hud-left");
export const hudR    = document.getElementById("hud-right");
export const editorBar = document.getElementById("editor-bar");
export const editorHelp = document.getElementById("editor-help");
// Persist the strip's open/closed state across sessions.
try {
  if (localStorage.getItem("lumenphage.editorHelpOpen") === "true") editorHelp.open = true;
} catch {}
editorHelp.addEventListener("toggle", () => {
  try { localStorage.setItem("lumenphage.editorHelpOpen", editorHelp.open ? "true" : "false"); } catch {}
});
const toastEl = document.getElementById("toast");
const musicNameEl = document.getElementById("music-name");
// Click the music-name pill to cycle tracks. Only visible in debug, so this
// only fires when the user has it on the screen anyway.
export const MUSIC_TRACKS = ["calm", "aurora", "glacial", "tide", "nebula"];
musicNameEl.addEventListener("click", () => {
  if (!Audio_.ctx) return;
  const cur = Audio_.currentTrack;
  const i = Math.max(0, MUSIC_TRACKS.indexOf(cur));
  const next = MUSIC_TRACKS[(i + 1) % MUSIC_TRACKS.length];
  Audio_.startMusic(next);
  toast(`Music: ${next}`);
});
const pauseBtnEl = document.getElementById("pause-btn");
pauseBtnEl.addEventListener("click", () => Game.togglePause());

let DPR = Math.min(window.devicePixelRatio || 1, 2);
export let W = 0, H = 0;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", resize);
resize();

export function toast(msg, ms = 1600) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove("show"), ms);
}


// Tag chip-input widget. Adapted from the awk-estra implementation. Renders
// a list of removable chips + a typing input that surfaces a filtered
// dropdown of existing tags, with a trailing "Create 'foo'" row when the
// query is not already in the suggestion set.
//
// Caller passes `initial` as a string array and reads back via getTags().
// Normalisation (lowercase + trim) happens inside.
export function createTagChipInput(root, opts = {}) {
  function normalizeOne(raw) { return String(raw || "").trim().toLowerCase(); }

  root.classList.add("tag-chip-input");
  root.replaceChildren();

  const list = document.createElement("div");
  list.className = "tag-chip-list";
  root.appendChild(list);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "tag-chip-input-field";
  input.placeholder = opts.placeholder || "Add tag…";
  input.autocomplete = "off";
  input.spellcheck = false;
  if (opts.inputId) input.id = opts.inputId;
  list.appendChild(input);

  const dropdown = document.createElement("ul");
  dropdown.className = "tag-chip-dropdown";
  dropdown.setAttribute("role", "listbox");
  dropdown.hidden = true;
  root.appendChild(dropdown);

  const tags = new Set((opts.initial || []).map(normalizeOne).filter(Boolean));
  let suggestions = (opts.suggestions || []).map(normalizeOne).filter(Boolean);
  let rows = [];
  let highlighted = 0;

  const fireChange = () => { if (opts.onChange) opts.onChange([...tags]); };

  function renderChips() {
    for (const child of Array.from(list.children)) {
      if (child !== input) child.remove();
    }
    for (const t of tags) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.dataset.tag = t;
      const label = document.createElement("span");
      label.className = "tag-chip-label";
      label.textContent = t;
      chip.appendChild(label);
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "tag-chip-remove";
      rm.setAttribute("aria-label", `Remove tag ${t}`);
      rm.title = `Remove tag ${t}`;
      rm.textContent = "×";
      // mousedown + preventDefault so the input keeps focus after removing.
      rm.addEventListener("mousedown", e => e.preventDefault());
      rm.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        tags.delete(t);
        renderChips();
        refreshDropdown();
        fireChange();
        input.focus();
      });
      chip.appendChild(rm);
      list.insertBefore(chip, input);
    }
  }

  function refreshDropdown() {
    const q = input.value.trim().toLowerCase();
    const matches = suggestions.filter(s => !tags.has(s) && (!q || s.includes(q)));
    rows = matches.map(v => ({ value: v, isCreate: false }));
    if (q && !suggestions.includes(q) && !tags.has(q)) {
      rows.push({ value: q, isCreate: true });
    }
    if (!rows.length) {
      dropdown.hidden = true;
      dropdown.replaceChildren();
      return;
    }
    if (highlighted >= rows.length) highlighted = 0;
    dropdown.replaceChildren();
    rows.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "tag-chip-dropdown-item";
      if (i === highlighted) li.classList.add("highlighted");
      li.dataset.index = String(i);
      li.setAttribute("role", "option");
      if (r.isCreate) {
        const prefix = document.createElement("span");
        prefix.className = "tag-chip-dropdown-prefix";
        prefix.textContent = "Create ";
        const val = document.createElement("span");
        val.className = "tag-chip-dropdown-new";
        val.textContent = `"${r.value}"`;
        li.appendChild(prefix);
        li.appendChild(val);
      } else {
        li.textContent = r.value;
      }
      li.addEventListener("mousedown", e => { e.preventDefault(); commit(r.value); });
      li.addEventListener("mouseenter", () => { highlighted = i; updateHighlight(); });
      dropdown.appendChild(li);
    });
    dropdown.hidden = false;
  }
  function updateHighlight() {
    dropdown.querySelectorAll(".tag-chip-dropdown-item").forEach((el, i) => {
      el.classList.toggle("highlighted", i === highlighted);
    });
  }
  function commit(value) {
    const v = normalizeOne(value);
    input.value = "";
    highlighted = 0;
    if (!v || tags.has(v)) { refreshDropdown(); return; }
    tags.add(v);
    renderChips();
    refreshDropdown();
    fireChange();
  }

  input.addEventListener("input",  e => {
    // Don't bubble — typing into the suggestion filter isn't a content
    // change. Only commit/remove (via onChange) is a real change.
    e.stopPropagation();
    highlighted = 0; refreshDropdown();
  });
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") {
      if (!dropdown.hidden && rows[highlighted]) {
        e.preventDefault();
        commit(rows[highlighted].value);
      } else if (input.value.trim()) {
        e.preventDefault();
        commit(input.value);
      }
    } else if (e.key === "Backspace" && !input.value) {
      const last = [...tags].pop();
      if (last !== undefined) {
        e.preventDefault();
        tags.delete(last);
        renderChips();
        refreshDropdown();
        fireChange();
      }
    } else if (e.key === "ArrowDown" && !dropdown.hidden) {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, rows.length - 1);
      updateHighlight();
    } else if (e.key === "ArrowUp" && !dropdown.hidden) {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      updateHighlight();
    } else if (e.key === "Escape" && !dropdown.hidden) {
      e.preventDefault(); e.stopPropagation();
      dropdown.hidden = true;
    }
  });
  input.addEventListener("focus", refreshDropdown);
  input.addEventListener("blur", () => {
    setTimeout(() => { dropdown.hidden = true; }, 150);
  });

  // Click on the chip-list chrome (not a chip) focuses the input.
  root.onclick = e => {
    if (e.target === root || e.target === list) input.focus();
  };

  renderChips();

  return {
    getTags: () => [...tags],
    setSuggestions: next => {
      suggestions = next.map(normalizeOne).filter(Boolean);
      refreshDropdown();
    }
  };
}

// ============================================================
//   INPUT — gamepad (SNES mapper) + keyboard fallback
// ============================================================

const CONTROLLER_MAP = {
  DPAD_LEFT: 14, DPAD_RIGHT: 15, SELECT: 8, START: 9,
  A: 1, B: 0, X: 3, Y: 2, L: 4, R: 5,
  DPAD_UP: 12, DPAD_DOWN: 13
};

function getGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p) return p;
  return null;
}

const _padPrev = {};
const _keyDown = {};
const _keyPrev = {};

// Any element where the user can edit a value with the keyboard.
// Backspace is mapped to SELECT in the action layer (and Space/Arrows map
// to A / DPAD_*); when one of these fields is focused we must let the
// browser handle the keystroke natively rather than firing nav actions.
function isEditingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = (el.type || "text").toLowerCase();
    return t === "text"   || t === "number" || t === "search" ||
           t === "email"  || t === "url"    || t === "tel"    ||
           t === "password";
  }
  return false;
}
// Narrower: targets where Space and arrow keys carry text-editing meaning
// (cursor movement, typing a space). Number inputs are excluded so the
// existing arrow-keys-as-spatial-nav UX in form-style menus is preserved.
function isTextInputTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") {
    const t = (el.type || "text").toLowerCase();
    return t === "text"  || t === "search" || t === "email" ||
           t === "url"   || t === "tel"    || t === "password";
  }
  return false;
}

window.addEventListener("keydown", e => {
  // Settings panel is in key-capture mode — assign and short-circuit.
  if (UI._capturingKey) {
    e.preventDefault(); e.stopPropagation();
    if (e.code !== "Escape") {
      Settings.setBindingSource(UI._capturingKey.action, UI._capturingKey.slot, "key", e.code);
    }
    UI._capturingKey = null;
    UI.renderSettings();
    return;
  }
  const ae = document.activeElement;
  // Backspace deletes the preceding character in any editable field —
  // don't let it also fire SELECT (which backs out of the current screen).
  if (e.code === "Backspace" && isEditingTarget(ae)) return;
  // Space and arrow keys carry text-editing meaning inside text fields:
  // bypass the action layer and the global preventDefault below so the
  // browser handles them natively (cursor movement, typing a space).
  if (isTextInputTarget(ae) &&
      ["Space","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.code)) {
    return;
  }
  _keyDown[e.code] = true;
  if (["Space","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.code)) {
    // Let arrow keys / Space reach the native form element when the editor's
    // toolbar has focus, so selects, sliders, checkboxes and buttons behave
    // normally for controller / keyboard users navigating the bar.
    const inEditorForm = Editor.active && Editor.focus === "toolbar" &&
                         ae && ["INPUT","SELECT","TEXTAREA","BUTTON"].includes(ae.tagName);
    if (!inEditorForm) e.preventDefault();
  }
}, true);
window.addEventListener("keyup",   e => { _keyDown[e.code] = false; });

// Map gamepad button name -> array of keyboard codes that count as that button
export const KEY_FALLBACK = {
  DPAD_LEFT:  ["ArrowLeft", "KeyA"],
  DPAD_RIGHT: ["ArrowRight","KeyD"],
  DPAD_UP:    ["ArrowUp",   "KeyW"],
  DPAD_DOWN:  ["ArrowDown", "KeyS"],
  A:          ["Space"],
  B:          ["KeyZ"],
  X:          ["KeyX"],
  Y:          ["KeyH"],
  START:      ["KeyP", "Enter"],
  SELECT:     ["Escape", "Backspace"],
  L:          ["KeyQ"],
  R:          ["KeyE"]
};

// Pure-source helpers — used both by legacy isPressed/justPressed (for menu
// nav, which still talks button-names) and by the action layer (which talks
// pad+key per binding slot).
export function isPadPressed(name) {
  const gp = getGamepad();
  if (!gp) return false;
  const i = CONTROLLER_MAP[name];
  return i !== undefined && !!gp.buttons[i] && gp.buttons[i].pressed;
}
function isKeyPressed(code) {
  return code != null && !!_keyDown[code];
}

// Legacy: gamepad button + the built-in keyboard fallback table. Used by
// menu navigation where bindings are fixed by UI convention.
export function isPressed(name) {
  if (isPadPressed(name)) return true;
  const keys = KEY_FALLBACK[name] || [];
  for (const k of keys) if (_keyDown[k]) return true;
  return false;
}

export function justPressed(name) {
  const now = isPressed(name);
  const was = _padPrev[name] || false;
  _padPrev[name] = now;
  return now && !was;
}

// ---- Settings: action -> button bindings ---------------------
//
// Game actions are decoupled from physical buttons by an indirection layer.
// The Settings panel lets the user pick which button drives each action.
// Most actions have a single primary binding; thrust supports an optional
// secondary so it can live on two buttons at once.

export const ALL_BUTTONS = ["DPAD_LEFT", "DPAD_RIGHT", "DPAD_UP", "DPAD_DOWN",
                     "A", "B", "X", "Y", "L", "R", "START", "SELECT"];

// User-facing labels for each action. Order is the display order in the panel.
export const ACTION_LABELS = {
  aimUp:     "Aim up",
  aimDown:   "Aim down",
  aimLeft:   "Aim left",
  aimRight:  "Aim right",
  thrust:    "Thrust",
  boost:     "Boost",
  attract:   "Use Attract pickup",
  repel:     "Use Repel pickup",
  zoomOut:   "Zoom out",
  zoomIn:    "Zoom in",
  pause:     "Pause",
  back:      "Back to menu / designer"
};


function _slotPressed(slot) {
  if (!slot) return false;
  return (slot.pad && isPadPressed(slot.pad)) || (slot.key && isKeyPressed(slot.key));
}
export function actionPressed(action) {
  if (Touch.enabled) {
    if (action === "thrust" && Touch.thrustHeld) return true;
    if (Touch.buttons[action]) return true;
  }
  const b = Settings.binding(action);
  return _slotPressed(b.primary) || _slotPressed(b.secondary);
}
// Aggregate edge detection across all sources of an action.
const _actionPrev = {};
export function actionJustPressed(action) {
  const now = actionPressed(action);
  const was = _actionPrev[action] || false;
  _actionPrev[action] = now;
  return now && !was;
}

// Mark every currently-held input as already-seen in both edge-detector tables.
// Call after a state transition triggered by a held key (e.g. opening a modal
// with Esc) so the same held key can't fire a fresh just-pressed edge in the
// new state and immediately dismiss what just opened.
export function syncInputEdges() {
  for (const name of ALL_BUTTONS) _padPrev[name] = isPressed(name);
  const bindings = (Settings.active && Settings.active.bindings) || {};
  for (const action in bindings) _actionPrev[action] = actionPressed(action);
}


// Mouse — used by the editor only
export const mouse = { x: 0, y: 0, down: false, wasDown: false, button: 0, shift: false, ctrl: false };
canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.y = e.clientY - r.top;
  mouse.shift = e.shiftKey;
  mouse.ctrl  = e.ctrlKey || e.metaKey;
});
canvas.addEventListener("mousedown", e => {
  mouse.down = true; mouse.button = e.button;
  mouse.shift = e.shiftKey;
  mouse.ctrl  = e.ctrlKey || e.metaKey;
  // Prevent middle-click auto-scroll while in the editor.
  if (e.button === 1) e.preventDefault();
  // Shift + left-drag pans the editor camera (no conflict with the place
  // tool's left-click placement, which doesn't use shift). Skipped in
  // polygon-drafting mode where Shift is the angle-snap modifier, and
  // skipped during player aim mode where Shift locks the velocity vector
  // to a 45° step — letting pan win there would swallow the click that's
  // meant to commit the velocity.
  if (Editor.active && e.button === 0 && e.shiftKey) {
    const polyMode = Editor.tool === "shape" && Editor._shapeAddType === "polygon";
    // Shift + click *on a circle* in Select or Velocity tools is a
    // tool-specific gesture (multi-select / axis-snapped move, or a
    // shift-snapped velocity drag). Shift + click on empty space in
    // those tools still pans the camera.
    let onCircleSnapMode = false;
    if ((Editor.tool === "select" || Editor.tool === "velocity") && Editor.hoverWorld) {
      if (Editor._nearestCircle(Editor.hoverWorld)) onCircleSnapMode = true;
    }
    // Suppress shift-drag pan during modes that own Shift as a snap
    // modifier — polygon vertex placement, player aim, the move-to-line
    // preview, and the per-circle Select/Velocity gestures above.
    if (!polyMode && !onCircleSnapMode && !Editor._aimingPlayer && !Editor._lineMode) {
      Editor._panDrag = {
        startX: mouse.x, startY: mouse.y,
        startCamX: World.cameraX, startCamY: World.cameraY
      };
      e.preventDefault();
    }
  }
});
window.addEventListener("keydown", e => {
  if (e.key === "Shift") mouse.shift = true;
  if (e.key === "Control" || e.key === "Meta") mouse.ctrl = true;
});
window.addEventListener("keyup", e => {
  if (e.key === "Shift") mouse.shift = false;
  if (e.key === "Control" || e.key === "Meta") mouse.ctrl = false;
});
canvas.addEventListener("mouseup",   () => { mouse.down = false; });
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });


// ============================================================
//   PHYSICS — Circle entities
// ============================================================


// Smallest mote we ever spawn or keep alive. Below this, motes get absorbed
// outright instead of lingering as sub-pixel debris. Pure-fraction ejection
// can't drop below this either — too small a body simply can't propel.

// All non-mote, non-player kinds that can populate a level. Each has metadata
// for the editor (label, hue), AI behaviour, and rendering.
//   passive — affected by gravity, no will of its own
//   active  — runs an aiThink branch that can thrust
//   field   — exerts its own gravity-like force on every other circle
//
// Built-ins keep their hard-coded brain in aiThink; the data here is what the
// rest of the engine reads. KIND_META below is a merged view of these
// built-ins plus any user-authored kinds from Kinds._userKinds.
// Built-in kind definitions in data form. Movement / abilities are read by
// the same runtime that handles user kinds — there's a single rule
// evaluator and abilities ticker for all kinds. The legacy `behavior`,
// `hasMind`, and `fieldStrength` fields on the merged KIND_META are
// derived from movement.type at registry-build time. Anti-mote /
// pickups / mote-collection contact mechanics remain engine-baked
// (no rule-grammar equivalent yet) and the runtime keeps a small
// per-kind switch in _processPair for those.
//
// `_ACTIVE_THRUST` is defined at the top of js/kind-builtins.js
// (which loads before this script) so the spread inside that file's
// movement blocks resolves at parse time. The const is in the same
// shared script-scope, so referencing it here works at runtime.

// Merged registry view: rebuilt by Kinds._rebuildKindMeta() at startup, after
// any user-kind mutation, and when a level loads kinds with precedence. Every
// existing call site reads KIND_META[c.kind] and that keeps working.

// Read-only docs for built-in kinds: extra lore and a few representative
// test layouts the user can run from the kind library to learn what each
// built-in actually does. Lives alongside KIND_BUILTINS but kept separate
// so the runtime metadata stays small. Layouts use the same shape as user
// tests; sample-prefixed ids signal "not editable".
export const BUILTIN_INSPECTION = {
  hunter: {
    lore: "Picks the highest-scoring smaller circle by mass / dist² each tick and thrusts toward it. Greedy — no flee logic, so it'll cheerfully run into things bigger than it.",
    sampleTests: [{
      id: "sample-fat-vs-close",
      name: "Greed: chase fat over close",
      description: "Two prey: small-and-near vs. fat-and-far. Hunter's score formula favours mass, so it should commit to the fat one.",
      seed: 42, ghostPlayer: true,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1200, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 600, y:400, r:22, kind:"player",  hue:180, vx:0, vy:0 },
          { x: 400, y:400, r:18, kind:"hunter",  hue: 30, vx:0, vy:0 },
          { x: 250, y:400, r: 6, kind:"neutral", hue:220, vx:0, vy:0 },
          { x: 800, y:400, r:14, kind:"neutral", hue:220, vx:0, vy:0 }
        ]
      }
    }]
  },
  avoider: {
    lore: "Sums a danger vector from every nearby larger circle and thrusts away. Doesn't pursue prey — purely reactive.",
    sampleTests: [{
      id: "sample-avoider-flee",
      name: "Flee from approach",
      description: "Player drifts toward the avoider on its own. The avoider sums the danger vector from the larger player and accelerates away.",
      seed: 42, ghostPlayer: false,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1400, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 200, y:400, r:22, kind:"player",  hue:180, vx:60, vy:0 },
          { x: 700, y:400, r:18, kind:"avoider", hue:130, vx:0,  vy:0 }
        ]
      }
    }]
  },
  predator: {
    lore: "Two-stage brain: first checks for nearby larger threats and flees; otherwise picks the highest-utility prey by mass/dist² with a player-bonus multiplier once it's bigger than you. Commits hard.",
    sampleTests: [{
      id: "sample-predator-balance",
      name: "Hunt with self-preservation",
      description: "Predator (medium) sees a smaller player and a much-larger threat closing in from the right. Watch it chase the player, then break and flee as the threat gets close.",
      seed: 42, ghostPlayer: false,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1600, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 800, y:400, r:14, kind:"player",   hue:180, vx:0,   vy:0 },
          { x: 400, y:400, r:22, kind:"predator", hue:350, vx:0,   vy:0 },
          { x:1300, y:400, r:44, kind:"neutral",  hue:220, vx:-80, vy:0 }
        ]
      }
    }]
  },
  pup: {
    lore: "Predator pup — like Predator but inverts the prey scoring: prefers the smallest eatable circle. Safer growth, less reckless.",
    sampleTests: [{
      id: "sample-pup-smallest",
      name: "Pick the smallest",
      description: "Pup with three prey of different sizes. It should head for the tiniest, not the closest.",
      seed: 42, ghostPlayer: true,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1200, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 600, y:400, r:22, kind:"player", hue:180, vx:0, vy:0 },
          { x: 500, y:400, r:18, kind:"pup",    hue:340, vx:0, vy:0 },
          { x: 300, y:200, r: 4, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 800, y:200, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 500, y:650, r:12, kind:"neutral",hue:220, vx:0, vy:0 }
        ]
      }
    }]
  },
  glutton: {
    lore: "Doesn't move on its own. Anything smaller than itself within ~2.6× its radius gets passively drained, mass transferring continuously. Slow but inexorable.",
    sampleTests: [{
      id: "sample-glutton-drain",
      name: "Field of slow drain",
      description: "Glutton sitting still with prey scattered around its reach. Mass should bleed across.",
      seed: 42, ghostPlayer: true,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1200, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 600, y:400, r:22, kind:"player", hue:180, vx:0, vy:0 },
          { x: 600, y:540, r:30, kind:"glutton",hue: 35, vx:0, vy:0 },
          { x: 540, y:540, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 660, y:540, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 600, y:480, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 600, y:600, r: 8, kind:"neutral",hue:220, vx:0, vy:0 }
        ]
      }
    }]
  },
  pulsar: {
    lore: "Every 2.5–3.5 seconds emits an outward velocity impulse to everything within ~280px. Range and strength are fixed in the engine; user kinds can replicate this with a Pulse ability.",
    sampleTests: [{
      id: "sample-pulsar-burst",
      name: "Periodic shockwaves",
      description: "Pulsar surrounded by light circles. Watch them get kicked outward each pulse, with a falloff toward the edges of the range.",
      seed: 42, ghostPlayer: true,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1200, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 600, y:400, r:22, kind:"player", hue:180, vx:0, vy:0 },
          { x: 600, y:540, r:14, kind:"pulsar", hue: 50, vx:0, vy:0 },
          { x: 460, y:540, r: 6, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 740, y:540, r: 6, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 600, y:420, r: 6, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 600, y:660, r: 6, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 520, y:470, r: 6, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 680, y:610, r: 6, kind:"neutral",hue:220, vx:0, vy:0 }
        ]
      }
    }]
  },
  splitter: {
    lore: "Sits passively. When something larger touches it, it bursts into 4–6 children that share its mass; the toucher gains nothing — just the smaller children scatter.",
    sampleTests: [{
      id: "sample-splitter-burst",
      name: "Burst on contact",
      description: "Player (large) drifts into the Splitter on its own. The Splitter bursts; the player gains nothing and the children scatter.",
      seed: 42, ghostPlayer: false,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1200, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 300, y:400, r:30, kind:"player",  hue:180, vx:80, vy:0 },
          { x: 700, y:400, r:22, kind:"splitter",hue: 60, vx:0,  vy:0 }
        ]
      }
    }]
  },
  anti: {
    lore: "On contact with anything except another anti-mote, both lose mass equal to the smaller circle's full mass. Equal masses → both vanish. Two anti-motes touching follow normal absorption rules. Use as a hazard or trap.",
    sampleTests: [{
      id: "sample-anti-annihilate",
      name: "Annihilation on contact",
      description: "The (larger) player drifts into the central anti-mote on its own — both lose mass equal to the smaller's full mass, so the anti-mote vanishes and the player shrinks by ~mass(anti-mote). Two satellite anti-motes lie in the player's continuing path; tap thrust if you want propellant motes to get annihilated too.",
      seed: 42, ghostPlayer: false,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1200, h:800 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 250, y:400, r:26, kind:"player",  hue:180, vx:80, vy:0 },
          { x: 700, y:400, r:18, kind:"anti",    hue:290, vx:0,  vy:0 },
          { x: 950, y:300, r:12, kind:"anti",    hue:290, vx:0,  vy:0 },
          { x: 950, y:500, r:12, kind:"anti",    hue:290, vx:0,  vy:0 },
          { x: 500, y:200, r: 6, kind:"neutral", hue:220, vx:0,  vy:0 },
          { x: 500, y:600, r: 6, kind:"neutral", hue:220, vx:0,  vy:0 }
        ]
      }
    }]
  },
  repeller: {
    lore: "Inverse magnet — carries a −300k field that pushes every nearby circle gently away. Stationary unless moved by other forces. Useful as a passive 'no-go zone'.",
    sampleTests: [{
      id: "sample-repeller-push",
      name: "Push everything away",
      description: "Repeller surrounded by bystanders — they should drift outward, accelerating as they approach the centre and easing off as they escape the field.",
      seed: 42, ghostPlayer: true,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1400, h:900 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 700, y:450, r:22, kind:"player",  hue:180, vx:0, vy:0 },
          { x: 700, y:600, r:14, kind:"repeller",hue:280, vx:0, vy:0 },
          { x: 500, y:600, r: 8, kind:"neutral", hue:220, vx:0, vy:0 },
          { x: 900, y:600, r: 8, kind:"neutral", hue:220, vx:0, vy:0 },
          { x: 700, y:400, r: 8, kind:"neutral", hue:220, vx:0, vy:0 },
          { x: 700, y:780, r: 8, kind:"neutral", hue:220, vx:0, vy:0 },
          { x: 550, y:730, r: 8, kind:"neutral", hue:220, vx:0, vy:0 },
          { x: 850, y:730, r: 8, kind:"neutral", hue:220, vx:0, vy:0 }
        ]
      }
    }]
  },
  singchild: {
    lore: "Small body, large personal gravity well (+900k strength) that travels with it. Slings circles around it like a comet — set up tangential velocities and you get stable orbits, set up radial ones and you get slingshots.",
    sampleTests: [{
      id: "sample-singchild-orbits",
      name: "Slingshot and orbit",
      description: "A stationary Singularity child with four bystanders pre-seeded with tangential velocities for circular orbits at r ≈ 200. Watch them swing around — orbits decay slightly because of the inelastic interactions.",
      seed: 42, ghostPlayer: true,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1600, h:1000 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 800, y:500, r:22, kind:"player",   hue:180, vx:0, vy:0 },
          { x: 800, y:650, r:10, kind:"singchild",hue:270, vx:0, vy:0 },
          // Four orbiters at r≈200 around the singchild, tangential v≈67.
          // All four go visually clockwise — same convention the editor's
          // Orbit-selection uses (tangent = (-ry, rx)/|r|, where r is the
          // vector from well to orbiter). Picking the same direction for
          // every orbiter is what keeps them from intersecting.
          { x: 600, y:650, r: 6, kind:"neutral", hue:220, vx:0,   vy:-67 },  //  9 o'clock → up
          { x:1000, y:650, r: 6, kind:"neutral", hue:220, vx:0,   vy: 67 },  //  3 o'clock → down
          { x: 800, y:450, r: 6, kind:"neutral", hue:220, vx:67,  vy:0   },  // 12 o'clock → right
          { x: 800, y:850, r: 6, kind:"neutral", hue:220, vx:-67, vy:0   }   //  6 o'clock → left
        ]
      }
    }]
  },
  attractPickup: {
    lore: "Touch to collect (FIFO inventory, max 9). Press the Use Attract button (X by default) to fire a brief inward radial impulse around the player — pulls everything within ~360px toward you for one frame.",
    sampleTests: [{
      id: "sample-attract-collect",
      name: "Collect and pull",
      description: "Player drifts into the pickup automatically. Press X (gamepad) / X (keyboard) — or tap the Attract touch button — to fire. Bystanders within ~360px get pulled inward. Three pickups in a row let you fire repeatedly.",
      seed: 42, ghostPlayer: false,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1400, h:900 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 200, y:450, r:22, kind:"player",        hue:180, vx:80, vy:0 },
          { x: 500, y:450, r: 8, kind:"attractPickup", hue:200, vx:0,  vy:0 },
          { x: 700, y:450, r: 8, kind:"attractPickup", hue:200, vx:0,  vy:0 },
          { x: 900, y:450, r: 8, kind:"attractPickup", hue:200, vx:0,  vy:0 },
          { x: 600, y:200, r: 6, kind:"neutral",       hue:220, vx:0,  vy:0 },
          { x: 850, y:680, r: 6, kind:"neutral",       hue:220, vx:0,  vy:0 },
          { x:1100, y:300, r: 6, kind:"neutral",       hue:220, vx:0,  vy:0 },
          { x:1100, y:600, r: 6, kind:"neutral",       hue:220, vx:0,  vy:0 }
        ]
      }
    }]
  },
  repelPickup: {
    lore: "Touch to collect (FIFO inventory, max 9). Press the Use Repel button (C by default) to fire a brief outward radial impulse around the player — pushes everything within ~360px away for one frame.",
    sampleTests: [{
      id: "sample-repel-collect",
      name: "Collect and push",
      description: "Player drifts into the pickup. Press C (or the Repel touch button) to fire — bystanders within ~360px get pushed outward. Useful for clearing a crowded space.",
      seed: 42, ghostPlayer: false,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1400, h:900 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 200, y:450, r:22, kind:"player",      hue:180, vx:80, vy:0 },
          { x: 500, y:450, r: 8, kind:"repelPickup", hue:  0, vx:0,  vy:0 },
          { x: 700, y:450, r: 8, kind:"repelPickup", hue:  0, vx:0,  vy:0 },
          { x: 900, y:450, r: 8, kind:"repelPickup", hue:  0, vx:0,  vy:0 },
          { x: 600, y:380, r: 6, kind:"neutral",     hue:220, vx:0,  vy:0 },
          { x: 600, y:520, r: 6, kind:"neutral",     hue:220, vx:0,  vy:0 },
          { x: 800, y:380, r: 6, kind:"neutral",     hue:220, vx:0,  vy:0 },
          { x: 800, y:520, r: 6, kind:"neutral",     hue:220, vx:0,  vy:0 },
          { x:1000, y:380, r: 6, kind:"neutral",     hue:220, vx:0,  vy:0 },
          { x:1000, y:520, r: 6, kind:"neutral",     hue:220, vx:0,  vy:0 }
        ]
      }
    }]
  },
  magnet: {
    lore: "Carries a small gravity well around itself (+220k strength). Pulls everything inward — including you, including motes. Stationary unless moved by other forces.",
    sampleTests: [{
      id: "sample-magnet-pull",
      name: "Carry a gravity well",
      description: "Magnet at centre with bystander circles dropped in around it. Watch them get reeled in.",
      seed: 42, ghostPlayer: true,
      layout: {
        type: "sparse", bounds: { x:0, y:0, w:1400, h:900 },
        gravityCenters: [], randomVelocity: false,
        victoryCondition: "absorb_all", victoryParam: 60, kinds: [],
        circles: [
          { x: 700, y:450, r:22, kind:"player", hue:180, vx:0, vy:0 },
          { x: 700, y:600, r:14, kind:"magnet", hue:200, vx:0, vy:0 },
          { x: 300, y:600, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x:1100, y:600, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 700, y:250, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 700, y:820, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 450, y:780, r: 8, kind:"neutral",hue:220, vx:0, vy:0 },
          { x: 950, y:780, r: 8, kind:"neutral",hue:220, vx:0, vy:0 }
        ]
      }
    }]
  }
};


// Descriptions for the editor-only dropdown options that aren't kinds.
export const EDITOR_KIND_DESC = {
  player: "You. Place exactly one — extra placements move the existing player.",
  well:   "Static gravity well. Place size slider sets its strength.",
  __kut__: "Placeholder for whatever kind the editor's ▶ Quick preview launches with. Save your design as \"Quick Preview\" to use it as the preview layout."
};

// Rough AI-cost estimate for a kind. Used as the basis for a low/med/high
// performance hint in the kind library and editor — see §8.11 of the doc.
// Heuristic: each active rule sweeps every circle; a specific kind filter
// or a "within Npx" distance cull reduces effective work; passive kinds
// cost 0; the built-in hunt/flee presets each cost ~1 sweep.
export function kindAICost(k) {
  if (!k) return 0;
  let cost = 0;
  // Abilities: pulse + split + drain-field scan all circles when they
  // fire. Bill the amortised per-tick cost — every-trigger divides by
  // its interval, continuous fires every tick (cost 1.0 per scan),
  // event-triggers (on-death, on-absorb) are mostly idle.
  for (const ab of (k.abilities || [])) {
    if (!ab || ab.enabled === false) continue;
    const trig = ab.trigger || {};
    const eff = ab.effect || {};
    const perFire =
      eff.type === "pulse"          ? 1.0 :
      eff.type === "split"          ? 1.0 :
      eff.type === "drain-field"    ? 1.0 :
      eff.type === "convert-target" ? 1.0 :
      eff.type === "spawn-child"    ? 0.1 :
      eff.type === "dash"           ? 0.05 :
      eff.type === "shield"         ? 0.02 :
      eff.type === "camo"           ? 0.02 :
      eff.type === "freeze-self"    ? 0.02 :
      eff.type === "play-sound"     ? 0.01 :
      eff.type === "emit-mote"      ? 0.05 : 0.1;
    if (trig.type === "continuous") {
      cost += perFire;     // every tick — full cost
    } else if (trig.type === "on-death" || trig.type === "on-absorb" ||
               trig.type === "on-touched-by-bigger" ||
               trig.type === "on-growth-cross" ||
               trig.type === "on-hit-by-anti" ||
               trig.type === "on-near-edge") {
      cost += 0.1;         // mostly idle — flat low cost
    } else {
      const interval = Math.max(0.1, trig.interval || 1);
      cost += perFire / interval;
    }
  }
  if (!k.movement || k.movement.type !== "active") return cost;
  const preset = (k.movement.active && k.movement.active.preset) || "drift";
  if (preset === "drift") return cost;
  if (preset === "hunt" || preset === "flee") return cost + 1.0;
  if (preset !== "custom") return cost;
  const rules = (k.movement.active && k.movement.active.rules) || [];
  for (const r of rules) {
    if (r.enabled === false) continue;
    const filter = (r.who && r.who.filter) || {};
    const action = (r.what && r.what.type) || "stand-ground";
    if (action === "stand-ground") { cost += 0.05; continue; }   // no scan
    let c = 1.0;
    const fk = filter.kind;
    if (fk && fk !== "any" && fk !== "mind" && fk !== "non-mind") c *= 0.3;
    if (filter.distance === "within") c *= 0.6;
    cost += c;
  }
  return cost;
}
export function kindAICostBucket(cost) {
  if (cost <= 0)   return { label: "none", hue: 200 };
  if (cost <  1.5) return { label: "low",  hue: 130 };
  if (cost <  3.5) return { label: "med",  hue: 50 };
  return                  { label: "high", hue: 10 };
}

// Quick-add rule presets shown as one-click buttons in the rule editor.
// Each entry is shape-equivalent to a rule the evaluator runs natively.
// Mirrors §8.2 of the design doc — "Rule library / preset chips".
export const RULE_LIBRARY = [
  { name: "Hunt smaller (Hunter-style)", rule: {
    priority: 10, when: { type: "always" },
    who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "score-hunter" },
    what: { type: "approach" }
  }},
  { name: "Flee bigger nearby", rule: {
    priority: 50, when: { type: "always" },
    who: { filter: { kind: "any", mass: "larger", distance: "within", distanceValue: 280 }, pick: "score-danger" },
    what: { type: "flee" }
  }},
  { name: "Chase player", rule: {
    priority: 30, when: { type: "always" },
    who: { filter: { kind: "player", mass: "any", distance: "any" }, pick: "closest" },
    what: { type: "approach" }
  }},
  { name: "Eat motes nearby", rule: {
    priority: 5, when: { type: "always" },
    who: { filter: { kind: "mote", mass: "any", distance: "within", distanceValue: 300 }, pick: "closest" },
    what: { type: "approach" }
  }},
  { name: "Avoid the player", rule: {
    priority: 40, when: { type: "always" },
    who: { filter: { kind: "player", mass: "any", distance: "within", distanceValue: 250 }, pick: "closest" },
    what: { type: "flee" }
  }},
  { name: "Intercept smallest prey", rule: {
    priority: 15, when: { type: "always" },
    who: { filter: { kind: "any", mass: "smaller", distance: "any" }, pick: "smallest" },
    what: { type: "intercept", lookahead: 0.5 }
  }},
  { name: "Orbit nearest mind", rule: {
    priority: 8, when: { type: "always" },
    who: { filter: { kind: "mind", mass: "any", distance: "any" }, pick: "closest" },
    what: { type: "orbit", orbitRadius: 200 }
  }},
  { name: "Stand ground", rule: {
    priority: 1, when: { type: "always" },
    who: { filter: { kind: "any" }, pick: "closest" },
    what: { type: "stand-ground" }
  }},
  { name: "Hunt minds only (smaller)", rule: {
    priority: 15, when: { type: "always" },
    who: { filter: { kind: "mind", mass: "smaller", distance: "any" }, pick: "score-hunter" },
    what: { type: "approach" }
  }},
  { name: "Avoid only the player", rule: {
    priority: 60, when: { type: "always" },
    who: { filter: { kind: "player", mass: "any", distance: "within", distanceValue: 300 }, pick: "closest" },
    what: { type: "flee" }
  }},
  { name: "Trail the largest threat", rule: {
    priority: 25, when: { type: "always" },
    who: { filter: { kind: "any", mass: "larger", distance: "any" }, pick: "largest" },
    what: { type: "intercept", lookahead: 0.6 }
  }},
  { name: "Orbit the player", rule: {
    priority: 12, when: { type: "always" },
    who: { filter: { kind: "player", mass: "any", distance: "any" }, pick: "closest" },
    what: { type: "orbit", orbitRadius: 220 }
  }}
];

// Quick-add ability presets shown as one-click buttons in the abilities
// editor. Mirrors the pattern of RULE_LIBRARY. Each entry is shape-
// equivalent to an ability the runtime evaluates natively.
export const ABILITY_LIBRARY = [
  { name: "Pulse every 3s (Pulsar-style)", ability: {
    enabled: true,
    trigger: { type: "every", interval: 3.0, jitter: 0.5 },
    effect:  { type: "pulse", range: 280, strength: 240 }
  }},
  { name: "Big pulse every 8s", ability: {
    enabled: true,
    trigger: { type: "every", interval: 8.0, jitter: 1.0 },
    effect:  { type: "pulse", range: 480, strength: 360 }
  }},
  { name: "Emit a mote every 2s", ability: {
    enabled: true,
    trigger: { type: "every", interval: 2.0, jitter: 0.3 },
    effect:  { type: "emit-mote", massFraction: 0.005, speed: 250 }
  }},
  { name: "Split into 4 every 6s (mass-gated)", ability: {
    enabled: true,
    trigger: { type: "every", interval: 6.0, jitter: 0.5 },
    // Without conditions, periodic split runs away exponentially. Defaults
    // gate by self.mass (each child below threshold won't split until it
    // grows back) and a hard kindCount ceiling as a population safety net.
    conditions: [
      { type: "selfMassGt",  value: 200 },
      { type: "kindCountLt", value: 30  }
    ],
    effect: { type: "split", count: 4 }
  }},
  { name: "Drain like Glutton", ability: {
    enabled: true,
    trigger: { type: "continuous" },
    effect: { type: "drain-field", reachMul: 2.6, rate: 40 }
  }},
  { name: "Burst on death — 5 neutral husks", ability: {
    enabled: true,
    trigger: { type: "on-death" },
    // Spawn neutrals (inert) by default so the preset doesn't cascade
    // when applied to self-spawning kinds. Switch the child kind to
    // "Same as self" only when paired with a kindCountLt condition.
    effect: { type: "spawn-child", kind: "neutral", count: 5, radius: 6, speed: 90 }
  }},
  { name: "Cascading splitter — self, capped at 25", ability: {
    enabled: true,
    trigger: { type: "on-death" },
    // Self-spawning on death is a runaway pattern without a condition.
    // kindCountLt caps the population so the cascade settles instead of
    // doubling every generation. Adjust the cap up for chaos, down for
    // a brief flurry. selfMassGt is NOT useful here — on-death fires
    // after absorption has zeroed the parent's mass.
    conditions: [{ type: "kindCountLt", value: 25 }],
    effect: { type: "spawn-child", kind: "self", count: 3, radius: 6, speed: 90 }
  }},
  { name: "Splitter — burst on touch by bigger (mass conserved)", ability: {
    enabled: true,
    // on-touched-by-bigger fires INSIDE _processPair before absorption
    // physics. Pairing with `split` divides this kind's full mass into
    // children — toucher gains nothing. Replicates the built-in Splitter.
    trigger: { type: "on-touched-by-bigger" },
    effect: { type: "split", count: 5 }
  }},
  { name: "Brood mother — 3 hunters on death", ability: {
    enabled: true,
    trigger: { type: "on-death" },
    effect: { type: "spawn-child", kind: "hunter", count: 3, radius: 12, speed: 100 }
  }},
  { name: "Pulse on absorb — celebration", ability: {
    enabled: true,
    trigger: { type: "on-absorb" },
    effect: { type: "pulse", range: 200, strength: 150 }
  }},
  { name: "Evolve at mass 300 — spawn 3 hunters", ability: {
    enabled: true,
    // Lifecycle moment: when this kind grows past 300 mass, fire once
    // and morph into a small swarm of hunters. Resets if the kind
    // shrinks back below the threshold.
    trigger: { type: "on-growth-cross", threshold: 300 },
    effect: { type: "spawn-child", kind: "hunter", count: 3, radius: 14, speed: 120 }
  }},
  { name: "Erratic dash every 4s", ability: {
    enabled: true,
    trigger: { type: "every", interval: 4.0, jitter: 1.0 },
    effect: { type: "dash", speed: 350, direction: "random" }
  }},
  { name: "Panic dash on touch by bigger", ability: {
    enabled: true,
    // Dash in a random direction when something larger touches us. Doesn't
    // kill self, so absorption still proceeds — but the dash kicks us
    // off so the bigger has to chase.
    trigger: { type: "on-touched-by-bigger" },
    effect: { type: "dash", speed: 600, direction: "random" }
  }},
  { name: "Bounce off the edge — dash inward", ability: {
    enabled: true,
    // Fires once when within 80px of the world boundary; re-arms when
    // the kind drifts back into open space. away-from-edge points the
    // dash at the bounds centre side; maxSpeed caps the velocity so
    // repeated wall-grazes can't accumulate to runaway speed.
    trigger: { type: "on-near-edge", distance: 80 },
    effect: { type: "dash", speed: 300, direction: "away-from-edge", maxSpeed: 450 }
  }},
  { name: "Anti-mote ward — shield for 3s", ability: {
    enabled: true,
    // Hit by an anti-mote → instant shield, blocking further annihilation.
    trigger: { type: "on-hit-by-anti" },
    effect: { type: "shield", duration: 3 }
  }},
  { name: "Camo on touched by bigger", ability: {
    enabled: true,
    // Touched by a larger circle → vanish from AI vision for 4s.
    // Absorption still happens this tick, but the kind escapes notice
    // afterwards (useful in conjunction with panic-dash).
    trigger: { type: "on-touched-by-bigger" },
    effect: { type: "camo", duration: 4 }
  }},
  { name: "Stop and feast — freeze 2s on absorb", ability: {
    enabled: true,
    // Eat something → stand still for 2s. The predator pauses to digest
    // its kill before resuming the chase. Pairs naturally with Hunt /
    // Predator presets for kinds that don't behave like bullet trains.
    trigger: { type: "on-absorb" },
    effect: { type: "freeze-self", duration: 2 }
  }},
  { name: "Convert nearby smaller every 6s", ability: {
    enabled: true,
    // Powerful — gate with a kindCountLt cap if used aggressively.
    trigger: { type: "every", interval: 6.0, jitter: 0.5 },
    conditions: [{ type: "kindCountLt", value: 30 }],
    effect: { type: "convert-target", range: 220, count: 1, massFilter: "smaller" }
  }},
  { name: "Periodic shield — 1s every 5s", ability: {
    enabled: true,
    // Defensive heartbeat: every 5s the kind tanks for 1s, then is
    // vulnerable for 4s. Telegraphs an opening for the player.
    trigger: { type: "every", interval: 5.0, jitter: 0.3 },
    effect: { type: "shield", duration: 1 }
  }},
  { name: "Periodic camo — 2s every 8s", ability: {
    enabled: true,
    trigger: { type: "every", interval: 8.0, jitter: 0.5 },
    effect: { type: "camo", duration: 2 }
  }},
  { name: "Retaliate — pulse on touched by bigger", ability: {
    enabled: true,
    trigger: { type: "on-touched-by-bigger" },
    effect: { type: "pulse", range: 240, strength: 280 }
  }},
  { name: "Drop a pickup on death — attract", ability: {
    enabled: true,
    // Spawns an Attract pickup when killed. Reward kind for prey, hazard
    // for hunter (it'll come back to you).
    trigger: { type: "on-death" },
    effect: { type: "spawn-child", kind: "attractPickup", count: 1, radius: 8, speed: 0 }
  }},
  { name: "Big pulse when crossing 250 mass", ability: {
    enabled: true,
    // Lifecycle moment: passive grower fires one big shockwave when it
    // first crosses 250 mass. Re-arms if it shrinks back below.
    trigger: { type: "on-growth-cross", threshold: 250 },
    effect: { type: "pulse", range: 420, strength: 360 }
  }},
  { name: "Edge bounce — dash inward", ability: {
    enabled: true,
    trigger: { type: "on-near-edge", distance: 100 },
    effect: { type: "dash", speed: 320, direction: "away-from-edge", maxSpeed: 480 }
  }},
  { name: "Anti-mote phase shift — camo on hit", ability: {
    enabled: true,
    // Hit by an anti-mote → 3s of camo. Pairs well with a low-mass kind
    // that wants to get out of trouble after taking annihilation damage.
    trigger: { type: "on-hit-by-anti" },
    effect: { type: "camo", duration: 3 }
  }},
  { name: "Chirp on absorb", ability: {
    enabled: true,
    trigger: { type: "on-absorb" },
    effect: { type: "play-sound", preset: "chirp", intensity: 1 }
  }},
  { name: "Death thump", ability: {
    enabled: true,
    trigger: { type: "on-death" },
    effect: { type: "play-sound", preset: "thump", intensity: 1.2 }
  }},
  { name: "Heartbeat — drone every 4s", ability: {
    enabled: true,
    trigger: { type: "every", interval: 4.0, jitter: 0.3 },
    effect: { type: "play-sound", preset: "drone", intensity: 0.6 }
  }},
  { name: "Ding when crossing 200 mass", ability: {
    enabled: true,
    trigger: { type: "on-growth-cross", threshold: 200 },
    effect: { type: "play-sound", preset: "ding", intensity: 1.4 }
  }}
];


// ============================================================
//   SHAPE — playable-area composition (rect + circle, +/-)
// ============================================================
//
// A level shape is an ordered list of primitives:
//   { type: "rect",   cx, cy, w, h, sign: "+"|"-" }
//   { type: "circle", cx, cy, r,    sign: "+"|"-" }
//
// A point is inside the playable area iff it is inside at least one
// "+" primitive AND inside zero "-" primitives. Order is irrelevant
// for the predicate (it is a set operation), but matters for editor
// rendering / selection.
//
// Boundary queries (`nearestBoundary`, `containsCircle`) work on a
// precomputed sample of the union boundary (one point every
// `SAMPLE_SPACING` px). Samples are cached in a WeakMap keyed by the
// shape array; mutate the shape and call `Shape.invalidate(shape)` to
// recompute. The sampling resolution caps the worst-case error in
// reported distance at ~SAMPLE_SPACING / 2 px.
//
// Known v1 limitations:
//   - Acute reentrant corners (two "+" primitives meeting at a
//     sharp angle) can feel sharp on a fast frame; revisit if it
//     bites in practice.
//   - Bounce normals at rectangle corners are axis-aligned (the
//     sample on the nearer edge wins), giving a pinball-like effect
//     identical to the legacy 4-wall behaviour.

export const _shapeSampleCache = new WeakMap();


// ============================================================
//   WORLD — level + simulation
// ============================================================







export const Campaign = {
  storageKey: "lumenphage.campaign.v1",

  // The level roster lives in `LevelStore.campaign`, populated from
  // `levels/campaign/manifest.json` at boot. Exposed as a getter so
  // existing call sites (`Campaign.levels`, `Campaign.byId`, etc.)
  // keep working unchanged. The inline imperative `build()` bodies
  // that used to live here have moved to per-level JSON files; see
  // `LevelStore.apply()` for the dispatch.
  get levels() { return LevelStore.campaign; },

  // Keep the original inline definitions out of the bundle — they
  // were ~600 LOC and are now sourced from disk. Code below this
  // point (persistence, byId, stages) is unchanged.

  // ----- Persistence ---------------------------------------------------
  // Routed through `Persist` so storage failures (quota, private-mode)
  // log a single warning instead of being silently swallowed by ad-hoc
  // try/catch blocks.
  loadProgress() { return Persist.read(this.storageKey, { completed: [] }); },
  saveProgress(p) { Persist.write(this.storageKey, p); },
  isCompleted(id) { return this.loadProgress().completed.includes(id); },
  markCompleted(id) {
    const p = this.loadProgress();
    if (!p.completed.includes(id)) p.completed.push(id);
    this.saveProgress(p);
  },
  isUnlocked(id) {
    if (this.devModeEnabled()) return true;
    if (id === 1) return true;
    const completed = this.loadProgress().completed;
    return this.levels.some(l => l.branches.includes(id) && completed.includes(l.id));
  },
  devModeEnabled() {
    return Persist.read("lumenphage.devMode", "false", { raw: true }) === "true";
  },
  setDevMode(on) {
    Persist.write("lumenphage.devMode", on ? "true" : "false", { raw: true });
  },
  resetProgress() { this.saveProgress({ completed: [] }); },
  byId(id) { return this.levels.find(l => l.id === id); },
  stages() {
    const order = [];
    for (const l of this.levels) if (!order.includes(l.stage)) order.push(l.stage);
    return order;
  }
};



// ============================================================
//   DEBUG — dev-mode toggles for inspecting the game
// ============================================================
//
// The values live in localStorage so they persist across reloads. Menu only
// shown when Campaign.devModeEnabled() is true.

// Ghost-player check that combines the dev-mode debug toggle with the
// per-test "ghost player" option. Game-loop sites (AI vision, contact,
// field forces, render alpha) read this; the debug menu's checkbox still
// reads Debug.get("ghostMode") so its checked state reflects the stored
// dev-mode flag, not the per-test override.
export function isPlayerGhost() {
  return (Game.observation && Game.observation.ghostPlayer === true) ||
         Debug.get("ghostMode");
}






export function hueColor(h, s, l, a) {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

// Map a neutral circle's hue to its mass relative to the player's:
//   blue  (220) → smaller than the player → safe to absorb
//   purple(290) → roughly equal — standoff
//   red   (360) → bigger than the player → will absorb you
// Clamped at 2× / 0.5× ratios so far-extreme sizes saturate.
function relativeHue(c) {
  const p = World.player;
  if (!p || !p.alive) return c.hue;
  const t = Math.max(-1, Math.min(1, Math.log2(c.mass / p.mass)));
  return 220 + (t + 1) * 70;
}

function drawBackground() {
  // Flat fill — radial gradient on the whole canvas every frame is too costly.
  // Outside color defaults to the historical dark; level designs may override.
  ctx.fillStyle = World.outsideColor || "#040a14";
  ctx.fillRect(0, 0, W, H);

  // Drifting bioluminescent plankton — only at idle / menu states so the
  // gameplay frame stays cheap. ~40 small additive points, twinkling.
  const idle = Game.state !== "playing" && Game.state !== "paused" &&
               Game.state !== "designer";
  if (idle) {
    const t = performance.now() * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 40; i++) {
      const seedX = (i * 73.13) % 1;
      const seedY = (i * 191.7) % 1;
      const x = ((seedX * (W + 200) + t * (8 + seedX * 14)) % (W + 80)) - 40;
      const y = (seedY * H + Math.sin(t * 0.4 + i) * 28 + H) % H;
      const a = 0.05 + 0.07 * Math.sin(t * 0.6 + i);
      ctx.fillStyle = `rgba(140, 200, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Paint the playable-area interior. Each primitive is filled in array
// order, matching Shape.isInside's painter's-algorithm CSG: "+" stamps
// `insideColor`, "−" stamps `outsideColor` (re-exposing the backdrop
// inside a carve). Cheap and order-faithful; no Path2D union needed.
function drawPlayableFill() {
  const shape = World.activeShape();
  if (!shape || !shape.length) return;
  const inside  = World.insideColor  || "#0a1828";
  const outside = World.outsideColor || "#040a14";
  const s = World.cameraScale;
  ctx.save();
  for (const p of shape) {
    ctx.fillStyle = (p.sign === "+") ? inside : outside;
    if (p.type === "rect") {
      const tl = View.worldToScreen(p.cx - p.w / 2, p.cy - p.h / 2);
      ctx.fillRect(tl.x, tl.y, p.w * s, p.h * s);
    } else if (p.type === "circle") {
      const c = View.worldToScreen(p.cx, p.cy);
      ctx.beginPath();
      ctx.arc(c.x, c.y, p.r * s, 0, TAU);
      ctx.fill();
    } else if (p.type === "polygon") {
      const pts = p.points;
      if (!pts || pts.length < 3) continue;
      ctx.beginPath();
      const s0 = View.worldToScreen(pts[0].x, pts[0].y);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < pts.length; i++) {
        const sp = View.worldToScreen(pts[i].x, pts[i].y);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBoundsAndGravity() {
  // Outline the playable area as a single uniform stroke covering only
  // the union boundary — internal seams between "+" primitives are
  // suppressed, and "-" carve outlines are clipped to the part that
  // actually borders playable space. The unplayable region inside any
  // carve is left unfilled so it reads identically to the outside.
  const shape = World.activeShape();
  ctx.save();
  ctx.strokeStyle = World.edgeColor || "#8cdcff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const seg of Shape.visibleSegments(shape)) {
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
  ctx.restore();

  // Each gravity well: two static rings whose radii scale with strength
  for (const w of World.gravityCenters) {
    const gc = View.worldToScreen(w.x, w.y);
    const ringScale = Math.cbrt(w.strength / 2_000_000);  // 1.0 at 2M strength
    ctx.strokeStyle = "rgba(255,180,80,0.18)";
    ctx.beginPath(); ctx.arc(gc.x, gc.y, 60 * ringScale * World.cameraScale, 0, TAU); ctx.stroke();
    ctx.strokeStyle = "rgba(255,180,80,0.10)";
    ctx.beginPath(); ctx.arc(gc.x, gc.y, 140 * ringScale * World.cameraScale, 0, TAU); ctx.stroke();
  }
}

function drawCircle(c) {
  const p = View.worldToScreen(c.x, c.y);
  const r = c.r * World.cameraScale;
  if (r < 0.5) return;
  if (p.x + r < -20 || p.x - r > W + 20 || p.y + r < -20 || p.y - r > H + 20) return;

  // Ghost mode: render the player at low alpha so it's visually clear they're
  // intangible. Done via globalAlpha — leaves the gradients and stroke colors
  // untouched, just composites them dimmer.
  const ghostPlayer = c === World.player && isPlayerGhost();
  const camod = World._isCamouflaged(c);
  const savedAlpha = ctx.globalAlpha;
  if (ghostPlayer || camod) ctx.globalAlpha = 0.35;

  let lum = 55, sat = 75;
  if (c === World.player) { lum = 65; sat = 85; }
  if (c.kind === "hunter")    { sat = 85; lum = 50; }
  if (c.kind === "avoider")   { sat = 65; lum = 60; }
  if (c.kind === "predator")  { sat = 95; lum = 45; }
  if (c.kind === "pup")       { sat = 80; lum = 55; }
  if (c.kind === "anti")      { sat = 80; lum = 30; }
  if (c.kind === "splitter")  { sat = 95; lum = 60; }
  if (c.kind === "magnet")    { sat = 90; lum = 55; }
  if (c.kind === "repeller")  { sat = 90; lum = 55; }
  if (c.kind === "glutton")   { sat = 70; lum = 45; }
  if (c.kind === "pulsar")    { sat = 95; lum = 60; }
  if (c.kind === "singchild") { sat = 80; lum = 35; }
  if (c.kind === "attractPickup") { sat = 90; lum = 65; }
  if (c.kind === "repelPickup")   { sat = 90; lum = 65; }
  if (c.kind === "mote")      { lum = 65; }

  // Neutrals + propellant motes get colored by mass relative to player so
  // threat is readable at a glance. Distinct kinds keep their identity color.
  const hue = (c.kind === "neutral" || c.kind === "mote") ? relativeHue(c) : c.hue;

  const sinceFlash = World.time - c.flashAt;
  const flash = sinceFlash < 0.3 ? (1 - sinceFlash / 0.3) * 15 : 0;

  const body = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  body.addColorStop(0,    hueColor(hue, sat, Math.min(90, lum + 25 + flash), 1));
  body.addColorStop(0.7,  hueColor(hue, sat, lum, 0.9));
  body.addColorStop(1,    hueColor(hue, sat, lum - 20, 0.5));
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();

  if (r > 3) {
    ctx.strokeStyle = hueColor(hue, sat, lum + 20, 0.65);
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.arc(p.x, p.y, r - ctx.lineWidth * 0.5, 0, TAU); ctx.stroke();
  }

  // Player aim indicator
  if (c === World.player && !World.won && !World.lost) {
    const aim = Player.aim;
    const dx = Math.cos(aim), dy = Math.sin(aim);
    ctx.strokeStyle = "rgba(180,240,255,0.8)";
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(p.x + dx * r * 0.4, p.y + dy * r * 0.4);
    ctx.lineTo(p.x + dx * r * 1.5, p.y + dy * r * 1.5);
    ctx.stroke();
    const ah = r * 0.35;
    const ax = p.x + dx * r * 1.5, ay = p.y + dy * r * 1.5;
    const px = -dy, py = dx;
    ctx.beginPath();
    ctx.moveTo(ax + dx * ah, ay + dy * ah);
    ctx.lineTo(ax + px * ah * 0.4, ay + py * ah * 0.4);
    ctx.lineTo(ax - px * ah * 0.4, ay - py * ah * 0.4);
    ctx.closePath();
    ctx.fillStyle = "rgba(180,240,255,0.7)";
    ctx.fill();
  }

  // Kind insignia
  if (r > 4) {
    if (c.kind === "hunter" || c.kind === "avoider") {
      ctx.fillStyle = c.kind === "hunter" ? "rgba(255,220,180,0.8)" : "rgba(180,255,220,0.8)";
      const sr = Math.max(1.5, r * 0.13);
      ctx.beginPath(); ctx.arc(p.x, p.y, sr, 0, TAU); ctx.fill();
    } else if (c.kind === "predator") {
      ctx.fillStyle = "rgba(255,200,200,0.9)";
      for (let i = -1; i <= 1; i++) {
        const sr = Math.max(1.2, r * 0.10);
        ctx.beginPath(); ctx.arc(p.x + i * r * 0.22, p.y, sr, 0, TAU); ctx.fill();
      }
    } else if (c.kind === "pup") {
      // Two small dots — a junior version of the predator crown
      ctx.fillStyle = "rgba(255,210,210,0.85)";
      for (let i = -1; i <= 1; i += 2) {
        const sr = Math.max(1, r * 0.10);
        ctx.beginPath(); ctx.arc(p.x + i * r * 0.18, p.y, sr, 0, TAU); ctx.fill();
      }
    } else if (c.kind === "anti") {
      ctx.strokeStyle = "rgba(255,180,255,0.95)";
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.beginPath();
      ctx.moveTo(p.x - r*0.45, p.y); ctx.lineTo(p.x + r*0.45, p.y);
      ctx.moveTo(p.x, p.y - r*0.45); ctx.lineTo(p.x, p.y + r*0.45);
      ctx.stroke();
    } else if (c.kind === "splitter") {
      // Three radial spokes hinting at fragmentation
      ctx.strokeStyle = "rgba(255,255,200,0.85)";
      ctx.lineWidth = Math.max(1.2, r * 0.06);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + World.time * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a)*r*0.2, p.y + Math.sin(a)*r*0.2);
        ctx.lineTo(p.x + Math.cos(a)*r*0.7, p.y + Math.sin(a)*r*0.7);
        ctx.stroke();
      }
    } else if (c.kind === "magnet" || c.kind === "repeller" || c.kind === "singchild") {
      // Ring(s) around the body to advertise the field
      ctx.strokeStyle = c.kind === "repeller"
        ? "rgba(220,170,255,0.5)"
        : "rgba(170,210,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.6, 0, TAU); ctx.stroke();
      if (c.kind === "singchild") {
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, TAU); ctx.stroke();
      }
      // Center dot for clarity
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      const sr = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.arc(p.x, p.y, sr, 0, TAU); ctx.fill();
    } else if (c.kind === "glutton") {
      // Open ring around the absorption reach
      ctx.strokeStyle = "rgba(255,200,140,0.4)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.6, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    } else if (c.kind === "attractPickup" || c.kind === "repelPickup") {
      // Two-arrow icon — converging for attract, diverging for repel
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1.5, r * 0.10);
      const arrowLen = r * 0.45;
      ctx.beginPath();
      if (c.kind === "attractPickup") {
        ctx.moveTo(p.x - arrowLen, p.y); ctx.lineTo(p.x - arrowLen*0.3, p.y);
        ctx.moveTo(p.x + arrowLen, p.y); ctx.lineTo(p.x + arrowLen*0.3, p.y);
      } else {
        ctx.moveTo(p.x - arrowLen*0.3, p.y); ctx.lineTo(p.x - arrowLen, p.y);
        ctx.moveTo(p.x + arrowLen*0.3, p.y); ctx.lineTo(p.x + arrowLen, p.y);
      }
      ctx.stroke();
      // Pulse halo for visibility
      const pulse = 0.5 + 0.5 * Math.sin(World.time * 4 + c.id);
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + pulse * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * (1.3 + pulse * 0.2), 0, TAU); ctx.stroke();
    } else if (c.kind === "pulsar") {
      // Animated shockwave when recently pulsed
      const t = c.pulseAt !== undefined ? World.time - c.pulseAt : 99;
      if (t >= 0 && t < 0.8) {
        const ring = (t / 0.8) * 280 * World.cameraScale;
        ctx.strokeStyle = `rgba(255,220,140,${(1 - t / 0.8) * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, ring, 0, TAU); ctx.stroke();
      }
      // Center cross
      ctx.fillStyle = "rgba(255,240,180,0.85)";
      const sr = Math.max(1.5, r * 0.16);
      ctx.beginPath(); ctx.arc(p.x, p.y, sr, 0, TAU); ctx.fill();
    }
  }

  // Shield: shimmering ring around the body while c._shieldedUntil is in
  // the future. Pulses with World.time so multiple shielded kinds stay
  // distinct visually. Drawn before other rings so kind-specific ones
  // (drain reach, field halo) sit on top.
  if (c.alive && World._isShielded(c)) {
    const t = World._shieldedUntil ? 0 : 0;     // (placeholder — using c._shieldedUntil)
    const remaining = c._shieldedUntil - World.time;
    const pulse = 0.5 + 0.5 * Math.sin(World.time * 6);
    const alpha = Math.min(1, remaining * 1.5) * (0.35 + pulse * 0.35);
    ctx.strokeStyle = `hsla(180, 100%, 75%, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.4, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `hsla(180, 100%, 85%, ${alpha * 0.5})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.7, 0, TAU); ctx.stroke();
  }

  // User-field ring: any user kind whose movement.type === "field" gets a
  // halo ring tinted by its hue (solid for attract, dashed for repel) so
  // it's visually obvious it carries a force, like the built-in Magnet
  // and Repeller. Field strength magnitude scales the ring's alpha.
  if (c.alive) {
    const meta = KIND_META[c.kind];
    if (meta && meta._user && meta.behavior === "field") {
      const strength = meta.fieldStrength || 0;
      const isRepel = strength < 0;
      const intensity = Math.min(1, Math.abs(strength) / 600000);
      ctx.strokeStyle = `hsla(${c.hue}, 80%, 65%, ${0.3 + intensity * 0.3})`;
      ctx.lineWidth = 1;
      if (isRepel) ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.6, 0, TAU); ctx.stroke();
      // Stronger fields get a second outer ring (mirrors Singchild).
      if (Math.abs(strength) >= 600000) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, TAU); ctx.stroke();
      }
      if (isRepel) ctx.setLineDash([]);
      // Center dot for clarity.
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      const sr = Math.max(1, r * 0.08);
      ctx.beginPath(); ctx.arc(p.x, p.y, sr, 0, TAU); ctx.fill();
    }
  }

  // Drain-field reach ring for any user kind with a drain-field ability.
  // Same dashed-ring affordance as the built-in Glutton, hue-matched so
  // multiple drain-field kinds in one scene are easy to tell apart.
  if (c.alive) {
    const meta = KIND_META[c.kind];
    if (meta && meta._user) {
      for (const ab of (meta._user.abilities || [])) {
        if (!ab || ab.enabled === false) continue;
        if (!ab.effect || ab.effect.type !== "drain-field") continue;
        const reachMul = ab.effect.reachMul !== undefined ? ab.effect.reachMul : 2.6;
        const reach = c.r * reachMul * World.cameraScale;
        ctx.strokeStyle = `hsla(${c.hue}, 80%, 65%, 0.4)`;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, reach, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        break;   // one ring per circle — multiple drain abilities still get one
      }
    }
  }

  // Phase 6: generic pulse-ability shockwave for non-Pulsar kinds. Tinted
  // by the kind's own hue so author-coloured pulses stay visually distinct.
  if (c.alive && c.kind !== "pulsar" && c.pulseAt !== undefined) {
    const t = World.time - c.pulseAt;
    if (t >= 0 && t < 0.8) {
      const range = c.pulseRange || 280;
      const ring = (t / 0.8) * range * World.cameraScale;
      ctx.strokeStyle = `hsla(${c.hue}, 80%, 70%, ${(1 - t / 0.8) * 0.55})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, ring, 0, TAU); ctx.stroke();
    }
  }

  // Debug overlay — kind / size / mass label next to each circle
  const showKind = Debug.get("showKindLabels");
  const showSize = Debug.get("showSizeLabels");
  const showMass = Debug.get("showMassLabels");
  if (showKind || showSize || showMass) {
    const parts = [];
    if (showKind) parts.push(c === World.player ? "player" : c.kind);
    if (showSize) parts.push(`r=${c.r.toFixed(1)}`);
    if (showMass) parts.push(`m=${c.mass.toFixed(0)}`);
    const label = parts.join(" ");
    ctx.font = "11px ui-monospace, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tx = p.x + r + 4;
    const ty = p.y;
    // Backing box for legibility against the bioluminescent glow
    const w = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(tx - 2, ty - 7, w + 4, 14);
    ctx.fillStyle = "rgba(220,240,255,0.95)";
    ctx.fillText(label, tx, ty);
  }

  if (ghostPlayer || camod) ctx.globalAlpha = savedAlpha;
}

// Predicted-trajectory ghost — forward-Euler integrate the player position
// using the same gravity model the simulation uses. Cheap because it only
// runs 24 steps and only draws if the toggle is on.
function integrateTrajectory(c, steps, dt, wells, fieldMotes) {
  const minR = 20;
  let x = c.x, y = c.y, vx = c.vx, vy = c.vy;
  const points = [{ x, y }];
  for (let i = 0; i < steps; i++) {
    let ax = 0, ay = 0;
    for (const w of wells) {
      const dx = w.x - x, dy = w.y - y;
      let d = Math.hypot(dx, dy);
      if (d < minR) d = minR;
      const a = w.strength / (d * d);
      ax += (dx / d) * a; ay += (dy / d) * a;
    }
    for (const m of fieldMotes) {
      if (m === c) continue;
      const dx = m.x - x, dy = m.y - y;
      let d = Math.hypot(dx, dy);
      if (d < minR) d = minR;
      const a = KIND_META[m.kind].fieldStrength / (d * d);
      ax += (dx / d) * a; ay += (dy / d) * a;
    }
    vx += ax * dt; vy += ay * dt;
    x  += vx * dt; y  += vy * dt;
    points.push({ x, y });
  }
  return points;
}

function strokeTrajectory(points, style, lineWidth, dash) {
  ctx.save();
  ctx.strokeStyle = style;
  ctx.lineWidth = lineWidth;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  const s0 = View.worldToScreen(points[0].x, points[0].y);
  ctx.moveTo(s0.x, s0.y);
  for (let i = 1; i < points.length; i++) {
    const s = View.worldToScreen(points[i].x, points[i].y);
    ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  if (dash) ctx.setLineDash([]);
  ctx.restore();
}

function drawTrajectoryGhost() {
  const p = World.player;
  if (!p || !p.alive) return;
  if (!Settings.load().showTrajectory) return;
  if (World.won || World.lost) return;

  const wells = World.gravityCenters;
  const fieldMotes = World.circles.filter(c => c.alive &&
    KIND_META[c.kind] && KIND_META[c.kind].behavior === "field");
  const pts = integrateTrajectory(p, 24, 0.05, wells, fieldMotes);
  strokeTrajectory(pts, "rgba(180,240,255,0.55)", 1.5, [5, 5]);
}

// Debug overlay — predicted trajectory for every moving cell. Same gravity
// model as the player ghost; ignores AI behaviors (hunter/avoider/etc.) so it
// shows ballistic motion only.
function drawAllTrajectoriesDebug() {
  if (!Debug.get("showTrajectories")) return;
  if (World.won || World.lost) return;
  const wells = World.gravityCenters;
  const fieldMotes = World.circles.filter(c => c.alive &&
    KIND_META[c.kind] && KIND_META[c.kind].behavior === "field");
  for (const c of World.circles) {
    if (!c.alive) continue;
    if (c === World.player) continue;
    if (Math.hypot(c.vx, c.vy) < 5) continue;
    const pts = integrateTrajectory(c, 16, 0.05, wells, fieldMotes);
    strokeTrajectory(pts, "rgba(255,200,120,0.35)", 1, [3, 4]);
  }
}

// Debug overlay — gravity-warp grid. Static positional warp: each grid
// intersection is displaced toward every gravity source (wells + field-kind
// motes) by a bounded amount, then the resulting curved gridlines are drawn.
// Displacement per source uses delta = (S - P) * strength * scale / (d² + soft²),
// which has bounded magnitude (peaks at d = soft, decays to 0 at d = 0 and
// d → ∞), so lines pinch toward sources without overshooting through them.
// "Warp intensity" multiplier scales the peak displacement; auto-baseline
// targets ~80 px peak (≈ one grid cell) at the strongest source.
function drawGravityWarpDebug() {
  if (!Debug.get("showGravityWarp")) return;
  const wells = World.gravityCenters;
  const fieldMotes = World.circles.filter(c => c.alive &&
    KIND_META[c.kind] && KIND_META[c.kind].behavior === "field");
  // Pulsars are transient: during the 0.8 s after a pulse, push the grid
  // outward in an expanding-shell bump synced to the visual shockwave ring.
  const PULSAR_LIFE = 0.8;
  const PULSAR_RANGE = 280;
  const PULSAR_BUMP_W = 60;       // gaussian half-width of the ripple bump
  const activePulsars = World.circles.filter(c =>
    c.alive && c.kind === "pulsar" && c.pulseAt !== undefined &&
    World.time - c.pulseAt < PULSAR_LIFE && World.time - c.pulseAt >= 0);

  if (wells.length === 0 && fieldMotes.length === 0 && activePulsars.length === 0) return;

  let sMax = 0;
  for (const w of wells) if (w.strength > sMax) sMax = w.strength;
  for (const m of fieldMotes) {
    const s = Math.abs(KIND_META[m.kind].fieldStrength);
    if (s > sMax) sMax = s;
  }
  // Fallback so a pulsar-only scene still has a sensible scale baseline.
  if (sMax <= 0) sMax = 1_000_000;

  const userMul = Debug.get("gravityWarpScale") || 1;
  const SOFT  = 100;
  const SOFT2 = SOFT * SOFT;
  // Peak per-source displacement at the strongest source, in world px.
  // 80 px ≈ one grid cell — visible pinch without overshoot.
  const peak  = 80 * userMul;
  const scale = peak * 2 * SOFT / sMax;
  // Pulsar ripples are short-lived events — exaggerate the displacement so
  // the ring "punches through" the static warp clearly (visual hint, not
  // physical accuracy).
  const pulsarPeak = 90 * userMul;
  const bumpW2     = PULSAR_BUMP_W * PULSAR_BUMP_W * 2;

  const warp = (x, y) => {
    let dx = 0, dy = 0;
    for (const w of wells) {
      const ddx = w.x - x, ddy = w.y - y;
      const d2 = ddx*ddx + ddy*ddy + SOFT2;
      const k = w.strength * scale / d2;
      dx += ddx * k; dy += ddy * k;
    }
    for (const m of fieldMotes) {
      const ddx = m.x - x, ddy = m.y - y;
      const d2 = ddx*ddx + ddy*ddy + SOFT2;
      const k = KIND_META[m.kind].fieldStrength * scale / d2;
      dx += ddx * k; dy += ddy * k;
    }
    for (const ps of activePulsars) {
      const ddx = x - ps.x, ddy = y - ps.y;     // outward direction
      const d = Math.hypot(ddx, ddy);
      if (d < 1) continue;
      const t = World.time - ps.pulseAt;
      const fade   = 1 - t / PULSAR_LIFE;
      const shellR = (t / PULSAR_LIFE) * PULSAR_RANGE;
      const off = d - shellR;
      const bump = Math.exp(-(off * off) / bumpW2);
      const mag = pulsarPeak * fade * bump;
      dx += (ddx / d) * mag; dy += (ddy / d) * mag;
    }
    return View.worldToScreen(x + dx, y + dy);
  };

  const b = World.bounds;
  const lineSpacing = 60;   // gap between adjacent gridlines (world px)
  const sampleStep  = 15;   // sampling resolution along each line

  ctx.save();
  ctx.strokeStyle = "rgba(255,180,80,0.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  // Horizontal lines: sweep x at each y.
  for (let y = b.y; y <= b.y + b.h + 0.5; y += lineSpacing) {
    let first = true;
    for (let x = b.x; x <= b.x + b.w + 0.5; x += sampleStep) {
      const p = warp(x, y);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    }
  }
  // Vertical lines: sweep y at each x.
  for (let x = b.x; x <= b.x + b.w + 0.5; x += lineSpacing) {
    let first = true;
    for (let y = b.y; y <= b.y + b.h + 0.5; y += sampleStep) {
      const p = warp(x, y);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function render() {
  drawBackground();
  drawPlayableFill();
  drawBoundsAndGravity();
  drawGravityWarpDebug();
  drawAllTrajectoriesDebug();
  drawTrajectoryGhost();
  // Draw smaller things first so the player & big things glow on top
  const sorted = World.circles.slice().sort((a,b) => a.r - b.r);
  for (const c of sorted) if (c.alive) drawCircle(c);
  drawObservationDebugOverlay();
}

// Phase 5: when the user has toggled the Debug overlay during an
// observation run, every user-kind circle that ran a rule last tick gets a
// thin tinted line drawn to its target plus a `#N action` label. Helps
// debug "why did this kind do that?" — single highest-leverage view per
// the design doc §8.1.
function drawObservationDebugOverlay() {
  if (!Game.observation || !Game.observation.debugOverlay) return;
  ctx.save();
  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.lineWidth = 1;
  for (const c of World.circles) {
    if (!c.alive || !c._lastRule) continue;
    const meta = KIND_META[c.kind];
    if (!meta || !meta._user) continue;     // user kinds only — built-ins not instrumented yet
    const r = c._lastRule;
    const cp = View.worldToScreen(c.x, c.y);
    const tp = View.worldToScreen(r.tx, r.ty);
    const hue = (r.ruleIdx * 67 + 200) % 360;
    if (r.hasTarget) {
      ctx.strokeStyle = `hsla(${hue},80%,60%,0.55)`;
      ctx.beginPath();
      ctx.moveTo(cp.x, cp.y);
      ctx.lineTo(tp.x, tp.y);
      ctx.stroke();
      ctx.fillStyle = `hsla(${hue},80%,75%,0.85)`;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 3, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = `hsla(${hue},80%,80%,0.9)`;
    ctx.fillText(`#${r.ruleIdx + 1} ${r.action}`, cp.x + 8, cp.y - 8);
  }
  ctx.restore();
}







// Mouse wheel: change editor size (or ring radius while ring-placement is
// active). With Shift held, zoom the editor camera around the cursor —
// pairs with the Shift+left-drag pan idiom for a familiar map-nav feel.
// With a non-empty selection, grow / shrink the selected circles instead.
canvas.addEventListener("wheel", e => {
  if (!Editor.active) return;
  e.preventDefault();
  if (e.shiftKey) {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const before = View.screenToWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    World.cameraScale = Math.max(0.05, Math.min(10, World.cameraScale * factor));
    // Re-anchor the camera so the world point under the cursor doesn't shift.
    World.cameraX = before.x - (mx - W / 2) / World.cameraScale;
    World.cameraY = before.y - (my - H / 2) / World.cameraScale;
    return;
  }
  const delta = -Math.sign(e.deltaY) * 3;
  // Selection takes priority over place-size: scroll resizes selected
  // circles so you can scale a chunk of the design without diving back
  // to the toolbar's r input. Suppressed during ring placement (the
  // wheel there controls ring radius).
  if (Editor.selection.size > 0 && !Editor._ring && !Editor._lineMode) {
    Editor._adjustSelectionRadius(delta);
    return;
  }
  Editor._adjustSize(delta);
}, { passive: false });

// Editor keyboard shortcuts: zoom, undo/redo, clipboard. Arrow keys drive
// the placement cursor (handled in Editor.update via the D-pad fallback),
// so they intentionally don't pan the camera here anymore.
window.addEventListener("keydown", e => {
  if (!Editor.active) return;
  // Any keyboard interaction cancels the player aim-mode prompt.
  // Escape is excluded so the main back-action handler can prioritize
  // aim → ring → selection → exit on a single press.
  // Shift is the angle-snap modifier during aim mode — don't treat its
  // keydown as a "user did something else" signal that cancels the aim.
  if (e.code !== "Escape" && e.code !== "ShiftLeft" && e.code !== "ShiftRight") {
    Editor._aimingPlayer = false;
  }
  // Move-to-line ricochet: while drawing the line, 'a' adds a bounce
  // and 'd' removes one. Intercepted *before* the editor's other key
  // shortcuts (notably Ctrl-D = duplicate) so the line-mode meaning
  // wins regardless of modifier state.
  if (Editor._lineMode && Editor._lineMode.drawing) {
    if (e.code === "KeyA") {
      e.preventDefault();
      Editor._lineMode.bounces = Math.min(16, Editor._lineMode.bounces + 1);
      return;
    }
    if (e.code === "KeyD") {
      e.preventDefault();
      Editor._lineMode.bounces = Math.max(0, Editor._lineMode.bounces - 1);
      return;
    }
  }
  if (e.code === "Equal" || e.code === "NumpadAdd") World.cameraScale *= 1.1;
  if (e.code === "Minus" || e.code === "NumpadSubtract") World.cameraScale /= 1.1;
  // Undo / redo: Ctrl-Z, Ctrl-Y, Ctrl-Shift-Z
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
    e.preventDefault();
    if (e.shiftKey) Editor.redo(); else Editor.undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
    e.preventDefault();
    Editor.redo();
  }
  // Selection clipboard shortcuts
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyC") { e.preventDefault(); Editor.copySelection(); }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyV") { e.preventDefault(); Editor.pasteAtCursor(); }
  if ((e.ctrlKey || e.metaKey) && e.code === "KeyD") { e.preventDefault(); Editor.duplicateSelection(); }
  if ((e.code === "Backspace" || e.code === "Delete") && Editor.selection.size > 0) {
    e.preventDefault(); Editor.deleteSelection();
  }
  // While drafting a polygon, Backspace pops the last placed vertex.
  if (e.code === "Backspace" && Editor._polyDraft && Editor._polyDraft.length > 0) {
    e.preventDefault(); Editor._polyDraft.pop();
    if (Editor._polyDraft.length === 0) Editor._polyDraft = null;
  }
  // Enter or double-click would also commit the polygon draft. Enter
  // is the most discoverable so wire it in alongside right-click.
  if (e.code === "Enter" && Editor._polyDraft) {
    e.preventDefault(); Editor._commitPolyDraft();
  }
  // Escape priority (aim → ring → selection → exit) is handled by the
  // designer's back-action handler in the main update loop.
  if (e.code === "KeyE" && Editor._ring) {
    Editor._ring.evenSpacing = !Editor._ring.evenSpacing;
    Editor._applyRingPositions();
  }
});

// Keep Editor.focus in sync with native DOM focus so clicking a toolbar
// field directly is treated the same as toggling there with X. A blur
// going into the modal overlay (prompts, confirms) should NOT demote us
// to canvas — the user expects to land back in the toolbar after the
// dialog closes. Track the last-focused id so we can restore it.
editorBar.addEventListener("focusin", e => {
  Editor.focus = "toolbar";
  Editor._aimingPlayer = false;   // any toolbar interaction cancels aim mode
  if (e.target && e.target.id) Editor._lastFocusId = e.target.id;
});
editorBar.addEventListener("focusout", e => {
  const r = e.relatedTarget;
  if (r && (editorBar.contains(r) || overlay.contains(r))) return;
  Editor.focus = "canvas";
});

// In form-style dialogs (Settings / Custom Game) keep Game.selectedMenu in
// sync with native focus so mouse and controller agree on which item is
// "current". Without this, clicking a slider with the mouse would leave the
// gamepad highlight stuck on whatever was selected before.
overlay.addEventListener("focusin", e => {
  if (Game.state !== "settings" && Game.state !== "options") return;
  const items = UI._navItems();
  const idx = Array.prototype.indexOf.call(items, e.target);
  if (idx >= 0 && idx !== Game.selectedMenu) {
    Game.selectedMenu = idx;
    UI.refreshSelected();
  }
});

// ============================================================
//   MAIN LOOP
// ============================================================

// Pick the best neighboring item in a given direction based on bounding-rect
// geometry. Falls back to linear next/prev if no spatial neighbor exists, so
// vertical-only menus still cycle naturally.
function pickSpatialNeighbor(items, currentIdx, direction) {
  if (!items.length) return currentIdx;
  const rects = Array.from(items).map(el => el.getBoundingClientRect());
  const cur = rects[currentIdx];
  if (!cur) return currentIdx;
  const cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2;
  let bestIdx = -1, bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === currentIdx) continue;
    const r = rects[i];
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const dx = tx - cx, dy = ty - cy;
    let primary, secondary;
    if (direction === "up")    { if (dy >= -2) continue; primary = -dy; secondary = Math.abs(dx); }
    if (direction === "down")  { if (dy <=  2) continue; primary =  dy; secondary = Math.abs(dx); }
    if (direction === "left")  { if (dx >= -2) continue; primary = -dx; secondary = Math.abs(dy); }
    if (direction === "right") { if (dx <=  2) continue; primary =  dx; secondary = Math.abs(dy); }
    const score = primary + secondary * 2;
    if (score < bestScore) { bestScore = score; bestIdx = i; }
  }
  if (bestIdx >= 0) return bestIdx;
  // Fallback: linear next/prev, so up/down still wraps in vertical lists.
  if (direction === "down" || direction === "right") return (currentIdx + 1) % items.length;
  return (currentIdx - 1 + items.length) % items.length;
}

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  // Audio ctx must be resumed by user gesture; gamepad polling counts in some browsers
  if (Audio_.ctx) Audio_.resume();

  // Designer JSON panel runs its own status refresh and self-hides
  // whenever the editor isn't active. Cheap, but unconditional so it
  // catches state transitions out of the designer too.
  JsonPanel.tick();

  // Menu navigation via gamepad — covers all overlay-driven states.
  // Skip while a UI.prompt is open so typing into the input doesn't move the menu.
  if (!UI._promptOpen && (
      Game.state === "menu" || Game.state === "win" || Game.state === "lose" ||
      Game.state === "hint" || Game.state === "campaign" || Game.state === "presets" ||
      Game.state === "options" || Game.state === "debug" || Game.state === "settings" ||
      Game.state === "confirm" || Game.state === "design-list" ||
      Game.state === "kinds"   || Game.state === "kinds-edit" ||
      Game.state === "kinds-inspect" ||
      UI._newKindsOpen)) {
    const items = UI._navItems();
    const usesForm = Game.state === "settings" || Game.state === "options";
    if (items.length) {
      const move = dir => {
        Game.selectedMenu = pickSpatialNeighbor(items, Game.selectedMenu, dir);
        UI.refreshSelected();
      };
      // Sample edges once each so we don't miss any.
      const downJust   = justPressed("DPAD_DOWN");
      const upJust     = justPressed("DPAD_UP");
      const dpadRJust  = justPressed("DPAD_RIGHT");
      const dpadLJust  = justPressed("DPAD_LEFT");
      const rShoulder  = justPressed("R");
      const lShoulder  = justPressed("L");
      const aJust      = justPressed("A") || justPressed("START");
      const backJust   = justPressed("B") || justPressed("SELECT");

      if (downJust)  move("down");
      if (upJust)    move("up");
      // D-pad left/right is always spatial nav, so the user can cross from
      // a focused slider to the button beside it. L/R shoulders are the
      // value-tweak knobs in form dialogs.
      if (dpadRJust) move("right");
      if (dpadLJust) move("left");

      const cur = items[Game.selectedMenu];
      const adjustable = usesForm && cur && (
        cur.tagName === "SELECT" ||
        (cur.tagName === "INPUT" && (cur.type === "range" || cur.type === "number"))
      );
      if (rShoulder) { if (adjustable) UI.formAdjust(cur, +1); else move("right"); }
      if (lShoulder) { if (adjustable) UI.formAdjust(cur, -1); else move("left"); }

      if (aJust) {
        Audio_.init(); Audio_.resume();
        if (adjustable) UI.formAdjust(cur, +1);
        else if (cur) cur.click();
      }
      if (backJust) {
        if (Game.state === "confirm") {
          // Treat back as "No" — click the no button so its handler fires
          const noBtn = overlay.querySelector('[data-action="no"]');
          if (noBtn) noBtn.click();
        } else if (Game.state === "hint") UI.renderCampaign();
        else if (Game.state === "design-list") {
          if (UI._designListBack) UI._designListBack();
        }
        else if (Game.state === "kinds-edit") UI.renderKinds();
        else if (Game.state === "kinds-inspect") UI.renderKinds();
        else if (Game.state === "kinds") Game.toMenu();
        else if (Game.state === "campaign" || Game.state === "presets" ||
                 Game.state === "options"  || Game.state === "debug" ||
                 Game.state === "settings") Game.toMenu();
      }
    }
  } else if (Game.state === "paused") {
    if (actionJustPressed("pause")) Game.togglePause();
    if (actionJustPressed("back")) {
      if (Game.observation) Game.endObservation();
      else if (Editor.testStash) Editor.returnFromTest();
      else Game.toMenu();
    }
    // Keep the camera responsive while paused so zoomIn / zoomOut
    // (and the double-tap-to-reset shortcut) continue to work — the
    // world isn't stepping but the user can still frame the scene.
    View.update(dt);
  } else if (Game.state === "designer") {
    Editor.update(dt);
    if (actionJustPressed("back")) {
      // Priority: cancel transient state first, only exit on the last press.
      if (Editor._aimingPlayer) Editor._aimingPlayer = false;
      else if (Editor._lineMode) Editor._cancelLineMode();
      else if (Editor._ring) Editor._cancelRing();
      else if (Editor._polyDraft) Editor._polyDraft = null;
      else if (Editor.selection.size > 0) Editor.selection.clear();
      else if (Editor.testCaseMode) Editor.exitTestCase();
      else Editor.exit();
    }
  } else if (Game.state === "playing") {
    // Intro zoom: the camera animates while world simulation and player
    // input are suspended. View.update advances the timer using wall-clock
    // dt regardless, so the duration is exactly what the user configured.
    const introing = View.introActive();
    if (!introing) Player.update(dt);
    // Observation mode (Phase 4) lets the user scrub time. When paused, a
    // single click of "Step" advances exactly one fixed-dt frame.
    let stepDt = dt * (Game.observation ? (Game.timeScale || 1) : 1);
    let runStep = !Game.paused && !introing;
    if (Game.observation && Game.paused && Game._stepOnce && !introing) {
      stepDt = 1 / 60;
      runStep = true;
      Game._stepOnce = false;
    }
    if (runStep) World.step(stepDt);
    View.update(dt);

    // Track peak mass each frame for stats.
    if (World.player && World.player.mass > Game.currentPeakMass) {
      Game.currentPeakMass = World.player.mass;
    }

    // Win/lose detection — show panel a moment after the event. Skipped in
    // observation mode: tests run forever, the user reads the result by
    // watching, and there's no pass/fail evaluation per the design doc.
    if (!Game.observation) {
      if (World.won && World.endTime > 1.0 && !Game.endHandled) {
        Game.endHandled = true;
        if (Game.campaignLevelId != null) Campaign.markCompleted(Game.campaignLevelId);
        if (Game.currentStatsKey) Stats.recordWin(Game.currentStatsKey, World.time, Game.currentPeakMass);
        Game.state = "win"; UI.renderEnd(true);
      }
      if (World.lost && World.endTime > 1.5 && !Game.endHandled) {
        Game.endHandled = true;
        if (Game.currentStatsKey) Stats.recordLoss(Game.currentStatsKey, Game.currentPeakMass);
        Game.state = "lose"; UI.renderEnd(false);
      }
    }
  }

  // Camera follows the player only while actually playing
  View.followPlayer = (Game.state === "playing" || Game.state === "paused" ||
                       Game.state === "win" || Game.state === "lose");

  ctx.clearRect(0, 0, W, H);
  if (Game.state === "playing" || Game.state === "paused" ||
      Game.state === "win" || Game.state === "lose" ||
      Game.state === "designer" ||
      (Game.state === "design-list" && Editor.active)) {
    render();
    if (Editor.active) Editor.drawOverlay();
  } else {
    drawBackground();
  }

  if (Game.state === "playing" || Game.state === "paused") UI.updateHUD();

  // Pause button visible whenever a level is on screen. Label flips when paused.
  // In observation mode the floating test-control bar owns the same top-center
  // slot and already exposes Pause / Play, so the pill is suppressed there.
  if ((Game.state === "playing" || Game.state === "paused") && !Game.observation) {
    pauseBtnEl.classList.remove("hidden");
    pauseBtnEl.textContent = Game.paused ? "▶ resume" : "❚❚ pause";
  } else {
    pauseBtnEl.classList.add("hidden");
  }

  // Refresh the observation stats panel ~6× per second so the live
  // counters are smooth without rebuilding HTML every frame.
  if (Game.observation && Game.observation.showStats) {
    Game._statsRefreshT = (Game._statsRefreshT || 0) + dt;
    if (Game._statsRefreshT > 0.16) { Game._statsRefreshT = 0; UI.renderObservationStats(); }
  }

  // Touch overlay sync — show during play, reveal Attract / Repel buttons
  // only while the player owns one (or unlimited-pickups debug is on).
  Touch.refresh();

  // Debug: show currently playing music track in the top-right corner.
  if (Debug.get("showMusicName")) {
    const track = Audio_.currentTrack || "(none)";
    musicNameEl.textContent = "♪ " + track;
    musicNameEl.classList.remove("hidden");
  } else if (!musicNameEl.classList.contains("hidden")) {
    musicNameEl.classList.add("hidden");
  }

  requestAnimationFrame(loop);
}

// Kick everything off. LevelStore needs to fetch the campaign +
// preset manifests + every referenced level JSON before the menu
// renders, otherwise the level grid is empty. Top-level await keeps
// the load on the import path so dynamic-import consumers (e.g. the
// level extractor) see a settled module.
Kinds.init();
Touch.init();
await LevelStore.load();
UI.renderMenu();
requestAnimationFrame(t => { lastT = t; loop(t); });

// First user gesture starts audio
function unlockAudio() {
  Audio_.init(); Audio_.resume();
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
  window.removeEventListener("gamepadconnected", unlockAudio);
}
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);
window.addEventListener("gamepadconnected", unlockAudio);

