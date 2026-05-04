# LUMENPHAGE

*A bioluminescent drift in dark water. Eat what is smaller than you. Avoid what is greater.*

You are a single cell adrift in a lightless basin. To move, you eject mass behind you. Touching anything smaller absorbs it; touching anything larger means you are absorbed. Mass is conserved, momentum is conserved, gravity is real. The only way to grow is to eat — and eating well requires planning.

The dev tree is a small set of ES modules under `js/` plus level data as JSON; `npm run build` bundles everything into a single self-contained `dist/index.html` that runs from `file://` with no server. No external assets at runtime: the audio is procedural (WebAudio), the visuals are 2D canvas with radial gradients for the bioluminescence, and every level is embedded in the HTML as a `<script type="application/json">` payload.

https://seewhatimade.github.io/lumenphage/

---

## Running it

**Quick play (just the bundled file):**

```sh
npm install        # one-time — fetches acorn + esbuild for the build step
npm run build      # produces dist/index.html
# open dist/index.html in any modern browser
```

The bundled HTML embeds the JS bundle and every level as inline data, so it works straight from `file://`.

**Dev mode (per-file modules, fast iteration):**

```sh
npm install
npm run serve      # python3 -m http.server on :8000
# then open http://localhost:8000
```

The dev server is required because ES modules + the Gamepad API both need a secure-ish context — `file://` won't work for the unbundled tree (use `npm run build` for that). Edits to `js/*.js` show up on the next reload; no rebuild needed.

Any modern browser works (Chrome/Firefox/Safari/Edge). For controllers, an SNES-mapped USB or Bluetooth pad is supported out of the box. Keyboard fallback is built in for everything and is fully configurable.

---

## Controls

Defaults — every action is rebindable in **Settings → Controls** (gamepad and keyboard independently).

| Action | Default gamepad | Default keyboard |
|---|---|---|
| Aim up | D-pad ↑ | ↑ |
| Aim down | D-pad ↓ | ↓ |
| Aim left | D-pad ← | ← |
| Aim right | D-pad → | → |
| Thrust | A | Space |
| Boost | B | Z |
| Use **Attract** pickup | X | X |
| Use **Repel** pickup | Y | C |
| Zoom out *(hold; double-tap to reset)* | L | Q |
| Zoom in *(hold; double-tap to reset)* | R | E |
| Pause | START | P |
| Back to menu / designer | SELECT | Esc |

Aim is **held-direction**: pressing a D-pad direction (or arrow key) sets a target angle and your aim arrow slews toward it along the shorter arc — no snap, no fire. Holding two adjacent directions targets the 45° between them. Release and the arrow stays where it is.

**Menu navigation** (always raw, not rebindable): D-pad / arrow keys move spatially through cards; **A** / **Enter** activate; **B** / **Esc** back out.

**On-screen pause button** — small clickable pill at top-center while playing.

---

## Game modes (main menu)

In order:

1. **Campaign — 30 levels.** A branching tutorial → endgame progression. Each level teaches a specific lesson (absorption → propulsion → wall bouncing → predation → gravity → orbital mechanics → endgame ecosystems). Branches let you choose a path. Progress, attempts, completions, deaths, best clear time, and peak mass are tracked per level and shown on cards + hint screen.
2. **Drift — sparse box.** Open arena, mostly small prey, occasional predators. Random each play.
3. **Hatch — packed cluster.** A grid of cells you carve through. The player's neighbours are guaranteed prey so there's always an opening move. ~12% of cells roll a non-neutral kind (hunters, predators, splitters, anti-motes, magnets, gluttons, etc.) so every game has surprises.
4. **Whirlpool — gravity well.** Concentric orbital rings around a central well. Eat from the outside in.
5. **Random game.** Picks one of the three above randomly.
6. **Preset game.** A curated set of fun configurations: Petri Dish, Hunter Ground, Underdog, Twin Stars, Survival 60s, Pacifist Garden, Gladiator, Pacify the Field, Binary Whirl.
7. **Custom game.** Full configuration form. Set every parameter (type, box size, kind counts with min/max ranges, gravity wells, victory condition, music, random drift). Save your config as a named preset, load any previously saved preset. Min/max controls auto-clamp each other; all inputs accept mouse-wheel adjustment.
8. **Player designed level.** Play any level you saved from the editor.
9. **Design a level…** Open the level editor.
10. **Design a kind…** Open the kind designer — author your own circles with rules, abilities, contact pickups, and embedded test cases. See **The kind designer** below.
11. **Settings…** Audio + visual + control configuration.
12. **Debug settings…** *(only when Dev mode is on)* Per-frame inspection toggles.
13. **Dev mode.** Toggle. When ON, every campaign level is unlocked.

---

## First-encounter nameplate

Whenever a level introduces a kind you haven't met, play pauses and a panel shows each new kind's bioluminescent dot, name, and one-line behavior summary before the level starts. Seen kinds are remembered across sessions.

---

## Mote catalog

The game uses *mote* loosely for any circle. Specific kinds (see **The kind designer** for authoring your own):

| Kind | Color | Behavior |
|---|---|---|
| **Player** | Cyan | You. The only circle you control. |
| **Neutral** | Hue varies with mass-vs-player (blue → purple → red) | Drifts. Hue tells you instant threat: blue safe, red dangerous. |
| **Hunter** *(mind)* | Orange-red, single dot | Chases the closest prey it can absorb. Doesn't flee. |
| **Avoider** *(mind)* | Teal, single dot | Sums a danger vector from every larger circle in range and thrusts away. |
| **Predator** *(mind)* | Deep red, triple-fang crown | Plans: flees nearby danger, otherwise picks high-utility prey. Once bigger than you, gets a 100× targeting bonus and commits. |
| **Predator pup** *(mind)* | Lighter red, two-dot crown | Like a predator but prefers the *smallest* eatable prey. Safer growth strategy. |
| **Anti-mote** | Dark magenta, plus-cross | On contact with anything except another anti-mote, both lose mass equal to the smaller's full mass — instant annihilation. Equal masses → both vanish. Two anti-motes touching follow normal absorption rules. |
| **Splitter** | Yellow, three rotating spokes | Touched by something larger → bursts into 4–6 smaller children that conserve total mass. The toucher gains nothing. |
| **Magnet** | Cyan-blue, halo ring | Carries a +220 000 gravity well around itself — pulls everything in. |
| **Repeller** | Purple, halo ring | Carries a −300 000 anti-gravity field — pushes everything away. |
| **Glutton** | Orange-brown, dashed reach ring | Passively drains any smaller non-mote within ~2.6× its radius. Slow but inexorable. |
| **Pulsar** | Gold, animated shockwave | Every 2.5–3.5 s emits an outward velocity impulse to everything within ~280 px. |
| **Singularity child** | Deep purple, double halo | Small body, big personal gravity well that travels with it. Slings circles around it like a comet. |
| **Pickup: Attract** | Cyan, converging arrows | Touch to collect (FIFO inventory, max 9). Press the Attract button to fire a brief inward radial impulse around you (360 px). |
| **Pickup: Repel** | Red, diverging arrows | Same but pushes outward. |
| **Mote** *(propellant)* | Same colour as ejector | Mass you ejected. Real physics, no lifespan, fully edible. Anti-motes annihilate them. |
| **Gravity well** *(static)* | Orange ripple rings | Not a circle — a fixed point of gravitational attraction. Multiple wells per level supported. |

