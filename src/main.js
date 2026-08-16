// Main game loop + state machine — ENDLESS SURVIVAL mode.
//
// No more AI rivals or finish line. The player has 3 lives. Each crash with a
// civilian costs one life. Once you reach top speed, traffic density compounds
// by +5% every 60 seconds, so the game gets harder the longer you survive.
import { W, H, PHYS, SPAWN, RACE, SCORE, PLAYER_Y } from "./config.js";
import { getCtx, clear, rect } from "./render.js";
import { MAPS, MAP_LIST, DIFFICULTY_LIST } from "./maps.js";
import { initInput, getInput, consumePress, consumeAnyPress, clearPresses } from "./input.js";
import {
  initAudio, resumeAudio, suspendAudio, startMusic, stopMusic, setMusicIntensity, setMusicTempoFactor,
  playFlourish,
  startEngine, setEngine, stopEngine, setEngineRampage, setEngineStrain, getEngineStyle, setEngineStyle,
  sfxAccelAccent, sfxBrake, sfxPickup, sfxCrash, sfxExplosion, sfxBump, sfxBarrelDrop, sfxCombo,
  sfxWhoosh, sfxPerfect, sfxHeartbeat, sfxCoin, sfxHorn, sfxDash, sfxEventStart, sfxGate,
  sfxShieldUp, sfxShieldHit, sfxShockwave, sfxRampageCharge, sfxRampageReady, sfxNitrous,
  sfxMenuMove, sfxMenuSelect, sfxFinish, sfxCountdownBeep,
  startHeliSound, stopHeliSound,
  setMusicEnabled, setSfxEnabled, isMusicEnabled, isSfxEnabled, applyMix,
  getMusicTrack, setMusicTrack,
} from "./audio.js";
import { drawRoad, drawDistanceHaze, drawTimeOfDayTint, distToY, biomeAt } from "./road.js";
import { makePlayer, updatePlayer, drawPlayer, playerBox, applyCollisionLoss, startDash } from "./entities/player.js";
import { makeTrafficSystem, updateTraffic, drawTraffic, drawCoins, checkCoinGrab, checkTrafficHit, prepopulateTraffic, smashCar, drawGates, checkGateHit } from "./entities/traffic.js";
import { getDaily, applyRun as applyDailyRun } from "./daily.js";
import { makeOilSystem, updateOil, drawOilSpills, checkOilHit } from "./entities/oilspills.js";
import { makePickupSystem, updatePickups, drawPickups, checkPickup } from "./entities/pickups.js";
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
  drawRampageMeter, drawSandwichCombo, drawShareCard, SHARE_CARD_W, SHARE_CARD_H,
  drawExplosion, drawPerfect, drawLastLifePulse, drawBiomeBanner, drawZoneFlash,
  drawEventBanner, drawEventTimer,
} from "./hud.js";
import { registerServiceWorker, initInstallBanner, initInstallButton, initInstallSplash, setInstallButtonVisible } from "./pwa.js";
import {
  initUI, setLeaderboardButtonVisible, setSoundControlsVisible, setNameButtonVisible,
  setGarageButtonVisible, showGaragePanel, renderGarage,
  showNameEntry, showGameOverActions,
  showLeaderboardPanel, renderLeaderboard, showPauseMenu,
} from "./ui.js";
import {
  getPlayerName, setPlayerName, submitScore, fetchTop, flushPending, cachedTop,
} from "./leaderboard.js";
import {
  CARS, addCoins, claimUnlocks, getWallet, nextLocked,
  getSelectedId, setSelectedId, ownedIds, carSprite,
} from "./garage.js";
import { makeGhostRecorder, recordGhost, saveGhost, loadGhost, drawGhost } from "./ghost.js";
import { makeEventDirector, updateEvents, failEvent } from "./events.js";

const canvas = document.getElementById("game");
const ctx = getCtx(canvas);
initInput(canvas);
registerServiceWorker();
initInstallBanner();
initInstallButton();
initInstallSplash();
let _lastUiState = null;   // tracks state changes to sync HTML overlays once per transition

const STATES = {
  TITLE: "TITLE",
  NAME_ENTRY: "NAME_ENTRY",
  LEADERBOARD: "LEADERBOARD",
  GARAGE: "GARAGE",
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
  pickups: null,
  scoreState: makeScoreState(),
  ghostRec: null,        // this run's recording (saved if it becomes the new best)
  ghost: null,           // the personal-best track being replayed, or null
  events: null,          // in-run EVENT director (RUSH HOUR / CONVOY / WRONG WAY)
  isNewHi: false,
  wallet: 0,             // banked coin balance after this run
  unlocked: [],          // cars this run's coins just unlocked (game-over celebration)
  nextCar: null,         // the cheapest still-locked car (drives the progress bar)
  bestDelta: 0,          // points over the previous personal best (for "NEW BEST +X")
  rankInfo: null,        // { rank, total } from the leaderboard submit, or { offline:true }; null = pending
  endReason: "GAME OVER",
  // Endless mode tracking.
  raceTime: 0,
  hitTopSpeed: false,
  densityMul: 1.0,
  densityTimer: 0,
  density150: false,    // one-time +20% density once 150 km/h is crossed
  densityTopDone: false,// one-time +20% density 30s after top speed is reached
  topTime: 0,           // seconds since top speed reached (drives the 30s bump)
  topSpeedKmh: 0,
  combo: 0,             // near-miss STREAK count (drives the capped combo multiplier)
  comboTimer: 0,        // seconds left before the combo lapses
  comboFlash: 0,        // brief screen-edge flash on each combo step
  comboBest: 0,         // best combo this run (for the game-over stats)
  sandwichCombo: 0,     // banked sandwiches this combo run (combo-score multiplier)
  sandwichComboTimer: 0,// transient "SANDWICH COMBO" banner timer
  rampageMeter: 0,      // combo-tier near misses banked toward the next RAMPAGE
  rampageArmed: false,  // meter is FULL — banked, strobing, waiting for the player's tap
  rampageCooldown: 0,   // cars still to pass before the meter can build again
  rampageFlash: 0,      // brief edge flash when a rampage fires
  unleashFlash: 0,      // one-shot full-frame flash on a tap-unleashed rampage
  smashTotal: 0,        // cars smashed this run (game-over stat)
  rampagesUsed: 0,      // rampages triggered this run (game-over stat)
  coins: 0,             // coins grabbed this run (score bonus + game-over stat)
  gatesCleared: 0,      // RISK GATES threaded this run
  daily: null,          // today's challenge + progress (refreshed on title / game over)
  shieldMsg: "",        // transient "SHIELD!" / "SAVED!" popup text
  shieldMsgTimer: 0,
  explosion: 0,         // seconds left on the barrel-impact explosion FX
  hitStop: 0,           // seconds of gameplay FREEZE left (micro impact-pause on a tight shave)
  hitStopCool: 0,       // lockout so hit-stops stay an accent, not a stutter
  perfectTimer: 0,      // seconds left on the "PERFECT!" micro-pop over the car
  lastOncomingWarn: 0,  // previous frame's wrong-way distance (edge-triggers the horn)
  heartTimer: 0,        // countdown to the next heartbeat thump (last-life tension)
  goTime: 0,            // seconds on the game-over screen (guards the tap-to-retry)
  biome: null,          // current biome (city/tunnel/coast/bridge) — drives road palette + scenery
  biomeName: "",        // for detecting a biome change
  biomeBannerTimer: 0,  // transient "▶ TUNNEL ◀" landmark banner
  biomeFlash: 0,        // brief zone-change dither flash (masks the palette cut)
  countdownTime: 0,
  countdownLastBeep: -1,
  tut: null,            // first-run steering tutorial sub-state
  playerName: getPlayerName(),   // remembered name, pre-fills the entry panel
  lbReturnTo: STATES.TITLE,      // where the leaderboard BACK button returns to
  world: { score: 0, name: "" }, // current global #1 (for the title YOU/WORLD chip)
};

