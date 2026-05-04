#!/usr/bin/env node
// Sanity check every js/*.js parses as an ES module. Catches the
// "page is just black" class of syntax errors before they ship —
// duplicate `import`, unclosed braces, mis-positioned export, etc.
// Run as `npm run check`.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const jsDir = path.join(root, "js");

const files = fs.readdirSync(jsDir).filter(f => f.endsWith(".js"));
let failed = 0;
for (const f of files) {
  const full = path.join(jsDir, f);
  try {
    execSync(`node --check --input-type=module < "${full}"`, { stdio: "pipe", shell: "/bin/bash" });
  } catch (e) {
    console.error(`FAIL ${f}:`);
    console.error((e.stderr || e.stdout || "").toString());
    failed++;
  }
}
if (failed > 0) {
  console.error(`\n${failed} file(s) failed syntax check`);
  process.exit(1);
}
console.log(`OK ${files.length} module(s) parse cleanly`);
