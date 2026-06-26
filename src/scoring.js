// Score accumulator + localStorage high score, keyed by map+difficulty.
import { SCORE } from "./config.js";

export function makeScoreState() {
  return {
    score: 0,
    lastZ: 0,
    map: "city",
    difficulty: "medium",
    hi: 0,
    beatHi: false,
  };
}

function hiKey(map, difficulty) {
  // `.v2` namespace = a clean slate for the rebuilt (non-inflated) scoring. The
  // old joshua1.hiscore.* bests (from the runaway-combo system, e.g. 45M) are
  // abandoned, not read — so the personal-best chip starts fresh on the new scale.
  return `joshua1.hiscore.v2.${map}.${difficulty}`;
}

export function loadHiScore(map, difficulty) {
  try {
    const v = localStorage.getItem(hiKey(map, difficulty));
    return v ? parseInt(v, 10) || 0 : 0;
  } catch { return 0; }
}

export function saveHiScore(map, difficulty, score) {
  try {
    const cur = loadHiScore(map, difficulty);
    if (score > cur) {
      localStorage.setItem(hiKey(map, difficulty), String(Math.floor(score)));
      return true;
    }
  } catch {}
  return false;
}

export function bestEverScore() {
  let best = 0;
  for (const map of ["city", "jungle"]) {
    for (const d of ["medium", "hard"]) {
      best = Math.max(best, loadHiScore(map, d));
    }
  }
  return best;
}

export function startScoring(state, map, difficulty, playerZ) {
  state.score = 0;
  state.lastZ = playerZ;
  state.map = map;
  state.difficulty = difficulty;
  state.hi = loadHiScore(map, difficulty);
  state.beatHi = false;
}

const mapBonusFor = (map) => map === "jungle" ? SCORE.jungleBonus : SCORE.cityBonus;
const diffBonusFor = (d) => d === "hard" ? SCORE.hardBonus : SCORE.mediumBonus;

// Per-frame distance accumulator.
export function tickScore(state, playerZ, multiplier) {
  const dz = Math.max(0, playerZ - state.lastZ);
  state.lastZ = playerZ;
  const gain = dz * SCORE.distanceWeight * multiplier * mapBonusFor(state.map) * diffBonusFor(state.difficulty);
  state.score += gain;
  if (state.score > state.hi) state.beatHi = true;
}

export function addPassBonus(state) {
  state.score += SCORE.passBonus * diffBonusFor(state.difficulty);
  if (state.score > state.hi) state.beatHi = true;
}

export function addSurviveLeapBonus(state) {
  state.score += SCORE.surviveLeapBonus;
  if (state.score > state.hi) state.beatHi = true;
}

export function addEscapeMaxBonus(state) {
  state.score += SCORE.escapeMaxBonus;
  if (state.score > state.hi) state.beatHi = true;
}

export function finalizeScore(state) {
  const isNew = saveHiScore(state.map, state.difficulty, state.score);
  if (isNew) state.hi = Math.floor(state.score);
  return isNew;
}
