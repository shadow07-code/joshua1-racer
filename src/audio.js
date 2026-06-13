// Audio — dual music tracks + F1 engine SFX.
// Track 1 ("ambient"): minimal driving synth — keeps pace, stays out of the way.
// Track 2 ("original"): upbeat NES-style chiptune (Speed Racer vibe).
// Music defaults OFF; the title screen lets the player tap 1/2 to preview & pick.
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
let _musicTrack = 0;         // 0 = off, 1 = ambient, 2 = original chiptune
export function getMusicTrack() { return _musicTrack; }
export function setMusicTrack(n) {
  _musicTrack = n;
  // Push the per-track volume onto the live music channel so switching tracks
  // also rebalances the mix (Track 1 = the produced MP3, Track 2 = chiptune).
  musicVol = (n === 1) ? MUSIC_VOL_TRACK1 : MUSIC_VOL_CHIPTUNE;
  if (musicGain && musicEnabled) musicGain.gain.value = musicVol;
}

export function isMuted() { return muted; }
export function setMuted(v) { muted = !!v; if (masterGain) masterGain.gain.value = muted ? 0 : 0.6; }
export function toggleMute() { setMuted(!muted); return muted; }

// ── Independent music / SFX channels (additive) ───────────────────────────────
// Rebalanced mix: music sits lower so the car/engine and effects come forward.
// Two separate enable flags drive the two toolbar toggles.
let musicEnabled = true, sfxEnabled = true;
// Per-track music volume — Track 1 (the produced "The Final Bend" MP3) sits
// forward as the featured score; Track 2 (chiptune) sits lower so it doesn't
// dominate. setMusicTrack() pushes the appropriate one onto musicGain so the
// live mix follows the user's choice. MUSIC_VOL_TRACK1 is the main lever if the
// song ever feels too loud/quiet against the engine + SFX.
const MUSIC_VOL_TRACK1 = 0.50;
const MUSIC_VOL_CHIPTUNE = 0.18;
let musicVol = MUSIC_VOL_TRACK1;     // current active volume (updated by setMusicTrack)
// SFX bus turned down 40% (1.10 → 0.66) so the blips/crashes/engine sit
// politely under the music instead of fighting it. This is the master SFX lever.
let sfxVol   = 0.66;

export function isMusicEnabled() { return musicEnabled; }
export function isSfxEnabled()   { return sfxEnabled; }
export function setMusicEnabled(on) {
  musicEnabled = !!on;
  if (musicGain) musicGain.gain.value = musicEnabled ? musicVol : 0;
}
export function setSfxEnabled(on) {
  sfxEnabled = !!on;
  if (sfxGain) sfxGain.gain.value = sfxEnabled ? sfxVol : 0;
}
export function setMusicVolume(v) { musicVol = v; if (musicGain && musicEnabled) musicGain.gain.value = v; }
export function setSfxVolume(v)   { sfxVol = v;   if (sfxGain   && sfxEnabled)   sfxGain.gain.value = v; }
// Push the rebalanced volumes + current enable flags onto the gain nodes. Call
// after initAudio() (the context may be created lazily on first user gesture).
export function applyMix() {
  if (musicGain) musicGain.gain.value = musicEnabled ? musicVol : 0;
  if (sfxGain)   sfxGain.gain.value   = sfxEnabled   ? sfxVol   : 0;
}

export function initAudio() {
  if (inited) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain(); masterGain.gain.value = muted ? 0 : 0.6;
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = musicEnabled ? musicVol : 0; musicGain.connect(masterGain);
    sfxGain   = ctx.createGain(); sfxGain.gain.value   = sfxEnabled   ? sfxVol   : 0; sfxGain.connect(masterGain);
    inited = true;
    // Begin decoding the Track-1 MP3 now (works while the context is suspended)
    // so it's ready the moment the player starts a race or previews it.
    loadMusic1().catch(() => {});
  } catch {}
}

export function resumeAudio() { if (ctx && ctx.state === "suspended") ctx.resume(); }
// Suspend all audio output (used when the tab/app is backgrounded so music and
// the engine drone stop immediately on mobile). Pairs with resumeAudio().
export function suspendAudio() { if (ctx && ctx.state === "running") { try { ctx.suspend(); } catch {} } }

