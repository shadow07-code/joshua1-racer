// Global config — palette, dimensions, tunables.

// Expanded palette with shading tones for richer sprite work.
export const PALETTE = [
  "#000000", //  0 black (outlines)
  "#FFFFFF", //  1 white (highlights, dashes, road edges)
  "#D8D8D8", //  2 light gray (asphalt highlight)
  "#7C7C7C", //  3 mid gray (asphalt)
  "#404040", //  4 dark gray (asphalt shadow)
  "#FCC418", //  5 yellow (lane dashes, headlights, taxi)
  "#E40058", //  6 player red
  "#8C1810", //  7 dark red (player shadow)
  "#FC7460", //  8 light red (player highlight)
  "#E45C10", //  9 orange (taillights, hazard stripes)
  "#22B814", // 10 grass green
  "#0F6E0C", // 11 dark green (jungle bg, tree leaves)
  "#5C94FC", // 12 sky blue (UI panels)
  "#80D0FC", // 13 light blue (windshield)
  "#FCBCB0", // 14 pink (skin / blossom)
  "#A05CFC", // 15 purple
  "#1078E0", // 16 mid blue (kept for cockpit visor)
  "#04A058", // 17 emerald green
  "#B07028", // 18 brown (palm trunk)
  "#6E4814", // 19 dark brown (shadow)
  "#3CB046", // 20 mid green (bush)
  "#FCE070", // 21 light yellow (sand / accent)
  "#A04020", // 22 truck rust orange
  "#202830", // 23 deep gray (bus)
  "#6488A0", // 24 muted blue gray (sedan)
  "#E0D8C0", // 25 cream (van / road shoulder dust)
];

// Logical canvas. Width is fixed (gameplay is tuned around a 160-wide field);
// height adapts to the device's portrait aspect ratio so the canvas fills the
// screen edge-to-edge with no letterbox bars and no pixel distortion. A taller
// screen simply shows more road ahead — the view-ahead distance (metres) is
// unchanged, so difficulty stays the same. Clamped to a sane band, with a 2:3
// fallback when there's no window (e.g. off-DOM / tests).
export const W = 160;
function computeH() {
  if (typeof window === "undefined") return 240;
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (!vw || !vh) return 240;
  return Math.max(240, Math.min(380, Math.round(W * (vh / vw))));
}
export const H = computeH();

export const PHYS = {
  startSpeed: 14,
  // Internal max-speed. The HUD always shows km/h as speed/maxSpeed * topSpeedKmh,
  // so the top of the bar reads 200 regardless of this value — lowering it just
  // slows the actual road-scroll (the main lever against the high-speed "dizzy"
  // feeling). 135 → 108 → 81 → 65 (a further -20%). cruiseSpeed tracks it so
  // traffic stays proportionally paced (relative speeds unchanged).
  maxSpeed: 65,
  cruiseSpeed: 65,
  // Nitrous overspeed during RAMPAGE — speed is allowed up to maxSpeed*boostFactor
  // while the player.boost timer is running, for a real "kick" out of the boost.
  boostFactor: 1.10,
  // Three-phase ramp with a KNEE at 150 km/h where the climb rate HALVES:
  //   0 → 100 km/h over `rampPhase1Seconds` — punchy launch.
  //   100 → 150 km/h over `rampPhase2Seconds` — moderate mid climb.
  //   150 → 200 km/h at `rampUpperRateFactor`× the mid rate — a slow grind to top.
  rampPhase1Seconds: 4,
  rampPhase2Seconds: 40,
  rampUpperRateFactor: 0.5,   // accel above 150 km/h = 50% of the 100→150 rate
  accel: 14,
  drag: 5,
  fenceBounce: 7,          // px the car springs back inward after hitting an edge
  fenceSpeedKeep: 0.88,    // speed retained on a fence bump (slight reduction)
  steerSpeed: 112,        // slightly gentler per input (was 120) for finer cuts
  // Ease the EFFECTIVE steer in from rest so a light touch makes a small, smooth
  // cut; releasing or flicking the other way snaps fast (×3.5) so a deliberate
  // hard left/right and emergency reversals stay responsive. Higher = snappier.
  steerEase: 16,
  steerSpeedFactor: 0.65,
  // ── DASH ── A committed sidestep: double-tap a side (or double-tap an arrow
  // key) and the car snaps across roughly a lane. It's the game's SECOND VERB —
  // steering is a continuous axis, this is a discrete, timed commitment. You
  // cannot steer while dashing, so it's a real decision, not a free upgrade.
  dashSpeed: 150,        // px/s lateral while dashing — covers ~1 lane in dashTime
                         // (~2× normal steering, so it's worth using but never a teleport)
  dashTime: 0.16,        // seconds the dash lasts
  dashCooldown: 1.1,     // seconds before another dash is available
  dashWindowMs: 320,     // max gap between the two taps to count as a double-tap
  carHalfWidth: 5,    // matches the smaller 10×15 player sprite (was 6)
  carHalfHeight: 7,   // was 8
  // Display: top speed shows as 200 KMH; 100 km/h marker used for ramp phase split.
  topSpeedKmh: 200,
  phase1Kmh: 100,
  kneeKmh: 150,    // above this displayed km/h, acceleration halves (rampUpperRateFactor)
};