Kinds tagged *(mind)* perceive the world and act on what they see — they're the targets of the **Pacify** victory condition. Everything else either drifts, runs a fixed rule on contact, or emits a static field.

---

## Physics

- **Mass = π r²**, so radius is `sqrt(mass/π)`.
- **Conservation of mass.** Absorption transfers mass — the smaller drains, the bigger grows by exactly the same amount. When a circle drops below `MIN_MOTE_MASS = 1.5`, its remaining mass is given to the absorber and it's removed. Anti-mote / mote annihilation is an intentional exception.
- **Conservation of momentum.** No drag. No friction. Drifting motes drift forever. Wall bounces are perfectly elastic.
- **Propulsion is real.** Thrust ejects a fraction of your mass behind you. By Newton's third law, your velocity changes by `(ejected/(mass-ejected)) × eject_speed`. Boost ejects more for one big kick. Steering and braking feel identical at every size because the impulse is fraction-based.
- **Gravity is `1/r²` with a hard floor at r=20** so falling into a well is bounded. Multiple wells in the same level sum forces. Field-kind motes (magnet, repeller, singchild) carry their own well around with them.
- **Suction during absorption.** Two overlapping circles of meaningfully different size get an equal-and-opposite attractive force so a glancing contact commits instead of sliding off.
- **Spatial-hash collision broadphase.** Circles bucket into a 100-px grid; pairs are deduplicated via a Set. O(n) instead of O(n²) — large worlds stay smooth.

---

## Trajectory ghost line

Settings → Visuals → Trajectory ghost line. When on, a short dashed cyan arc forward-projects your position ~1.2 s ahead using the same gravity model the simulation uses. Invaluable in gravity levels. (Dev mode adds a debug toggle that draws the same ballistic prediction for every other moving cell — useful for orbit debugging.)

---

## Victory conditions

Set in custom modes, fixed per-level in campaign:

- **Absorb all.** No remaining non-mote, non-self circles. Default.
- **Become largest.** Two independent paths to victory: (a) **no rivals remain** — every non-mote circle has been absorbed; or (b) **you are strictly larger than every rival AND mind-having circles collectively hold > 80% of all living mass** (player + any thinking kind: hunter, avoider, predator, predator pup). HUD shows `largest rival: N   mind share: P%`.
- **Survive…** Stay alive for N seconds (configurable). HUD shows a countdown.
- **Pacify.** Eliminate every cell that thinks (hunter, avoider, predator, predator pup). Drifters and field motes can still be present at the win moment — the world keeps existing once the minds are gone. HUD shows `minds: N` countdown.

---

## Settings

**Audio**
- Music on/off
- Master / Music / SFX volume sliders (live, persistent)

**Visuals**
- Trajectory ghost line on/off
- **Intro zoom** on/off — when enabled (default ON), every level start opens with the camera tightly centred on the player and a brief zoom-out to gameplay scale, instead of sliding from the corner. Includes a **Zoom duration** slider (gameplay is paused for the duration).

**Level designer**
- **Switch to Place when Kind changes (Shape tool only)** — default **ON**. While the Shape tool is active, picking a Kind from the toolbar dropdown flips the tool back to Place, on the heuristic that "I'm done authoring the shape, I want to place that new kind". Turn off if you want to change Kind without leaving the Shape tool.

**Controls**
- Per-action gamepad button (left column, dropdown) and keyboard key (right column, click-to-capture button)
- Each can be independently cleared
- "Reset to defaults" button

---

## Debug settings *(Dev mode only)*

- **Show kind labels** — render the kind name beside every circle
- **Show radius labels** — render `r=NN.N` beside every circle
- **Show mass labels** — render `m=NNN` beside every circle
- **Show predicted trajectory of every cell** — faint orange dashed lines projecting each moving cell's ~0.8 s ballistic future under gravity. Skips stationary cells; ignores AI behaviors (it's pure physics)
- **Visualize gravity warp** — overlays a deformed grid (rubber-sheet style). Each grid intersection is displaced toward every gravity source — static wells **and** field-kind motes (magnets, repellers, singularity-children) — by a bounded amount that peaks ~100 px from each source and decays at both extremes, so lines pinch toward sources without overshooting through them. Repellers push the grid *away* from themselves. **Pulsars** (which exert a transient impulse rather than a steady field) push the grid outward in an expanding-shell ripple synced to their visible shockwave ring, fading out over the 0.8 s ring lifetime — exaggerated for visibility. The **Gravity warp intensity** slider scales the peak displacement from 0.25× to 4× of an auto-derived baseline (~one grid cell at the strongest source).
- **Ghost mode** — player passes through everything intangibly (no AI sees you, no fields affect you, no collisions). Player renders at 35% alpha.
- **Show current music track** — top-right pill displaying the active track. **Click it to cycle** through `calm → aurora → glacial → tide → nebula`.
- **Unlimited attract & repel pickups** — the inventory check is bypassed so every press fires the burst.

When multiple per-circle label toggles are on, they share a single line (`hunter r=14.0 m=615`).

---

## Save system

Everything persists to `localStorage`:

