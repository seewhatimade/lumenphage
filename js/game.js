import { Audio_ } from "./audio.js";
import { Editor } from "./editor.js";
import { KIND_BUILTINS } from "./kind-builtins.js";
import { Kinds } from "./kinds.js";
import { Campaign, editorBar, editorHelp, hud } from "./main.js";
import { Player } from "./player.js";
import { SeenKinds } from "./seen-kinds.js";
import { Settings } from "./settings.js";
import { Stats } from "./stats.js";
import { UI } from "./ui.js";
import { View } from "./view.js";
import { World } from "./world.js";

// Game — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   UI / Game state machine
// ============================================================

export const Game = {
  state: "menu",  // menu | campaign | hint | playing | paused | designer | win | lose
  selectedMenu: 0,
  // `paused` is derived from `state` — there's only one source of
  // truth. Writing to `Game.paused = true|false` flips state between
  // "playing" and "paused" for backward compatibility with the
  // assignment-style call sites that pre-date this refactor.
  get paused() { return this.state === "paused"; },
  set paused(v) {
    if (v && this.state === "playing") this.state = "paused";
    else if (!v && this.state === "paused") this.state = "playing";
  },
  campaignLevelId: null,   // set while playing a campaign level
  endHandled: false,       // tracks whether end-of-level UI was already shown
  currentStatsKey: null,   // identifier for stats tracking on the active session
  currentPeakMass: 0,

  // ----- Phase 4: test-run / observation mode --------------------------
  // When playing a kind's authored test case, observation is set and the
  // game runs without a victory state, with time controls overlaid. The
  // pending seed is consumed by the next World.reset() so a re-run of the
  // same test reproduces the same chaotic trajectory (best-effort — float
  // ordering can still drift over long runs).
  observation: null,       // null | { kindId, testId, seed, name }
  timeScale: 1,            // 0.25 | 0.5 | 1 | 2 | 4
  _pendingSeed: null,
  _stepOnce: false,        // true for one frame after the user clicks Step

  toMenu() {
    this.state = "menu";
    this.selectedMenu = 0;
    this.campaignLevelId = null;
    this.endHandled = false;
    World.reset();
    // Drop any level-embedded kind overrides so the next thing the user
    // opens (custom-game form, level designer, kinds list) sees only the
    // local registry.
    Kinds._rebuildKindMeta();
    Audio_.startMusic("lobby");
    UI.renderMenu();
  },

  // ----- Phase 4: observation mode --------------------------------
  // Run a kind's test layout with no win/lose state and a time-control
  // HUD overlay. The seed is fed into World via _pendingSeed so re-runs
  // start from the same RNG state. `Game.observation` stays truthy until
  // endObservation() returns to wherever the run was launched from.
  startObservation(opts) {
    // opts: { kindId, testId, seed, layout, name, returnTo, ghostPlayer }
    Audio_.init(); Audio_.resume(); Audio_.startMusic(opts.music || "glacial");
    Editor._lastPlayedDesign = null;
    Game._pendingSeed = (opts.seed >>> 0) || 1;
    this.observation = {
      kindId: opts.kindId, testId: opts.testId,
      seed: Game._pendingSeed, name: opts.name || "Test",
      returnTo: opts.returnTo || "kind-editor",
      ghostPlayer: !!opts.ghostPlayer,
      // Phase 5: live debug + stats accumulators, both toggled from the
      // observation bar. ruleFires is keyed by ruleIdx in the kind's rule
      // list and only counts circles whose c.kind === kindId.
      debugOverlay: false,
      showStats: false,
      ruleFires: {},
      // Stash the layout (and music) the run started from so the Restart
      // button can re-enter without leaving observation mode.
      _layout: opts.layout,
      _music: opts.music || "glacial"
    };
    this.timeScale = 1;
    Editor.deserialize(opts.layout);
    if (!World.player) {
      // Tests without a player still observe — clamp camera to bounds.
      View.followPlayer = false;
    }
    Player.aim = 0; Player.inventory = []; View.zoomMod = 1;
    View.snapToPlayer({ intro: !!Settings.load().introZoom, duration: Settings.load().introZoomDuration });
    this.state = "playing";
    this.paused = false;
    this.endHandled = false;
    this.campaignLevelId = null;
    this.currentStatsKey = null;
    this.currentPeakMass = 0;
    Game._replay = null; Game._replayMusic = null; Game._reroll = null;
    World.levelName = `Test: ${opts.name || ""}`;
    UI.clearOverlay();
    hud.classList.remove("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
    Editor.active = false;
    Editor.testStash = null;
    UI.renderObservationOverlay();
  },

  endObservation() {
    const obs = this.observation;
    this.observation = null;
    this.timeScale = 1;
    Game._stepOnce = false;
    UI.clearObservationOverlay();
    if (obs && obs.kindId && obs.testId && obs.returnTo === "test-designer") {
      // Caller was authoring the test layout — go back to the designer
      // with the same test loaded.
      Editor.openTestCase(obs.kindId, obs.testId);
    } else if (obs && obs.kindId && obs.returnTo === "builtin-inspector") {
      UI.renderBuiltinInspector(obs.kindId);
    } else if (obs && obs.kindId && Kinds.userKinds().some(k => k.id === obs.kindId)) {
      UI.renderKindEditor(obs.kindId);
    } else if (obs && obs.kindId && KIND_BUILTINS[obs.kindId]) {
      // Fallback: built-in kindId without explicit returnTo — land on the
      // inspector so the user has somewhere sensible to go next.
      UI.renderBuiltinInspector(obs.kindId);
    } else {
      this.toMenu();
    }
  },

  setTimeScale(s) {
    if (!this.observation) return;
    this.timeScale = s;
    UI.renderObservationOverlay();
  },
  toggleObservationPause() {
    if (!this.observation) return;
    this.paused = !this.paused;
    this.state = this.paused ? "paused" : "playing";
    UI.renderObservationOverlay();
  },
  observationStep() {
    if (!this.observation) return;
    if (!this.paused) { this.paused = true; this.state = "paused"; }
    Game._stepOnce = true;
    UI.renderObservationOverlay();
  },
  // Re-enter the same test run from a fresh seed/layout without leaving
  // observation mode. Preserves the user's Debug / Stats toggles —
  // re-clicking those after every restart is friction.
  restartObservation() {
    const prev = this.observation;
    if (!prev || !prev._layout) return;
    const keepDebug = prev.debugOverlay;
    const keepStats = prev.showStats;
    this.startObservation({
      kindId:      prev.kindId,
      testId:      prev.testId,
      seed:        prev.seed,
      layout:      prev._layout,
      name:        prev.name,
      returnTo:    prev.returnTo,
      ghostPlayer: prev.ghostPlayer,
      music:       prev._music
    });
    this.observation.debugOverlay = keepDebug;
    this.observation.showStats    = keepStats;
    UI.renderObservationOverlay();
    if (keepStats) UI.renderObservationStats();
  },

  startLevel(loader, opts = {}) {
    Audio_.init(); Audio_.resume();
    Audio_.startMusic(opts.music || "calm");
    // Any non-design start invalidates the saved-design replay pointer.
    Editor._lastPlayedDesign = null;
    loader();
    Player.aim = 0;
    Player.inventory = [];
    View.zoomMod = 1;
    // Camera starts where the player is — no slide from the corner.
    // Intro zoom (settable) starts zoomed-out and lerps in.
    View.snapToPlayer({ intro: !!Settings.load().introZoom, duration: Settings.load().introZoomDuration });
    this.state = "playing";
    this.paused = false;
    this.endHandled = false;
    this.campaignLevelId = opts.campaignLevelId || null;
    // Optional replay hook: callers that build a level from caller-side
    // state (e.g. custom cfg) supply one so "Try again" can rebuild it
    // exactly instead of falling through to a generic type-based regen.
    // `_reroll` is a sibling for "new random" — when set, the end screen
    // surfaces a second action that re-rolls instead of replaying.
    this._replay      = opts.replay || null;
    this._replayMusic = opts.music  || null;
    this._reroll      = opts.reroll || null;
    this.currentStatsKey = opts.statsKey ||
      (opts.campaignLevelId != null ? `c${opts.campaignLevelId}` : null);
    this.currentPeakMass = World.player ? World.player.mass : 0;

    // Pre-roll: if any unfamiliar kinds are in this world, pause and show the
    // nameplate intro before recording the start / handing control to play.
    const newKinds = SeenKinds.newKindsInWorld();
    if (newKinds.length > 0) {
      this.paused = true;
      UI.renderNewKinds(newKinds, () => {
        for (const k of newKinds) SeenKinds.markSeen(k);
        Game.paused = false;
        if (Game.currentStatsKey) Stats.recordStart(Game.currentStatsKey);
        UI.clearOverlay();
      });
      hud.classList.remove("hidden");
      editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
      return;
    }

    if (this.currentStatsKey) Stats.recordStart(this.currentStatsKey);
    UI.clearOverlay();
    hud.classList.remove("hidden");
    editorBar.classList.add("hidden"); editorHelp.classList.add("hidden");
  },

  startCampaignLevel(id) {
    const lvl = Campaign.byId(id);
    if (!lvl) return;
    // Music varies by stage — gentle to vast as the campaign opens up.
    const stageMusic = {
      "Tutorial":    "calm",    "Physics":     "tide",
      "Predation":   "aurora",  "Convergence": "aurora",
      "Strategy":    "glacial", "Endurance":   "nebula"
    };
    this.startLevel(() => { lvl.build(); World.levelName = `${id}. ${lvl.name}`; },
                    { campaignLevelId: id, music: stageMusic[lvl.stage] || "calm" });
  },

  togglePause() {
    if (this.state !== "playing" && this.state !== "paused") return;
    this.paused = !this.paused;
    this.state = this.paused ? "paused" : "playing";
    if (this.paused) UI.renderPause(); else UI.clearOverlay();
  }
};
