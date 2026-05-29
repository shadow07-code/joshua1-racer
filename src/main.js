// Main game loop + state machine — ENDLESS SURVIVAL mode.
//
// No more AI rivals or finish line. The player has 3 lives. Each crash with a
// civilian costs one life. Once you reach top speed, traffic density compounds
// by +5% every 60 seconds, so the game gets harder the longer you survive.
import { W, H, PHYS, SPAWN, RACE, SCORE } from "./config.js";
import { getCtx, clear, rect } from "./render.js";
import { MAPS, MAP_LIST, DIFFICULTY_LIST } from "./maps.js";
import { initInput, getInput, consumePress, consumeAnyPress } from "./input.js";
import {
  initAudio, resumeAudio, suspendAudio, startMusic, stopMusic, setMusicIntensity, setMusicTempoFactor,
  playFlourish,
  startEngine, setEngine, stopEngine,
  sfxAccelAccent, sfxBrake, sfxPickup, sfxCrash,
  sfxMenuMove, sfxMenuSelect, sfxFinish, sfxCountdownBeep,
  toggleMute,
} from "./audio.js";
import { drawRoad, distToY } from "./road.js";
import { makePlayer, updatePlayer, drawPlayer, playerBox, applyCollisionLoss } from "./entities/player.js";
import { makeTrafficSystem, updateTraffic, drawTraffic, checkTrafficHit, prepopulateTraffic } from "./entities/traffic.js";
import { makeOilSystem, drawOilSpills, checkOilHit } from "./entities/oilspills.js";
import { makeCopsSystem, updateCops, drawCops } from "./entities/cops.js";
import { updateSmoke, drawSmoke } from "./entities/smoke.js";
import { makeScenerySystem, updateScenery, drawScenery } from "./scenery.js";
import {
  makeScoreState, startScoring, tickScore,
  finalizeScore, bestEverScore,
} from "./scoring.js";
import {
  drawHud, drawTitleScreen, drawMapSelect, drawDifficultySelect,
  drawGameOver, drawPaused, drawCountdown,
} from "./hud.js";
import { registerServiceWorker, initInstallBanner } from "./pwa.js";

const canvas = document.getElementById("game");
const ctx = getCtx(canvas);
initInput(canvas);
registerServiceWorker();
initInstallBanner();

const STATES = {
  TITLE: "TITLE",
  MAP_SELECT: "MAP_SELECT",
  DIFFICULTY: "DIFFICULTY",
  COUNTDOWN: "COUNTDOWN",
  RACE: "RACE",
  GAME_OVER: "GAME_OVER",
  PAUSED: "PAUSED",
};

const g = {
  state: STATES.TITLE,
  prevState: STATES.TITLE,
  mapIdx: 0,
  diffIdx: 0,
  map: null,
  difficulty: "medium",
  player: null,
  traffic: null,
  scenery: null,
  oils: null,
  scoreState: makeScoreState(),
  isNewHi: false,
  endReason: "GAME OVER",
  // Endless mode tracking.
  raceTime: 0,
  hitTopSpeed: false,
  densityMul: 1.0,
  densityTimer: 0,
  countdownTime: 0,
  countdownLastBeep: -1,
};

const btnMute = document.getElementById("btn-mute");
const btnPause = document.getElementById("btn-pause");
btnMute.addEventListener("click", () => {
  const m = toggleMute();
  btnMute.textContent = m ? "♪×" : "♪";
});
btnPause.addEventListener("click", () => {
  if (g.state === STATES.RACE) pauseGame();
  else if (g.state === STATES.PAUSED) resumeGame();
});

function ensureAudio() { initAudio(); resumeAudio(); }

