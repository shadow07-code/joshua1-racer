// Main game loop + state machine — ENDLESS SURVIVAL mode.
//
// No more AI rivals or finish line. The player has 3 lives. Each crash with a
// civilian costs one life. Once you reach top speed, traffic density compounds
// by +5% every 60 seconds, so the game gets harder the longer you survive.
import { W, H, PHYS, SPAWN, RACE, SCORE, PLAYER_Y } from "./config.js";
import { getCtx, clear, rect, SUN } from "./render.js";
import { MAPS, MAP_LIST, DIFFICULTY_LIST } from "./maps.js";
import {
  initInput, getInput, consumePress, consumeAnyPress, clearPresses, releaseAllInput,
} from "./input.js";
import {
  initAudio, resumeAudio, suspendAudio, startMusic, stopMusic, setMusicIntensity, setMusicTempoFactor,
  playFlourish, tapeStopMusic, engineWindDown,
  startEngine, setEngine, stopEngine, setEngineNitro, setEngineStrain, getEngineStyle, setEngineStyle,
  sfxAccelAccent, sfxPickup, sfxCrash, sfxExplosion, sfxBump, sfxBarrelDrop, sfxCombo,
  sfxWhoosh, sfxPerfect, sfxHeartbeat, sfxHorn, sfxLightsOn,
  sfxSandwich, sfxChainBank, sfxComboTier,
  sfxNitroCharge, sfxNitroReady, sfxNitrous,
  sfxMenuMove, sfxMenuSelect, sfxCountdownBeep,
  startHeliSound, stopHeliSound,
  setMusicEnabled, setSfxEnabled, isMusicEnabled, isSfxEnabled, applyMix,
  getMusicTrack, setMusicTrack,
} from "./audio.js";
import { drawRoad, drawDistanceHaze, drawNightShade, dayNight, distToY, biomeAt, project, sunShadow } from "./road.js";
import { makePlayer, updatePlayer, drawPlayer, drawPlayerLights, beamAnchor, playerBox, applyCollisionLoss, paceSpeed } from "./entities/player.js";
import { makeTrafficSystem, updateTraffic, drawTraffic, drawNightLights, checkTrafficHit, prepopulateTraffic, knockCar, pullSpawnToHorizon } from "./entities/traffic.js";
import { getDaily, applyRun as applyDailyRun } from "./daily.js";
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
  drawGameOver, drawPaused, drawCountdown, drawTutorialOverlay, drawSteerHints, drawCombo, drawChainTally, drawShieldMsg,
  drawNitroMeter, drawSandwichCombo, drawShareCard, SHARE_CARD_W, SHARE_CARD_H,
  drawExplosion, drawCrashImpact, drawCrashFlash, drawPerfect, drawLastLifePulse,
  drawBiomeBanner, drawZoneFlash, drawWreckFade,
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
  cachedChampion,
} from "./leaderboard.js";
import {
  CARS, getSelectedId, setSelectedId, carSprite,
} from "./garage.js";
import {
  makeGhostRecorder, recordGhost, saveGhost, loadGhost, drawGhost, drawRivalGhost,
} from "./ghost.js";

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
  pickups: null,
  scoreState: makeScoreState(),
  ghostRec: null,        // this run's recording (saved if it becomes the new best)
  ghost: null,           // the personal-best track being replayed, or null
  rival: null,           // the global #1's track being replayed, or null
  champion: null,        // cached {name,score,samples} for the global #1
  isNewHi: false,
  bestDelta: 0,          // points over the previous personal best (for "NEW BEST +X")
  rankInfo: null,        // { rank, total } from the leaderboard submit, or { offline:true }; null = pending
  endReason: "GAME OVER",
  // Endless mode tracking.
  raceTime: 0,
  hitTopSpeed: false,
  densityMul: 1.0,      // FINAL density = knee ramp x densityStack, capped
  densityStack: 1.0,    // accumulated one-shot/step bumps (top-speed side only)
  densityTimer: 0,
  densityTopDone: false,// one-time +20% density 30s after top speed is reached
  topTime: 0,           // seconds since top speed reached (drives the 30s bump)
  topSpeedKmh: 0,
  paceKmh: 0,           // top speed WITHOUT nitrous — what difficulty keys on
  combo: 0,             // near-miss STREAK count (drives the capped combo multiplier)
  comboTimer: 0,        // seconds left before the combo lapses
  comboFlash: 0,        // brief screen-edge flash on each combo step
  tierStamp: 0,         // the COMBO plate's gold stamp on a multiplier tier-up
  comboBest: 0,         // best combo this run (for the game-over stats)
  sandwichCombo: 0,     // banked sandwiches this combo run (combo-score multiplier)
  sandwichComboTimer: 0,// transient "SANDWICH COMBO" banner timer
  nitroMeter: 0,        // combo-tier near misses banked toward the next NITROUS BOOST
  nitroArmed: false,    // meter is FULL — banked, strobing, waiting for the player's tap
  nitroCooldown: 0,     // cars still to pass before the meter can build again
  nitroOn: false,       // a boost is running (its end drops the snarl + starts the cooldown)
  nitroFlash: 0,        // brief edge flash when a boost fires
  unleashFlash: 0,      // one-shot full-frame flash on a tap-fired boost
  nitrosUsed: 0,        // boosts fired this run (game-over stat)
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
    // The champion's ghost is read HERE and nowhere else — the title draws every
    // frame, so this must not become a per-frame localStorage hit. Race setup
    // reuses whatever this last resolved.
    g.champion = cachedChampion();
  } catch {}
}

