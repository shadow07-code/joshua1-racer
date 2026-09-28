// Unified input — keyboard + canvas-touch + on-screen steer buttons.
// No brake handling — game is auto-accelerate.
import { KEYS } from "./config.js";

const state = {
  steer: 0,
  brake: false,                 // legacy: always false now (kept so callers don't break)
  pressed: new Set(),           // edge-triggered, consumed by main loop
};

// Every held input remembers WHEN it was pressed (a rising sequence number), so
// steering can follow the most recent one — see recompute().
let _seq = 0;
const heldKeys = new Map();    // key -> press seq
const touchPoints = new Map(); // identifier -> { x, y, side, seq }
const btnHeld = { L: 0, R: 0 }; // on-screen pads: press seq while held, 0 when up

// LAST PRESS WINS. Steering follows the most recently pressed direction that is
// still held, across keys, pads and screen halves alike; lifting it falls back
// to whatever is still down. Holding both directions used to CANCEL to zero —
// and a two-thumb reversal always overlaps (the new thumb lands before the old
// one lifts), so the car stopped dead for the whole overlap, then pulled away
// from rest: measured, every ms of overlap added a ms to the reversal (a 150 ms
// overlap took 183 ms to come back 3 px, against 50 ms for a clean handoff).
function recompute() {
  let s = 0, best = 0;
  const consider = (dir, seq) => { if (seq > best) { best = seq; s = dir; } };
  for (const [k, seq] of heldKeys) {
    if (KEYS.left.includes(k)) consider(-1, seq);
    else if (KEYS.right.includes(k)) consider(1, seq);
  }
  if (btnHeld.L) consider(-1, btnHeld.L);
  if (btnHeld.R) consider(1, btnHeld.R);
  for (const t of touchPoints.values()) {
    if (t.side === "L") consider(-1, t.seq);
    else if (t.side === "R") consider(1, t.seq);
  }
  state.steer = s;
  state.brake = false;
}

window.addEventListener("keydown", (e) => {
  // Prevent page scroll on arrows/space.
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) {
    e.preventDefault();
  }
  if (!heldKeys.has(e.key)) {          // (auto-repeat keydowns keep the first seq)
    heldKeys.set(e.key, ++_seq);
    state.pressed.add(e.key);
  }
  recompute();
}, { passive: false });

window.addEventListener("keyup", (e) => {
  heldKeys.delete(e.key);
  recompute();
});

// Steering covers the BOTTOM ~75% of the screen: tap/hold the left or right half
// anywhere in that band. The TOP 25% is a neutral zone reserved for the fixed
// controls that live up there — the sound toggles top-right and the pause button
// top-left — so reaching for them never yanks the car sideways. (It was bottom-
// half only, which wasted a lot of reachable screen; 0 = no dead zone at all.)
// HTML overlays (the ◀▶ pads, the rampage button) sit above the canvas and
// swallow their own taps, so pressing them never steers either.
const STEER_TOP_FRAC = 0.25;

function bindPointer(canvas) {
  // Returns "L"/"R" for the half of the canvas a touch landed on (or null if it
  // falls in the neutral top band, when one is configured). Taps anywhere still
  // count as a menu "Touch" press.
  const sideOf = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const localY = clientY - rect.top;
    if (localY < rect.height * STEER_TOP_FRAC) return null;
    const localX = clientX - rect.left;
    return localX < rect.width / 2 ? "L" : "R";
  };
  // Touch
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const side = sideOf(t.clientX, t.clientY);
      touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY, side, seq: ++_seq });
    }
    state.pressed.add("Touch");
    recompute();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tp = touchPoints.get(t.identifier);
      if (!tp) continue;
      tp.x = t.clientX; tp.y = t.clientY;
      const side = sideOf(t.clientX, t.clientY);
      // A thumb sliding across into the other half is a fresh press that way.
      if (side !== tp.side) { tp.side = side; tp.seq = ++_seq; }
    }
    recompute();
  }, { passive: false });
  const tend = (e) => {
    for (const t of e.changedTouches) touchPoints.delete(t.identifier);
    recompute();
  };
  canvas.addEventListener("touchend", tend);
  canvas.addEventListener("touchcancel", tend);

  // Mouse — treat held primary mouse button on canvas like a single touch point,
  // so menus can be advanced and steering can be tested on desktop too.
  let mouseDown = false;
  const mouseId = "__mouse__";
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    const side = sideOf(e.clientX, e.clientY);
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side, seq: ++_seq });
    state.pressed.add("Touch");
    recompute();
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    const tp = touchPoints.get(mouseId);
    const side = sideOf(e.clientX, e.clientY);
    if (tp && side !== tp.side) { tp.side = side; tp.seq = ++_seq; }
    if (tp) { tp.x = e.clientX; tp.y = e.clientY; }
    recompute();
  });
  window.addEventListener("mouseup", () => {
    mouseDown = false;
    touchPoints.delete(mouseId);
    recompute();
  });
  // Also accept a click on toolbar-free area as "Touch" press for browsers that fire only click.
  canvas.addEventListener("click", () => {
    state.pressed.add("Touch");
  });
}

