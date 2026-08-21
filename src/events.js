// In-run EVENTS — named, time-boxed set-pieces that give a run an ARC.
//
// Without these a run is a flat density ramp: minute 3 is minute 1 with more
// cars, with nothing to anticipate and nothing memorable to retell. An event
// announces itself, changes the rules for ~20s, and pays out if you get through
// it clean — so a run becomes a sequence of beats ("I made it to the third
// WRONG WAY") instead of one long smear.
//
// Every event is a RE-WEIGHTING of systems that already exist (the phrase
// director, densityMul, the oncoming cursor, the skin pool) — no new mechanics,
// and the guaranteed-gap invariant is never touched, so events are intense but
// always solvable.
import { RACE } from "./config.js";

// `density`      — multiplies the run's current density for the duration
// `phrase`       — forces the traffic phrase (skips the director)
// `trucksOnly`   — draw traffic from the truck pool
// `oncomingMul`  — multiplies wrong-way spacing (lower = more of them)
// `comboSafe`    — the combo streak can't lapse while it runs
// `minKmh`       — won't fire until the run has reached this speed
export const EVENTS = [
  {
    id: "rush", name: "RUSH HOUR", dur: 22, idx: 9,
    density: 1.4,
    score: 400, coins: 15,
    minKmh: 0,
  },
  {
    id: "convoy", name: "CONVOY", dur: 20, idx: 25,
    phrase: "slalom", trucksOnly: true, comboSafe: true,
    score: 350, coins: 12,
    minKmh: 0,
  },
  {
    id: "wrongway", name: "WRONG WAY", dur: 18, idx: 6,
    oncomingMul: 0.34,          // ~3× the usual rate of wrong-way cars
    score: 500, coins: 20,
    // Pointless before wrong-way traffic unlocks, so it waits for the same gate.
    minKmh: RACE.oncomingFromKmh,
  },
];

export function makeEventDirector() {
  return {
    active: null,        // the running event def, or null
    timeLeft: 0,
    total: 0,            // duration of the running event (drives the HUD bar)
    nextAt: RACE.eventFirstAt,
    lastId: null,        // avoid firing the same event twice in a row
    failed: false,       // crashed during this event -> no payout
    bannerT: 0,          // "RUSH HOUR" announcement timer
    clearT: 0,           // "CLEARED +400" payout timer
    clearMsg: "",
    clearIdx: 5,
  };
}

// Advance the director. Returns { started } or { ended, failed } on a
// transition, otherwise null, so the caller can fire SFX and pay out.
export function updateEvents(dir, dt, raceTime, topSpeedKmh) {
  if (dir.bannerT > 0) dir.bannerT = Math.max(0, dir.bannerT - dt);
  if (dir.clearT > 0) dir.clearT = Math.max(0, dir.clearT - dt);

  if (dir.active) {
    dir.timeLeft -= dt;
    if (dir.timeLeft > 0) return null;
    const ev = dir.active;
    const failed = dir.failed;
    dir.active = null;
    dir.timeLeft = 0;
    dir.nextAt = raceTime + RACE.eventGapMin +
      Math.random() * (RACE.eventGapMax - RACE.eventGapMin);
    return { ended: ev, failed };
  }

  if (raceTime < dir.nextAt) return null;
  // Hard speed gate: nothing fires until the run is flat out. Re-armed a few
  // seconds out so the first event lands just AFTER top speed rather than
  // exactly on it — reaching 200 gets a beat to itself first.
  if (topSpeedKmh < RACE.eventFromKmh) { dir.nextAt = raceTime + 4; return null; }
  const pool = EVENTS.filter(e => topSpeedKmh >= (e.minKmh || 0) && e.id !== dir.lastId);
  if (!pool.length) { dir.nextAt = raceTime + 6; return null; }   // retry shortly
  const ev = pool[Math.floor(Math.random() * pool.length)];
  dir.active = ev;
  dir.lastId = ev.id;
  dir.timeLeft = ev.dur;
  dir.total = ev.dur;
  dir.failed = false;
  dir.bannerT = 2.2;
  return { started: ev };
}

// A crash forfeits the current event's payout — the reward is for getting
// through it CLEAN, which is what makes an event tense rather than just noisy.
export function failEvent(dir) {
  if (dir && dir.active) dir.failed = true;
}