| Key | What's in it |
|---|---|
| `lumenphage.campaign.v1` | Campaign progress |
| `lumenphage.devMode` | Dev-mode flag |
| `lumenphage.designs` | Named designs from the editor |
| `lumenphage.customOpts.v1` | Active Custom Game form state |
| `lumenphage.customOpts.presets.v1` | Saved Custom Game presets |
| `lumenphage.settings.v1` | Audio + visual + control settings |
| `lumenphage.stats.v1` | Per-level / per-preset stats (attempts, completions, best time, peak mass) |
| `lumenphage.seenKinds.v1` | Kinds you've met (for the nameplate intro) |
| `lumenphage.debug.v1` | Debug toggles |
| `lumenphage.kinds.v1` | User-authored kinds from the kind designer |
| `lumenphage.kindCap.v1` | Soft cap on per-level kind count (warns at exceed) |
| `lumenphage.palettes` | User-saved level-render colour palettes (in / out / edge trios from the level editor) |

Saved designs and named presets prompt for a name and offer delete buttons in their list pickers. Every prompt, overwrite confirm, and delete confirm is an **in-app modal** styled to match the panel aesthetic — no native `window.confirm` / `window.prompt` boxes anywhere in the game.

---

## The level editor

`Design a level…` from the menu. The toolbar adapts to context — controls appear and disappear based on Type, Tool, and selection state.

### Always visible

- **Type** — Sparse / Packed / Gravity. Picking Gravity adds a center well if there are none.
- **Randomize placement** — *(Packed only)* fills the grid with the campaign's tier distribution; leaves the center cell empty for the player.
- **w / h** — world bounds in pixels (400–12000). Resize the play area to fit the design rather than working in a fixed frame. (When an explicit playable shape is set via the Shape tool, these inputs edit the first `+` rect primitive in the shape; bounds are then re-derived from the shape's AABB so they can't drift apart.)
- **in / out / edge** — three color pickers for the rendered level: the playable-area fill, the unplayable backdrop, and the boundary stroke. Defaults preserve the historical look; values round-trip through Save / Load / Export / Import.
- **Theme** dropdown — apply a named color palette (built-in + your saved palettes). Built-ins are themed for the lumenphage's deep-abyss / bioluminescent aesthetic: Abyssal, Bioluminescent, Hadal Trench, Aurora, Voidlight, Anglerfish, Hydrothermal, Witchfire, Phosphor Bloom, Neon Predator.
- **Save palette… / Delete** — save the current in/out/edge trio as a named user palette (persisted to `localStorage`) or delete the currently-applied user palette. Built-in names are reserved. Manually editing any color picker detaches the dropdown from its current selection so it never mis-claims a match.
- **Place size** slider; scroll-wheel over the canvas also adjusts.
- **Kind** dropdown — every mote kind, plus Player and Gravity well. A short description of the selected kind appears next to the dropdown.
- **Tool** — Place / Select / **Velocity** / **Shape**.
- **Mirror** — off / horizontal / vertical / both. Placement reflects across the bounds center; the preview shows ghost rings (including for gravity wells). Active mirror axes are drawn as dashed magenta guide lines across the bounds. **Velocity is mirror-aware:** the velocity tool and clipboard paste reflect `vx`/`vy` across the same axes. **Shape placement is mirror-aware too** — adding a primitive spawns mirror copies in one history step, and right-click delete removes whatever sits at every mirrored cursor position.
- **Snap** — off / 8 / 16 / 32 / 64 px grid. Snaps the placement cursor and the **Shape tool**'s drag endpoints (rect corners, circle radius endpoints, polygon vertices). When on, a semi-transparent yellow ring marks the snap target. The grid is anchored to the bounds origin and the bounds w/h are quantized to multiples of the snap size, so both walls of the box are snap points and the player can snap along the full width and height of the playable area.
- **Random drift** — toggle: every non-player circle gets a small random velocity at Play.
- **Orbit all / Reverse orbit** — *(visible whenever ≥ 1 gravity well exists, on any Type)* set tangential velocity around each circle's nearest well for every non-player circle. Labels switch to **Orbit selection / Reverse-orbit selection** when there's a selection, scoping the action to those motes (so you can build counter-rotating rings in two passes).
- **Victory** dropdown — Absorb all / Become largest / Survive… / **Pacify minds**. + Time field for Survive.
- **Clear**, **Show JSON / Hide JSON** *(see "Live JSON view" below)*, **Save**, **Load**, **Export** (downloads JSON), **Import** (file picker), **Play**, **Menu**.

### When ≥ 1 circle is selected

A selection inspector appears in the toolbar:

- **kind** dropdown — change the kind of every selected mote at once.
- **r** — radius in px (6–120) for selected motes. Empty when values differ.
- **vx / vy** — initial velocity in px/s. Empty when values differ. Typing applies to the whole selection.
- **Clear v** — set `vx = vy = 0` on every selected mote.
- **Alignment** — *(requires ≥ 2 selected)* a row of six icon buttons that snap selected circles onto a shared axis. Edge-aligned (radius-aware) so mixed sizes stay flush:
  - **⇤** align left edges to the leftmost
  - **⇥** align right edges to the rightmost
  - **⤒** align top edges to the topmost
  - **⤓** align bottom edges to the bottommost
  - **↕** vertical middle — every circle gets the same `y` at the bounding-box centerline
  - **↔** horizontal middle — every circle gets the same `x` at the bounding-box centerline
  - **≡** distribute vertical — *(needs ≥ 3)* pin top and bottom; reposition the middle circles so the gap between consecutive edges along Y is constant
  - **⦀** distribute horizontal — *(needs ≥ 3)* pin left and right; constant gap along X
  - **⟋** move to line — opens a press-drag-release modal. Click and drag a line on the canvas; while you drag, dashed connectors preview each selected circle's perpendicular foot on the line and a small dot marks where it'll land. A small badge near the start point shows the line's first-leg angle in degrees (CCW from +x, math convention) so you can copy it onto a circle's velocity / aim if you want a phage to fly along the line. Release to commit. Hold **Shift** to constrain the line to 0° / 45° / 90°. **Hold Ctrl while dragging** to engage **ricochet**: the line ignores the cursor distance, walks from the start in the drag direction, and bounces off the bounds walls — the path always terminates at a wall, with **1** bounce by default. Press **a** to add a bounce, **d** to remove one (range 0–16). Each selected circle picks the closest segment to align to. Esc / right-click cancels.