function bindSteerButtons() {
  const btnL = document.getElementById("btn-steer-left");
  const btnR = document.getElementById("btn-steer-right");
  if (!btnL || !btnR) return;
  const press = (side) => {
    btnHeld[side] = ++_seq;
    state.pressed.add("Touch");
    recompute();
  };
  const release = (side) => {
    btnHeld[side] = 0;
    recompute();
  };
  // Pointer events cover both touch and mouse in one binding.
  //
  // Register the press FIRST, then attempt the capture, and never let a failed
  // capture escape. setPointerCapture throws NotFoundError when the pointer id is
  // not currently active — a very fast tap, or a pointer the browser has already
  // released. With the capture call first that exception aborted the handler
  // before press() ever ran, so the pad silently did nothing and the car did not
  // turn. Steering is this game's ONLY control (auto gas, no brake); it must
  // never depend on pointer capture succeeding.
  const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch {} };
  btnL.addEventListener("pointerdown", (e) => { e.preventDefault(); press("L"); capture(btnL, e); });
  btnL.addEventListener("pointerup",   (e) => { e.preventDefault(); release("L"); });
  btnL.addEventListener("pointercancel",(e)=> { release("L"); });
  btnL.addEventListener("pointerleave",(e) => { release("L"); });
  btnR.addEventListener("pointerdown", (e) => { e.preventDefault(); press("R"); capture(btnR, e); });
  btnR.addEventListener("pointerup",   (e) => { e.preventDefault(); release("R"); });
  btnR.addEventListener("pointercancel",(e)=> { release("R"); });
  btnR.addEventListener("pointerleave",(e) => { release("R"); });
  // Block native context menu / drag.
  btnL.addEventListener("contextmenu", (e) => e.preventDefault());
  btnR.addEventListener("contextmenu", (e) => e.preventDefault());
}

let _bound = false;
export function initInput(canvas) {
  if (_bound) return;
  _bound = true;
  bindPointer(canvas);
  bindSteerButtons();
}

export function getInput() {
  return state;
}

// Edge-triggered press check — consumes the press.
export function consumePress(...keys) {
  for (const k of keys) {
    if (state.pressed.has(k)) {
      state.pressed.delete(k);
      return true;
    }
  }
  return false;
}

// Any input (keyboard key or touch) since last call — also consumes.
export function consumeAnyPress() {
  if (state.pressed.size > 0) {
    state.pressed.clear();
    return true;
  }
  return false;
}

// Drop every queued press WITHOUT reporting it. Call this on a state transition
// so input from the previous screen can't leak into the next one. This is what
// stops a game-over from auto-retrying: "Touch" is never consumed during a race,
// so the tap the player was holding when they died would otherwise still be
// sitting in the queue and instantly trigger the tap-to-retry.
export function clearPresses() {
  state.pressed.clear();
}

// Drop every HELD input as well as the queued presses.
//
// clearPresses() only drains the edge-triggered queue — it does NOT touch
// heldKeys / touchPoints / btnHeld, so `state.steer` stays latched. That matters
// when the app is BACKGROUNDED: a phone call, a notification, or an app switch
// takes the touch away without the browser ever delivering touchend (or keyup,
// on an alt-tab). The held steer therefore survived the auto-pause, and the
// player resumed with the car steering hard into the wall, nothing on screen.
// Measured before this fix: steer stayed at 1 across a blur, for both a held key
// and a held touch, and clearPresses() did not clear it.
export function releaseAllInput() {
  heldKeys.clear();
  touchPoints.clear();
  btnHeld.L = 0;
  btnHeld.R = 0;
  state.pressed.clear();
  recompute();
}