// Pull the global #1 from the cached leaderboard (ZREVRANGE → entry 0 is the top
// score). Cheap localStorage read; refreshed on load and whenever we hit the title.
function refreshWorldHi() {
  try {
    const top = cachedTop();
    if (top && top.length) g.world = { score: top[0].score || 0, name: top[0].name || "" };
  } catch {}
}

// ── Audio toggles ─────────────────────────────────────────────────────────────
// Toolbar buttons (top-right during gameplay) + title-screen sound controls.
const btnMusic = document.getElementById("btn-music");
const btnSfx = document.getElementById("btn-sfx");
const btnPause = document.getElementById("btn-pause");
const btnRampage = document.getElementById("btn-rampage");
const soundControls = document.getElementById("sound-controls");
const pauseSound = document.getElementById("pause-sound");
const SFX_KEY = "joshua1.sfx";
const TRACK_KEY = "joshua1.musicTrack";     // "0" | "1" | "2"
const ENGINE_KEY = "joshua1.engineStyle";   // "0" | "1" | "2"

function loadToggle(key) { try { const v = localStorage.getItem(key); return v === null ? true : v === "1"; } catch { return true; } }
function saveToggle(key, on) { try { localStorage.setItem(key, on ? "1" : "0"); } catch {} }
// Default music = Track 1 ("The Final Bend"): a brand-new player (no saved
// choice) starts with SFX on AND music on. A player who explicitly picked a
// track before — including OFF — keeps their saved choice.
function loadTrack() { try { const v = localStorage.getItem(TRACK_KEY); return v === null ? 1 : parseInt(v) || 0; } catch { return 1; } }
function saveTrack(n) { try { localStorage.setItem(TRACK_KEY, String(n)); } catch {} }
function loadEngine() { try { const v = localStorage.getItem(ENGINE_KEY); return v === null ? 0 : parseInt(v) || 0; } catch { return 0; } }
function saveEngine(n) { try { localStorage.setItem(ENGINE_KEY, String(n)); } catch {} }

function refreshAudioButtons() {
  const track = getMusicTrack();
  btnMusic.textContent = "♪";
  btnMusic.classList.toggle("off", track === 0 || !isMusicEnabled());
  btnSfx.textContent = isSfxEnabled() ? "🔊" : "🔇";
  btnSfx.classList.toggle("off", !isSfxEnabled());
}
function refreshSoundControls() {
  const track = getMusicTrack();
  const sfx = isSfxEnabled();
  for (const cont of [soundControls, pauseSound]) {
    if (!cont) continue;
    cont.querySelectorAll("[data-sfx]").forEach(btn => {
      btn.classList.toggle("active", (btn.dataset.sfx === "1") === sfx);
    });
    cont.querySelectorAll("[data-music]").forEach(btn => {
      btn.classList.toggle("active", parseInt(btn.dataset.music) === track);
    });
    cont.querySelectorAll("[data-engine]").forEach(btn => {
      btn.classList.toggle("active", parseInt(btn.dataset.engine) === getEngineStyle());
    });
  }
}

// Toolbar: turn music on/off mid-game — works regardless of how the run started.
// If music was OFF (no track), turning it on selects the default track and starts
// playback live; turning it off stops it. (The engine auto-boosts while music is off.)
function toggleMusic() {
  ensureAudio();
  const turningOn = getMusicTrack() === 0 || !isMusicEnabled();
  if (turningOn) {
    if (getMusicTrack() === 0) { setMusicTrack(1); saveTrack(1); }
    setMusicEnabled(true); applyMix();
    if (g.state === STATES.RACE) startMusic(g.map.music);
  } else {
    setMusicEnabled(false); applyMix();
    stopMusic();
  }
  refreshAudioButtons(); refreshSoundControls();
}
function toggleSfx() {
  ensureAudio();
  const on = !isSfxEnabled();
  setSfxEnabled(on); saveToggle(SFX_KEY, on);
  refreshAudioButtons(); refreshSoundControls();
}

// Restore persisted preferences.
const _initTrack = loadTrack();
setMusicTrack(_initTrack);
setMusicEnabled(_initTrack > 0);
setSfxEnabled(loadToggle(SFX_KEY));
setEngineStyle(loadEngine());
refreshAudioButtons();
refreshSoundControls();
btnMusic.addEventListener("click", toggleMusic);
btnSfx.addEventListener("click", toggleSfx);
btnPause.addEventListener("click", () => pauseGame());
// The hovering red RAMPAGE slam-button — fires on pointerdown (zero tap latency),
// only meaningful while armed. Visibility is synced per-frame (syncRampageButton).
btnRampage.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (g.state === STATES.RACE && g.rampageArmed && g.player.rampage <= 0) {
    ensureAudio();
    unleashRampage();
  }
});

// Show the rampage button exactly while it can be pressed. Called every frame
// from render() — cheap (touches the DOM only when the armed state flips).
let _rampageBtnShown = false;
function syncRampageButton() {
  const show = g.state === STATES.RACE && g.rampageArmed && g.player.rampage <= 0;
  if (show !== _rampageBtnShown) {
    _rampageBtnShown = show;
    btnRampage.classList.toggle("show", show);
  }
}

// Shared handler for a .snd-opt tap — used by BOTH the title-screen controls and
// the pause-menu controls, so the player can change SFX / music mid-game,
// irrespective of how the run started.
function applySoundChoice(btn) {
  ensureAudio();
  if (btn.dataset.sfx !== undefined) {
    const on = btn.dataset.sfx === "1";
    setSfxEnabled(on); saveToggle(SFX_KEY, on);
  }
  if (btn.dataset.music !== undefined) {
    const track = parseInt(btn.dataset.music);
    setMusicTrack(track); saveTrack(track);
    stopMusic();
    if (track > 0) {
      setMusicEnabled(true); applyMix();
      // Live race → the map's track; title → a preview. (Paused: context is
      // suspended, so resume restarts the chosen track.)
      if (g.state === STATES.RACE) startMusic(g.map.music);
      else if (g.state !== STATES.PAUSED) startMusic("city");
    } else {
      setMusicEnabled(false); applyMix();
    }
  }
  if (btn.dataset.engine !== undefined) {
    const style = parseInt(btn.dataset.engine);
    setEngineStyle(style); saveEngine(style);   // rebuilds the engine live if it's running
  }
  refreshAudioButtons();
  refreshSoundControls();
}
const onSndClick = (e) => { const btn = e.target.closest(".snd-opt"); if (btn) applySoundChoice(btn); };
soundControls.addEventListener("click", onSndClick);
if (pauseSound) pauseSound.addEventListener("click", onSndClick);

