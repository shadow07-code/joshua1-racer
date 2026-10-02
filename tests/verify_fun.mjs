// Verifies the five-change "fun pass" against the REAL main.js (see harness.mjs).
globalThis.__EXTRA_EXPORTS = ["updateWreck", "coinNote"];
const H = await import("./harness.mjs");
const { M, REC } = H;
const { g, STATES } = M;
const { PALETTE, RACE, PHYS, W, H: CH, PLAYER_Y, SCORE, DAYNIGHT } = await import("../src/config.js");
const hud = await import("../src/hud.js");

const R = [];
const add = (label, pass, detail = "") => R.push([label, !!pass, detail]);
const WHITE = PALETTE[1], GOLD = PALETTE[5];
const within = (r, x0, y0, x1, y1) => r.x >= x0 && r.x <= x1 && r.y >= y0 && r.y <= y1;
// A fresh race, driven "blind" (no steering) for `settle` seconds to get up to
// speed. Invulnerable while settling: the opening is busy enough that a blind
// car WILL hit traffic. Then every test-relevant state is put back to clean.
const fresh = (settle = 0) => {
  H.seed(7); if (g.state !== STATES.TITLE) g.state = STATES.TITLE; H.tick(); H.startRace();
  for (let i = 0; i < Math.round(settle * 60); i++) { g.player.invuln = 99; g.player.lives = 3; H.tick(); }
  if (settle) {
    H.run(0.5);   // let any freeze / shove from the settle finish
    Object.assign(g.player, { invuln: 0, lives: 3, bounce: 0 });
    Object.assign(g, { combo: 0, comboTimer: 0, chainPts: 0, tallyTimer: 0, hitStop: 0, hitStopCool: 0, rampageMeter: 0, rampageArmed: false, crashFlash: 0, crashFx: 0 });
    g.smashFx.length = 0;
  }
};
const liveCar = () => g.traffic.list.find((c) => !c.smashed && !c.oncoming);
const sections = (process.argv[2] || "0123456789abc").split("");

// Isolate the road: no spawns, no wrong-way cars, no coins — only what a test places.
let SKIN = null;
function quietRoad() {
  SKIN = SKIN || (g.traffic.list.find((c) => !c.oncoming) || {}).skin;
  g.traffic.list = [];
  g.traffic.coins = [];
  g.traffic.nextRowZ = g.player.z + 1e6;
  g.traffic.nextOncomingZ = g.player.z + 1e6;
}
// One controlled near miss: a slow car 12px beside the player, driven past.
function nearMiss(dx = 12) {
  const c = { skin: SKIN, z: g.player.z + 3, x: g.player.x + dx, laneIdx: 0, speed: 5, cruise: 5,
    passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 };
  g.traffic.list.push(c);
  let n = 0;
  while (!c.nearMissed && n++ < 120) H.tick();
  return c.nearMissed;
}
const EMERALD = PALETTE[17];
const MAPS_CITY_HALF = (await import("../src/maps.js")).MAPS.city.roadHalfWidth;

// ═══ 0. IMPACT FREEZES SHOW THE IMPACT (pre-existing bug) ════════════════════
if (sections.includes("0")) {
  fresh(8);
  g.player.invuln = 0;
  const car = liveCar(); car.z = g.player.z + 1; car.x = g.player.x;
  H.tick();                                   // the crash frame: sets the 0.13 s freeze
  add("0a (setup) a survivable crash froze the game", g.hitStop > 0 && g.player.lives === 2);
  REC.on = true; REC.list = []; H.tick(); REC.on = false;   // a frame INSIDE the freeze
  const red = REC.list.filter((r) => r.c === PALETTE[6]).length;
  add("0b the freeze frame shows the red crash flash", red > 200, `${red} red cells`);
  add("0c ...and the white contact burst at the car", REC.list.some((r) => r.c === WHITE && Math.abs(r.y - PLAYER_Y) <= 8));
  // Tap-unleashed rampage: its 80 ms freeze must show the unleash flash.
  fresh(8);
  g.rampageArmed = true;
  M.unleashRampage();
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  const white = REC.list.filter((r) => r.c === WHITE && r.w === 2 && r.h === 2).length;
  add("0d the rampage unleash freeze shows its white flash", g.hitStop > 0 && white > 200, `${white} white cells, hitStop ${g.hitStop}`);
}

// ═══ 1. RAMPAGE SMASH — takedowns you can hear and see ═══════════════════════
if (sections.includes("1")) {
  fresh(6);
  g.player.rampage = 7; g.player.boost = 7;
  const s0 = H.audioCalls("sfxSmash").length, c0 = H.audioCalls("sfxCombo").length;
  const car = liveCar(); car.z = g.player.z + 2; car.x = g.player.x;
  REC.on = true; REC.list = [];
  H.tick();
  REC.on = false;
  add("1a rampage smash plays the crunch (sfxSmash) once", H.audioCalls("sfxSmash").length - s0 === 1);
  add("1b ...and still plays the combo blip", H.audioCalls("sfxCombo").length - c0 === 1);
  add("1c a contact burst is spawned at the hit", g.smashFx.length === 1 && Math.abs(g.smashFx[0].sy - PLAYER_Y) < 12, JSON.stringify(g.smashFx));
  const f = g.smashFx[0] || { sx: -99, sy: -99 };
  const near = REC.list.filter((r) => within(r, f.sx - 8, f.sy - 8, f.sx + 8, f.sy + 8));
  add("1d the burst is DRAWN on the frame of the hit (white pop)", near.some((r) => r.c === WHITE), `${near.length} rects near the hit`);
  H.run(RACE.smashFxDur + 0.05);
  add("1e the burst expires after smashFxDur", g.smashFx.length === 0);
  // Exit shockwave: two cars ahead get the takedown beat too, and score nothing.
  const sc = g.scoreState.score;
  const ahead = g.traffic.list.filter((c) => !c.smashed && !c.oncoming).slice(0, 2);
  ahead.forEach((c, i) => { c.z = g.player.z + 30 + i * 15; });
  g.player.rampage = 1 / 120;
  const s1 = H.audioCalls("sfxSmash").length;
  H.tick();
  add("1f exit shockwave: contact bursts on the cars it kicks out", g.smashFx.length >= 1, `${g.smashFx.length} bursts`);
  add("1g exit shockwave: the crunch is triggered for each car it kicks out", H.audioCalls("sfxSmash").length - s1 === g.smashFx.length, `${H.audioCalls("sfxSmash").length - s1} calls`);
  // Draw-only: burst never paints into the HUD strips.
  REC.on = true; REC.list = [];
  for (const p of [0, 0.1, 0.3, 0.6, 0.9]) hud.drawSmashBurst({ set fillStyle(v) { this.c = v; }, fillRect(x, y, w, h) { REC.list.push({ x, y, w, h, c: this.c }); } }, p, 80, PLAYER_Y);
  REC.on = false;
  add("1h burst stays local (within 22px of the hit)", REC.list.every((r) => Math.abs(r.x - 80) <= 22 && Math.abs(r.y - PLAYER_Y) <= 22));
  let none = 0; hud.drawSmashBurst({ set fillStyle(v) {}, fillRect() { none++; } }, 1, 80, PLAYER_Y);
  add("1i burst draws nothing once finished", none === 0);
}


