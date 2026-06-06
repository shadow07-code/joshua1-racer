// Unified input — keyboard + canvas-touch + on-screen steer buttons.
// No brake handling — game is auto-accelerate.
import { KEYS } from "./config.js";

const state = {
  steer: 0,
  brake: false,                 // legacy: always false now (kept so callers don't break)
  pressed: new Set(),           // edge-triggered, consumed by main loop
};

const heldKeys = new Set();
const touchPoints = new Map(); // identifier -> { x, y } — menu "Touch" detection
// Floating analog steering slider: `active` while a finger is held in the lower
// band; `value` is -1..1, proportional to how far the thumb has slid sideways
// from where it first touched (`anchorX`). `radius` = px of travel for full lock.
const analog = { active: false, value: 0, anchorX: 0, radius: 72 };

function recompute() {
  let s = 0;
  if (KEYS.left.some(k => heldKeys.has(k))) s -= 1;
  if (KEYS.right.some(k => heldKeys.has(k))) s += 1;
  // The floating analog slider overrides the keyboard while a finger is down,
  // giving proportional steering (how far you slide = how hard you turn).
  if (analog.active) s = analog.value;
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

// Only the bottom half of the screen steers — the two bottom quadrants
// (bottom-left = steer left, bottom-right = steer right). The top half is a
// neutral "watch the road" zone so high taps don't accidentally steer.
const STEER_TOP_FRAC = 0.5;

function bindPointer(canvas) {
  // Returns "L"/"R" for a touch in the bottom quadrants, or null for a neutral
  // (top-half) touch. Taps anywhere still count as a menu "Touch" press.
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
      touchPoints.set(t.identifier, { x: t.clientX, y: t.clientY, side: sideOf(t.clientX, t.clientY) });
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
    touchPoints.set(mouseId, { x: e.clientX, y: e.clientY, side: sideOf(e.clientX, e.clientY) });
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

// Floating analog steering slider. The #steer-controls div is an invisible touch
// surface over the lower band; pressing anywhere in it pops the slider up under
// the thumb, and sliding sideways sets a proportional steer value. One thumb,
// left/right only, self-centering on release.
function bindSteerSlider() {
  const surface = document.getElementById("steer-controls");
  const slider = document.getElementById("steer-slider");
  const knob = document.getElementById("steer-knob");
  if (!surface || !slider) return;
  const R = analog.radius;
  const setKnob = (dx) => {
    if (knob) knob.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
  };

  surface.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { surface.setPointerCapture(e.pointerId); } catch (_) {}
    analog.active = true;
    analog.anchorX = e.clientX;
    analog.value = 0;
    slider.style.left = e.clientX + "px";
    slider.style.top = e.clientY + "px";
    slider.classList.add("show");
    setKnob(0);
    state.pressed.add("Touch");   // also counts as a tap (menus / pause-resume)
    recompute();
  });
  surface.addEventListener("pointermove", (e) => {
    if (!analog.active) return;
    e.preventDefault();
    const dx = Math.max(-R, Math.min(R, e.clientX - analog.anchorX));
    setKnob(dx);
    analog.value = Math.abs(dx) < 5 ? 0 : dx / R;   // small centre deadzone
    recompute();
  });
  const end = () => {
    if (!analog.active) return;
    analog.active = false;
    analog.value = 0;
    slider.classList.remove("show");
    recompute();
  };
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);
  surface.addEventListener("contextmenu", (e) => e.preventDefault());
}

let _bound = false;
export function initInput(canvas) {
  if (_bound) return;
  _bound = true;
  bindPointer(canvas);
  bindSteerSlider();
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
