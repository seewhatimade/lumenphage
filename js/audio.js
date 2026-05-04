import { Settings } from "./settings.js";

// Audio_ — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   AUDIO — calm thoughtful pad music + procedural SFX
// ============================================================

export const Audio_ = {
  ctx: null, masterGain: null, musicGain: null, sfxGain: null,
  musicNodes: [], musicStarted: false,
  init() {
    if (this.ctx) return;
    const C = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = C;
    this.masterGain = C.createGain();
    this.musicGain  = C.createGain();
    this.sfxGain    = C.createGain();
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(C.destination);
    this.applyVolumes();
  },
  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },
  // Apply volumes from Settings — called on init, and live whenever the
  // user moves a slider. Music/SFX gains are scaled down a bit so 1.0 on the
  // slider doesn't clip.
  applyVolumes() {
    if (!this.ctx) return;
    const s = Settings.load();
    this.masterGain.gain.value = s.masterVolume;
    this.musicGain.gain.value  = s.musicVolume * 0.5;   // music headroom
    this.sfxGain.gain.value    = s.sfxVolume   * 0.7;
  },
  // Distance-based volume scale for ambient/world events (splitter pop,
  // pulsar pulse). Returns 1.0 within `near`, fades to 0 at `far`.
  proximity(source, listener, near = 320, far = 1100) {
    if (!source || !listener) return 1;
    const d = Math.hypot(source.x - listener.x, source.y - listener.y);
    if (d <= near) return 1;
    if (d >= far) return 0;
    return 1 - (d - near) / (far - near);
  },
  // Soft pad note: detuned triangles + slow filter sweep + slow attack/release
  padNote(freq, startAt, duration, vol = 0.18) {
    const C = this.ctx;
    const out = C.createGain();
    out.gain.setValueAtTime(0.0001, startAt);
    out.gain.exponentialRampToValueAtTime(vol, startAt + 1.2);
    out.gain.setValueAtTime(vol, startAt + duration - 1.5);
    out.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    const filter = C.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(800, startAt);
    filter.frequency.linearRampToValueAtTime(1600, startAt + duration * 0.5);
    filter.frequency.linearRampToValueAtTime(700, startAt + duration);
    filter.Q.value = 4;
    filter.connect(out);
    out.connect(this.musicGain);
    [0, +5, -5, +12].forEach((cents, i) => {
      const o = C.createOscillator();
      o.type = i < 3 ? "triangle" : "sine";
      o.frequency.value = freq;
      o.detune.value = cents;
      const g = C.createGain();
      g.gain.value = i < 3 ? 0.5 : 0.25;
      o.connect(g); g.connect(filter);
      o.start(startAt);
      o.stop(startAt + duration + 0.1);
    });
    // distant shimmer
    const shimmer = C.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = freq * 4;
    const sg = C.createGain(); sg.gain.value = 0.04;
    shimmer.connect(sg); sg.connect(filter);
    shimmer.start(startAt); shimmer.stop(startAt + duration + 0.1);
  },
  // ---- Music: three procedural tracks --------------------------
  // Caller picks via startMusic("calm" | "aurora" | "glacial" | "tide" | "nebula"). If the
  // requested track is already playing, no-op. Otherwise stop and restart.
  currentTrack: null,

  startMusic(track) {
    if (!this.ctx) return;
    if (!Settings.load().musicEnabled) { this.stopMusic(); return; }
    track = track || "calm";
    if (this.currentTrack === track) return;
    this.stopMusic();
    this.currentTrack = track;
    this.musicStarted = true;
    if (track === "aurora")  return this._startAurora();
    if (track === "glacial") return this._startGlacial();
    if (track === "tide")    return this._startTide();
    if (track === "nebula")  return this._startNebula();
    if (track === "lobby")   return this._startLobby();
    return this._startCalm();
  },
  stopMusic() {
    this.musicStarted = false;
    this.currentTrack = null;
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
  },

  // ---- Five atmospheric tracks. All built from padNote + bellNote so the
  // ---- whole library shares the same warm, drifting palette.
  _m2f: m => 440 * Math.pow(2, (m - 69) / 12),

  // Calm — gentle modal pad, 7.5s/chord, A-minor pentatonic
  _startCalm() {
    const C = this.ctx, m2f = this._m2f;
    const chords = [
      [45, 52, 57, 64], [43, 50, 55, 62],
      [48, 55, 60, 67], [50, 57, 62, 69]
    ];
    let idx = 0;
    const beat = 7.5;
    const loop = () => {
      if (!this.ctx || this.currentTrack !== "calm") return;
      const t = C.currentTime + 0.05;
      const chord = chords[idx % chords.length];
      for (const m of chord) this.padNote(m2f(m), t, beat + 1.5, 0.14);
      idx++;
      this._musicTimer = setTimeout(loop, beat * 1000);
    };
    loop();
  },

  // Aurora — D-minor cycle, slightly more vivid, occasional high bell.
  // 9s per chord. i — bVI — IV — bIII feel.
  _startAurora() {
    const C = this.ctx, m2f = this._m2f;
    const chords = [
      [38, 50, 57, 65],   // Dm:  D2 D3 A3 F4
      [34, 46, 53, 62],   // Bb:  Bb1 Bb2 F3 D4
      [41, 53, 60, 65],   // F:   F2 F3 C4 F4
      [36, 48, 55, 64]    // C:   C2 C3 G3 E4
    ];
    let idx = 0;
    const beat = 9;
    const loop = () => {
      if (!this.ctx || this.currentTrack !== "aurora") return;
      const t = C.currentTime + 0.05;
      const chord = chords[idx % chords.length];
      for (const m of chord) this.padNote(m2f(m), t, beat + 2, 0.13);
      // High bell sparkle on every other chord
      if (idx % 2 === 1) {
        const top = chord[3] + 12;
        this._bellNote(m2f(top), t + beat * 0.4, 2.2, 0.05);
      }
      idx++;
      this._musicTimer = setTimeout(loop, beat * 1000);
    };
    loop();
  },

  // Glacial — sustained low drone with sparse high pentatonic bells.
  // No chord progression; the texture itself is the music.
  _startGlacial() {
    const C = this.ctx, m2f = this._m2f;
    const droneRoot = 40;            // E2
    const dronePeriod = 24;          // refresh every 24s
    const pentatonic = [0, 3, 5, 7, 10, 12];
    const loop = () => {
      if (!this.ctx || this.currentTrack !== "glacial") return;
      const t = C.currentTime + 0.05;
      this.padNote(m2f(droneRoot),      t, dronePeriod + 1.5, 0.10);
      this.padNote(m2f(droneRoot + 7),  t, dronePeriod + 1.5, 0.07);
      this.padNote(m2f(droneRoot + 12), t, dronePeriod + 1.5, 0.05);
      // Schedule 4–6 sparse bells across the period
      const bellCount = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bellCount; i++) {
        const pos = (i + Math.random() * 0.6) / bellCount;
        const semi = pentatonic[Math.floor(Math.random() * pentatonic.length)];
        const note = droneRoot + 24 + semi;
        this._bellNote(m2f(note), t + pos * dronePeriod, 3.0, 0.05);
      }
      this._musicTimer = setTimeout(loop, dronePeriod * 1000);
    };
    loop();
  },

  // Tide — two pad layers offset by half a chord, 12s/chord, oscillating feel
  _startTide() {
    const C = this.ctx, m2f = this._m2f;
    const chords = [
      [41, 53, 60, 67],   // F lydian root
      [48, 55, 62, 69],   // C
      [43, 55, 62, 67],   // G
      [45, 57, 64, 69]    // A minor
    ];
    let idx = 0;
    const beat = 12;
    const loop = () => {
      if (!this.ctx || this.currentTrack !== "tide") return;
      const t = C.currentTime + 0.05;
      const chord = chords[idx % chords.length];
      // Main pad
      for (const m of chord) this.padNote(m2f(m), t, beat + 2, 0.11);
      // Offset secondary layer one octave up — enters at the half-cycle
      const t2 = t + beat * 0.5;
      for (const m of chord) this.padNote(m2f(m + 12), t2, beat * 0.6 + 1.5, 0.05);
      idx++;
      this._musicTimer = setTimeout(loop, beat * 1000);
    };
    loop();
  },

  // Nebula — bass drone + sparse random "stars" (bell tones). No pulse.
  _startNebula() {
    const C = this.ctx, m2f = this._m2f;
    const root = 36;                 // C2
    const period = 20;
    const pentatonic = [0, 3, 5, 7, 10];
    const loop = () => {
      if (!this.ctx || this.currentTrack !== "nebula") return;
      const t = C.currentTime + 0.05;
      this.padNote(m2f(root),     t, period + 1.5, 0.10);
      this.padNote(m2f(root + 7), t, period + 1.5, 0.06);
      // 3–6 stars at random points in the cycle, in upper octaves
      const stars = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < stars; i++) {
        const pos = Math.random();
        const oct = Math.floor(Math.random() * 2) * 12;
        const semi = pentatonic[Math.floor(Math.random() * pentatonic.length)];
        const note = root + 36 + oct + semi;
        this._bellNote(m2f(note), t + pos * period, 2.6, 0.04);
      }
      this._musicTimer = setTimeout(loop, period * 1000);
    };
    loop();
  },

  // Lobby — exclusively for menu states. Suspended chord, slow rising bass,
  // sparse high counter-melody. Distinct from the in-game tracks: it's quieter
  // and more anticipatory, like a held breath before play.
  _startLobby() {
    const C = this.ctx, m2f = this._m2f;
    // Slow B-minor 7 / E-minor 7 alternation, 14s per chord
    const chords = [
      [35, 47, 54, 59],    // B1 B2 F#3 A3 (Bm7-ish)
      [33, 45, 52, 59]     // A1 A2 E3  A3 (E-suspended feel)
    ];
    let idx = 0;
    const beat = 14;
    const loop = () => {
      if (!this.ctx || this.currentTrack !== "lobby") return;
      const t = C.currentTime + 0.05;
      const chord = chords[idx % chords.length];
      for (const m of chord) this.padNote(m2f(m), t, beat + 2.5, 0.10);
      // Two scattered high bells per cycle, in upper octaves
      const tones = [62, 64, 67, 69, 71];
      for (let i = 0; i < 2; i++) {
        const note = tones[Math.floor(Math.random() * tones.length)] + 12;
        const when = t + (0.2 + Math.random() * 0.6) * beat;
        this._bellNote(m2f(note), when, 3.0, 0.04);
      }
      idx++;
      this._musicTimer = setTimeout(loop, beat * 1000);
    };
    loop();
  },

  // Helpers --------------------------------------------------------
  _bellNote(freq, t, dur, vol) {
    const C = this.ctx;
    const o = C.createOscillator(); o.type = "sine"; o.frequency.value = freq;
    const o2 = C.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.01;
    const g = C.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = C.createGain(); g2.gain.value = 0.4;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.musicGain);
    o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
  },
  // ---- SFX --------------------------------------------------
  sfxAbsorb(intensity = 1) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(), g = C.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(660 + 200*intensity, t + 0.18);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * intensity, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.3);
  },
  sfxAbsorbed() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(), g = C.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.6);
  },
  sfxSplitterPop(intensity = 1) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const amp = Math.min(1, intensity);
    // Bright noise pop — short bandpassed crackle for the "shatter".
    const buf = C.createBuffer(1, C.sampleRate * 0.18, C.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.exp(-i / d.length * 9);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = C.createBufferSource(); src.buffer = buf;
    const filter = C.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 1500; filter.Q.value = 1.6;
    const ng = C.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.22 * amp, t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(filter); filter.connect(ng); ng.connect(this.sfxGain);
    src.start(t);
    // Quick rising-then-falling chirp gives the burst a "fragments fly" tail.
    const o = C.createOscillator(), g = C.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.04);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10 * amp, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.26);
  },
  sfxPulsarPulse(intensity = 1) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const amp = Math.min(1, intensity);
    if (amp < 0.01) return;   // too far to bother
    // Low descending thump — bass "wub" syncs the visual shockwave to audio.
    const o = C.createOscillator(), g = C.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.32);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.30 * amp, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.42);
  },
  sfxAnnihilate(intensity = 1) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const amp = Math.min(1, intensity);
    // Gritty noise burst — bandpassed static for the "fizz" of matter erased.
    const buf = C.createBuffer(1, C.sampleRate * 0.32, C.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.exp(-i / d.length * 4);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = C.createBufferSource(); src.buffer = buf;
    const filter = C.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 320; filter.Q.value = 1.4;
    const ng = C.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.28 * amp, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(filter); filter.connect(ng); ng.connect(this.sfxGain);
    src.start(t);
    // Descending square tone underneath — gives the burst a falling "loss" pitch.
    const o = C.createOscillator(), g = C.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(360, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * amp, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.36);
  },
  sfxBounce(speed = 1) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const buf = C.createBuffer(1, C.sampleRate * 0.08, C.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.exp(-i / d.length * 6);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = C.createBufferSource(); src.buffer = buf;
    const filter = C.createBiquadFilter(); filter.type = "bandpass";
    filter.frequency.value = 600 + speed * 400;
    filter.Q.value = 2;
    const g = C.createGain(); g.gain.value = Math.min(0.4, 0.08 + speed * 0.12);
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(t);
  },
  sfxThrust() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(), g = C.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(80 + Math.random()*30, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    const f = C.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 600;
    o.connect(f); f.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + 0.15);
  },
  sfxWin() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    [0, 4, 7, 11, 14].forEach((semi, i) => {
      const f = 261.63 * Math.pow(2, semi/12);
      const o = C.createOscillator(), g = C.createGain();
      o.type = "triangle"; o.frequency.value = f;
      const start = t + i * 0.08;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.18, start + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.5);
      o.connect(g); g.connect(this.sfxGain);
      o.start(start); o.stop(start + 1.6);
    });
  },
  sfxLose() {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    [0, -3, -7, -12].forEach((semi, i) => {
      const f = 220 * Math.pow(2, semi/12);
      const o = C.createOscillator(), g = C.createGain();
      o.type = "sine"; o.frequency.value = f;
      const start = t + i * 0.18;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.18, start + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 1.0);
      o.connect(g); g.connect(this.sfxGain);
      o.start(start); o.stop(start + 1.1);
    });
  },

  // ----- Per-kind SFX presets (Phase 7) ------------------------------
  // Procedural sound shapes the kind designer can attach to abilities via
  // the play-sound effect. All scaled by `intensity` (0..1, usually
  // proximity-attenuated by the caller). Same family of WebAudio
  // primitives the built-in SFX use — no audio assets required.
  sfxKindEvent(preset, intensity = 1) {
    if (!this.ctx) return;
    const amp = Math.max(0, Math.min(1, intensity));
    if (amp < 0.01) return;
    const C = this.ctx, t = C.currentTime;
    const G = (start, peak, end, peakAt = 0.01, peakValue = 0.2) => {
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(peakValue * amp, start + peakAt);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      return g;
    };
    if (preset === "blip") {
      // Quick high tone — short tap.
      const o = C.createOscillator();
      o.type = "sine"; o.frequency.value = 880;
      const g = G(t, t, t + 0.12, 0.005, 0.18);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.13);
    } else if (preset === "chirp") {
      // Rising tone — birdcall-ish.
      const o = C.createOscillator(); o.type = "triangle";
      o.frequency.setValueAtTime(280, t);
      o.frequency.exponentialRampToValueAtTime(1100, t + 0.16);
      const g = G(t, t, t + 0.18, 0.02, 0.16);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.19);
    } else if (preset === "thump") {
      // Low percussion — kick-drum-ish. End frequency stays in
      // laptop-speaker reproduction range (was 40 Hz, inaudible on
      // most setups).
      const o = C.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.45 * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.3);
    } else if (preset === "zap") {
      // Descending sine + bandpassed noise — energy discharge.
      const o = C.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      const f = C.createBiquadFilter(); f.type = "lowpass";
      f.frequency.setValueAtTime(2000, t);
      f.frequency.exponentialRampToValueAtTime(400, t + 0.18);
      const g = G(t, t, t + 0.22, 0.005, 0.18);
      o.connect(f); f.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.23);
    } else if (preset === "ding") {
      // Bell-like tail with slow decay.
      const o = C.createOscillator(); o.type = "sine";
      o.frequency.value = 1200;
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16 * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + 0.95);
    } else if (preset === "drone") {
      // Sustained low note — two slightly detuned sines for body and a
      // slow beating that makes the drone sit forward in the mix
      // instead of vanishing under the music bed.
      const o1 = C.createOscillator(); o1.type = "sine"; o1.frequency.value = 220;
      const o2 = C.createOscillator(); o2.type = "sine"; o2.frequency.value = 224;
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.30 * amp, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      o1.connect(g); o2.connect(g); g.connect(this.sfxGain);
      o1.start(t); o1.stop(t + 0.9);
      o2.start(t); o2.stop(t + 0.9);
    } else if (preset === "pop") {
      // Quick noise crackle — sharper bandpass and a punchier gain peak
      // so the click cuts through. Buffer length now matches the
      // envelope so we don't ring into a tail of pure silence.
      const buf = C.createBuffer(1, Math.floor(C.sampleRate * 0.13), C.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const env = Math.exp(-i / d.length * 8);
        d[i] = (Math.random() * 2 - 1) * env;
      }
      const src = C.createBufferSource(); src.buffer = buf;
      const f = C.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 1500; f.Q.value = 2.2;
      const g = C.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.40 * amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t);
    }
  }
};
