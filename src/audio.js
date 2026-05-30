// Chiptune audio — 2 square + triangle + noise. NES-style 4-channel mix.
// Music: an upbeat *Speed Racer*-vibe original chiptune. Richer arrangement
// with verse / chorus contrast and a dynamic tempo that tracks player speed.
import { MUSIC } from "./config.js";

// ── Note helpers ──────────────────────────────────────────────────────────────
const A4 = 440;
const SEMI = { C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11 };
function noteHz(name, octave) {
  if (name === "-" || !name) return 0;
  const s = SEMI[name]; if (s == null) return 0;
  const midi = octave * 12 + s + 12;
  return A4 * Math.pow(2, (midi - 69) / 12);
}

// ── Audio context ─────────────────────────────────────────────────────────────
let ctx = null;
let masterGain = null, musicGain = null, sfxGain = null;
let muted = false, inited = false;

let engineOsc = null, engineGain = null;

let musicTimer = null;
let currentMap = "city";
let baseBPM = MUSIC.cityBPM;
let bpmMultiplier = 1.0;     // 0.9 .. 1.1, set externally per speed
let intensity = 0;

export function isMuted() { return muted; }
export function setMuted(v) { muted = !!v; if (masterGain) masterGain.gain.value = muted ? 0 : 0.6; }
export function toggleMute() { setMuted(!muted); return muted; }

export function initAudio() {
  if (inited) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain(); masterGain.gain.value = muted ? 0 : 0.6;
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.42; musicGain.connect(masterGain);
    sfxGain   = ctx.createGain(); sfxGain.gain.value = 0.85;   sfxGain.connect(masterGain);
    inited = true;
  } catch {}
}

export function resumeAudio() { if (ctx && ctx.state === "suspended") ctx.resume(); }
// Suspend all audio output (used when the tab/app is backgrounded so music and
// the engine drone stop immediately on mobile). Pairs with resumeAudio().
export function suspendAudio() { if (ctx && ctx.state === "running") { try { ctx.suspend(); } catch {} } }

// ── Song data ─────────────────────────────────────────────────────────────────
// Each entry: [noteName, octave, duration16ths]. "-" = rest.
// Two-section song (A = chorus, B = verse), 16 bars per loop.
// 16 sixteenths per bar (4/4). Verse repeats melody an octave down for contrast.

// A section — driving chorus (8 bars)
const LEAD_A = [
  // Bar 1 — C triad up + down
  ["G",4,2],["C",5,2],["E",5,2],["G",5,2], ["E",5,2],["C",5,2],["G",4,4],
  // Bar 2 — F triad
  ["A",4,2],["C",5,2],["F",5,2],["A",5,2], ["F",5,2],["C",5,2],["A",4,4],
  // Bar 3 — G triad
  ["G",4,2],["B",4,2],["D",5,2],["G",5,2], ["D",5,2],["B",4,2],["G",4,4],
  // Bar 4 — scale run down
  ["C",5,1],["B",4,1],["A",4,1],["G",4,1], ["F",4,1],["E",4,1],["D",4,1],["C",4,1],
  ["G",4,4],["-",0,4],
  // Bar 5 — repeat, octave up
  ["G",5,2],["C",6,2],["E",6,2],["G",6,2], ["E",6,2],["C",6,2],["G",5,4],
  // Bar 6
  ["A",5,2],["C",6,2],["F",6,2],["A",6,2], ["F",6,2],["C",6,2],["A",5,4],
  // Bar 7 — climb
  ["E",5,1],["F",5,1],["G",5,1],["A",5,1], ["B",5,1],["C",6,1],["D",6,1],["E",6,1],
  ["G",5,4],["-",0,4],
  // Bar 8 — cadence
  ["C",6,2],["B",5,2],["A",5,2],["G",5,2], ["F",5,2],["E",5,2],["D",5,2],["C",5,2],
];

