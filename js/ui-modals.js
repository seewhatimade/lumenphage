import { Game } from "./game.js";
import { overlay, syncInputEdges } from "./main.js";
import { UI } from "./ui.js";

// UI — split across multiple files (see js/ui.js for the menu
// dispatcher + shared helpers; this file holds one method group).
// Method group "modals" — extracted from ui.js.
// Re-attached to the live god-object via Object.assign so `this`
// inside each method still points at the same instance and every
// existing call site keeps working unchanged.

Object.assign(UI, {
  // In-app confirmation modal — replaces window.confirm() so we stay in the
  // app's visual language. Overlay is taken over briefly; the caller can
  // optionally pass a `restore` thunk that re-renders whatever panel was
  // showing beforehand.
  // In-app text-input dialog. Replaces window.prompt() with a styled overlay.
  // opts: { title, message, defaultValue, placeholder, yesLabel, noLabel,
  //         onYes(value), onNo(), restore() }
  // Empty / whitespace-only values trigger onNo (treated as cancel).
  prompt(opts) {
    const yesLabel = opts.yesLabel || "Save";
    const noLabel  = opts.noLabel  || "Cancel";
    const prevState = Game.state;
    Game.state = "confirm";
    UI._promptOpen = true;
    syncInputEdges();
    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    overlay.innerHTML = `<div class="panel" style="text-align:center; max-width:480px;">
      ${opts.title ? `<h2 style="font-size:18px; letter-spacing:3px;">${esc(opts.title)}</h2>` : ""}
      ${opts.message ? `<p style="margin: 8px 0 12px; line-height:1.5;">${esc(opts.message)}</p>` : ""}
      <input id="lp-prompt-input" type="text"
        value="${esc(opts.defaultValue || "")}"
        placeholder="${esc(opts.placeholder || "")}"
        style="width: 80%; font-size: 14px; padding: 6px 10px;
               background: rgba(20,40,60,0.7); color: #d8efff;
               border: 1px solid rgba(120,200,255,0.35); border-radius: 4px;
               text-align: center; font-family: inherit;">
      <div id="menu-list" style="display:flex; gap:8px; justify-content:center; margin-top:18px;">
        <div class="menu-item selected" data-action="yes"
             style="background: rgba(60,160,200,0.4);">${esc(yesLabel)}</div>
        <div class="menu-item" data-action="no">${esc(noLabel)}</div>
      </div>
    </div>`;
    Game.selectedMenu = 0;
    const input = document.getElementById("lp-prompt-input");
    setTimeout(() => { input.focus(); input.select(); }, 0);

    const finish = (yes) => {
      const value = input.value.trim();
      overlay.innerHTML = "";
      Game.state = prevState;
      UI._promptOpen = false;
      if (yes && value && opts.onYes) opts.onYes(value);
      else if ((!yes || !value) && opts.onNo) opts.onNo();
      if (opts.restore) opts.restore();
    };

    input.addEventListener("keydown", e => {
      if (e.key === "Enter")  { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
      e.stopPropagation();   // don't bubble to window keydown listener
    });

    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
      el.addEventListener("click", () => finish(el.dataset.action === "yes"));
    });
    UI.refreshSelected();
  },

  confirm(opts) {
    const yesLabel = opts.yesLabel || "Yes";
    const noLabel  = opts.noLabel  || "Cancel";
    const danger   = !!opts.danger;
    const prevState = Game.state;
    Game.state = "confirm";
    syncInputEdges();
    overlay.innerHTML = `<div class="panel" style="text-align:center; max-width:480px;">
      ${opts.title ? `<h2 style="font-size:18px; letter-spacing:3px;">${opts.title}</h2>` : ""}
      <p style="margin: ${opts.title ? "8px" : "4px"} 0 18px; line-height:1.5;">${opts.message}</p>
      <div id="menu-list" style="display:flex; gap:8px; justify-content:center;">
        <div class="menu-item${danger ? " danger" : ""}" data-action="yes">${yesLabel}</div>
        <div class="menu-item selected" data-action="no">${noLabel}</div>
      </div>
    </div>`;
    Game.selectedMenu = 1;   // default focus: No
    const finish = (yes) => {
      overlay.innerHTML = "";
      Game.state = prevState;
      if (yes && opts.onYes) opts.onYes();
      else if (!yes && opts.onNo) opts.onNo();
      if (opts.restore) opts.restore();
    };
    overlay.querySelectorAll(".menu-item").forEach((el, i) => {
      el.addEventListener("mouseenter", () => { Game.selectedMenu = i; UI.refreshSelected(); });
      el.addEventListener("click", () => finish(el.dataset.action === "yes"));
    });
    UI.refreshSelected();
  },
});
