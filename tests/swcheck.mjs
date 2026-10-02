// Assert sw.js's precache ASSETS covers main.js's TRANSITIVE import graph.
// This is the bug that broke the installed PWA offline for many deploys:
// network-first hides a missing precache entry whenever the player is online,
// so it only ever surfaces for an offline installed user. A VERSION bump is the
// moment the list actually takes effect, so check it here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));   // the repo root

const seen = new Set();
const stack = ["src/main.js"];
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/from\s+["']([^"']+)["']/g)) {
    const spec = m[1];
    if (!spec.startsWith(".")) continue;
    const r = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
    if (fs.existsSync(r)) stack.push(r);
    else console.log("  !! import target does not exist: " + r + "  (from " + f + ")");
  }
}

const sw = fs.readFileSync("sw.js", "utf8");
const version = (sw.match(/const VERSION = "([^"]+)"/) || [])[1];
const assets = [...sw.matchAll(/"\.\/(src\/[^"]+)"/g)].map((m) => m[1]);
const A = new Set(assets);
const graph = [...seen].sort();
const missing = graph.filter((f) => !A.has(f));
const extra = assets.filter((f) => !seen.has(f));

console.log("sw VERSION:                    " + version);
console.log("reachable from main.js:        " + graph.length);
console.log("src entries in sw ASSETS:      " + assets.length);
console.log("MISSING (would break offline): " + (missing.length ? missing.join(", ") : "none"));
console.log("stale / unreachable in list:   " + (extra.length ? extra.join(", ") : "none"));

// Non-src assets the shell also needs.
for (const need of ["./", "./index.html", "./manifest.webmanifest"]) {
  const has = sw.includes('"' + need + '"');
  console.log((has ? "ok   " : "MISS ") + "shell entry " + need);
  if (!has) missing.push(need);
}

console.log("\n" + (missing.length === 0 ? "=== PRECACHE LIST IS COMPLETE ===" : "=== PRECACHE INCOMPLETE ==="));
process.exit(missing.length === 0 ? 0 : 1);
