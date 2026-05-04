#!/usr/bin/env node
// Run every campaign + preset `build()` against a Node module graph
// with the minimum DOM/audio stubs needed, capture `Editor.serialize()`,
// and dump the result as canonical JSON files under `levels/`.
//
// Was VM-based when the runtime was a single inline script; now it
// dynamically imports the entry module after stubbing browser globals.
//
// Re-run any time as a verification pass — the output should be
// byte-identical to the committed JSON files. Procedural builders
// (Levels.sparse / .packed / .gravity) are skipped; they're referenced
// from the manifest by builder name + seed.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// ---- Browser stubs --------------------------------------------------
// main.js grabs DOM + Web Audio + storage at top level, so we have to
// satisfy enough of those APIs that the module evaluates without
// throwing. We don't need them to *work* — just to silently no-op so
// the level builders downstream can run.

const noop = () => {};
function el() {
  return new Proxy({}, {
    get(_, key) {
      switch (key) {
        case "addEventListener": return noop;
        case "removeEventListener": return noop;
        case "appendChild": return noop;
        case "removeChild": return noop;
        case "replaceChildren": return noop;
        case "insertBefore": return noop;
        case "remove": return noop;
        case "getContext": return () => makeCtx();
        case "getBoundingClientRect": return () => ({ left: 0, top: 0, width: 0, height: 0 });
        case "classList": return { add: noop, remove: noop, toggle: noop, contains: () => false };
        case "style": return new Proxy({}, { set: () => true, get: () => "" });
        case "dataset": return {};
        case "querySelector": return () => el();
        case "querySelectorAll": return () => [];
        case "focus": return noop;
        case "blur": return noop;
        case "click": return noop;
        case "scrollTop": return 0;
        case "scrollLeft": return 0;
        case "tagName": return "DIV";
        case "innerHTML": return "";
        case "textContent": return "";
        case "value": return "";
        case "checked": return false;
        case "files": return [];
        case "selectionStart": return 0;
        case "selectionEnd": return 0;
        case "parentElement": return el();
        case "children": return [];
        case "open": return false;
        case "hidden": return false;
        default: return undefined;
      }
    },
    set: () => true,
  });
}
function makeCtx() {
  return new Proxy({}, {
    get(_, k) {
      if (k === "canvas") return el();
      return typeof k === "string" ? noop : undefined;
    },
    set: () => true,
  });
}

class AudioContextStub {
  constructor() {
    this.currentTime = 0;
    this.destination = {};
    this.state = "suspended";
  }
  createGain() { return { connect: noop, gain: { value: 1, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop, cancelScheduledValues: noop } }; }
  createOscillator() { return { connect: noop, frequency: { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop }, type: "sine", start: noop, stop: noop, addEventListener: noop, detune: { value: 0 } }; }
  createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
  createBufferSource() { return { connect: noop, start: noop, stop: noop, addEventListener: noop, buffer: null, playbackRate: { value: 1 } }; }
  createBiquadFilter() { return { connect: noop, type: "lowpass", frequency: { value: 0, setValueAtTime: noop }, Q: { value: 0 }, gain: { value: 0 } }; }
  createDelay() { return { connect: noop, delayTime: { value: 0, setValueAtTime: noop } }; }
  createDynamicsCompressor() { return { connect: noop, threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } }; }
  resume() { return Promise.resolve(); }
  suspend() { return Promise.resolve(); }
}

const localStorageStub = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
})();

// fetch stub backed by the local filesystem so LevelStore.load
// resolves cleanly during extraction.
const fetchStub = async (urlArg) => {
  const m = String(urlArg).match(/^\.\/levels\/(.+)$/);
  if (!m) throw new Error(`fetch stub refuses non-local URL: ${urlArg}`);
  const filePath = path.join(root, "levels", m[1]);
  if (!fs.existsSync(filePath)) {
    return { ok: false, status: 404, statusText: "not found", json: async () => null, text: async () => "" };
  }
  const body = fs.readFileSync(filePath, "utf8");
  return {
    ok: true, status: 200, statusText: "OK",
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};

// Install stubs on globalThis so the imported modules see them.
const documentStub = {
  getElementById: () => el(),
  createElement: () => el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  addEventListener: noop,
  removeEventListener: noop,
  body: el(),
  activeElement: el(),
};
const windowStub = {
  addEventListener: noop,
  removeEventListener: noop,
  innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: noop,
  cancelAnimationFrame: noop,
};

// Node's `navigator` is a getter on the global object, so plain
// assignment fails. Use `Object.defineProperty` to override.
function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    value, writable: true, configurable: true, enumerable: true,
  });
}
defineGlobal("document", documentStub);
defineGlobal("window", windowStub);
defineGlobal("navigator", { getGamepads: () => [] });
defineGlobal("performance", { now: () => Date.now() });
defineGlobal("localStorage", localStorageStub);
defineGlobal("AudioContext", AudioContextStub);
defineGlobal("webkitAudioContext", AudioContextStub);
defineGlobal("requestAnimationFrame", noop);
defineGlobal("cancelAnimationFrame", noop);
defineGlobal("fetch", fetchStub);
defineGlobal("getComputedStyle", () => new Proxy({}, { get: () => "" }));