// Pause/resume helpers — pausing silences music + engine so audio also stops
// when the player backgrounds the app. Resuming restarts both.
function pauseGame() {
  if (g.state !== STATES.RACE) return;
  g.prevState = g.state;
  g.state = STATES.PAUSED;
  stopMusic();
  stopEngine();
}
function resumeGame() {
  if (g.state !== STATES.PAUSED) return;
  g.state = g.prevState || STATES.RACE;
  if (g.state === STATES.RACE) {
    startMusic(g.map.music);
    setMusicIntensity(0);
    startEngine();
  }
}

// Stop the music + engine the instant the tab/app is hidden (minimised on a
// phone, switched away on desktop), and fully suspend the audio context so no
// scheduled chiptune notes leak through. A race auto-pauses; everything resumes
// on return.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (g.state === STATES.RACE) pauseGame();
    else { stopMusic(); stopEngine(); }
    suspendAudio();
  } else {
    resumeAudio();
  }
});

function baseRowGapForMap(map) {
  return map.key === "jungle" ? SPAWN.trafficRowGapJungle : SPAWN.trafficRowGapCity;
}

function newRaceSetup() {
  g.map = MAPS[MAP_LIST[g.mapIdx]];
  g.difficulty = DIFFICULTY_LIST[g.diffIdx];
  g.player = makePlayer();
  g.traffic = makeTrafficSystem({ rowGapZ: baseRowGapForMap(g.map) });
  g.oils = makeOilSystem(g.map);
  g.cops = makeCopsSystem();
  g.scenery = makeScenerySystem();
  for (let i = 0; i < 25; i++) updateScenery(g.scenery, 0, g.map, 0.016, SPAWN.sceneryPerMeter);
  prepopulateTraffic(g.traffic, g.map, 500);
  startScoring(g.scoreState, g.map.key, g.difficulty, 0);
  startEngine();
  // Reset endless-mode trackers.
  g.raceTime = 0;
  g.hitTopSpeed = false;
  g.densityMul = 1.0;
  g.densityTimer = 0;
}

function beginCountdown() {
  newRaceSetup();
  g.countdownTime = 0;
  g.countdownLastBeep = -1;
  g.state = STATES.COUNTDOWN;
}

function beginRace() {
  startMusic(g.map.music);
  setMusicIntensity(0);
  startEngine();              // safe no-op if already running (e.g. from countdown)
  g.player.raceTime = 0;
  g.state = STATES.RACE;
}

function endRace(reason) {
  stopMusic();
  stopEngine();
  g.endReason = reason;
  g.isNewHi = finalizeScore(g.scoreState);
  if (g.isNewHi) playFlourish();
  g.state = STATES.GAME_OVER;
}

// ─── Updates ──────────────────────────────────────────────────────────────────
function updateTitle() {
  if (consumeAnyPress()) {
    ensureAudio();
    sfxMenuSelect();
    // Skip map / difficulty pickers — only one of each.
    beginCountdown();
  }
}

function updateMapSelect() {
  if (consumePress("ArrowLeft", "a", "A")) {
    g.mapIdx = (g.mapIdx + MAP_LIST.length - 1) % MAP_LIST.length;
    ensureAudio(); sfxMenuMove();
  }
  if (consumePress("ArrowRight", "d", "D")) {
    g.mapIdx = (g.mapIdx + 1) % MAP_LIST.length;
    ensureAudio(); sfxMenuMove();
  }
  if (consumePress("Enter", " ", "Touch")) {
    ensureAudio(); sfxMenuSelect();
    g.state = STATES.DIFFICULTY;
  }
  if (consumePress("Escape")) g.state = STATES.TITLE;
}

function updateDifficulty() {
  if (consumePress("ArrowLeft", "a", "A")) {
    g.diffIdx = (g.diffIdx + DIFFICULTY_LIST.length - 1) % DIFFICULTY_LIST.length;
    ensureAudio(); sfxMenuMove();
  }
  if (consumePress("ArrowRight", "d", "D")) {
    g.diffIdx = (g.diffIdx + 1) % DIFFICULTY_LIST.length;
    ensureAudio(); sfxMenuMove();
  }
  if (consumePress("Enter", " ", "Touch")) {
    ensureAudio();
    beginCountdown();
  }
  if (consumePress("Escape")) g.state = STATES.MAP_SELECT;
}

