// Unified input — keyboard + canvas-touch + on-screen steer buttons.
// No brake handling — game is auto-accelerate.
import { KEYS } from "./config.js";

const state = {
  steer: 0,
  brake: false,                 // legacy: always false now (kept so callers don't break)
  pressed: new Set(),           // edge-triggered, consumed by main loop
};

const heldKeys = new Set();
const touchPoints = new Map(); // identifier -> { x, y, side }
const btnHeld = { L: false, R: false }; // explicit on-screen-button state

function recompute() {
  let s = 0;
  if (KEYS.left.some(k => heldKeys.has(k))) s -= 1;
  if (KEYS.right.some(k => heldKeys.has(k))) s += 1;
  // On-screen buttons take priority — they're the new "official" mobile controls.
  if (btnHeld.L && !btnHeld.R) s = -1;
  else if (btnHeld.R && !btnHeld.L) s = 1;
  // Canvas-half touch as a fallback (kept for menus and casual taps).
  else {
    let leftTouch = false, rightTouch = false;
    for (const t of touchPoints.values()) {
      if (t.side === "L") leftTouch = true;
      else if (t.side === "R") rightTouch = true;
    }
    if (leftTouch && !rightTouch) s = -1;
    else if (rightTouch && !leftTouch) s = 1;
  }
  state.steer = Math.max(-1, Math.min(1, s));
  state.brake = false;
}

window.addEventListener("keydown", (e) => {
  // Prevent page scroll on arrows/space.
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) {
    e.preventDefault();
  }
  if (!heldKeys.has(e.key)) {
    heldKeys.add(e.key);
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
      touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY, side });
    }
    state.pressed.add("Touch");
    recompute();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tp = touchPoints.get(t.identifier);
      if (tp) { tp.x = t.clientX; tp.y = t.clientY; tp.side = sideOf(t.clientX, t.clientY); }
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
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side });
    state.pressed.add("Touch");
    recompute();
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side: sideOf(e.clientX, e.clientY) });
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
    btnHeld[side] = true;
    state.pressed.add("Touch");
    recompute();
  };
  const release = (side) => {
    btnHeld[side] = false;
    recompute();
  };
  // Pointer events cover both touch and mouse in one binding.
  btnL.addEventListener("pointerdown", (e) => { e.preventDefault(); btnL.setPointerCapture(e.pointerId); press("L"); });
  btnL.addEventListener("pointerup",   (e) => { e.preventDefault(); release("L"); });
  btnL.addEventListener("pointercancel",(e)=> { release("L"); });
  btnL.addEventListener("pointerleave",(e) => { release("L"); });
  btnR.addEventListener("pointerdown", (e) => { e.preventDefault(); btnR.setPointerCapture(e.pointerId); press("R"); });
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