// Player car sits in the lower third (not jammed against the bottom edge) so
// there's foreground road below it and more breathing room to read traffic.
// Raised from 0.74 → 0.68 to clear the floating steering joystick at the bottom.
export const PLAYER_Y = Math.round(H * 0.68);

// Endless survival mode.
export const RACE = {
  startLives: 3,
  countdownSeconds: 3,
  // After player reaches maxSpeed, traffic density scales up by this fraction
  // every densityStepSeconds, compounding — capped so the road never becomes
  // unwinnable.
  densityStepSeconds: 50,       // ramp bites a bit sooner
  densityStepIncrement: 0.10,   // traffic gets +10% denser each interval
  densityMax: 1.9,
  // Two staged density bumps for escalation (the gap lane is still left open each
  // row, so it stays maneuverable): at 150 km/h → +20%, and 30 s after the player
  // organically reaches top speed → a further +20%.
  density150Bump: 1.20,
  densityTopBump: 1.20,
  densityTopBumpDelay: 30,
  density2CarFrom: 1.12,        // above this density, some rows spawn a 2nd car
  // ~this fraction of (non-opening) rows flank the gap lane with a car on EACH
  // side, so the player can lane-split the gap for a SANDWICH (threading). The
  // gap stays open, so every row is still solvable — it's just a tempting line.
  threadRowChance: 0.30,
  // Lateral px window for sandwich detection — wide enough that splitting a gap
  // lane flanked by cars (≈2 lanes / 45px apart) registers as a sandwich.
  sandwichDetectPx: 48,
  trafficSidewaysChance: 0.8,   // chance a car actually changes lane on its timer (was 0.6)
  topSpeedThreshold: 0.95,
  // Police helicopter chase: a chopper flies in once the player crosses this KMH
  // and starts dropping flaming barrels. Re-tuned 250 → 150 so the air threat
  // shows up mid-run rather than only at the (now lower) 200 km/h top speed.
  copTriggerKmh: 150,
  copTopSpeedFrac: 0.92,    // cops max out at 92% of player's max speed
  copRamSlowdown: 0.35,     // multiplier on player speed when a cop rams from behind
  copSpawnGapZ: 30,         // initial distance behind the player
  // Near-miss rewards, two tiers:
  //   below comboKmh — every close shave pays a flat, discreet bonus (no combo);
  //   at comboKmh+   — NEAR MISS COMBO territory: each shave bumps the
  //   multiplier, resetting after comboWindow seconds without another, and
  //   fills the rampage meter (see below).
  comboKmh: 100,
  comboWindow: 2.8,
  // RAMPAGE pacing: an unbroken chain of `rampageNearMisses` combo-tier near
  // misses fills the nitro meter and ARMS the rampage — the player then taps the
  // top of the screen to unleash it when THEY choose. When a rampage ends the
  // meter is LOCKED until `rampageCooldownPasses` cars have been passed — no
  // back-to-back rampages. 14 (was 10): earning it should feel like a feat.
  rampageNearMisses: 14,
  rampageCooldownPasses: 10,
  // RAMPAGE: a nitrous boost where the car smashes through traffic (each smash
  // adds to the combo). When it ends, an instantaneous shockwave from the car
  // kicks out just the next 2 vehicles ahead — room to maneuver, no long clear.
  rampageDuration: 7,      // seconds of nitrous smashing
  rampageClearTime: 0,     // no clear-road grace — the exit shockwave is instantaneous
  rampageClearDist: 120,   // search range for the exit shockwave (next 2 cars within this)
  // Tension/release pacing: traffic spacing breathes ±densityWaveAmp around the
  // ramped base on a densityWavePeriod-second cycle (surge → breather → surge).
  densityWaveAmp: 0.18,
  densityWavePeriod: 22,
  // Endless non-lethal oil slicks — one every [min..max] metres of road.
  oilSpacingMin: 260,
  oilSpacingMax: 440,
  // Distance milestone banner cadence (metres). Speed milestones are fixed.
  milestoneEveryM: 1000,
  // RAMPAGE booster pickups — VERY rare, and only after the player has reached
  // 150 km/h (the unlock is gated in main.js). Once unlocked, one spawns every
  // [min..max] metres of road — a long way apart so they're a treat, not a crutch.
  boosterSpacingMin: 1800,
  boosterSpacingMax: 3400,
  // Coins: ~this fraction of spawned rows also drops a short coin trail down the
  // OPEN gap lane (the ideal weaving line), coinsPerTrail coins spread in z.
  coinRowChance: 0.20,
  coinsPerTrail: 3,
  // Biome cycling: the scene changes (city → tunnel → coast → bridge) every this
  // many seconds of a run — visual freshness + "how far did I get" landmarks.
  biomePeriodSec: 50,
  // ── WRONG-WAY (oncoming) traffic ──
  // A lone car comes the other way down a lane well clear of the racing line.
  // It closes at roughly double the speed of overtaken traffic, so it must be
  // read EARLY — the main answer to "the player is never truly cornered".
  // Gated so it only shows up once the run has real pace.
  oncomingFromKmh: 120,
  oncomingSpacingMin: 420,   // metres of road between wrong-way cars
  oncomingSpacingMax: 900,
  oncomingSpeedMul: 0.42,    // × cruiseSpeed, TOWARD the player
  // Metres out at which the wrong-way car sounds its horn. Deliberately SHORT:
  // there's no HUD warning — the car ambushes you, and the horn lands as it
  // bears down (~0.8s out at racing speed), so it's a shock, not an alert.
  oncomingHornDist: 70,
  // ── CLOSING GAPS ──
  // Occasionally the two cars flanking the open lane squeeze toward each other.
  // They hold station until the player is within closingTriggerZ, so the squeeze
  // is a TIMING test (commit early or bail), never an unwinnable spawn. The
  // adjacent flow lane always stays open as the escape hatch.
  closingRowChance: 0.16,
  closingTriggerZ: 58,       // metres ahead at which the squeeze engages
  closingRate: 7,            // px/s each flanker moves inward
  // ── RISK GATES ──
  // The one place the player CHOOSES to take risk instead of only reacting to it.
  // A walled row parks a gold gate in the lane right beside the guaranteed gap:
  // ignore it and take the free safe line, or thread the gate's narrow slot for a
  // fat coin stack + a combo beat. Clipping a post costs a life. Optional by
  // construction (the gap is still open), telegraphed by chevrons painted up the
  // lane ~2 rows early, and it pays COINS + COMBO only — never speed, lives or
  // rampage, which would corrupt the global leaderboard (same rule as the garage).
  gateFromKmh: 110,          // unlocks once the run has some pace (before wrong-way)
  gateRowChance: 0.11,       // weight in the phrase director (measured: ~1 gate per 17s
                             // of non-event road, ~1 per 26s once events take their share)
  gateSlotHalf: 8,           // px half-width of the drive-through slot (car half is 5)
  gateHalfZ: 3,              // metres half-depth of the barrier
  gateChevrons: 3,           // approach markers painted up the gate lane
  gateChevronGap: 18,        // metres between them — the ~2-row early telegraph
  gateCoins: 25,             // coins paid for threading it (a coin TRAIL is 3)
  // ── IN-RUN EVENTS ── Named, time-boxed set-pieces (RUSH HOUR / CONVOY /
  // WRONG WAY) that give a run an arc instead of a flat density ramp. Each
  // re-weights systems that already exist, announces itself, and pays out if
  // you get through it without crashing.
  eventFirstAt: 32,      // seconds before the first event of a run
  eventGapMin: 30,       // quiet stretch between events
  eventGapMax: 44,
  // Minimum gap between hit-stops. At speed, rows arrive every ~0.35s, so an
  // unthrottled 60ms freeze per tight shave reads as STUTTER instead of impact.
  // This keeps it a rare accent (the whoosh/PERFECT feedback still fires every time).
  hitStopCooldown: 0.45,
  // After a crash the next couple of spawned rows are forced open, so the player
  // isn't dropped straight back into the pattern that just killed them.
  crashBreatherRows: 2,
};