// ── TRACK 1: "The Final Bend" (produced MP3, looped) ─────────────────────────
// Track 1 is a real produced music file (not a procedural synth). It's decoded
// once into an AudioBuffer and played through a single looping
// AudioBufferSourceNode routed to musicGain — so the existing mute / volume /
// pause(suspend) plumbing controls it for free, and it loops seamlessly for as
// long as the race runs (covers any race longer than the track).
const MUSIC1_URL = new URL("../audio/the-final-bend.mp3", import.meta.url).href;
let _music1Buffer = null;     // decoded PCM (null until loaded)
let _music1Promise = null;    // in-flight load (de-dupes concurrent requests)
let _music1Source = null;     // the live looping source while Track 1 plays

function loadMusic1() {
  if (_music1Buffer) return Promise.resolve(_music1Buffer);
  if (_music1Promise) return _music1Promise;
  if (!ctx) return Promise.reject(new Error("no audio context"));
  _music1Promise = fetch(MUSIC1_URL)
    .then((r) => { if (!r.ok) throw new Error("fetch " + r.status); return r.arrayBuffer(); })
    .then((data) => new Promise((resolve, reject) => {
      // decodeAudioData supports both the modern promise form and the legacy
      // callback form (older Safari) — handle whichever the browser returns.
      const ret = ctx.decodeAudioData(data, resolve, reject);
      if (ret && typeof ret.then === "function") ret.then(resolve, reject);
    }))
    .then((decoded) => { _music1Buffer = decoded; return decoded; })
    .catch((err) => { _music1Promise = null; throw err; });
  return _music1Promise;
}

function startMusic1File() {
  if (!ctx) return;
  if (!_music1Buffer) {
    // Not decoded yet — load, then start if we're still on Track 1.
    loadMusic1().then(() => {
      if (_musicTrack === 1 && !_music1Source) startMusic1File();
    }).catch(() => {});
    return;
  }
  stopMusic1File();
  const src = ctx.createBufferSource();
  src.buffer = _music1Buffer;
  src.loop = true;                 // seamless loop for the whole race
  src.connect(musicGain);
  src.start();
  _music1Source = src;
}

function stopMusic1File() {
  if (!_music1Source) return;
  try { _music1Source.stop(); } catch {}
  try { _music1Source.disconnect(); } catch {}
  _music1Source = null;
}

// ── TRACK 2: Original chiptune ──────────────────────────────────────────────
// Song data ─────────────────────────────────────────────────────────────────
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
    extraPercussion(t, sixteenthSec, drumCursor);

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

// Extra percussion layer (additive) — enriches the existing groove without
// touching the melody/bass: a continuous shaker bed, ghost snares, a ride-bell
// shimmer and a couple of syncopated kicks for more drive. Routed through the
// music channel so the music toggle/volume still controls it.
function extraPercussion(t, sixteenthSec, pos) {
  if (!ctx) return;
  // Shaker on every 16th — softer on-beat, a touch brighter on the offbeats.
  playNoiseHit(t, 0.010, pos % 2 === 1 ? 0.045 : 0.026, 7200);
  // Ghost snare on the last 16th of each beat → busier backbeat.
  if (pos % 4 === 3) playNoiseHit(t, 0.020, 0.05, 2600);
  // Ride-bell shimmer on the offbeat eighths.
  if (pos % 4 === 2) playNoiseHit(t, 0.018, 0.035, 5200);
  // Syncopated push kicks (adds to the existing 0/8 kicks for a fuller beat).
  if (pos === 6 || pos === 14) playNoiseHit(t, 0.05, 0.10, 95);
}

function tickScheduler() {
  if (!ctx) return;
  // Only Track 2 (chiptune) is scheduled note-by-note; Track 1 is a file source
  // that loops itself, and the interval is never started for it.
  const bpm = baseBPM * bpmMultiplier;
  const sixteenthSec = (60 / bpm) / 4;
  scheduleAhead(ctx.currentTime, sixteenthSec, 0.4);
}

