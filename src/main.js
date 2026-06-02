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
  sfxAccelAccent, sfxBrake, sfxPickup, sfxCrash, sfxBump, sfxBarrelDrop, sfxCombo,
  sfxShieldUp, sfxShieldHit,
  sfxMenuMove, sfxMenuSelect, sfxFinish, sfxCountdownBeep,
  setMusicEnabled, setSfxEnabled, isMusicEnabled, isSfxEnabled, applyMix,
} from "./audio.js";
import { drawRoad, distToY } from "./road.js";
import { makePlayer, updatePlayer, drawPlayer, playerBox, applyCollisionLoss } from "./entities/player.js";
import { makeTrafficSystem, updateTraffic, drawTraffic, checkTrafficHit, prepopulateTraffic } from "./entities/traffic.js";
import { makeOilSystem, drawOilSpills, checkOilHit } from "./entities/oilspills.js";
import { makeCopsSystem, updateCops, drawCops, checkBarrelHit } from "./entities/cops.js";
import { updateSmoke, drawSmoke } from "./entities/smoke.js";
import { makeScenerySystem, updateScenery, drawScenery } from "./scenery.js";
import {
  makeScoreState, startScoring, tickScore,
  finalizeScore, bestEverScore,
} from "./scoring.js";
import {
  drawHud, drawTitleScreen, drawMapSelect, drawDifficultySelect,
  drawGameOver, drawPaused, drawCountdown, drawTutorialOverlay, drawSteerHints, drawCombo, drawShieldMsg,
} from "./hud.js";
import { registerServiceWorker, initInstallBanner, initInstallButton, setInstallButtonVisible } from "./pwa.js";
import {
  initUI, setLeaderboardButtonVisible, showNameEntry, showGameOverActions,
  showLeaderboardPanel, renderLeaderboard,
} from "./ui.js";
import {
  getPlayerName, setPlayerName, submitScore, fetchTop, flushPending, cachedTop,
} from "./leaderboard.js";

const canvas = document.getElementById("game");
const ctx = getCtx(canvas);
initInput(canvas);
registerServiceWorker();
initInstallBanner();
initInstallButton();
let _lastUiState = null;   // tracks state changes to sync HTML overlays once per transition

const STATES = {
  TITLE: "TITLE",
  NAME_ENTRY: "NAME_ENTRY",
  LEADERBOARD: "LEADERBOARD",
  MAP_SELECT: "MAP_SELECT",
  DIFFICULTY: "DIFFICULTY",
  TUTORIAL: "TUTORIAL",
  COUNTDOWN: "COUNTDOWN",
  RACE: "RACE",
  GAME_OVER: "GAME_OVER",
  PAUSED: "PAUSED",
};

// First-run steering tutorial — shown once, then remembered.
const TUTORIAL_KEY = "joshua1.tutorialSeen";
let _tutorialSeen = false;
function hasSeenTutorial() {
  if (_tutorialSeen) return true;
  try { return localStorage.getItem(TUTORIAL_KEY) === "1"; } catch { return false; }
}
function markTutorialSeen() {
  _tutorialSeen = true;
  try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch {}
}

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
  topSpeedKmh: 0,
  combo: 0,             // near-miss combo multiplier
  comboTimer: 0,        // seconds left before the combo lapses
  comboFlash: 0,        // brief screen-edge flash on each combo step
  comboBest: 0,         // best combo this run (for the game-over stats)
  shieldMsg: "",        // transient "SHIELD!" / "SAVED!" popup text
  shieldMsgTimer: 0,
  countdownTime: 0,
  countdownLastBeep: -1,
  tut: null,            // first-run steering tutorial sub-state
  playerName: getPlayerName(),   // remembered name, pre-fills the entry panel
  lbReturnTo: STATES.TITLE,      // where the leaderboard BACK button returns to
};