// B section — bouncy verse (8 bars)
const LEAD_B = [
  // Bar 9 — Am pattern
  ["A",4,2],["E",5,2],["A",4,2],["E",5,2], ["C",5,2],["E",5,2],["A",4,2],["C",5,2],
  // Bar 10 — F
  ["F",4,2],["A",4,2],["C",5,2],["F",5,2], ["C",5,2],["A",4,2],["F",4,4],
  // Bar 11 — G turnaround
  ["G",4,2],["D",5,2],["G",5,2],["B",5,2], ["A",5,2],["G",5,2],["F",5,2],["E",5,2],
  // Bar 12 — back to C
  ["C",5,4],["G",4,4],["E",5,4],["C",5,4],
  // Bar 13 — chromatic climb
  ["C",5,1],["D",5,1],["E",5,1],["F",5,1], ["G",5,1],["A",5,1],["B",5,1],["C",6,1],
  ["D",6,2],["E",6,2],["G",6,4],
  // Bar 14 — staccato hits
  ["C",6,1],["-",0,1],["G",5,1],["-",0,1], ["E",5,1],["-",0,1],["C",5,1],["-",0,1],
  ["G",4,2],["E",4,2],["G",4,4],
  // Bar 15 — scale up
  ["A",4,2],["B",4,2],["C",5,2],["D",5,2], ["E",5,2],["F",5,2],["G",5,4],
  // Bar 16 — big lead-back
  ["C",5,2],["E",5,2],["G",5,4],           ["C",6,4],["G",5,4],
];

const LEAD = [...LEAD_A, ...LEAD_B];

// Bass — oom-pah, root + 5th, 8 8ths per bar (2-tick steps each).
function basspat(chords) {
  // chords = ["C","F","G","C", ...]; each chord = root with a 5th between.
  const FIFTH = { C:["G",2], F:["C",3], G:["D",3], Am:["E",3] };
  const ROOT  = { C:["C",2], F:["F",2], G:["G",2], Am:["A",2] };
  const out = [];
  for (const ch of chords) {
    const r = ROOT[ch], f = FIFTH[ch];
    out.push([r[0],r[1],2],["-",0,2],[f[0],f[1],2],["-",0,2],
             [r[0],r[1],2],["-",0,2],[f[0],f[1],2],["-",0,2]);
  }
  return out;
}
const BASS = basspat(["C","F","G","C", "C","F","G","C",  "Am","F","G","C", "F","C","G","C"]);

// Arpeggio (square 2) — chord tones up on 16ths during A section; harmony 3rds in B.
function arpFor(chord) {
  const triads = {
    C:[["C",5],["E",5],["G",5],["C",6]],
    F:[["F",4],["A",4],["C",5],["F",5]],
    G:[["G",4],["B",4],["D",5],["G",5]],
    Am:[["A",4],["C",5],["E",5],["A",5]],
  };
  return triads[chord] || triads.C;
}
const CHORDS_PER_BAR = ["C","F","G","C", "C","F","G","C",  "Am","F","G","C", "F","C","G","C"];

// ── Synth voices ──────────────────────────────────────────────────────────────
function playSquare(name, oct, t, dur16, sixteenthSec, gain, detune = 0) {
  if (!ctx || name === "-") return;
  const f = noteHz(name, oct); if (!f) return;
  const dur = dur16 * sixteenthSec * 0.94;
  const osc = ctx.createOscillator(); osc.type = "square"; osc.frequency.value = f; osc.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g); g.connect(musicGain);
  osc.start(t); osc.stop(t + dur + 0.02);
}
function playTri(name, oct, t, dur16, sixteenthSec, gain) {
  if (!ctx || name === "-") return;
  const f = noteHz(name, oct); if (!f) return;
  const dur = dur16 * sixteenthSec * 0.95;
  const osc = ctx.createOscillator(); osc.type = "triangle"; osc.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + dur * 0.85);
  g.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(g); g.connect(musicGain);
  osc.start(t); osc.stop(t + dur + 0.02);
}

