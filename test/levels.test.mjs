// Snapshot tests for the externalised level files.
//
// These verify the on-disk JSON shape stays stable. They're cheap to
// run (just file I/O + JSON.parse + structural assertions) and they
// catch the class of regressions where a refactor accidentally
// drops a field or shifts a level off-spec without anyone noticing.
//
// Run:  node --test test/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const campaignDir = path.join(root, "levels", "campaign");
const presetsDir  = path.join(root, "levels", "presets");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

test("campaign manifest references existing files", () => {
  const m = readJson(path.join(campaignDir, "manifest.json"));
  assert.equal(m.version, 1);
  assert.ok(Array.isArray(m.levels));
  assert.ok(m.levels.length >= 30, `expected ≥ 30 campaign levels, got ${m.levels.length}`);

  for (const lvl of m.levels) {
    assert.equal(typeof lvl.id, "number");
    assert.equal(typeof lvl.name, "string");
    assert.equal(typeof lvl.stage, "string");
    assert.ok(Array.isArray(lvl.branches), `${lvl.name} branches is array`);
    if (lvl.file) {
      const p = path.join(campaignDir, lvl.file);
      assert.ok(fs.existsSync(p), `${lvl.name} file ${lvl.file} exists`);
    } else if (lvl.procedural) {
      assert.match(lvl.procedural.builder, /^(sparse|packed|gravity)$/);
      assert.equal(typeof lvl.procedural.seed, "number");
    } else {
      assert.fail(`${lvl.name} has neither file nor procedural`);
    }
  }
});

test("each campaign level JSON has the expected shape", () => {
  const m = readJson(path.join(campaignDir, "manifest.json"));
  const required = [
    "type", "bounds", "shape", "insideColor", "outsideColor", "edgeColor",
    "gravityCenters", "randomVelocity", "victoryCondition", "victoryParam",
    "kinds", "circles",
  ];
  for (const lvl of m.levels) {
    if (!lvl.file) continue;
    const data = readJson(path.join(campaignDir, lvl.file));
    for (const k of required) {
      assert.ok(k in data, `${lvl.file} missing field ${k}`);
    }
    assert.match(data.type, /^(sparse|packed|gravity)$/, `${lvl.file} type`);
    assert.equal(typeof data.bounds.w, "number");
    assert.equal(typeof data.bounds.h, "number");
    assert.ok(data.bounds.w >= 100 && data.bounds.h >= 100, `${lvl.file} bounds reasonable`);
    assert.ok(Array.isArray(data.circles));
    // Every level needs a player.
    const player = data.circles.find(c => c.kind === "player");
    assert.ok(player, `${lvl.file} has a player`);
    assert.ok(player.x >= 0 && player.x <= data.bounds.w, `${lvl.file} player inside bounds (x)`);
    assert.ok(player.y >= 0 && player.y <= data.bounds.h, `${lvl.file} player inside bounds (y)`);
  }
});

test("preset manifest references existing files", () => {
  const m = readJson(path.join(presetsDir, "manifest.json"));
  assert.equal(m.version, 1);
  assert.ok(Array.isArray(m.presets));
  for (const p of m.presets) {
    assert.equal(typeof p.id, "string");
    assert.equal(typeof p.name, "string");
    assert.equal(typeof p.desc, "string");
    if (p.file) {
      assert.ok(fs.existsSync(path.join(presetsDir, p.file)),
        `preset ${p.name} file ${p.file} exists`);
    } else {
      assert.ok(p.procedural, `preset ${p.name} has procedural fallback`);
    }
  }
});

test("campaign branches resolve to existing level ids", () => {
  const m = readJson(path.join(campaignDir, "manifest.json"));
  const ids = new Set(m.levels.map(l => l.id));
  for (const lvl of m.levels) {
    for (const b of lvl.branches) {
      assert.ok(ids.has(b), `${lvl.name} branches to nonexistent id ${b}`);
    }
  }
});

test("re-extraction is idempotent (no diff against on-disk)", { skip: !process.env.SNAPSHOT_VERIFY }, async () => {
  // Opt-in test: re-runs the extractor and diffs against committed
  // files. Skipped by default because it reloads the entire game
  // script in a VM (~1 s) and is intentionally a manual gate before
  // committing level changes.
  //
  // Run:  SNAPSHOT_VERIFY=1 node --test test/
  const { execSync } = await import("node:child_process");
  const before = fs.readdirSync(campaignDir).sort()
    .filter(f => f.endsWith(".json"))
    .map(f => [f, fs.readFileSync(path.join(campaignDir, f), "utf8")]);
  execSync("node scripts/extract-levels.mjs", { cwd: root, stdio: "pipe" });
  const after = fs.readdirSync(campaignDir).sort()
    .filter(f => f.endsWith(".json"))
    .map(f => [f, fs.readFileSync(path.join(campaignDir, f), "utf8")]);
  assert.deepEqual(after.map(x => x[0]), before.map(x => x[0]),
    "file list changed");
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i][1], before[i][1], `${before[i][0]} differs after re-extraction`);
  }
});