// ── Audio toggles (music / SFX) — two independent toolbar buttons. ────────────
const btnMusic = document.getElementById("btn-music");
const btnSfx = document.getElementById("btn-sfx");
const MUSIC_KEY = "joshua1.music", SFX_KEY = "joshua1.sfx";
function loadToggle(key) { try { const v = localStorage.getItem(key); return v === null ? true : v === "1"; } catch { return true; } }
function saveToggle(key, on) { try { localStorage.setItem(key, on ? "1" : "0"); } catch {} }
function refreshAudioButtons() {
  btnMusic.textContent = "♪";
  btnMusic.classList.toggle("off", !isMusicEnabled());
  btnSfx.textContent = isSfxEnabled() ? "🔊" : "🔇";
  btnSfx.classList.toggle("off", !isSfxEnabled());
}
function toggleMusic() {
  ensureAudio();
  const on = !isMusicEnabled();
  setMusicEnabled(on); saveToggle(MUSIC_KEY, on); refreshAudioButtons();
}
function toggleSfx() {
  ensureAudio();
  const on = !isSfxEnabled();
  setSfxEnabled(on); saveToggle(SFX_KEY, on); refreshAudioButtons();
}
// Restore persisted preferences before any audio context exists; applyMix() will
// push them onto the gain nodes once initAudio() runs.
setMusicEnabled(loadToggle(MUSIC_KEY));
setSfxEnabled(loadToggle(SFX_KEY));
refreshAudioButtons();
btnMusic.addEventListener("click", toggleMusic);
btnSfx.addEventListener("click", toggleSfx);

function ensureAudio() { initAudio(); resumeAudio(); applyMix(); }

// Pause/resume helpers — pausing silences music + engine (and suspends the audio
// context) so sound stops IMMEDIATELY, even mid-note. Resuming restarts both.
function pauseGame() {
  if (g.state !== STATES.RACE) return;
  g.prevState = g.state;
  g.state = STATES.PAUSED;
  stopMusic();
  stopEngine();
  suspendAudio();
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

// Auto-pause whenever the app is backgrounded — minimised, tab/app switched, or
// the phone's BACK button is pressed. Music stops immediately (suspendAudio cuts
// any scheduled chiptune notes). A race pauses; the player taps to resume.
function autoPause() {
  if (g.state === STATES.RACE) pauseGame();
  else { stopMusic(); stopEngine(); }
  suspendAudio();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) autoPause(); else resumeAudio();
});
window.addEventListener("pagehide", autoPause);   // back button / navigation away
window.addEventListener("blur", autoPause);       // app switch / minimise
window.addEventListener("focus", () => resumeAudio());

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
  g.topSpeedKmh = 0;   // track highest speed reached (in km/h display units)
  g.combo = 0;
  g.comboTimer = 0;
  g.comboFlash = 0;
  g.comboBest = 0;
  g.shieldMsg = "";
  g.shieldMsgTimer = 0;
}

// Take a hit: a combo SHIELD absorbs it (streak survives), otherwise lose a life.
// Returns true if the run just ended.
function takeHit(invulnSec) {
  if (g.player.shield > 0) {
    g.player.shield = 0;
    g.player.invuln = Math.max(g.player.invuln, invulnSec + 0.5);
    g.shieldMsg = "SAVED!"; g.shieldMsgTimer = 1.1;
    sfxShieldHit();
    return false;                       // shield ate it — no life lost, combo lives
  }
  sfxCrash();
  g.player.lives -= 1;
  g.combo = 0; g.comboTimer = 0;        // a real crash breaks the streak
  if (g.player.lives <= 0) { endRace("GAME OVER"); return true; }
  return false;
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
  // Submit to the global board (fire-and-forget; refreshes the local cache so the
  // leaderboard panel shows this run immediately).
  submitScore({
    name: g.playerName || "AAA",
    score: Math.floor(g.scoreState.score),
    time: Math.floor(g.raceTime),
    passed: g.traffic ? g.traffic.passedCount : 0,
    topSpeed: g.topSpeedKmh || 0,
  });
  g.state = STATES.GAME_OVER;
}

// ─── Updates ──────────────────────────────────────────────────────────────────
function updateTitle() {
  if (consumeAnyPress()) {
    ensureAudio();
    sfxMenuSelect();
    // Ask for the player's name before each race (pre-filled with the last one).
    g.state = STATES.NAME_ENTRY;
  }
}

// Name confirmed in the HTML panel — store it and continue into the race.
// First-timers still get the interactive steering tutorial first.
function confirmName(name) {
  g.playerName = setPlayerName(name);
  ensureAudio();
  sfxMenuSelect();
  if (hasSeenTutorial()) beginCountdown();
  else enterTutorial();
}

