import { Editor } from "./editor.js";
import { highlightJSON } from "./highlight-json.js";
import { toast } from "./main.js";
import { World } from "./world.js";

// JsonPanel — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

export const JsonPanel = {
  visible: false,
  // Snapshot of the JSON at the time of the last Refresh / Update —
  // anchor for both "is the textarea ahead?" and "is the level ahead?"
  // checks.
  lastSyncedJSON: "",
  theme: "dark",        // "dark" | "light" — GitHub-themed token palette
  // Auto-pull edits from the designer into the textarea every frame.
  // When on, manual textarea edits get overwritten on the next change
  // — handy for watching the JSON live while building a level.
  autoSync: false,
  el: null,
  textareaEl: null,
  highlightEl: null,
  statusEl: null,

  ensureBuilt() {
    if (this.el) return;
    const panel = document.createElement("div");
    panel.id = "ed-json-panel";
    panel.className = "hidden";
    panel.innerHTML = `
      <div class="ed-json-header">
        <span class="title">LEVEL JSON</span>
        <span id="ed-json-status"></span>
        <span style="margin-left:auto; display:inline-flex; gap:8px; align-items:center;">
          <button id="ed-json-theme" title="Toggle dark / light theme (GitHub palette)">${this.theme === "dark" ? "☾ Dark" : "☼ Light"}</button>
          <label title="Auto-refresh the JSON whenever the designer changes (overwrites typed edits)">
            <input id="ed-json-autosync" type="checkbox" ${this.autoSync ? "checked" : ""}>
            auto
          </label>
          <button id="ed-json-refresh" title="Reload JSON from the level designer (discards textarea edits)">Refresh</button>
          <button id="ed-json-update" title="Parse JSON and apply it to the level designer">Update</button>
          <button id="ed-json-close" title="Close panel" style="padding:3px 7px;">×</button>
        </span>
      </div>
      <div class="ed-json-body">
        <pre><code id="ed-json-highlight"></code></pre>
        <textarea id="ed-json-text" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"></textarea>
      </div>
    `;
    document.body.appendChild(panel);
    this.el = panel;
    this.textareaEl  = panel.querySelector("#ed-json-text");
    this.highlightEl = panel.querySelector("#ed-json-highlight");
    this.statusEl    = panel.querySelector("#ed-json-status");
    this._applyTheme();

    this.textareaEl.addEventListener("input", () => {
      this._renderHighlight();
      this._syncScroll();
      this._updateStatus();
    });
    this.textareaEl.addEventListener("scroll", () => this._syncScroll());
    this.textareaEl.addEventListener("keydown", (e) => {
      // Tab inserts two spaces instead of moving focus.
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const ta = this.textareaEl;
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        this._renderHighlight();
        this._updateStatus();
      }
      // Block bubbling so the editor's window-level shortcuts (Ctrl-Z,
      // arrow keys for cursor movement, etc.) don't interfere with
      // typing into the textarea.
      e.stopPropagation();
    });

    panel.querySelector("#ed-json-refresh").onclick = () => this.refresh();
    panel.querySelector("#ed-json-update").onclick  = () => this.update();
    panel.querySelector("#ed-json-close").onclick   = () => this.toggle(false);
    panel.querySelector("#ed-json-theme").onclick = () => {
      this.theme = this.theme === "dark" ? "light" : "dark";
      this._applyTheme();
      const btn = panel.querySelector("#ed-json-theme");
      btn.textContent = this.theme === "dark" ? "☾ Dark" : "☼ Light";
    };
    panel.querySelector("#ed-json-autosync").onchange = (e) => {
      this.autoSync = e.target.checked;
      // Snap to the latest immediately so toggling on doesn't leave the
      // textarea showing a stale snapshot until the next designer edit.
      if (this.autoSync) this.refresh();
    };

    // Drag the panel by its header. Skips drags that started on an
    // interactive control (button, color input, etc.) so those still
    // work normally.
    const header = panel.querySelector(".ed-json-header");
    let drag = null;
    header.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const t = e.target;
      if (t.closest("button, input, select, textarea, label")) return;
      const rect = panel.getBoundingClientRect();
      drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
      // Switch to top/left positioning so dragging works regardless of
      // the initial right-anchored CSS placement.
      panel.style.left = `${rect.left}px`;
      panel.style.top  = `${rect.top}px`;
      panel.style.right = "auto"; panel.style.bottom = "auto";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      // Clamp so the title bar always stays grabbable on screen.
      const x = Math.max(0, Math.min(window.innerWidth  - 60, e.clientX - drag.dx));
      const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - drag.dy));
      panel.style.left = `${x}px`;
      panel.style.top  = `${y}px`;
    });
    window.addEventListener("mouseup", () => { drag = null; });

    // Keep the panel inside the viewport on window resize. CSS
    // max-width/-height already clamp the panel's size; we only need to
    // pull a left/top-anchored panel back in if the viewport shrank
    // past the panel's right or bottom edge. Right/bottom-anchored
    // initial placement self-corrects.
    window.addEventListener("resize", () => this._clampToViewport());
  },

  _clampToViewport() {
    if (!this.el) return;
    const cs = getComputedStyle(this.el);
    // Only nudge the panel when it's positioned via left/top (the state
    // we switch to as soon as the user drags). Right/bottom-anchored
    // panels stick to their edge automatically.
    if (cs.left === "auto") return;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    const maxLeft = Math.max(0, window.innerWidth  - w);
    const maxTop  = Math.max(0, window.innerHeight - h);
    const left = parseFloat(cs.left) || 0;
    const top  = parseFloat(cs.top)  || 0;
    this.el.style.left = `${Math.max(0, Math.min(maxLeft, left))}px`;
    this.el.style.top  = `${Math.max(0, Math.min(maxTop,  top))}px`;
  },

  toggle(force) {
    this.ensureBuilt();
    const next = (typeof force === "boolean") ? force : !this.visible;
    if (next === this.visible) return;
    this.visible = next;
    this.el.classList.toggle("hidden", !next);
    if (next) {
      this.refresh();
      // The panel might have been dragged off-screen and then hidden
      // before a window resize — clamp back into view on every show.
      this._clampToViewport();
      // Defer focus so it lands after the show transition.
      setTimeout(() => this.textareaEl && this.textareaEl.focus(), 0);
    }
    if (Editor.active) Editor.renderBar();   // toggle button label tracks state
  },

  // Reload the textarea from the level. Drops any pending edits.
  refresh() {
    if (!Editor.active) return;
    const text = this._currentJSON();
    this.lastSyncedJSON = text;
    if (this.textareaEl) {
      this.textareaEl.value = text;
      this._renderHighlight();
      this._syncScroll();
      this._updateStatus();
    }
  },

  // Parse the textarea and apply it to the level.
  update() {
    if (!Editor.active || !this.textareaEl) return;
    let parsed;
    try { parsed = JSON.parse(this.textareaEl.value); }
    catch (err) { toast(`JSON error: ${err.message}`); return; }
    // Snapshot the camera so the user keeps looking at the same patch
    // of the world after Update — deserialize routes through World.reset
    // which clobbers cameraX/Y/Scale, so we restore from the snapshot
    // rather than re-anchoring on the player. (camera is in world units
    // anchored at the level origin (0, 0), so it survives any in-place
    // edits to the level.)
    const camX = World.cameraX, camY = World.cameraY, camScale = World.cameraScale;
    Editor.pushHistory();
    try {
      Editor.deserialize(parsed);
    } catch (err) {
      // Roll back to the snapshot pushHistory just took, so a malformed
      // payload can't leave the level half-loaded.
      Editor.undo();
      toast(`Apply error: ${err.message}`);
      return;
    }
    Editor.dirty = true;
    World.cameraX = camX; World.cameraY = camY; World.cameraScale = camScale;
    Editor.renderBar();
    // Re-format from the now-applied data so canonical whitespace and
    // any normalizations the deserialize step performed are visible.
    const text = this._currentJSON();
    this.lastSyncedJSON = text;
    this.textareaEl.value = text;
    this._renderHighlight();
    this._syncScroll();
    this._updateStatus();
    toast("Level updated from JSON");
  },

  // Per-frame status refresh. Cheap — small JSON, runs only while open.
  tick() {
    if (this.visible && !Editor.active) { this.toggle(false); return; }
    if (!this.visible) return;
    // When auto-sync is on, pull any designer-side change into the
    // textarea before computing the status badges.
    if (this.autoSync) {
      const cur = this._currentJSON();
      if (cur !== this.lastSyncedJSON) this.refresh();
    }
    this._updateStatus();
  },

  _currentJSON() {
    return JSON.stringify(Editor.serialize(), null, 2);
  },

  _updateStatus() {
    if (!this.statusEl || !this.textareaEl) return;
    const text  = this.textareaEl.value;
    const cur   = Editor.active ? this._currentJSON() : this.lastSyncedJSON;
    const dirty = text !== this.lastSyncedJSON;
    const stale = cur  !== this.lastSyncedJSON;
    let html = "";
    if (dirty) html += `<span class="badge dirty">edits</span>`;
    if (stale) html += `<span class="badge stale">level changed</span>`;
    if (!dirty && !stale) html = `<span class="badge ok">in sync</span>`;
    this.statusEl.innerHTML = html;
  },

  _renderHighlight() {
    if (this.highlightEl && this.textareaEl) {
      this.highlightEl.innerHTML = highlightJSON(this.textareaEl.value);
    }
  },

  _syncScroll() {
    if (!this.textareaEl || !this.highlightEl) return;
    const ta = this.textareaEl;
    // Move the highlighted glyphs to mirror the textarea's scroll. The
    // pre is overflow-hidden; this transform is what scrolls visually.
    this.highlightEl.style.transform =
      `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  },

  _applyTheme() {
    if (!this.el) return;
    // CSS handles the palette via `[data-mode="..."]` selector vars.
    this.el.setAttribute("data-mode", this.theme);
  },
};
