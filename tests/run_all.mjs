// Runs every pass/fail suite, each in its own Node process (the harness stubs
// the browser globally, so suites must not share one), and prints one line per
// suite. Exits 0 only if every suite passes.
//
//   node tests/run_all.mjs            all suites (about a minute)
//   node tests/run_all.mjs fun soak   only suites whose file name contains a word
//
// tests/probes/ holds MEASUREMENTS used when tuning, not pass/fail tests: run
// those one at a time (several take minutes).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITES = [
  "verify_fun.mjs",       // fun, mechanics and feel passes, timing tells, ELEVATE
  "verify_feel.mjs",      // feel + graphics pass, asserted against recorded draws
  "verify_daynight.mjs",  // day/night timing, darkness and headlights
  "verify5.mjs",          // leaderboard API ghost path + rival sprite
  "verify_nogates.mjs",   // risk gates gone, every traffic row still solvable
  "soak.mjs",             // 10 simulated minutes: no leaks, NaN or escapes
  "swcheck.mjs",          // sw.js precaches everything main.js imports (offline)
];

const only = process.argv.slice(2);
const picked = SUITES.filter((f) => !only.length || only.some((w) => f.includes(w)));
if (!picked.length) { console.log(`No suite matches: ${only.join(" ")}`); process.exit(1); }
let failed = 0;
for (const file of picked) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, file)], {
    cwd: path.resolve(HERE, ".."), encoding: "utf8", maxBuffer: 64 << 20, timeout: 10 * 60 * 1000,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}${r.error ? `\n${r.error}` : ""}`.trim();
  const ok = r.status === 0;
  if (!ok) failed++;
  const secs = ((Date.now() - t0) / 1000).toFixed(0).padStart(3);
  console.log(`${ok ? "PASS" : "FAIL"}  ${file.padEnd(20)}${secs}s   ${out.split("\n").pop()}`);
  if (!ok) for (const l of out.split("\n").filter((l) => /FAIL|Error|MISS|!!/.test(l)).slice(0, 25)) console.log(`        ${l}`);
}
console.log(failed ? `\n${failed} suite(s) FAILED` : "\nALL SUITES PASS");
process.exit(failed ? 1 : 0);
