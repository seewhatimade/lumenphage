import { LEVEL_TYPES, VICTORY_CONDITIONS } from "./core.js";
import { ColorPalette } from "./color-palette.js";
import { Editor } from "./editor.js";
import { Game } from "./game.js";
import { overlay, syncInputEdges, toast } from "./main.js";
import { Shape } from "./shape.js";
import { UI } from "./ui.js";
import { World } from "./world.js";

// Level Settings — modal form for the level designer's level-wide
// metadata (Type, bounds, colors / theme, victory, drift, wells).
// These rarely change once a level is set up, so they were lifted
// off the editor bar to keep the bar focused on per-action authoring
// controls. Reached via the "⚙ Level…" button on the bar.

Object.assign(UI, {
  _levelSettingsOpen: false,
  // Set true by openLevelSettings while a child modal (UI.prompt /
  // UI.confirm) is in flight, so the parent restore() doesn't repaint
  // and clobber the child's panel before the user has finished with it.
  _levelSettingsChild: false,

  openLevelSettings() {
    if (UI._levelSettingsOpen) return;
    UI._levelSettingsOpen = true;
    UI._levelSettingsPrev = Game.state;
    Game.state = "confirm";
    syncInputEdges();
    UI._renderLevelSettings();
  },

  _closeLevelSettings() {
    if (!UI._levelSettingsOpen) return;
    UI._levelSettingsOpen = false;
    overlay.innerHTML = "";
    Game.state = UI._levelSettingsPrev || "designer";
    UI._levelSettingsPrev = null;
    // Bar may need to refresh — Type / Wells changes affect Row 2 and
    // tool-aware visibility derived from Editor state.
    Editor.renderBar();
  },

  _renderLevelSettings() {
    const isPacked = Editor.selectedType === LEVEL_TYPES.PACKED;
    const isSurvive = Editor.victoryCondition === VICTORY_CONDITIONS.SURVIVE;
    const userPalettes = ColorPalette.loadUser();
    const sel = Editor._appliedPalette || "";
    const escAttr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const escTxt  = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const opts = (group, list, prefix) => list.length
      ? `<optgroup label="${group}">${list.map(p => {
          const v = `${prefix}:${p.name}`;
          return `<option value="${escAttr(v)}"${v === sel ? " selected" : ""}>${escTxt(p.name)}</option>`;
        }).join("")}</optgroup>` : "";
    const isUserSel = sel.startsWith("user:");

    overlay.innerHTML = `
      <div class="panel ls-panel">
        <h2>LEVEL SETTINGS</h2>

        <div class="ls-section">World</div>
        <div class="ls-row">
          <label class="ls-label">Type</label>
          <div class="ls-ctrl">
            <select id="ls-type">
              <option value="sparse">Sparse box</option>
              <option value="packed">Packed box</option>
              <option value="gravity">Gravity well</option>
            </select>
            ${isPacked ? `<button id="ls-randomize">Randomize placement</button>` : ""}
          </div>
        </div>
        <div class="ls-row">
          <label class="ls-label">Bounds</label>
          <div class="ls-ctrl">
            w <input id="ls-bw" type="number" min="400" max="12000" value="${World.bounds.w}" style="width:72px;">
            h <input id="ls-bh" type="number" min="400" max="12000" value="${World.bounds.h}" style="width:72px;">
            <span class="ls-hint">px · clamped 400–12000</span>
          </div>
        </div>

        <div class="ls-section">Look</div>
        <div class="ls-row">
          <label class="ls-label">Colors</label>
          <div class="ls-ctrl">
            in <input id="ls-color-in"   type="color" value="${World.insideColor}">
            out <input id="ls-color-out"  type="color" value="${World.outsideColor}">
            edge <input id="ls-color-edge" type="color" value="${World.edgeColor}">
          </div>
        </div>
        <div class="ls-row">
          <label class="ls-label">Theme</label>
          <div class="ls-ctrl">
            <select id="ls-color-preset" style="flex:1; min-width:140px;">
              <option value="" ${sel ? "" : "selected"}>—</option>
              ${opts("Built-in", ColorPalette.BUILTINS, "builtin")}
              ${opts("Saved", userPalettes, "user")}
            </select>
            <button id="ls-color-save">Save palette…</button>
            <button id="ls-color-del" ${isUserSel ? "" : "disabled"}>Delete</button>
          </div>
        </div>

        <div class="ls-section">Rules</div>
        <div class="ls-row">
          <label class="ls-label">Random drift</label>
          <div class="ls-ctrl">
            <input id="ls-velocity" type="checkbox" ${Editor.randomVelocity ? "checked" : ""}>
            <span class="ls-hint">small random velocity per non-player at start</span>
          </div>
        </div>
        <div class="ls-row">
          <label class="ls-label">Victory</label>
          <div class="ls-ctrl">
            <select id="ls-victory">
              <option value="absorb_all">Absorb all</option>
              <option value="become_largest">Become largest</option>
              <option value="survive">Survive…</option>
              <option value="pacify">Pacify minds</option>
            </select>
            ${isSurvive ? `<label>Time <input id="ls-victory-param" type="number" min="5" max="600" value="${Editor.victoryParam}" style="width:60px;">s</label>` : ""}
          </div>
        </div>

        <div class="ls-footer">
          <div class="menu-item ls-done" data-action="no" id="ls-done">Done</div>
        </div>
      </div>
    `;
    UI._wireLevelSettings();
    // Single menu item; selectedMenu = 0 highlights the Done button so
    // ESC / B / SELECT (which click the data-action="no" element) and
    // Enter / A (which click the selected menu item) both close.
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  _wireLevelSettings() {
    const $ = id => document.getElementById(id);

    $("ls-type").value = Editor.selectedType;
    $("ls-type").onchange = e => {
      Editor.selectedType = e.target.value;
      World.type = e.target.value;
      if (e.target.value === LEVEL_TYPES.GRAVITY && World.gravityCenters.length === 0) {
        World.gravityCenters = [{ x: World.bounds.w / 2, y: World.bounds.h / 2, strength: 2_000_000 }];
      }
      UI._renderLevelSettings();
    };
    if ($("ls-randomize")) $("ls-randomize").onclick = () => Editor.randomize();

    const wireBound = (id, prop) => {
      const el = $(id);
      if (!el) return;
      el.onchange = e => {
        let v = Math.max(400, Math.min(12000, +e.target.value || 400));
        if (Editor.snap) v = Math.max(Editor.snap, Math.round(v / Editor.snap) * Editor.snap);
        if (v === World.bounds[prop]) { e.target.value = v; return; }
        Editor.pushHistory();
        if (Array.isArray(World.shape) && World.shape.length) {
          const idx = World.shape.findIndex(p => p.type === "rect" && p.sign === "+");
          if (idx >= 0) {
            World.shape[idx][prop] = v;
            Shape.invalidate(World.shape);
            Editor._syncBoundsToShape();
          } else {
            World.bounds[prop] = v;
          }
        } else {
          World.bounds[prop] = v;
        }
        Editor.dirty = true;
        e.target.value = World.bounds[prop];
      };
    };
    wireBound("ls-bw", "w");
    wireBound("ls-bh", "h");

    const detachPalette = () => {
      if (Editor._appliedPalette) {
        Editor._appliedPalette = null;
        const sel = $("ls-color-preset");
        if (sel) sel.value = "";
        const del = $("ls-color-del");
        if (del) del.disabled = true;
      }
    };
    $("ls-color-in").oninput   = e => { World.insideColor  = e.target.value; Editor.dirty = true; detachPalette(); };
    $("ls-color-out").oninput  = e => { World.outsideColor = e.target.value; Editor.dirty = true; detachPalette(); };
    $("ls-color-edge").oninput = e => { World.edgeColor    = e.target.value; Editor.dirty = true; detachPalette(); };

    $("ls-color-preset").onchange = e => {
      const v = e.target.value;
      if (!v) { Editor._appliedPalette = null; UI._renderLevelSettings(); return; }
      const i = v.indexOf(":");
      const src = v.slice(0, i), name = v.slice(i + 1);
      const list = src === "builtin" ? ColorPalette.BUILTINS : ColorPalette.loadUser();
      const pal = list.find(p => p.name === name);
      if (!pal) { e.target.value = ""; return; }
      ColorPalette.apply(pal);
      Editor._appliedPalette = v;
      Editor.dirty = true;
      UI._renderLevelSettings();
    };

    // Palette save flow nests UI.prompt → UI.confirm. Each child modal
    // overwrites `overlay.innerHTML`, so after they close we must
    // re-render this panel. The `_levelSettingsChild` flag lets the
    // parent restore() skip its repaint while a child is still active.
    $("ls-color-save").onclick = () => {
      const suggest = Editor._appliedPalette && Editor._appliedPalette.startsWith("user:")
        ? Editor._appliedPalette.slice(5) : "";
      UI._levelSettingsChild = true;
      UI.prompt({
        title: "SAVE PALETTE",
        message: "Name this palette:",
        defaultValue: suggest,
        yesLabel: "Save",
        onYes: (rawName) => {
          const name = (rawName || "").trim();
          if (!name) return;
          if (ColorPalette.isBuiltin(name)) {
            toast(`"${name}" is a built-in name`);
            return;
          }
          const arr = ColorPalette.loadUser();
          const idx = arr.findIndex(p => p.name === name);
          const entry = {
            name,
            inside:  World.insideColor,
            outside: World.outsideColor,
            edge:    World.edgeColor,
          };
          const write = () => {
            if (idx >= 0) arr[idx] = entry; else arr.push(entry);
            ColorPalette.saveUser(arr);
            Editor._appliedPalette = `user:${name}`;
            toast(`Saved palette "${name}"`);
          };
          if (idx >= 0) {
            // Already child = true; confirm.restore() resets it.
            UI.confirm({
              title: "OVERWRITE PALETTE",
              message: `A palette named "${name}" already exists. Overwrite it?`,
              yesLabel: "Overwrite", danger: true,
              onYes: write,
              restore: () => {
                UI._levelSettingsChild = false;
                if (UI._levelSettingsOpen) UI._renderLevelSettings();
              },
            });
          } else {
            write();
          }
        },
        restore: () => {
          if (UI._levelSettingsChild) return;       // a deeper modal will paint over us
          if (UI._levelSettingsOpen) UI._renderLevelSettings();
        },
      });
    };

    $("ls-color-del").onclick = () => {
      const sel = Editor._appliedPalette;
      if (!sel || !sel.startsWith("user:")) return;
      const name = sel.slice(5);
      UI._levelSettingsChild = true;
      UI.confirm({
        title: "DELETE PALETTE",
        message: `Permanently delete saved palette "${name}"?`,
        yesLabel: "Delete", danger: true,
        onYes: () => {
          const arr = ColorPalette.loadUser().filter(p => p.name !== name);
          ColorPalette.saveUser(arr);
          Editor._appliedPalette = null;
          toast(`Deleted "${name}"`);
        },
        restore: () => {
          UI._levelSettingsChild = false;
          if (UI._levelSettingsOpen) UI._renderLevelSettings();
        },
      });
    };

    $("ls-velocity").onchange = e => Editor.randomVelocity = e.target.checked;

    $("ls-victory").value = Editor.victoryCondition;
    $("ls-victory").onchange = e => {
      Editor.victoryCondition = e.target.value;
      UI._renderLevelSettings();
    };
    if ($("ls-victory-param")) {
      $("ls-victory-param").oninput = e => Editor.victoryParam = Math.max(5, +e.target.value || 60);
    }

    $("ls-done").onclick = () => UI._closeLevelSettings();
  },
});