let noiseBuf = null;
function getNoiseBuf() {
  if (!ctx) return null;
  if (noiseBuf) return noiseBuf;
  const sr = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, sr * 1.0, sr);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function playNoiseHit(t, dur, gain, hp = 800) {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const filt = ctx.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = hp;
  src.connect(filt); filt.connect(g); g.connect(musicGain);
  src.start(t); src.stop(t + dur + 0.02);
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
let nextTickTime = 0;
let leadIdx = 0, leadTickLeft = 0;
let bassIdx = 0, bassTickLeft = 0;
let drumCursor = 0;
let arpCursor = 0;
let barCursor = 0;        // bar index (0..15)
let barTickLeft = 16;     // sixteenths until next bar boundary

function scheduleAhead(now, sixteenthSec, lookahead) {
  while (nextTickTime < now + lookahead) {
    const t = nextTickTime;

    // Lead
    if (leadTickLeft <= 0) {
      const ev = LEAD[leadIdx];
      leadTickLeft = ev[2];
      playSquare(ev[0], ev[1], t, ev[2], sixteenthSec, 0.17, -3);
      // Octave-stacked echo for richness on long notes
      if (ev[0] !== "-" && ev[2] >= 4) {
        playSquare(ev[0], ev[1] - 1, t + 0.02, ev[2], sixteenthSec, 0.06, +2);
      }
      leadIdx = (leadIdx + 1) % LEAD.length;
    }

    // Bass
    if (bassTickLeft <= 0) {
      const ev = BASS[bassIdx];
      bassTickLeft = ev[2];
      playTri(ev[0], ev[1], t, ev[2], sixteenthSec, 0.30);
      bassIdx = (bassIdx + 1) % BASS.length;
    }

    // Arpeggio on 16ths — quieter background bed
    {
      const chord = CHORDS_PER_BAR[barCursor];
      const tri = arpFor(chord);
      const [n, o] = tri[arpCursor % tri.length];
      // Only play arps on offbeats to avoid muddying the lead.
      if (drumCursor % 2 === 1 || intensity >= 2) {
        playSquare(n, o, t, 1, sixteenthSec, 0.05, +6);
      }
      arpCursor = (arpCursor + 1) % 4;
    }

    // Drums
    drumTick(t, sixteenthSec, drumCursor);

    // Advance
    drumCursor = (drumCursor + 1) % 16;
    barTickLeft -= 1;
    if (barTickLeft <= 0) {
      barTickLeft = 16;
      barCursor = (barCursor + 1) % 16;
      arpCursor = 0;
    }
    leadTickLeft--; bassTickLeft--;
    nextTickTime += sixteenthSec;
  }
}

function drumTick(t, sixteenthSec, pos) {
  if (currentMap === "city") {
    if (pos === 0 || pos === 8) playNoiseHit(t, 0.07, 0.20, 80);     // kick
    if (pos === 4 || pos === 12) playNoiseHit(t, 0.09, 0.18, 1800);  // snare
    if (pos % 2 === 0) playNoiseHit(t, 0.025, 0.06, 4800);            // hat 8ths
    if (intensity >= 1 && pos % 2 === 1) playNoiseHit(t, 0.015, 0.03, 5500);
    // Tom fill at end of every 4 bars
    if (barCursor % 4 === 3 && pos === 14) playNoiseHit(t, 0.07, 0.14, 300);
  } else {
    if (pos === 0 || pos === 8) playNoiseHit(t, 0.12, 0.22, 200);    // big tom
    if (pos === 4) playNoiseHit(t, 0.10, 0.18, 350);
    if (pos === 12) playNoiseHit(t, 0.11, 0.18, 280);
    if (pos === 6 || pos === 14) playNoiseHit(t, 0.06, 0.10, 1100);  // mid hand-drum
    if (intensity >= 1 && pos % 4 === 0) playNoiseHit(t, 0.04, 0.08, 1500);
  }
}

function tickScheduler() {
  if (!ctx) return;
  const bpm = baseBPM * bpmMultiplier;
  const sixteenthSec = (60 / bpm) / 4;
  scheduleAhead(ctx.currentTime, sixteenthSec, 0.4);
}

export function startMusic(mapKind) {
  if (!ctx) return;
  stopMusic();
  currentMap = mapKind;
  baseBPM = mapKind === "jungle" ? MUSIC.jungleBPM : MUSIC.cityBPM;
  bpmMultiplier = 1.0;
  leadIdx = bassIdx = drumCursor = arpCursor = barCursor = 0;
  barTickLeft = 16;
  leadTickLeft = bassTickLeft = 0;
  nextTickTime = ctx.currentTime + 0.05;
  tickScheduler();
  musicTimer = setInterval(tickScheduler, 200);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

export function setMusicIntensity(level) {
  // External may pass 0..1 (speed-based); clamp to 0..2
  intensity = Math.max(0, Math.min(2, Math.round(level)));
}

// Tempo nudge driven by player speed: speed01 in 0..1+ → BPM scales 0.9..1.0+swing
export function setMusicTempoFactor(speed01) {
  const swing = MUSIC.bpmSwingPct;
  const t = Math.max(0, Math.min(1, speed01));
  // Curve: at speed 0 → 1 - swing (slower); at speed 1 → 1 + swing (faster)
  bpmMultiplier = (1 - swing) + 2 * swing * t;
}

export function playFlourish() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  const sec = 0.07;
  const seq = [["C",5],["E",5],["G",5],["C",6],["E",6],["G",6],["C",7]];
  seq.forEach(([n,o], i) => playSquare(n, o, t + i * sec, 2, sec/2, 0.22));
}

// ── SFX ───────────────────────────────────────────────────────────────────────
export function startEngine() {
  if (!ctx || engineOsc) return;
  engineOsc = ctx.createOscillator(); engineOsc.type = "sawtooth"; engineOsc.frequency.value = 70;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 900;
  engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(sfxGain);
  engineOsc.start();
}
export function stopEngine() {
  if (!engineOsc) return;
  try { engineOsc.stop(); } catch {}
  engineOsc.disconnect(); engineGain.disconnect();
  engineOsc = null; engineGain = null;
}
export function setEngine(speed01) {
  if (!engineOsc || !ctx) return;
  const f = 55 + 240 * Math.max(0, Math.min(1, speed01));
  engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
  engineGain.gain.setTargetAtTime(0.05 + 0.10 * speed01, ctx.currentTime, 0.05);
}

export function sfxAccelAccent() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square";
  const g = ctx.createGain(); g.gain.value = 0;
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(660, t + 0.18);
  g.gain.linearRampToValueAtTime(0.18, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.25);
}