// ═══ 2. CHAIN BANKED — a chain ends with a receipt ═══════════════════════════
if (sections.includes("2")) {
  fresh(6); quietRoad();
  const b0 = H.audioCalls("sfxChainBank").length;
  let ok = true;
  for (let i = 0; i < 6; i++) ok = nearMiss() && ok;
  add("2a six controlled combo near misses land", ok && g.combo === 6, `combo ${g.combo}`);
  const pts = g.chainPts;
  add("2b the chain tallies exactly what it scored (70+70+140+140+140+210)", pts === 770, `chainPts ${pts}`);
  add("2c no receipt while the chain is still alive", g.tallyTimer === 0);
  // Let it lapse. Watch the frame it banks.
  let n = 0;
  while (g.combo > 0 && n++ < 400) H.tick();
  add("2d the lapse banks it: CHAIN X6 +770", g.tallyN === 6 && g.tallyPts === 770 && g.tallyTimer > 0, `n ${g.tallyN} pts ${g.tallyPts} timer ${g.tallyTimer}`);
  const bank = H.audioCalls("sfxChainBank");
  add("2e ka-ching plays once, sized by the multiplier (x3)", bank.length - b0 === 1 && bank[bank.length - 1][1] === 3, JSON.stringify(bank.slice(b0)));
  add("2f chain points reset after banking", g.chainPts === 0);
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  add("2g first beat STAMPS in gold at the banner spot", REC.list.some((r) => r.c === GOLD && r.y === 11 && r.h === 11));
  H.run(0.3);
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  add("2h then settles: black plate with emerald trim", REC.list.some((r) => r.c === EMERALD && r.y === 11 && r.h === 1) && REC.list.some((r) => r.c === PALETTE[0] && r.y === 11 && r.h === 11));
  H.run(RACE.chainTallySeconds);
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  add("2i gone after chainTallySeconds", g.tallyTimer === 0 && !REC.list.some((r) => r.c === EMERALD && r.y === 11));
  // A short chain (below the x2 banner) gets nothing.
  const b1 = H.audioCalls("sfxChainBank").length;
  nearMiss(); nearMiss();
  n = 0; while (g.combo > 0 && n++ < 400) H.tick();
  add("2j a 2-long chain (never showed the banner) banks nothing", H.audioCalls("sfxChainBank").length === b1 && g.tallyTimer === 0);
  // A crash drops the chain with no receipt.
  for (let i = 0; i < 4; i++) nearMiss();
  const b2 = H.audioCalls("sfxChainBank").length;
  g.player.invuln = 0;
  M.takeHit(1.5);
  add("2k a crash zeroes the chain", g.chainPts === 0 && g.combo === 0);
  H.run(3.2);
  add("2l ...and never banks it", H.audioCalls("sfxChainBank").length === b2 && g.tallyTimer === 0);
  // A new chain takes the banner back from a showing receipt.
  for (let i = 0; i < 3; i++) nearMiss();
  n = 0; while (g.combo > 0 && n++ < 400) H.tick();
  add("2m (setup) a receipt is showing", g.tallyTimer > 0);
  for (let i = 0; i < 3; i++) nearMiss();
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  add("2n a new x2 chain takes the spot back (receipt hidden)", g.tallyTimer > 0 && !REC.list.some((r) => r.c === EMERALD && r.y === 11 && r.h === 1), `timer ${g.tallyTimer}`);
}

// ═══ 3. NEW BEST, LIVE — the record falls during the run, not after it ═══════
if (sections.includes("3")) {
  fresh();
  const hiKey = `joshua1.hiscore.v2.${g.scoreState.map}.${g.scoreState.difficulty}`;
  const raceWith = (hi, world) => {
    if (hi) H.LS.set(hiKey, String(hi)); else H.LS.delete(hiKey);
    g.state = STATES.TITLE; H.tick();
    g.world = world || { score: 0, name: "" };
    H.startRace(); H.tick();
  };
  const flour = () => H.audioCalls("playFlourish").length;
  const bestTag = () => REC.list.some((r) => r.c === EMERALD && r.y >= 2 && r.y <= 6 && r.x >= 56 && r.x <= 71);
  const goldMsg = () => REC.list.some((r) => r.c === GOLD && r.y >= ((CH * 0.40) | 0) - 2 && r.y <= ((CH * 0.40) | 0) + 14 && r.w <= 2);

  // First-ever run: nothing to beat.
  raceWith(0);
  let f0 = flour();
  g.scoreState.score = 5000; H.tick();
  add("3a first-ever run (no best yet): no call-out", !g.bestBeaten && g.shieldMsg !== "NEW BEST!" && flour() === f0);

  raceWith(3000);
  add("3b the run knows the best it is chasing", g.bestMark === 3000 && !g.bestBeaten);
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  add("3c no BEST tag before it is beaten", !bestTag());
  f0 = flour();
  g.scoreState.score = 2999.9; H.tick();
  add("3d crossing the best fires NEW BEST! the same frame", g.bestBeaten && g.shieldMsg === "NEW BEST!" && g.shieldMsgTimer > 1.9);
  add("3e ...with the flourish, once", flour() - f0 === 1);
  add("3f ...and the HUD score strobes", g.scoreFlash > 1.0);
  // The call-out blinks gold/white every 90 ms: sample both phases.
  let sawGold = false;
  for (let i = 0; i < 12 && !sawGold; i++) { REC.on = true; REC.list = []; H.tick(); REC.on = false; sawGold = goldMsg(); }
  add("3g the call-out is drawn in GOLD (not the power-up emerald)", sawGold);
  H.run(1.5);
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  add("3h a BEST tag rides beside the score afterwards", bestTag());
  H.run(2);
  add("3i it fires only once per run", flour() - f0 === 1 && g.scoreFlash === 0);
  add("3j the score itself is untouched by the call-out", g.scoreState.score > 3000 && g.scoreState.score < 3400, g.scoreState.score);

  // World #1: a different player, above your best.
  raceWith(3000, { score: 9000, name: "RIVAL" });
  add("3k world #1 above your best is chased", g.worldMark === 9000);
  g.scoreState.score = 2999.9; H.tick();
  f0 = flour();
  g.scoreState.score = 8999.9; H.tick();
  add("3l passing the world #1 fires WORLD RECORD!", g.worldBeaten && g.shieldMsg === "WORLD RECORD!" && flour() - f0 === 1);
  raceWith(3000, { score: 9000, name: g.playerName });
  add("3m no world call-out when the #1 is YOU", g.worldMark === 0);
  raceWith(3000, { score: 2000, name: "RIVAL" });
  add("3n no world call-out when #1 is below your own best", g.worldMark === 0);
  H.LS.delete(hiKey);
}

