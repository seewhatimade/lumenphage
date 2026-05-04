import { Debug } from "./debug.js";
import { Game } from "./game.js";
import { Player } from "./player.js";

// Touch — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ---- Touch controls ----------------------------------------------
//
// Floating virtual stick on the left half of the screen drives both aim
// (direction = stick angle, set absolutely on Player.aim) and thrust
// (any drag past the deadzone holds thrust). The right side has tap
// buttons for Boost and — only when the player owns one — Attract / Repel.
// All actions feed through the existing actionPressed/actionJustPressed
// layer so gameplay code is untouched.
export const Touch = {
  enabled: false,
  stick: {
    active: false, pointerId: null,
    cx: 0, cy: 0, tx: 0, ty: 0,
    radius: 80,
    // Two-zone: drags past deadzone aim; drags past thrustZone also thrust.
    // The aim-only band lets mobile players rotate without burning mass.
    deadzone: 12,
    thrustZone: 50
  },
  aim: 0,
  aimActive: false,
  thrustHeld: false,
  buttons: { boost: false, attract: false, repel: false, pause: false },

  init() {
    const supported = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    if (!supported) return;
    this.enabled = true;

    const ui = document.getElementById("touch-ui");
    const zone = document.getElementById("touch-stick-zone");
    if (!ui || !zone) return;

    zone.addEventListener("pointerdown", e => this._stickStart(e));
    zone.addEventListener("pointermove", e => this._stickMove(e));
    zone.addEventListener("pointerup",   e => this._stickEnd(e));
    zone.addEventListener("pointercancel", e => this._stickEnd(e));

    this._wireButton("touch-btn-boost",   "boost");
    this._wireButton("touch-btn-attract", "attract");
    this._wireButton("touch-btn-repel",   "repel");
  },

  _stickStart(e) {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.stick.active = true;
    this.stick.pointerId = e.pointerId;
    this.stick.cx = x; this.stick.cy = y;
    this.stick.tx = x; this.stick.ty = y;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    this._compute();
    this._updateStickVisual();
  },
  _stickMove(e) {
    if (!this.stick.active || e.pointerId !== this.stick.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    this.stick.tx = e.clientX - r.left;
    this.stick.ty = e.clientY - r.top;
    this._compute();
    this._updateStickVisual();
  },
  _stickEnd(e) {
    if (e.pointerId !== this.stick.pointerId) return;
    this.stick.active = false;
    this.aimActive = false;
    this.thrustHeld = false;
    this._updateStickVisual();
  },
  _compute() {
    const dx = this.stick.tx - this.stick.cx;
    const dy = this.stick.ty - this.stick.cy;
    const m = Math.hypot(dx, dy);
    if (m < this.stick.deadzone) {
      this.aimActive = false;
      this.thrustHeld = false;
      return;
    }
    this.aim = Math.atan2(dy, dx);
    this.aimActive = true;
    this.thrustHeld = m >= this.stick.thrustZone;
  },
  _updateStickVisual() {
    const base = document.getElementById("touch-stick-base");
    const tip  = document.getElementById("touch-stick-tip");
    if (!base || !tip) return;
    if (!this.stick.active) {
      base.classList.add("hidden"); tip.classList.add("hidden");
      return;
    }
    base.classList.remove("hidden"); tip.classList.remove("hidden");
    base.style.transform = `translate(${this.stick.cx - 60}px, ${this.stick.cy - 60}px)`;
    const dx = this.stick.tx - this.stick.cx;
    const dy = this.stick.ty - this.stick.cy;
    const m = Math.hypot(dx, dy);
    const r = Math.min(m, this.stick.radius);
    const tx = this.stick.cx + (m > 0 ? dx / m * r : 0);
    const ty = this.stick.cy + (m > 0 ? dy / m * r : 0);
    tip.style.transform = `translate(${tx - 26}px, ${ty - 26}px)`;
    tip.classList.toggle("thrust", this.thrustHeld);
  },

  _wireButton(id, name) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("pointerdown", e => {
      e.preventDefault();
      this.buttons[name] = true;
      btn.classList.add("pressed");
      try { btn.setPointerCapture(e.pointerId); } catch {}
    });
    const release = () => {
      this.buttons[name] = false;
      btn.classList.remove("pressed");
    };
    btn.addEventListener("pointerup",     release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave",  release);
  },

  // Show / hide the touch UI and the conditional pickup buttons.
  // Called every frame so it stays in sync with state and inventory.
  refresh() {
    if (!this.enabled) return;
    const ui = document.getElementById("touch-ui");
    if (!ui) return;
    const visible = Game.state === "playing" && !Game.paused;
    ui.classList.toggle("hidden", !visible);

    if (!visible) {
      // Hidden mid-touch (death / end-screen / pause) — clear any held
      // state so it doesn't leak into the next play session.
      if (this.stick.active) {
        this.stick.active = false;
        this.aimActive = false;
        this.thrustHeld = false;
        this._updateStickVisual();
      }
      for (const k of Object.keys(this.buttons)) {
        if (!this.buttons[k]) continue;
        this.buttons[k] = false;
        const el = document.getElementById("touch-btn-" + k);
        if (el) el.classList.remove("pressed");
      }
      return;
    }

    const inv = Player.inventory || [];
    const unlimited = Debug.get("unlimitedPickups");
    // Entries are { slot, kindId, effect }. Old string entries (legacy)
    // are tolerated via a fallback `e === "attract"` check.
    const hasAttract = unlimited || inv.some(e => (e && (e.slot === "attract" || e === "attract")));
    const hasRepel   = unlimited || inv.some(e => (e && (e.slot === "repel"   || e === "repel")));
    const a = document.getElementById("touch-btn-attract");
    const r = document.getElementById("touch-btn-repel");
    // Don't yank a button out from under a finger mid-press.
    if (a && !a.classList.contains("pressed")) a.classList.toggle("hidden", !hasAttract);
    if (r && !r.classList.contains("pressed")) r.classList.toggle("hidden", !hasRepel);
  }
};