function updateCountdown(dt) {
  if (consumePress("Escape")) { stopEngine(); g.state = STATES.TITLE; return; }
  g.countdownTime += dt;
  const step = Math.floor(g.countdownTime);
  if (step !== g.countdownLastBeep && step <= RACE.countdownSeconds) {
    g.countdownLastBeep = step;
    sfxCountdownBeep(step >= RACE.countdownSeconds);
  }
  if (g.countdownTime >= RACE.countdownSeconds + 0.6) beginRace();
}

function updateRace(dt) {
  const input = getInput();

  if (consumePress("p", "P")) { pauseGame(); return; }
  if (consumePress("m", "M")) { const m = toggleMute(); btnMute.textContent = m ? "♪×" : "♪"; }
  if (consumePress("Escape")) { stopMusic(); stopEngine(); g.state = STATES.TITLE; return; }

  g.raceTime += dt;

  updatePlayer(g.player, dt, input, g.map, { onAccelAccent: sfxAccelAccent });

  const speed01 = g.player.speed / PHYS.maxSpeed;
  setEngine(speed01);
  setMusicTempoFactor(speed01);

  // ── Density scaling ──
  // Once the player first reaches top speed, start a 60s timer. Each interval,
  // traffic density grows by +5%. We apply this by shrinking the row spacing.
  if (!g.hitTopSpeed && g.player.speed >= PHYS.maxSpeed * RACE.topSpeedThreshold) {
    g.hitTopSpeed = true;
    g.densityTimer = 0;
  }
  if (g.hitTopSpeed) {
    g.densityTimer += dt;
    while (g.densityTimer >= RACE.densityStepSeconds) {
      g.densityTimer -= RACE.densityStepSeconds;
      g.densityMul = Math.min(RACE.densityMax, g.densityMul * (1 + RACE.densityStepIncrement));
    }
  }
  g.traffic.rowGapZ = baseRowGapForMap(g.map) / g.densityMul;

  updateTraffic(g.traffic, dt, g.player.z, g.map, {
    playerX: g.player.x,
    onPassed: () => { g.scoreState.score += SCORE.passBonus; },
    onNearMiss: () => { g.scoreState.score += SCORE.nearMissBonus; sfxPickup(); },
  });
  // Cops kick in once the player crosses 250 km/h.
  updateCops(g.cops, dt, g.player.z, g.player.x, g.player.speed, g.map, {
    onRam: () => {
      // Cop hit from behind — drop speed sharply, brief invuln, no life loss.
      g.player.speed = Math.max(PHYS.startSpeed, g.player.speed * RACE.copRamSlowdown);
      g.player.invuln = Math.max(g.player.invuln, 0.6);
      sfxCrash();
    },
  });
  updateScenery(g.scenery, g.player.z, g.map, dt, SPAWN.sceneryPerMeter);

  // Player exhaust smoke (no more AI smoke — AI gone).
  updateSmoke(g.player, dt);

  // Decay player's oil-slip timer.
  if (g.player.oilTimer > 0) g.player.oilTimer = Math.max(0, g.player.oilTimer - dt);

  // ── Collisions ──
  if (g.player.invuln <= 0) {
    const box = playerBox(g.player);
    const t = checkTrafficHit(g.traffic, box);
    if (t) {
      sfxCrash();
      applyCollisionLoss(g.player, 0.55, 1.5);
      // Push the player away laterally so they're not stuck inside the car.
      const push = g.player.x > t.x ? 9 : -9;
      g.player.x += push;
      // Mark the hit car so we can't lose two lives to the same car in a row.
      t.skin = t.skin; // (kept for symmetry — no skin change)
      g.player.lives -= 1;
      if (g.player.lives <= 0) {
        endRace("GAME OVER");
        return;
      }
    }
  }
  // Oil spill — slip, not a crash. No life cost.
  if (g.player.oilTimer <= 0) {
    const oil = checkOilHit(g.oils, playerBox(g.player));
    if (oil) {
      g.player.oilTimer = 1.2;
      g.player.speed = Math.max(PHYS.startSpeed, g.player.speed * 0.65);
      sfxBrake();
    }
  }

  tickScore(g.scoreState, g.player.z, 1);
  // Per-second time bonus accumulated continuously.
  g.scoreState.score += SCORE.survivalSecondBonus * dt;
}