// ═══ 4. THE WRECK — the run-ending crash plays out before the results ═══════
if (sections.includes("4")) {
  // A survivable crash is unchanged: no wreck, the race goes on.
  fresh(6);
  g.player.invuln = 0; M.takeHit(1.5);
  add("4a a survivable crash does NOT start a wreck", g.wreck === 0 && g.state === STATES.RACE && g.player.lives === 2);

  await new Promise((r) => setTimeout(r, 30));   // let the Track-1 MP3 "decode"
  fresh(8);
  const t0 = H.audioCalls("tapeStopMusic").length, e0 = H.audioCalls("engineWindDown").length;
  const s0 = H.audioCalls("startMusic").length;
  g.player.lives = 1; g.player.invuln = 0;
  // A real fatal collision, through the real collision path.
  const car = liveCar(); car.z = g.player.z + 1; car.x = g.player.x;
  const z0 = g.player.z;
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  const score0 = g.scoreState.score, time0 = g.raceTime, passed0 = g.traffic.passedCount;
  add("4b the fatal hit starts the wreck instead of cutting to GAME OVER", g.state === STATES.RACE && g.wreck > 0 && g.player.lives === 0, `state ${g.state} wreck ${g.wreck}`);
  add("4c ...with the crash's impact freeze", g.hitStop > 0);
  add("4d music tape-stops and the engine winds down, once each",
    H.audioCalls("tapeStopMusic").length - t0 === 1 && H.audioCalls("engineWindDown").length - e0 === 1);
  // The crash flash + shards now actually render on the final crash.
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  const red = REC.list.filter((r) => r.c === PALETTE[6] || r.c === PALETTE[7]).length;
  add("4e the final crash's RED FLASH is finally drawn", red > 100, `${red} red rects`);
  add("4f the wreck is solid (no respawn blink)", g.player.invuln === 0);
  // Play it out, sampling as we go.
  const trafficZ0 = g.traffic.list.filter((c) => !c.smashed).map((c) => c.z);
  let frames = 0, sawFade = 0, firstFade = -1, maxYs = new Set();
  while (g.state === STATES.RACE && frames++ < 200) {
    REC.on = true; REC.list = []; H.tick(); REC.on = false;
    const ys = new Set(REC.list.filter((r) => r.c === PALETTE[0] && r.x === 0 && r.w === W && r.h === 1 && r.y !== CH - 1).map((r) => r.y));
    if (ys.size) { sawFade++; if (firstFade < 0) firstFade = frames; }
    if (ys.size > maxYs.size) maxYs = ys;
    if (frames === 20) {
      add("4g during the wreck: score, time and pass count are frozen",
        g.scoreState.score === score0 && g.raceTime === time0 && g.traffic.passedCount === passed0,
        `score ${score0}->${g.scoreState.score} time ${time0}->${g.raceTime} passed ${passed0}->${g.traffic.passedCount}`);
      const moved = g.traffic.list.filter((c) => !c.smashed).some((c, i) => trafficZ0[i] != null && Math.abs(c.z - trafficZ0[i]) > 0.05);
      add("4h ...while the world keeps moving (slow motion)", moved);
    }
  }
  const secs = frames / 60;
  add("4i results arrive after freeze + wreckSeconds", g.state === STATES.GAME_OVER && Math.abs(secs - (RACE.crashHitStop + RACE.wreckSeconds)) < 0.06, `${secs.toFixed(3)} s`);
  add("4j the car coasts only a few metres", g.player.z - z0 < 6 && g.player.z >= z0, `${(g.player.z - z0).toFixed(2)} m`);
  const want = new Set();
  for (let y = 0; y < CH; y += 4) for (const k of [0, 2, 1]) if (y + k !== CH - 1) want.add(y + k);
  const fadeAt = (firstFade / 60) - RACE.crashHitStop;
  add("4k the close to black starts ~55% into the wreck, not before", Math.abs(fadeAt - 0.55 * RACE.wreckSeconds) < 0.04, `${fadeAt.toFixed(3)} s`);
  add("4k2 ...and ends at 3 rows in every 4, exactly", [...want].every((y) => maxYs.has(y)) && maxYs.size === want.size, `${maxYs.size} vs ${want.size}`);
  add("4l the run's score is exactly what it was at impact", Math.floor(g.scoreState.score) === Math.floor(score0));
  // Audio automation actually scheduled (Track 1 is the default).
  const rate = H.AUDIO_LOG.find((l) => l.param === "playbackRate" && l.m === "exponentialRampToValueAtTime");
  add("4m Track 1 playback rate ramps down (tape-stop)", rate && rate.a[0] === 0.3, JSON.stringify(rate && rate.a));
  // Retry guard: a thumb still tapping just after the results appear is ignored...
  H.run(0.3); H.touch(); H.tick();
  add("4n a tap 0.3 s into the results does NOT retry", g.state === STATES.GAME_OVER);
  H.run(0.2); H.touch(); H.tick();
  add("4o a tap after retryGuard (0.45 s) retries", g.state === STATES.COUNTDOWN || g.state === STATES.RACE, g.state);
  // Pausing mid-wreck (the pause button, or the phone locking) must FINISH the
  // run — never leave a dead run paused where RESTART/QUIT would discard it.
  for (const how of ["pause button", "app backgrounded"]) {
    fresh(8);
    g.coins = 5;
    g.player.lives = 1; g.player.invuln = 0;
    const c2 = liveCar(); c2.z = g.player.z + 1; c2.x = g.player.x;
    H.tick(); H.run(0.3);
    const wallet0 = +(H.LS.get("joshua1.wallet.v1") || 0), sm = H.audioCalls("startMusic").length;
    if (how === "pause button") { for (const fn of document.getElementById("btn-pause")._l.click || []) fn({}); }
    else { H.key("", "blur"); }
    add(`4p ${how} mid-wreck goes straight to the results`, g.state === STATES.GAME_OVER, g.state);
    add(`4q ...with the run's coins banked (+5)`, +(H.LS.get("joshua1.wallet.v1") || 0) - wallet0 === 5, `${wallet0} -> ${H.LS.get("joshua1.wallet.v1")}`);
    add(`4r ...and no music revived`, H.audioCalls("startMusic").length === sm);
  }
  // Escape during the wreck can't dodge the banking either.
  fresh(8);
  g.player.lives = 1; g.player.invuln = 0;
  const c3 = liveCar(); c3.z = g.player.z + 1; c3.x = g.player.x;
  H.tick(); H.run(0.2);
  H.key("Escape"); H.key("Escape", "keyup");
  H.run(1.2);
  add("4s Escape mid-wreck still ends in the results (banked), not the title", g.state === STATES.GAME_OVER, g.state);
  if (g.state !== STATES.TITLE) { H.key("Escape"); H.key("Escape", "keyup"); H.tick(); }
}