- **Ring around well** — *(also requires ≥ 1 well)* enters ring-placement preview (see below).

### Ring-placement preview

Click **Ring around well** to snap the selection onto a circle around the nearest well at the average of their current distances. The toolbar swaps in a **Spacing: preserve / even** toggle. While the preview is active, an on-canvas banner shows the current radius and live shortcuts:

- **Mouse wheel** or **L/R shoulders** — adjust radius live.
- **E** or the **Spacing** button — toggle even angular spacing on/off (preserve angles is the default).
- **Click** or **A** — commit (positions stay where they are; selection unchanged).
- **Esc**, **right-click**, or **B** — cancel (restore original positions).

`pushHistory` runs at entry, so a committed ring is undoable with Ctrl-Z.

### Mouse

- **Left-click** *(Place tool)* — place the selected kind at the cursor (with mirror duplicates if enabled, snapped if enabled). When placing the **player**, aim mode arms: a dashed cyan arrow tracks from the player to the cursor, and the next left-click sets the initial `vx, vy` to that vector. **Hold Shift** while moving the cursor to snap the velocity angle to the nearest 45° from the player (cursor distance is preserved, so you still control speed); the rubber band brightens while angle-snap is active. Right/middle click cancels (leaves velocity at zero); any keyboard input *other than Shift* or any toolbar interaction also cancels.
- **Left-click** *(Select tool)* on a circle — replace the selection with just that circle (or, if it was already part of a multi-selection, collapse the selection to it on mouseup-without-drag).
- **Shift + left-click** *(Select tool)* on a circle — add it to the selection if it wasn't already in there; if it was, mouseup-without-drag toggles it back off. (Standard multi-select pattern: click replaces, shift-click extends.)
- **Left-click + drag** *(Select tool)* on a circle — move every selected mote together (selection is established by the same click using the rules above). **Hold Shift** during the drag to lock the displacement vector to the nearest 45° step (cursor distance preserved); toggles live, so releasing Shift mid-drag returns to free movement on the next frame. While Shift is held, dashed helper lines fan out from each circle's original position along the eight 45° axes, each cut to the current drag distance — the axis you're currently snapping to renders brighter so you can see which target the move is committing to.
- **Left-click + drag** *(Select tool)* in empty space — drag-rectangle select (replaces the existing selection on mouseup).
- **Left-click** *(Select tool)* in empty space (no drag) — clear the selection.
- **Left-click + drag** *(Velocity tool)* on a circle — draw a velocity arrow; release commits `vx, vy` = drag delta. With Mirror on, mirrored counterparts get reflected velocities. Right-click on a circle in Velocity tool zeroes its velocity.
- **Shift + left-drag** — pan the camera. The world point under the cursor stays fixed. Suppressed in modes / contexts that own Shift as a snap modifier: polygon-vertex placement, player aim mode, the move-to-line preview, and Shift-clicks that land on a circle in the Select or Velocity tools (those do a multi-select / axis-snapped move, or a shift-snapped velocity drag). Shift-drag in empty space still pans even in Select / Velocity tools.
- **Shift + scroll wheel** — zoom the editor camera around the cursor (clamped to a sensible range). The world point under the cursor stays anchored, matching the typical map-nav feel.
- **Middle-click** *(Place tool)* — convert the circle under the cursor to the selected kind.
- **Right-click** — erase the circle (or well) under the cursor. In Shape tool with Mirror active, also removes the topmost primitive at every mirrored cursor position. (Reserved in Select tool — left-click in empty space already clears the selection, and right-click is held back for a future context menu.)
- **Scroll wheel** — change Place size (or ring radius while ring-placement is active). With a non-empty selection, the wheel instead grows / shrinks every selected circle by 3 px per tick, clamped to the standard `[6, 120]` range. Rapid scrolling is coalesced into a single undo step.

### Keyboard

Undo / redo via **Ctrl-Z** (with **Shift** for redo) and **Ctrl-Y**. Selection survives undo/redo — the snapshot stores selected circle indices and rebinds them after the world is restored, so halos always sit on the live circles. **+ / -** zoom. **Arrow keys** drive the cursor (and auto-pan the camera at the screen edge).

**Selection commands** *(Select tool):* **Ctrl-C** copy, **Ctrl-V** paste at cursor, **Ctrl-D** duplicate (small offset), **Backspace / Delete** delete selection. Copy/paste preserves `vx, vy`, and paste mirrors them via the active Mirror setting. Selected circles get a yellow halo.

**Escape priority** — one press resolves the topmost active state, in this order: cancel player aim mode → cancel move-to-line preview → cancel ring placement → drop the in-progress polygon draft → clear selection → exit a test-case session (when one is open) → exit the editor (with the unsaved-changes prompt if applicable). So if you have a selection, the first **Esc** clears it; the next **Esc** triggers the exit flow.

### Velocity overlays

The **player's** initial-direction arrow is always visible in the designer (bright cyan, regardless of which tool is active) so you can see where the player launches from at a glance.

