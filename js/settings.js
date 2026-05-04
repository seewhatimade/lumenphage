import { KEY_FALLBACK } from "./main.js";

// Settings — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

export const Settings = {
  storageKey: "lumenphage.settings.v1",
  defaults: {
    musicEnabled: true,
    showTrajectory: true,
    introZoom: true,
    introZoomDuration: 1.0,   // seconds — game stays paused while it plays
    masterVolume: 0.7,
    musicVolume:  0.5,
    sfxVolume:    0.7,
    // Level designer — when on, picking a Kind while the Shape tool is
    // active flips the tool back to Place, since changing Kind is almost
    // always a signal that the user wants to place the new kind.
    editorAutoSwitchToPlace: true,
    // Each slot is { pad, key } — either side may be null. Defaults give every
    // action both a gamepad button and a sensible keyboard key. The four aim
    // directions are held-intent: holding DPAD_RIGHT slews aim toward 0,
    // DPAD_UP+DPAD_RIGHT toward -π/4, etc. (See Player.update.)
    bindings: {
      aimUp:    { primary: { pad: "DPAD_UP",    key: "ArrowUp"    } },
      aimDown:  { primary: { pad: "DPAD_DOWN",  key: "ArrowDown"  } },
      aimLeft:  { primary: { pad: "DPAD_LEFT",  key: "ArrowLeft"  } },
      aimRight: { primary: { pad: "DPAD_RIGHT", key: "ArrowRight" } },
      thrust:   { primary: { pad: "A",          key: "Space"      } },
      boost:    { primary: { pad: "B",          key: "KeyZ"      } },
      attract:  { primary: { pad: "X",          key: "KeyX"      } },
      repel:    { primary: { pad: "Y",          key: "KeyC"      } },
      zoomOut:  { primary: { pad: "L",          key: "KeyQ"      } },
      zoomIn:   { primary: { pad: "R",          key: "KeyE"      } },
      pause:    { primary: { pad: "START",      key: "KeyP"      } },
      back:     { primary: { pad: "SELECT",     key: "Escape"    } }
    }
  },
  active: null,
  load() {
    if (this.active) return this.active;
    let merged;
    try {
      const raw = localStorage.getItem(this.storageKey);
      const stored = raw ? JSON.parse(raw) : {};
      merged = JSON.parse(JSON.stringify(this.defaults));
      if (typeof stored.musicEnabled === "boolean") merged.musicEnabled = stored.musicEnabled;
      if (typeof stored.showTrajectory === "boolean") merged.showTrajectory = stored.showTrajectory;
      if (typeof stored.introZoom === "boolean") merged.introZoom = stored.introZoom;
      if (typeof stored.introZoomDuration === "number") merged.introZoomDuration = stored.introZoomDuration;
      if (typeof stored.masterVolume === "number") merged.masterVolume = stored.masterVolume;
      if (typeof stored.musicVolume === "number")  merged.musicVolume  = stored.musicVolume;
      if (typeof stored.sfxVolume === "number")    merged.sfxVolume    = stored.sfxVolume;
      if (typeof stored.editorAutoSwitchToPlace === "boolean") merged.editorAutoSwitchToPlace = stored.editorAutoSwitchToPlace;
      if (stored.bindings) {
        // Upgrade legacy string-form slots ({primary: "A"}) into {pad, key}.
        const upgrade = (slot) => {
          if (!slot) return slot;
          if (typeof slot === "string") {
            const fallback = (KEY_FALLBACK[slot] || [])[0] || null;
            return { pad: slot, key: fallback };
          }
          return { pad: slot.pad ?? null, key: slot.key ?? null };
        };
        for (const k in stored.bindings) {
          if (k === "usePickup") continue;   // legacy — replaced by attract/repel
          const src = stored.bindings[k];
          const cur = merged.bindings[k] || {};
          // thrust.secondary was a dual-bind slot in v1; the v2 D-pad aim
          // scheme owns DPAD_UP, so we drop any stored secondary.
          merged.bindings[k] = {
            primary: upgrade(src.primary) || cur.primary
          };
        }
      }
    } catch { merged = JSON.parse(JSON.stringify(this.defaults)); }
    this.active = merged;
    return merged;
  },
  save() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.active)); } catch {}
  },
  reset() {
    this.active = JSON.parse(JSON.stringify(this.defaults));
    this.save();
  },
  binding(action) {
    return this.load().bindings[action] || {};
  },
  // Set the entire {pad, key} pair for a slot. Pass null to clear the slot.
  setBindingSlot(action, slot, value) {
    this.load();
    this.active.bindings[action] = this.active.bindings[action] || {};
    if (value === null) delete this.active.bindings[action][slot];
    else this.active.bindings[action][slot] = value;
    this.save();
  },
  // Set just one source (pad or key) on a slot, leaving the other intact.
  setBindingSource(action, slot, source, value) {
    this.load();
    const b = this.active.bindings[action] = this.active.bindings[action] || {};
    const cur = b[slot] || { pad: null, key: null };
    b[slot] = { pad: cur.pad, key: cur.key, [source]: value };
    this.save();
  },
  setMusicEnabled(on) {
    this.load();
    this.active.musicEnabled = on;
    this.save();
  }
};
