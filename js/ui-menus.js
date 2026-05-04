import { Audio_ } from "./audio.js";
import { KIND_META } from "./core.js";
import { CustomOptions } from "./custom-options.js";
import { Editor } from "./editor.js";
import { Game } from "./game.js";
import { Campaign, editorBar, editorHelp, hud, overlay, toast } from "./main.js";
import { Presets } from "./presets.js";
import { Stats } from "./stats.js";
import { UI } from "./ui.js";
import { World } from "./world.js";

// UI — split across multiple files (see js/ui.js for the menu
// dispatcher + shared helpers; this file holds one method group).
// Method group "menus" — extracted from ui.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(UI, {

  renderPresets() {
    Game.state = "presets";
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Audio_.init(); Audio_.resume(); Audio_.startMusic("lobby");
    let html = `<div class="panel wide">
      <h1 style="font-size:24px; letter-spacing:5px;">CUSTOM GAME</h1>
      <p style="opacity:0.65; font-size:12px; margin-bottom:14px;">
        Pick a preset configuration. Each is a different shape of challenge.
      </p>
      <div class="level-grid">`;
    for (const p of Presets.list) {
      html += `<div class="level-card" data-preset="${p.id}" style="width:200px;">
        <div class="name" style="font-size:14px; margin-bottom:4px;">${p.name}</div>
        <div style="font-size:11px; opacity:0.7; line-height:1.4;">${p.desc}</div>
      </div>`;
    }
    html += `</div>
      <div id="menu-list" style="margin-top:18px;">
        <div class="menu-item" data-action="back">Back to main menu</div>
      </div>
    </div>`;
    overlay.innerHTML = html;
    overlay.querySelectorAll(".level-card").forEach(el => {
      el.addEventListener("click", () => {
        const p = Presets.list.find(x => x.id === el.dataset.preset);
        if (p) {
          const build = () => p.build();
          Game.startLevel(build, { music: p.music || "calm", statsKey: `p${p.id}`, replay: build });
        }
      });
    });
    overlay.querySelectorAll(".menu-item").forEach(el => {
      el.addEventListener("click", () => Game.toMenu());
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  renderCampaign() {
    Game.state = "campaign";
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Audio_.init(); Audio_.resume(); Audio_.startMusic("lobby");

    const completedCount = Campaign.loadProgress().completed.length;
    const stages = Campaign.stages();
    let html = `<div class="panel wide">
      <h1 style="font-size:24px; letter-spacing:5px;">CAMPAIGN</h1>
      <div class="progress-line">${completedCount} of ${Campaign.levels.length} levels complete</div>`;

    for (const stage of stages) {
      const stageLevels = Campaign.levels.filter(l => l.stage === stage);
      html += `<div class="stage-row"><h3>${stage}</h3><div class="level-grid">`;
      for (const l of stageLevels) {
        const unlocked  = Campaign.isUnlocked(l.id);
        const completed = Campaign.isCompleted(l.id);
        const cls = ["level-card"];
        if (!unlocked) cls.push("locked");
        if (completed) cls.push("completed");
        const st = Stats.get(`c${l.id}`);
        let footer = "";
        if (unlocked && st.attempts > 0) {
          footer = `<div style="font-size:10px; opacity:0.55; margin-top:6px;">
            ${st.completions}/${st.attempts}` +
            (st.bestTime !== null ? ` · best ${st.bestTime.toFixed(1)}s` : "") +
            `</div>`;
        }
        html += `<div class="${cls.join(" ")}" data-level="${l.id}">
          <span class="num">${String(l.id).padStart(2, "0")}${completed ? '<span class="check">✓</span>' : ""}</span>
          <div class="name">${unlocked ? l.name : "—"}</div>
          ${footer}
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `<div id="menu-list" style="margin-top:18px;">
      <div class="menu-item" data-action="back">Back to main menu</div>
      <div class="menu-item" data-action="reset" style="opacity:0.4; font-size:11px;">Reset progress</div>
    </div></div>`;
    overlay.innerHTML = html;

    const navList = overlay.querySelectorAll(".level-card:not(.locked), .menu-item");
    navList.forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
    });
    overlay.querySelectorAll(".level-card").forEach(el => {
      const id = +el.dataset.level;
      if (!el.classList.contains("locked")) {
        el.addEventListener("click", () => UI.renderHint(id));
      }
    });
    overlay.querySelectorAll(".menu-item").forEach(el => {
      el.addEventListener("click", () => {
        if (el.dataset.action === "back") Game.toMenu();
        else if (el.dataset.action === "reset") {
          UI.confirm({
            title: "RESET PROGRESS",
            message: "Permanently clear all campaign completions? Levels will lock again.",
            yesLabel: "Reset",
            danger: true,
            onYes: () => Campaign.resetProgress(),
            restore: () => UI.renderCampaign()
          });
        }
      });
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  renderHint(levelId) {
    const lvl = Campaign.byId(levelId);
    if (!lvl) return;
    Game.state = "hint";
    Game.campaignLevelId = levelId;
    const st = Stats.get(`c${levelId}`);
    let statsLine = "";
    if (st.attempts > 0) {
      const parts = [
        `${st.completions} won`,
        `${st.deaths} lost`,
        st.bestTime !== null ? `best ${st.bestTime.toFixed(1)}s` : null,
        st.peakMass > 0 ? `peak mass ${st.peakMass.toFixed(0)}` : null
      ].filter(Boolean);
      statsLine = `<p style="font-size:11px; opacity:0.55; margin: 0 0 12px;">${parts.join(" · ")}</p>`;
    }
    overlay.innerHTML = `<div class="panel">
      <h2>${String(lvl.id).padStart(2,"0")}. ${lvl.name}</h2>
      <p style="margin: 8px 0 8px;">${lvl.hint}</p>
      ${statsLine}
      <div id="menu-list">
        <div class="menu-item selected" data-action="play">Begin</div>
        <div class="menu-item" data-action="back">Back to map</div>
      </div>
    </div>`;
    Game.selectedMenu = 0;
    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
      el.addEventListener("click", () => {
        if (el.dataset.action === "play") Game.startCampaignLevel(levelId);
        else UI.renderCampaign();
      });
    });
  },

  // Pre-play nameplate — shown the first time the player encounters a kind.
  renderNewKinds(kinds, onContinue) {
    const rows = kinds.map(k => {
      const m = KIND_META[k];
      return `<div style="margin: 14px 0; text-align: center;">
        <div style="display: inline-flex; align-items: center; gap: 10px; vertical-align: middle;">
          <div style="width:32px; height:32px; border-radius:50%;
            background: radial-gradient(circle at 35% 35%, hsla(${m.hue},85%,75%,1), hsla(${m.hue},85%,40%,0.5));
            box-shadow: 0 0 10px hsla(${m.hue},85%,55%,0.5);"></div>
          <div style="font-weight:500; letter-spacing:1px;">${m.label}</div>
        </div>
        <div style="font-size:11px; opacity:0.7; margin: 4px auto 0; max-width: 360px;">${m.desc}</div>
      </div>`;
    }).join("");
    overlay.innerHTML = `<div class="panel">
      <h2 style="font-size:18px; letter-spacing:3px;">${kinds.length === 1 ? "FIRST SIGHTING" : "FIRST SIGHTINGS"}</h2>
      ${rows}
      <div id="menu-list" style="margin-top:14px;">
        <div class="menu-item selected" data-action="continue">Continue</div>
      </div>
    </div>`;
    UI._newKindsOpen = true;
    const finish = () => { UI._newKindsOpen = false; onContinue(); };
    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
      el.addEventListener("click", finish);
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  renderCustomPresetList(presets) {
    let html = `<div class="panel wide">
      <h2>YOUR CUSTOM PRESETS</h2>
      <div class="level-grid">`;
    for (const p of presets) {
      const c = p.cfg.counts || {};
      const totalKinds = Object.values(c).reduce((s, r) => s + (r.max || 0), 0);
      html += `<div class="level-card" data-name="${p.name.replace(/"/g, '&quot;')}" style="width:220px;">
        <div class="name" style="font-size:14px; margin-bottom:4px;">${p.name}</div>
        <div style="font-size:11px; opacity:0.6; margin-bottom:8px;">
          ${p.cfg.type} · up to ${totalKinds} circles · ${p.cfg.victory}
        </div>
        <button class="ed-row-del" data-name="${p.name.replace(/"/g, '&quot;')}"
          style="font-size:10px; padding:2px 6px; background:rgba(120,40,40,0.5);
          border:1px solid rgba(255,140,140,0.3); color:#fdd; border-radius:4px; cursor:pointer;">
          Delete</button>
      </div>`;
    }
    html += `</div>
      <div id="menu-list" style="margin-top:18px;">
        <div class="menu-item selected" data-action="cancel">Back</div>
      </div></div>`;
    overlay.innerHTML = html;
    overlay.querySelectorAll(".level-card").forEach(el => {
      el.addEventListener("click", e => {
        if (e.target.classList.contains("ed-row-del")) return;
        const p = presets.find(x => x.name === el.dataset.name);
        if (!p) return;
        // Persist as the active config and re-render the form so the user
        // sees the loaded values (and can tweak before play).
        CustomOptions.save(CustomOptions._mergeWithDefaults(p.cfg));
        CustomOptions._lastName = p.name;
        toast(`Loaded preset "${p.name}"`);
        UI.renderOptions();
      });
    });
    overlay.querySelectorAll(".ed-row-del").forEach(el => {
      el.addEventListener("click", e => {
        e.stopPropagation();
        const name = el.dataset.name;
        UI.confirm({
          title: "DELETE PRESET",
          message: `Permanently delete preset "${name}"?`,
          yesLabel: "Delete",
          danger: true,
          onYes: () => CustomOptions.deletePresetByName(name),
          restore: () => UI.renderCustomPresetList(CustomOptions.loadPresets())
        });
      });
    });
    overlay.querySelectorAll(".menu-item").forEach(el => {
      el.addEventListener("click", () => UI.renderOptions());
    });
  },

  renderOptions() {
    Game.state = "options";
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Audio_.init(); Audio_.resume(); Audio_.startMusic("lobby");

    const cfg = CustomOptions.load();

    const kindRows = Object.entries(KIND_META).map(([k, m]) => `
      <tr>
        <td style="padding:3px 8px; opacity:0.85;">${m.label}</td>
        <td><input data-cfg="counts.${k}.min" type="number" min="0" max="500" value="${cfg.counts[k].min}" style="width:60px;"></td>
        <td style="opacity:0.4;">to</td>
        <td><input data-cfg="counts.${k}.max" type="number" min="0" max="500" value="${cfg.counts[k].max}" style="width:60px;"></td>
      </tr>`).join("");

    overlay.innerHTML = `
      <div class="panel wide" style="text-align:left;">
        <h1 style="font-size:24px; letter-spacing:5px; text-align:center;">CUSTOM GAME &mdash; OPTIONS</h1>
        <p style="opacity:0.6; font-size:11px; text-align:center; margin-bottom:14px;">
          Set ranges (min/max) for each kind. Counts are picked uniformly inside the range each play.
        </p>

        <div style="display:flex; gap:24px; flex-wrap:wrap;">

          <div style="flex:1; min-width:280px;">
            <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6;">WORLD</h3>
            <table>
              <tr><td>Type</td><td>
                <select data-cfg="type">
                  <option value="sparse"  ${cfg.type==="sparse"?"selected":""}>Sparse box</option>
                  <option value="packed"  ${cfg.type==="packed"?"selected":""}>Packed box</option>
                  <option value="gravity" ${cfg.type==="gravity"?"selected":""}>Gravity well</option>
                </select>
              </td></tr>
              <tr><td>Box width</td><td>
                <input data-cfg="boxW" type="number" min="500" max="8000" step="100" value="${cfg.boxW}" style="width:80px;"></td></tr>
              <tr><td>Box height</td><td>
                <input data-cfg="boxH" type="number" min="500" max="8000" step="100" value="${cfg.boxH}" style="width:80px;"></td></tr>
              <tr><td>Player size (r)</td><td>
                <input data-cfg="playerSize" type="number" min="6" max="80" value="${cfg.playerSize}" style="width:60px;"></td></tr>
              <tr><td>Mote size min</td><td>
                <input data-cfg="sizeMin" type="number" min="2" max="80" value="${cfg.sizeMin}" style="width:60px;"></td></tr>
              <tr><td>Mote size max</td><td>
                <input data-cfg="sizeMax" type="number" min="2" max="100" value="${cfg.sizeMax}" style="width:60px;"></td></tr>
              <tr><td>Random drift</td><td>
                <input data-cfg="randomDrift" type="checkbox" ${cfg.randomDrift?"checked":""}></td></tr>
            </table>

            <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6; margin-top:14px;">GRAVITY WELLS</h3>
            <table>
              <tr><td>Number of wells</td><td>
                <input data-cfg="wells" type="number" min="0" max="6" value="${cfg.wells}" style="width:60px;"></td></tr>
              <tr><td>Well strength</td><td>
                <input data-cfg="wellStrength" type="number" min="0" max="20000000" step="100000" value="${cfg.wellStrength}" style="width:120px;"></td></tr>
            </table>

            <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6; margin-top:14px;">VICTORY</h3>
            <table>
              <tr><td>Condition</td><td>
                <select data-cfg="victory">
                  <option value="absorb_all"     ${cfg.victory==="absorb_all"?"selected":""}>Absorb all</option>
                  <option value="become_largest" ${cfg.victory==="become_largest"?"selected":""}>Become largest</option>
                  <option value="survive"        ${cfg.victory==="survive"?"selected":""}>Survive…</option>
                </select>
              </td></tr>
              <tr><td>Survive time (s)</td><td>
                <input data-cfg="surviveTime" type="number" min="5" max="600" value="${cfg.surviveTime}" style="width:80px;"></td></tr>
            </table>

            <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6; margin-top:14px;">MUSIC</h3>
            <table>
              <tr><td>Track</td><td>
                <select data-cfg="music">
                  <option value="calm"    ${cfg.music==="calm"   ?"selected":""}>Calm</option>
                  <option value="aurora"  ${cfg.music==="aurora" ?"selected":""}>Aurora</option>
                  <option value="glacial" ${cfg.music==="glacial"?"selected":""}>Glacial</option>
                  <option value="tide"    ${cfg.music==="tide"   ?"selected":""}>Tide</option>
                  <option value="nebula"  ${cfg.music==="nebula" ?"selected":""}>Nebula</option>
                </select>
              </td></tr>
            </table>
          </div>

          <div style="flex:1; min-width:300px;">
            <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6;">CIRCLE COUNTS (MIN &mdash; MAX)</h3>
            <table>${kindRows}</table>
          </div>
        </div>

        <div id="menu-list" style="margin-top:18px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          <div class="menu-item selected" data-action="play">Build &amp; play</div>
          <div class="menu-item" data-action="save-preset">Save as preset...</div>
          <div class="menu-item" data-action="load-preset">Load preset...</div>
          <div class="menu-item" data-action="reset">Reset to defaults</div>
          <div class="menu-item" data-action="back">Cancel</div>
        </div>
      </div>`;

    // Wire inputs to update cfg + persist on change
    const setByPath = (path, val) => {
      const parts = path.split(".");
      let obj = cfg;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = val;
    };
    overlay.querySelectorAll("[data-cfg]").forEach(el => {
      const path = el.dataset.cfg;
      el.addEventListener("change", () => {
        let v;
        if (el.type === "checkbox") v = el.checked;
        else if (el.type === "number") v = +el.value;
        else v = el.value;
        setByPath(path, v);
        // For the per-kind min/max range pairs, keep the other end in sync:
        // raising min above max drags max up; lowering max below min drags min down.
        const m = path.match(/^counts\.([^.]+)\.(min|max)$/);
        if (m) {
          const kind = m[1], slot = m[2];
          const otherSlot = slot === "min" ? "max" : "min";
          const otherEl = overlay.querySelector(`[data-cfg="counts.${kind}.${otherSlot}"]`);
          if (otherEl) {
            const myVal = +el.value;
            const otherVal = +otherEl.value;
            if (slot === "min" && myVal > otherVal) {
              otherEl.value = myVal;
              cfg.counts[kind].max = myVal;
            } else if (slot === "max" && myVal < otherVal) {
              otherEl.value = myVal;
              cfg.counts[kind].min = myVal;
            }
          }
        }
        CustomOptions.save(cfg);
      });
      // Mouse wheel: scroll-up = increase / previous-option, scroll-down = the
      // reverse. Lets you sweep through values without clicking the tiny arrows.
      if (el.tagName === "INPUT" && el.type === "number") {
        el.addEventListener("wheel", e => {
          e.preventDefault();
          const step = parseFloat(el.step) || 1;
          const dir = e.deltaY < 0 ? 1 : -1;
          const min = el.min !== "" ? parseFloat(el.min) : -Infinity;
          const max = el.max !== "" ? parseFloat(el.max) : Infinity;
          const next = Math.max(min, Math.min(max, (parseFloat(el.value) || 0) + step * dir));
          if (next !== parseFloat(el.value)) {
            el.value = next;
            el.dispatchEvent(new Event("change"));
          }
        }, { passive: false });
      } else if (el.tagName === "SELECT") {
        el.addEventListener("wheel", e => {
          e.preventDefault();
          const dir = e.deltaY < 0 ? -1 : 1;
          const next = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
          if (next !== el.selectedIndex) {
            el.selectedIndex = next;
            el.dispatchEvent(new Event("change"));
          }
        }, { passive: false });
      }
    });

    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
      el.addEventListener("click", () => {
        const action = el.dataset.action;
        if (action === "play") {
          CustomOptions.save(cfg);
          const build = () => CustomOptions.build(cfg);
          Game.startLevel(build, { music: cfg.music || "calm", replay: build });
        } else if (action === "reset") {
          CustomOptions.save(JSON.parse(JSON.stringify(CustomOptions.defaults)));
          UI.renderOptions();
        } else if (action === "save-preset") {
          UI.prompt({
            title: "SAVE PRESET",
            message: "Name this preset:",
            defaultValue: CustomOptions._lastName || "My preset",
            yesLabel: "Save",
            onYes: (name) => {
              const doSave = () => {
                CustomOptions._lastName = name;
                CustomOptions.savePresetByName(name, cfg);
                toast(`Preset "${name}" saved`);
              };
              if (CustomOptions.loadPresets().some(p => p.name === name)) {
                UI.confirm({
                  title: "OVERWRITE PRESET",
                  message: `A preset named "${name}" already exists. Overwrite it?`,
                  yesLabel: "Overwrite",
                  danger: true,
                  onYes: doSave,
                  restore: () => UI.renderOptions()
                });
              } else doSave();
            },
            restore: () => UI.renderOptions()
          });
        } else if (action === "load-preset") {
          const presets = CustomOptions.loadPresets();
          if (presets.length === 0) { toast("No saved presets yet"); return; }
          UI.renderCustomPresetList(presets);
        } else {
          Game.toMenu();
        }
      });
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  // Generic design picker. forPlay=true → single-action (click to play).
  // forPlay=false → load + delete buttons per row.
  renderDesignList(designs, onPick, forPlay, onBack) {
    Game.state = "design-list";
    let html = `<div class="panel wide">
      <h2>${forPlay ? "PLAY DESIGN" : "LOAD DESIGN"}</h2>
      <div class="level-grid">`;
    for (const d of designs) {
      let info = d.info;
      if (info === undefined && d.data) {
        const wells = (d.data.gravityCenters || []).length;
        const circles = (d.data.circles || []).length;
        info = `${d.data.type || "?"} · ${circles} circles${wells ? ` · ${wells} well${wells>1?"s":""}` : ""}`;
      }
      const showDelete = d.deletable !== false;
      html += `<div class="level-card" data-name="${d.name.replace(/"/g, '&quot;')}" style="width:220px;">
        <div class="name" style="font-size:14px; margin-bottom:4px;">${d.name}</div>
        <div style="font-size:11px; opacity:0.6; margin-bottom:8px;">
          ${info || ""}
        </div>
        ${showDelete ? `<button class="ed-row-del" data-name="${d.name.replace(/"/g, '&quot;')}"
          style="display:block; margin:0 auto; font-size:10px; padding:2px 10px;
          background:rgba(120,40,40,0.5); border:1px solid rgba(255,140,140,0.3);
          color:#fdd; border-radius:4px; cursor:pointer;">
          Delete</button>` : ""}
      </div>`;
    }
    html += `</div>
      <div id="menu-list" style="margin-top:18px;">
        <div class="menu-item" data-action="cancel">Cancel</div>
      </div>
    </div>`;
    overlay.innerHTML = html;

    const back = onBack || (() => Game.toMenu());
    UI._designListBack = back;

    overlay.querySelectorAll(".level-card").forEach(el => {
      el.addEventListener("click", e => {
        if (e.target.classList.contains("ed-row-del")) return;
        onPick(el.dataset.name, "load");
      });
    });
    overlay.querySelectorAll(".ed-row-del").forEach(el => {
      el.addEventListener("click", e => {
        e.stopPropagation();
        onPick(el.dataset.name, "delete");
      });
    });
    overlay.querySelectorAll(".menu-item").forEach(el => {
      el.addEventListener("click", back);
    });

    // Hover updates the keyboard/gamepad selection so mouse and pad agree.
    const navList = overlay.querySelectorAll(".level-card, .ed-row-del, .menu-item");
    navList.forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  renderEnd(win) {
    const inCampaign = Game.campaignLevelId != null;
    const lvl = inCampaign ? Campaign.byId(Game.campaignLevelId) : null;

    const WIN_MESSAGES = {
      absorb_all:           { title: "Absorbed all life.",      sub: "The basin is still." },
      become_largest_alone: { title: "Largest by elimination.", sub: "No rival remains to measure against. Size is just memory now." },
      become_largest_apex:  { title: "Apex of mind.",           sub: "The thinking mass has consolidated, and you sit at its peak." },
      survive:              { title: "You endured.",            sub: "What does not change becomes the measure of all that does." },
      pacify:               { title: "All minds quieted.",      sub: "What thought there was has ended. Only drift remains." },
    };
    let title, sub;
    if (win && inCampaign) {
      title = `${lvl.name} — complete`;
      sub   = (WIN_MESSAGES[World.winReason] || { sub: "Lesson absorbed." }).sub;
    } else if (win) {
      const m = WIN_MESSAGES[World.winReason] || { title: "Victory.", sub: "The basin holds you in its quiet." };
      title = m.title; sub = m.sub;
    } else {
      title = "You were absorbed.";
      sub   = "The greater drifts on.";
    }

    let buttons = "";
    // Designer testing path: any end → offer return-to-designer.
    if (Editor.testStash) {
      buttons += `<div class="menu-item selected" data-action="back-to-design">Return to designer</div>`;
      buttons += `<div class="menu-item" data-action="again">Play again</div>`;
      buttons += `<div class="menu-item" data-action="menu">Main menu</div>`;
    } else if (win && inCampaign) {
      const branches = lvl.branches;
      if (branches.length === 0) {
        buttons += `<div class="menu-item selected" data-action="map">Return to campaign map</div>`;
      } else if (branches.length === 1) {
        const next = Campaign.byId(branches[0]);
        buttons += `<div class="menu-item selected" data-action="next-${branches[0]}">Next: ${next.name}</div>`;
        buttons += `<div class="menu-item" data-action="map">Campaign map</div>`;
      } else {
        // Branch point: offer both
        let first = true;
        for (const bid of branches) {
          const b = Campaign.byId(bid);
          buttons += `<div class="menu-item ${first ? "selected" : ""}" data-action="next-${bid}">
            Path: ${b.stage} &mdash; ${b.name}
          </div>`;
          first = false;
        }
        buttons += `<div class="menu-item" data-action="map">Campaign map</div>`;
      }
    } else if (inCampaign) {
      buttons += `<div class="menu-item selected" data-action="again">Try again</div>`;
      buttons += `<div class="menu-item" data-action="map">Campaign map</div>`;
    } else {
      const againLabel = Game._reroll ? "Try again — same map" : "Try again";
      buttons += `<div class="menu-item selected" data-action="again">${againLabel}</div>`;
      if (Game._reroll) {
        buttons += `<div class="menu-item" data-action="reroll">Try again — new map</div>`;
      }
      buttons += `<div class="menu-item" data-action="menu">Return to menu</div>`;
    }

    overlay.innerHTML = `
      <div class="panel">
        <h2>${title}</h2>
        <p style="opacity:0.8">${sub}</p>
        <div id="menu-list" style="margin-top:18px;">${buttons}</div>
      </div>`;

    Game.selectedMenu = 0;
    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
      el.addEventListener("click", () => {
        const action = el.dataset.action;
        if (action.startsWith("next-")) {
          const nextId = +action.slice(5);
          UI.renderHint(nextId);
        } else if (action === "again") {
          UI.replayCurrent();
        } else if (action === "reroll") {
          if (Game._reroll) Game._reroll();
        } else if (action === "map") {
          UI.renderCampaign();
        } else if (action === "back-to-design") {
          Editor.returnFromTest();
        } else {
          Game.toMenu();
        }
      });
    });
  },
});