export function sfxBrake() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = 1800;
  const ng = ctx.createGain(); ng.gain.value = 0.18;
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain);
  src.start(t); src.stop(t + 0.3);
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.22);
  const og = ctx.createGain(); og.gain.value = 0.10;
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  o.connect(og); og.connect(sfxGain);
  o.start(t); o.stop(t + 0.28);
}

// Soft low thud + rubbery noise tap — used when the car bumps a road-edge fence.
export function sfxBump() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.10);
  const og = ctx.createGain(); og.gain.value = 0.15;
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(og); og.connect(sfxGain);
  o.start(t); o.stop(t + 0.16);
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 900;
  const ng = ctx.createGain(); ng.gain.value = 0.10;
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain);
  src.start(t); src.stop(t + 0.12);
}

export function sfxNitrous() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [261, 392, 523, 659, 784].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.18, t + i * 0.05 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.10);
    o.connect(g); g.connect(sfxGain);
    o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.12);
  });
}

export function sfxPickup() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.16, t + i * 0.06 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.12);
    o.connect(g); g.connect(sfxGain);
    o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.14);
  });
}

export function sfxCrash() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 1200;
  const g = ctx.createGain(); g.gain.value = 0.32;
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
  src.connect(filt); filt.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.45);
}

export function sfxMenuMove() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = 660;
  const g = ctx.createGain(); g.gain.value = 0.12;
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.10);
}

export function sfxMenuSelect() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 784].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.18, t + i * 0.05 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.10);
    o.connect(g); g.connect(sfxGain);
    o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.12);
  });
}

export function sfxFinish() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [["C",5,0],["E",5,0.10],["G",5,0.20],["C",6,0.30]].forEach(([n,o,off]) => {
    const osc = ctx.createOscillator(); osc.type = "square"; osc.frequency.value = noteHz(n,o);
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.24, t + off + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.35);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t + off); osc.stop(t + off + 0.4);
  });
}

export function sfxCountdownBeep(high = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = high ? 880 : 523;
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.22, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.2);
}

// Compatibility no-ops (other modules may still call these).
export function sfxSiren()   {}
export function sfxGrowl()   {}
export function sfxTrumpet() {}
