// Main game loop + state machine.
import { W, H, PHYS, SPAWN, RACE, SCORE } from "./config.js";
import { getCtx, clear, rect } from "./render.js";
import { MAPS, MAP_LIST, DIFFICULTY_LIST } from "./maps.js";
import { initInput, getInput, consumePress, consumeAnyPress } from "./input.js";
import {
  initAudio, resumeAudio, startMusic, stopMusic, setMusicIntensity, setMusicTempoFactor,
  playFlourish,
  startEngine, setEngine, stopEngine,
  sfxAccelAccent, sfxBrake, sfxPickup, sfxCrash,
  sfxMenuMove, sfxMenuSelect, sfxFinish, sfxCountdownBeep,
  toggleMute,
} from "./audio.js";
import { drawRoad, distToY } from "./road.js";
import { makePlayer, updatePlayer, drawPlayer, playerBox, applyCollisionLoss } from "./entities/player.js";
import { makeAI, updateAI, drawAI, checkAIHit } from "./entities/ai.js";
import { makeTrafficSystem, updateTraffic, drawTraffic, checkTrafficHit, prepopulateTraffic } from "./entities/traffic.js";
import { makeOilSystem, drawOilSpills, checkOilHit } from "./entities/oilspills.js";
import { updateSmoke, drawSmoke } from "./entities/smoke.js";
import { makeScenerySystem, updateScenery, drawScenery } from "./scenery.js";
import {
  makeScoreState, startScoring, tickScore,
  addPassBonus, finalizeScore, bestEverScore,
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
  ai: null,
  traffic: null,
  scenery: null,
  scoreState: makeScoreState(),
  endReason: "FINISHED",
  endFinished: false,
  endPosition: 0,
  endTotal: 6,
  isNewHi: false,
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
  if (g.state === STATES.RACE) { g.prevState = g.state; g.state = STATES.PAUSED; }
  else if (g.state === STATES.PAUSED) { g.state = g.prevState; }
});

function ensureAudio() { initAudio(); resumeAudio(); }
function totalRacersCount() { return (g.ai ? g.ai.list.length : 5) + 1; }

function newRaceSetup() {
  g.map = MAPS[MAP_LIST[g.mapIdx]];
  g.difficulty = DIFFICULTY_LIST[g.diffIdx];
  g.player = makePlayer();
  g.ai = makeAI(SPAWN.aiInitial, g.difficulty, 0, g.map);
  const rowGap = g.map.key === "jungle" ? SPAWN.trafficRowGapJungle : SPAWN.trafficRowGapCity;
  g.traffic = makeTrafficSystem({ rowGapZ: rowGap });
  g.oils = makeOilSystem(g.map);
  g.scenery = makeScenerySystem();
  // Pre-populate scenery and traffic so the road is already busy when the player starts.
  for (let i = 0; i < 25; i++) updateScenery(g.scenery, 0, g.map, 0.016, SPAWN.sceneryPerMeter);
  prepopulateTraffic(g.traffic, g.map, 500);
  startScoring(g.scoreState, g.map.key, g.difficulty, 0);
  startEngine();
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
  g.player.raceTime = 0;
  g.state = STATES.RACE;
}

function endRace(reason, finished = false, position = 0) {
  stopMusic();
  stopEngine();
  g.endReason = reason;
  g.endFinished = finished;
  g.endPosition = position;
  g.endTotal = totalRacersCount();
  if (finished && position >= 1 && position <= 6) {
    g.scoreState.score += SCORE.placeBonus[position] || 0;
    if (g.scoreState.score > g.scoreState.hi) g.scoreState.beatHi = true;
  }
  g.isNewHi = finalizeScore(g.scoreState);
  if (finished) sfxFinish(); else if (g.isNewHi) playFlourish();
  g.state = STATES.GAME_OVER;
}