function ensureAudio() { initAudio(); resumeAudio(); applyMix(); }
function stopAllLoopingSfx() { stopEngine(); stopHeliSound(); g._heliSoundOn = false; setEngineRampage(false); }

// Pause/resume helpers — pausing silences music + engine (and suspends the audio
// context) so sound stops IMMEDIATELY, even mid-note. Resuming restarts both.
function pauseGame() {
  if (g.state !== STATES.RACE) return;
  g.prevState = g.state;
  g.state = STATES.PAUSED;
  clearPresses();          // don't let race input leak in and instantly resume
  stopMusic();
  stopAllLoopingSfx();
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
  else { stopMusic(); stopAllLoopingSfx(); }
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
  g.pickups = makePickupSystem();
  g.cops = makeCopsSystem();
  // Ghost: record this run, and replay the personal best recorded for this map.
  g.ghostRec = makeGhostRecorder();
  g.ghost = loadGhost(g.map.key, g.difficulty);
  g.events = makeEventDirector();
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
  g.density150 = false;
  g.densityTopDone = false;
  g.topTime = 0;
  g.topSpeedKmh = 0;   // track highest speed reached (in km/h display units)
  g.combo = 0;
  g.comboTimer = 0;
  g.comboFlash = 0;
  g.comboBest = 0;
  g.sandwichCombo = 0;
  g.sandwichComboTimer = 0;
  g.rampageMeter = 0;
  g.rampageArmed = false;
  g.rampageCooldown = 0;
  g.rampageFlash = 0;
  g.unleashFlash = 0;
  g.smashTotal = 0;
  g.rampagesUsed = 0;
  g.coins = 0;
  g.gatesCleared = 0;
  g.biome = biomeAt(0);            // start in CITY; no banner for the opening zone
  g.biomeName = g.biome.name;
  g.biomeBannerTimer = 0;
  g.biomeFlash = 0;
  g.shieldMsg = "";
  g.shieldMsgTimer = 0;
  g.explosion = 0;
  g.hitStop = 0;
  g.hitStopCool = 0;
  g.perfectTimer = 0;
  g.heartTimer = 0;
  g.lastOncomingWarn = 0;
}

// Duration (seconds) of the barrel-impact explosion FX.
const EXPLOSION_DUR = 0.55;

// ── Scoring helper ────────────────────────────────────────────────────────────
// Capped combo multiplier from the current streak: ×1 (streak 0–2) up to
// ×comboMultMax (×8). The streak (g.combo) can climb forever, but the SCORING
// multiplier can't — that ceiling is what keeps the score from exploding.
function comboMult() {
  return Math.min(SCORE.comboMultMax, 1 + Math.floor(g.combo / SCORE.comboPerStep));
}

// Take a hit: lose a life (a real crash also breaks the combo streak).
// Returns true if the run just ended. (During a rampage the player is invincible
// and this is never called — see the collision handler.)
function takeHit(_invulnSec) {
  sfxCrash();
  g.player.lives -= 1;
  g.combo = 0; g.comboTimer = 0;        // a real crash breaks the streak
  g.sandwichCombo = 0; g.sandwichComboTimer = 0;  // ...and the sandwich multiplier
  g.rampageMeter = 0;                   // ...and dumps the banked rampage meter
  g.rampageArmed = false;               // ...including an ARMED one (crash = lost)
  // RECOVERY BEAT: force the next couple of spawned rows open so the player gets
  // a moment to regather instead of being fed straight back into the phrase that
  // just killed them (which is how one crash chains into losing every life).
  if (g.traffic) {
    g.traffic.phrase = { type: "breather", left: RACE.crashBreatherRows, dir: 1 };
  }
  failEvent(g.events);                  // crashing forfeits the current event's payout
  if (g.player.lives <= 0) { endRace("GAME OVER"); return true; }
  return false;
}

// The player taps to UNLEASH an armed rampage — the peak moment, made theirs.
// Full spectacle within the dizzy rule: an 80ms hit-stop beat, a one-shot
// full-frame dither flash + the thick edge frame, and the nitrous engine snarl.
function unleashRampage() {
  g.rampageArmed = false;
  g.rampageMeter = 0;
  g.player.rampage = RACE.rampageDuration;
  g.player.boost = RACE.rampageDuration;
  g.rampagesUsed += 1;
  g.rampageFlash = 0.18;
  g.unleashFlash = 0.25;
  g.hitStop = Math.max(g.hitStop, 0.08);
  g.shieldMsg = "RAMPAGE!"; g.shieldMsgTimer = 1.6;
  sfxNitrous();
  sfxShieldUp();
  setEngineRampage(true);
}

// A traffic car smashed during a rampage — knocked off the road, advances the
// combo streak, and scores its base × the CAPPED combo multiplier (so a long
// rampage rewards well without running away).
function registerSmash() {
  g.combo += 1;
  g.comboBest = Math.max(g.comboBest, g.combo);
  g.comboTimer = RACE.comboWindow;
  g.comboFlash = 0.18;
  const gain = SCORE.smashBonus * comboMult();
  g.scoreState.score += gain;
  g.smashTotal += 1;
  // No per-smash popup — the COMBO banner already climbs fast during a rampage.
  sfxCombo(g.combo);
}

function beginCountdown() {
  stopMusic();                 // stop any title-screen preview music
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
  stopAllLoopingSfx();
  g.endReason = reason;
  // Capture the previous personal best BEFORE finalize overwrites it, so the
  // game-over screen can show how much this run beat it by ("NEW BEST +X").
  const prevHi = Math.floor(g.scoreState.hi || 0);
  g.isNewHi = finalizeScore(g.scoreState);
  // A new personal best becomes the ghost everyone races from here on.
  if (g.isNewHi) saveGhost(g.ghostRec, g.map.key, g.difficulty);
  g.bestDelta = (g.isNewHi && prevHi > 0) ? Math.max(0, Math.floor(g.scoreState.score) - prevHi) : 0;
  g.rankInfo = null;   // "RANKING…" until the submit returns the standing
  g.goTime = 0;        // guards the tap-to-retry so the fatal touch can't insta-restart
  // Drop any input queued during the race. "Touch" is never consumed while
  // racing, so the tap the player was holding when they crashed would otherwise
  // still be queued and would auto-retry the moment the goTime guard expires —
  // the "game over screen skipped itself" bug.
  clearPresses();
  // ── Bank this run's coins ── Score dies with you; coins DON'T. Even a short
  // run pays into the wallet, so every attempt advances the next unlock. Any
  // car the new balance covers is claimed right here for a game-over payoff.
  // ── DAILY CHALLENGE ── Folded in BEFORE the coins are banked, so a completion's
  // reward rides the same deposit and can itself be what unlocks a car this run.
  const dailyRes = applyDailyRun({
    distance: Math.floor(g.player.z || 0),
    coins: g.coins || 0,
    passed: g.traffic ? g.traffic.passedCount : 0,
    gates: g.gatesCleared || 0,
    smashed: g.smashTotal || 0,
    combo: g.comboBest || 0,
    score: Math.floor(g.scoreState.score || 0),
    time: Math.floor(g.raceTime || 0),
  });
  g.daily = Object.assign(getDaily(), { completedThisRun: dailyRes.completed });
  g.wallet = addCoins((g.coins || 0) + (dailyRes.reward || 0));
  g.unlocked = claimUnlocks();          // [] unless this run crossed a price
  g.nextCar = nextLocked();             // null once everything is owned
  // Equip a freshly unlocked livery straight away — the reward should be visible
  // on the very next run (the garage picker will let you switch back).
  if (g.unlocked.length) setSelectedId(g.unlocked[g.unlocked.length - 1].id);
  if (g.isNewHi) playFlourish();
  if (g.unlocked.length) playFlourish();
  if (dailyRes.completed) playFlourish();
  // Submit to the global board; the response carries this run's rank + total so
  // the game-over screen can show a percentile ("TOP 14%  RANK 14/98").
  submitScore({
    name: g.playerName || "AAA",
    score: Math.floor(g.scoreState.score),
    time: Math.floor(g.raceTime),
    passed: g.traffic ? g.traffic.passedCount : 0,
    topSpeed: g.topSpeedKmh || 0,
  }).then((res) => {
    if (g.state !== STATES.GAME_OVER) return;
    if (res && res.rank && res.total) g.rankInfo = { rank: res.rank, total: res.total };
    else g.rankInfo = { offline: true };
  }).catch(() => { g.rankInfo = { offline: true }; });
  g.state = STATES.GAME_OVER;
}

