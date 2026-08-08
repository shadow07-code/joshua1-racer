// Ghost car — race against your own personal best.
//
// A run is recorded as a low-rate track of (time → distance, lateral offset).
// On a new personal best the track is saved; every later run replays it as a
// translucent car sitting at the position YOU were at, at this moment of the run.
// So if the ghost is ahead on screen, your best self is beating you right now —
// which turns a solo endless runner into a race with immediate, continuous
// feedback instead of only a number at game over.
//
// Deliberately cheap: one sample every SAMPLE_SEC, two small numbers each, so a
// long run is a few KB of JSON in localStorage.
import { project } from "./road.js";
import { drawSpriteNN } from "./render.js";
import { ghostSprite } from "./sprites.js";
import { selectedSprite } from "./garage.js";

const SAMPLE_SEC = 0.4;                 // seconds between recorded samples
const MAX_SAMPLES = 1500;               // ~10 minutes; guards runaway storage
const KEY_PREFIX = "joshua1.ghost.v1";

function key(map, difficulty) { return `${KEY_PREFIX}.${map}.${difficulty}`; }

// ── Recording ────────────────────────────────────────────────────────────────
export function makeGhostRecorder() {
  return { samples: [], next: 0 };
}

// Call every frame with the current race time and player. Stores a sample when
// the next slot is due.
export function recordGhost(rec, raceTime, player) {
  if (!rec || rec.samples.length >= MAX_SAMPLES) return;
  if (raceTime < rec.next) return;
  rec.next = raceTime + SAMPLE_SEC;
  rec.samples.push([Math.round(player.z), Math.round(player.x)]);
}

export function saveGhost(rec, map, difficulty) {
  if (!rec || rec.samples.length < 3) return false;   // too short to be a race
  try {
    localStorage.setItem(key(map, difficulty), JSON.stringify(rec.samples));
    return true;
  } catch { return false; }
}

// ── Playback ─────────────────────────────────────────────────────────────────
export function loadGhost(map, difficulty) {
  try {
    const raw = localStorage.getItem(key(map, difficulty));
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length >= 3 ? arr : null;
  } catch { return null; }
}

// Where the ghost was at `raceTime`, linearly interpolated between samples.
// Returns null once the ghost's run has ended (it died before this point — which
// means you've already outlasted your best).
export function ghostAt(samples, raceTime) {
  if (!samples || !samples.length) return null;
  const f = raceTime / SAMPLE_SEC;
  const i = Math.floor(f);
  if (i >= samples.length - 1) return null;      // ghost's run is over
  const a = samples[i], b = samples[i + 1];
  const t = f - i;
  return { z: a[0] + (b[0] - a[0]) * t, x: a[1] + (b[1] - a[1]) * t };
}

// Draw the ghost at its world position, so it appears ahead of (or behind) the
// player on the road exactly like traffic does. Checkerboard-masked so it reads
// as a phantom rather than a solid rival.
export function drawGhost(ctx, samples, raceTime, map, playerZ, playerX) {
  const g = ghostAt(samples, raceTime);
  if (!g) return;
  const p = project(map, playerZ, playerX, g);
  if (!p) return;                                 // beyond the horizon / off-screen
  drawSpriteNN(ctx, ghostSprite(selectedSprite()), p.sx - 5, p.sy - 8, 1.05);
}