// ─── Updates ──────────────────────────────────────────────────────────────────
function updateTitle() {
  if (consumeAnyPress()) {
    ensureAudio();
    sfxMenuSelect();
    g.state = STATES.MAP_SELECT;
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

  if (consumePress("p", "P")) { g.prevState = g.state; g.state = STATES.PAUSED; return; }
  if (consumePress("m", "M")) { const m = toggleMute(); btnMute.textContent = m ? "♪×" : "♪"; }
  if (consumePress("Escape")) { stopMusic(); stopEngine(); g.state = STATES.TITLE; return; }

  const wasBraking = g.player._wasBraking;
  updatePlayer(g.player, dt, input, g.map, { onAccelAccent: sfxAccelAccent });
  if (input.brake && !wasBraking) sfxBrake();
  g.player._wasBraking = input.brake;

  const speed01 = g.player.speed / PHYS.maxSpeed;
  setEngine(speed01);
  setMusicTempoFactor(speed01);

  updateTraffic(g.traffic, dt, g.player.z, g.map, {
    playerX: g.player.x,
    onPassed: () => { g.scoreState.score += SCORE.trafficPassBonus; },
    onNearMiss: () => { g.scoreState.score += SCORE.nearMissBonus; sfxPickup(); },
  });
  updateAI(g.ai, dt, g.player.z, g.map, { list: [] }, () => addPassBonus(g.scoreState), g.oils);
  updateScenery(g.scenery, g.player.z, g.map, dt, SPAWN.sceneryPerMeter);

  // Exhaust smoke trails for player + all AI.
  updateSmoke(g.player, dt);
  for (const a of g.ai.list) updateSmoke(a, dt);

  // Decay player's oil-slip timer.
  if (g.player.oilTimer > 0) g.player.oilTimer = Math.max(0, g.player.oilTimer - dt);

  // Collisions.
  if (g.player.invuln <= 0) {
    const box = playerBox(g.player);
    // Traffic — solid, slows the player down a lot.
    const t = checkTrafficHit(g.traffic, box);
    if (t) {
      sfxCrash();
      applyCollisionLoss(g.player, 0.55, 1.0);
      const push = g.player.x > t.x ? 9 : -9;
      g.player.x += push;
    } else {
      // AI rivals — just a bump, no slowdown.
      const aiHit = checkAIHit(g.ai, box);
      if (aiHit) {
        sfxBrake();
        const push = g.player.x > aiHit.x ? 7 : -7;
        g.player.x += push;
        g.player.invuln = 0.25;
      }
    }
  }
  // Oil spill — applies even during invuln (it's a slip, not a crash).
  if (g.player.oilTimer <= 0) {
    const oil = checkOilHit(g.oils, playerBox(g.player));
    if (oil) {
      g.player.oilTimer = 1.2;
      g.player.speed = Math.max(PHYS.startSpeed, g.player.speed * 0.65);
      sfxBrake();
    }
  }

  tickScore(g.scoreState, g.player.z, 1);

  if (g.player.z >= RACE.finishZ) {
    let ahead = 0;
    for (const a of g.ai.list) if (a.z >= RACE.finishZ) ahead++;
    const position = ahead + 1;
    const reason = position === 1 ? "WINNER!" : position === 2 ? "2ND PLACE" : position === 3 ? "3RD PLACE" : "FINISHED";
    endRace(reason, true, position);
    return;
  }
}

function updatePaused() {
  if (consumePress("p", "P", "Enter", " ", "Touch")) g.state = g.prevState;
  if (consumePress("Escape")) { stopMusic(); stopEngine(); g.state = STATES.TITLE; }
}

function updateGameOver() {
  if (consumePress("Enter", " ", "Touch")) beginCountdown();
  if (consumePress("Escape")) g.state = STATES.TITLE;
}

// ─── Render ──────────────────────────────────────────────────────────────────
function currentLap() {
  if (!g.player) return 1;
  return Math.min(RACE.totalLaps, Math.floor(g.player.z / RACE.lapLength) + 1);
}
function playerLivePosition() {
  let ahead = 0;
  for (const a of g.ai.list) if (a.z > g.player.z) ahead++;
  return ahead + 1;
}

function drawFinishLine() {
  const dist = RACE.finishZ - g.player.z;
  if (dist <= 0 || dist > 100) return;
  const sy = distToY(dist);
  const cx = (W / 2 + g.map.biasX);
  const halfW = g.map.roadHalfWidth;
  for (let r = 0; r < 5; r++) {
    const y = (sy - r) | 0;
    for (let x = -halfW; x < halfW; x++) {
      const sq = ((Math.floor((x + halfW) / 3) + r) % 2) === 0 ? 1 : 0;
      rect(ctx, (cx + x) | 0, y, 1, 1, sq);
    }
  }
}

function drawWorld() {
  drawRoad(ctx, g.map, g.player.z, g.player.x);
  drawScenery(ctx, g.scenery, g.map, g.player.z);
  drawFinishLine();
  // Oil spills sit on the road surface, under the cars.
  drawOilSpills(ctx, g.oils, g.map, g.player.z, g.player.x);
  // Smoke trails — under cars so the cars sit on top.
  drawSmoke(ctx, g.map, g.player.z, g.player.x, g.player);
  for (const a of g.ai.list) drawSmoke(ctx, g.map, g.player.z, g.player.x, a);
  drawTraffic(ctx, g.traffic, g.map, g.player.z, g.player.x);
  drawAI(ctx, g.ai, g.map, g.player.z, g.player.x);
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
      position: playerLivePosition(),
      totalRacers: totalRacersCount(),
      passed: g.traffic.passedCount,
      lap: currentLap(),
      mapKind: g.map.key,
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
      position: g.endPosition,
      totalRacers: g.endTotal,
      passed: g.traffic ? g.traffic.passedCount : null,
      finished: g.endFinished,
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
