#!/usr/bin/env node
// Production build — bundles the module graph rooted at js/main.js
// into a single inline <script type="module"> in dist/index.html and
// embeds every level JSON file as a <script type="application/json">
// payload so the result is a single self-contained HTML file.
//
//   npm run build → dist/index.html
//
// LevelStore prefers the inline payload when present, so the bundled
// page works from file:// without a server. (Dev mode still uses
// per-file fetches against ./levels/...)

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });

// 1. Bundle JS.
const result = await esbuild.build({
  entryPoints: [path.join(root, "js/main.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",          // top-level await + class fields, etc.
  minify: true,
  legalComments: "none",
  write: false,
  logLevel: "warning",
});
const bundleJs = result.outputFiles[0].text;

// 2. Read the source HTML and the level JSON tree.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const levelBundle = { campaign: {}, presets: {} };
function readLevelDir(name) {
  const dir = path.join(root, "levels", name);
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    out[f] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  return out;
}
levelBundle.campaign = readLevelDir("campaign");
levelBundle.presets  = readLevelDir("presets");

// 3. Compose dist/index.html. Replace the <script type="module" src=…>
//    with the inline bundle, and inject the level payload as a
//    <script type="application/json"> right before it so it parses
//    (and is reachable by the loader) before the bundle runs.
const bundleScript = `<script type="module">\n${bundleJs}\n</script>`;
const levelsScript =
  `<script type="application/json" id="lumenphage-levels">\n` +
  // JSON in HTML can't contain `</script>` literally — the browser
  // parser would close the surrounding <script> tag. Escape the
  // forward-slash to defang any such occurrence in the data.
  JSON.stringify(levelBundle).replace(/<\/script/gi, "<\\/script") +
  `\n</script>`;

const out = html.replace(
  /<script type="module" src="js\/main\.js"><\/script>/,
  `${levelsScript}\n${bundleScript}`,
);

const outPath = path.join(distDir, "index.html");
fs.writeFileSync(outPath, out);

const sizeKB = (out.length / 1024).toFixed(1);
const jsKB = (bundleJs.length / 1024).toFixed(1);
const levelsKB = (JSON.stringify(levelBundle).length / 1024).toFixed(1);
console.log(`built dist/index.html — ${sizeKB} KB total (${jsKB} KB JS bundle, ${levelsKB} KB level data)`);