function updatePaused() {
  if (consumePress("p", "P", "Enter", " ", "Touch")) { ensureAudio(); resumeGame(); }
  if (consumePress("Escape")) { stopMusic(); stopEngine(); g.state = STATES.TITLE; }
}

function updateGameOver() {
  if (consumePress("Enter", " ", "Touch")) beginCountdown();
  if (consumePress("Escape")) g.state = STATES.TITLE;
}

// ─── Render ──────────────────────────────────────────────────────────────────
function drawWorld() {
  drawRoad(ctx, g.map, g.player.z, g.player.x);
  drawScenery(ctx, g.scenery, g.map, g.player.z);
  drawOilSpills(ctx, g.oils, g.map, g.player.z, g.player.x);
  drawSmoke(ctx, g.map, g.player.z, g.player.x, g.player);
  drawTraffic(ctx, g.traffic, g.map, g.player.z, g.player.x);
  drawCops(ctx, g.cops, g.map, g.player.z, g.player.x);
  drawPlayer(ctx, g.player, g.map);
}

function render() {
  clear(ctx, 12);
  if (g.state === STATES.TITLE) { drawTitleScreen(ctx, bestEverScore()); return; }
  if (g.state === STATES.MAP_SELECT) { drawMapSelect(ctx, g.mapIdx); return; }
  if (g.state === STATES.DIFFICULTY) { drawDifficultySelect(ctx, g.diffIdx); return; }
  if (g.state === STATES.COUNTDOWN) {
    drawWorld();
    const t = g.countdownTime;
    let label = "3";
    if (t < 1) label = "3";
    else if (t < 2) label = "2";
    else if (t < 3) label = "1";
    else label = "GO!";
    drawCountdown(ctx, label);
    return;
  }
  if (g.state === STATES.RACE || g.state === STATES.PAUSED) {
    drawWorld();
    drawHud(ctx, {
      score: g.scoreState.score,
      speed: g.player.speed,
      passed: g.traffic.passedCount,
      mapKind: g.map.key,
      time: g.raceTime,
      lives: g.player.lives,
      densityMul: g.densityMul,
    });
    if (g.state === STATES.PAUSED) drawPaused(ctx);
    return;
  }
  if (g.state === STATES.GAME_OVER) {
    drawGameOver(ctx, {
      score: g.scoreState.score,
      hi: g.scoreState.hi,
      isNew: g.isNewHi,
      reason: g.endReason,
      passed: g.traffic ? g.traffic.passedCount : 0,
      time: g.raceTime,
    });
    return;
  }
}

const FIXED_DT = 1 / 60;
let acc = 0;
let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  if (dt > 0.25) dt = 0.25;
  lastT = now;
  acc += dt;
  while (acc >= FIXED_DT) { update(FIXED_DT); acc -= FIXED_DT; }
  render();
  requestAnimationFrame(frame);
}
function update(dt) {
  switch (g.state) {
    case STATES.TITLE: updateTitle(); break;
    case STATES.MAP_SELECT: updateMapSelect(); break;
    case STATES.DIFFICULTY: updateDifficulty(); break;
    case STATES.COUNTDOWN: updateCountdown(dt); break;
    case STATES.RACE: updateRace(dt); break;
    case STATES.PAUSED: updatePaused(); break;
    case STATES.GAME_OVER: updateGameOver(); break;
  }
}
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