// ── Audio toggles ─────────────────────────────────────────────────────────────
// Toolbar buttons (top-right during gameplay) + title-screen sound controls.
const btnMusic = document.getElementById("btn-music");
const btnSfx = document.getElementById("btn-sfx");
const btnPause = document.getElementById("btn-pause");
const btnNitro = document.getElementById("btn-nitro");
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
// ── Title-screen sound CYCLES ────────────────────────────────────────────────
// One chip per setting; tapping advances it. The title used to carry three full
// rows of explicit options (138px of permanent furniture that crowded the whole
// home screen) — the PAUSE menu still shows those, so no option is lost, and
// both routes share applySoundChoice() below.
const CYCLE_ORDER = { sfx: [1, 0], music: [1, 2, 0], engine: [0, 1, 2] };
const ENGINE_NAMES = ["SOFT", "DEEP", "RACE"];
function cycleValue(kind) {
  if (kind === "sfx") return isSfxEnabled() ? 1 : 0;
  if (kind === "music") return isMusicEnabled() ? getMusicTrack() : 0;
  return getEngineStyle();
}
function cycleLabel(kind, v) {
  if (kind === "sfx") return "SOUND " + (v ? "ON" : "OFF");
  if (kind === "music") return v === 0 ? "MUSIC OFF" : "MUSIC " + v;
  return "ENG " + (ENGINE_NAMES[v] || "SOFT");
}
function refreshSoundCycles() {
  if (!soundControls) return;
  soundControls.querySelectorAll(".snd-cycle").forEach((btn) => {
    const kind = btn.dataset.cycle;
    const v = cycleValue(kind);
    btn.textContent = cycleLabel(kind, v);
    btn.classList.toggle("off", (kind === "sfx" && !v) || (kind === "music" && v === 0));
  });
}

function refreshSoundControls() {
  const track = getMusicTrack();
  const sfx = isSfxEnabled();
  refreshSoundCycles();
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
// The hovering NITRO button — fires on pointerdown (zero tap latency), only
// meaningful while armed. Visibility is synced per-frame (syncNitroButton).
btnNitro.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (g.state === STATES.RACE && g.nitroArmed && g.player.boost <= 0) {
    ensureAudio();
    fireNitro();
  }
});

