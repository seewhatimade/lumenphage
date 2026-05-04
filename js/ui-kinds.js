import { Audio_ } from "./audio.js";
import { KIND_META } from "./core.js";
import { Editor } from "./editor.js";
import { Game } from "./game.js";
import { KIND_BUILTINS } from "./kind-builtins.js";
import { Kinds } from "./kinds.js";
import { ABILITY_LIBRARY, BUILTIN_INSPECTION, RULE_LIBRARY, createTagChipInput, editorBar, editorHelp, hud, kindAICost, kindAICostBucket, overlay, toast } from "./main.js";
import { UI } from "./ui.js";

// UI — split across multiple files (see js/ui.js for the menu
// dispatcher + shared helpers; this file holds one method group).
// Method group "kinds" — extracted from ui.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(UI, {


  // ----- Kind designer (Phase 1) ------------------------------------
  // Library browser for user-authored kinds. Phase 1 is drift-only — no
  // rules editor yet, just CRUD + JSON import/export so the data model and
  // the rest of the engine can be exercised end-to-end.
  renderKinds() {
    Game.state = "kinds";
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Audio_.init(); Audio_.resume(); Audio_.startMusic("lobby");
    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const userKinds = Kinds.userKinds();
    const builtins  = Kinds.builtinKinds();
    const cap       = Kinds.getCap();
    const overCap   = userKinds.length >= cap;

    const swatch = (hue, sz=14) =>
      `<span style="display:inline-block; width:${sz}px; height:${sz}px; border-radius:50%;
        background:hsl(${hue},80%,55%); box-shadow:0 0 6px hsl(${hue},80%,55%);
        vertical-align:middle; flex:none;"></span>`;

    const presetLabel = k => {
      const m = k.movement;
      if (!m || m.type !== "active") return "drift";
      const p = (m.active && m.active.preset) || "drift";
      return p;
    };
    const costBadge = k => {
      const b = kindAICostBucket(kindAICost(k));
      if (b.label === "none") return "";
      return `<span style="display:inline-block; padding:0 5px; margin-left:4px; border-radius:6px;
        font-size:8px; letter-spacing:1px; vertical-align:middle;
        background:hsla(${b.hue},80%,40%,0.25); color:hsl(${b.hue},80%,75%);
        border:1px solid hsla(${b.hue},80%,55%,0.35);">AI ${b.label}</span>`;
    };
    // Tag chips. Each tag pill carries the literal tag in data-tag so a
    // click drops it into the search box for one-click filtering.
    const tagChips = (tags) => {
      if (!Array.isArray(tags) || tags.length === 0) return "";
      return tags.map(t => `<span class="kind-tag" data-tag="${esc(t)}"
        style="font-size:9px; padding:1px 6px; margin:0 3px 0 0; border-radius:8px;
        background:rgba(120,200,255,0.15); border:1px solid rgba(120,200,255,0.3);
        color:#cfe7ff; cursor:pointer;" title="Click to filter by this tag">${esc(t)}</span>`).join("");
    };
    const searchKey = (k) => {
      // Concatenated lowercase haystack used by the search filter.
      const tags = (k.tags || []).join(" ");
      return [k.name, k.description, tags, k.id].filter(Boolean).join(" ").toLowerCase();
    };

    const userRows = userKinds.length === 0
      ? `<div style="opacity:0.6; padding:14px 8px; text-align:center; font-size:12px;">
           No custom kinds yet. Click <b>+ New kind</b> or <b>Import…</b> to add one.
         </div>`
      : userKinds.map(k => `
        <div class="kind-row" data-search="${esc(searchKey(k))}" style="display:flex; align-items:center; gap:8px;
           padding:6px 8px; border:1px solid rgba(255,255,255,0.08); border-radius:6px; margin-bottom:5px;">
          ${swatch(k.hue)}
          <div style="flex:1; min-width:0;">
            <div style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${esc(k.name)}
              <span style="font-size:9px; opacity:0.5; letter-spacing:1px; text-transform:uppercase; margin-left:4px;">
                · ${presetLabel(k)}
              </span>
              ${costBadge(k)}
            </div>
            <div style="font-size:10px; opacity:0.55; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${esc(k.description) || "<i>(no description)</i>"}
            </div>
            ${(k.tags && k.tags.length) ? `<div style="margin-top:3px;">${tagChips(k.tags)}</div>` : ""}
          </div>
          <button data-act="edit"   data-id="${esc(k.id)}" style="font-size:10px; padding:3px 8px;">Edit</button>
          <button data-act="dup"    data-id="${esc(k.id)}" style="font-size:10px; padding:3px 8px;">Duplicate</button>
          <button data-act="export" data-id="${esc(k.id)}" style="font-size:10px; padding:3px 8px;">Export</button>
          <button data-act="delete" data-id="${esc(k.id)}" style="font-size:10px; padding:3px 8px;
            background:rgba(120,40,40,0.5); border:1px solid rgba(255,140,140,0.3); color:#fdd;">Delete</button>
        </div>`).join("");

    const builtinRows = builtins.map(k => {
      const hasInspect = !!BUILTIN_INSPECTION[k.id];
      return `
      <div class="kind-row" data-search="${esc((k.label + " " + (k.desc || "") + " " + k.id).toLowerCase())}"
         style="display:flex; align-items:center; gap:8px;
         padding:5px 8px; border:1px solid rgba(255,255,255,0.05); border-radius:6px; margin-bottom:4px; opacity:0.85;">
        ${swatch(k.hue, 12)}
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(k.label)}</div>
          <div style="font-size:10px; opacity:0.5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(k.desc)}</div>
        </div>
        ${hasInspect ? `<button data-act="inspect-builtin" data-id="${esc(k.id)}"
          style="font-size:10px; padding:3px 8px;"
          title="Read-only details and sample tests">Inspect</button>` : ""}
        <button data-act="dup-builtin" data-id="${esc(k.id)}" style="font-size:10px; padding:3px 8px;"
          title="Copy this built-in's name/colour into a new editable user kind">Fork</button>
      </div>`;
    }).join("");

    overlay.innerHTML = `
      <div class="panel wide" style="text-align:left; max-width:920px;">
        <h1 style="font-size:24px; letter-spacing:5px; text-align:center;">DESIGN A KIND</h1>
        <p style="opacity:0.6; font-size:11px; text-align:center; margin-bottom:14px;">
          Author your own kinds. <b>Phase 3:</b> presets (Drift, Hunt, Flee) plus a full custom rule
          editor with kind / mass / distance filters, target picks, and movement actions.
        </p>

        <div style="display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap;">
          <button id="kinds-new"    style="padding:6px 12px;">+ New kind</button>
          <button id="kinds-import" style="padding:6px 12px;">Import file…</button>
          <span class="search-clear-wrap" id="kinds-search-wrap">
            <input id="kinds-search" type="text" placeholder="Search by name or tag…"
                   style="padding:5px 8px;
                   background:rgba(20,40,60,0.6); color:#d8efff;
                   border:1px solid rgba(120,200,255,0.3); border-radius:4px;">
            <button id="kinds-search-clear" class="search-clear-btn" type="button"
                    aria-label="Clear search" title="Clear search">×</button>
          </span>
          <label style="font-size:11px; opacity:0.75;">Soft cap
            <input id="kinds-cap" type="number" min="1" max="500" value="${cap}" style="width:60px; margin-left:4px;">
          </label>
          <span style="font-size:11px; opacity:${overCap ? "1" : "0.55"}; color:${overCap ? "#ffb38a" : "inherit"};">
            ${userKinds.length} / ${cap}${overCap ? " — over cap" : ""}
          </span>
        </div>

        <div style="display:flex; gap:18px; flex-wrap:wrap;">
          <div style="flex:1; min-width:340px;">
            <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6;">YOUR KINDS</h3>
            ${userRows}
          </div>
          <div style="flex:1; min-width:300px;">
            <h3 style="font-size:13px; letter-spacing:2px; opacity:0.6;">BUILT-IN <span style="opacity:0.5; font-size:10px;">(read-only — fork to edit)</span></h3>
            ${builtinRows}
          </div>
        </div>

        <div id="menu-list" style="margin-top:18px;">
          <div class="menu-item selected" data-action="back">Back to main menu</div>
        </div>
      </div>`;

    $("kinds-new").addEventListener("click", () => UI.renderKindEditor(null));
    $("kinds-import").addEventListener("click", () => {
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
            const k = Kinds.importSingle(parsed);
            toast(`Imported "${k.name}"`);
            UI.renderKinds();
          } catch (e) { toast("Import failed: " + e.message); }
        };
        reader.readAsText(file);
      };
      input.click();
    });
    $("kinds-cap").addEventListener("change", e => {
      Kinds.setCap(e.target.value);
      UI.renderKinds();
    });

    // Search filter — hides any kind row whose searchable text doesn't
    // contain the (lowercased) query. Tag chips drop into the search box
    // when clicked.
    const searchWrap = $("kinds-search-wrap");
    const applySearch = (q) => {
      const query = (q || "").toLowerCase().trim();
      overlay.querySelectorAll(".kind-row[data-search]").forEach(row => {
        const hay = row.dataset.search || "";
        row.style.display = (query === "" || hay.includes(query)) ? "" : "none";
      });
      // Toggle the right-aligned ✕ visibility off while empty.
      searchWrap.classList.toggle("has-value", query.length > 0);
    };
    $("kinds-search").addEventListener("input", e => applySearch(e.target.value));
    $("kinds-search-clear").addEventListener("click", () => {
      const search = $("kinds-search");
      search.value = "";
      applySearch("");
      search.focus();
    });
    overlay.querySelectorAll(".kind-tag").forEach(chip => {
      chip.addEventListener("click", e => {
        e.stopPropagation();
        const tag = chip.dataset.tag;
        const search = $("kinds-search");
        search.value = tag;
        applySearch(tag);
        search.focus();
      });
    });

    overlay.querySelectorAll("button[data-act]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const id  = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === "edit") UI.renderKindEditor(id);
        else if (act === "dup") {
          Kinds.duplicate(id);
          toast("Duplicated");
          UI.renderKinds();
        } else if (act === "dup-builtin") {
          const c = Kinds.duplicate(id);
          if (c) { toast(`Forked "${c.name}"`); UI.renderKindEditor(c.id); }
        } else if (act === "inspect-builtin") {
          UI.renderBuiltinInspector(id);
        } else if (act === "export") {
          const payload = Kinds.exportSingle(id);
          if (!payload) return;
          const safeName = (payload.kind.name || "kind").replace(/[^a-z0-9_-]+/gi, "_");
          try {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
            const url  = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = safeName + ".lpkind.json";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast(`Exported "${safeName}.lpkind.json"`);
          } catch { toast("Export failed"); }
        } else if (act === "delete") {
          const k = Kinds.userKinds().find(uk => uk.id === id);
          if (!k) return;
          UI.confirm({
            title: "DELETE KIND",
            message: `Permanently delete "${k.name}"? Levels using this kind will lose its definition unless they have it embedded.`,
            yesLabel: "Delete",
            danger: true,
            onYes: () => {
              Kinds.delete(id);
              toast(`Deleted "${k.name}"`);
              UI.renderKinds();
            }
          });
        }
      });
    });

    overlay.querySelectorAll('.menu-item[data-action="back"]').forEach(el => {
      el.addEventListener("click", () => UI.renderMenu());
    });
    const navList = overlay.querySelectorAll(".menu-item");
    navList.forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
    });
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },

  // ----- Observation mode overlay (Phase 4) ---------------------------
  // Floating top-of-screen bar with time controls, test name, and Done.
  // Created on startObservation, refreshed when timeScale/paused changes,
  // torn down on endObservation.
  renderObservationOverlay() {
    let el = document.getElementById("obs-bar");
    if (!Game.observation) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "obs-bar";
      el.style.cssText = `
        position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
        z-index: 95; display: flex; gap: 6px; align-items: center;
        padding: 6px 12px; border-radius: 8px;
        background: rgba(4, 12, 22, 0.85); color: #d8efff;
        border: 1px solid rgba(120, 200, 255, 0.3);
        font-size: 11px; letter-spacing: 1px;
        backdrop-filter: blur(8px);
      `;
      document.body.appendChild(el);
    }
    const obs = Game.observation;
    const ts = Game.timeScale || 1;
    const isPaused = Game.paused;
    const btn = (label, active, attrs = "") => `<button data-obs="${attrs}"
      style="font-size:10px; padding:3px 8px;
        background:${active ? "rgba(120,200,255,0.35)" : "rgba(20,40,60,0.6)"};
        color:#d8efff; border:1px solid rgba(120,200,255,0.3); border-radius:4px;
        cursor:pointer;">${label}</button>`;
    el.innerHTML = `
      <span style="opacity:0.65; text-transform:uppercase; font-size:9px; letter-spacing:2px;">TEST</span>
      <span style="opacity:0.85; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${(obs.name || "").replace(/&/g,"&amp;").replace(/</g,"&lt;")}
      </span>
      <span style="opacity:0.4;">·</span>
      ${btn(isPaused ? "▶ Play" : "❚❚ Pause", false, "toggle")}
      ${btn("Step", false, "step")}
      <span style="opacity:0.4; margin:0 4px;">|</span>
      ${btn("0.25×", ts === 0.25, "0.25")}
      ${btn("0.5×",  ts === 0.5,  "0.5")}
      ${btn("1×",    ts === 1,    "1")}
      ${btn("2×",    ts === 2,    "2")}
      ${btn("4×",    ts === 4,    "4")}
      <span style="opacity:0.4; margin:0 4px;">|</span>
      ${btn("Debug", obs.debugOverlay, "debug")}
      ${btn("Stats", obs.showStats,    "stats")}
      <span style="opacity:0.4; margin:0 4px;">|</span>
      ${btn("↻ Restart", false, "restart")}
      ${btn("Done",      false, "done")}
      <span style="opacity:0.4; margin-left:6px;">seed ${obs.seed}</span>
    `;
    el.querySelectorAll("button[data-obs]").forEach(b => {
      b.onclick = () => {
        const v = b.dataset.obs;
        if (v === "toggle") Game.toggleObservationPause();
        else if (v === "step")    Game.observationStep();
        else if (v === "done")    Game.endObservation();
        else if (v === "restart") Game.restartObservation();
        else if (v === "debug") { obs.debugOverlay = !obs.debugOverlay; UI.renderObservationOverlay(); }
        else if (v === "stats") { obs.showStats    = !obs.showStats;    UI.renderObservationOverlay(); UI.renderObservationStats(); }
        else Game.setTimeScale(parseFloat(v));
      };
    });
    // The stats panel is independent of the bar's HTML — keep it synced.
    UI.renderObservationStats();
  },
  // Floating panel below the obs bar listing per-rule fire counts for the
  // kind under test. Refreshed every ~10 frames while showStats is on so
  // the numbers stay live without spamming layout.
  renderObservationStats() {
    let el = document.getElementById("obs-stats");
    const obs = Game.observation;
    if (!obs || !obs.showStats) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "obs-stats";
      el.style.cssText = `
        position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
        z-index: 95; padding: 8px 12px; border-radius: 8px;
        background: rgba(4, 12, 22, 0.85); color: #d8efff;
        border: 1px solid rgba(120, 200, 255, 0.3);
        font-size: 11px; max-width: 420px;
        backdrop-filter: blur(8px);
      `;
      document.body.appendChild(el);
    }
    const kind = Kinds.userKinds().find(k => k.id === obs.kindId);
    const rules = (kind && kind.movement && kind.movement.active && kind.movement.active.rules) || [];
    const fires = obs.ruleFires || {};
    const total = Object.values(fires).reduce((a, b) => a + b, 0);
    const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;");
    if (rules.length === 0) {
      el.innerHTML = `<div style="opacity:0.7;">Kind has no rules — running its preset directly.</div>`;
      return;
    }
    let rows = "";
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const a = (r.what && r.what.type) || "stand-ground";
      const fk = (r.who && r.who.filter && r.who.filter.kind) || "any";
      const n = fires[i] || 0;
      const pct = total > 0 ? Math.round(n * 100 / total) : 0;
      const hue = (i * 67 + 200) % 360;
      rows += `
        <div style="display:flex; gap:8px; align-items:center; padding:2px 0;">
          <span style="width:10px; height:10px; border-radius:2px;
                       background:hsl(${hue},80%,55%); display:inline-block;"></span>
          <span style="opacity:0.55; font-size:10px;">#${i + 1}</span>
          <span style="flex:1; opacity:0.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${esc(a)} · ${esc(fk)}${(r.priority != null ? ` · prio ${r.priority}` : "")}
          </span>
          <span style="font-variant-numeric: tabular-nums; opacity:${n > 0 ? "0.95" : "0.45"};">
            ${n}× ${total > 0 ? `(${pct}%)` : ""}
          </span>
        </div>`;
    }
    el.innerHTML = `
      <div style="opacity:0.6; letter-spacing:2px; font-size:9px; margin-bottom:6px;">
        RULE FIRES — ${esc(kind ? kind.name : "")}
      </div>
      ${rows}
      <div style="opacity:0.5; font-size:10px; margin-top:6px;">total ${total}× across all instances</div>
    `;
  },
  clearObservationOverlay() {
    const el  = document.getElementById("obs-bar");
    if (el) el.remove();
    const els = document.getElementById("obs-stats");
    if (els) els.remove();
  },

  // ----- Built-in kind inspector (read-only) -------------------------
  // Surfaces the lore + sample tests defined in BUILTIN_INSPECTION so the
  // user can see what each built-in does without forking it. Sample tests
  // run in observation mode with `returnTo: "builtin-inspector"` so Done
  // / Esc lands back on this panel.
  renderBuiltinInspector(id) {
    Game.state = "kinds-inspect";
    hud.classList.add("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Audio_.init(); Audio_.resume(); Audio_.startMusic("lobby");
    const $ = id_ => document.getElementById(id_);
    const esc = s => String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const builtin = KIND_BUILTINS[id];
    if (!builtin) { UI.renderKinds(); return; }
    const insp = BUILTIN_INSPECTION[id] || {};
    const tests = insp.sampleTests || [];
    const swatch = (hue, sz=18) =>
      `<span style="display:inline-block; width:${sz}px; height:${sz}px; border-radius:50%;
        background:hsl(${hue},80%,55%); box-shadow:0 0 8px hsl(${hue},80%,55%); vertical-align:middle;"></span>`;

    // After Phase 6 migration, behavior / fieldStrength / hasMind live on
    // the merged KIND_META entry (derived from movement.type), not on
    // KIND_BUILTINS itself. Read derived fields off the meta.
    const meta = KIND_META[id] || {};
    overlay.innerHTML = `
      <div class="panel" style="text-align:left; min-width:560px; max-width:680px;">
        <h1 style="font-size:22px; letter-spacing:4px; text-align:center;">
          BUILT-IN: ${esc(builtin.label.toUpperCase())}
        </h1>
        <div style="display:flex; gap:14px; align-items:center; margin:8px 0 18px;">
          ${swatch(builtin.hue, 24)}
          <div style="font-size:11px; opacity:0.65;">
            id: <span style="opacity:0.9;">${esc(builtin.id)}</span> ·
            hue ${builtin.hue} ·
            ${esc(meta.behavior || "passive")}${meta.hasMind ? " · mind" : ""}${meta.fieldStrength != null ? ` · field ${meta.fieldStrength}` : ""}
          </div>
        </div>

        <h3 style="font-size:12px; letter-spacing:2px; opacity:0.6; margin:0 0 6px;">BEHAVIOUR</h3>
        <p style="opacity:0.85; font-size:13px; margin:0 8px 8px; line-height:1.45;">${esc(builtin.desc)}</p>
        ${insp.lore ? `<p style="opacity:0.7; font-size:12px; margin:0 8px 12px; line-height:1.45;">${esc(insp.lore)}</p>` : ""}

        <h3 style="font-size:12px; letter-spacing:2px; opacity:0.6; margin:18px 0 6px;">SAMPLE TESTS</h3>
        ${tests.length === 0
          ? `<div style="opacity:0.5; padding:10px 8px; text-align:center; font-size:11px;
              border:1px dashed rgba(255,255,255,0.15); border-radius:6px; margin:0 8px;">
              No sample tests yet for this kind.
            </div>`
          : tests.map((t, i) => {
              const circles = (t.layout && t.layout.circles) || [];
              return `
                <div class="sample-test" data-tidx="${i}" style="border:1px solid rgba(120,200,255,0.18);
                  border-radius:6px; padding:8px 10px; margin:6px 0; background:rgba(20,40,60,0.35);">
                  <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                    <span style="flex:1; font-size:13px;">${esc(t.name)}</span>
                    <span style="opacity:0.55; font-size:10px;">seed ${t.seed}${t.ghostPlayer ? " · ghost player" : ""}</span>
                    <button data-tact="run" data-tidx="${i}" style="font-size:10px; padding:3px 10px;
                      background:rgba(40,120,180,0.35); border:1px solid rgba(120,200,255,0.4); color:#d8efff;
                      border-radius:4px; cursor:pointer;">Run</button>
                  </div>
                  <div style="font-size:11px; opacity:0.65;">${esc(t.description)}</div>
                  <div style="font-size:10px; opacity:0.4; margin-top:3px;">${circles.length} circle${circles.length !== 1 ? "s" : ""} placed</div>
                </div>`;
            }).join("")}

        <div id="menu-list" style="margin-top:18px; display:flex; gap:8px; justify-content:center;">
          <div class="menu-item" data-action="fork" title="Copy this built-in into a new editable user kind">Fork to user kind</div>
          <div class="menu-item selected" data-action="back">Back to library</div>
        </div>
      </div>`;

    overlay.querySelectorAll('button[data-tact="run"]').forEach(btn => {
      btn.addEventListener("click", () => {
        const i = parseInt(btn.dataset.tidx, 10);
        const t = tests[i];
        Game.startObservation({
          kindId: id, testId: t.id, seed: t.seed,
          layout: JSON.parse(JSON.stringify(t.layout)),
          name: `${builtin.label}: ${t.name}`,
          returnTo: "builtin-inspector",
          ghostPlayer: !!t.ghostPlayer
        });
      });
    });
    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("click", () => {
        const a = el.dataset.action;
        if (a === "back") UI.renderKinds();
        else if (a === "fork") {
          const c = Kinds.duplicate(id);
          if (c) { toast(`Forked "${c.name}"`); UI.renderKindEditor(c.id); }
        }
      });
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
    });
    Game.selectedMenu = 1;
    UI.refreshSelected();
  },

  // Editor pane for a single user kind. Phase 1 only exposes name/desc/hue;
  // later phases add movement/contact/rules/abilities/tests on the same panel.
  renderKindEditor(id) {
    Game.state = "kinds-edit";
    hud.classList.add("hidden");
    const $ = id_ => document.getElementById(id_);
    const esc = s => String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const isNew = !id;
    const existing = isNew ? null : (Kinds.userKinds().find(uk => uk.id === id) || null);
    if (!isNew && !existing) { UI.renderKinds(); return; }

    // Working snapshot. Defaults for a brand-new kind; otherwise a deep copy
    // of the saved record so unsaved edits don't mutate storage.
    const working = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: null, name: "New Kind", description: "", hue: 200, schemaVersion: 3,
          movement: { type: "drift" } };
    if (!working.movement) working.movement = { type: "drift" };

    function ensureActive() {
      if (working.movement.type !== "active") working.movement = { type: "active", active: {} };
      if (!working.movement.active) working.movement.active = {};
      const a = working.movement.active;
      if (a.thrustFraction === undefined) a.thrustFraction = 0.005;
      if (a.thrustSpeed    === undefined) a.thrustSpeed    = 450;
      if (a.cooldown       === undefined) a.cooldown       = 0.05;
      return a;
    }

    const initPreset =
      working.movement.type === "field" ? "field" :
      working.movement.type === "active" && working.movement.active
        ? (working.movement.active.preset || "drift")
        : "drift";
    const a = (working.movement.active) || {};
    const initFrac  = a.thrustFraction !== undefined ? a.thrustFraction : 0.005;
    const initSpd   = a.thrustSpeed    !== undefined ? a.thrustSpeed    : 450;
    const initCool  = a.cooldown       !== undefined ? a.cooldown       : 0.05;
    const initFieldStrength = (working.movement.type === "field" && working.movement.field
                              && working.movement.field.strength !== undefined)
                              ? working.movement.field.strength : 220000;

    // Kind-id options for the "Target kind" filter — built-ins plus user
    // kinds, except this kind itself (a kind targeting itself usually means
    // swarm behaviour, which isn't a Phase 3 action).
    //
    // Flat list shape `[id, label]` is used for the summary-text lookup.
    // The dropdown uses kindOptionsHtml() instead so it can render
    // <optgroup> separators that put user kinds front-and-centre — the
    // built-ins were burying user kinds at the bottom of a 13-row scroll.
    const kindOptions = () => {
      const items = [
        ["any",      "Any circle"],
        ["player",   "Player"],
        ["mote",     "Motes (propellant)"],
        ["mind",     "Any mind (thinker)"],
        ["non-mind", "Any non-mind"]
      ];
      for (const u of Kinds.userKinds()) {
        if (working.id && u.id === working.id) continue;
        items.push([u.id, u.name]);
      }
      for (const b of Kinds.builtinKinds()) items.push([b.id, b.label]);
      return items;
    };
    const kindOptionsHtml = (selected) => {
      const opt = (v, l) =>
        `<option value="${esc(v)}" ${selected === v ? "selected" : ""}>${esc(l)}</option>`;
      const meta = [
        ["any",      "Any circle"],
        ["player",   "Player"],
        ["mote",     "Motes (propellant)"],
        ["mind",     "Any mind (thinker)"],
        ["non-mind", "Any non-mind"]
      ];
      const userItems = [];
      for (const u of Kinds.userKinds()) {
        if (working.id && u.id === working.id) continue;
        userItems.push([u.id, u.name]);
      }
      let html = meta.map(([v, l]) => opt(v, l)).join("");
      if (userItems.length > 0) {
        html += `<optgroup label="── Your kinds ──">`;
        html += userItems.map(([v, l]) => opt(v, l)).join("");
        html += `</optgroup>`;
      }
      html += `<optgroup label="── Built-ins ──">`;
      html += Kinds.builtinKinds().map(b => opt(b.id, b.label)).join("");
      html += `</optgroup>`;
      return html;
    };
    // Child-kind options for the spawn-child effect. Same shape as the
    // rule-target picker but starts with "Same as self" instead of meta
    // selectors — spawn-child needs a concrete kind, not a category.
    const childKindOptionsHtml = (selected) => {
      const opt = (v, l) =>
        `<option value="${esc(v)}" ${selected === v ? "selected" : ""}>${esc(l)}</option>`;
      let html = opt("self", "Same as self");
      const userItems = [];
      for (const u of Kinds.userKinds()) {
        if (working.id && u.id === working.id) continue;
        userItems.push([u.id, u.name]);
      }
      if (userItems.length > 0) {
        html += `<optgroup label="── Your kinds ──">`;
        html += userItems.map(([v, l]) => opt(v, l)).join("");
        html += `</optgroup>`;
      }
      html += `<optgroup label="── Built-ins ──">`;
      html += Kinds.builtinKinds().map(b => opt(b.id, b.label)).join("");
      html += `</optgroup>`;
      return html;
    };

    overlay.innerHTML = `
      <div class="panel" style="text-align:left; min-width:560px; max-width:920px;">
        <h1 style="font-size:22px; letter-spacing:4px; text-align:center;">
          ${isNew ? "NEW KIND" : "EDIT KIND"}
          <span id="ke-savestate" style="font-size:11px; letter-spacing:1px;
            margin-left:10px; color:#a4d4a4; opacity:0.85;">✓ Saved</span>
        </h1>
        <p style="opacity:0.55; font-size:10px; text-align:center; margin-bottom:14px;">
          id: ${esc(working.id) || "(assigned on save)"} — name and colour are editable, id is permanent.
        </p>
        <table style="width:100%;">
          <tr><td style="padding:6px 8px; opacity:0.75; width:110px;">Name</td>
              <td><input id="ke-name" type="text" maxlength="60" value="${esc(working.name)}" style="width:96%;"></td></tr>
          <tr><td style="padding:6px 8px; opacity:0.75; vertical-align:top;">Description</td>
              <td><textarea id="ke-desc" rows="2" style="width:96%; resize:vertical;">${esc(working.description)}</textarea></td></tr>
          <tr><td style="padding:6px 8px; opacity:0.75;">Hue</td>
              <td>
                <input id="ke-hue" type="range" min="0" max="359" value="${working.hue}" style="width:55%; vertical-align:middle;">
                <span id="ke-hue-v" style="opacity:0.7; margin:0 8px;">${working.hue}</span>
                <span id="ke-swatch" style="display:inline-block; width:32px; height:32px; border-radius:50%;
                  background:hsl(${working.hue},80%,55%); box-shadow:0 0 12px hsl(${working.hue},80%,55%); vertical-align:middle;"></span>
              </td></tr>
          <tr><td style="padding:6px 8px; opacity:0.75; vertical-align:top;">Tags</td>
              <td><div id="ke-tags" style="margin-right:8px;"></div></td></tr>
        </table>

        <h3 style="font-size:12px; letter-spacing:2px; opacity:0.6; margin:18px 0 6px;">
          BEHAVIOUR
          <span id="ke-cost" style="margin-left:10px; padding:1px 8px; border-radius:8px;
            font-size:9px; letter-spacing:1px;"></span>
        </h3>
        <table style="width:100%;">
          <tr><td style="padding:6px 8px; opacity:0.75; width:110px;">Preset</td>
              <td>
                <select id="ke-preset" style="min-width:160px;">
                  <option value="drift"  ${initPreset==="drift" ?"selected":""}>Drift — passive, no AI</option>
                  <option value="hunt"   ${initPreset==="hunt"  ?"selected":""}>Hunt — chase smaller circles</option>
                  <option value="flee"   ${initPreset==="flee"  ?"selected":""}>Flee — avoid larger circles</option>
                  <option value="field"  ${initPreset==="field" ?"selected":""}>Field — carries a gravity well</option>
                  <option value="custom" ${initPreset==="custom"?"selected":""}>Custom rules…</option>
                </select>
                <span id="ke-preset-desc" style="opacity:0.55; font-size:10px; margin-left:8px;"></span>
              </td></tr>
        </table>
        <div id="ke-field-group" style="${initPreset==="field" ? "" : "display:none;"}">
          <p style="opacity:0.55; font-size:10px; margin:8px 8px 4px;">
            Field strength — positive values pull, negative values push. Force at distance d is
            <code>strength / d²</code>, summed with every other field source. Reference: Magnet 220k,
            Repeller −300k, Singularity child 900k.
          </p>
          <table style="width:100%;">
            <tr><td style="padding:4px 8px; opacity:0.75; width:110px;">Strength</td>
                <td>
                  <input id="ke-field-strength" type="number" step="10000" min="-2000000" max="2000000"
                         value="${initFieldStrength}" style="width:120px;">
                  <button data-set="ke-field-strength" data-value="220000"
                          style="font-size:10px; padding:2px 6px; margin-left:6px;"
                          title="Same pull as the built-in Magnet">Magnet</button>
                  <button data-set="ke-field-strength" data-value="-300000"
                          style="font-size:10px; padding:2px 6px;"
                          title="Same push as the built-in Repeller">Repeller</button>
                  <button data-set="ke-field-strength" data-value="900000"
                          style="font-size:10px; padding:2px 6px;"
                          title="Same pull as the built-in Singularity child">Singularity</button>
                </td></tr>
          </table>
        </div>
        <div id="ke-thrust-group" style="${(initPreset==="drift" || initPreset==="field") ? "display:none;" : ""}">
          <p style="opacity:0.55; font-size:10px; margin:8px 8px 4px;">
            Thrust parameters — match the player's API. Fraction = mass ejected per pulse;
            speed = ejection velocity; cooldown = seconds between pulses.
          </p>
          <table style="width:100%;">
            <tr><td style="padding:4px 8px; opacity:0.75; width:110px;">Fraction</td>
                <td>
                  <input id="ke-tf"  type="number" step="0.001" min="0.0005" max="0.05" value="${initFrac}" style="width:90px;">
                  <button data-reset="ke-tf" data-default="0.005" title="Reset to default 0.005"
                          style="font-size:10px; padding:2px 6px; margin-left:4px;">↺</button>
                </td></tr>
            <tr><td style="padding:4px 8px; opacity:0.75;">Speed (px/s)</td>
                <td>
                  <input id="ke-ts"  type="number" step="10" min="50" max="2000" value="${initSpd}" style="width:90px;">
                  <button data-reset="ke-ts" data-default="450" title="Reset to default 450"
                          style="font-size:10px; padding:2px 6px; margin-left:4px;">↺</button>
                </td></tr>
            <tr><td style="padding:4px 8px; opacity:0.75;">Cooldown (s)</td>
                <td>
                  <input id="ke-tc"  type="number" step="0.01" min="0.01" max="2" value="${initCool}" style="width:90px;">
                  <button data-reset="ke-tc" data-default="0.05" title="Reset to default 0.05"
                          style="font-size:10px; padding:2px 6px; margin-left:4px;">↺</button>
                </td></tr>
          </table>
        </div>

        <div id="ke-rules-section" style="${initPreset === "custom" ? "" : "display:none;"}"></div>

        <div id="ke-abilities-section"></div>

        <div id="ke-pickup-section"></div>

        <div id="ke-tests-section"></div>

        <p style="opacity:0.45; font-size:10px; margin-top:14px;">
          Custom rules: highest priority with a matching target wins each tick. Saved kinds carry
          forward via schemaVersion.
        </p>

        <div id="menu-list" style="margin-top:18px;">
          <div class="menu-item selected" data-action="save">${isNew ? "Create kind" : "Save changes"}</div>
          <div class="menu-item" data-action="preview"
               title="Auto-build a sample scene and run it in observation mode (commits current edits first)">▶ Quick preview</div>
          <div class="menu-item" data-action="cancel">Cancel</div>
        </div>
      </div>`;

    const PRESET_DESCS = {
      drift:  "Drifts. Affected by gravity but otherwise inert.",
      hunt:   "Targets the closest fattest smaller circle and thrusts toward it.",
      flee:   "Sums a danger vector from every nearby larger circle and thrusts away.",
      custom: "Author your own rules below — combine target filters, picks, and actions.",
      field:  "Carries a continuous gravity-like force. Doesn't move on its own; affects every other circle."
    };
    const hueIn = $("ke-hue"), hueLbl = $("ke-hue-v"), swatchEl = $("ke-swatch");
    const presetIn = $("ke-preset"), presetDesc = $("ke-preset-desc");
    const thrustGroup = $("ke-thrust-group");
    const fieldGroup = $("ke-field-group");
    const rulesSection = $("ke-rules-section");
    presetDesc.textContent = PRESET_DESCS[presetIn.value] || "";

    // Quick-set buttons for the field-strength input. Same pattern as
    // the thrust group's reset (↺) buttons but with named values.
    overlay.querySelectorAll("button[data-set]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = $(btn.dataset.set);
        if (!target) return;
        target.value = btn.dataset.value;
        target.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    hueIn.addEventListener("input", () => {
      const h = parseInt(hueIn.value, 10);
      hueLbl.textContent = h;
      swatchEl.style.background = `hsl(${h},80%,55%)`;
      swatchEl.style.boxShadow  = `0 0 12px hsl(${h},80%,55%)`;
    });

    // ---- Rule editor ---------------------------------------------------
    const ACTIONS = [
      ["approach",     "Approach"],
      ["flee",         "Flee"],
      ["intercept",    "Intercept (predict)"],
      ["orbit",        "Orbit at radius"],
      ["stand-ground", "Stand ground"]
    ];
    const PICKS = [
      ["closest",       "Closest"],
      ["farthest",      "Farthest"],
      ["largest",       "Largest"],
      ["smallest",      "Smallest"],
      ["score-hunter",  "Highest mass / dist² (Hunter)"],
      ["score-danger",  "Most threatening (mass / dist²)"]
    ];
    const MASSES = [
      ["any",        "any size"],
      ["smaller",    "smaller than self"],
      ["larger",     "larger than self"],
      ["within-pct", "within ±% of self"]
    ];
    const DISTANCES = [
      ["any",    "any distance"],
      ["within", "within Npx"],
      ["beyond", "beyond Npx"]
    ];
    const optsHtml = (pairs, sel) =>
      pairs.map(([v, label]) =>
        `<option value="${esc(v)}" ${sel === v ? "selected" : ""}>${esc(label)}</option>`
      ).join("");

    function summarize(r) {
      const filter = (r.who && r.who.filter) || {};
      const action = (r.what && r.what.type) || "stand-ground";
      if (action === "stand-ground") return "Stand ground";
      const labelByVal = arr => Object.fromEntries(arr.map(([v, l]) => [v, l]));
      const kindMap = labelByVal(kindOptions());
      const k = kindMap[filter.kind] || filter.kind || "any circle";
      const mass = filter.mass === "smaller" ? "smaller " :
                   filter.mass === "larger"  ? "larger "  :
                   filter.mass === "within-pct" ? "similarly-sized " : "";
      const pick = (r.who && r.who.pick) || "closest";
      const pickWord = labelByVal(PICKS)[pick] || pick;
      const verb = labelByVal(ACTIONS)[action] || action;
      let suffix = "";
      if (filter.distance === "within") suffix = ` within ${filter.distanceValue || 280}px`;
      else if (filter.distance === "beyond") suffix = ` beyond ${filter.distanceValue || 280}px`;
      if (action === "orbit") suffix += ` at ${(r.what && r.what.orbitRadius) || 200}px`;
      return `${verb} (${pickWord.toLowerCase()}) ${mass}${k.toLowerCase()}${suffix}`;
    }

    function lintRules(rules) {
      const out = [];
      if (rules.length === 0) {
        out.push("No rules — kind will drift while preset is Custom.");
      }
      // Same priority + opposite action on overlapping kind filter.
      const isChase = a => a === "approach" || a === "intercept" || a === "orbit";
      const isFlee  = a => a === "flee";
      for (let i = 0; i < rules.length; i++) {
        for (let j = i + 1; j < rules.length; j++) {
          const a = rules[i], b = rules[j];
          if ((a.priority || 0) !== (b.priority || 0)) continue;
          const aA = (a.what && a.what.type) || "stand-ground";
          const bA = (b.what && b.what.type) || "stand-ground";
          if ((isChase(aA) && isFlee(bA)) || (isFlee(aA) && isChase(bA))) {
            const aK = (a.who && a.who.filter && a.who.filter.kind) || "any";
            const bK = (b.who && b.who.filter && b.who.filter.kind) || "any";
            if (aK === bK || aK === "any" || bK === "any") {
              out.push(`Rules ${i + 1} and ${j + 1} share priority ${a.priority || 0} ` +
                       `but have opposite actions on overlapping targets — ordering is undefined.`);
            }
          }
        }
      }
      return out;
    }

    function blankRule() {
      return {
        priority: 10, when: { type: "always" },
        who: { filter: { kind: "any", mass: "any", distance: "any", distanceValue: 280 }, pick: "closest" },
        what: { type: "approach" }
      };
    }

    // Two-pane rules editor: compact rule list on the left, details for
    // the selected rule on the right. selectedRuleIdx survives re-renders
    // inside the renderKindEditor closure; it's clamped to the rules array
    // length each render so removing a rule doesn't leave a stale index.
    let selectedRuleIdx = 0;

    function renderRulesSection() {
      const preset = presetIn.value;
      if (preset !== "custom") {
        rulesSection.style.display = "none";
        rulesSection.innerHTML = "";
        return;
      }
      rulesSection.style.display = "";
      const cfg = ensureActive();
      if (!Array.isArray(cfg.rules)) cfg.rules = [];
      const rules = cfg.rules;
      if (selectedRuleIdx >= rules.length) selectedRuleIdx = rules.length - 1;
      if (selectedRuleIdx < 0) selectedRuleIdx = 0;
      const warnings = lintRules(rules);

      let html = `
        <h3 style="font-size:12px; letter-spacing:2px; opacity:0.6; margin:18px 0 6px;">RULES</h3>
        <p style="opacity:0.55; font-size:10px; margin:0 8px 8px;">
          Rules are listed in evaluation order — top fires first. Click a row to edit.
          ↑/↓ bump priority; you can also type a priority value directly.
        </p>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin:0 8px 10px; align-items:center;">
          <button id="ke-rule-add" style="font-size:11px; padding:4px 10px;">+ Add rule</button>
          <select id="ke-rule-lib" style="font-size:11px;">
            <option value="">Add from library…</option>
            ${RULE_LIBRARY.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("")}
          </select>
        </div>`;

      if (rules.length === 0) {
        html += `<div style="opacity:0.5; padding:14px 8px; text-align:center; font-size:11px;
          border:1px dashed rgba(255,255,255,0.15); border-radius:6px; margin:0 8px;">
          No rules — kind will drift. Add one or pick from the library.
        </div>`;
      } else {
        // ---- Left pane: rule list, in evaluation order ----
        // Sort by priority desc, ties broken by authored index asc — same
        // shape the runtime evaluator uses. Iterate the sorted view but
        // tag each row with its AUTHORED idx so click/up/down/remove
        // handlers stay stable when priorities shuffle the visible order.
        const view = rules.map((r, i) => ({ r, idx: i, p: r.priority || 0 }))
          .sort((a, b) => b.p - a.p || a.idx - b.idx);
        let listHtml = "";
        for (const { r, idx } of view) {
          const isSel = idx === selectedRuleIdx;
          listHtml += `
            <div class="rule-list-row" data-select="${idx}" style="
              background: ${isSel ? "rgba(120,200,255,0.22)" : "rgba(20,40,60,0.35)"};
              border: 1px solid rgba(120,200,255,${isSel ? 0.6 : 0.18});
              border-radius:6px; padding:5px 6px; margin-bottom:4px; cursor:pointer;
              display:flex; gap:4px; align-items:center;">
              <input data-f="priority" data-idx="${idx}" type="number" step="1"
                     value="${r.priority || 0}" style="width:46px; font-size:10px;"
                     title="Priority (higher fires first)" onclick="event.stopPropagation()">
              <span class="rule-summary" data-idx="${idx}"
                    style="flex:1; font-size:11px; opacity:${isSel ? 1 : 0.75};
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(summarize(r))}</span>
              <button data-act="up"     data-idx="${idx}" style="font-size:10px; padding:1px 5px;" title="Move up">↑</button>
              <button data-act="down"   data-idx="${idx}" style="font-size:10px; padding:1px 5px;" title="Move down">↓</button>
              <button data-act="remove" data-idx="${idx}" style="font-size:10px; padding:1px 5px;
                background:rgba(120,40,40,0.5); border:1px solid rgba(255,140,140,0.3); color:#fdd;">✕</button>
            </div>`;
        }

        // ---- Right pane: details for the selected rule ----
        let detailsHtml = "";
        const sel = rules[selectedRuleIdx];
        if (sel) {
          const idx = selectedRuleIdx;
          const filter = (sel.who && sel.who.filter) || {};
          const pick = (sel.who && sel.who.pick) || "closest";
          const action = (sel.what && sel.what.type) || "approach";
          const distVal = filter.distanceValue !== undefined ? filter.distanceValue : 280;
          const massVal = filter.massValue !== undefined ? filter.massValue : 0.2;
          const orbitR  = (sel.what && sel.what.orbitRadius) || 200;
          const lookahead = (sel.what && sel.what.lookahead) !== undefined ? sel.what.lookahead : 0.5;
          detailsHtml = `
            <div style="font-size:9px; letter-spacing:2px; opacity:0.55; margin-bottom:6px;">
              EDITING RULE #${idx + 1}
            </div>
            <table style="width:100%; font-size:11px;">
              <tr><td style="padding:2px 8px; opacity:0.65; width:90px;">Target kind</td>
                  <td><select data-f="filter.kind" data-idx="${idx}" style="min-width:170px;">
                    ${kindOptionsHtml(filter.kind || "any")}
                  </select></td></tr>
              <tr><td style="padding:2px 8px; opacity:0.65;">Mass</td>
                  <td>
                    <select data-f="filter.mass" data-idx="${idx}">${optsHtml(MASSES, filter.mass || "any")}</select>
                    <input data-f="filter.massValue" data-idx="${idx}" type="number" step="0.05" min="0" max="1"
                           value="${massVal}" style="width:60px; margin-left:6px;
                           ${filter.mass === "within-pct" ? "" : "display:none;"}"
                           title="Tolerance as a fraction of self mass (0–1)">
                  </td></tr>
              <tr><td style="padding:2px 8px; opacity:0.65;">Distance</td>
                  <td>
                    <select data-f="filter.distance" data-idx="${idx}">${optsHtml(DISTANCES, filter.distance || "any")}</select>
                    <input data-f="filter.distanceValue" data-idx="${idx}" type="number" step="20" min="10"
                           value="${distVal}" style="width:70px; margin-left:6px;
                           ${(filter.distance === "within" || filter.distance === "beyond") ? "" : "display:none;"}"
                           title="Pixels"> px
                  </td></tr>
              <tr><td style="padding:2px 8px; opacity:0.65;">Pick</td>
                  <td><select data-f="who.pick" data-idx="${idx}">${optsHtml(PICKS, pick)}</select></td></tr>
              <tr><td style="padding:2px 8px; opacity:0.65;">Action</td>
                  <td>
                    <select data-f="what.type" data-idx="${idx}">${optsHtml(ACTIONS, action)}</select>
                    <input data-f="what.orbitRadius" data-idx="${idx}" type="number" step="10" min="40"
                           value="${orbitR}" style="width:70px; margin-left:6px;
                           ${action === "orbit" ? "" : "display:none;"}"
                           title="Orbit radius in pixels"> px
                    <input data-f="what.lookahead" data-idx="${idx}" type="number" step="0.05" min="0.05" max="2"
                           value="${lookahead}" style="width:70px; margin-left:6px;
                           ${action === "intercept" ? "" : "display:none;"}"
                           title="Seconds to extrapolate the target's velocity"> s
                  </td></tr>
            </table>`;
        } else {
          detailsHtml = `<div style="opacity:0.45; padding:14px 8px; text-align:center; font-size:11px;">
            Select a rule on the left to edit.
          </div>`;
        }

        html += `<div style="display:flex; gap:10px; align-items:flex-start; margin:0 8px;">
          <div style="flex:0 0 320px; min-width:0;">${listHtml}</div>
          <div style="flex:1; min-width:0; padding:6px 8px;
                      border-left:1px solid rgba(255,255,255,0.1);">${detailsHtml}</div>
        </div>`;
      }

      if (warnings.length > 0) {
        html += `<div style="margin:10px 8px 0; padding:8px 10px; background:rgba(120,80,30,0.18);
          border:1px solid rgba(255,200,120,0.3); border-radius:6px; font-size:11px;">
          <div style="opacity:0.7; letter-spacing:1px; font-size:9px; margin-bottom:4px;">LINT</div>
          ${warnings.map(w => `<div style="opacity:0.85; margin-bottom:2px;">⚠ ${esc(w)}</div>`).join("")}
        </div>`;
      }

      rulesSection.innerHTML = html;

      // Wire add / library. New blank rules go to the top of the list
      // (max priority + 1) so the user can immediately see and edit them
      // without scrolling. Library presets keep their own pre-set
      // priorities — those values are intentional defaults.
      $("ke-rule-add").addEventListener("click", () => {
        const fresh = blankRule();
        const maxP = rules.reduce((m, r) => Math.max(m, r.priority || 0), 0);
        fresh.priority = maxP + 1;
        rules.push(fresh);
        selectedRuleIdx = rules.length - 1;
        renderRulesSection();
        UI.refreshSelected();
      });
      $("ke-rule-lib").addEventListener("change", e => {
        const i = parseInt(e.target.value, 10);
        if (Number.isNaN(i)) return;
        rules.push(JSON.parse(JSON.stringify(RULE_LIBRARY[i].rule)));
        selectedRuleIdx = rules.length - 1;
        e.target.value = "";
        renderRulesSection();
        UI.refreshSelected();
      });

      // Click a list row → select that rule. Clicks on the priority input
      // and the action buttons inside the row are excluded (input has
      // onclick stopPropagation; buttons handle their own actions and
      // intentionally also let the row select).
      rulesSection.querySelectorAll(".rule-list-row").forEach(row => {
        row.addEventListener("click", e => {
          if (e.target.closest("button[data-act]")) return;   // buttons handle below
          if (e.target.tagName === "INPUT") return;
          const i = parseInt(row.dataset.select, 10);
          if (i !== selectedRuleIdx) {
            selectedRuleIdx = i;
            renderRulesSection();
            UI.refreshSelected();
          }
        });
      });

      // Up / down / remove buttons. ↑/↓ adjust priority so the moved rule
      // strictly beats / loses to the visual neighbour. Selection follows
      // the rule (authored idx is unchanged when priorities shift).
      rulesSection.querySelectorAll("button[data-act]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx, 10);
          const act = btn.dataset.act;
          if (act === "remove") {
            rules.splice(idx, 1);
            if (selectedRuleIdx > idx) selectedRuleIdx--;
            if (selectedRuleIdx >= rules.length) selectedRuleIdx = rules.length - 1;
          } else if (act === "up" || act === "down") {
            // Find this rule's position in the current sorted view, then
            // bump priority above (or below) the visual neighbour by 1.
            // Priorities drift over time — that's fine, they're just an
            // ordering hint.
            const view2 = rules.map((r, i) => ({ p: r.priority || 0, i }))
              .sort((a, b) => b.p - a.p || a.i - b.i);
            const pos = view2.findIndex(x => x.i === idx);
            if (act === "up" && pos > 0) {
              const nb = view2[pos - 1].i;
              rules[idx].priority = (rules[nb].priority || 0) + 1;
            } else if (act === "down" && pos < view2.length - 1) {
              const nb = view2[pos + 1].i;
              rules[idx].priority = (rules[nb].priority || 0) - 1;
            } else return;
          } else return;
          renderRulesSection();
          UI.refreshSelected();
        });
      });




      // Field changes.
      rulesSection.querySelectorAll("input[data-f], select[data-f]").forEach(el => {
        el.addEventListener("change", () => {
          const idx = parseInt(el.dataset.idx, 10);
          const f = el.dataset.f;
          const r = rules[idx];
          if (!r) return;
          let val = el.value;
          if (el.type === "number") val = el.value === "" ? 0 : parseFloat(el.value);
          if (f === "priority") r.priority = parseInt(val, 10) || 0;
          else if (f === "filter.kind")          { r.who.filter.kind = val; }
          else if (f === "filter.mass")          { r.who.filter.mass = val; }
          else if (f === "filter.massValue")     { r.who.filter.massValue = val; }
          else if (f === "filter.distance")      { r.who.filter.distance = val; }
          else if (f === "filter.distanceValue") { r.who.filter.distanceValue = val; }
          else if (f === "who.pick")             { r.who.pick = val; }
          else if (f === "what.type")            { r.what.type = val; }
          else if (f === "what.orbitRadius")     { r.what.orbitRadius = val; }
          else if (f === "what.lookahead")       { r.what.lookahead = val; }
          // Dependent-visibility fields force a re-render so param rows
          // appear/disappear correctly.
          if (["filter.mass","filter.distance","what.type"].includes(f)) {
            renderRulesSection();
            UI.refreshSelected();
            return;
          }
          // Otherwise live-update the list row's summary text in place.
          const sum = rulesSection.querySelector(`.rule-summary[data-idx="${idx}"]`);
          if (sum) sum.textContent = summarize(r);
        });
      });
    }

    overlay.querySelectorAll("button[data-reset]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = $(btn.dataset.reset);
        if (!target) return;
        target.value = btn.dataset.default;
        target.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    // Tag chip input. Suggestions come from every tag the user has used on
    // any other kind, so the autocomplete list grows organically. The
    // `onChange` callback keeps `working.tags` and the dirty indicator in
    // sync — commitWorking just reads `working.tags`.
    const tagSuggestions = (() => {
      const set = new Set();
      for (const k of Kinds.userKinds()) {
        if (working.id && k.id === working.id) continue;
        for (const t of (k.tags || [])) set.add(t);
      }
      return [...set].sort();
    })();
    const tagChipInput = createTagChipInput($("ke-tags"), {
      initial: working.tags || [],
      suggestions: tagSuggestions,
      placeholder: "Add tag — Enter to commit",
      onChange: tags => { working.tags = tags; setDirty(true); }
    });

    function refreshCostBadge() {
      const el = $("ke-cost");
      if (!el) return;
      const cost = kindAICost(working);
      const b = kindAICostBucket(cost);
      el.textContent = `AI cost: ${b.label}`;
      el.style.background = `hsla(${b.hue},80%,40%,0.25)`;
      el.style.color      = `hsl(${b.hue},80%,75%)`;
      el.style.border     = `1px solid hsla(${b.hue},80%,55%,0.35)`;
    }
    refreshCostBadge();
    // Recompute on any field change so the user sees the cost shift live
    // as they add or simplify rules.
    overlay.addEventListener("change", refreshCostBadge);

    presetIn.addEventListener("change", () => {
      const newP = presetIn.value;
      const oldP = working.movement.type === "active" && working.movement.active
        ? (working.movement.active.preset || "drift")
        : working.movement.type === "field" ? "field" : "drift";
      if (newP === "drift") {
        working.movement = { type: "drift" };
      } else if (newP === "field") {
        const existingStrength = working.movement.type === "field" && working.movement.field
          ? working.movement.field.strength : 220000;
        working.movement = { type: "field", field: { strength: existingStrength } };
      } else {
        const a = ensureActive();
        a.preset = newP;
        if (newP === "custom" && !Array.isArray(a.rules)) {
          a.rules = [];
          // Smooth transition: seed a rule that matches whatever preset they
          // were on, so flipping Hunt → Custom doesn't look broken.
          if (oldP === "hunt") a.rules.push(JSON.parse(JSON.stringify(RULE_LIBRARY[0].rule)));
          else if (oldP === "flee") a.rules.push(JSON.parse(JSON.stringify(RULE_LIBRARY[1].rule)));
        }
      }
      presetDesc.textContent = PRESET_DESCS[newP] || "";
      // Drift and field hide the thrust group; field reveals its own param row.
      thrustGroup.style.display = (newP === "drift" || newP === "field") ? "none" : "";
      fieldGroup.style.display  = newP === "field" ? "" : "none";
      renderRulesSection();
      UI.refreshSelected();
    });

    renderRulesSection();

    // ---- Abilities section (Phase 6) -----------------------------------
    function ensureAbilities() {
      if (!Array.isArray(working.abilities)) working.abilities = [];
      return working.abilities;
    }
    function newAbilityId() {
      return "a_" + Math.random().toString(36).slice(2, 8) +
                    Math.random().toString(36).slice(2, 6);
    }
    function blankAbility() {
      return {
        id: newAbilityId(),
        enabled: true,
        trigger: { type: "every", interval: 3.0, jitter: 0.5 },
        effect:  { type: "pulse", range: 280, strength: 240 }
      };
    }
    function abilitySummary(ab) {
      const trig = ab.trigger || {};
      const eff = ab.effect || {};
      const trigText =
        trig.type === "continuous"           ? `continuous`           :
        trig.type === "on-death"             ? `on death`             :
        trig.type === "on-absorb"            ? `on absorb`            :
        trig.type === "on-touched-by-bigger" ? `on touched by bigger` :
        trig.type === "on-hit-by-anti"       ? `on hit by anti-mote`  :
        trig.type === "on-near-edge"         ? `on near edge (${trig.distance || 80}px)` :
        trig.type === "on-growth-cross"      ? `when mass crosses ${trig.threshold || 200}` :
        trig.type === "every"
          ? `every ${(+trig.interval || 1).toFixed(1)}s${trig.jitter ? ` ±${(+trig.jitter).toFixed(1)}s` : ""}`
          : trig.type;
      const condText = (ab.conditions || []).map(c => {
        if (c.type === "selfMassGt")       return `mass > ${c.value}`;
        if (c.type === "selfMassLt")       return `mass < ${c.value}`;
        if (c.type === "kindCountLt")      return `kindCount < ${c.value}`;
        if (c.type === "worldKindCountLt") return `count(${c.kind || "any"}) < ${c.value}`;
        if (c.type === "timeAliveGt")      return `age > ${c.value}s`;
        if (c.type === "timeAliveLt")      return `age < ${c.value}s`;
        if (c.type === "nearEdge")         return `within ${c.value}px of edge`;
        if (c.type === "nearWell")         return `within ${c.value}px of well`;
        return c.type;
      }).join(" & ");
      let effText;
      if (eff.type === "pulse") {
        effText = `pulse (range ${eff.range || 280}, strength ${eff.strength || 240})`;
      } else if (eff.type === "emit-mote") {
        effText = `emit a mote (${(eff.massFraction || 0.005).toFixed(3)} of mass at ${eff.speed || 250} px/s)`;
      } else if (eff.type === "split") {
        const kref = eff.childKind && eff.childKind !== "self"
          ? ((KIND_META[eff.childKind] && KIND_META[eff.childKind].label) || eff.childKind)
          : "self";
        effText = `split into ${eff.count || 4} × ${kref}`;
      } else if (eff.type === "drain-field") {
        effText = `drain ${eff.rate || 40}/s within ${(eff.reachMul || 2.6).toFixed(1)}× radius`;
      } else if (eff.type === "spawn-child") {
        const childRef = eff.kind === "self" || !eff.kind ? "self"
          : (KIND_META[eff.kind] && KIND_META[eff.kind].label) || eff.kind;
        effText = `spawn ${eff.count || 1} × ${childRef} (r=${eff.radius || 8}, ${eff.speed || 80} px/s)`;
      } else if (eff.type === "dash") {
        effText = `dash ${eff.speed || 400} px/s (${eff.direction || "random"}, cap ${eff.maxSpeed || 600})`;
      } else if (eff.type === "shield") {
        effText = `shield for ${eff.duration || 2}s`;
      } else if (eff.type === "camo") {
        effText = `camo for ${eff.duration || 3}s`;
      } else if (eff.type === "freeze-self") {
        effText = `freeze self for ${eff.duration || 1}s`;
      } else if (eff.type === "convert-target") {
        effText = `convert ${eff.count || 1} ${eff.massFilter === "any" ? "" : "smaller "}target${(eff.count||1) > 1 ? "s" : ""} within ${eff.range || 200}px`;
      } else if (eff.type === "play-sound") {
        effText = `play "${eff.preset || "blip"}"${eff.intensity && eff.intensity !== 1 ? ` × ${eff.intensity}` : ""}`;
      } else {
        effText = eff.type || "(no effect)";
      }
      return condText ? `${trigText} [${condText}] → ${effText}` : `${trigText} → ${effText}`;
    }

    function renderAbilitiesSection() {
      const el = $("ke-abilities-section");
      if (!el) return;
      const abilities = ensureAbilities();
      let html = `
        <h3 style="font-size:12px; letter-spacing:2px; opacity:0.6; margin:18px 0 6px;">ABILITIES</h3>
        <p style="opacity:0.55; font-size:10px; margin:0 8px 8px;">
          Timed side-effects that fire alongside (and independently of) the rule evaluator.
          Pulse mimics the built-in Pulsar's gravity wave.
        </p>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin:0 8px 10px; align-items:center;">
          <button id="ke-ab-add" style="font-size:11px; padding:4px 10px;">+ Add ability</button>
          <select id="ke-ab-lib" style="font-size:11px;">
            <option value="">Add from library…</option>
            ${ABILITY_LIBRARY.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("")}
          </select>
        </div>`;
      if (abilities.length === 0) {
        html += `<div style="opacity:0.5; padding:10px 8px; text-align:center; font-size:11px;
          border:1px dashed rgba(255,255,255,0.15); border-radius:6px; margin:0 8px;">
          No abilities. Add a Pulse to make this kind throw out gravity waves.
        </div>`;
      }
      for (let idx = 0; idx < abilities.length; idx++) {
        const ab = abilities[idx];
        const trig = ab.trigger || {};
        const eff = ab.effect || {};
        const trigType = trig.type || "every";
        const interval = trig.interval !== undefined ? trig.interval : 3.0;
        const jitter   = trig.jitter   !== undefined ? trig.jitter   : 0.5;
        const range    = eff.range     !== undefined ? eff.range     : 280;
        const strength = eff.strength  !== undefined ? eff.strength  : 240;
        const massFrac = eff.massFraction !== undefined ? eff.massFraction : 0.005;
        const speed    = eff.speed     !== undefined ? eff.speed     : 250;
        const count    = eff.count     !== undefined ? eff.count     : 4;
        const reachMul = eff.reachMul  !== undefined ? eff.reachMul  : 2.6;
        const drainRate= eff.rate      !== undefined ? eff.rate      : 40;
        const effType  = eff.type || "pulse";
        html += `
          <div class="ability-card" data-idx="${idx}" style="border:1px solid rgba(180,140,255,0.18);
            border-radius:6px; padding:8px 10px; margin:6px 0; background:rgba(40,30,60,0.35);">
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
              <input data-af="enabled" data-idx="${idx}" type="checkbox" ${ab.enabled !== false ? "checked" : ""}
                     title="Enable this ability" style="margin:0;">
              <span class="ability-summary" data-idx="${idx}"
                    style="flex:1; font-size:11px; opacity:0.85; overflow:hidden;
                    text-overflow:ellipsis; white-space:nowrap;">${esc(abilitySummary(ab))}</span>
              <button data-aact="up"     data-idx="${idx}" style="font-size:10px; padding:2px 6px;">↑</button>
              <button data-aact="down"   data-idx="${idx}" style="font-size:10px; padding:2px 6px;">↓</button>
              <button data-aact="remove" data-idx="${idx}" style="font-size:10px; padding:2px 6px;
                background:rgba(120,40,40,0.5); border:1px solid rgba(255,140,140,0.3); color:#fdd;">✕</button>
            </div>
            <table style="width:100%; font-size:11px;">
              <tr><td style="padding:2px 8px; opacity:0.65; width:90px;">Trigger</td>
                  <td>
                    <select data-af="trigger.type" data-idx="${idx}" style="font-size:11px; margin-right:6px;">
                      <option value="every"               ${trigType==="every"             ?"selected":""}>every X seconds</option>
                      <option value="continuous"          ${trigType==="continuous"        ?"selected":""}>continuous (every tick)</option>
                      <option value="on-death"            ${trigType==="on-death"          ?"selected":""}>on death</option>
                      <option value="on-absorb"           ${trigType==="on-absorb"         ?"selected":""}>on absorb</option>
                      <option value="on-touched-by-bigger" ${trigType==="on-touched-by-bigger"?"selected":""}>on touched by bigger</option>
                      <option value="on-growth-cross"     ${trigType==="on-growth-cross"   ?"selected":""}>on growth crossing</option>
                      <option value="on-hit-by-anti"      ${trigType==="on-hit-by-anti"    ?"selected":""}>on hit by anti-mote</option>
                      <option value="on-near-edge"        ${trigType==="on-near-edge"      ?"selected":""}>on near edge</option>
                    </select>
                    ${trigType === "every" ? `
                      <input data-af="trigger.interval" data-idx="${idx}" type="number" step="0.1" min="0.1" max="60"
                             value="${interval}" style="width:70px; margin:0 4px;">
                      <span style="opacity:0.7;">s, jitter ±</span>
                      <input data-af="trigger.jitter" data-idx="${idx}" type="number" step="0.1" min="0" max="10"
                             value="${jitter}" style="width:60px; margin-left:4px;">
                      <span style="opacity:0.7;">s</span>` :
                    trigType === "continuous" ? `
                      <span style="font-size:10px; opacity:0.55;">always on (gated by conditions)</span>` :
                    trigType === "on-death" ? `
                      <span style="font-size:10px; opacity:0.55;">fires once when this kind is killed (mass already 0)</span>` :
                    trigType === "on-absorb" ? `
                      <span style="font-size:10px; opacity:0.55;">fires whenever this kind absorbs another circle</span>` :
                    trigType === "on-touched-by-bigger" ? `
                      <span style="font-size:10px; opacity:0.55;">fires before absorption — pair with split for Splitter-equivalent</span>` :
                    trigType === "on-growth-cross" ? `
                      <span style="opacity:0.7;">when mass crosses</span>
                      <input data-af="trigger.threshold" data-idx="${idx}" type="number" step="10" min="1" max="50000"
                             value="${trig.threshold !== undefined ? trig.threshold : 200}" style="width:80px; margin:0 4px;">
                      <span style="font-size:10px; opacity:0.55;">(once per crossing — resets if mass drops back below)</span>` :
                    trigType === "on-hit-by-anti" ? `
                      <span style="font-size:10px; opacity:0.55;">fires when struck by an anti-mote (each contact)</span>` :
                    trigType === "on-near-edge" ? `
                      <span style="opacity:0.7;">within</span>
                      <input data-af="trigger.distance" data-idx="${idx}" type="number" step="10" min="10" max="2000"
                             value="${trig.distance !== undefined ? trig.distance : 80}" style="width:70px; margin:0 4px;">
                      <span style="opacity:0.7;">px of bounds</span>` : ""}
                  </td></tr>
              <tr><td style="padding:2px 8px; opacity:0.65; vertical-align:top;">Conditions</td>
                  <td>
                    ${(ab.conditions || []).map((cond, ci) => `
                      <span style="display:inline-flex; align-items:center; gap:4px;
                            margin:2px 6px 2px 0; padding:2px 6px;
                            background:rgba(180,140,255,0.15);
                            border:1px solid rgba(180,140,255,0.3);
                            border-radius:10px; font-size:10px;">
                        <select data-af="cond.type" data-idx="${idx}" data-cidx="${ci}"
                                style="font-size:10px; padding:0 2px;">
                          <option value="selfMassGt"       ${cond.type==="selfMassGt"      ?"selected":""}>self.mass &gt;</option>
                          <option value="selfMassLt"       ${cond.type==="selfMassLt"      ?"selected":""}>self.mass &lt;</option>
                          <option value="kindCountLt"      ${cond.type==="kindCountLt"     ?"selected":""}>kindCount(self) &lt;</option>
                          <option value="worldKindCountLt" ${cond.type==="worldKindCountLt"?"selected":""}>kindCount(of kind) &lt;</option>
                          <option value="timeAliveGt"      ${cond.type==="timeAliveGt"     ?"selected":""}>timeAlive &gt; (s)</option>
                          <option value="timeAliveLt"      ${cond.type==="timeAliveLt"     ?"selected":""}>timeAlive &lt; (s)</option>
                          <option value="nearEdge"         ${cond.type==="nearEdge"        ?"selected":""}>near edge (px)</option>
                          <option value="nearWell"         ${cond.type==="nearWell"        ?"selected":""}>near gravity well (px)</option>
                        </select>
                        ${cond.type === "worldKindCountLt" ? `
                          <select data-af="cond.kind" data-idx="${idx}" data-cidx="${ci}"
                                  style="font-size:10px; padding:0 2px; max-width:110px;">
                            ${(() => {
                              const opt = (v, l) =>
                                `<option value="${esc(v)}" ${cond.kind === v ? "selected" : ""}>${esc(l)}</option>`;
                              let html = opt("any", "any");
                              for (const u of Kinds.userKinds()) html += opt(u.id, u.name);
                              for (const b of Kinds.builtinKinds()) html += opt(b.id, b.label);
                              return html;
                            })()}
                          </select>` : ""}
                        <input data-af="cond.value" data-idx="${idx}" data-cidx="${ci}"
                               type="number" step="1" value="${cond.value !== undefined ? cond.value : 0}"
                               style="width:60px; font-size:10px;">
                        <button data-aact="cond-remove" data-idx="${idx}" data-cidx="${ci}"
                                title="Remove condition"
                                style="font-size:10px; padding:0 4px; line-height:1;
                                background:transparent; border:none; color:#fdd; cursor:pointer;">✕</button>
                      </span>`).join("")}
                    <button data-aact="cond-add" data-idx="${idx}"
                            style="font-size:10px; padding:1px 8px; margin-left:2px;">+ Add</button>
                    ${(ab.conditions && ab.conditions.length > 1) ? `<span style="font-size:9px; opacity:0.5; margin-left:6px;">all must pass</span>` : ""}
                  </td></tr>
              <tr><td style="padding:2px 8px; opacity:0.65;">Effect</td>
                  <td>
                    <select data-af="effect.type" data-idx="${idx}" style="min-width:120px;">
                      <option value="pulse"          ${effType==="pulse"         ?"selected":""}>Pulse — outward shockwave</option>
                      <option value="emit-mote"      ${effType==="emit-mote"     ?"selected":""}>Emit mote</option>
                      <option value="split"          ${effType==="split"         ?"selected":""}>Split into N</option>
                      <option value="drain-field"    ${effType==="drain-field"   ?"selected":""}>Drain field — passive Glutton-style</option>
                      <option value="spawn-child"    ${effType==="spawn-child"   ?"selected":""}>Spawn child circles</option>
                      <option value="dash"           ${effType==="dash"          ?"selected":""}>Dash — one-shot velocity impulse</option>
                      <option value="shield"         ${effType==="shield"        ?"selected":""}>Shield — temporary invincibility</option>
                      <option value="camo"           ${effType==="camo"          ?"selected":""}>Camo — invisible to AI</option>
                      <option value="freeze-self"    ${effType==="freeze-self"   ?"selected":""}>Freeze self — stand still</option>
                      <option value="convert-target" ${effType==="convert-target"?"selected":""}>Convert target — turn nearby into self</option>
                      <option value="play-sound"     ${effType==="play-sound"    ?"selected":""}>Play sound — procedural SFX</option>
                    </select>
                  </td></tr>
              ${effType === "pulse" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Range</td>
                    <td><input data-af="effect.range" data-idx="${idx}" type="number" step="20" min="20" max="2000"
                               value="${range}" style="width:90px;"> px</td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Strength</td>
                    <td><input data-af="effect.strength" data-idx="${idx}" type="number" step="20" min="0" max="2000"
                               value="${strength}" style="width:90px;"> px/s impulse at centre</td></tr>` : ""}
              ${effType === "emit-mote" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Mass fraction</td>
                    <td><input data-af="effect.massFraction" data-idx="${idx}" type="number" step="0.001" min="0.0005" max="0.05"
                               value="${massFrac}" style="width:90px;"></td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Speed</td>
                    <td><input data-af="effect.speed" data-idx="${idx}" type="number" step="10" min="50" max="2000"
                               value="${speed}" style="width:90px;"> px/s</td></tr>` : ""}
              ${effType === "split" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Children</td>
                    <td><input data-af="effect.count" data-idx="${idx}" type="number" step="1" min="2" max="10"
                               value="${count}" style="width:60px;"></td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Child kind</td>
                    <td><select data-af="effect.childKind" data-idx="${idx}" style="min-width:170px;">
                      ${childKindOptionsHtml(eff.childKind || "self")}
                    </select></td></tr>` : ""}
              ${effType === "drain-field" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Reach</td>
                    <td><input data-af="effect.reachMul" data-idx="${idx}" type="number" step="0.1" min="1" max="10"
                               value="${reachMul}" style="width:90px;"> × self radius</td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Drain rate</td>
                    <td><input data-af="effect.rate" data-idx="${idx}" type="number" step="5" min="1" max="500"
                               value="${drainRate}" style="width:90px;"> mass/s at centre, falls to 0 at edge</td></tr>` : ""}
              ${effType === "dash" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Direction</td>
                    <td><select data-af="effect.direction" data-idx="${idx}">
                      <option value="random"          ${(eff.direction || "random") === "random"  ?"selected":""}>random angle</option>
                      <option value="current"         ${eff.direction === "current"               ?"selected":""}>keep current heading</option>
                      <option value="away-from-edge"  ${eff.direction === "away-from-edge"        ?"selected":""}>away from nearest wall</option>
                    </select></td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Impulse speed</td>
                    <td><input data-af="effect.speed" data-idx="${idx}" type="number" step="20" min="20" max="2000"
                               value="${(eff.speed !== undefined ? eff.speed : 400)}" style="width:80px;"> px/s added</td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Max speed</td>
                    <td><input data-af="effect.maxSpeed" data-idx="${idx}" type="number" step="50" min="50" max="3000"
                               value="${(eff.maxSpeed !== undefined ? eff.maxSpeed : 600)}" style="width:80px;"> px/s cap (stops repeated dashes from accumulating)</td></tr>` : ""}
              ${(effType === "shield" || effType === "camo" || effType === "freeze-self") ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Duration</td>
                    <td><input data-af="effect.duration" data-idx="${idx}" type="number" step="0.1" min="0.1" max="60"
                               value="${(eff.duration !== undefined ? eff.duration : (effType === "freeze-self" ? 1 : effType === "shield" ? 2 : 3))}"
                               style="width:80px;"> s</td></tr>` : ""}
              ${effType === "play-sound" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Sound</td>
                    <td><select data-af="effect.preset" data-idx="${idx}">
                      <option value="blip"   ${(eff.preset || "blip") === "blip"   ?"selected":""}>blip — short high tap</option>
                      <option value="chirp"  ${eff.preset === "chirp"               ?"selected":""}>chirp — rising tone</option>
                      <option value="thump"  ${eff.preset === "thump"               ?"selected":""}>thump — low percussion</option>
                      <option value="zap"    ${eff.preset === "zap"                 ?"selected":""}>zap — energy discharge</option>
                      <option value="ding"   ${eff.preset === "ding"                ?"selected":""}>ding — bell tail</option>
                      <option value="drone"  ${eff.preset === "drone"               ?"selected":""}>drone — sustained low</option>
                      <option value="pop"    ${eff.preset === "pop"                 ?"selected":""}>pop — noise crackle</option>
                    </select></td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Volume</td>
                    <td><input data-af="effect.intensity" data-idx="${idx}" type="number" step="0.1" min="0.1" max="2"
                               value="${(eff.intensity !== undefined ? eff.intensity : 1)}" style="width:60px;"> ×
                        <span style="font-size:10px; opacity:0.55;">attenuated by distance to player</span></td></tr>` : ""}
              ${effType === "convert-target" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Range</td>
                    <td><input data-af="effect.range" data-idx="${idx}" type="number" step="20" min="20" max="2000"
                               value="${(eff.range !== undefined ? eff.range : 200)}" style="width:80px;"> px</td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Max convert</td>
                    <td><input data-af="effect.count" data-idx="${idx}" type="number" step="1" min="1" max="20"
                               value="${(eff.count !== undefined ? eff.count : 1)}" style="width:60px;"> per fire</td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Mass filter</td>
                    <td><select data-af="effect.massFilter" data-idx="${idx}">
                      <option value="smaller" ${(eff.massFilter || "smaller") === "smaller" ?"selected":""}>only smaller than self</option>
                      <option value="any"     ${eff.massFilter === "any"                    ?"selected":""}>any size</option>
                    </select></td></tr>` : ""}
              ${effType === "spawn-child" ? `
                <tr><td style="padding:2px 8px; opacity:0.65;">Child kind</td>
                    <td><select data-af="effect.kind" data-idx="${idx}" style="min-width:170px;">
                      ${childKindOptionsHtml(eff.kind || "self")}
                    </select></td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Count</td>
                    <td><input data-af="effect.count" data-idx="${idx}" type="number" step="1" min="1" max="20"
                               value="${count}" style="width:60px;"></td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Child radius</td>
                    <td><input data-af="effect.radius" data-idx="${idx}" type="number" step="1" min="2" max="60"
                               value="${(eff.radius !== undefined ? eff.radius : 8)}" style="width:60px;"> px</td></tr>
                <tr><td style="padding:2px 8px; opacity:0.65;">Spread speed</td>
                    <td><input data-af="effect.speed" data-idx="${idx}" type="number" step="10" min="0" max="500"
                               value="${(eff.speed !== undefined ? eff.speed : 80)}" style="width:60px;"> px/s</td></tr>` : ""}
            </table>
          </div>`;
      }
      el.innerHTML = html;

      $("ke-ab-add").addEventListener("click", () => {
        abilities.push(blankAbility());
        renderAbilitiesSection();
        UI.refreshSelected();
        setDirty(true);
      });
      $("ke-ab-lib").addEventListener("change", e => {
        const i = parseInt(e.target.value, 10);
        if (Number.isNaN(i)) return;
        const fresh = JSON.parse(JSON.stringify(ABILITY_LIBRARY[i].ability));
        fresh.id = newAbilityId();
        abilities.push(fresh);
        e.target.value = "";
        renderAbilitiesSection();
        UI.refreshSelected();
        setDirty(true);
      });
      el.querySelectorAll("button[data-aact]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const aact = btn.dataset.aact;
          const ab = abilities[idx];
          if (aact === "remove") abilities.splice(idx, 1);
          else if (aact === "up" && idx > 0) {
            const t = abilities[idx - 1]; abilities[idx - 1] = abilities[idx]; abilities[idx] = t;
          } else if (aact === "down" && idx < abilities.length - 1) {
            const t = abilities[idx + 1]; abilities[idx + 1] = abilities[idx]; abilities[idx] = t;
          } else if (aact === "cond-add") {
            if (!Array.isArray(ab.conditions)) ab.conditions = [];
            // Default to a sensible self.mass > X condition.
            ab.conditions.push({ type: "selfMassGt", value: 30 });
          } else if (aact === "cond-remove") {
            const ci = parseInt(btn.dataset.cidx, 10);
            if (Array.isArray(ab.conditions)) ab.conditions.splice(ci, 1);
          } else return;
          renderAbilitiesSection();
          UI.refreshSelected();
          setDirty(true);
        });
      });
      el.querySelectorAll("input[data-af], select[data-af]").forEach(field => {
        field.addEventListener("change", () => {
          const idx = parseInt(field.dataset.idx, 10);
          const f = field.dataset.af;
          const ab = abilities[idx];
          let val = field.type === "number" ? (field.value === "" ? 0 : parseFloat(field.value))
                  : field.type === "checkbox" ? field.checked
                  : field.value;
          if (f === "enabled") ab.enabled = val;
          else if (f === "trigger.type") {
            ab.trigger = ab.trigger || {};
            ab.trigger.type = val;
            // Re-render: switching trigger type swaps the param row.
            renderAbilitiesSection();
            UI.refreshSelected();
            setDirty(true);
            return;
          }
          else if (f === "trigger.interval")  ab.trigger.interval = val;
          else if (f === "trigger.jitter")    ab.trigger.jitter = val;
          else if (f === "trigger.threshold") ab.trigger.threshold = val;
          else if (f === "trigger.distance")  ab.trigger.distance = val;
          else if (f === "cond.type" || f === "cond.value" || f === "cond.kind") {
            const ci = parseInt(field.dataset.cidx, 10);
            if (!Array.isArray(ab.conditions)) ab.conditions = [];
            const cond = ab.conditions[ci] || (ab.conditions[ci] = { type: "selfMassGt", value: 30 });
            if (f === "cond.type") {
              cond.type = val;
              // worldKindCountLt needs an extra kind selector — re-render
              // the section so the row swaps shape correctly.
              renderAbilitiesSection();
              UI.refreshSelected();
              setDirty(true);
              return;
            }
            if (f === "cond.value") cond.value = val;
            if (f === "cond.kind")  cond.kind  = val;
            const sum = el.querySelector(`.ability-summary[data-idx="${idx}"]`);
            if (sum) sum.textContent = abilitySummary(ab);
            setDirty(true);
            return;
          }
          else if (f === "effect.type") {
            ab.effect = ab.effect || {};
            ab.effect.type = val;
            // Re-render: effect-type change reveals different param rows.
            renderAbilitiesSection();
            UI.refreshSelected();
            setDirty(true);
            return;
          }
          else if (f === "effect.range")        ab.effect.range = val;
          else if (f === "effect.strength")     ab.effect.strength = val;
          else if (f === "effect.massFraction") ab.effect.massFraction = val;
          else if (f === "effect.speed")        ab.effect.speed = val;
          else if (f === "effect.count")        ab.effect.count = val;
          else if (f === "effect.reachMul")     ab.effect.reachMul = val;
          else if (f === "effect.rate")         ab.effect.rate = val;
          else if (f === "effect.kind")         ab.effect.kind = val;
          else if (f === "effect.childKind")    ab.effect.childKind = val;
          else if (f === "effect.radius")       ab.effect.radius = val;
          else if (f === "effect.direction")    ab.effect.direction = val;
          else if (f === "effect.duration")     ab.effect.duration = val;
          else if (f === "effect.massFilter")   ab.effect.massFilter = val;
          else if (f === "effect.maxSpeed")     ab.effect.maxSpeed = val;
          else if (f === "effect.preset")       ab.effect.preset = val;
          else if (f === "effect.intensity")    ab.effect.intensity = val;
          // Update summary text in place — no full re-render needed.
          const sum = el.querySelector(`.ability-summary[data-idx="${idx}"]`);
          if (sum) sum.textContent = abilitySummary(ab);
          setDirty(true);
        });
      });
    }

    renderAbilitiesSection();

    // ---- Pickup section -----------------------------------------------
    // Mark a kind as a pickup: on touch by player, it goes into the
    // player's inventory (FIFO, 9 slots). Activation key (X for attract
    // / C for repel) consumes the pickup and runs the configured effect
    // with the player as the actor — so a "pulse with strength -260"
    // recreates the built-in attract burst exactly.
    function defaultPickupEffect(slot) {
      return slot === "repel"
        ? { type: "pulse", range: 360, strength: 260 }
        : { type: "pulse", range: 360, strength: -260 };
    }
    function renderPickupSection() {
      const el = $("ke-pickup-section");
      if (!el) return;
      const enabled = !!(working.pickup && working.pickup.enabled);
      const slot = (working.pickup && working.pickup.slot) || "attract";
      const eff = (working.pickup && working.pickup.effect) || defaultPickupEffect(slot);
      let html = `
        <h3 style="font-size:12px; letter-spacing:2px; opacity:0.6; margin:18px 0 6px;">PICKUP</h3>
        <p style="opacity:0.55; font-size:10px; margin:0 8px 8px;">
          Marked-as-pickup kinds disappear when the player touches them and go into the inventory.
          Activation (X for attract slot, C for repel slot) fires the configured effect at the player.
        </p>
        <div style="margin:0 8px 8px;">
          <label style="font-size:11px;">
            <input id="ke-pickup-enabled" type="checkbox" ${enabled ? "checked" : ""}>
            This kind is a pickup
          </label>
        </div>`;
      if (enabled) {
        const range = eff.range !== undefined ? eff.range : 360;
        const strength = eff.strength !== undefined ? eff.strength : (slot === "attract" ? -260 : 260);
        const childKindSel = eff.kind || "self";
        const count    = eff.count    !== undefined ? eff.count    : 1;
        const radius   = eff.radius   !== undefined ? eff.radius   : 8;
        const speed    = eff.speed    !== undefined ? eff.speed    : 80;
        const dashDir  = eff.direction || "random";
        const dashSpd  = eff.speed     !== undefined ? eff.speed     : 400;
        const dashCap  = eff.maxSpeed  !== undefined ? eff.maxSpeed  : 600;
        const duration = eff.duration !== undefined ? eff.duration : 2;
        const sndPreset= eff.preset || "blip";
        const sndVol   = eff.intensity !== undefined ? eff.intensity : 1;
        html += `<table style="width:100%; font-size:11px; margin:0 0 8px;">
          <tr><td style="padding:2px 8px; opacity:0.65; width:100px;">Slot</td>
              <td>
                <select id="ke-pickup-slot" style="font-size:11px;">
                  <option value="attract" ${slot==="attract"?"selected":""}>Attract (X)</option>
                  <option value="repel"   ${slot==="repel"  ?"selected":""}>Repel (C)</option>
                </select>
                <span style="font-size:10px; opacity:0.55; margin-left:8px;">activates with the slot's button</span>
              </td></tr>
          <tr><td style="padding:2px 8px; opacity:0.65;">Activation effect</td>
              <td>
                <select id="ke-pickup-effect-type" style="font-size:11px;">
                  <option value="pulse"       ${eff.type==="pulse"      ?"selected":""}>Pulse — radial impulse around player</option>
                  <option value="spawn-child" ${eff.type==="spawn-child"?"selected":""}>Spawn child circles at player</option>
                  <option value="dash"        ${eff.type==="dash"       ?"selected":""}>Dash — push player</option>
                  <option value="shield"      ${eff.type==="shield"     ?"selected":""}>Shield player</option>
                  <option value="camo"        ${eff.type==="camo"       ?"selected":""}>Camo player</option>
                  <option value="play-sound"  ${eff.type==="play-sound" ?"selected":""}>Play sound</option>
                </select>
              </td></tr>
          ${eff.type === "pulse" ? `
            <tr><td style="padding:2px 8px; opacity:0.65;">Range</td>
                <td><input id="ke-pickup-range" type="number" step="20" min="20" max="2000" value="${range}" style="width:90px;"> px</td></tr>
            <tr><td style="padding:2px 8px; opacity:0.65;">Strength</td>
                <td><input id="ke-pickup-strength" type="number" step="20" min="-2000" max="2000" value="${strength}" style="width:90px;">
                    <span style="font-size:10px; opacity:0.55;">positive = repel, negative = attract</span></td></tr>
          ` : ""}
          ${eff.type === "spawn-child" ? `
            <tr><td style="padding:2px 8px; opacity:0.65;">Child kind</td>
                <td><select id="ke-pickup-childkind" style="min-width:170px;">
                  ${childKindOptionsHtml(childKindSel)}
                </select></td></tr>
            <tr><td style="padding:2px 8px; opacity:0.65;">Count</td>
                <td><input id="ke-pickup-count" type="number" step="1" min="1" max="20" value="${count}" style="width:60px;"></td></tr>
            <tr><td style="padding:2px 8px; opacity:0.65;">Child radius</td>
                <td><input id="ke-pickup-radius" type="number" step="1" min="2" max="60" value="${radius}" style="width:60px;"> px</td></tr>
            <tr><td style="padding:2px 8px; opacity:0.65;">Spread speed</td>
                <td><input id="ke-pickup-speed" type="number" step="10" min="0" max="500" value="${speed}" style="width:60px;"> px/s</td></tr>
          ` : ""}
          ${eff.type === "dash" ? `
            <tr><td style="padding:2px 8px; opacity:0.65;">Direction</td>
                <td><select id="ke-pickup-dashdir">
                  <option value="random"  ${dashDir==="random" ?"selected":""}>random angle</option>
                  <option value="current" ${dashDir==="current"?"selected":""}>player's current heading</option>
                </select></td></tr>
            <tr><td style="padding:2px 8px; opacity:0.65;">Impulse speed</td>
                <td><input id="ke-pickup-dashspd" type="number" step="20" min="20" max="2000" value="${dashSpd}" style="width:80px;"> px/s</td></tr>
            <tr><td style="padding:2px 8px; opacity:0.65;">Max speed</td>
                <td><input id="ke-pickup-dashcap" type="number" step="50" min="50" max="3000" value="${dashCap}" style="width:80px;"> px/s</td></tr>
          ` : ""}
          ${(eff.type === "shield" || eff.type === "camo") ? `
            <tr><td style="padding:2px 8px; opacity:0.65;">Duration</td>
                <td><input id="ke-pickup-duration" type="number" step="0.1" min="0.1" max="60" value="${duration}" style="width:80px;"> s</td></tr>
          ` : ""}
          ${eff.type === "play-sound" ? `
            <tr><td style="padding:2px 8px; opacity:0.65;">Sound</td>
                <td><select id="ke-pickup-sound">
                  <option value="blip"  ${sndPreset==="blip" ?"selected":""}>blip</option>
                  <option value="chirp" ${sndPreset==="chirp"?"selected":""}>chirp</option>
                  <option value="thump" ${sndPreset==="thump"?"selected":""}>thump</option>
                  <option value="zap"   ${sndPreset==="zap"  ?"selected":""}>zap</option>
                  <option value="ding"  ${sndPreset==="ding" ?"selected":""}>ding</option>
                  <option value="drone" ${sndPreset==="drone"?"selected":""}>drone</option>
                  <option value="pop"   ${sndPreset==="pop"  ?"selected":""}>pop</option>
                </select></td></tr>
            <tr><td style="padding:2px 8px; opacity:0.65;">Volume</td>
                <td><input id="ke-pickup-vol" type="number" step="0.1" min="0.1" max="2" value="${sndVol}" style="width:60px;"> ×</td></tr>
          ` : ""}
        </table>`;
      }
      el.innerHTML = html;

      $("ke-pickup-enabled").addEventListener("change", e => {
        if (e.target.checked) {
          working.pickup = working.pickup || { enabled: true, slot: "attract", effect: defaultPickupEffect("attract") };
          working.pickup.enabled = true;
        } else if (working.pickup) {
          working.pickup.enabled = false;
        }
        renderPickupSection();
        UI.refreshSelected();
        setDirty(true);
      });
      if (!enabled) return;

      const wireField = (id, fn) => {
        const node = $(id);
        if (!node) return;
        node.addEventListener("change", () => { fn(node); setDirty(true); });
      };
      wireField("ke-pickup-slot", n => {
        working.pickup.slot = n.value;
        // Flip pulse strength sign so attract↔repel slot toggles produce
        // the expected default behaviour.
        if (working.pickup.effect && working.pickup.effect.type === "pulse") {
          const s = working.pickup.effect.strength || 0;
          if ((n.value === "attract" && s > 0) || (n.value === "repel" && s < 0)) {
            working.pickup.effect.strength = -s;
          }
        }
        renderPickupSection();
        UI.refreshSelected();
      });
      wireField("ke-pickup-effect-type", n => {
        working.pickup.effect = { type: n.value };
        // Seed defaults so the new effect type isn't all-zero.
        const seed = working.pickup.effect;
        if (n.value === "pulse")       Object.assign(seed, defaultPickupEffect(working.pickup.slot));
        else if (n.value === "spawn-child") Object.assign(seed, { kind: "self", count: 3, radius: 10, speed: 100 });
        else if (n.value === "dash")        Object.assign(seed, { direction: "random", speed: 400, maxSpeed: 600 });
        else if (n.value === "shield")      Object.assign(seed, { duration: 3 });
        else if (n.value === "camo")        Object.assign(seed, { duration: 4 });
        else if (n.value === "play-sound")  Object.assign(seed, { preset: "ding", intensity: 1 });
        renderPickupSection();
        UI.refreshSelected();
      });
      // Field handlers for each effect's params.
      const e = working.pickup.effect;
      const num = id => $(id) ? parseFloat($(id).value) || 0 : 0;
      wireField("ke-pickup-range",     n => e.range = num("ke-pickup-range"));
      wireField("ke-pickup-strength",  n => e.strength = num("ke-pickup-strength"));
      wireField("ke-pickup-childkind", n => e.kind = n.value);
      wireField("ke-pickup-count",     n => e.count = parseInt(n.value, 10) || 1);
      wireField("ke-pickup-radius",    n => e.radius = num("ke-pickup-radius"));
      wireField("ke-pickup-speed",     n => e.speed = num("ke-pickup-speed"));
      wireField("ke-pickup-dashdir",   n => e.direction = n.value);
      wireField("ke-pickup-dashspd",   n => e.speed = num("ke-pickup-dashspd"));
      wireField("ke-pickup-dashcap",   n => e.maxSpeed = num("ke-pickup-dashcap"));
      wireField("ke-pickup-duration",  n => e.duration = num("ke-pickup-duration"));
      wireField("ke-pickup-sound",     n => e.preset = n.value);
      wireField("ke-pickup-vol",       n => e.intensity = num("ke-pickup-vol"));
    }
    renderPickupSection();

    // ---- Tests section (Phase 4) ---------------------------------------
    function ensureTests() {
      if (!Array.isArray(working.tests)) working.tests = [];
      return working.tests;
    }
    function newTestId() {
      return "t_" + Math.random().toString(36).slice(2, 8) +
                    Math.random().toString(36).slice(2, 6);
    }
    function blankTestLayout() {
      return {
        type: "sparse",
        bounds: { x: 0, y: 0, w: 1200, h: 800 },
        gravityCenters: [],
        randomVelocity: false,
        victoryCondition: "absorb_all",
        victoryParam: 60,
        kinds: [],
        circles: [
          { x: 600, y: 400, r: 22, kind: "player", hue: 180, vx: 0, vy: 0 }
        ]
      };
    }

    function renderTestsSection() {
      const el = $("ke-tests-section");
      if (!el) return;
      const tests = ensureTests();
      let html = `
        <h3 style="font-size:12px; letter-spacing:2px; opacity:0.6; margin:18px 0 6px;">TEST CASES</h3>
        <p style="opacity:0.55; font-size:10px; margin:0 8px 8px;">
          Author scenarios to watch your kind in action. Tests don't pass/fail — they just
          run in observation mode with time controls. Saved with the kind; embedded on export.
        </p>
        <div style="margin:0 8px 10px;">
          <button id="ke-test-add" style="font-size:11px; padding:4px 10px;">+ New test</button>
        </div>`;
      if (tests.length === 0) {
        html += `<div style="opacity:0.5; padding:10px 8px; text-align:center; font-size:11px;
          border:1px dashed rgba(255,255,255,0.15); border-radius:6px; margin:0 8px;">
          No tests yet — add one to set up a layout and watch your kind under specific conditions.
        </div>`;
      }
      for (let i = 0; i < tests.length; i++) {
        const t = tests[i];
        const circles = (t.layout && t.layout.circles) || [];
        const seed = t.seed !== undefined ? t.seed : 42;
        const ghost = !!t.ghostPlayer;
        html += `
          <div class="test-card" data-idx="${i}" style="border:1px solid rgba(120,200,255,0.18);
            border-radius:6px; padding:8px 10px; margin:6px 0; background:rgba(20,40,60,0.35);">
            <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
              <input data-tf="name" data-idx="${i}" type="text" maxlength="60"
                     value="${esc(t.name || "")}" style="flex:1; font-size:12px;">
              <span style="opacity:0.5; font-size:10px;">seed</span>
              <input data-tf="seed" data-idx="${i}" type="number" step="1"
                     value="${seed}" style="width:80px; font-size:11px;">
              <button data-tact="edit"   data-idx="${i}" style="font-size:10px; padding:2px 8px;"
                      title="Open this test layout in the level designer">Edit layout</button>
              <button data-tact="run"    data-idx="${i}" style="font-size:10px; padding:2px 8px;
                      background:rgba(40,120,180,0.35); border:1px solid rgba(120,200,255,0.4);">Run</button>
              <button data-tact="delete" data-idx="${i}" style="font-size:10px; padding:2px 6px;
                      background:rgba(120,40,40,0.5); border:1px solid rgba(255,140,140,0.3); color:#fdd;">✕</button>
            </div>
            <textarea data-tf="description" data-idx="${i}" rows="1" placeholder="What this test demonstrates…"
                      style="width:96%; font-size:11px; resize:vertical;">${esc(t.description || "")}</textarea>
            <div style="display:flex; gap:10px; align-items:center; margin-top:4px;">
              <label style="font-size:10px; opacity:0.75; cursor:pointer;"
                     title="Player is intangible: invisible to AI, ignores fields, no collisions. Useful to observe a test without interfering.">
                <input data-tf="ghostPlayer" data-idx="${i}" type="checkbox" ${ghost ? "checked" : ""}>
                Ghost player
              </label>
              <span style="opacity:0.5; font-size:10px;">${circles.length} circle${circles.length !== 1 ? "s" : ""} placed</span>
            </div>
          </div>`;
      }
      el.innerHTML = html;

      $("ke-test-add").addEventListener("click", () => {
        const id = commitWorking();
        if (!id) return;
        const t = {
          id: newTestId(),
          name: `Test ${ensureTests().length + 1}`,
          description: "",
          seed: 42,
          notes: "",
          layout: blankTestLayout()
        };
        ensureTests().push(t);
        Kinds.update(id, { tests: working.tests });
        Editor.openTestCase(id, t.id);
      });
      el.querySelectorAll("button[data-tact]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const t = ensureTests()[idx];
          const tact = btn.dataset.tact;
          if (tact === "delete") {
            // Commit any in-flight kind edits before the confirm dialog
            // takes over the overlay — the dialog clears overlay.innerHTML
            // when it finishes and we re-render the editor in `restore`,
            // which loads from storage.
            const id = commitWorking();
            if (!id) return;
            UI.confirm({
              title: "DELETE TEST",
              message: `Delete test "${t.name}"?`,
              yesLabel: "Delete", danger: true,
              onYes: () => {
                ensureTests().splice(idx, 1);
                Kinds.update(id, { tests: working.tests });
              },
              restore: () => UI.renderKindEditor(id)
            });
          } else if (tact === "edit") {
            const id = commitWorking();
            if (id) Editor.openTestCase(id, t.id);
          } else if (tact === "run") {
            const id = commitWorking();
            if (!id) return;
            // Re-embed user kind defs from the current registry so
            // edits to the kind's rules show up immediately on Run,
            // even if the test layout was saved before those edits.
            const layout = JSON.parse(JSON.stringify(t.layout || blankTestLayout()));
            layout.kinds = Kinds.collectUsedKinds(layout.circles || []);
            Game.startObservation({
              kindId: id, testId: t.id, seed: t.seed,
              layout, name: t.name, returnTo: "kind-editor",
              ghostPlayer: !!t.ghostPlayer
            });
          }
        });
      });
      el.querySelectorAll("input[data-tf], textarea[data-tf]").forEach(field => {
        field.addEventListener("change", () => {
          const idx = parseInt(field.dataset.idx, 10);
          const t = ensureTests()[idx];
          const f = field.dataset.tf;
          if (f === "seed") t.seed = parseInt(field.value, 10) || 0;
          else if (f === "name") t.name = field.value;
          else if (f === "description") t.description = field.value;
          else if (f === "ghostPlayer") t.ghostPlayer = field.checked;
          if (working.id) Kinds.update(working.id, { tests: working.tests });
        });
      });
    }

    // Save-state indicator. Any input/change event for fields the user
    // explicitly Saves flips it to dirty; commitWorking() flips back. Test
    // fields (name / seed / description / ghost-player) are excluded —
    // they auto-save themselves and shouldn't dirty the kind editor.
    let dirtyState = false;
    function setDirty(d) {
      if (dirtyState === d) return;
      dirtyState = d;
      const ind = $("ke-savestate");
      if (!ind) return;
      ind.textContent = d ? "● Unsaved" : "✓ Saved";
      ind.style.color = d ? "#ffb38a" : "#a4d4a4";
    }
    const dirtyFromEvent = e => {
      if (e.target && e.target.closest && e.target.closest("#ke-tests-section")) return;
      setDirty(true);
    };
    overlay.addEventListener("input",  dirtyFromEvent);
    overlay.addEventListener("change", dirtyFromEvent);

    // commitWorking: persist current edits without navigating away. Returns
    // the kind id (creating it on first commit). Used by Add Test / Edit
    // Layout / Run, all of which need the kind in storage before they can
    // do their thing.
    function commitWorking() {
      const name = $("ke-name").value.trim();
      if (!name) { toast("Name required"); return null; }
      working.name = name;
      working.description = $("ke-desc").value;
      working.hue = parseInt(hueIn.value, 10) || 0;
      // Tags are kept current by the chip widget's onChange handler;
      // sync once more here in case any chip is mid-commit.
      working.tags = tagChipInput.getTags();
      working.schemaVersion = 6;
      const preset = presetIn.value;
      if (preset === "drift") {
        working.movement = { type: "drift" };
      } else if (preset === "field") {
        const strength = clamp(parseFloat($("ke-field-strength").value) || 0, -2_000_000, 2_000_000);
        working.movement = { type: "field", field: { strength } };
      } else {
        const a = ensureActive();
        a.preset = preset;
        a.thrustFraction = clamp(parseFloat($("ke-tf").value) || 0.005, 0.0005, 0.05);
        a.thrustSpeed    = clamp(parseFloat($("ke-ts").value) || 450,   50,    2000);
        a.cooldown       = clamp(parseFloat($("ke-tc").value) || 0.05,  0.01,  2);
        if (preset !== "custom") delete a.rules;
      }
      if (!working.id) {
        const created = Kinds.add(working);
        working.id = created.id;
      } else {
        Kinds.update(working.id, working);
      }
      setDirty(false);
      return working.id;
    }

    renderTestsSection();

    const save = () => {
      const id = commitWorking();
      if (!id) return;
      toast(working.name);
      UI.renderKinds();
    };

    // Quick preview — looks for a saved design named "Quick Preview"
    // first; substitutes any __kut__ placeholder circles with the kind
    // being previewed. Falls back to a default sample layout when no
    // custom Quick Preview design exists. Auto-saves edits before
    // launching so the run uses the just-committed state.
    const quickPreview = () => {
      const id = commitWorking();
      if (!id) return;
      const k = Kinds.userKinds().find(uk => uk.id === id);
      if (!k) return;

      // Look for a user-authored Quick Preview design.
      let layout = null;
      try {
        const designs = JSON.parse(localStorage.getItem("lumenphage.designs") || "[]");
        const saved = designs.find(d => d.name === "Quick Preview");
        if (saved && saved.data) layout = JSON.parse(JSON.stringify(saved.data));
      } catch {}

      if (layout) {
        // Substitute __kut__ placeholders with the kind under preview.
        for (const c of (layout.circles || [])) {
          if (c.kind === "__kut__") {
            c.kind = id;
            c.hue = (typeof k.hue === "number") ? k.hue : 220;
          }
        }
        // Re-embed kind defs from the current registry so the latest
        // version of the kind under test (and any others referenced) is
        // used at runtime.
        layout.kinds = Kinds.collectUsedKinds(layout.circles || []);
        // Make sure the kind under preview is in the kinds list even if
        // collectUsedKinds missed it (e.g., user kind id not in registry
        // yet for some reason).
        if (!layout.kinds.some(kk => kk.id === id)) {
          layout.kinds.push(JSON.parse(JSON.stringify(k)));
        }
      } else {
        // Default fallback layout: player + 2 instances of the kind +
        // small / big neutrals + a hunter.
        const cx = 600, cy = 400;
        layout = {
          type: "sparse",
          bounds: { x: 0, y: 0, w: 1200, h: 800 },
          gravityCenters: [], randomVelocity: false,
          victoryCondition: "absorb_all", victoryParam: 60,
          kinds: [JSON.parse(JSON.stringify(k))],
          circles: [
            { x: cx,       y: cy,       r: 22, kind: "player",  hue: 180, vx: 0, vy: 0 },
            { x: cx - 200, y: cy - 60,  r: 16, kind: id,        hue: k.hue || 220, vx: 0, vy: 0 },
            { x: cx - 200, y: cy + 60,  r: 16, kind: id,        hue: k.hue || 220, vx: 0, vy: 0 },
            { x: cx - 360, y: cy,       r:  6, kind: "neutral", hue: 220, vx: 0, vy: 0 },
            { x: cx + 280, y: cy,       r: 22, kind: "neutral", hue: 220, vx: 0, vy: 0 },
            { x: cx + 280, y: cy - 180, r: 14, kind: "hunter",  hue:  30, vx: 0, vy: 0 }
          ]
        };
      }

      Game.startObservation({
        kindId: id, testId: "quick-preview", seed: 42,
        layout,
        name: `Preview: ${k.name}`,
        returnTo: "kind-editor",
        ghostPlayer: true
      });
    };

    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("click", () => {
        const action = el.dataset.action;
        if (action === "save") save();
        else if (action === "preview") quickPreview();
        else if (action === "cancel") UI.renderKinds();
      });
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
    });
    $("ke-name").focus(); $("ke-name").select();
    Game.selectedMenu = 0;
    UI.refreshSelected();
  },
});