// ═══ 5. COIN MELODY — the ideal line plays a tune ═══════════════════════════
if (sections.includes("5")) {
  // Spawned trails: the coins of one trail share one trail record.
  fresh(1);
  let shared = false;
  for (let i = 0; i < 3600 && !shared; i++) {
    H.tick();
    // Group live coins by trail record; a freshly spawned trail shows all n together.
    const groups = new Map();
    for (const c of g.traffic.coins) if (c.trail) groups.set(c.trail, (groups.get(c.trail) || 0) + 1);
    shared = [...groups].some(([tr, k]) => k === RACE.coinsPerTrail && tr.n === RACE.coinsPerTrail && tr.got === 0);
  }
  add("5a every spawned trail's coins share one {n, got} record", shared);

  fresh(6); quietRoad();
  const lay = (gaps, n = gaps.length) => {           // one trail of n coins, `gaps` metres apart
    const trail = { n, got: 0 };
    let z = g.player.z + 2;
    for (const d of gaps) { g.traffic.coins.push({ x: g.player.x, z, got: false, trail }); z += d; }
    return trail;
  };
  const steps = () => H.audioCalls("sfxCoin").map((c) => c[1]);
  const c0 = steps().length, t0 = H.audioCalls("sfxCoinTrail").length, coins0 = g.coins, score0 = g.scoreState.score;
  lay([14, 14, 14]);
  H.run(1.5);
  const got = steps().slice(c0);
  add("5b a trail of three climbs the scale: steps 0, 1, 2", JSON.stringify(got) === "[0,1,2]", JSON.stringify(got));
  add("5c taking the whole trail rings the chord, once", H.audioCalls("sfxCoinTrail").length - t0 === 1);
  add("5d coins and their value are unchanged (+3 coins)", g.coins - coins0 === 3);
  H.run(1.5);
  const c1 = steps().length;
  lay([14, 14, 14]);
  H.run(1.5);
  add("5e after a pause longer than coinStreakGap the run restarts at step 0", JSON.stringify(steps().slice(c1)) === "[0,1,2]", JSON.stringify(steps().slice(c1)));
  // A partial trail: 2 of 3 taken (the third sits off the line).
  H.run(1.5);
  const t1 = H.audioCalls("sfxCoinTrail").length;
  const tr = lay([14, 14], 3);
  g.traffic.coins.push({ x: g.player.x + 40, z: g.player.z + 30, got: false, trail: tr });
  H.run(1.5);
  add("5f a partial trail (2 of 3) gets no chord", H.audioCalls("sfxCoinTrail").length === t1 && tr.got === 2);
  // Two trails back to back join into one rising run, capped at the octave.
  H.run(1.5);
  const c2 = steps().length;
  const a = { n: 3, got: 0 }, b = { n: 3, got: 0 }, c = { n: 3, got: 0 };
  let z = g.player.z + 2;
  for (const tr2 of [a, b, c]) for (let i = 0; i < 3; i++) { g.traffic.coins.push({ x: g.player.x, z, got: false, trail: tr2 }); z += 12; }
  H.run(3);
  const run9 = steps().slice(c2);
  add("5g back-to-back trails join into one climbing run", JSON.stringify(run9) === "[0,1,2,3,4,5,6,7,8]", JSON.stringify(run9));
  let threw = false; try { (await import("./.gen/audio_spy.mjs")).sfxCoin(40); } catch (e) { threw = true; }
  add("5h steps past the octave are clamped safely", !threw);
  // The twinkle.
  const t2 = H.audioCalls("sfxCoinTrail").length;
  lay([12, 12, 12]);
  let n = 0; while (H.audioCalls("sfxCoinTrail").length === t2 && n++ < 200) H.tick();
  const cx = (W / 2 + g.map.biasX + g.player.x) | 0;
  REC.on = true; REC.list = []; H.tick(); REC.on = false;
  const sp = REC.list.filter((r) => r.w === 1 && r.h === 1 && Math.abs(r.x - cx) <= 12 && r.y >= PLAYER_Y - 14 && r.y <= PLAYER_Y + 6 && (r.c === WHITE || r.c === GOLD || r.c === PALETTE[21]));
  add("5i a completed trail pops a twinkle round the car", g.coinSparkle > 0 && sp.length >= 12, `${sp.length} sparkle px`);
  H.run(RACE.coinSparkleDur + 0.05);
  add("5j the twinkle expires", g.coinSparkle === 0);
}

