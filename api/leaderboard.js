// Global leaderboard API — Vercel serverless function (Node, zero deps).
//
// GET  /api/leaderboard           → { entries: [{ rank, name, score, time, passed, topSpeed }] }
// POST /api/leaderboard  {body}   → submit a run, returns the refreshed top 20
//
// Storage: Upstash Redis via its REST API. A sorted set holds the best score per
// name (ZADD ... GT), and a parallel hash holds per-name run metadata (time /
// cars passed / top speed) for display. No npm dependencies — uses global fetch
// (Node 18+/20 on Vercel).
//
// Env vars (injected by Vercel when an Upstash/KV store is connected):
//   UPSTASH_REDIS_REST_URL  / UPSTASH_REDIS_REST_TOKEN     (Upstash integration)
//   KV_REST_API_URL         / KV_REST_API_TOKEN            (Vercel KV alias)

// v2 = a clean board for the rebuilt (non-inflated) scoring. The old v1 sorted
// set (with the runaway-combo scores, e.g. ANTONY 4.7M) is simply abandoned —
// no destructive delete needed; new honest scores compete on a fresh key.
const LB_KEY = "joshua1:lb:v2";
const META_KEY = "joshua1:lb:meta:v2";
// The reigning champion's GHOST — their run recorded as [z, x] pairs, so every
// other player can race the #1 line instead of only reading a number. Written
// only by a submit that actually lands at rank 1; ~2-3 KB for a 2-minute run.
const GHOST_KEY = "joshua1:lb:ghost:v2";
const TOP_N = 20;
const MAX_GHOST_SAMPLES = 1500;         // matches ghost.js's own cap

// Validation bounds — lenient; only blocks absurd/forged values, not tight policing.
const SCORE_CAP = 1_000_000_000;        // hard ceiling
const PLAUSIBLE_PER_SEC = 100_000;       // very generous per-second rate
const PLAUSIBLE_MARGIN = 100_000;        // flat allowance for short runs
const NAME_MAX = 12;

const RL_MAX = 30;                        // max writes per IP per window
const RL_WINDOW_SEC = 60;

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

// Run a single Redis command, e.g. redis(cfg, ["ZADD", key, "GT", "10", "BOB"]).
async function redis(cfg, command) {
  const r = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const j = await r.json();
  return j.result;
}