// ---- Run ------------------------------------------------------------

// Dynamic import — resolves once main.js's top-level body finishes,
// which (since main.js awaits LevelStore.load before kicking the
// animation loop via requestAnimationFrame) means the level store
// has settled before we look at Campaign.
const main = await import(url.pathToFileURL(path.join(root, "js/main.js")).href);
const editorMod = await import(url.pathToFileURL(path.join(root, "js/editor.js")).href);
const presetsMod = await import(url.pathToFileURL(path.join(root, "js/presets.js")).href);
const worldMod = await import(url.pathToFileURL(path.join(root, "js/world.js")).href);

const { Campaign } = main;
const { Editor } = editorMod;
const { Presets } = presetsMod;
const { World } = worldMod;

if (!Campaign) throw new Error("Campaign module didn't evaluate");
if (!Editor) throw new Error("Editor module didn't evaluate");
if (Campaign.levels.length === 0) throw new Error("Campaign.levels is empty — LevelStore.load may not have settled");

// ---- Capture --------------------------------------------------------

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function pad(n) { return String(n).padStart(2, "0"); }

const campaignManifest = { version: 1, levels: [] };
const campaignDir = path.join(root, "levels", "campaign");
fs.mkdirSync(campaignDir, { recursive: true });

for (const lvl of Campaign.levels) {
  const entry = {
    id: lvl.id,
    name: lvl.name,
    stage: lvl.stage,
    branches: lvl.branches,
    hint: lvl.hint,
  };
  if (lvl.procedural) {
    entry.procedural = lvl.procedural;
    if (lvl.victoryOverride) entry.victoryOverride = lvl.victoryOverride;
  } else {
    Editor._lastFocusId = undefined;
    Editor.testCaseMode = null;
    Editor.randomVelocity = false;
    Editor.victoryCondition = "absorb_all";
    Editor.victoryParam = 60;
    World.reset();
    lvl.build();
    Editor.victoryCondition = World.victoryCondition;
    Editor.victoryParam = World.victoryParam;
    const data = Editor.serialize();
    const file = `${pad(lvl.id)}-${slug(lvl.name)}.json`;
    entry.file = file;
    fs.writeFileSync(path.join(campaignDir, file), JSON.stringify(data, null, 2) + "\n");
  }
  campaignManifest.levels.push(entry);
}
fs.writeFileSync(
  path.join(campaignDir, "manifest.json"),
  JSON.stringify(campaignManifest, null, 2) + "\n",
);

// ---- Presets --------------------------------------------------------

const presetsManifest = { version: 1, presets: [] };
const presetsDir = path.join(root, "levels", "presets");
fs.mkdirSync(presetsDir, { recursive: true });

for (const p of Presets.list) {
  const entry = { id: p.id, name: p.name, music: p.music, desc: p.desc };
  if (p.procedural) {
    entry.procedural = p.procedural;
    if (p.victoryOverride) entry.victoryOverride = p.victoryOverride;
  } else {
    Editor.randomVelocity = false;
    Editor.victoryCondition = "absorb_all";
    Editor.victoryParam = 60;
    World.reset();
    p.build();
    Editor.victoryCondition = World.victoryCondition;
    Editor.victoryParam = World.victoryParam;
    const data = Editor.serialize();
    const file = `${slug(p.name)}.json`;
    entry.file = file;
    fs.writeFileSync(path.join(presetsDir, file), JSON.stringify(data, null, 2) + "\n");
  }
  presetsManifest.presets.push(entry);
}
fs.writeFileSync(
  path.join(presetsDir, "manifest.json"),
  JSON.stringify(presetsManifest, null, 2) + "\n",
);

console.log(
  `extracted ${campaignManifest.levels.length} campaign levels ` +
  `(${campaignManifest.levels.filter(l => l.file).length} JSON, ` +
  `${campaignManifest.levels.filter(l => l.procedural).length} procedural) ` +
  `+ ${presetsManifest.presets.length} presets`,
);