// ═══ 6. SHAVES JUDGED HONESTLY — closest approach, against the real hitbox ═══
if (sections.includes("6")) {
  fresh(8); quietRoad();
  const EDGE = PHYS.carHalfWidth + (SKIN.w * SKIN.scale / 2) * 0.85 * 0.70;   // centre distance where hitboxes meet
  const shave = (daylight) => {
    H.run(0.6);                                   // clear the hit-stop throttle
    const w0 = H.audioCalls("sfxWhoosh").length, p0 = H.audioCalls("sfxPerfect").length, c0 = g.combo, pts0 = g.chainPts;
    const c = { skin: SKIN, z: g.player.z + 3, x: g.player.x + EDGE + daylight, laneIdx: 0, speed: 5, cruise: 5,
      passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 };
    g.traffic.list.push(c);
    let n = 0, stopped = false;
    while (!c.nearMissed && n++ < 120) H.tick();
    stopped = g.hitStop > 0;
    return { whoosh: H.audioCalls("sfxWhoosh").length - w0, perfect: H.audioCalls("sfxPerfect").length - p0,
      combo: g.combo - c0, pts: g.chainPts - pts0, stopped, lives: g.player.lives };
  };
  let r = shave(1);
  add("6a sprites touching (1 px daylight): PERFECT!, whoosh and the freeze", r.perfect === 1 && r.whoosh === 1 && r.stopped && r.combo === 1 && r.lives === 3, JSON.stringify(r));
  r = shave(4);
  add("6b close (4 px): whoosh, but no PERFECT and no freeze", r.whoosh === 1 && r.perfect === 0 && !r.stopped && r.combo === 1, JSON.stringify(r));
  r = shave(8);
  add("6c comfortable (8 px): a near miss, quietly (no whoosh)", r.whoosh === 0 && r.perfect === 0 && r.combo === 1, JSON.stringify(r));
  r = shave(18 - EDGE + 1);
  add("6d outside the old 18 px window: nothing", r.combo === 0 && r.whoosh === 0, JSON.stringify(r));
  // Score keeps its old scale: centre distance 12 px -> 60 x mult x (1 + 0.5 x 1/3) = 70.
  g.combo = 0; g.chainPts = 0; H.run(3);
  r = shave(12 - EDGE);
  add("6e score is unchanged: a 12 px pass pays exactly 70 at x1", r.pts === 70, JSON.stringify(r));
  // Ghosting THROUGH a car while invulnerable is contact, not a shave.
  H.run(3);
  g.player.invuln = 5;
  r = shave(-3);
  add("6f invulnerable pass-through (overlap) scores nothing and pops no PERFECT", r.combo === 0 && r.perfect === 0 && r.whoosh === 0 && r.lives === 3, JSON.stringify(r));
  g.player.invuln = 0;
  // The closest point counts, not whichever frame the check happened to read.
  H.run(3);
  {
    const w0 = H.audioCalls("sfxPerfect").length;
    const c = { skin: SKIN, z: g.player.z + 5, x: g.player.x + EDGE + 9, laneIdx: 0, speed: 5, cruise: 5,
      passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 };
    g.traffic.list.push(c);
    let dipped = false, n = 0;
    while (!c.nearMissed && n++ < 120) {
      const dz = c.z - g.player.z;
      if (!dipped && dz < 1) { c.x = g.player.x + EDGE + 1; dipped = true; }      // brushes it mid-pass
      else if (dipped && dz < -3) c.x = g.player.x + EDGE + 9;                     // then opens up again
      H.tick();
    }
    add("6g the CLOSEST point of the pass is what's judged (a mid-pass brush = PERFECT)", H.audioCalls("sfxPerfect").length - w0 === 1);
  }
  // Wrong-way cars are judged the same way as they flash past.
  H.run(3);
  {
    const c0 = g.combo, w0 = H.audioCalls("sfxWhoosh").length;
    const c = { skin: SKIN, z: g.player.z + 40, x: g.player.x + EDGE + 3, laneIdx: 0, speed: -27, cruise: null, oncoming: true,
      passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 };
    g.traffic.list.push(c);
    let n = 0; while (!c.nearMissed && n++ < 200) H.tick();
    add("6h a wrong-way shave is judged too (whoosh at 3 px)", g.combo === c0 + 1 && H.audioCalls("sfxWhoosh").length - w0 === 1 && g.player.lives === 3);
  }
}

// ═══ 7. CONTACT — a crash is two bodies meeting, and both react ═════════════
if (sections.includes("7")) {
  const setupHit = (dxOff, fromBehind = true, oncoming = false) => {
    fresh(10); quietRoad();
    const c = { skin: SKIN, z: g.player.z + (fromBehind ? 1 : 3), x: g.player.x + dxOff, laneIdx: 2, speed: oncoming ? -27 : 12,
      cruise: oncoming ? null : 12, oncoming, passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 };
    g.traffic.list.push(c);
    g.player.invuln = 0;
    return c;
  };
  // Rear-end, player slightly LEFT of the car's centre.
  let c = setupHit(2);
  const px0 = g.player.x, cx0 = c.x;
  H.tick();                                        // the crash frame
  add("7a (setup) crashed", g.player.lives === 2 && g.hitStop > 0);
  add("7b no teleport: the player hasn't jumped sideways on the crash frame", Math.abs(g.player.x - px0) < 1.5, `moved ${(g.player.x - px0).toFixed(2)} px`);
  const xsP = [], xsC = [];
  while (g.hitStop > 0) { H.tick(); xsP.push(g.player.x); }
  add("7c the impact freeze holds the moment of contact (nobody moves during it)", xsP.every((x) => Math.abs(x - px0) < 1.5));
  const spd0 = c.speed;
  for (let i = 0; i < 24; i++) { H.tick(); xsP.push(g.player.x); xsC.push(c.x); }
  const pMove = g.player.x - px0, cMove = c.x - cx0;
  add("7d the player is SHOVED clear, away from the car (~9 px, eased)", pMove < -7.5 && pMove > -10.5, `${pMove.toFixed(2)} px`);
  const steps = xsP.slice(-24).map((x, i, a) => (i ? Math.abs(x - a[i - 1]) : 0));
  add("7e ...over several frames, never more than 2.5 px in one", Math.max(...steps) <= 2.5 && steps.filter((d) => d > 0.2).length >= 4, `max step ${Math.max(...steps).toFixed(2)}`);
  add("7f the car you hit is jolted the OTHER way (~5 px) and stays in its lane", cMove > 4 && cMove < 5.5, `${cMove.toFixed(2)} px`);
  add("7g ...and, rear-ended, it is punted ahead", spd0 > 12 + RACE.crashKnockSpeed - 0.5, `speed ${spd0.toFixed(2)} (cruise 12)`);
  H.run(2.5);
  add("7h ...then settles back to its cruise", Math.abs(c.speed - 12) < 0.01, c.speed.toFixed(2));
  // Head-on with a wrong-way car: sideways jolt only.
  c = setupHit(-2, false, true);
  const hx0 = c.x;
  H.run(0.5);
  add("7i head-on (wrong-way): jolted sideways ~5 px, speed untouched", g.player.lives === 2 && Math.abs(c.speed + 27) < 1e-9 && c.x - hx0 < -4 && c.x - hx0 > -5.5, `moved ${(c.x - hx0).toFixed(2)}`);
  // The fatal hit: the shove still plays out, in slow motion, inside the wreck.
  c = setupHit(2);
  g.player.lives = 1;
  const pxF = g.player.x;
  H.tick();
  add("7j (setup) the fatal hit started the wreck", g.wreck > 0);
  const mid = [];
  while (g.state === STATES.RACE) { H.tick(); mid.push(g.player.x - pxF); }
  const half = mid[Math.floor(mid.length / 3)];
  add("7k in the wreck the shove plays in slow motion (partial after 1/3, most by the end)",
    half < -1 && half > -7 && mid[mid.length - 1] < -6.5, `1/3: ${half.toFixed(2)}  end: ${mid[mid.length - 1].toFixed(2)}`);
  // Knocks never shove a car off the tarmac, even from the outside lane.
  fresh(10); quietRoad();
  const edgeCar = { skin: SKIN, z: g.player.z + 1, x: MAPS_CITY_HALF - 8, laneIdx: 4, speed: 12, cruise: 12, passed: false, nearMissed: false,
    driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 };
  g.traffic.list.push(edgeCar);
  g.player.x = edgeCar.x - 4; g.player.invuln = 0;
  H.tick(); H.run(0.6);
  add("7l a knocked car never leaves the tarmac", edgeCar.x <= MAPS_CITY_HALF - 6 + 1e-9, edgeCar.x.toFixed(2));
}

