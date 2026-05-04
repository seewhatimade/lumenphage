import { massToRadius, radiusToMass } from "./core.js";

// Circle entity — every absorbable / propellant body in the world is
// an instance. The runtime stores them in `World.circles[]` and the
// physics step iterates that list. Loaded after js/core.js so the
// constructor's `radiusToMass(r)` resolves at parse time even though
// no Circle is constructed at module load.

let _id = 0;

export class Circle {
  constructor(x, y, r, opts = {}) {
    this.id   = ++_id;
    this.x    = x; this.y = y;
    this.vx   = opts.vx || 0; this.vy = opts.vy || 0;
    this.mass = radiusToMass(r);
    this.kind = opts.kind || "neutral";   // player | neutral | hunter | avoider | mote
    this.hue  = opts.hue !== undefined ? opts.hue : (Math.random() * 360);
    this.alive = true;
    this.life  = opts.life || 0;          // mote lifespan in s; 0 = infinite
    this.age   = 0;
    this.thrustCooldown = 0;
    this.flashAt = -10;                   // time of last absorb event for glow
    this.spawnTime = 0;                   // for spawn fade-in
  }
  get r() { return massToRadius(this.mass); }
  set r(v) { this.mass = radiusToMass(v); }
}
