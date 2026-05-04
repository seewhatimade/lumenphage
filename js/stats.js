// Stats — extracted from index.html. Loaded as a classic
// <script src> before the inline script; shares the document's
// global lexical scope, so const/let bindings declared here are
// visible to the inline script and vice-versa.

// ============================================================
//   STATS — per-level/preset attempt + completion records
// ============================================================
//
// A "key" identifies a source: campaign IDs become "c<n>", presets become
// "p<id>", custom games are folded into "custom" because their config is
// arbitrary. Records track attempts, completions, deaths, peak mass reached,
// and best clear time (in seconds).

export const Stats = {
  storageKey: "lumenphage.stats.v1",
  cache: null,

  load() {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.cache = raw ? JSON.parse(raw) : {};
    } catch { this.cache = {}; }
    return this.cache;
  },
  save() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.cache)); } catch {}
  },
  get(key) {
    const s = this.load();
    if (!s[key]) s[key] = { attempts: 0, completions: 0, deaths: 0, bestTime: null, peakMass: 0 };
    return s[key];
  },
  recordStart(key) {
    const e = this.get(key); e.attempts++; this.save();
  },
  recordWin(key, time, peakMass) {
    const e = this.get(key);
    e.completions++;
    if (e.bestTime === null || time < e.bestTime) e.bestTime = time;
    if (peakMass > e.peakMass) e.peakMass = peakMass;
    this.save();
  },
  recordLoss(key, peakMass) {
    const e = this.get(key);
    e.deaths++;
    if (peakMass > e.peakMass) e.peakMass = peakMass;
    this.save();
  }
};
