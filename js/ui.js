import { KIND_META, LEVEL_TYPES, VICTORY_CONDITIONS } from "./core.js";
import { Editor } from "./editor.js";
import { Game } from "./game.js";
import { Levels } from "./levels.js";
import { Campaign, MUSIC_TRACKS, editorBar, editorHelp, hud, hudL, hudR, overlay, toast } from "./main.js";
import { Player } from "./player.js";
import { Presets } from "./presets.js";
import { World } from "./world.js";

// UI — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

export const UI = {

  clearOverlay() { overlay.innerHTML = ""; },

  renderMenu() {
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    const completed = Campaign.loadProgress().completed.length;
    const totalLevels = Campaign.levels.length;
    const dev = Campaign.devModeEnabled();
    overlay.innerHTML = `
      <div class="panel" style="min-width: 460px;">
        <h1>LUMENPHAGE</h1>
        <h2>bioluminescent drift</h2>
        <p style="margin-bottom:14px; opacity:0.65; font-size:13px;">
          A solitary cell in dark water. Eat what is smaller than you. Avoid what is greater.
        </p>
        <div id="menu-list">

          <div class="menu-item primary" data-action="campaign" title="A 30-level branching tutorial → endgame progression">
            <span class="dot" style="--hue:180;"></span>CAMPAIGN
            <div class="progress">${completed} / ${totalLevels} levels complete</div>
          </div>

          <div class="menu-section">Quick play</div>
          <div class="menu-grid">
            <div class="menu-item" data-action="sparse" title="Open arena, scattered prey, occasional predators">
              <span class="dot" style="--hue:200;"></span>Drift
              <span class="sub">sparse box</span>
            </div>
            <div class="menu-item" data-action="packed" title="A packed grid you carve through">
              <span class="dot" style="--hue:30;"></span>Hatch
              <span class="sub">packed cluster</span>
            </div>
            <div class="menu-item" data-action="gravity" title="Concentric orbital rings around a central well">
              <span class="dot" style="--hue:270;"></span>Whirlpool
              <span class="sub">gravity well</span>
            </div>
            <div class="menu-item" data-action="random" title="Picks one of the three modes at random">
              <span class="dot" style="--hue:50;"></span>Random
              <span class="sub">surprise me</span>
            </div>
          </div>

          <div class="menu-section">Custom &amp; workshop</div>
          <div class="menu-grid">
            <div class="menu-item" data-action="presets" title="Curated configurations like Petri Dish, Twin Stars, Gladiator">
              <span class="dot" style="--hue:130;"></span>Preset game
            </div>
            <div class="menu-item" data-action="options" title="Configure every parameter yourself">
              <span class="dot" style="--hue:300;"></span>Custom game
            </div>
            <div class="menu-item" data-action="custom" title="Play any level you saved from the editor">
              <span class="dot" style="--hue:340;"></span>Player designed level
            </div>
            <div class="menu-item" data-action="design" title="Open the level editor">
              <span class="dot" style="--hue:60;"></span>Design a level…
            </div>
            <div class="menu-item" data-action="kinds" title="Author your own kinds with custom name, color, and (later) AI rules">
              <span class="dot" style="--hue:160;"></span>Design a kind…
            </div>
          </div>

          <div class="menu-section">System</div>
          <div class="menu-item" data-action="settings" style="text-align:center;" title="Audio, visuals, and control bindings">
            Settings…
          </div>

          <div class="menu-footer">
            <div class="menu-item footer-link" data-action="dev" title="Unlock all campaign levels">Dev mode: ${dev ? "ON" : "OFF"}</div>
            ${dev ? `<div class="menu-item footer-link" data-action="debug" title="Inspection toggles">Debug…</div>` : ""}
          </div>
        </div>

        <details class="controls-help">
          <summary>▾ Controls reference</summary>
          <table>
            <thead>
              <tr style="opacity:0.55; font-size:10px; letter-spacing:2px; text-transform:uppercase;">
                <th style="text-align:right; padding:0 12px 4px 0;">Action</th>
                <th style="text-align:left;  padding:0 16px 4px 0;">Gamepad</th>
                <th style="text-align:left;  padding:0 0 4px 0;">Keyboard</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style="text-align:right; padding:2px 12px 2px 0; opacity:0.7;">Aim</td>
                  <td style="text-align:left;  padding:2px 16px 2px 0; white-space:nowrap;"><kbd>D-pad &larr; &rarr; &uarr; &darr;</kbd></td>
                  <td style="text-align:left;  white-space:nowrap;"><kbd>&larr; &rarr; &uarr; &darr;</kbd></td></tr>
              <tr><td style="text-align:right; padding:2px 12px 2px 0; opacity:0.7;">Thrust</td>
                  <td style="text-align:left;  padding:2px 16px 2px 0; white-space:nowrap;"><kbd>A</kbd></td>
                  <td style="text-align:left;  white-space:nowrap;"><kbd>Space</kbd></td></tr>
              <tr><td style="text-align:right; padding:2px 12px 2px 0; opacity:0.7;">Boost</td>
                  <td style="text-align:left;  padding:2px 16px 2px 0; white-space:nowrap;"><kbd>B</kbd></td>
                  <td style="text-align:left;  white-space:nowrap;"><kbd>Z</kbd></td></tr>
              <tr><td style="text-align:right; padding:2px 12px 2px 0; opacity:0.7;">Pause</td>
                  <td style="text-align:left;  padding:2px 16px 2px 0; white-space:nowrap;"><kbd>START</kbd></td>
                  <td style="text-align:left;  white-space:nowrap;"><kbd>P</kbd></td></tr>
              <tr><td style="text-align:right; padding:2px 12px 2px 0; opacity:0.7;">Menu</td>
                  <td style="text-align:left;  padding:2px 16px 2px 0; white-space:nowrap;"><kbd>SELECT</kbd></td>
                  <td style="text-align:left;  white-space:nowrap;"><kbd>Esc</kbd></td></tr>
            </tbody>
          </table>
        </details>
      </div>`;
    const list = overlay.querySelectorAll(".menu-item");
    list.forEach((el, i) => {
      el.addEventListener("click", () => UI.menuActivate(el.dataset.action));
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  refreshSelected() {
    const list = UI._navItems();
    list.forEach((el, i) => el.classList.toggle("selected", i === Game.selectedMenu));
    const sel = list[Game.selectedMenu];
    if (!sel) return;
    if (sel.scrollIntoView) sel.scrollIntoView({ block: "nearest", inline: "nearest" });
    // For form-style dialogs (settings / options) put native focus on the
    // highlighted control so its focus ring shows and L/R/A act on it.
    // Divs (.menu-item) aren't focusable, so blur the previous element to
    // avoid two visual highlights — only the .selected class shows then.
    const usesForm = Game.state === "settings" || Game.state === "options";
    if (usesForm) {
      const prev = document.activeElement;
      if (prev && prev !== sel && prev !== document.body) prev.blur();
      if (sel.focus) sel.focus();
    }
  },  menuActivate(action) {
    if (action === "campaign") return UI.renderCampaign();
    if (action === "random") {
      const tracks = MUSIC_TRACKS;
      const pickMusic = () => tracks[Math.floor(Math.random() * tracks.length)];
      // Shared across replays and rerolls. `spec` null means "roll fresh
      // next build"; non-null means "rebuild that exact map".
      let spec = null;
      let music = pickMusic();
      const build = () => { spec = Presets.random(spec); };
      const reroll = () => {
        spec = null; music = pickMusic();
        Game.startLevel(build, { music, replay: build, reroll });
      };
      return Game.startLevel(build, { music, replay: build, reroll });
    }
    if (action === "presets")  return UI.renderPresets();
    if (action === "options")  return UI.renderOptions();
    if (action === "sparse")  return Game.startLevel(() => Levels.sparse(Date.now()),  { music: "calm" });
    if (action === "packed")  return Game.startLevel(() => Levels.packed(Date.now()),  { music: "aurora" });
    if (action === "gravity") return Game.startLevel(() => Levels.gravity(Date.now()), { music: "nebula" });
    if (action === "custom")  return Editor.loadAndPlay();
    if (action === "design")  return Editor.open();
    if (action === "kinds")   return UI.renderKinds();
    if (action === "dev") {
      Campaign.setDevMode(!Campaign.devModeEnabled());
      toast(`Dev mode ${Campaign.devModeEnabled() ? "ON" : "OFF"}`);
      UI.renderMenu();
      // Re-render reset selection to the top; restore focus on the dev
      // toggle so the user can toggle back or move down to Debug.
      const items = overlay.querySelectorAll(".menu-item");
      const idx = Array.from(items).findIndex(el => el.dataset.action === "dev");
      if (idx >= 0) {
        Game.selectedMenu = idx;
        UI.refreshSelected();
      }
      return;
    }
    if (action === "debug") return UI.renderDebug();
    if (action === "settings") return UI.renderSettings();
  },  // Single source of truth for what's navigable in the current dialog.
  // Card-style states include level cards. Form states include the bare
  // form controls so the controller can land on a slider / select / button
  // directly. Everything else is just .menu-item rows.
  _navItems() {
    const usesCards = Game.state === "campaign" || Game.state === "presets" ||
                      Game.state === "design-list";
    const usesForm  = Game.state === "settings" || Game.state === "options" ||
                      Game.state === "kinds"    || Game.state === "kinds-edit";
    if (usesCards) return overlay.querySelectorAll(".level-card:not(.locked), .ed-row-del, .menu-item");
    if (usesForm)  return overlay.querySelectorAll(
      "select, input:not([type='hidden']), textarea, button, .menu-item"
    );
    return overlay.querySelectorAll(".menu-item");
  },

  renderPause() {
    const back = Editor.testStash ? "designer" : "menu";
    overlay.innerHTML = `
      <div class="panel">
        <h2>PAUSED</h2>
        <p>Press <kbd>START</kbd> / <kbd>P</kbd> to resume.</p>
        <p>Press <kbd>SELECT</kbd> / <kbd>Esc</kbd> to return to ${back}.</p>
      </div>`;
  },

  replayCurrent() {
    if (Game.campaignLevelId != null) {
      return UI.renderHint(Game.campaignLevelId);
    }
    // Designer test session: re-run from the stash so "Return to designer"
    // stays available on the next win/lose screen.
    if (Editor.testStash) {
      return Editor.replayTest();
    }
    const design = Editor._lastPlayedDesign;
    if (design) {
      return Editor._launchDesign(design.name, design.data);
    }
    if (Game._replay) {
      const replay = Game._replay;
      return Game.startLevel(replay, {
        music: Game._replayMusic, replay, reroll: Game._reroll
      });
    }
    const t = World.type;
    if (t === LEVEL_TYPES.SPARSE)   return Game.startLevel(() => Levels.sparse(Date.now()));
    if (t === LEVEL_TYPES.PACKED)   return Game.startLevel(() => Levels.packed(Date.now()));
    if (t === LEVEL_TYPES.GRAVITY)  return Game.startLevel(() => Levels.gravity(Date.now()));
  },

  updateHUD() {
    if (!World.player) return;
    const enemies = World.circles.filter(c => c !== World.player && c.alive && c.kind !== "mote").length;
    hudL.textContent = `${World.levelName}`;
    let goal = `left: ${enemies}`;
    if (World.victoryCondition === VICTORY_CONDITIONS.SURVIVE) {
      const remain = Math.max(0, World.victoryParam - World.time);
      goal = `survive: ${remain.toFixed(1)}s`;
    } else if (World.victoryCondition === VICTORY_CONDITIONS.BECOME_LARGEST) {
      let maxOther = 0, mindMass = 0, totalMass = 0;
      for (const c of World.circles) {
        if (!c.alive) continue;
        totalMass += c.mass;
        if (c === World.player) {
          mindMass += c.mass;
        } else {
          if (c.kind !== "mote" && c.mass > maxOther) maxOther = c.mass;
          if (KIND_META[c.kind] && KIND_META[c.kind].hasMind) mindMass += c.mass;
        }
      }
      const share = totalMass > 0 ? (mindMass / totalMass * 100) : 0;
      goal = `largest rival: ${maxOther.toFixed(0)}   mind share: ${share.toFixed(0)}%`;
    } else if (World.victoryCondition === VICTORY_CONDITIONS.PACIFY) {
      const minds = World.circles.filter(c =>
        c !== World.player && c.alive &&
        KIND_META[c.kind] && KIND_META[c.kind].hasMind).length;
      goal = `minds: ${minds}`;
    }
    let inv = "";
    if (Player.inventory && Player.inventory.length > 0) {
      const icons = Player.inventory.map(e => {
        const slot = (e && typeof e === "object") ? e.slot : e;
        return slot === "attract" ? "◀▶" : "▶◀";
      }).join(" ");
      inv = `   ${icons}`;
    }
    hudR.textContent = `mass: ${World.player.mass.toFixed(0)}   ${goal}${inv}`;
  },
};