// Keyboard fallbacks for the name-entry panel (Enter/Esc are also handled by the
// input element itself; this catches the case where it isn't focused).
function updateNameEntry() {
  if (consumePress("Escape")) g.state = STATES.TITLE;
  consumeAnyPress();   // swallow other stray presses while typing
}

function openLeaderboard(returnTo) {
  g.lbReturnTo = returnTo;
  g.state = STATES.LEADERBOARD;
}

function updateLeaderboard() {
  if (consumePress("Escape", "Enter", " ")) g.state = g.lbReturnTo || STATES.TITLE;
  consumeAnyPress();
}

function playAgain() {
  ensureAudio();
  sfxMenuSelect();
  beginCountdown();      // reuse the remembered name + current map/difficulty
}

// Build a minimal demo world (road + car + scenery, no traffic/scoring/cops) as
// the backdrop for the first-run interactive steering tutorial.
function enterTutorial() {
  g.map = MAPS[MAP_LIST[g.mapIdx]];
  g.player = makePlayer();
  g.scenery = makeScenerySystem();
  for (let i = 0; i < 25; i++) updateScenery(g.scenery, 0, g.map, 0.016, SPAWN.sceneryPerMeter);
  g.tut = { phase: "demo", timer: 0, targetX: 0, demoSide: 0, rightDone: false, leftDone: false, nudgeUntil: 0 };
  g.state = STATES.TUTORIAL;
}