// ═══ 8. CRASH RECOVERY lands in time — spawning restarts at the horizon ═════
if (sections.includes("8")) {
  const { VIEW_AHEAD } = await import("../src/road.js");
  fresh(60);
  const edge = () => g.player.z + VIEW_AHEAD + 2;
  const visible0 = new Set(g.traffic.list.filter((c) => c.z <= edge()));
  const all0 = new Set(g.traffic.list);
  // (5 m of margin: the crash frame itself moves everyone a metre or so.)
  const beyondSet = new Set(g.traffic.list.filter((c) => c.z > edge() + 5 && !c.oncoming && !c.smashed));
  const beyond0 = g.traffic.list.filter((c) => c.z > edge() && !c.oncoming && !c.smashed).length;
  const oncoming0 = new Set(g.traffic.list.filter((c) => c.oncoming));
  add("8a (setup) there is unseen traffic past the horizon", beyond0 > 0 && g.traffic.nextRowZ > edge() + 50, `${beyond0} cars, cursor +${(g.traffic.nextRowZ - g.player.z).toFixed(0)} m`);
  const car = liveCar(); const hitCar = g.traffic.list.find((c) => !c.smashed && !c.oncoming && c.z > g.player.z && c.z < edge());
  hitCar.z = g.player.z + 1; hitCar.x = g.player.x;
  const rows0 = g.traffic.rowsSpawned;
  H.tick();
  add("8b (setup) crashed", g.player.lives === 2);
  add("8c every car you could SEE is still there", [...visible0].every((c) => g.traffic.list.includes(c)));
  add("8d the unseen rows past the horizon were withdrawn", ![...beyondSet].some((c) => g.traffic.list.includes(c)), `${[...beyondSet].filter((c) => g.traffic.list.includes(c)).length} of ${beyondSet.size} remain`);
  add("8e wrong-way cars keep their own schedule (untouched)", [...oncoming0].every((c) => g.traffic.list.includes(c)));
  // New rows spawn on the next UPDATE — which the crash's impact freeze holds off.
  // (After a freeze the fixed-step accumulator can need one extra frame.)
  let guard = 0; while ((g.hitStop > 0 || guard === 0) && guard++ < 30) H.tick();
  const t0 = g.raceTime; guard = 0; while (g.raceTime === t0 && guard++ < 5) H.tick();
  const newRows = g.traffic.list.filter((c) => !all0.has(c) && !c.oncoming).sort((a, b) => a.z - b.z);
  const firstNew = newRows[0];
  add("8f spawning restarted AT the horizon", firstNew && firstNew.z - g.player.z < VIEW_AHEAD + 10, firstNew && `first new car at +${(firstNew.z - g.player.z).toFixed(1)} m`);
  const firstRowCars = newRows.filter((c) => Math.abs(c.z - firstNew.z) < 3).length;
  add("8g ...and it is the breather (one car)", firstRowCars === 1, `${firstRowCars} cars`);
  add("8h coins never survive half a trail", g.traffic.coins.every((c) => g.traffic.coins.filter((o) => o.trail === c.trail).length + (c.trail.got || 0) === c.trail.n || c.z <= edge()));
  // A second crash while the cursor is already at the horizon is a no-op.
  H.run(1.6);
  const n0 = g.traffic.list.length, cur0 = g.traffic.nextRowZ;
  const { pullSpawnToHorizon } = await import("../src/entities/traffic.js");
  g.traffic.nextRowZ = g.player.z + 50;
  pullSpawnToHorizon(g.traffic, g.player.z);
  add("8i nothing is withdrawn when the cursor is inside the horizon", g.traffic.list.length === n0 && g.traffic.nextRowZ === g.player.z + 50);
  g.traffic.nextRowZ = cur0;
}

// ═══ 9. LAST PRESS WINS — a second thumb turns the car instead of stopping it ═
if (sections.includes("9")) {
  const IN = await import("../src/input.js");
  const steer = () => IN.getInput().steer;
  const cv = document.getElementById("game");
  const touch = (type, id, x, y = 600) => { const ev = { changedTouches: [{ identifier: id, clientX: x, clientY: y }], preventDefault() {} }; for (const fn of cv._l[type] || []) fn(ev); };
  const pad = (side, type) => { const el = document.getElementById(side === "L" ? "btn-steer-left" : "btn-steer-right"); for (const fn of el._l[type] || []) fn({ preventDefault() {}, pointerId: 1 }); };
  IN.releaseAllInput();
  // Screen halves (the main mobile control).
  touch("touchstart", 1, 90);                        add("9a left half held: steer -1", steer() === -1);
  touch("touchstart", 2, 290);                       add("9b right thumb lands while left is held: steer +1 at once (was 0)", steer() === 1, steer());
  touch("touchend", 2, 290);                         add("9c lift the right: falls back to the left still held", steer() === -1);
  touch("touchstart", 3, 290); touch("touchend", 1, 90); add("9d lift the older left: stays right", steer() === 1);
  touch("touchend", 3, 290);                         add("9e both up: 0", steer() === 0);
  touch("touchstart", 4, 90);  touch("touchmove", 4, 290); add("9f a thumb sliding across the middle steers the new way", steer() === 1);
  touch("touchmove", 4, 290);                        add("9g ...and moving within a half doesn't re-order anything", steer() === 1);
  touch("touchend", 4, 290);
  touch("touchstart", 5, 290, 100);                  add("9h the neutral top band still never steers", steer() === 0);
  touch("touchend", 5, 290, 100);
  // Keyboard.
  H.key("ArrowLeft");  H.key("ArrowRight");          add("9i keys: right pressed while left held -> +1", steer() === 1);
  H.key("ArrowRight"); /* auto-repeat keydown */      add("9j key auto-repeat doesn't re-order", steer() === 1);
  H.key("ArrowLeft");  /* repeat of the older key */  add("9k ...even for the older key", steer() === 1);
  H.key("ArrowRight", "keyup");                      add("9l release right: back to left", steer() === -1);
  H.key("ArrowLeft", "keyup");                       add("9m keys up: 0", steer() === 0);
  // On-screen pads.
  pad("R", "pointerdown"); pad("L", "pointerdown");  add("9n pads: left pressed while right held -> -1 (was 0)", steer() === -1);
  pad("L", "pointerup");                             add("9o release left pad: back to right", steer() === 1);
  pad("R", "pointerup");                             add("9p pads up: 0", steer() === 0);
  // Mixed sources follow recency too.
  pad("L", "pointerdown"); touch("touchstart", 6, 290); add("9q pad left then screen right -> +1 (the pad used to always win)", steer() === 1);
  // Backgrounding still releases EVERYTHING.
  H.key("ArrowLeft");
  IN.releaseAllInput();                              add("9r releaseAllInput clears every held source", steer() === 0);
  touch("touchstart", 7, 90);                        add("9s ...and input works normally after it", steer() === -1);
  IN.releaseAllInput();
  // End to end: the measured reversal (3 px back) no longer depends on the overlap.
  fresh(15); quietRoad();
  const t = [];
  for (const overlap of [0, 150]) {
    g.player.x = 10; g.player.steerEased = 0;
    touch("touchstart", 11, 90); H.run(0.34);
    const x0 = g.player.x;
    touch("touchstart", 12, 290);
    let f = 0, lifted = false;
    while (g.player.x < x0 + 3 && f++ < 60) { if (!lifted && f * 16.67 >= overlap) { touch("touchend", 11, 90); lifted = true; } H.tick(); }
    touch("touchend", 11, 90); touch("touchend", 12, 290);
    t.push(Math.round(f * 16.67));
  }
  add("9t reversal takes the same time with a 150 ms thumb overlap as with none", t[0] === t[1] && t[0] <= 67, `${t[0]} ms vs ${t[1]} ms`);
}

