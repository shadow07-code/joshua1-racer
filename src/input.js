// Unified input — keyboard + touch → { steer: -1..1, brake: bool, justPressed: Set }
import { KEYS, W, H } from "./config.js";

const state = {
  steer: 0,
  brake: false,
  // Edge-triggered (consumed by main loop each frame).
  pressed: new Set(),
};

const heldKeys = new Set();
const touchPoints = new Map(); // identifier -> { x, y, side }

function recompute() {
  let s = 0;
  // Keyboard
  if (KEYS.left.some(k => heldKeys.has(k))) s -= 1;
  if (KEYS.right.some(k => heldKeys.has(k))) s += 1;
  // Touch — each active finger on left/right side adds
  let leftTouch = false, rightTouch = false;
  for (const t of touchPoints.values()) {
    if (t.side === "L") leftTouch = true;
    else if (t.side === "R") rightTouch = true;
  }
  if (leftTouch && !rightTouch) s = -1;
  else if (rightTouch && !leftTouch) s = 1;
  state.steer = Math.max(-1, Math.min(1, s));

  const keyBrake = KEYS.brake.some(k => heldKeys.has(k));
  const touchBrake = touchPoints.size >= 2;
  state.brake = keyBrake || touchBrake;
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

function bindPointer(canvas) {
  const sideOf = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    return localX < rect.width / 2 ? "L" : "R";
  };
  // Touch
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY, side: sideOf(t.clientX) });
    }
    state.pressed.add("Touch");
    recompute();
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tp = touchPoints.get(t.identifier);
      if (tp) { tp.x = t.clientX; tp.y = t.clientY; tp.side = sideOf(t.clientX); }
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
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side: sideOf(e.clientX) });
    state.pressed.add("Touch");
    recompute();
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side: sideOf(e.clientX) });
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

let _bound = false;
export function initInput(canvas) {
  if (_bound) return;
  _bound = true;
  bindPointer(canvas);
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