export function startMusic(mapKind) {
  if (!ctx) return;
  stopMusic();
  if (_musicTrack === 0) return;           // music OFF — nothing to play
  currentMap = mapKind || "city";
  baseBPM = currentMap === "jungle" ? MUSIC.jungleBPM : MUSIC.cityBPM;
  bpmMultiplier = 1.0;
  // Track 1 — the produced MP3, looped (no note scheduler).
  if (_musicTrack === 1) { startMusic1File(); return; }
  // Track 2 — reset the original chiptune state and run the note scheduler.
  leadIdx = bassIdx = drumCursor = arpCursor = barCursor = 0;
  barTickLeft = 16;
  leadTickLeft = bassTickLeft = 0;
  nextTickTime = ctx.currentTime + 0.05;
  tickScheduler();
  musicTimer = setInterval(tickScheduler, 200);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  stopMusic1File();                         // also halt the looping Track-1 file
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
// Multi-oscillator engine voiced as a SWEET FERRARI rather than a raw F1 rasp:
// two gently-detuned sawtooths (8c) through a low-Q (1.0) lowpass for a smooth,
// refined tone, plus a light sub-octave square for body (not heavy growl). The
// whole SFX bus also sits 40% lower so it never fights the music. During RAMPAGE
// the filter opens for an exciting snarl — aggressive, but no longer ear-splitting.
let engineOsc2 = null, engineGainSub = null, engineOscSub = null;
let engineFilt = null;
let _engineRampage = false;

export function startEngine() {
  if (!ctx || engineOsc) return;
  // F1 engine: two detuned sawtooths (rasp) + sub-octave square (growl).
  // The whole character is speed-tracked in setEngine(): at standstill the
  // pitch sits at ~38 Hz behind a nearly-closed filter (a low RUMBLE), and
  // both pitch and filter open progressively with speed so the high-RPM
  // scream is reserved for actual top speed instead of arriving early.
  engineOsc = ctx.createOscillator(); engineOsc.type = "sawtooth"; engineOsc.frequency.value = 38;
  // Gentler detune (8c, was 12) → smoother "layered cylinders" shimmer, less beat roughness.
  engineOsc2 = ctx.createOscillator(); engineOsc2.type = "sawtooth"; engineOsc2.frequency.value = 38; engineOsc2.detune.value = 8;
  engineOscSub = ctx.createOscillator(); engineOscSub.type = "square"; engineOscSub.frequency.value = 19;
  engineGain = ctx.createGain(); engineGain.gain.value = 0;
  engineGainSub = ctx.createGain(); engineGainSub.gain.value = 0;
  // Lower Q (1.0, was 1.4) removes the nasal/peaky resonance for a sweeter tone.
  engineFilt = ctx.createBiquadFilter(); engineFilt.type = "lowpass"; engineFilt.frequency.value = 320; engineFilt.Q.value = 1.0;
  engineOsc.connect(engineFilt); engineOsc2.connect(engineFilt);
  engineFilt.connect(engineGain); engineGain.connect(sfxGain);
  engineOscSub.connect(engineGainSub); engineGainSub.connect(sfxGain);
  engineOsc.start(); engineOsc2.start(); engineOscSub.start();
  _engineRampage = false;
}
export function stopEngine() {
  if (!engineOsc) return;
  try { engineOsc.stop(); } catch {}
  try { engineOsc2.stop(); } catch {}
  try { engineOscSub.stop(); } catch {}
  engineOsc.disconnect(); engineOsc2.disconnect(); engineOscSub.disconnect();
  engineGain.disconnect(); engineGainSub.disconnect(); engineFilt.disconnect();
  engineOsc = engineOsc2 = engineOscSub = null;
  engineGain = engineGainSub = engineFilt = null;
}
export function setEngine(speed01) {
  if (!engineOsc || !ctx) return;
  const s = Math.max(0, Math.min(1, speed01));
  const t = ctx.currentTime;
  // Power curve keeps the RPM low through the early/mid range so there's real
  // headroom left for the top end (a linear ramp sounded maxed-out too early).
  const curve = Math.pow(s, 1.7);
  const f = 38 + 300 * curve;                       // 38 Hz rumble → 338 Hz wail
  engineOsc.frequency.setTargetAtTime(f, t, 0.06);
  engineOsc2.frequency.setTargetAtTime(f * 1.006, t, 0.06);
  engineOscSub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
  // Filter opens with speed: muffled low rumble at rest → bright but SMOOTH top.
  // Ceiling trimmed (1650, was 1900) so the high end sings rather than rasps;
  // a Ferrari is bright but refined, not buzzy. (Rampage owns the filter — see below.)
  if (!_engineRampage) {
    engineFilt.frequency.setTargetAtTime(320 + 1650 * curve, t, 0.08);
  }
  const vol = 0.030 + 0.055 * curve;
  engineGain.gain.setTargetAtTime(vol, t, 0.06);
  // Lighter sub-octave growl (0.55, was 0.70) sheds the heavy/oppressive low end.
  engineGainSub.gain.setTargetAtTime(vol * 0.55, t, 0.06);
}
export function setEngineRampage(on) {
  if (!engineFilt || !ctx || _engineRampage === on) return;
  _engineRampage = on;
  const t = ctx.currentTime;
  if (on) {
    // Aggressive but no longer harsh: lower ceiling (2200, was 2600) + softer Q
    // (2.0, was 2.6) keep the rampage snarl exciting without the ear-splitting rasp.
    engineFilt.frequency.setTargetAtTime(2200, t, 0.08);
    engineFilt.Q.setTargetAtTime(2.0, t, 0.08);
    engineGain.gain.setTargetAtTime(0.14, t, 0.06);
    engineGainSub.gain.setTargetAtTime(0.10, t, 0.06);
  } else {
    // Hand the filter back to setEngine (it re-tracks speed on the next frame).
    engineFilt.Q.setTargetAtTime(1.0, t, 0.15);
  }
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

// Helicopter releases a flaming barrel — a falling whistle (pitch sweeps down)
// plus a metallic clank as it leaves the chopper.
export function sfxBarrelDrop() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(170, t + 0.40);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.16, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.46);
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 2400; filt.Q.value = 3;
  const ng = ctx.createGain(); ng.gain.value = 0.14;
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain);
  src.start(t); src.stop(t + 0.14);
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