// Interactive tutorial: a "watch" auto-demo (car weaves while the matching
// orange zone lights), then a "practice" gate (tap right → nudge ✓, tap left →
// nudge ✓), then "done" (tap to race). Esc skips. Shown once (localStorage).
function updateTutorial(dt) {
  if (consumePress("Escape")) { markTutorialSeen(); beginCountdown(); return; }
  const tut = g.tut;
  const input = getInput();

  // Gentle forward scroll so the road + scenery feel alive.
  g.player.z += 28 * dt;
  updateScenery(g.scenery, g.player.z, g.map, dt, SPAWN.sceneryPerMeter);
  tut.timer += dt;

  if (tut.phase === "demo") {
    if (tut.timer < 1.2) { tut.demoSide = 1; tut.targetX = 26; }
    else if (tut.timer < 2.4) { tut.demoSide = -1; tut.targetX = -26; }
    else if (tut.timer < 3.0) { tut.demoSide = 0; tut.targetX = 0; }
    else { tut.phase = "practice"; tut.targetX = 0; }
  } else if (tut.phase === "practice") {
    if (performance.now() > tut.nudgeUntil) tut.targetX = 0;   // ease the nudge back
    if (!tut.rightDone) {
      if (input.steer > 0.5) { tut.rightDone = true; tut.targetX = 22; tut.nudgeUntil = performance.now() + 450; ensureAudio(); sfxPickup(); }
    } else if (!tut.leftDone) {
      if (input.steer < -0.5) { tut.leftDone = true; tut.targetX = -22; tut.nudgeUntil = performance.now() + 450; ensureAudio(); sfxPickup(); }
    } else {
      tut.targetX = 0;
      consumeAnyPress();          // flush the taps used to complete the gate
      tut.phase = "done";
    }
  } else { // done
    if (consumePress("Enter", " ", "Touch")) { ensureAudio(); sfxMenuSelect(); markTutorialSeen(); beginCountdown(); return; }
  }

  // Smoothly move the demo car toward its target lateral offset.
  g.player.x += (tut.targetX - g.player.x) * Math.min(1, dt * 8);
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
  if (consumePress("m", "M")) { toggleMusic(); }
  if (consumePress("Escape")) { stopMusic(); stopEngine(); g.state = STATES.TITLE; return; }

  g.raceTime += dt;

  updatePlayer(g.player, dt, input, g.map, { onAccelAccent: sfxAccelAccent, onFenceBump: sfxBump });

  const speed01 = g.player.speed / PHYS.maxSpeed;
  setEngine(speed01);
  setMusicTempoFactor(speed01);

  // Track highest speed reached (in display km/h).
  const currentKmh = Math.round(speed01 * (PHYS.topSpeedKmh || 250));
  if (currentKmh > g.topSpeedKmh) g.topSpeedKmh = currentKmh;

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
  g.traffic.densityMul = g.densityMul;

  updateTraffic(g.traffic, dt, g.player.z, g.map, {
    playerX: g.player.x,
    onPassed: () => { g.scoreState.score += SCORE.passBonus * Math.max(1, g.combo); },
    onNearMiss: () => {
      // The combo is a HIGH-SPEED thrill — it only builds at 200+ km/h. Below
      // that a near-miss just pays the flat bonus.
      const kmh = g.player.speed / PHYS.maxSpeed * (PHYS.topSpeedKmh || 250);
      if (kmh >= 200) {
        g.combo += 1;
        g.comboBest = Math.max(g.comboBest, g.combo);
        g.comboTimer = RACE.comboWindow;
        g.comboFlash = 0.18;
        g.scoreState.score += SCORE.nearMissBonus * g.combo;
        sfxCombo(g.combo);
        // Risk → reward: every few combo steps earns a one-hit shield.
        if (g.combo % RACE.comboShieldEvery === 0 && g.player.shield < 1) {
          g.player.shield = 1;
          g.shieldMsg = "SHIELD!"; g.shieldMsgTimer = 1.3;
          sfxShieldUp();
        }
      } else {
        g.scoreState.score += SCORE.nearMissBonus;
        sfxPickup();
      }
    },
  });

  // Combo decay — lapse the streak if you go too long without a near-miss.
  if (g.comboTimer > 0) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) g.combo = 0;
  }
  if (g.comboFlash > 0) g.comboFlash = Math.max(0, g.comboFlash - dt);
  if (g.shieldMsgTimer > 0) g.shieldMsgTimer = Math.max(0, g.shieldMsgTimer - dt);
  // Police helicopter kicks in once the player crosses 250 km/h — it drops
  // flaming barrels on the road ahead (collision handled below, costs a life).
  updateCops(g.cops, dt, g.player.z, g.player.x, g.player.speed, g.map, { onDrop: sfxBarrelDrop });
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
      applyCollisionLoss(g.player, 0.55, 1.5);
      // Push the player away laterally so they're not stuck inside the car.
      const push = g.player.x > t.x ? 9 : -9;
      g.player.x += push;
      if (takeHit(1.5)) return;
    }
    // Flaming barrel from the chopper. Skipped if a traffic hit this frame
    // already granted invuln (avoids double-dipping).
    if (g.player.invuln <= 0) {
      const bar = checkBarrelHit(g.cops, playerBox(g.player));
      if (bar) {
        bar.hit = true;
        applyCollisionLoss(g.player, 0.5, 1.2);
        if (takeHit(1.2)) return;
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
  // Taps are handled by the HTML action bar; these are desktop keyboard shortcuts.
  if (consumePress("Enter", " ")) { playAgain(); return; }
  if (consumePress("l", "L")) { openLeaderboard(STATES.GAME_OVER); return; }
  if (consumePress("Escape")) { g.state = STATES.TITLE; return; }
  consumePress("Touch");   // swallow stray canvas taps so they don't leak
}

// ─── Render ──────────────────────────────────────────────────────────────────
function drawWorld() {
  drawRoad(ctx, g.map, g.player.z, g.player.speed);
  drawScenery(ctx, g.scenery, g.map, g.player.z);
  drawOilSpills(ctx, g.oils, g.map, g.player.z, g.player.x);
  drawSmoke(ctx, g.map, g.player.z, g.player.x, g.player);
  drawTraffic(ctx, g.traffic, g.map, g.player.z, g.player.x);
  drawCops(ctx, g.cops, g.map, g.player.z, g.player.x);
  drawPlayer(ctx, g.player, g.map);
}

// Toggle the HTML overlays once per state change, and kick off the leaderboard
// fetch when its panel opens. Cheap to call every frame (early-outs if unchanged).
function syncOverlays() {
  if (g.state === _lastUiState) return;
  _lastUiState = g.state;
  const onTitle = g.state === STATES.TITLE;
  setInstallButtonVisible(onTitle);
  setLeaderboardButtonVisible(onTitle);
  // Enlarge the music/SFX toggles during gameplay for easy tapping, and show the
  // on-screen steering pads.
  const playing = g.state === STATES.RACE || g.state === STATES.PAUSED || g.state === STATES.COUNTDOWN;
  document.getElementById("toolbar").classList.toggle("playing", playing);
  document.getElementById("steer-controls").classList.toggle("show", playing);
  showNameEntry(g.state === STATES.NAME_ENTRY);
  showGameOverActions(g.state === STATES.GAME_OVER);
  showLeaderboardPanel(g.state === STATES.LEADERBOARD);
  if (g.state === STATES.LEADERBOARD) {
    renderLeaderboard({ entries: cachedTop() }, g.playerName);   // instant from cache
    fetchTop().then((data) => {
      if (g.state === STATES.LEADERBOARD) renderLeaderboard(data, g.playerName);
    });
  }
}

function render() {
  clear(ctx, 12);
  syncOverlays();
  // Title screen also backs the name-entry and leaderboard modals.
  if (g.state === STATES.TITLE || g.state === STATES.NAME_ENTRY || g.state === STATES.LEADERBOARD) {
    drawTitleScreen(ctx, bestEverScore());
    return;
  }
  if (g.state === STATES.MAP_SELECT) { drawMapSelect(ctx, g.mapIdx); return; }
  if (g.state === STATES.DIFFICULTY) { drawDifficultySelect(ctx, g.diffIdx); return; }
  if (g.state === STATES.TUTORIAL) {
    drawRoad(ctx, g.map, g.player.z);
    drawScenery(ctx, g.scenery, g.map, g.player.z);
    drawPlayer(ctx, g.player, g.map);
    drawTutorialOverlay(ctx, g.tut);
    return;
  }
  if (g.state === STATES.COUNTDOWN) {
    drawWorld();
    const t = g.countdownTime;
    let label = "3";
    if (t < 1) label = "3";
    else if (t < 2) label = "2";
    else if (t < 3) label = "1";
    else label = "GO!";
    drawCountdown(ctx, label);
    drawSteerHints(ctx, 1);   // steer-zone ripples — every race
    return;
  }
  if (g.state === STATES.RACE || g.state === STATES.PAUSED) {
    drawWorld();
    drawCombo(ctx, g.combo, g.comboTimer, RACE.comboWindow);
    if (g.shieldMsgTimer > 0) drawShieldMsg(ctx, g.shieldMsg);
    drawHud(ctx, {
      score: g.scoreState.score,
      speed: g.player.speed,
      passed: g.traffic.passedCount,
      mapKind: g.map.key,
      time: g.raceTime,
      lives: g.player.lives,
      densityMul: g.densityMul,
    });
    // Keep the steer-zone ripples for the first moment of the race (when the
    // player can finally act), fading out over ~1.5s.
    if (g.state === STATES.RACE && g.raceTime < 1.6) {
      drawSteerHints(ctx, Math.min(1, (1.6 - g.raceTime) / 0.8));
    }
    if (g.state === STATES.PAUSED) drawPaused(ctx);
    return;
  }
  if (g.state === STATES.GAME_OVER) {
    drawGameOver(ctx, {
      name: g.playerName || "AAA",
      score: g.scoreState.score,
      hi: g.scoreState.hi,
      isNew: g.isNewHi,
      reason: g.endReason,
      passed: g.traffic ? g.traffic.passedCount : 0,
      time: g.raceTime,
      topSpeed: g.topSpeedKmh || 0,
      density: g.densityMul || 1,
      combo: g.comboBest || 0,
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
    case STATES.NAME_ENTRY: updateNameEntry(); break;
    case STATES.LEADERBOARD: updateLeaderboard(); break;
    case STATES.MAP_SELECT: updateMapSelect(); break;
    case STATES.DIFFICULTY: updateDifficulty(); break;
    case STATES.TUTORIAL: updateTutorial(dt); break;
    case STATES.COUNTDOWN: updateCountdown(dt); break;
    case STATES.RACE: updateRace(dt); break;
    case STATES.PAUSED: updatePaused(); break;
    case STATES.GAME_OVER: updateGameOver(); break;
  }
}
// Wire the HTML overlays (name entry, leaderboard, game-over actions) to game state.
initUI({
  onNameConfirm: (name) => confirmName(name),
  onNameBack: () => { g.state = STATES.TITLE; },
  onOpenLeaderboard: () => { ensureAudio(); sfxMenuSelect(); openLeaderboard(STATES.TITLE); },
  onLeaderboardBack: () => { g.state = g.lbReturnTo || STATES.TITLE; },
  onPlayAgain: () => playAgain(),
  onGameOverLeaderboard: () => openLeaderboard(STATES.GAME_OVER),
  onExit: () => { g.state = STATES.TITLE; },
});
// Retry any leaderboard submission that failed on a previous (offline) run.
flushPending();

requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