// Show the NITRO button exactly while it can be pressed. Called every frame
// from render() — cheap (touches the DOM only when the armed state flips).
let _nitroBtnShown = false;
function syncNitroButton() {
  const show = g.state === STATES.RACE && g.nitroArmed && g.player.boost <= 0;
  if (show !== _nitroBtnShown) {
    _nitroBtnShown = show;
    btnNitro.classList.toggle("show", show);
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
// A cycle chip advances its setting, then hands the new value to the SAME
// applySoundChoice() the pause menu uses (it only ever reads btn.dataset).
const onCycleClick = (e) => {
  const btn = e.target.closest(".snd-cycle");
  if (!btn) return;
  const kind = btn.dataset.cycle;
  const order = CYCLE_ORDER[kind];
  if (!order) return;
  const cur = cycleValue(kind);
  const next = order[(Math.max(0, order.indexOf(cur)) + 1) % order.length];
  applySoundChoice({ dataset: { [kind]: String(next) } });
};
soundControls.addEventListener("click", onCycleClick);
if (pauseSound) pauseSound.addEventListener("click", onSndClick);

function ensureAudio() { initAudio(); resumeAudio(); applyMix(); }
function stopAllLoopingSfx() { stopEngine(); stopHeliSound(); g._heliSoundOn = false; setEngineNitro(false); }

// Pause/resume helpers — pausing silences music + engine (and suspends the audio
// context) so sound stops IMMEDIATELY, even mid-note. Resuming restarts both.
function pauseGame() {
  if (g.state !== STATES.RACE) return;
  // Mid-wreck the run is already over: finish it now (submit the score)
  // instead of pausing a dead run that RESTART or QUIT would then
  // throw away. Covers the auto-pause too — a phone locking during the wreck.
  if (g.wreck > 0) { g.wreck = 0; endRace("GAME OVER"); return; }
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
  // Release everything HELD first. Backgrounding takes a touch or key away
  // without the browser ever delivering touchend/keyup, so the steer stays
  // latched and the player would resume with the car turning by itself.
  // Unconditional on purpose: whatever the state, nothing can still legitimately
  // be held once the app is in the background.
  releaseAllInput();
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
  g.pickups = makePickupSystem();
  g.cops = makeCopsSystem();
  // Ghost: record this run, and replay the personal best recorded for this map.
  g.ghostRec = makeGhostRecorder();
  g.ghost = loadGhost(g.map.key, g.difficulty);
  // RIVAL ghost: the global #1's line, so the leaderboard is a car on the road
  // rather than a list read after dying. Skipped when the champion IS you — two
  // ghosts running your own line would just be confusing.
  const champ = g.champion;
  const chasingSelf = !!(champ && champ.name && champ.name === g.playerName);
  g.rival = (champ && !chasingSelf) ? champ.samples : null;
  g.scenery = makeScenerySystem();
  for (let i = 0; i < 25; i++) updateScenery(g.scenery, 0, g.map, 0.016, SPAWN.sceneryPerMeter);
  prepopulateTraffic(g.traffic, g.map, 500);
  startScoring(g.scoreState, g.map.key, g.difficulty, 0);
  // The records this run is chasing, for the live NEW BEST / WORLD RECORD
  // call-outs. 0 = nothing to beat: a first-ever run has no best to pass, and
  // the world #1 only counts when it is above your own best and isn't you.
  g.bestMark = g.scoreState.hi || 0;
  g.bestBeaten = false;
  const w = g.world || {};
  g.worldMark = (w.score > g.bestMark && w.name && w.name !== g.playerName) ? w.score : 0;
  g.worldBeaten = false;
  g.scoreFlash = 0;
  startEngine();
  // Reset endless-mode trackers.
  g.raceTime = 0;
  g.hitTopSpeed = false;
  g.densityMul = 1.0;
  g.densityStack = 1.0;
  g.densityTimer = 0;
  g.densityTopDone = false;
  g.topTime = 0;
  g.topSpeedKmh = 0;   // track highest speed reached (in km/h display units)
  g.paceKmh = 0;       // ...and the same without nitrous (drives difficulty)
  g.combo = 0;
  g.comboTimer = 0;
  g.comboFlash = 0;
  g.tierStamp = 0;
  g.comboBest = 0;
  g.sandwichCombo = 0;
  g.sandwichComboTimer = 0;
  g.chainPts = 0;           // points the current near-miss chain has earned so far
  g.tallyN = 0;             // the CHAIN BANKED receipt: chain length...
  g.tallyPts = 0;           // ...what it earned...
  g.tallyTimer = 0;         // ...and how long it has left on screen
  g.nitroMeter = 0;
  g.nitroArmed = false;
  g.nitroCooldown = 0;
  g.nitroOn = false;
  g.nitroFlash = 0;
  g.unleashFlash = 0;
  g.nitrosUsed = 0;
  g.biome = biomeAt(0);            // start in CITY; no banner for the opening zone
  g.biomeName = g.biome.name;
  g.biomeBannerTimer = 0;
  g.biomeFlash = 0;
  g.shieldMsg = "";
  g.shieldMsgTimer = 0;
  g.explosion = 0;
  g.crashFx = 0;            // metal-on-metal impact burst at the car
  g.crashFlash = 0;         // the red screen pop that goes with it
  g.crashX = 0;             // screen x the burst is pinned to
  g.lightsOn = false;       // headlights state last frame (fires the click once)
  g.wreck = 0;              // seconds left of the run-ending wreck beat (0 = racing)
  g.deathZ = null;          // where the run ended (the wreck coasts a few metres on)
  g.deathPassed = 0;        // cars passed at the moment of death (frozen for the wreck)
  g.hitStop = 0;
  g.hitStopCool = 0;
  g.perfectTimer = 0;
  g.heartTimer = 0;
  g.lastOncomingWarn = 0;
}

// A record just fell mid-run: a big gold call-out, the HUD score strobes, and
// the flourish plays (it used to play only on the game-over screen, AFTER the
// run that earned it had already ended).
const RECORD_MSGS = new Set(["NEW BEST!", "WORLD RECORD!"]);
function recordCallout(msg) {
  g.shieldMsg = msg; g.shieldMsgTimer = 2.0;
  g.scoreFlash = 1.2;
  playFlourish();
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

// A chain step just landed. If it lifted the CAPPED multiplier a tier (every
// comboPerStep beats, x2 up to x8), mark it: the COMBO plate stamps gold and a
// chime rings, so the ladder the score rides on is heard instead of a number
// that changes silently. `before` is comboMult() from before the step.
function noteTierUp(before) {
  const now = comboMult();
  if (now > before) { g.tierStamp = RACE.comboTierStamp; sfxComboTier(now); }
}

// Take a hit: lose a life (a real crash also breaks the combo streak).
// Returns true if the run just ended. A NITROUS BOOST protects nothing: a hit
// during one is a hit like any other, and it puts the boost out.
function takeHit(_invulnSec) {
  sfxCrash();
  // The crash BEAT — a red screen pop plus a shard burst pinned to the car, so
  // losing a life finally reads as an impact instead of an invisible accounting
  // change. The hit-stop is added by the caller only when the run continues: on
  // a fatal hit the state is already GAME_OVER by the time the next frame
  // renders, so a freeze there would just stall the game-over screen.
  //
  // A barrel hit already has its own fireball (set just before this call), and
  // stacking a metal-shard burst inside a fireball is mush. The RED FLASH still
  // fires either way — that is the "you lost a life" signal, and the
  // explosion's own flash is white and lasts only its first 12%.
  g.crashFx = g.explosion > 0 ? 0 : RACE.crashFxDur;
  g.crashFlash = RACE.crashFlashDur;
  g.crashX = (W / 2 + g.map.biasX + g.player.x) | 0;
  g.player.lives -= 1;
  g.combo = 0; g.comboTimer = 0;        // a real crash breaks the streak
  g.chainPts = 0;                       // ...with no receipt: it didn't end well
  g.sandwichCombo = 0; g.sandwichComboTimer = 0;  // ...and the sandwich multiplier
  g.nitroMeter = 0;                     // ...and dumps the banked nitrous meter
  g.nitroArmed = false;                 // ...including an ARMED one (crash = lost)
  g.player.boost = 0;                   // ...and a running boost dies with the hit
  // RECOVERY BEAT: force the next couple of spawned rows open so the player gets
  // a moment to regather instead of being fed straight back into the phrase that
  // just killed them (which is how one crash chains into losing every life).
  // Spawning restarts AT THE HORIZON, so the open road arrives while it helps.
  if (g.traffic) {
    pullSpawnToHorizon(g.traffic, g.player.z);
    g.traffic.phrase = { type: "breather", left: RACE.crashBreatherRows, dir: 1 };
  }
  if (g.player.lives <= 0) { beginWreck(); return true; }
  return false;
}

// THE WRECK — the run-ending crash plays out before the results. It used to cut
// to GAME OVER on the same frame, so its own crash flash and shards never
// rendered and the player often never saw what hit them. Now: the same impact
// freeze a survivable crash gets, then the world rolls on in slow motion around
// the stopped car while the music tape-stops and the engine dies (updateWreck),
// then it closes to black and endRace() takes over. The run's score, time and
// pass count are final at the moment of impact.
function beginWreck() {
  g.wreck = RACE.wreckSeconds;
  g.deathZ = g.player.z;
  g.deathPassed = g.traffic ? g.traffic.passedCount : 0;
  g.hitStop = Math.max(g.hitStop, RACE.crashHitStop);
  g.player.invuln = 0;          // a wreck is solid, not the respawn blink
  tapeStopMusic(RACE.wreckSeconds);
  engineWindDown(RACE.wreckSeconds);
}

function updateWreck(dt) {
  const sdt = dt * RACE.wreckTimeScale;
  const p = g.player;
  // The car coasts to a stop; everything else carries on in slow motion.
  p.speed = Math.max(0, p.speed * (1 - Math.min(1, dt * 3)));
  p.z += p.speed * sdt;
  // The crash shove plays out too, in slow motion (updatePlayer isn't running).
  if (p.bounce) {
    const step = p.bounce * Math.min(1, sdt * 12);
    const bound = g.map.roadHalfWidth - PHYS.carHalfWidth;
    p.x = Math.max(-bound, Math.min(bound, p.x + step));
    p.bounce -= step;
    if (Math.abs(p.bounce) < 0.1) p.bounce = 0;
  }
  updateTraffic(g.traffic, sdt, p.z, g.map, { playerX: p.x }, 0, false);
  g.traffic.passedCount = g.deathPassed;     // nothing counts once the run is over
  updateCops(g.cops, sdt, p.z, p.x, p.speed, g.map, {});
  updateSmoke(p, sdt);
  // Screen FX run in REAL time, so the crash plays out in full inside the beat.
  decayFx(dt);
  g.wreck = Math.max(0, g.wreck - dt);
  if (g.wreck === 0) endRace("GAME OVER");
}

// The player taps to FIRE an armed NITROUS BOOST — the peak moment, made theirs.
// It is ONLY a speed boost: the car surges to PHYS.boostFactor x top speed for
// RACE.nitroDuration seconds. Nothing is invincible and nothing gets smashed;
// a hit during it is a hit (takeHit puts the boost out). Spectacle within the
// dizzy rule: an 80ms hit-stop beat, a one-shot full-frame dither flash + the
// thick edge frame, and the engine's nitrous snarl.
function fireNitro() {
  g.nitroArmed = false;
  g.nitroMeter = 0;
  g.player.boost = RACE.nitroDuration;
  g.nitroOn = true;
  g.nitrosUsed += 1;
  g.nitroFlash = 0.18;
  g.unleashFlash = 0.25;
  g.hitStop = Math.max(g.hitStop, 0.08);
  g.shieldMsg = "NITRO!"; g.shieldMsgTimer = 1.6;
  sfxNitrous();
  setEngineNitro(true);
}

// Stereo position of something at lateral x on the road, relative to the car
// (-0.8 … +0.8 — never hard-panned, it should still read as "here").
function panFor(x) {
  return Math.max(-1, Math.min(1, (x - g.player.x) / g.map.roadHalfWidth)) * 0.8;
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
  // ── DAILY CHALLENGE ── Every run, even a short one, counts toward today's goal.
  const dailyRes = applyDailyRun({
    distance: Math.floor((g.deathZ != null ? g.deathZ : g.player.z) || 0),
    passed: g.traffic ? g.traffic.passedCount : 0,
    combo: g.comboBest || 0,
    score: Math.floor(g.scoreState.score || 0),
    time: Math.floor(g.raceTime || 0),
  });
  g.daily = Object.assign(getDaily(), { completedThisRun: dailyRes.completed });
  if (g.isNewHi) playFlourish();
  if (dailyRes.completed) playFlourish();
  // Submit to the global board; the response carries this run's rank + total so
  // the game-over screen can show a percentile ("TOP 14%  RANK 14/98").
  submitScore({
    name: g.playerName || "AAA",
    score: Math.floor(g.scoreState.score),
    time: Math.floor(g.raceTime),
    passed: g.traffic ? g.traffic.passedCount : 0,
    topSpeed: g.topSpeedKmh || 0,
    // This run's recorded line. Sent only when it could take the crown (the
    // client checks the cached board first) and kept only if the server's own
    // rank says #1 — then it becomes everyone else's rival ghost.
    samples: g.ghostRec ? g.ghostRec.samples : null,
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

// ── Garage ── The car collection. Every car is yours from the first run, so
// this panel is about CHOOSING what you drive.
function openGarage() {
  ensureAudio();
  sfxMenuSelect();
  g.state = STATES.GARAGE;
}
function refreshGarage() {
  renderGarage({
    cars: CARS,
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
    nitros: g.nitrosUsed || 0,
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

  // The run is over — play out the wreck (see beginWreck) instead of racing.
  // Ahead of the key shortcuts on purpose: Escape must not quit a dead run
  // before it is banked (endRace clears whatever was pressed meanwhile).
  if (g.wreck > 0) { updateWreck(dt); return; }
  if (consumePress("p", "P")) { pauseGame(); return; }
  if (consumePress("m", "M")) { toggleMusic(); }
  if (consumePress("Escape")) { stopMusic(); stopAllLoopingSfx(); g.state = STATES.TITLE; return; }
  // FIRE an armed nitrous boost. The control is the big round NITRO button at
  // the bottom centre (pointerdown, wired near the toolbar buttons); Enter is the
  // desktop fallback. There's no tap-zone fallback — the whole canvas steers.
  if (g.nitroArmed && g.player.boost <= 0 && consumePress("Enter")) {
    fireNitro();
  }

  g.raceTime += dt;
  recordGhost(g.ghostRec, g.raceTime, g.player);   // track this run for the ghost

  updatePlayer(g.player, dt, input, g.map, { onAccelAccent: sfxAccelAccent, onFenceBump: (side) => sfxBump(side * 0.7) });

  const speed01 = g.player.speed / PHYS.maxSpeed;
  setEngine(speed01);
  setMusicTempoFactor(speed01);

  // Track highest speed reached (in display km/h) — the real top speed, nitrous
  // included: a stat for the results and the leaderboard.
  const currentKmh = Math.round(speed01 * (PHYS.topSpeedKmh || 200));
  if (currentKmh > g.topSpeedKmh) g.topSpeedKmh = currentKmh;
  // ...and the run's PACE: the same high-water mark with nitrous taken off.
  // Everything that makes the run harder keys on THIS (the density knee and
  // top-speed bumps, the chopper, wrong-way cars, canisters), so firing a boost
  // early never ages the run. Nitrous is only a speed boost.
  const pace = paceSpeed(g.player);
  const paceKmh = Math.round(pace / PHYS.maxSpeed * (PHYS.topSpeedKmh || 200));
  if (paceKmh > g.paceKmh) g.paceKmh = paceKmh;

  // ── Density scaling ──
  // Two layers that MULTIPLY into the final densityMul:
  //   1. KNEE RAMP — steps to RACE.densityRampFrom at the knee (150 km/h) and
  //      then climbs continuously with speed to RACE.densityRampToTop at the
  //      top. This is what stops the middle of a run being a flat line: the old
  //      one-shot step at 150 left density unchanged for the ~80 s it takes to
  //      grind from the knee to top speed.
  //   2. densityStack — the discrete top-speed bumps (a +20% 30 s after top
  //      speed, then +10% every densityStepSeconds for the long endless game).
  // Every row still leaves a gap lane open, so the road stays threadable at any
  // density, and densityMax caps the product exactly as before.
  const kneeSpan = Math.max(1, PHYS.topSpeedKmh - PHYS.kneeKmh);
  // Driven by paceKmh (a high-water mark), so easing off never rewinds the
  // difficulty the player has already earned their way into.
  const kneeF = Math.max(0, Math.min(1, (g.paceKmh - PHYS.kneeKmh) / kneeSpan));
  // Below the knee the ramp is INERT (1.0) — the opening has to stay a clean
  // weave. Clamping kneeF alone is not enough: it floors at 0, which would still
  // apply densityRampFrom from the first second of the run.
  const kneeRamp = g.paceKmh < PHYS.kneeKmh
    ? 1
    : RACE.densityRampFrom + (RACE.densityRampToTop - RACE.densityRampFrom) * kneeF;
  if (!g.hitTopSpeed && pace >= PHYS.maxSpeed * RACE.topSpeedThreshold) {
    g.hitTopSpeed = true;
    g.topTime = 0;
  }
  if (g.hitTopSpeed) {
    g.topTime += dt;
    if (!g.densityTopDone && g.topTime >= RACE.densityTopBumpDelay) {
      g.densityStack *= RACE.densityTopBump;
      g.densityTopDone = true;
    }
    g.densityTimer += dt;
    while (g.densityTimer >= RACE.densityStepSeconds) {
      g.densityTimer -= RACE.densityStepSeconds;
      g.densityStack *= (1 + RACE.densityStepIncrement);
    }
  }
  g.densityMul = Math.min(RACE.densityMax, kneeRamp * g.densityStack);
  // V2 tension/release: breathe the spacing ±densityWaveAmp around the ramped
  // base on a slow cycle (surge → breather → surge) so difficulty isn't monotonic.
  // (Doesn't touch the gap-lane logic, so every row stays threadable.)
  const wave = 1 + RACE.densityWaveAmp * Math.sin(g.raceTime * (2 * Math.PI / RACE.densityWavePeriod));

  g.traffic.rowGapZ = (baseRowGapForMap(g.map) / g.densityMul) * wave;
  g.traffic.densityMul = g.densityMul;

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
        g.chainPts += SCORE.sandwichBonus;
        const tierBefore = comboMult();
        g.combo += 1;
        g.comboBest = Math.max(g.comboBest, g.combo);
        g.comboTimer = RACE.comboWindow;
        sfxSandwich();
        noteTierUp(tierBefore);
      }
      // Each pass burns down the post-boost cooldown; once it's spent, near
      // misses bank toward the next nitrous boost again.
      if (g.nitroCooldown > 0) g.nitroCooldown -= 1;
    },

    onNearMiss: (tightness, daylight = 99, side = 0) => {
      // Two tiers. Below comboKmh (100): every close shave still pays a flat
      // bonus with a discreet "NEAR MISS" flash — but no multiplier. At
      // comboKmh+ we enter NEAR MISS COMBO territory: shaves chain into a
      // multiplier AND fill the nitrous meter.
      // Precision (tightness) bonus — a closer shave is worth a bit more.
      const kmh = g.player.speed / PHYS.maxSpeed * (PHYS.topSpeedKmh || 200);
      const t = tightness != null ? tightness : 0;
      const precision = 1 + SCORE.precisionMax * t;     // 1 → 1.5 (pixel-perfect)
      // ── Game-feel juice (freeze + audio only, per the no-shake/no-zoom rule) ──
      // Tiered by the real DAYLIGHT between the hitboxes at the closest point:
      // a close shave gets an air-rush whoosh that brightens the closer it was;
      // paint-trading (the sprites touching) pops "PERFECT!" with a crystal ting
      // and a 60ms hit-stop (a micro freeze actually REDUCES motion).
      // ...on the side the car went past.
      if (daylight <= RACE.shaveWhooshPx) sfxWhoosh(1 - daylight / RACE.shaveWhooshPx, side * 0.6);
      if (daylight <= RACE.shavePerfectPx) {
        g.perfectTimer = 0.5;
        sfxPerfect();
        // The freeze is THROTTLED (the pop isn't): back-to-back perfect shaves
        // would otherwise stutter the whole run instead of punctuating it.
        if (g.hitStopCool <= 0) {
          g.hitStop = Math.max(g.hitStop, 0.06);
          g.hitStopCool = RACE.hitStopCooldown;
        }
      }
      if (kmh >= RACE.comboKmh) {
        const tierBefore = comboMult();
        g.combo += 1;
        g.comboBest = Math.max(g.comboBest, g.combo);
        g.comboTimer = RACE.comboWindow;
        g.comboFlash = 0.18;
        const gain = Math.round(SCORE.nearMissBonus * comboMult() * precision);
        g.scoreState.score += gain;
        g.chainPts += gain;
        sfxCombo(g.combo);
        noteTierUp(tierBefore);
        // Risk → reward: an unbroken chain of `nitroNearMisses` shaves fills
        // the meter and ARMS the nitrous — the player then fires it with the
        // NITRO button, when THEY choose (agency + anticipation instead of an
        // auto-fire). The meter only builds while unarmed — never during a
        // boost, never during the post-boost pass cooldown.
        if (g.player.boost <= 0 && g.nitroCooldown <= 0 && !g.nitroArmed) {
          g.nitroMeter += 1;
          // J3: the last few near-misses audibly "charge" the nitrous.
          const fromFull = RACE.nitroNearMisses - g.nitroMeter;
          if (fromFull >= 0 && fromFull <= 2) sfxNitroCharge(2 - fromFull);
          if (g.nitroMeter >= RACE.nitroNearMisses) {
            g.nitroArmed = true;           // banked — survives a combo lapse, lost on a crash
            g.shieldMsg = "NITRO READY!"; g.shieldMsgTimer = 1.4;
            sfxNitroReady();
          }
        }
      } else {
        const gain = Math.round(SCORE.nearMissLowBonus * precision);
        g.scoreState.score += gain;
        sfxPickup();
      }
    },
  }, 0, g.paceKmh >= RACE.oncomingFromKmh);

  // Wrong-way horn — one blast per car, fired as it bears down (no HUD warning:
  // the whole point is that it ambushes you). Edge-triggered off the distance.
  const nearOncoming = g.traffic.oncomingNear || 0;
  if (nearOncoming > 0 && g.lastOncomingWarn <= 0) sfxHorn(panFor(g.traffic.oncomingNearX));
  g.lastOncomingWarn = nearOncoming;

  // ── Nitrous running out ── (updatePlayer burns the boost timer down.) When a
  // boost ends, however it ends (spent, or put out by a hit), the engine drops
  // its snarl and the meter LOCKS until the cooldown's worth of cars is passed.
  if (g.nitroOn && g.player.boost <= 0) {
    g.nitroOn = false;
    setEngineNitro(false);
    g.nitroCooldown = RACE.nitroCooldownPasses;
  }

  // Combo decay — lapse the streak if you go too long without a near-miss.
  // A lapsed chain also dumps the banked nitrous meter (it rewards UNBROKEN runs).
  if (g.comboTimer > 0) {
    g.comboTimer -= dt;
    if (g.comboTimer <= 0) {
      // CHAIN BANKED — a chain that reached the x2 banner ends with a receipt
      // (length + what it earned) and a ka-ching, instead of just vanishing.
      if (comboMult() >= 2) {
        g.tallyN = g.combo;
        g.tallyPts = g.chainPts;
        g.tallyTimer = RACE.chainTallySeconds;
        sfxChainBank(comboMult());
      }
      g.combo = 0; g.nitroMeter = 0; g.sandwichCombo = 0; g.chainPts = 0;
    }
  }
  decayFx(dt);
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
  updateCops(g.cops, dt, g.player.z, g.player.x, pace, g.map, { onDrop: sfxBarrelDrop });
  // Helicopter rotor sound — on when choppers are on-screen, off otherwise.
  const helisOnScreen = g.cops.active && g.cops.helis.length > 0;
  if (helisOnScreen && !g._heliSoundOn) { startHeliSound(); g._heliSoundOn = true; }
  else if (!helisOnScreen && g._heliSoundOn) { stopHeliSound(); g._heliSoundOn = false; }
  // ── Night falls ── The headlights click on once it is properly dark (see
  // config.DAYNIGHT); give that moment its sound. Edge-triggered.
  const lightsNow = dayNight(g.raceTime).on;
  if (lightsNow && !g.lightsOn) sfxLightsOn();
  g.lightsOn = lightsNow;
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

  // Occasional nitrous canister pickups.
  // Boosters only start appearing once the player has genuinely hit 150 km/h —
  // the same knee the density ramp starts from.
  updatePickups(g.pickups, g.player.z, g.map, dt, g.paceKmh >= PHYS.kneeKmh);


  // ── Collisions ── (the same with or without nitrous: a hit is a hit)
  if (g.player.invuln <= 0) {
    const box = playerBox(g.player);
    const t = checkTrafficHit(g.traffic, box);
    if (t) {
      applyCollisionLoss(g.player, 0.55, 1.5);
      // CONTACT — both bodies react. You are shoved clear on the fence's own
      // spring (eased, where it used to teleport 9 px in one frame), and the car
      // you hit is jolted the other way — and punted ahead if you rear-ended it.
      // The impact freeze holds the moment of contact; the shove plays after it.
      const side = g.player.x > t.x ? 1 : -1;
      g.player.bounce = side * RACE.crashShovePx;
      knockCar(t, -side, g.player.z < t.z);
      if (takeHit(1.5)) return;
      g.hitStop = Math.max(g.hitStop, RACE.crashHitStop);
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
        g.hitStop = Math.max(g.hitStop, RACE.crashHitStop);
      }
    }
  }
  // NITROUS canister — grabbing one instantly fires a boost (bypasses the
  // near-miss meter + cooldown). Grabbed mid-boost it just refills the timer.
  const boost = checkPickup(g.pickups, playerBox(g.player));
  if (boost) {
    const wasActive = g.player.boost > 0;
    g.player.boost = RACE.nitroDuration;       // (re)fill — RESETS the timer even mid-boost
    g.nitroOn = true;
    g.nitroMeter = 0;
    g.nitroArmed = false;                      // the canister IS the boost — no double-dip
    g.nitroCooldown = 0;
    g.nitroFlash = 0.12;                       // feedback on every grab (incl. a refresh)
    g.shieldMsg = "NITRO!"; g.shieldMsgTimer = 1.6;
    sfxNitrous();
    setEngineNitro(true);                      // no-op if already boosting
    if (!wasActive) g.nitrosUsed += 1;         // only a fresh boost counts toward the stat
  }

  tickScore(g.scoreState, g.player.z, 1);
  // Per-second time bonus accumulated continuously.
  g.scoreState.score += SCORE.survivalSecondBonus * dt;

  // ── NEW BEST, LIVE ── Passing your personal best was only ever announced on
  // the game-over screen, after the run that earned it had already ended. Now
  // it lands the moment it happens — and so does passing the world #1.
  const sc = g.scoreState.score;
  if (!g.bestBeaten && g.bestMark > 0 && sc > g.bestMark) {
    g.bestBeaten = true;
    recordCallout("NEW BEST!");
  }
  if (!g.worldBeaten && g.worldMark > 0 && sc > g.worldMark) {
    g.worldBeaten = true;
    recordCallout("WORLD RECORD!");
  }
}

// Screen-FX timers — banners, flashes, bursts. They count down in REAL time,
// shared by the race and the wreck (whose world runs in slow motion).
function decayFx(dt) {
  if (g.tallyTimer > 0) g.tallyTimer = Math.max(0, g.tallyTimer - dt);
  if (g.comboFlash > 0) g.comboFlash = Math.max(0, g.comboFlash - dt);
  if (g.tierStamp > 0) g.tierStamp = Math.max(0, g.tierStamp - dt);
  if (g.shieldMsgTimer > 0) g.shieldMsgTimer = Math.max(0, g.shieldMsgTimer - dt);
  if (g.nitroFlash > 0) g.nitroFlash = Math.max(0, g.nitroFlash - dt);
  if (g.unleashFlash > 0) g.unleashFlash = Math.max(0, g.unleashFlash - dt);
  if (g.sandwichComboTimer > 0) g.sandwichComboTimer = Math.max(0, g.sandwichComboTimer - dt);
  if (g.explosion > 0) g.explosion = Math.max(0, g.explosion - dt);
  if (g.crashFx > 0) g.crashFx = Math.max(0, g.crashFx - dt);
  if (g.crashFlash > 0) g.crashFlash = Math.max(0, g.crashFlash - dt);
  if (g.perfectTimer > 0) g.perfectTimer = Math.max(0, g.perfectTimer - dt);
  if (g.scoreFlash > 0) g.scoreFlash = Math.max(0, g.scoreFlash - dt);
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
  if (consumePress("Touch") && g.goTime > RACE.retryGuard) { playAgain(); return; }
}

// ─── Render ──────────────────────────────────────────────────────────────────
function drawWorld() {
  const biome = g.biome || biomeAt(g.raceTime);
  const ns = dayNight(g.raceTime);
  Object.assign(SUN, sunShadow(biome, ns));   // which way every vehicle's shadow falls
  drawRoad(ctx, g.map, g.player.z, g.player.speed, biome);
  drawScenery(ctx, g.scenery, g.map, g.player.z);
  drawSmoke(ctx, g.map, g.player.z, g.player.x, g.player);
  drawTraffic(ctx, g.traffic, g.map, g.player.z, g.player.x);
  // Two phantoms, each at the position its run held at this point in time: the
  // global #1 (gold) and your own personal best (your livery). Rival is drawn
  // FIRST so your own ghost wins the pixels wherever the two overlap.
  if (g.rival) drawRivalGhost(ctx, g.rival, g.raceTime, g.map, g.player.z, g.player.x);
  if (g.ghost) drawGhost(ctx, g.ghost, g.raceTime, g.map, g.player.z, g.player.x);
  drawDistanceHaze(ctx, biome);   // atmosphere over the far field — cars emerge from it
  // ── NIGHT ── Everything above is darkened; the headlight beam is carved out of
  // that darkness, so the road and cars ahead show in true colour inside it.
  // Nothing is drawn at all in daylight.
  drawNightShade(ctx, ns, beamAnchor(g.player, g.map, ns));
  // Everything below is drawn AFTER the dark on purpose — it glows or must stay
  // readable: vehicle lamps, the booster canister, the helicopter's flaming
  // barrels and target reticles (a threat you can't see at night is a cheap
  // death), and your own car. In daylight this order changes nothing visible.
  drawNightLights(ctx, g.traffic, g.map, g.player.z, g.player.x, ns);
  drawPickups(ctx, g.pickups, g.map, g.player.z, g.player.x);
  drawCops(ctx, g.cops, g.map, g.player.z, g.player.x);
  drawPlayer(ctx, g.player, g.map);
  drawPlayerLights(ctx, g.player, g.map, ns);
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
  syncNitroButton();
  // Title screen also backs the name-entry and leaderboard modals.
  if (g.state === STATES.TITLE || g.state === STATES.NAME_ENTRY
      || g.state === STATES.LEADERBOARD || g.state === STATES.GARAGE) {
    const champ = g.champion;
    const rivalTag = (champ && champ.name && champ.name !== g.playerName) ? champ.name : null;
    drawTitleScreen(ctx, bestEverScore(), g.world, g.playerName, g.daily, rivalTag);
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
    // Crash impact — the shard burst at the car, then the red screen pop over it.
    if (g.crashFx > 0) {
      drawCrashImpact(ctx, 1 - g.crashFx / RACE.crashFxDur, g.crashX, PLAYER_Y);
    }
    if (g.crashFlash > 0) drawCrashFlash(ctx, 1 - g.crashFlash / RACE.crashFlashDur);
    // Zone-change flash — a one-shot dither pop that masks the biome palette cut.
    if (g.biomeFlash > 0) drawZoneFlash(ctx, 1 - g.biomeFlash / 0.22);
    // Fire flash — the same one-shot pop, the instant a nitrous boost is tapped.
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
    // J3: a thick flashing frame the instant a boost fires — a brief, static pop.
    if (g.nitroFlash > 0) {
      const c = (Math.floor(performance.now() / 40) % 2) ? 1 : 5;
      rect(ctx, 0, 9, W, 3, c);
      rect(ctx, 0, H - 25, W, 3, c);
      rect(ctx, 0, 9, 3, H - 34, c);
      rect(ctx, W - 3, 9, 3, H - 34, c);
    }
    drawCombo(ctx, comboMult(), g.comboTimer, RACE.comboWindow, g.tierStamp > 0);
    // The receipt yields the spot the moment a NEW chain earns the banner.
    if (comboMult() < 2) drawChainTally(ctx, g.tallyN, g.tallyPts, g.tallyTimer, RACE.chainTallySeconds);
    drawSandwichCombo(ctx, g.sandwichCombo, g.sandwichComboTimer);
    drawNitroMeter(ctx, {
      meter: g.nitroMeter, max: RACE.nitroNearMisses,
      cooldown: g.nitroCooldown, cooldownMax: RACE.nitroCooldownPasses,
      active: g.player.boost > 0,
      armed: g.nitroArmed,
      activeFrac: g.player.boost / RACE.nitroDuration,
    });
    if (g.perfectTimer > 0) drawPerfect(ctx, g.perfectTimer, (W / 2 + g.map.biasX + g.player.x) | 0);
    if (g.biomeBannerTimer > 0) drawBiomeBanner(ctx, g.biomeName, g.biomeBannerTimer,
      comboMult() >= 2 || g.tallyTimer > 0 || g.sandwichComboTimer > 0);
    if (g.shieldMsgTimer > 0) drawShieldMsg(ctx, g.shieldMsg, RECORD_MSGS.has(g.shieldMsg));
    drawHud(ctx, {
      score: g.scoreState.score,
      speed: g.player.speed,
      passed: g.traffic.passedCount,
      mapKind: g.map.key,
      time: g.raceTime,
      lives: g.player.lives,
      densityMul: g.densityMul,
      newBest: g.bestBeaten,
      scoreFlash: g.scoreFlash,
    });
    // Keep the steer-zone ripples for the first moment of the race (when the
    // player can finally act), fading out over ~1.5s.
    if (g.state === STATES.RACE && g.raceTime < 1.6) {
      drawSteerHints(ctx, Math.min(1, (1.6 - g.raceTime) / 0.8));
    }
    if (g.wreck > 0) drawWreckFade(ctx, 1 - g.wreck / RACE.wreckSeconds);
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
      nitros: g.nitrosUsed || 0,
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
