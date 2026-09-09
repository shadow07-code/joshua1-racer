// Client-side leaderboard helper — talks to /api/leaderboard, with graceful
// offline behavior (cached results + one-shot pending-submit retry) and the
// player's remembered name.

const API = "/api/leaderboard";
const NAME_KEY = "joshua1.playerName";   // NOT versioned — the player keeps their name
// Default handle for a brand-new player — shown at the top of the title screen
// and used for high scores until the player changes it via the CHANGE NAME button.
const DEFAULT_NAME = "PLAYER1";
// `.v2` namespace = a clean slate for the rebuilt scoring (drops the cached
// inflated board + any stale pending submit from the old runaway-combo system).
const CACHE_KEY = "joshua1.lb.cache.v2";
const PENDING_KEY = "joshua1.lb.pending.v2";
// The champion's ghost, cached so a race can start against it instantly and
// still have a rival to chase when the player is offline.
const CHAMP_KEY = "joshua1.lb.champion.v2";
const TIMEOUT_MS = 6000;
const NAME_MAX = 12;

// Keep this in lockstep with the server's sanitizeName so the local echo of a
// name matches what actually lands on the board.
export function sanitizeName(raw) {
  let s = String(raw == null ? "" : raw).toUpperCase();
  s = s.replace(/[^A-Z0-9 ]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  s = s.slice(0, NAME_MAX).trim();
  return s;                       // may be "" — caller decides on a fallback
}

export function getPlayerName() {
  try { return sanitizeName(localStorage.getItem(NAME_KEY) || "") || DEFAULT_NAME; }
  catch { return DEFAULT_NAME; }
}

export function setPlayerName(name) {
  const clean = sanitizeName(name) || DEFAULT_NAME;
  try { localStorage.setItem(NAME_KEY, clean); } catch {}
  return clean;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const j = raw ? JSON.parse(raw) : null;
    return Array.isArray(j?.entries) ? j.entries : [];
  } catch { return []; }
}

function writeCache(entries) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ entries, ts: Date.now() })); } catch {}
}

function writeChampion(champ) {
  try {
    if (champ && Array.isArray(champ.samples) && champ.samples.length >= 3) {
      localStorage.setItem(CHAMP_KEY, JSON.stringify(champ));
    }
  } catch {}
}

// The reigning #1's recorded line, or null. Read at race start.
export function cachedChampion() {
  try {
    const raw = localStorage.getItem(CHAMP_KEY);
    const j = raw ? JSON.parse(raw) : null;
    return j && Array.isArray(j.samples) && j.samples.length >= 3 ? j : null;
  } catch { return null; }
}

// Best score currently on the cached board — used to decide whether this run is
// even a candidate for the crown before spending bandwidth on its ghost.
function cachedWorldBest() {
  const e = readCache();
  return e.length ? Math.max(0, Math.floor(e[0].score || 0)) : 0;
}

async function request(method, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(API, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  } finally {
    clearTimeout(timer);
  }
}

// Fetch the top entries. On network failure, returns the cached list with
// offline:true so the UI can still render something.
export async function fetchTop() {
  try {
    const { ok, status, json } = await request("GET");
    if (ok && Array.isArray(json.entries)) {
      writeCache(json.entries);
      writeChampion(json.champion);
      return { entries: json.entries, offline: false, champion: json.champion || null };
    }
    if (status === 503) return { entries: readCache(), offline: false, unconfigured: true };
    return { entries: readCache(), offline: true };
  } catch {
    return { entries: readCache(), offline: true };
  }
}

// Submit a finished run. On failure, stash for a one-shot retry next load.
export async function submitScore(run) {
  const payload = {
    name: sanitizeName(run.name) || "AAA",
    score: Math.max(0, Math.floor(run.score || 0)),
    time: Math.max(0, Math.floor(run.time || 0)),
    passed: Math.max(0, Math.floor(run.passed || 0)),
    topSpeed: Math.max(0, Math.floor(run.topSpeed || 0)),
  };
  // Only ship the ghost when this run could actually take the crown — players
  // die a lot, and 2-3 KB on every single death is bandwidth for nothing. The
  // SERVER still decides whether to keep it (it stores only at rank 1); this is
  // purely an early-out. An empty cache means we cannot tell, so we send.
  if (Array.isArray(run.samples) && run.samples.length >= 3 &&
      payload.score >= cachedWorldBest()) {
    payload.samples = run.samples;
  }
  try {
    const { ok, json } = await request("POST", payload);
    if (ok && Array.isArray(json.entries)) {
      writeCache(json.entries);
      clearPending();
      return {
        entries: json.entries, offline: false,
        rank: json.rank || null, total: json.total || null,
      };
    }
    stashPending(payload);
    return { entries: readCache(), offline: true };
  } catch {
    stashPending(payload);
    return { entries: readCache(), offline: true };
  }
}

function stashPending(payload) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch {}
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

// Retry a previously-failed submission once, on app load. Safe no-op if none.
export async function flushPending() {
  let payload = null;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    payload = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!payload) return;
  try {
    const { ok, json } = await request("POST", payload);
    if (ok) { if (Array.isArray(json.entries)) writeCache(json.entries); clearPending(); }
  } catch {}
}

export function cachedTop() {
  return readCache();
}
