// DAILY CHALLENGE — one goal a day, the same goal for everyone, paid in coins.
//
// WHY IT EXISTS: the game is endless, so "come back tomorrow" needs a reason that
// isn't just a higher number. A daily goal gives the day a shape — you open the
// app with something specific to do, and a STREAK you'd rather not drop.
//
// Two hard rules it inherits:
//  1. It pays COINS ONLY (never speed, lives or rampage). Coins feed the garage,
//     which is cosmetic, so a daily grinder can never out-gun a better driver on
//     the global leaderboard.
//  2. Progress accumulates ACROSS the day's runs (for 'sum' goals), so a
//     15-second disaster still moves it — the same promise the coin bank makes.
//
// The goal is derived from the DATE by hash, not stored, so every device shows
// the same challenge on the same day with no server involved.
import { DAILY } from "./config.js";

const KEY = "joshua1.daily.v1";

// `mode: 'sum'`  — every run of the day adds to the tally.
// `mode: 'best'` — the day's single best run counts (a skill spike, not a grind).
// `stat` names a field of the run summary passed to applyRun().
// Tiers are calibrated against a MEASURED clean 2-minute run: ~6000 distance,
// ~173 cars passed, ~40-60 coins. A daily should want 2-4 runs, so the 'sum'
// targets sit above what any single good run delivers — otherwise the day's goal
// falls out of the first attempt and stops being a reason to come back.
const GOALS = [
  { id: "dist",  mode: "sum",  stat: "distance", tiers: [8000, 14000, 20000],   label: n => "DRIVE " + n + "M" },
  { id: "coins", mode: "sum",  stat: "coins",    tiers: [70, 110, 160],         label: n => "COLLECT " + n + " COINS" },
  { id: "pass",  mode: "sum",  stat: "passed",   tiers: [250, 450, 700],        label: n => "PASS " + n + " CARS" },
  { id: "gates", mode: "sum",  stat: "gates",    tiers: [2, 3, 5],              label: n => "THREAD " + n + " GATES" },
  { id: "smash", mode: "sum",  stat: "smashed",  tiers: [12, 20, 30],           label: n => "SMASH " + n + " CARS" },
  { id: "combo", mode: "best", stat: "combo",    tiers: [15, 22, 30],           label: n => "REACH X" + n + " COMBO" },
  { id: "score", mode: "best", stat: "score",    tiers: [30000, 55000, 85000],  label: n => "SCORE " + n + " IN A RUN" },
  { id: "time",  mode: "best", stat: "time",     tiers: [60, 90, 120],          label: n => "SURVIVE " + n + " SECONDS" },
];

// ── Dates ─────────────────────────────────────────────────────────────────────
// Local calendar day, so "today" matches the player's own sense of the date
// rather than UTC rolling over mid-evening.
function dayKey(d) {
  const x = d || new Date();
  return x.getFullYear() + "-" +
    String(x.getMonth() + 1).padStart(2, "0") + "-" +
    String(x.getDate()).padStart(2, "0");
}
function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

// FNV-1a over the date string — a stable, well-mixed pick so consecutive days
// don't march through the goal list in order.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// The goal for a given day, derived purely from its date.
export function goalFor(day) {
  const h = hash(day);
  const goal = GOALS[h % GOALS.length];
  const target = goal.tiers[(h >>> 9) % goal.tiers.length];
  return { id: goal.id, mode: goal.mode, stat: goal.stat, target, label: goal.label(target) };
}

// ── Persistence ───────────────────────────────────────────────────────────────
// { day, prog, done, reward, streak, lastDone }
//   streak   — consecutive completed days ENDING at lastDone
//   lastDone — the last day the goal was completed
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object") return raw;
  } catch {}
  return { day: "", prog: 0, done: false, reward: 0, streak: 0, lastDone: "" };
}
function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

// Roll the stored state onto today if the date has moved on. Progress is
// per-day, so it clears; the streak is NOT cleared here (a streak is only
// broken by failing to complete, which currentStreak() works out on the fly).
function rollToToday(s) {
  const today = dayKey();
  if (s.day !== today) {
    s.day = today;
    s.prog = 0;
    s.done = false;
    s.reward = 0;
    save(s);
  }
  return s;
}

// A streak only stands if it was extended today or yesterday — miss a whole day
// and it reads 0 immediately, which is the entire point of a streak.
function currentStreak(s) {
  if (s.lastDone === dayKey() || s.lastDone === yesterdayKey()) return s.streak || 0;
  return 0;
}

// What a completion is worth right now: a flat base plus a bonus per consecutive
// day, capped so a long streak is a nice-to-have and never a runaway income.
export function rewardFor(streakAfter) {
  const extra = Math.min(Math.max(0, streakAfter - 1), DAILY.streakBonusCap);
  return DAILY.baseCoins + DAILY.streakBonus * extra;
}

// Everything the UI needs for today, in one read.
export function getDaily() {
  const s = rollToToday(load());
  const goal = goalFor(s.day);
  const streak = currentStreak(s);
  return {
    day: s.day,
    label: goal.label,
    target: goal.target,
    mode: goal.mode,
    prog: Math.min(s.prog || 0, goal.target),
    done: !!s.done,
    reward: s.done ? (s.reward || 0) : rewardFor(streak + 1),
    streak,
  };
}

// Fold one finished run into today's progress.
//
// `run` carries the run summary: { distance, coins, passed, gates, smashed,
// combo, score, time }. Returns { completed, reward, prog, target, label } —
// `completed` is true ONLY on the run that crosses the line, so the caller can
// fire the payout and the celebration exactly once.
export function applyRun(run) {
  const s = rollToToday(load());
  const goal = goalFor(s.day);
  const value = Math.max(0, Math.floor(run?.[goal.stat] || 0));

  const before = s.prog || 0;
  // 'sum' tallies the day; 'best' keeps the day's high-water mark.
  s.prog = goal.mode === "sum" ? before + value : Math.max(before, value);

  let completed = false;
  if (!s.done && s.prog >= goal.target) {
    // Extend the streak if yesterday was also completed, otherwise start a new one.
    s.streak = (s.lastDone === yesterdayKey()) ? (s.streak || 0) + 1 : 1;
    s.lastDone = s.day;
    s.done = true;
    s.reward = rewardFor(s.streak);
    completed = true;
  }
  save(s);
  return {
    completed,
    reward: completed ? s.reward : 0,
    prog: Math.min(s.prog, goal.target),
    target: goal.target,
    label: goal.label,
    streak: currentStreak(s),
  };
}