// ═══ a. YOU HEAR WHICH SIDE — stereo-panned directional one-shots ═══════════
if (sections.includes("a")) {
  fresh(15); quietRoad();
  const EDGE = PHYS.carHalfWidth + (SKIN.w * SKIN.scale / 2) * 0.85 * 0.70;
  const lastPan = () => H.PANNERS.length ? H.PANNERS[H.PANNERS.length - 1].pan.value : null;
  const shaveAt = (dx) => {
    H.run(0.4);
    const c = { skin: SKIN, z: g.player.z + 3, x: g.player.x + dx, laneIdx: 0, speed: 5, cruise: 5,
      passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 };
    g.traffic.list.push(c);
    let n = 0; while (!c.nearMissed && n++ < 120) H.tick();
  };
  let p0 = H.PANNERS.length;
  shaveAt(-(EDGE + 3));
  add("a1 a close shave on the LEFT whooshes on the left", H.PANNERS.length > p0 && Math.abs(lastPan() + 0.6) < 1e-9, `pan ${lastPan()}`);
  p0 = H.PANNERS.length;
  shaveAt(EDGE + 3);
  add("a2 ...and on the RIGHT, on the right", H.PANNERS.length > p0 && Math.abs(lastPan() - 0.6) < 1e-9, `pan ${lastPan()}`);
  p0 = H.PANNERS.length;
  shaveAt(EDGE + 9);
  add("a3 a quiet near miss (no whoosh) makes no panner at all", H.PANNERS.length === p0);
  // Wrong-way horn in the far-right lane.
  H.run(1); p0 = H.PANNERS.length;
  const h0 = H.audioCalls("sfxHorn").length;
  g.player.x = -22;
  g.traffic.list.push({ skin: SKIN, z: g.player.z + 90, x: 44.8, laneIdx: 4, speed: -27, cruise: null, oncoming: true,
    passed: false, nearMissed: false, driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 });
  let n = 0; while (H.audioCalls("sfxHorn").length === h0 && n++ < 120) H.tick();
  const hornPan = H.audioCalls("sfxHorn").slice(-1)[0][1];
  add("a4 the wrong-way horn sounds from its lane (right of you -> right)", hornPan > 0.7 && hornPan <= 0.8, `pan ${hornPan}`);
  // Fence scrape on the right.
  H.run(1); g.player.x = 0;
  const b0 = H.audioCalls("sfxBump").length;
  g.player.x = MAPS_CITY_HALF - PHYS.carHalfWidth - 0.5;
  H.key("ArrowRight"); H.run(0.2); H.key("ArrowRight", "keyup");
  const bump = H.audioCalls("sfxBump").slice(b0);
  add("a5 hitting the RIGHT fence thuds on the right", bump.length === 1 && bump[0][1] === 0.7, JSON.stringify(bump));
  H.run(0.8);
  // Smash of a car on the left.
  g.player.x = 0; g.player.rampage = 3; g.player.boost = 3;
  const s0 = H.audioCalls("sfxSmash").length;
  g.traffic.list.push({ skin: SKIN, z: g.player.z + 1, x: -6, laneIdx: 2, speed: 5, cruise: 5, passed: false, nearMissed: false,
    driftVx: 0, pendingDriftVx: 0, signalT: 0, sigPhase: 0, closingVx: 0 });
  H.tick();
  const sm = H.audioCalls("sfxSmash").slice(s0);
  add("a6 a smash left of centre crunches on the left", sm.length === 1 && sm[0][1] < 0, JSON.stringify(sm));
  g.player.rampage = 0; g.player.boost = 0; H.run(0.5);
  // A browser with no StereoPannerNode: same sounds, mono, no crash.
  const AC = window.AudioContext.prototype, keep = AC.createStereoPanner;
  delete AC.createStereoPanner;
  let threw = false; p0 = H.PANNERS.length;
  try { shaveAt(-(EDGE + 3)); } catch (e) { threw = String(e); }
  AC.createStereoPanner = keep;
  add("a7 no StereoPannerNode (old browser): still whooshes, mono, no crash", !threw && H.PANNERS.length === p0, threw || "");
}

// ═══ b. TIMING TELLS — a chain about to lapse; invulnerability about to end ══
if (sections.includes("b")) {
  const pl = await import("../src/entities/player.js");
  const { MAPS } = await import("../src/maps.js");
  const rec = () => { const L = []; return { L, ctx: { set fillStyle(v) { this.c = v; }, get fillStyle() { return this.c; }, fillRect(x, y, w, h) { L.push({ x, y, w, h, c: this.c }); }, drawImage(i, x, y, w, h) { L.push({ x, y, w, h, c: "IMG" }); } } }; };
  const RED = PALETTE[6];
  // The test clock only ever moves FORWARD: winding it back stalls frame()
  // (negative dt) for every later section. Bases are multiples of 420 ms so
  // both the 60 ms blink and the 70 ms strobe start on a known phase.
  const fwd = (span) => { const b = Math.ceil((H.CLOCK.t + 1) / 420) * 420; H.CLOCK.t = b + span; return b; };
  const barColours = (timer) => {
    const out = new Set();
    const base = fwd(300);
    for (const ms of [0, 70, 140, 210]) {
      H.CLOCK.t = base + ms;
      const r = rec(); hud.drawCombo(r.ctx, 3, timer, RACE.comboWindow);
      for (const q of r.L) if (q.h === 1 && (q.y === 21 || q.y === 22) && q.w > 1) out.add(q.c);
    }
    return out;
  };
  let cs = barColours(2.0);
  add("b1 a healthy chain: no red/white strobe on the bar", !cs.has(RED) && !cs.has(WHITE), [...cs].join(","));
  cs = barColours(0.5);
  add("b2 in its last 0.7 s the bar strobes red AND white", cs.has(RED) && cs.has(WHITE), [...cs].join(","));
  cs = barColours(RACE.comboWarnSeconds + 0.01);
  add("b3 ...and not a beat before", !cs.has(RED));
  // The blink.
  const p = pl.makePlayer(); p.z = 100;
  const hiddenOf8 = (inv) => {
    let hidden = 0;
    const base = fwd(500);
    for (let b = 0; b < 8; b++) {
      H.CLOCK.t = base + b * 60 + 5;
      p.invuln = inv;
      const r = rec(); pl.drawPlayer(r.ctx, p, MAPS.city);
      if (!r.L.some((q) => q.c === "IMG")) hidden++;
    }
    return hidden;
  };
  add("b4 early invulnerability: hidden every other beat (4 of 8)", hiddenOf8(1.2) === 4, hiddenOf8(1.2));
  add("b5 the last 0.45 s: it firms up (hidden 2 of 8)", hiddenOf8(0.3) === 2, hiddenOf8(0.3));
  add("b6 not invulnerable: never hidden", hiddenOf8(0) === 0);
  // Lamps blink in step with the car.
  const ns = { dark: 1, on: true, since: 5 };
  let mismatch = 0;
  const base7 = fwd(1000);
  for (const inv of [1.2, 0.3]) for (let b = 0; b < 8; b++) {
    H.CLOCK.t = base7 + (inv > 1 ? 0 : 500) + b * 60 + 5; p.invuln = inv;
    const a = rec(); pl.drawPlayer(a.ctx, p, MAPS.city);
    const l = rec(); pl.drawPlayerLights(l.ctx, p, MAPS.city, ns);
    if ((a.L.some((q) => q.c === "IMG")) !== (l.L.length > 0)) mismatch++;
  }
  add("b7 the tail lamps blink exactly with the car", mismatch === 0, mismatch);
}