// ─── Updates ──────────────────────────────────────────────────────────────────
function updateTitle() {
  // While the first-load install splash is up it overlays the canvas (so taps
  // are already blocked) — swallow any stray keypress too, so the game can't
  // start behind it on desktop.
  const splash = document.getElementById("install-splash");
  if (splash && splash.classList.contains("show")) { consumeAnyPress(); return; }
  if (consumeAnyPress()) {
    ensureAudio();
    sfxMenuSelect();
    // Tapping the title goes STRAIGHT into the game — no name prompt. The handle
    // defaults to PLAYER1 and is only changed via the CHANGE NAME button.
    beginPlay();
  }
}

// Start a run with the remembered name. First-timers get the interactive
// steering tutorial first; everyone else drops into the countdown.
function beginPlay() {
  if (hasSeenTutorial()) beginCountdown();
  else enterTutorial();
}

// Open the change-name dialog from the title (its own button — never on Play).
function openNameEntry() {
  ensureAudio();
  sfxMenuSelect();
  g.state = STATES.NAME_ENTRY;
}

// Name confirmed in the CHANGE NAME dialog — store it (used for all future high
// scores + the title chip) and return to the title. Does NOT start a race.
function confirmName(name) {
  g.playerName = setPlayerName(name);
  ensureAudio();
  sfxMenuSelect();
  g.state = STATES.TITLE;
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

// ── Garage ── The car collection. Coins auto-unlock liveries cheapest-first as
// the wallet grows, so this panel is about CHOOSING among what you own (and
// seeing how close the next one is).
function openGarage() {
  ensureAudio();
  sfxMenuSelect();
  g.state = STATES.GARAGE;
}
function refreshGarage() {
  renderGarage({
    cars: CARS,
    wallet: getWallet(),
    owned: ownedIds(),
    selected: getSelectedId(),
    spriteFor: carSprite,
  });
}
function updateGarage() {
  if (consumePress("Escape", "Enter", " ")) g.state = STATES.TITLE;
  consumeAnyPress();
}

function updateLeaderboard() {
  if (consumePress("Escape", "Enter", " ")) g.state = g.lbReturnTo || STATES.TITLE;
  consumeAnyPress();
}

function playAgain() {
  ensureAudio();
  sfxMenuSelect();
  beginCountdown();      // reuse the remembered name + current map/difficulty
  // INSTANT RETRY: skip most of the 3-2-1 so a fresh run starts in ~0.8s (a brief
  // "1" → "GO!"). Keeps the "one more go" loop tight. Title-start + pause-restart
  // keep the full countdown; only the game-over retry is fast-forwarded.
  g.countdownTime = Math.max(0, RACE.countdownSeconds - 0.2);
  g.countdownLastBeep = Math.floor(g.countdownTime);   // suppress the earlier beeps
}

// Render the run's stats to a crisp PNG and hand it to the OS share sheet (with a
// download fallback on desktop / browsers without file sharing). Built off an
// offscreen 160-wide card, scaled ×4 with nearest-neighbour so it stays pixel-sharp.
async function shareScoreCard() {
  ensureAudio();
  sfxMenuSelect();
  const data = {
    name: g.playerName || "AAA",
    score: Math.floor(g.scoreState.score),
    isNew: g.isNewHi,
    time: g.raceTime,
    topSpeed: g.topSpeedKmh || 0,
    passed: g.traffic ? g.traffic.passedCount : 0,
    combo: g.comboBest || 0,
    smashed: g.smashTotal || 0,
    rampages: g.rampagesUsed || 0,
    coins: g.coins || 0,
    world: g.world,
  };
  const base = document.createElement("canvas");
  base.width = SHARE_CARD_W; base.height = SHARE_CARD_H;
  const bctx = base.getContext("2d", { alpha: false });
  bctx.imageSmoothingEnabled = false;
  drawShareCard(bctx, data);
  const S = 4;
  const out = document.createElement("canvas");
  out.width = SHARE_CARD_W * S; out.height = SHARE_CARD_H * S;
  const octx = out.getContext("2d", { alpha: false });
  octx.imageSmoothingEnabled = false;
  octx.drawImage(base, 0, 0, out.width, out.height);
  const blob = await new Promise((res) => out.toBlob(res, "image/png"));
  if (!blob) return;
  const file = new File([blob], "joshua1-score.png", { type: "image/png" });
  const text = `I scored ${data.score} in JOSHUA 1 RACING! Beat that: https://joshua1-racer.vercel.app`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "JOSHUA 1 RACING", text });
      return;
    }
  } catch (err) { if (err && err.name === "AbortError") return; }
  // Fallback: download the PNG (desktop / no Web Share file support).
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "joshua1-score.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {}
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
  if (consumePress("Escape")) { stopAllLoopingSfx(); g.state = STATES.TITLE; return; }
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
  if (consumePress("Escape")) { stopMusic(); stopAllLoopingSfx(); g.state = STATES.TITLE; return; }
  // UNLEASH an armed rampage. The control is the big red 🔥 button at the bottom
  // centre (pointerdown, wired near the toolbar buttons); Enter is the desktop
  // fallback. There's no tap-zone fallback any more — the whole canvas steers.
  if (g.rampageArmed && g.player.rampage <= 0 && consumePress("Enter")) {
    unleashRampage();
  }

  // DASH — double-tapping a side queues DashL/DashR. Consume both every frame so
  // a stale one can't fire later, but only act on the first.
  const dashL = consumePress("DashL"), dashR = consumePress("DashR");
  if (dashL || dashR) {
    if (startDash(g.player, dashL ? -1 : 1)) sfxDash();
  }

  g.raceTime += dt;
  recordGhost(g.ghostRec, g.raceTime, g.player);   // track this run for the ghost

  updatePlayer(g.player, dt, input, g.map, { onAccelAccent: sfxAccelAccent, onFenceBump: sfxBump });

  const speed01 = g.player.speed / PHYS.maxSpeed;
  setEngine(speed01);
  setMusicTempoFactor(speed01);

  // Track highest speed reached (in display km/h).
  const currentKmh = Math.round(speed01 * (PHYS.topSpeedKmh || 200));
  if (currentKmh > g.topSpeedKmh) g.topSpeedKmh = currentKmh;

  // ── Density scaling ──
  // Staged escalation: a +20% bump once 150 km/h is crossed, a further +20% 30 s
  // after the player organically reaches top speed, then a gentle continued ramp
  // for the long endless game. Every row still leaves a gap lane open, so the
  // road stays maneuverable/enjoyable at any density.
  if (!g.density150 && currentKmh >= 150) {
    g.densityMul = Math.min(RACE.densityMax, g.densityMul * RACE.density150Bump);
    g.density150 = true;
  }
  if (!g.hitTopSpeed && g.player.speed >= PHYS.maxSpeed * RACE.topSpeedThreshold) {
    g.hitTopSpeed = true;
    g.densityTimer = 0;
    g.topTime = 0;
  }
  if (g.hitTopSpeed) {
    g.topTime += dt;
    if (!g.densityTopDone && g.topTime >= RACE.densityTopBumpDelay) {
      g.densityMul = Math.min(RACE.densityMax, g.densityMul * RACE.densityTopBump);
      g.densityTopDone = true;
    }
    g.densityTimer += dt;
    while (g.densityTimer >= RACE.densityStepSeconds) {
      g.densityTimer -= RACE.densityStepSeconds;
      g.densityMul = Math.min(RACE.densityMax, g.densityMul * (1 + RACE.densityStepIncrement));
    }
  }
  // V2 tension/release: breathe the spacing ±densityWaveAmp around the ramped
  // base on a slow cycle (surge → breather → surge) so difficulty isn't monotonic.
  // (Doesn't touch the gap-lane logic, so every row stays threadable.)
  const wave = 1 + RACE.densityWaveAmp * Math.sin(g.raceTime * (2 * Math.PI / RACE.densityWavePeriod));

  // ── IN-RUN EVENTS ── Fire / expire the current set-piece, then let it
  // re-weight the systems below (density, traffic pool, oncoming rate).
  const sig = updateEvents(g.events, dt, g.raceTime, g.topSpeedKmh);
  if (sig && sig.started) {
    sfxEventStart();
  } else if (sig && sig.ended) {
    const ev = sig.ended;
    if (sig.failed) {
      // Crashed during it — the payout is for getting through CLEAN.
      g.events.clearMsg = "EVENT FAILED";
      g.events.clearIdx = 7;
    } else {
      g.scoreState.score += ev.score;
      g.coins += ev.coins;
      g.events.clearMsg = "CLEARED +" + ev.score;
      g.events.clearIdx = 5;
      sfxFinish();
    }
    g.events.clearT = 1.8;
  }
  const ev = g.events.active;
  g.traffic.event = ev;                          // traffic reads pool / phrase / oncoming rate
  const evDensity = (ev && ev.density) || 1;     // RUSH HOUR packs the road
  const effDensity = g.densityMul * evDensity;
  g.traffic.rowGapZ = (baseRowGapForMap(g.map) / effDensity) * wave;
  g.traffic.densityMul = effDensity;
  // RISK GATES join the phrase director once the run has some pace — the opening
  // stays a clean weave, and the greed line arrives before wrong-way traffic does.
  g.traffic.allowGates = g.topSpeedKmh >= RACE.gateFromKmh;

  // After a rampage, keep the near road ahead clear for a few seconds.
  const clearDist = g.player.rampageClear > 0 ? RACE.rampageClearDist : 0;
  updateTraffic(g.traffic, dt, g.player.z, g.map, {
    playerX: g.player.x,
    onPassed: (sandwich) => {
      // Passes are the steady filler — a small FLAT bonus, no multiplier.
      g.scoreState.score += SCORE.passBonus;
      // Splitting a tight 2-car gap is a SANDWICH: a flat bonus that ALSO advances
      // the combo streak (feeding the capped multiplier) and keeps the chain alive.
      if (sandwich) {
        g.sandwichCombo += 1;
        g.sandwichComboTimer = 1.6;     // transient banner — shows then blinks off
        g.scoreState.score += SCORE.sandwichBonus;
        g.combo += 1;
        g.comboBest = Math.max(g.comboBest, g.combo);
        g.comboTimer = RACE.comboWindow;
        sfxPickup();
      }
      // Each pass burns down the post-rampage cooldown; once it's spent, the
      // rampage meter is armed and near misses bank toward the next one.
      if (g.rampageCooldown > 0) g.rampageCooldown -= 1;
    },

    // A RISK GATE threaded — the run's one voluntary risk, paid in the two
    // currencies that can't corrupt the leaderboard: coins and combo.
    onGate: () => {
      g.gatesCleared += 1;
      g.coins += RACE.gateCoins;
      g.scoreState.score += Math.round(SCORE.gateBonus * comboMult());
      // Scored like a sandwich: a flat bonus that also advances the streak, so a
      // gate feeds the multiplier and the rampage chain instead of interrupting them.
      g.combo += 1;
      g.comboBest = Math.max(g.comboBest, g.combo);
      g.comboTimer = RACE.comboWindow;
      g.comboFlash = 0.18;
      g.shieldMsg = "GATE +" + RACE.gateCoins; g.shieldMsgTimer = 1.3;
      sfxGate();
    },

    onNearMiss: (tightness) => {
      // Two tiers. Below comboKmh (100): every close shave still pays a flat
      // bonus with a discreet "NEAR MISS" flash — but no multiplier. At
      // comboKmh+ we enter NEAR MISS COMBO territory: shaves chain into a
      // multiplier AND (when armed) fill the rampage meter.
      // Precision (tightness) bonus — a closer shave is worth a bit more.
      const kmh = g.player.speed / PHYS.maxSpeed * (PHYS.topSpeedKmh || 200);
      const t = tightness != null ? tightness : 0;
      const precision = 1 + SCORE.precisionMax * t;     // 1 → 1.5 (pixel-perfect)
      // ── Game-feel juice (freeze + audio only, per the no-shake/no-zoom rule) ──
      // A TIGHT shave gets a 60ms hit-stop (a micro freeze actually REDUCES
      // motion) + an air-rush whoosh that brightens with tightness; a
      // pixel-close one also pops "PERFECT!" over the car with a crystal ting.
      if (t >= 0.45) {
        sfxWhoosh(t);
        // The freeze is THROTTLED (the whoosh isn't): back-to-back tight shaves
        // would otherwise stutter the whole run instead of punctuating it.
        if (g.hitStopCool <= 0) {
          g.hitStop = Math.max(g.hitStop, 0.06);
          g.hitStopCool = RACE.hitStopCooldown;
        }
      }
      if (t >= 0.6) {
        g.perfectTimer = 0.5;
        sfxPerfect();
      }
      if (kmh >= RACE.comboKmh) {
        g.combo += 1;
        g.comboBest = Math.max(g.comboBest, g.combo);
        g.comboTimer = RACE.comboWindow;
        g.comboFlash = 0.18;
        const gain = Math.round(SCORE.nearMissBonus * comboMult() * precision);
        g.scoreState.score += gain;
        sfxCombo(g.combo);
        // Risk → reward: an unbroken chain of `rampageNearMisses` shaves fills
        // the meter and ARMS the nitrous — the player then unleashes it with a
        // tap on the top of the screen, when THEY choose (agency + anticipation
        // instead of an auto-fire). The meter only builds while unarmed — never
        // during a rampage, never during the post-rampage pass cooldown.
        if (g.player.rampage <= 0 && g.rampageCooldown <= 0 && !g.rampageArmed) {
          g.rampageMeter += 1;
          // J3: the last few near-misses audibly "charge" the nitrous.
          const fromFull = RACE.rampageNearMisses - g.rampageMeter;
          if (fromFull >= 0 && fromFull <= 2) sfxRampageCharge(2 - fromFull);
          if (g.rampageMeter >= RACE.rampageNearMisses) {
            g.rampageArmed = true;         // banked — survives a combo lapse, lost on a crash
            g.shieldMsg = "RAMPAGE READY!"; g.shieldMsgTimer = 1.4;
            sfxRampageReady();
          }
        }
      } else {
        const gain = Math.round(SCORE.nearMissLowBonus * precision);
        g.scoreState.score += gain;
        sfxPickup();
      }
    },
  }, clearDist, g.topSpeedKmh >= RACE.oncomingFromKmh);

  // Wrong-way horn — one blast per car, fired as it bears down (no HUD warning:
  // the whole point is that it ambushes you). Edge-triggered off the distance.
  const nearOncoming = g.traffic.oncomingNear || 0;
  if (nearOncoming > 0 && g.lastOncomingWarn <= 0) sfxHorn();
  g.lastOncomingWarn = nearOncoming;

  // ── Rampage + post-rampage shockwave ──
  if (g.player.rampage > 0) {
    g.player.rampage = Math.max(0, g.player.rampage - dt);
    if (g.player.rampage === 0) {
      // Rampage just ended: an instantaneous shockwave from the player's car
      // kicks out only the NEXT TWO cars ahead — just enough room to maneuver
      // out of the boost without an unfair instant collision. The rest of the
      // traffic stays put (no long clear-off, no empty road).
      setEngineRampage(false);
      sfxShockwave();
      const ahead = g.traffic.list
        .filter(c => !c.smashed && c.z > g.player.z && c.z < g.player.z + RACE.rampageClearDist)
        .sort((a, b) => a.z - b.z)
        .slice(0, 2);
      for (const c of ahead) smashCar(c, g.player.x);
      g.shieldMsg = "CLEAR!"; g.shieldMsgTimer = 0.9;
      // Lock the rampage meter until the cooldown's worth of cars are passed.
      g.rampageCooldown = RACE.rampageCooldownPasses;
    }
  }
  if (g.player.rampageClear > 0) g.player.rampageClear = Math.max(0, g.player.rampageClear - dt);

  // Combo decay — lapse the streak if you go too long without a near-miss.
  // A lapsed chain also dumps the banked rampage meter (it rewards UNBROKEN runs).
  // CONVOY holds your streak open (its reward for a pure-slalom stretch), so the
  // timer only drains outside a combo-safe event.
  const comboSafe = !!(g.events.active && g.events.active.comboSafe);
  if (g.comboTimer > 0 && !comboSafe) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) { g.combo = 0; g.rampageMeter = 0; g.sandwichCombo = 0; }
  }
  if (g.comboFlash > 0) g.comboFlash = Math.max(0, g.comboFlash - dt);
  if (g.shieldMsgTimer > 0) g.shieldMsgTimer = Math.max(0, g.shieldMsgTimer - dt);
  if (g.rampageFlash > 0) g.rampageFlash = Math.max(0, g.rampageFlash - dt);
  if (g.unleashFlash > 0) g.unleashFlash = Math.max(0, g.unleashFlash - dt);
  if (g.sandwichComboTimer > 0) g.sandwichComboTimer = Math.max(0, g.sandwichComboTimer - dt);
  if (g.explosion > 0) g.explosion = Math.max(0, g.explosion - dt);
  if (g.perfectTimer > 0) g.perfectTimer = Math.max(0, g.perfectTimer - dt);
  if (g.hitStopCool > 0) g.hitStopCool = Math.max(0, g.hitStopCool - dt);

  // ── LAST-LIFE TENSION ── On the final life the engine strains (a detune wobble)
  // and a heartbeat thumps ~once a second, so the near-death moment feels urgent.
  // setEngineStrain is idempotent, so asserting it every frame is cheap and also
  // re-applies after a pause/resume rebuilds the engine.
  const lastLife = g.player.lives === 1;
  setEngineStrain(lastLife);
  if (lastLife) {
    g.heartTimer -= dt;
    if (g.heartTimer <= 0) { sfxHeartbeat(); g.heartTimer = 1.05; }
  } else {
    g.heartTimer = 0;
  }
  // Police helicopter kicks in once the player crosses 150 km/h — it drops
  // flaming barrels on the road ahead (collision handled below, costs a life).
  updateCops(g.cops, dt, g.player.z, g.player.x, g.player.speed, g.map, { onDrop: sfxBarrelDrop });
  // Helicopter rotor sound — on when choppers are on-screen, off otherwise.
  const helisOnScreen = g.cops.active && g.cops.helis.length > 0;
  if (helisOnScreen && !g._heliSoundOn) { startHeliSound(); g._heliSoundOn = true; }
  else if (!helisOnScreen && g._heliSoundOn) { stopHeliSound(); g._heliSoundOn = false; }
  // ── Biome cycling ── City → tunnel → coast → bridge every RACE.biomePeriodSec.
  // On a change: announce the new zone (landmark banner) + a brief flash that
  // masks the palette cut. The scenery set follows the biome (new spawns only).
  const biome = biomeAt(g.raceTime);
  if (biome.name !== g.biomeName) {
    g.biome = biome;
    g.biomeName = biome.name;
    g.biomeBannerTimer = 2.0;
    g.biomeFlash = 0.22;
    sfxMenuMove();                 // a soft "new zone" chirp
  }
  if (g.biomeBannerTimer > 0) g.biomeBannerTimer = Math.max(0, g.biomeBannerTimer - dt);
  if (g.biomeFlash > 0) g.biomeFlash = Math.max(0, g.biomeFlash - dt);
  // Pass speed so the roadside thins out at pace (eases the high-speed dizziness).
  updateScenery(g.scenery, g.player.z, g.map, dt, SPAWN.sceneryPerMeter, speed01, g.biome);

  // Player exhaust smoke (no more AI smoke — AI gone).
  updateSmoke(g.player, dt);

  // Endless non-lethal oil slicks — spawn ahead, cull behind.
  updateOil(g.oils, g.player.z, g.map);
  // Occasional rampage booster pickups.
  // Boosters only start appearing once the player has genuinely hit 150 km/h.
  updatePickups(g.pickups, g.player.z, g.map, dt, g.topSpeedKmh >= 150);

  // Decay player's oil-slip timer.
  if (g.player.oilTimer > 0) g.player.oilTimer = Math.max(0, g.player.oilTimer - dt);

  // ── Collisions ──
  if (g.player.rampage > 0) {
    // RAMPAGE: plow through traffic. Each car hit is smashed off the road and
    // adds to the combo; barrels and life loss are ignored (invincible boost).
    const box = playerBox(g.player);
    let t, guard = 0;
    while ((t = checkTrafficHit(g.traffic, box)) && guard++ < 8) {
      smashCar(t, g.player.x);
      registerSmash();
    }
    // A gate post shatters under a rampage rather than standing untouched as the
    // car ploughs through it. It stops paying out — smashing a gate isn't
    // threading one — but driving the slot cleanly still counts.
    const gt = checkGateHit(g.traffic, box);
    if (gt) { gt.hit = true; sfxBump(); }
  } else if (g.player.invuln <= 0) {
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
        g.explosion = EXPLOSION_DUR;   // fireball at the car
        sfxExplosion();                // (before takeHit so it sounds even on a fatal hit)
        applyCollisionLoss(g.player, 0.5, 1.2);
        if (takeHit(1.2)) return;
      }
    }
    // RISK GATE post — the bill for a greed line taken at the wrong angle. Checked
    // last and gated on invuln so a single frame can't charge two lives.
    if (g.player.invuln <= 0) {
      const gt = checkGateHit(g.traffic, box);
      if (gt) {
        gt.hit = true;                  // the gate wrecks (and can never pay out)
        applyCollisionLoss(g.player, 0.55, 1.5);
        if (takeHit(1.5)) return;
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
  // Rampage BOOSTER pickup — grabbing one instantly fires a RAMPAGE (bypasses the
  // near-miss meter + cooldown). Collectible even mid-rampage (just refreshes it).
  const boost = checkPickup(g.pickups, playerBox(g.player));
  if (boost) {
    const wasActive = g.player.rampage > 0;
    g.player.rampage = RACE.rampageDuration;   // (re)fill — RESETS the timer even mid-rampage
    g.player.boost = RACE.rampageDuration;
    g.rampageMeter = 0;
    g.rampageArmed = false;                    // the canister IS the rampage — no double-dip
    g.rampageCooldown = 0;
    g.rampageFlash = 0.12;                      // feedback on every grab (incl. a refresh)
    g.shieldMsg = "RAMPAGE!"; g.shieldMsgTimer = 1.6;
    sfxNitrous();
    setEngineRampage(true);                     // no-op if already rampaging
    if (!wasActive) g.rampagesUsed += 1;        // only a fresh rampage counts toward the stat
  }

  // Coins on the ideal line — grabbed anytime (even mid-rampage), each pays a
  // small bonus live and bumps the run's coin count (a game-over stat + a future
  // garage currency). Following the weave sweeps them up.
  const gotCoins = checkCoinGrab(g.traffic, playerBox(g.player));
  if (gotCoins) {
    g.coins += gotCoins;
    g.scoreState.score += gotCoins * SCORE.coinValue;
    sfxCoin();
  }

  tickScore(g.scoreState, g.player.z, 1);
  // Per-second time bonus accumulated continuously.
  g.scoreState.score += SCORE.survivalSecondBonus * dt;
}

function updatePaused() {
  // Keyboard shortcuts; the on-screen pause menu (RESUME/RESTART/QUIT) handles taps.
  if (consumePress("p", "P", "Enter", " ")) { ensureAudio(); resumeGame(); }
  if (consumePress("Escape")) { stopMusic(); stopAllLoopingSfx(); g.state = STATES.TITLE; }
}

function updateGameOver(dt) {
  g.goTime += dt;
  // Keyboard shortcuts + the HTML action bar both route through playAgain (quick).
  if (consumePress("Enter", " ")) { playAgain(); return; }
  if (consumePress("l", "L")) { openLeaderboard(STATES.GAME_OVER); return; }
  if (consumePress("Escape")) { g.state = STATES.TITLE; return; }
  // One-tap INSTANT RETRY — a tap anywhere on the canvas restarts, after a short
  // guard so the fatal moment's own touch can't immediately retry.
  if (consumePress("Touch") && g.goTime > 0.9) { playAgain(); return; }
}

// ─── Render ──────────────────────────────────────────────────────────────────
function drawWorld() {
  const biome = g.biome || biomeAt(g.raceTime);
  drawRoad(ctx, g.map, g.player.z, g.player.speed, biome, g.player.rampage > 0);
  drawScenery(ctx, g.scenery, g.map, g.player.z);
  drawOilSpills(ctx, g.oils, g.map, g.player.z, g.player.x);
  drawSmoke(ctx, g.map, g.player.z, g.player.x, g.player);
  drawTraffic(ctx, g.traffic, g.map, g.player.z, g.player.x);
  drawGates(ctx, g.traffic, g.map, g.player.z, g.player.x);
  // Your personal-best self, at the position it held at this point in the run.
  if (g.ghost) drawGhost(ctx, g.ghost, g.raceTime, g.map, g.player.z, g.player.x);
  drawCoins(ctx, g.traffic, g.map, g.player.z, g.player.x);
  drawPickups(ctx, g.pickups, g.map, g.player.z, g.player.x);
  drawCops(ctx, g.cops, g.map, g.player.z, g.player.x);
  drawDistanceHaze(ctx, biome);   // atmosphere over the far field — cars emerge from it
  drawPlayer(ctx, g.player, g.map);
  // Day → dusk → night → dawn colour wash (static screen-space, no optic flow).
  // Drawn LAST so the world is tinted but the HUD/banners (drawn after) stay clear.
  drawTimeOfDayTint(ctx, g.raceTime);
}

// Toggle the HTML overlays once per state change, and kick off the leaderboard
// fetch when its panel opens. Cheap to call every frame (early-outs if unchanged).
function syncOverlays() {
  if (g.state === _lastUiState) return;
  _lastUiState = g.state;
  const onTitle = g.state === STATES.TITLE;
  const onMenu = onTitle || g.state === STATES.NAME_ENTRY || g.state === STATES.LEADERBOARD
              || g.state === STATES.GARAGE;
  // Returning to the title: refresh the WORLD #1 chip from cache, then fetch fresh.
  if (onTitle) {
    refreshWorldHi();
    fetchTop().then(() => { if (g.state === STATES.TITLE) refreshWorldHi(); });
    // Re-read the daily here rather than caching it: this also catches midnight
    // rolling over while the app sat open, so tomorrow's goal shows up on its own.
    g.daily = getDaily();
  }
  setInstallButtonVisible(onTitle);
  setLeaderboardButtonVisible(onTitle);
  setNameButtonVisible(onTitle);
  setGarageButtonVisible(onTitle);
  // Sound controls live on the title screen only (positioned above TAP TO START).
  setSoundControlsVisible(onTitle);
  refreshSoundControls();
  const playing = g.state === STATES.RACE || g.state === STATES.PAUSED || g.state === STATES.COUNTDOWN;
  // Hide toolbar on the title screen (sound controls replace it); show elsewhere.
  const toolbar = document.getElementById("toolbar");
  toolbar.style.display = onTitle ? "none" : "";
  toolbar.classList.toggle("playing", playing);
  // Steer pads during active play only (not while the pause menu is up).
  document.getElementById("steer-controls").classList.toggle("show", g.state === STATES.RACE || g.state === STATES.COUNTDOWN);
  // The obvious pause button (top-left, below the score) shows only while racing.
  document.getElementById("btn-pause").style.display = (g.state === STATES.RACE) ? "inline-flex" : "none";
  showNameEntry(g.state === STATES.NAME_ENTRY);
  showGameOverActions(g.state === STATES.GAME_OVER);
  showPauseMenu(g.state === STATES.PAUSED);
  showGaragePanel(g.state === STATES.GARAGE);
  if (g.state === STATES.GARAGE) refreshGarage();
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
  syncRampageButton();
  // Title screen also backs the name-entry and leaderboard modals.
  if (g.state === STATES.TITLE || g.state === STATES.NAME_ENTRY
      || g.state === STATES.LEADERBOARD || g.state === STATES.GARAGE) {
    drawTitleScreen(ctx, bestEverScore(), g.world, g.playerName, g.daily);
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
    // Barrel-impact explosion — a fireball over the car (drawn above the world).
    if (g.explosion > 0) {
      drawExplosion(ctx, 1 - g.explosion / EXPLOSION_DUR, (W / 2 + g.map.biasX + g.player.x) | 0, PLAYER_Y);
    }
    // Zone-change flash — a one-shot dither pop that masks the biome palette cut.
    if (g.biomeFlash > 0) drawZoneFlash(ctx, 1 - g.biomeFlash / 0.22);
    // Unleash flash — the same one-shot pop, fired the instant a rampage is tapped.
    if (g.unleashFlash > 0) drawZoneFlash(ctx, 1 - g.unleashFlash / 0.25);
    // Last-life danger frame — a red edge pulse (RACE only, not while paused).
    if (g.state === STATES.RACE && g.player.lives === 1) drawLastLifePulse(ctx);
    // Combo-step juice: a brief 2px gold frame around the play area (between
    // the HUD strips). One static flash per shave — small, quick, not dizzy.
    if (g.comboFlash > 0) {
      rect(ctx, 0, 9, W, 2, 5);
      rect(ctx, 0, H - 24, W, 2, 5);
      rect(ctx, 0, 9, 2, H - 33, 5);
      rect(ctx, W - 2, 9, 2, H - 33, 5);
    }
    // J3: a thick flashing frame the instant a RAMPAGE fires — a brief, static pop.
    if (g.rampageFlash > 0) {
      const c = (Math.floor(performance.now() / 40) % 2) ? 1 : 5;
      rect(ctx, 0, 9, W, 3, c);
      rect(ctx, 0, H - 25, W, 3, c);
      rect(ctx, 0, 9, 3, H - 34, c);
      rect(ctx, W - 3, 9, 3, H - 34, c);
    }
    drawCombo(ctx, comboMult(), g.comboTimer, RACE.comboWindow);
    drawSandwichCombo(ctx, g.sandwichCombo, g.sandwichComboTimer);
    drawRampageMeter(ctx, {
      meter: g.rampageMeter, max: RACE.rampageNearMisses,
      cooldown: g.rampageCooldown, cooldownMax: RACE.rampageCooldownPasses,
      active: g.player.rampage > 0,
      armed: g.rampageArmed,
    });
    if (g.perfectTimer > 0) drawPerfect(ctx, g.perfectTimer, (W / 2 + g.map.biasX + g.player.x) | 0);
    if (g.biomeBannerTimer > 0) drawBiomeBanner(ctx, g.biomeName, g.biomeBannerTimer);
    // Event call-out, payout line, and the draining progress bar while one runs.
    if (g.events.bannerT > 0 && g.events.active) {
      drawEventBanner(ctx, g.events.active.name, g.events.bannerT, g.events.active.idx);
    } else if (g.events.clearT > 0) {
      drawEventBanner(ctx, g.events.clearMsg, g.events.clearT, g.events.clearIdx);
    }
    if (g.events.active) {
      drawEventTimer(ctx, g.events.timeLeft / g.events.total, g.events.active.idx);
    }
    if (g.shieldMsgTimer > 0) drawShieldMsg(ctx, g.shieldMsg);
    drawHud(ctx, {
      score: g.scoreState.score,
      speed: g.player.speed,
      passed: g.traffic.passedCount,
      mapKind: g.map.key,
      time: g.raceTime,
      lives: g.player.lives,
      densityMul: g.densityMul,
      coins: g.coins,
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
      bestDelta: g.bestDelta || 0,
      rankInfo: g.rankInfo,
      reason: g.endReason,
      passed: g.traffic ? g.traffic.passedCount : 0,
      time: g.raceTime,
      topSpeed: g.topSpeedKmh || 0,
      combo: g.comboBest || 0,
      smashed: g.smashTotal || 0,
      rampages: g.rampagesUsed || 0,
      coins: g.coins || 0,
      wallet: g.wallet || 0,
      unlocked: g.unlocked || [],
      nextCar: g.nextCar || null,
      daily: g.daily,
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
  // HIT-STOP: a deliberate micro freeze (~60ms) on a razor-tight shave. The
  // world holds perfectly still for a beat — an impact pause that sells the
  // closeness with LESS motion, not more (still renders, so banners/pops show).
  if (g.hitStop > 0) {
    g.hitStop = Math.max(0, g.hitStop - dt);
    acc = 0;
    render();
    requestAnimationFrame(frame);
    return;
  }
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
    case STATES.GARAGE: updateGarage(); break;
    case STATES.MAP_SELECT: updateMapSelect(); break;
    case STATES.DIFFICULTY: updateDifficulty(); break;
    case STATES.TUTORIAL: updateTutorial(dt); break;
    case STATES.COUNTDOWN: updateCountdown(dt); break;
    case STATES.RACE: updateRace(dt); break;
    case STATES.PAUSED: updatePaused(); break;
    case STATES.GAME_OVER: updateGameOver(dt); break;
  }
}
// Wire the HTML overlays (name entry, leaderboard, game-over actions) to game state.
initUI({
  onNameConfirm: (name) => confirmName(name),
  onNameBack: () => { g.state = STATES.TITLE; },
  onOpenNameEdit: () => openNameEntry(),
  onOpenGarage: () => openGarage(),
  onGarageBack: () => { g.state = STATES.TITLE; },
  onGaragePick: (id) => {
    ensureAudio(); sfxMenuSelect();
    setSelectedId(id);
    refreshGarage();          // repaint so EQUIPPED moves to the new pick
  },
  onOpenLeaderboard: () => { ensureAudio(); sfxMenuSelect(); openLeaderboard(STATES.TITLE); },
  onLeaderboardBack: () => { g.state = g.lbReturnTo || STATES.TITLE; },
  onPlayAgain: () => playAgain(),
  onShareScore: () => shareScoreCard(),
  onGameOverLeaderboard: () => openLeaderboard(STATES.GAME_OVER),
  onExit: () => { g.state = STATES.TITLE; },
  onPauseResume: () => { ensureAudio(); resumeGame(); },
  onPauseRestart: () => { ensureAudio(); sfxMenuSelect(); beginCountdown(); },
  onPauseQuit: () => { stopMusic(); stopAllLoopingSfx(); g.state = STATES.TITLE; },
});
// Retry any leaderboard submission that failed on a previous (offline) run, then
// prime the WORLD #1 chip from cache and refresh it from the network.
flushPending();
refreshWorldHi();
fetchTop().then(() => refreshWorldHi());

requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