// Run several commands in one round-trip via the pipeline endpoint.
async function pipeline(cfg, commands) {
  const r = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis pipeline ${r.status}`);
  const j = await r.json();
  return j.map((x) => x.result);
}

function sanitizeName(raw) {
  let s = String(raw == null ? "" : raw).toUpperCase();
  s = s.replace(/[^A-Z0-9 ]/g, "");      // keep only letters, digits, spaces
  s = s.replace(/\s+/g, " ").trim();      // collapse + trim whitespace
  s = s.slice(0, NAME_MAX).trim();
  return s || "AAA";
}

// Ghost samples arrive from an untrusted client, so validate hard: shape, length
// and per-value bounds. Anything malformed drops the ghost (the score still
// counts) rather than storing junk that every other player would then download.
function sanitizeSamples(raw) {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_GHOST_SAMPLES) return null;
  const out = [];
  for (const s of raw) {
    if (!Array.isArray(s) || s.length < 2) return null;
    const z = Math.round(Number(s[0]));
    const x = Math.round(Number(s[1]));
    if (!Number.isFinite(z) || !Number.isFinite(x)) return null;
    if (z < 0 || z > 10000000 || x < -512 || x > 512) return null;
    out.push([z, x]);
  }
  return out;
}

async function readChampion(cfg) {
  try {
    const raw = await redis(cfg, ["GET", GHOST_KEY]);
    if (!raw) return null;
    const j = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!j || !Array.isArray(j.samples) || j.samples.length < 3) return null;
    return { name: String(j.name || "AAA"), score: toInt(j.score), samples: j.samples };
  } catch { return null; }
}

function toInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Build the ranked entries array from a WITHSCORES flat list + a meta map.
function buildEntries(flat, metaList) {
  const entries = [];
  for (let i = 0; i < flat.length; i += 2) {
    const name = flat[i];
    const score = toInt(flat[i + 1]);
    let meta = {};
    const rawMeta = metaList ? metaList[i / 2] : null;
    if (rawMeta) { try { meta = JSON.parse(rawMeta) || {}; } catch {} }
    entries.push({
      rank: entries.length + 1,
      name,
      score,
      time: toInt(meta.time),
      passed: toInt(meta.passed),
      topSpeed: toInt(meta.topSpeed),
    });
  }
  return entries;
}

async function readTop(cfg) {
  const flat = await redis(cfg, ["ZREVRANGE", LB_KEY, "0", String(TOP_N - 1), "WITHSCORES"]);
  const names = [];
  for (let i = 0; i < flat.length; i += 2) names.push(flat[i]);
  let metaList = null;
  if (names.length) metaList = await redis(cfg, ["HMGET", META_KEY, ...names]);
  return buildEntries(flat, metaList);
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = async function handler(req, res) {
  const cfg = getRedisConfig();
  if (!cfg) {
    res.status(503).json({ error: "leaderboard not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const entries = await readTop(cfg);
      const champion = await readChampion(cfg);
      res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=30");
      res.status(200).json({ entries, champion });
      return;
    }

    if (req.method === "POST") {
      // Body may arrive parsed (Vercel) or as a raw string.
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};

      const name = sanitizeName(body.name);
      const score = toInt(body.score);
      const time = toInt(body.time);
      const passed = toInt(body.passed);
      const topSpeed = toInt(body.topSpeed);

      // Plausibility checks — block forged / absurd scores.
      if (score > SCORE_CAP || score > time * PLAUSIBLE_PER_SEC + PLAUSIBLE_MARGIN) {
        res.status(400).json({ error: "implausible score" });
        return;
      }

      // Light per-IP rate limit.
      const rlKey = `joshua1:rl:${clientIp(req)}`;
      const count = await redis(cfg, ["INCR", rlKey]);
      if (count === 1) await redis(cfg, ["EXPIRE", rlKey, String(RL_WINDOW_SEC)]);
      if (count > RL_MAX) {
        res.status(429).json({ error: "rate limited" });
        return;
      }

      const meta = JSON.stringify({ time, passed, topSpeed, ts: Date.now() });
      await pipeline(cfg, [
        ["ZADD", LB_KEY, "GT", String(score), name],
        ["HSET", META_KEY, name, meta],
      ]);

      // The player's standing after this submit, for the game-over verdict:
      // ZREVRANK is 0-based best-first (→ +1 for a human rank); ZCARD is the
      // total number of ranked players.
      const [revrank, total, storedScore] = await pipeline(cfg, [
        ["ZREVRANK", LB_KEY, name],
        ["ZCARD", LB_KEY],
        ["ZSCORE", LB_KEY, name],
      ]);
      const rank = revrank == null ? null : toInt(revrank) + 1;

      // Took the crown? Their line becomes the ghost everyone else races.
      // Gated on the SERVER's own rank, never on a client claim.
      //
      // Rank alone is NOT enough. ZADD ... GT only ever raises a score, but
      // ZREVRANK reports rank 1 for the reigning champion whatever they just
      // scored -- so a champion having a bad run would otherwise overwrite the
      // world ghost with a mediocre line, and everyone else would "beat the #1"
      // while nowhere near their score. After the GT write the stored score is
      // max(previous, this run), so score >= storedScore is true only when
      // THIS run is the record-setting one.
      const isRecordRun = score >= toInt(storedScore);
      if (rank === 1 && isRecordRun) {
        const samples = sanitizeSamples(body.samples);
        if (samples) {
          try {
            await redis(cfg, ["SET", GHOST_KEY, JSON.stringify({ name, score, samples })]);
          } catch { /* the score still stands; the ghost is best-effort */ }
        }
      }

      const entries = await readTop(cfg);
      res.status(200).json({ ok: true, entries, rank, total: toInt(total) });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "method not allowed" });
  } catch (err) {
    res.status(502).json({ error: "leaderboard upstream error" });
  }
}