// ═══ c. THE ELEVATE — a silver SUV starter in the garage ════════════════════
if (sections.includes("c")) {
  const GA = await import("../src/garage.js");
  const SP = await import("../src/sprites.js");
  const E = SP.SPR_ELEVATE, F = SP.SPR_FERRARI_BASE;
  const keep = ["joshua1.wallet.v1", "joshua1.cars.v1", "joshua1.car.v1"].map((k) => [k, H.LS.get(k)]);
  const reset = (wallet, owned, pick) => {
    H.LS.set("joshua1.wallet.v1", String(wallet));
    if (owned) H.LS.set("joshua1.cars.v1", owned); else H.LS.delete("joshua1.cars.v1");
    if (pick) H.LS.set("joshua1.car.v1", pick); else H.LS.delete("joshua1.car.v1");
    GA.setSelectedId(GA.getSelectedId());          // (touch the memo; re-read below)
  };
  // Sprite: same footprint and lamp positions as the Ferrari, valid palette only.
  add("c1 10x15, the Ferrari's footprint", E.length === 15 && E.every((r) => r.length === 10));
  add("c2 tail lamps on row 13 at cols 2-3 / 6-7, where the night lamps paint", [2, 3, 6, 7].every((c) => E[13][c] === 9 && F[13][c] === 9));
  add("c3 only real palette colours", E.flat().every((v) => v === -1 || (Number.isInteger(v) && v >= 0 && v < PALETTE.length)));
  add("c4 left/right symmetric apart from the windshield glint", E.every((r, y) => r.every((v, x) => v === r[9 - x] || (y === 4 && (x === 3 || x === 6)))));
  add("c5 it is silver (light grey body), not a repaint", E.flat().filter((v) => v === 2).length >= 20 && GA.carSprite("elevate") === E);
  // A brand-new player: owned from the start, never auto-unlocked or auto-equipped.
  reset(0, null, null);
  add("c6 new player: ELEVATE is owned from the first run", GA.ownedIds().includes("elevate") && GA.ownedIds().includes("rosso"));
  add("c7 ...the next car to work toward is still MIDNIGHT", GA.nextLocked().id === "midnight");
  add("c8 ...and banking a run never 'unlocks' or auto-equips it", GA.claimUnlocks().length === 0);
  add("c9 it can be picked in the garage and becomes the driven sprite", GA.setSelectedId("elevate") && GA.selectedSprite() === E);
  GA.setSelectedId("rosso");
  // The price ladder is untouched: 10000 coins still buys the five priced cars, 3250 left.
  reset(10000, null, "rosso");
  const got = GA.claimUnlocks().map((c) => c.id).join(",");
  add("c10 ladder unchanged: 10000 coins -> midnight..chrome, 3250 left", got === "midnight,jade,phantom,sunburst,chrome" && GA.getWallet() === 3250, `${got} / ${GA.getWallet()}`);
  // An existing player's save (no elevate in it) and a corrupt one.
  reset(40, JSON.stringify(["rosso", "midnight"]), "midnight");
  add("c11 existing save: gains ELEVATE, keeps its equipped car", GA.ownedIds().includes("elevate") && GA.isOwned("midnight"));
  H.LS.set("joshua1.cars.v1", "{not json");
  add("c12 corrupt save: still owns both starters", GA.ownedIds().includes("elevate") && GA.ownedIds().includes("rosso"));
  // Drive it: a full race past nightfall with the ELEVATE equipped.
  reset(0, null, null);
  GA.setSelectedId("elevate");
  fresh(0);
  let drew = 0, visible = 0, lamps = 0, err = null;
  try {
    for (let i = 0; i < 50 * 60; i++) {
      g.player.invuln = 99; g.player.lives = 3;     // (so it blinks: only count visible beats)
      REC.on = (i % 97 === 0) || i === 50 * 60 - 1; REC.list = [];
      H.tick();
      if (REC.on && Math.floor(H.CLOCK.t / 60) % 2 !== 0) {
        visible++;
        if (REC.list.some((r) => r.c === "IMG" && Math.abs(r.y - (PLAYER_Y - 8)) <= 1)) drew++;
        if (g.raceTime > 44 && REC.list.some((r) => r.c === PALETTE[9] && r.w === 2 && r.h === 2 && Math.abs(r.y - PLAYER_Y) < 10)) lamps++;
      }
    }
  } catch (e) { err = String(e && e.stack || e); }
  REC.on = false;
  add("c13 a 50 s race with the ELEVATE runs clean and draws it on every visible beat", !err && visible >= 8 && drew === visible, err || `${drew}/${visible} frames`);
  add("c14 ...and its tail lamps light at night", lamps >= 1, lamps);
  add("c15 its personal-best ghost works (masked copy of the SUV)", SP.ghostSprite(E).length === 15 && SP.ghostSprite(E) !== E);
  GA.setSelectedId("rosso");
  for (const [k, v] of keep) { if (v == null) H.LS.delete(k); else H.LS.set(k, v); }
}

// ═══ report ══════════════════════════════════════════════════════════════════
let fail = 0;
for (const [l, p, d] of R) { if (!p) fail++; console.log((p ? "PASS " : "FAIL ") + l + (d && !p ? "   -- " + d : "")); }
console.log(`\n${R.length - fail}/${R.length} passed`);
process.exit(fail ? 1 : 0);