// Spawn rates and traffic-row spacing.
export const SPAWN = {
  // Slightly denser baseline so there's always meaningful weaving to do.
  // Row-based — each row leaves one open lane the player can steer to.
  trafficRowGapCity: 72,
  trafficRowGapJungle: 70,  // unused (jungle removed) — kept for safety
  sceneryPerMeter: 0.22,
  aiInitial: 0,
};

// Scoring — rebuilt so the score scales SANELY instead of exploding. The old
// system multiplied an UNCAPPED combo onto every near-miss/pass/smash (and those
// events kept raising it), a feedback loop that reached tens of millions. Now the
// combo multiplier is CAPPED, frequent events (passes) are flat, and distance +
// survival form a steady backbone — a strong run lands ~80–250k, not millions.
export const SCORE = {
  // ── Steady backbone ──
  distanceWeight: 1.0,     // points per metre travelled (the run's spine)
  survivalSecondBonus: 8,  // per second alive
  passBonus: 8,            // FLAT per car passed — no multiplier (passes are filler)
  cityBonus: 1.0,
  jungleBonus: 1.25,
  mediumBonus: 1.0,
  hardBonus: 1.5,
  // ── Skill beats (scaled by the CAPPED combo multiplier) ──
  // The combo streak still counts up, but the SCORING multiplier is bounded:
  //   mult = min(comboMultMax, 1 + floor(streak / comboPerStep))   → ×1 … ×8
  // so a long unbroken chain can't run the score away.
  comboMultMax: 8,
  comboPerStep: 3,         // +1 to the multiplier every 3 chained beats
  nearMissBonus: 60,       // combo-tier near-miss base   (× mult × precision)
  nearMissLowBonus: 40,    // flat near-miss below comboKmh (no multiplier)
  smashBonus: 120,         // per rampage smash           (× mult)
  // Precision (tightness) bonus on a combo near-miss: 1 → 1 + precisionMax.
  precisionMax: 0.5,
  precisionPx: 8,
  // Splitting a tight 2-car gap (a "sandwich"): a flat bonus that ALSO advances
  // the combo streak (no separate uncapped multiplier any more).
  sandwichBonus: 150,
  // COINS scattered along the ideal weaving line — each grabbed coin pays this
  // (a light bonus; the count also shows at game over and feeds a future garage).
  coinValue: 50,
  // Threading a RISK GATE — a flat bonus × the capped combo multiplier, on top of
  // the coin stack. Scored like a sandwich (the other "deliberate line" beat).
  gateBonus: 300,
};

// Game-over LETTER GRADE by final score — the instant "did I do well?" verdict
// that triggers the retry reflex. Tuned to the rebuilt scoring (a strong ~2-min
// run ≈ 100k): S is aspirational, C is the encouraging floor (never "fail").
// [minScore, letter, qualifier, paletteIdx]
export const GRADES = [
  [130000, "S", "LEGENDARY!", 5],    // gold
  [70000,  "A", "GREAT RUN",  17],   // emerald
  [30000,  "B", "SOLID",      13],   // light blue
  [0,      "C", "KEEP GOING", 2],    // light gray
];

export const MUSIC = {
  cityBPM: 150,
  jungleBPM: 132,
  bpmSwingPct: 0.10,
};

// Wide multi-lane road.
export const ROAD = {
  cityHalfWidth: 56,
  jungleHalfWidth: 52,
};

// No brake key — game auto-accelerates throughout. Down arrow is unused.
export const KEYS = {
  left:  ["ArrowLeft", "a", "A"],
  right: ["ArrowRight", "d", "D"],
  mute:  ["m", "M"],
  pause: ["p", "P", " "],
  back:  ["Escape"],
  enter: ["Enter", " "],
};