While the **Velocity** tool is active, every other cell with non-zero `vx, vy` shows a faint orange arrow indicating its current velocity vector in world units. The arrow being drawn during a drag is brighter and prints `|v|=NN` next to the cursor, plus an angle badge anchored at the circle (the same `θ°` readout the move-to-line tool shows — math convention, CCW from +x with +y up — so you can copy a single number to align the velocity with another tool's line). **Hold Shift during the drag** to lock the velocity vector to the nearest 45° step; cursor distance still picks `|v|`, and the arrow brightens to yellow while the snap is engaged.

### Shape tool — non-rectangular playable areas

`Tool → Shape` lets you compose the playable area from a list of primitives instead of a single rectangle. A level shape is an **ordered list** of `+` (add) and `−` (carve) primitives — rectangles, circles, or arbitrary polygons. The semantics is painter's-algorithm CSG: walk the list in order, and each primitive overrides earlier ones where it overlaps. So a `+` rect, then a `−` carve through the middle, then a `+` bridge across the carve gives you back the bridge as playable area in the carved gap.

Three primitive kinds:

- **Rect** — drag from corner to corner.
- **Circle** — drag from center outward (drag length = radius).
- **Polygon** — multi-click vertex authoring (see below).

When you switch to the Shape tool the toolbar adds a small panel:

- **Primitive** — rect, circle, or polygon.
- **Sign** — `+` add or `−` carve.
- **Reset** — discard any compound shape and snap back to a single `+` rect equal to the current bounds.

**Rect / circle placement**

- **Left-click + drag** — place. Below a 12 px minimum the placement is discarded.
- **Right-click on a primitive** — delete it. The last remaining primitive is protected (use **Reset** to start over).
- **Drag past the current bounds** — primitives can extend the playable area. Drag a circle's radius past the wall, or a rect/polygon corner outside the area, and bounds re-derive on commit so the new geometry fits. The new bounds are rounded outward to the nearest 64 px (the LCM of the available Snap sizes) so the level's grid origin stays consistent — every snap line that existed before extension still exists after, and the toolbar's **w / h** fields update to reflect the new size.
- **Live dimension readout** — while dragging, a small framed badge near the cursor shows `r N` (circle), `W × H` (rect), or the rubber-band length (polygon). The badge reads the snapped values when Snap is on, so what you see is what commits.

**Polygon placement**

- **Left-click** to add a vertex. A live "rubber band" line tracks from the last vertex to the cursor.
- **Right-click**, **Enter**, or hovering near the first vertex (snap-to-close ring within ~12 screen px) — finish if the polygon is valid.
- **Backspace** — remove the most recent vertex.
- **Esc** — cancel the in-progress draft.
- **Hold Shift while moving the mouse** to snap the rubber band to the nearest 45° from the previous vertex (cursor distance is preserved). The line gets brighter when snap is active.
- **Right-click in polygon mode when no draft is in progress** — same as rect/circle: deletes the topmost primitive at the cursor.
- Validation on commit: ≥ 3 vertices, |signed area| ≥ 100 px². Polygons are reoriented to a consistent winding so wall normals are correct.

Right-click while drafting is otherwise ignored, so it can't accidentally pan the camera. Pan via Shift-drag is suppressed in polygon mode for the same reason — switch tools if you need to pan.

**Mirror & snap interplay**

- With Mirror on, every drag spawns mirror copies in a single history step; the drag preview shows the original outline at full alpha and each mirror copy faded so you can see all four placements at once. Polygons are re-canonicalized to CW after flipping (winding reverses on mirror).
- A primitive sitting on a mirror axis is dedup-skipped, so a centered rect with horizontal mirror won't double up on itself.
- Snap (when on) lands rect corners, circle radius endpoints, and polygon vertices on the grid. A yellow snap-target ring tracks the cursor. Shift's polygon angle-snap (45° increments) still wins over grid snap when held.

**Rendering**

- The playable area is filled with the **in** colour, the unplayable area (outside the shape, or inside a `−` carve) with the **out** colour, and the boundary is stroked in the **edge** colour — all configurable via the toolbar (see "Always visible"). A `−` carve re-paints the outside colour over a previously-added `+` region, so the user-set inside/outside contrast holds inside holes too.
- The boundary is stroked uniformly: same look for walls contributed by `+` rects, `+` circles, `+` polygons, or `−` carves. Internal seams (the parts of any primitive's edge that aren't actually on the union boundary) are suppressed.
- The Shape tool's editor overlay still uses a faint cyan tint over the playable area — independent of the user-chosen render colours — so the editable region reads at a glance regardless of which palette is active.

The first time you enter the Shape tool on a default-rect level, a single `+` rect matching `bounds.w / bounds.h` is materialized so you have something visible to edit. Bounds re-derive automatically from the shape's AABB after every change. The shape round-trips through Save / Load / Export / Import; legacy designs without a `shape` field migrate to a single rect on load.

**Walls and corners**

Walls bounce off the actual playable boundary — circles, corners, and carved holes all reflect cleanly. The runtime samples each primitive's perimeter at 8 px and refines the contact distance analytically. Each sample carries its source segment's endpoints, so when the player's projection falls *past* an endpoint the bounce switches to a corner-aware mode: distance is to the corner point, the bounce normal points corner-to-player, and the player slides around the corner instead of being teleported by a phantom continuation of the wall. Single-rect levels still reproduce the legacy 4-axis bounce within float precision.

**Tips that bite people**

- **Bars extending past the bounds re-introduce playable area outside the bounds.** That's how ordered CSG works — each later `+` adds, regardless of where it is. To keep the playable area contained, drag your bridges/bars so both endpoints sit *inside* the bounds rectangle.
- **Circles placed inside a `−` carved region** get pushed to the nearest playable edge on the first physics tick — keep your circle placements inside the playable area.

**Known v1 caveats**

- Acute reentrant corners (where two `+` primitives meet at a sharp angle) can feel sharp on a fast frame.
- The perpendicular-displacement test for boundary detection uses a 1 px epsilon — finer constructions where two primitive edges sit within 1 px of each other can produce unreliable wall states.

### Live JSON view

The **Show JSON** button (next to **Clear**) opens a floating panel that mirrors the level as live JSON — the same payload Save / Export use.

- **Floating panel.** Initial position top-right of the canvas. Drag from the title bar to move (drag handler ignores mousedowns on its buttons / inputs). Resize via the bottom-right corner. The panel clamps itself back into view on every show and on every window resize, so a panel parked off-screen reappears on-screen the next time you open it.
- **Status badges.** `edits` — textarea differs from the last sync. `level changed` — the designer has moved on since the last sync. `in sync` — neither.
- **Refresh** pulls the current `Editor.serialize()` into the textarea (resets the sync anchor; discards any typed edits).
- **Update** parses the textarea and applies it to the level. Wraps `deserialize` in try/catch with auto-rollback via undo on parse / apply failure. The camera is preserved across the update — `cameraX / cameraY / cameraScale` are snapshotted before `deserialize` (which routes through `World.reset` and clobbers them) and restored after, so the same patch of world stays under your eye.
- **auto** checkbox — when on, the textarea is automatically refreshed every frame the level differs from the last sync. Handy for watching the JSON live while you build; turn it off to author JSON by hand (typed edits are otherwise overwritten on the next designer change).
- **Theme toggle** — switches between **GitHub Dark** and **GitHub Light** palettes, themed end-to-end (chrome, body, syntax-highlighted tokens, status badges). Tokens use the GitHub palette: keys / strings / numbers / keywords are highlighted distinctly and re-colour together when you toggle.
- **Editor.** Custom syntax-highlighted overlay (transparent textarea over a `<pre><code>` translated to mirror scroll). Tab inserts two spaces. Ligatures are forced off so caret tracking stays glyph-perfect at all sizes.
- **Lifecycle.** The panel auto-hides whenever the level designer isn't active (e.g. you exit to menu).

### Test → die → return → play again

Hit **Play** to test your design — the editor snapshots the layout to `testStash`. If you die or win, the end screen offers **Return to designer** which restores everything exactly (including circle velocities — `vx, vy` round-trip cleanly through the snapshot). **Play again** is offered on both win and loss so you can iterate on a deadly setup without going back through the bar each time; it re-deserializes the same stash, so it restarts from your designed layout rather than rolling a fresh procedural level. Pressing Esc / SELECT mid-test also returns you straight to the designer.

On return, the camera re-centers on the player's authored position rather than the bounds center, so you land looking at the spot you were just steering.

### Unsaved-changes guard

Trying to leave the editor with uncommitted changes shows an in-app modal asking whether to exit without saving. The dirty flag flips on the first mutation and clears on Save / Load.

---

## The kind designer

`Design a kind…` from the menu. Author your own circles end-to-end: appearance, motion, decision rules, special abilities, contact pickups, and embedded test cases that travel with the kind. Built-in kinds (hunter, anti-mote, pulsar, …) are themselves authored in the same data form, so anything they do is something you can do.

### Library

The library lists every kind — built-ins first, then your saved kinds. Each card shows the bioluminescent dot, name, tag chips, and an **AI cost** badge (Free / Light / Medium / Heavy / Very heavy) derived from the kind's rule + ability budget — a hint about how many copies a level can comfortably hold. A search field filters by name and tags.

- **Inspect** — opens a read-only view of any kind, including representative sample tests you can launch in observation mode. Available for every built-in.
- **Fork** — clones a built-in or your own kind into a new editable kind. Forking is the easiest way to start.
- **Edit / Delete** — only on user kinds.
- **Import / Export** — single kinds round-trip as JSON files. Levels embed every kind they reference, so a shared level brings its custom cast along.

### The editor

A kind has seven sections; you can iterate freely between them.

1. **Identity** — name, tags (chip input with autocomplete from previously used tags), one-line description.
2. **Appearance** — hue, body shape (solid / ring / dashed ring / spokes / cross / halo), glyph, base mass.
3. **Movement** — a behaviour preset that decides how the AI runtime drives the kind:
   - **drift** — pure physics, no thinking. Cheapest.
   - **field** — carries a gravity well around itself (signed strength). Magnets, repellers, and singularity-children use this.
   - **rules** — runs the rule list every AI tick. The kind has a "mind" (counts toward Pacify victory).
4. **Rules** *(rules movement only)* — the heart of the kind. See the rule grammar below. The rules section is a **two-pane editor**: list of rules on the left, full editor for the selected rule on the right, with an inline **Library** button that drops in pre-canned rules (Chase nearest prey, Flee any threat, Stand ground, Patrol seed, …).
5. **Abilities** — event/timed/continuous effects. See abilities below. Quick-add presets are available via the same library pattern (Pulsar shockwave, Splitter burst, Anti-mote ward shield, Stop and feast, Cascading splitter capped at 25, …).
6. **Pickup** *(optional)* — turn this kind into a collectable. Set the inventory **slot** (attract / repel / a custom slot) and the **effect** that fires on press. The player picks it up by touching it; it goes into FIFO inventory and runs through the same effect pipeline as abilities.
7. **Tests** — embedded scenarios that ship with the kind. Each test names a layout (player + circles, world bounds, gravity wells, ghost-player flag, optional initial player velocity) and an expected outcome. Launch with **Run test** to enter observation mode pre-populated with the scenario.

### The rule grammar

Each rule is a structured `(when, who, what, priority, conditions)` tuple — no DSL to learn.

- **when** — `every-tick` (default) or one of the event triggers. Most rules are `every-tick`.
- **who** — target selection in two stages: a **filter** (any / kind=X / smaller-than-self / bigger-than-self / threats / prey / has-tag=…), then a **pick** (nearest / farthest / random / largest / smallest / nearest-in-front).
- **what** — the action to take: `chase`, `flee`, `orbit`, `stand-ground`, `wander`, `patrol-seed`, `dash-toward`, `dash-away`, `eject-toward`, `eject-away`, `do-nothing`.
- **priority** — integer; higher fires first.
- **conditions** — optional gate(s): `selfMassGt / Lt`, `targetMassGt / Lt`, `nearbyKindCount`, `worldKindCountLt`, `kindCountLt`, `hpFracLt`, etc. A rule whose conditions fail is skipped and the next-priority rule runs.

> **Priority vs ordering.** Priority is what wins when two rules are both eligible. Authored order is the tiebreaker within the same priority. The **observation overlay** shows per-rule fire counts so you can see which rule is actually winning during a test.

### Abilities

Abilities run alongside rules. Each ability is `(trigger, effect, conditions)`:

**Triggers** — `every N seconds` (timed), `continuous` (every tick — used for fields), `on-death`, `on-absorb` (after consuming something), `on-touched-by-bigger`, `on-growth-cross` (mass crosses a threshold), `on-hit-by-anti`, `on-near-edge`.

**Effects** — `pulse` (radial impulse), `emit-mote`, `split` (burst into N children of any kind), `drain-field` (the glutton effect, configurable rate + range), `spawn-child`, `dash` (with a `direction` mode: current / toward target / away from target / **away-from-edge** + `maxSpeed` cap), `shield` (timed invulnerability), `camo` (timed invisibility-to-AI), `freeze-self`, `convert-target`, `play-sound` (one of seven procedural presets — chime, thump, drone, pop, fizz, chirp, sparkle).

**Conditions** mirror the rule grammar (`selfMassGt`, `worldKindCountLt`, …) so abilities can be gated.

**On-death vs on-absorb.** *On-death* fires when this kind is removed (eaten, annihilated, mass-floored). *On-absorb* fires after this kind successfully consumes something — useful for "stop and feast" style behaviour where eating triggers a brief shield + freeze.

> **Hard cap.** `spawn-child` and `split` are capped at 500 live circles globally, defensively, so a misconfigured cascading splitter can't crash the browser. The library's "Cascading splitter — capped at 25" preset shows the right pattern: gate the trigger with `worldKindCountLt`.

### Pickups (user-authored)

Mark a kind as a pickup, set the slot and effect, and it behaves like the built-in attract / repel pickups: touch to collect, press the slot's button to fire. Inventory is generalised to objects (`{slot, kindId, effect}`), so multiple custom pickups can share or split the existing X / Y inputs, or define a new slot for the kind designer's own purposes. The activation routes through the same `_fireAbility` pipeline as ordinary abilities, so any effect available to abilities is available to pickups.

### Tests + observation mode

A test ships its own world snapshot. Launching enters **observation mode**:

- A top bar replaces the pause pill with playback controls: **Pause / Step (one tick) / Restart / Time scale** (0.25× / 0.5× / 1× / 2× / 4×).
- The right side shows live **per-rule fire stats** for the kind under test plus per-ability fires.
- The seeded RNG is reset on Restart, so a flaky test reproduces deterministically.
- **Ghost player** flag — when on, the player passes through everything (you watch, you don't fight).
- **Esc** exits observation back to the test list.

Tests are stored on the kind itself, so exporting a kind exports its tests. Inspecting a built-in shows curated sample tests (e.g. anti-mote annihilation, splitter burst, glutton drain ring, singularity-child orbit).

### Quick preview *(Dev mode)*

Every kind editor has a **Quick preview** button that drops you into a default scenario without authoring a test. With Dev mode on, the **level editor** exposes a special `__kut__` ("kind under test") placeholder kind in the kind dropdown — design a layout using the placeholder, save it as the **custom Quick preview**, and the kind editor's Quick preview button uses your scenario instead of the default. The placeholder is replaced with the kind being edited at launch time.

### Soft cap

There's a soft warning when a level references more distinct kinds than `lumenphage.kindCap.v1` (default 6). The level still plays — it's a hint about AI cost and player legibility, not a hard limit.

### Built-ins, in data form

Every built-in (hunter, avoider, predator, predator pup, glutton, pulsar, splitter, magnet, repeller, anti-mote, singularity child, attract pickup, repel pickup) is now stored as the same shape as user kinds. The runtime uses a single data-driven evaluator. Inspect any built-in to see exactly which rules / abilities make it tick — and fork it as a starting point.

---

## Music

Six procedural tracks, all built from the same warm pad + bell palette. There are no audio files.

- **Lobby** — exclusive to menus. Slow B-minor 7 / E-suspended alternation, sparse high bells. Anticipatory and quiet.
- **Calm** — gentle modal A-minor pentatonic pad, 7.5 s per chord. Default for tutorial campaign levels.
- **Aurora** — D-minor cycle, 9 s per chord, high bell sparkle every other chord. Default for predation / convergence stages.
- **Glacial** — sustained E drone, no progression — sparse pentatonic bells per 24 s cycle. Default for strategy stages.
- **Tide** — F lydian, 12 s per chord, secondary pad layer one octave up at the half-cycle. Default for physics campaign levels.
- **Nebula** — perfect-fifth C drone, no pulse, sparse random "stars" in upper octaves per 20 s cycle. Default for endurance stages.

Each preset and each Custom Options config carries its own track choice. Random Game picks one of the five gameplay tracks at random per session. With Dev mode on, the music-name pill in the top-right cycles tracks on click.

---

## SFX

All procedural too:

- Rising sine for *absorbing*
- Falling sine for *being absorbed*
- Filtered noise burst for *wall bounce*
- Low saw blip for *thrust*
- Bandpassed fizz + descending square for *anti-mote annihilation* (when the player is involved)
- Bright crackle + chirp tail for *splitter burst*
- Descending bass thump for *pulsar pulse* (volume falls off with distance from the player)
- Scaled chord cascade for *win*
- Descending tones for *loss*

User-authored kinds can attach any of seven procedural SFX presets (**chime, thump, drone, pop, fizz, chirp, sparkle**) to abilities or pickups via the `play-sound` effect.

---

## Tips

- **Read the colours.** A neutral mote's hue tells you its mass relative to yours. Blue → eat. Red → run.
- **Brake by ejecting forward.** Eject mass *toward* your direction of travel to slow down.
- **Boost is more mass-efficient per impulse** than a sustained thrust.
- **Anti-motes are propellant assassins.** Route around them or absorb them directly.
- **Glutton on the field is a clock.** Get to the food first, or it'll be the largest circle by the time you arrive.
- **Use predators against avoiders.** The avoider flees from anything larger. Position yourself so its flight path lands in the predator's mouth.
- **Pickups stack in your inventory.** Press X for attracts, Y for repels — useful for clearing space or pulling distant prey.

---

## Project layout

```
lumenphage/
├── index.html               # DOM + styles only — a thin shell with a single
│                            # <script type="module" src="js/main.js">. ~600 LOC.
├── js/                      # ES modules. Each file declares explicit imports
│   │                        # and exports; main.js is the entry.
│   ├── main.js              # Boot, main render/update loop, event listeners,
│   │                        # the Campaign module, hueColor, toast, the input
│   │                        # system, library data (RULE_LIBRARY / ABILITY_
│   │                        # LIBRARY / BUILTIN_INSPECTION / EDITOR_KIND_DESC
│   │                        # / kindAICost), createTagChipInput. Top-level
│   │                        # `await LevelStore.load()` blocks the menu render
│   │                        # until level JSON is in hand. ~2.3k LOC.
│   ├── core.js              # TAU, mass helpers, MIN_MOTE_MASS, _ACTIVE_THRUST,
│   │                        # KIND_META, LEVEL_TYPES, VICTORY_CONDITIONS,
│   │                        # mulberry32. Imported by almost everything.
│   ├── circle.js            # Circle entity class.
│   ├── settings.js          # Persistent input/audio/visual settings + bindings.
│   ├── touch.js             # Touch overlay + virtual stick.
│   ├── persist.js           # Thin localStorage wrapper used by everything that
│   │                        # persists (single warning on quota / private-mode
│   │                        # failures, no silent try/catch).
│   ├── audio.js             # Procedural music + SFX engine.
│   ├── kind-builtins.js     # Built-in kind data (rules / abilities for hunter,
│   │                        # predator, etc.).
│   ├── kinds.js             # Kind registry: built-ins + user kinds, level-
│   │                        # embedded overrides.
│   ├── shape.js             # Playable-area composition (rect / circle /
│   │                        # polygon CSG).
│   ├── world.js             # Sim state, physics step, victory logic.
│   ├── player.js            # Player input → thrust / boost / aim.
│   ├── view.js              # Camera follow + zoom + intro animation.
│   ├── seen-kinds.js        # First-encounter nameplate registry.
│   ├── stats.js             # Per-level stats (attempts / completions / best
│   │                        # time / peak mass).
│   ├── debug.js             # Dev-mode toggle + debug overlay flags.
│   ├── presets.js           # Curated custom-game configurations.
│   ├── custom-options.js    # Custom-game form state + presets.
│   ├── levels.js            # Procedural level builders (sparse / packed /
│   │                        # gravity).
│   ├── level-store.js       # Loads levels/{campaign,presets}/manifest.json +
│   │                        # JSON files at boot. Prefers the inline <script
│   │                        # type="application/json" id="lumenphage-levels">
│   │                        # payload when present (production build); falls
│   │                        # back to per-file fetches in dev.
│   ├── color-palette.js     # 10 lumenphage-themed level palettes + user-saved
│   │                        # palettes.
│   ├── game.js              # Top-level state machine (menu / playing / paused
│   │                        # / etc.). `Game.paused` is a getter derived from
│   │                        # `Game.state` — single source of truth.
│   ├── ui.js                # UI core: clearOverlay, renderMenu, refreshSelected,
│   │                        # updateHUD, renderPause, _navItems, replayCurrent,
│   │                        # menuActivate. Method groups live in ui-*.js.
│   ├── ui-menus.js          # Campaign / preset / hint / new-kinds / design-list
│   │                        # menus. Object.assign-extends UI.
│   ├── ui-modals.js         # In-app prompt() / confirm() (replace native).
│   ├── ui-settings.js       # Settings + Debug panels + form-adjust helper.
│   ├── ui-kinds.js          # Kind library + kind editor (rules, abilities,
│   │                        # pickups, tests, observation overlay).
│   ├── editor.js            # Level designer core: state + dispatcher methods
│   │                        # (open / exit / update / drawOverlay / renderBar /
│   │                        # _matchAppliedPalette / toggleFocus). Method
│   │                        # groups live in editor-*.js.
│   ├── editor-history.js    # Undo / redo / snapshots.
│   ├── editor-io.js         # Serialize / deserialize / save / load / export /
│   │                        # import / play / replayTest / saveTestCase.
│   ├── editor-selection.js  # Multi-select bookkeeping, alignment / distribute
│   │                        # gestures, kind/radius/velocity inspector.
│   ├── editor-shape.js      # Shape-tool primitives (rect / circle / polygon
│   │                        # CSG authoring), mirror handling.
│   ├── editor-modes.js      # Ring placement, move-to-line preview, ricochet,
│   │                        # randomize, orbitAll.
│   ├── editor-helpers.js    # Snap / quantize / camera / toolbar nav.
│   ├── highlight-json.js    # JSON syntax highlighter for the level-designer
│   │                        # JSON panel.
│   └── json-panel.js        # Live-JSON view of the level designer.
├── levels/                  # Level data — disk-side source of truth.
│   ├── campaign/
│   │   ├── manifest.json    # id / name / stage / branches / hint /
│   │   │                    # file?|procedural?
│   │   └── 01-first-bite.json … 30-singularity.json
│   └── presets/
│       ├── manifest.json
│       └── petri-dish.json …
├── dist/                    # Build output (gitignored).
│   └── index.html           # Self-contained single file: minified JS bundle
│                            # + inline level JSON. ~465 KB. Runs from file://.
├── scripts/                 # Tooling — none of this ships with the game.
│   ├── build.mjs            # esbuild: bundles main.js + every level JSON into
│   │                        # dist/index.html. `npm run build`.
│   ├── check.mjs            # `node --check` on every js/*.js as ES modules.
│   └── extract-levels.mjs   # Stubs browser globals on globalThis, dynamic-
│                            # imports main.js (which awaits LevelStore.load),
│                            # then re-derives every levels/**/*.json by
│                            # running each build() against the live runtime.
├── test/
│   └── levels.test.mjs      # Schema + branch + idempotency tests on the
│                            # JSON files. `npm run test:verify` re-runs the
│                            # extractor and diffs against on-disk JSON.
├── package.json             # Type=module, scripts, devDeps (acorn + esbuild).
├── package-lock.json
├── .gitignore               # node_modules/, dist/, .DS_Store
└── README.md
```

**Module style.** Every `js/*.js` is a native ES module with explicit `import`/`export`. The browser loads them via the single `<script type="module" src="js/main.js">` in `index.html`; everything else is reached through `main.js`'s import graph. The Editor / UI partials (`editor-*.js`, `ui-*.js`) import their parent god-object and `Object.assign` methods onto it at module-eval time, so dispatcher logic stays in the core file but tooling/IO/etc. live in their own files. `main.js` triggers each partial via side-effect imports.

**Boot order** is now imposed by the import graph rather than `<script src>` order. `main.js` does a top-level `await LevelStore.load()` before kicking off the animation loop, so the menu renders against a populated `Campaign.levels` instead of a flash-of-empty-menu.

**`npm` scripts:**

| Script | What it does |
|---|---|
| `npm run serve` | `python3 -m http.server 8000` — dev mode against per-file modules. |
| `npm run build` | esbuild bundle → `dist/index.html`. Single self-contained file. |
| `npm run check` | `node --check` every module file (as ESM). Fast syntax-only pass. |
| `npm test` | Schema / branch / shape tests on the level JSON. |
| `npm run test:verify` | Tests + re-runs the extractor and confirms the JSON files round-trip byte-identically. |
| `npm run extract-levels` | Regenerates `levels/**/*.json` from the live runtime — used as a verification gate before committing any code change that could affect level data. |

---

## Notes

Inspiration from cellular biology and the long tradition of "eat-em-up" arcade games. The name *Lumenphage* combines the Latin *lumen* (light) and Greek *phage* (eater): the bioluminescent eater.
