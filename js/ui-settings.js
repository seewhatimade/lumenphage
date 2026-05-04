import { Audio_ } from "./audio.js";
import { Debug } from "./debug.js";
import { Game } from "./game.js";
import { ACTION_LABELS, ALL_BUTTONS, editorBar, editorHelp, hud, overlay } from "./main.js";
import { Settings } from "./settings.js";
import { UI } from "./ui.js";

// UI — split across multiple files (see js/ui.js for the menu
// dispatcher + shared helpers; this file holds one method group).
// Method group "settings" — extracted from ui.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(UI, {
  // Step a focused select / range / number input by `dir` (+1 or -1).
  // Fires both 'input' and 'change' so existing onchange handlers run.
  formAdjust(el, dir) {
    if (!el) return false;
    if (el.tagName === "SELECT") {
      const n = el.options.length;
      if (n === 0) return false;
      let idx = el.selectedIndex + dir;
      idx = Math.max(0, Math.min(n - 1, idx));
      if (idx === el.selectedIndex) return false;
      el.selectedIndex = idx;
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (el.tagName === "INPUT" && (el.type === "range" || el.type === "number")) {
      const step = +(el.step || 1) || 1;
      const min  = el.min !== "" ? +el.min : -Infinity;
      const max  = el.max !== "" ? +el.max :  Infinity;
      const cur  = +el.value || 0;
      const next = Math.max(min, Math.min(max, cur + dir * step));
      if (next === cur) return false;
      el.value = next;
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  },

  renderSettings() {
    Game.state = "settings";
    UI._capturingKey = null;
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Audio_.init(); Audio_.resume(); Audio_.startMusic("lobby");

    const cfg = Settings.load();
    const padOptions = (sel) => `<option value="">—</option>` +
      ALL_BUTTONS.map(b => `<option value="${b}" ${b === sel ? "selected" : ""}>${b}</option>`).join("");

    // Pretty key label (KeyA → A, ArrowUp → ↑, etc.)
    const keyLabel = (code) => {
      if (!code) return "—";
      if (code.startsWith("Key")) return code.slice(3);
      if (code.startsWith("Digit")) return code.slice(5);
      if (code === "ArrowLeft")  return "←";
      if (code === "ArrowRight") return "→";
      if (code === "ArrowUp")    return "↑";
      if (code === "ArrowDown")  return "↓";
      return code;
    };

    const slotRow = (action, slot, label) => {
      const b = (cfg.bindings[action] || {})[slot] || { pad: null, key: null };
      return `<tr>
        <td style="opacity:0.85; padding-right:18px;">${label}</td>
        <td>
          <select data-action="${action}" data-slot="${slot}" data-source="pad">${padOptions(b.pad)}</select>
        </td>
        <td>
          <button data-rebind-key data-action="${action}" data-slot="${slot}"
            style="font-size:11px; padding:2px 10px; min-width:74px; font-family:ui-monospace,Menlo,monospace;">${keyLabel(b.key)}</button>
          ${b.key ? `<button data-clear-key data-action="${action}" data-slot="${slot}"
            style="font-size:10px; padding:1px 6px; margin-left:4px; opacity:0.6;">×</button>` : ""}
        </td>
        <td></td>
      </tr>`;
    };

    const bindingRow = (action) => slotRow(action, "primary", ACTION_LABELS[action]);

    const order = ["aimUp", "aimDown", "aimLeft", "aimRight", "thrust", "boost",
                   "attract", "repel", "zoomOut", "zoomIn", "pause", "back"];

    overlay.innerHTML = `
      <div class="panel wide" style="text-align:left;">
        <h1 style="font-size:24px; letter-spacing:5px; text-align:center;">SETTINGS</h1>

        <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6; margin-top:8px;">AUDIO</h3>
        <table>
          <tr>
            <td style="opacity:0.85;">Music</td>
            <td><input id="set-music" type="checkbox" ${cfg.musicEnabled ? "checked" : ""}></td>
          </tr>
          <tr>
            <td style="opacity:0.85;">Master volume</td>
            <td>
              <input id="set-vol-master" type="range" min="0" max="1" step="0.05" value="${cfg.masterVolume}">
              <span id="set-vol-master-v" style="opacity:0.55; font-size:11px;">${Math.round(cfg.masterVolume * 100)}%</span>
            </td>
          </tr>
          <tr>
            <td style="opacity:0.85;">Music volume</td>
            <td>
              <input id="set-vol-music" type="range" min="0" max="1" step="0.05" value="${cfg.musicVolume}">
              <span id="set-vol-music-v" style="opacity:0.55; font-size:11px;">${Math.round(cfg.musicVolume * 100)}%</span>
            </td>
          </tr>
          <tr>
            <td style="opacity:0.85;">SFX volume</td>
            <td>
              <input id="set-vol-sfx" type="range" min="0" max="1" step="0.05" value="${cfg.sfxVolume}">
              <span id="set-vol-sfx-v" style="opacity:0.55; font-size:11px;">${Math.round(cfg.sfxVolume * 100)}%</span>
            </td>
          </tr>
        </table>

        <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6; margin-top:14px;">VISUALS</h3>
        <table>
          <tr>
            <td style="opacity:0.85;">Trajectory ghost line</td>
            <td><input id="set-trajectory" type="checkbox" ${cfg.showTrajectory ? "checked" : ""}></td>
          </tr>
          <tr>
            <td style="opacity:0.85;" title="Camera starts zoomed-out and lerps in to the player at game / test start">
              Intro zoom on game start
            </td>
            <td><input id="set-introzoom" type="checkbox" ${cfg.introZoom ? "checked" : ""}></td>
          </tr>
          <tr>
            <td style="opacity:${cfg.introZoom ? "0.85" : "0.4"};" title="How long the intro zoom takes — gameplay is paused while it plays">
              Intro zoom duration
            </td>
            <td>
              <input id="set-introzoom-dur" type="range" min="0.2" max="3" step="0.1"
                     value="${cfg.introZoomDuration}" ${cfg.introZoom ? "" : "disabled"}>
              <span id="set-introzoom-dur-v" style="opacity:0.55; font-size:11px;">${cfg.introZoomDuration.toFixed(1)}s</span>
            </td>
          </tr>
        </table>

        <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6; margin-top:14px;">LEVEL DESIGNER</h3>
        <table>
          <tr>
            <td style="opacity:0.85;" title="Picking a Kind from the toolbar dropdown while the Shape tool is active flips the tool back to Place. The expectation is that changing kind means you want to place that new kind on the map.">
              Switch to Place when Kind changes (Shape tool only)
            </td>
            <td><input id="set-editor-autoplace" type="checkbox" ${cfg.editorAutoSwitchToPlace ? "checked" : ""}></td>
          </tr>
        </table>

        <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6; margin-top:14px;">CONTROLS</h3>
        <p style="font-size:11px; opacity:0.55; margin: 0 0 6px;">
          Each action gets a gamepad button on the left and a keyboard key on the right.
          Either can be cleared. Hold any of the four aim directions to slew your aim
          toward that angle (combined directions give 45° diagonals).
        </p>
        <table>
          <tr style="font-size:10px; letter-spacing:2px; opacity:0.5; text-transform:uppercase;">
            <td>Action</td><td>Gamepad</td><td>Keyboard</td><td></td>
          </tr>
          ${order.map(bindingRow).join("")}
        </table>

        <div id="menu-list" style="margin-top:18px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          <div class="menu-item selected" data-action="done">Done</div>
          <div class="menu-item" data-action="reset">Reset to defaults</div>
        </div>
      </div>`;

    document.getElementById("set-music").onchange = e => {
      Settings.setMusicEnabled(e.target.checked);
      if (!e.target.checked) Audio_.stopMusic();
      else Audio_.startMusic("lobby");
    };
    document.getElementById("set-trajectory").onchange = e => {
      Settings.load();
      Settings.active.showTrajectory = e.target.checked;
      Settings.save();
    };
    document.getElementById("set-editor-autoplace").onchange = e => {
      Settings.load();
      Settings.active.editorAutoSwitchToPlace = e.target.checked;
      Settings.save();
    };
    document.getElementById("set-introzoom").onchange = e => {
      Settings.load();
      Settings.active.introZoom = e.target.checked;
      Settings.save();
      // Refresh so the duration row's enabled/opacity state matches.
      UI.renderSettings();
    };
    const introDurEl = document.getElementById("set-introzoom-dur");
    const introDurV  = document.getElementById("set-introzoom-dur-v");
    if (introDurEl) {
      const onDur = () => {
        const v = Math.max(0.2, Math.min(3, parseFloat(introDurEl.value) || 1));
        introDurV.textContent = v.toFixed(1) + "s";
        Settings.load();
        Settings.active.introZoomDuration = v;
        Settings.save();
      };
      introDurEl.addEventListener("input",  onDur);
      introDurEl.addEventListener("change", onDur);
    }
    const wireVolume = (key, sliderId, labelId) => {
      const slider = document.getElementById(sliderId);
      const label  = document.getElementById(labelId);
      slider.oninput = () => {
        const v = parseFloat(slider.value);
        Settings.load();
        Settings.active[key] = v;
        Settings.save();
        Audio_.applyVolumes();
        label.textContent = Math.round(v * 100) + "%";
      };
    };
    wireVolume("masterVolume", "set-vol-master", "set-vol-master-v");
    wireVolume("musicVolume",  "set-vol-music",  "set-vol-music-v");
    wireVolume("sfxVolume",    "set-vol-sfx",    "set-vol-sfx-v");

    // Gamepad button dropdowns
    overlay.querySelectorAll("select[data-action][data-source='pad']").forEach(el => {
      el.onchange = () => Settings.setBindingSource(
        el.dataset.action, el.dataset.slot, "pad", el.value || null);
    });

    // Keyboard rebind buttons — click then press a key
    overlay.querySelectorAll("button[data-rebind-key]").forEach(el => {
      el.onclick = () => {
        UI._capturingKey = { action: el.dataset.action, slot: el.dataset.slot };
        el.textContent = "Press a key...";
        el.style.background = "rgba(60,160,200,0.4)";
      };
    });

    // Clear-key buttons
    overlay.querySelectorAll("button[data-clear-key]").forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        Settings.setBindingSource(el.dataset.action, el.dataset.slot, "key", null);
        UI.renderSettings();
      };
    });

    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
      el.addEventListener("click", () => {
        if (el.dataset.action === "reset") {
          UI.confirm({
            title: "RESET SETTINGS",
            message: "Reset all controls and audio settings to defaults?",
            yesLabel: "Reset",
            danger: true,
            onYes: () => { Settings.reset(); Audio_.applyVolumes(); },
            restore: () => UI.renderSettings()
          });
        } else {
          Game.toMenu();
        }
      });
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  renderDebug() {
    Game.state = "debug";
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Audio_.init(); Audio_.resume(); Audio_.startMusic("lobby");

    const showLabels = Debug.get("showKindLabels");
    const showSizes  = Debug.get("showSizeLabels");
    const showMasses = Debug.get("showMassLabels");
    const showTraj   = Debug.get("showTrajectories");
    const ghostMode  = Debug.get("ghostMode");
    const showMusic  = Debug.get("showMusicName");
    const unlimited  = Debug.get("unlimitedPickups");
    const warpOn     = Debug.get("showGravityWarp");
    const warpScale  = Debug.get("gravityWarpScale");

    const toggles = [
      { key: "showKindLabels",   label: "Show kind label next to each circle",       on: showLabels },
      { key: "showSizeLabels",   label: "Show radius next to each circle",           on: showSizes },
      { key: "showMassLabels",   label: "Show mass next to each circle",             on: showMasses },
      { key: "showTrajectories", label: "Show predicted trajectory of every cell",   on: showTraj },
      { key: "showGravityWarp",  label: "Visualize gravity warp (test-particle grid)", on: warpOn },
      { key: "ghostMode",        label: "Ghost mode &mdash; player invisible to all motes", on: ghostMode },
      { key: "showMusicName",    label: "Show current music track (top-right)",      on: showMusic },
      { key: "unlimitedPickups", label: "Unlimited attract &amp; repel pickups",     on: unlimited },
    ];
    const rowHtml = t => `
      <div class="menu-item" data-toggle="${t.key}" style="display:flex; justify-content:space-between; align-items:center; gap:14px;">
        <span>${t.label}</span>
        <span class="dbg-state" style="font-family:monospace; opacity:0.85;">[${t.on ? "x" : " "}]</span>
      </div>`;

    overlay.innerHTML = `
      <div class="panel" style="text-align:left; min-width:420px;">
        <h2 style="text-align:center;">DEBUG SETTINGS</h2>
        <p style="opacity:0.6; font-size:11px; text-align:center; margin-bottom:14px;">
          Only available when Dev mode is on.
        </p>
        <div id="menu-list">
          ${toggles.map(rowHtml).join("")}
          <div class="menu-item" style="display:flex; justify-content:space-between; align-items:center; gap:14px;">
            <span style="opacity:0.85;">Gravity warp intensity</span>
            <span style="display:flex; gap:8px; align-items:center;">
              <input id="dbg-warp-scale" type="range" min="0.25" max="4" step="0.05" value="${warpScale}" style="width:140px;">
              <span id="dbg-warp-scale-v" style="font-family:monospace; opacity:0.7; min-width:40px;">${warpScale.toFixed(2)}&times;</span>
            </span>
          </div>
          <div class="menu-item" data-action="back" style="text-align:center; margin-top:10px;">Back</div>
        </div>
      </div>`;

    overlay.querySelectorAll("[data-toggle]").forEach(el => {
      el.addEventListener("click", () => {
        const key = el.dataset.toggle;
        const next = !Debug.get(key);
        Debug.set(key, next);
        el.querySelector(".dbg-state").textContent = `[${next ? "x" : " "}]`;
      });
    });

    const warpSlider = document.getElementById("dbg-warp-scale");
    const warpLabel  = document.getElementById("dbg-warp-scale-v");
    warpSlider.oninput = () => {
      const v = parseFloat(warpSlider.value);
      Debug.set("gravityWarpScale", v);
      warpLabel.innerHTML = v.toFixed(2) + "&times;";
    };
    overlay.querySelector('.menu-item[data-action="back"]')
      .addEventListener("click", () => Game.toMenu());

    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },
});
