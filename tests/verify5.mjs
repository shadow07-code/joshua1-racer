// Phase 2 verification.
//   A: the serverless API's champion-ghost path, with a mocked Redis. This is
//      the one place untrusted client data is accepted, so it gets real cases.
//   B: the rival sprite is genuinely distinguishable from your own ghost.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // the repo root
const require = createRequire(import.meta.url);
process.env.UPSTASH_REDIS_REST_URL = "https://mock.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "mock-token";

let calls = [];
let program = {};
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  const isPipeline = String(url).endsWith("/pipeline");
  const cmds = isPipeline ? body : [body];
  for (const c of cmds) calls.push(c);
  const results = cmds.map((c) => {
    const op = String(c[0]).toUpperCase();
    if (op in program) return typeof program[op] === "function" ? program[op](c) : program[op];
    if (op === "ZREVRANGE") return [];
    if (op === "INCR") return 1;
    return "OK";
  });
  return { ok: true, json: async () => (isPipeline ? results.map((r) => ({ result: r })) : { result: results[0] }) };
};

const handler = require(path.join(ROOT, "api", "leaderboard.js"));

function mockRes() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (j) => { r.body = j; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
async function call(method, body, prog = {}) {
  calls = [];
  program = prog;
  const res = mockRes();
  await handler({ method, body, headers: {}, socket: { remoteAddress: "1.2.3.4" } }, res);
  return { res, calls };
}
const stored = (calls) => calls.find((c) => String(c[0]).toUpperCase() === "SET" && String(c[1]).includes("ghost"));

const results = [];
const check = (label, pass, detail = "") => { results.push([label, pass, detail]); };

const GOOD = Array.from({ length: 300 }, (_, i) => [i * 40, ((i * 7) % 60) - 30]);

// ── A1: GET surfaces the champion ──
{
  const champ = JSON.stringify({ name: "SHADOW07", score: 123456, samples: GOOD });
  const { res } = await call("GET", null, { GET: champ, ZREVRANGE: [] });
  check("GET returns the champion ghost",
    !!res.body.champion && res.body.champion.name === "SHADOW07" && res.body.champion.samples.length === 300,
    res.body.champion ? "" : "champion was null");
}
// ── A2: GET tolerates no champion stored yet ──
{
  const { res } = await call("GET", null, { GET: null, ZREVRANGE: [] });
  check("GET with no champion stored returns null, not an error",
    res.code === 200 && res.body.champion === null, "code " + res.code);
}
// ── A3: GET tolerates a corrupt champion blob ──
{
  const { res } = await call("GET", null, { GET: "{not json", ZREVRANGE: [] });
  check("GET with a corrupt champion blob degrades to null",
    res.code === 200 && res.body.champion === null, "code " + res.code);
}
// ── A4: rank 1 with valid samples STORES ──
{
  const { res, calls } = await call("POST",
    { name: "ANTONY", score: 90000, time: 120, passed: 170, topSpeed: 200, samples: GOOD },
    { ZREVRANK: 0, ZCARD: 42, ZSCORE: "90000", ZREVRANGE: [] });
  check("rank 1 + valid samples -> ghost stored", !!stored(calls) && res.body.rank === 1,
    "rank " + res.body.rank + ", stored=" + !!stored(calls));
}
// ── A5: rank 2 must NOT store ──
{
  const { res, calls } = await call("POST",
    { name: "ANTONY", score: 500, time: 120, passed: 10, topSpeed: 150, samples: GOOD },
    { ZREVRANK: 1, ZCARD: 42, ZREVRANGE: [] });
  check("rank 2 + valid samples -> ghost NOT stored", !stored(calls) && res.body.rank === 2,
    "rank " + res.body.rank + ", stored=" + !!stored(calls));
}
// ── A5b: the champion having a BAD run must NOT overwrite the world ghost ──
// ZADD..GT only raises a score, but ZREVRANK still reports rank 1 for the
// reigning champion whatever they just scored. Without the record check, a
// mediocre run by the leader would replace the ghost everyone else races.
{
  const { res, calls } = await call("POST",
    { name: "JOSHUA 2", score: 50000, time: 120, passed: 10, topSpeed: 200, samples: GOOD },
    { ZREVRANK: 0, ZCARD: 42, ZSCORE: "286191", ZREVRANGE: [] });
  check("rank 1 but NOT a record run -> world ghost preserved",
    !stored(calls) && res.body.rank === 1, "stored=" + !!stored(calls));
}
// ── A5c: the champion setting a NEW record DOES replace it ──
{
  const { calls } = await call("POST",
    { name: "JOSHUA 2", score: 300000, time: 200, passed: 400, topSpeed: 220, samples: GOOD },
    { ZREVRANK: 0, ZCARD: 42, ZSCORE: "300000", ZREVRANGE: [] });
  check("rank 1 AND a record run -> world ghost updated", !!stored(calls));
}
// ── A5d: a first-ever submit (no prior score stored) still arms the ghost ──
{
  const { calls } = await call("POST",
    { name: "NEWCOMER", score: 5000, time: 60, passed: 40, topSpeed: 170, samples: GOOD },
    { ZREVRANK: 0, ZCARD: 1, ZSCORE: null, ZREVRANGE: [] });
  check("first-ever #1 with no prior stored score -> ghost stored", !!stored(calls));
}

// ── A6: malformed samples are rejected but the SCORE still lands ──
const BAD = {
  "too long": Array.from({ length: 1501 }, () => [1, 1]),
  "too short": [[1, 1]],
  "not an array": "haha",
  "bad element shape": [[1, 1], [1, 1], [1]],
  "NaN value": [[1, 1], [1, 1], ["x", 1]],
  "x out of bounds": [[1, 1], [1, 1], [1, 99999]],
  "negative z": [[1, 1], [1, 1], [-5, 1]],
  "nested object": [[1, 1], [1, 1], { z: 1, x: 1 }],
};
for (const [label, samples] of Object.entries(BAD)) {
  const { res, calls } = await call("POST",
    { name: "HACKER", score: 90000, time: 120, passed: 1, topSpeed: 200, samples },
    { ZREVRANK: 0, ZCARD: 42, ZSCORE: "90000", ZREVRANGE: [] });
  check(`malformed samples rejected (${label}) but score still accepted`,
    !stored(calls) && res.code === 200, "stored=" + !!stored(calls) + " code=" + res.code);
}
// ── A7: a submit with no samples at all is fine ──
{
  const { res, calls } = await call("POST",
    { name: "ANTONY", score: 90000, time: 120, passed: 1, topSpeed: 200 },
    { ZREVRANK: 0, ZCARD: 42, ZSCORE: "90000", ZREVRANGE: [] });
  check("rank 1 with NO samples -> no store, no error", !stored(calls) && res.code === 200);
}

// ── B: the rival phantom is actually distinguishable ──
const sprites = await import(pathToFileURL(path.join(ROOT, "src/sprites.js")).href);
const garage = await import(pathToFileURL(path.join(ROOT, "src/garage.js")).href);
{
  const base = sprites.SPR_FERRARI_BASE;
  const mine = sprites.ghostSprite(base);
  const rivalBody = sprites.recolorBody(base, 7, 6, 8, 19, 5, 21);
  const rival = sprites.rivalGhostSprite(rivalBody);
  let opposite = 0, overlap = 0, solid = 0;
  for (let y = 0; y < base.length; y++) {
    for (let x = 0; x < base[y].length; x++) {
      if (base[y][x] === -1) continue;
      solid++;
      const a = mine[y][x] !== -1, b = rival[y][x] !== -1;
      if (a !== b) opposite++;
      if (a && b) overlap++;
    }
  }
  check("rival mask is the exact OPPOSITE parity of your ghost (zero shared pixels)",
    opposite === solid && overlap === 0, `opposite ${opposite}/${solid}, overlap ${overlap}`);

  const rivalMain = 5;
  const clash = garage.CARS.filter((c) => c.tone && c.tone[1] === rivalMain).map((c) => c.name);
  check("champion gold does not collide with any livery's main colour",
    clash.length === 0, clash.join(", "));
  check("rivalGhostSprite is cached (same array returned twice)",
    sprites.rivalGhostSprite(rivalBody) === rival);
}

console.log("PHASE 2 VERIFICATION\n");
let ok = true;
for (const [label, pass, detail] of results) {
  if (!pass) ok = false;
  console.log(`   ${pass ? "PASS" : "FAIL"}  ${label}${pass || !detail ? "" : "  [" + detail + "]"}`);
}
console.log("\n" + (ok ? "=== ALL PHASE 2 CHECKS PASS ===" : "=== FAILURES ==="));
process.exit(ok ? 0 : 1);