// Near-miss combo blip — pitch climbs a semitone per combo step (caps ~1 octave)
// with a sparkle harmonic, so a hot streak literally sounds like it's rising.
export function sfxCombo(level) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = 523 * Math.pow(2, Math.min(12, Math.max(0, level - 1)) / 12);
  const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.17, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.17);
  const o2 = ctx.createOscillator(); o2.type = "square"; o2.frequency.value = f * 2;
  const g2 = ctx.createGain(); g2.gain.value = 0;
  g2.gain.linearRampToValueAtTime(0.07, t + 0.01);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
  o2.connect(g2); g2.connect(sfxGain);
  o2.start(t); o2.stop(t + 0.12);
}

// Shield EARNED — a bright ascending arpeggio (you powered up).
export function sfxShieldUp() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [392, 523, 659, 880].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "square"; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.16, t + i * 0.05 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.16);
    o.connect(g); g.connect(sfxGain);
    o.start(t + i * 0.05); o.stop(t + i * 0.05 + 0.18);
  });
}

// Shield ABSORBS a hit — a metallic "whomp" (descending tone + filtered noise).
export function sfxShieldHit() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "square";
  o.frequency.setValueAtTime(700, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.22);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.20, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.28);
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 1400; filt.Q.value = 1.5;
  const ng = ctx.createGain(); ng.gain.value = 0.16;
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain);
  src.start(t); src.stop(t + 0.2);
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

// ── Helicopter rotor sound — continuous while choppers are on-screen ─────────
let heliSrc = null, heliGain = null, heliLfo = null, heliLfoGain = null;

export function startHeliSound() {
  if (!ctx || heliSrc) return;
  heliSrc = ctx.createBufferSource(); heliSrc.buffer = getNoiseBuf(); heliSrc.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 3;
  heliGain = ctx.createGain(); heliGain.gain.value = 0;
  // Amplitude LFO gives the chopping rhythm
  heliLfo = ctx.createOscillator(); heliLfo.type = "square"; heliLfo.frequency.value = 18;
  heliLfoGain = ctx.createGain(); heliLfoGain.gain.value = 0.09;
  heliSrc.connect(bp); bp.connect(heliGain);
  heliLfo.connect(heliLfoGain); heliLfoGain.connect(heliGain.gain);
  heliGain.connect(sfxGain);
  heliSrc.start(); heliLfo.start();
  heliGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.3);
}
export function stopHeliSound() {
  if (!heliSrc) return;
  try { heliSrc.stop(); } catch {}
  try { heliLfo.stop(); } catch {}
  heliSrc.disconnect(); heliGain.disconnect(); heliLfo.disconnect(); heliLfoGain.disconnect();
  heliSrc = heliGain = heliLfo = heliLfoGain = null;
}

// Post-rampage shockwave — a deep concussive boom + high woosh.
export function sfxShockwave() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(25, t + 0.35);
  const g = ctx.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.30, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.42);
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuf();
  const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 600; filt.Q.value = 0.8;
  const ng = ctx.createGain(); ng.gain.value = 0.18;
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
  src.connect(filt); filt.connect(ng); ng.connect(sfxGain);
  src.start(t); src.stop(t + 0.35);
}

// Compatibility no-ops (other modules may still call these).
export function sfxSiren()   {}
export function sfxGrowl()   {}
export function sfxTrumpet() {}
