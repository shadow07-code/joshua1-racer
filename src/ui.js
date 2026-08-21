// DOM wiring for the HTML overlays layered over the canvas: the title-screen
// LEADERBOARD button, the pre-race name-entry panel, the leaderboard panel, and
// the game-over action bar. main.js owns game state; this module just shows/hides
// the overlays and reports user intent back through callbacks.

import { sanitizeName, getPlayerName } from "./leaderboard.js";
import { W, H, PALETTE } from "./config.js";
import { TITLE_BAND } from "./hud.js";

let el = {};            // cached elements
let cb = {};            // callbacks supplied by main.js

export function initUI(callbacks) {
  cb = callbacks || {};
  el = {
    btnLeaderboard: document.getElementById("btn-leaderboard"),
    btnName: document.getElementById("btn-name"),
    btnGarage: document.getElementById("btn-garage"),
    btnInstall: document.getElementById("btn-install"),
    titleControls: document.getElementById("title-controls"),
    garagePanel: document.getElementById("garage"),
    garageList: document.getElementById("garage-list"),
    garageWallet: document.getElementById("garage-wallet"),
    garageBack: document.getElementById("garage-back"),
    soundControls: document.getElementById("sound-controls"),
    namePanel: document.getElementById("name-entry"),
    nameInput: document.getElementById("name-input"),
    nameStart: document.getElementById("name-start"),
    nameBack: document.getElementById("name-back"),
    lbPanel: document.getElementById("leaderboard"),
    lbList: document.getElementById("lb-list"),
    lbStatus: document.getElementById("lb-status"),
    lbBack: document.getElementById("lb-back"),
    goActions: document.getElementById("gameover-actions"),
    goAgain: document.getElementById("go-again"),
    goShare: document.getElementById("go-share"),
    goBoard: document.getElementById("go-board"),
    goExit: document.getElementById("go-exit"),
    pausePanel: document.getElementById("pause-menu"),
    pauseResume: document.getElementById("pause-resume"),
    pauseRestart: document.getElementById("pause-restart"),
    pauseQuit: document.getElementById("pause-quit"),
  };

  // Title LEADERBOARD button.
  if (el.btnLeaderboard) {
    el.btnLeaderboard.addEventListener("click", (e) => {
      e.stopPropagation();
      cb.onOpenLeaderboard && cb.onOpenLeaderboard();
    });
  }

  // Title CHANGE NAME button — opens the rename dialog (never on Play).
  if (el.btnName) {
    el.btnName.addEventListener("click", (e) => {
      e.stopPropagation();
      cb.onOpenNameEdit && cb.onOpenNameEdit();
    });
  }

  // Title GARAGE button + the panel's BACK.
  if (el.btnGarage) {
    el.btnGarage.addEventListener("click", (e) => {
      e.stopPropagation();
      cb.onOpenGarage && cb.onOpenGarage();
    });
  }
  if (el.garageBack) {
    el.garageBack.addEventListener("click", (e) => {
      e.stopPropagation();
      cb.onGarageBack && cb.onGarageBack();
    });
  }

  // Name entry.
  const confirmName = () => {
    const clean = sanitizeName(el.nameInput ? el.nameInput.value : "") || "AAA";
    cb.onNameConfirm && cb.onNameConfirm(clean);
  };
  if (el.nameStart) el.nameStart.addEventListener("click", (e) => { e.stopPropagation(); confirmName(); });
  if (el.nameBack) el.nameBack.addEventListener("click", (e) => { e.stopPropagation(); cb.onNameBack && cb.onNameBack(); });
  if (el.nameInput) {
    el.nameInput.addEventListener("keydown", (e) => {
      e.stopPropagation();   // keep typing out of the game's global key handlers
      if (e.key === "Enter") { e.preventDefault(); confirmName(); }
      else if (e.key === "Escape") { e.preventDefault(); cb.onNameBack && cb.onNameBack(); }
    });
    el.nameInput.addEventListener("keyup", (e) => e.stopPropagation());
  }

  // Leaderboard panel.
  if (el.lbBack) el.lbBack.addEventListener("click", (e) => { e.stopPropagation(); cb.onLeaderboardBack && cb.onLeaderboardBack(); });

  // Game-over actions.
  if (el.goAgain) el.goAgain.addEventListener("click", (e) => { e.stopPropagation(); cb.onPlayAgain && cb.onPlayAgain(); });
  if (el.goShare) el.goShare.addEventListener("click", (e) => { e.stopPropagation(); cb.onShareScore && cb.onShareScore(); });
  if (el.goBoard) el.goBoard.addEventListener("click", (e) => { e.stopPropagation(); cb.onGameOverLeaderboard && cb.onGameOverLeaderboard(); });
  if (el.goExit) el.goExit.addEventListener("click", (e) => { e.stopPropagation(); cb.onExit && cb.onExit(); });

  // Pause menu.
  if (el.pauseResume) el.pauseResume.addEventListener("click", (e) => { e.stopPropagation(); cb.onPauseResume && cb.onPauseResume(); });
  if (el.pauseRestart) el.pauseRestart.addEventListener("click", (e) => { e.stopPropagation(); cb.onPauseRestart && cb.onPauseRestart(); });
  if (el.pauseQuit) el.pauseQuit.addEventListener("click", (e) => { e.stopPropagation(); cb.onPauseQuit && cb.onPauseQuit(); });

  // Keep the control console aligned when the viewport changes (rotation,
  // browser chrome collapsing, desktop resize).
  window.addEventListener("resize", () => {
    if (el.titleControls && el.titleControls.classList.contains("show")) positionTitleUI();
  });
}

function toggle(node, show) { if (node) node.classList.toggle("show", !!show); }

// Map a canvas-Y (0..H) to a screen-Y in px, honouring object-fit:contain
// letterboxing, so the HTML pills line up with what the canvas actually draws.
function titleMetrics() {
  const cv = document.getElementById("game");
  if (!cv) return { offY: 0, scale: (window.innerHeight || H) / H };
  const r = cv.getBoundingClientRect();
  const arC = W / H, arB = r.width / Math.max(1, r.height);
  let drawH, offY;
  if (arB > arC) { drawH = r.height; offY = r.top; }                     // bars left/right
  else { drawH = r.width / arC; offY = r.top + (r.height - drawH) / 2; } // bars top/bottom
  return { offY, scale: drawH / H };
}

// Centre the ONE control console inside TITLE_BAND — the band hud.js paints on
// the canvas for exactly this purpose. Because both sides read the same two
// numbers, the controls can never land on top of canvas text the way the old
// hard-coded y67 stack landed on the daily strip. If the console is taller than
// the band (very short canvases), it top-aligns and is allowed to spill down
// over the hero car rather than being clipped.
// Resolved lazily: pwa.js can show the install button at import time, BEFORE
// initUI() has cached any elements, and the console must still appear.
function consoleNode() {
  if (!el.titleControls) el.titleControls = document.getElementById("title-controls");
  return el.titleControls;
}

export function positionTitleUI() {
  const node = consoleNode();
  if (!node || !node.classList.contains("show")) return;
  const m = titleMetrics();
  const bandTop = m.offY + TITLE_BAND.top * m.scale;
  const bandH = (TITLE_BAND.bottom - TITLE_BAND.top) * m.scale;
  const h = node.offsetHeight || 0;
  node.style.top = Math.round(bandTop + Math.max(0, (bandH - h) / 2)) + "px";
}

// The console is shown whenever any of its controls is. EVERY setter routes
// through here — including pwa.js's install toggle — so a control can never be
// marked visible while the container that holds it is still display:none.
export function syncTitleControls() {
  const node = consoleNode();
  if (!node) return;
  const any = ["btn-install", "btn-leaderboard", "btn-garage", "btn-name", "sound-controls"]
    .some(id => document.getElementById(id)?.classList.contains("show"));
  node.classList.toggle("show", any);
  if (any) positionTitleUI();
}

export function setLeaderboardButtonVisible(show) {
  toggle(el.btnLeaderboard, show);
  syncTitleControls();
}

export function setNameButtonVisible(show) {
  toggle(el.btnName, show);
  syncTitleControls();
}

export function setGarageButtonVisible(show) {
  toggle(el.btnGarage, show);
  syncTitleControls();
}

export function showGaragePanel(show) { toggle(el.garagePanel, show); }

// Render a pixel sprite (2D palette-index array, -1 = transparent) into a canvas
// element for the garage rows — keeps the car previews true to the in-game art.
function spriteCanvas(sprite, scale = 2) {
  const h = sprite.length;
  let w = 0;
  for (const row of sprite) if (row.length > w) w = row.length;
  const cv = document.createElement("canvas");
  cv.width = w * scale; cv.height = h * scale;
  const c = cv.getContext("2d");
  for (let y = 0; y < h; y++) {
    const row = sprite[y];
    for (let x = 0; x < row.length; x++) {
      const idx = row[x];
      if (idx < 0) continue;
      c.fillStyle = PALETTE[idx];
      c.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return cv;
}

// Build the garage list. data = { cars, wallet, owned, selected, spriteFor }.
// Owned cars are tappable to equip; locked ones show their price (and how close
// the wallet is for the cheapest one).
export function renderGarage(data) {
  if (!el.garageList) return;
  const { cars = [], wallet = 0, owned = [], selected = "rosso", spriteFor } = data || {};
  if (el.garageWallet) el.garageWallet.textContent = "BANK " + wallet;
  el.garageList.innerHTML = "";

  let firstLocked = true;
  for (const car of cars) {
    const isOwned = owned.includes(car.id);
    const isEquipped = isOwned && car.id === selected;

    const row = document.createElement("div");
    row.className = "garage-row" + (isOwned ? "" : " locked") + (isEquipped ? " equipped" : "");

    if (spriteFor) row.appendChild(spriteCanvas(spriteFor(car.id), 2));

    const name = document.createElement("span");
    name.className = "car-name";
    name.textContent = car.name;

    const state = document.createElement("span");
    state.className = "car-state";
    if (isEquipped) state.textContent = "EQUIPPED";
    else if (isOwned) state.textContent = "TAP TO USE";
    else if (firstLocked) { state.textContent = wallet + "/" + car.price; firstLocked = false; }
    else state.textContent = String(car.price);

    row.appendChild(name);
    row.appendChild(state);

    if (isOwned && !isEquipped) {
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        cb.onGaragePick && cb.onGaragePick(car.id);
      });
    }
    el.garageList.appendChild(row);
  }
}

export function setSoundControlsVisible(show) {
  toggle(el.soundControls, show);
  syncTitleControls();
}

export function showNameEntry(show) {
  toggle(el.namePanel, show);
  if (show && el.nameInput) {
    el.nameInput.value = getPlayerName();
    // Focus + select so the remembered name can be confirmed or typed over.
    setTimeout(() => { try { el.nameInput.focus(); el.nameInput.select(); } catch {} }, 30);
  }
}

export function showGameOverActions(show) { toggle(el.goActions, show); }

export function showPauseMenu(show) { toggle(el.pausePanel, show); }

export function showLeaderboardPanel(show) { toggle(el.lbPanel, show); }

// Render the board. data = { entries, offline, unconfigured }. Highlights the
// row matching `playerName`.
export function renderLeaderboard(data, playerName) {
  if (!el.lbList) return;
  const entries = (data && data.entries) || [];
  const mine = sanitizeName(playerName || "");
  el.lbList.innerHTML = "";

  if (el.lbStatus) {
    if (data && data.unconfigured) el.lbStatus.textContent = "LEADERBOARD UNAVAILABLE";
    else if (data && data.offline) el.lbStatus.textContent = "OFFLINE — SHOWING CACHED";
    else if (!entries.length) el.lbStatus.textContent = "NO SCORES YET — BE THE FIRST!";
    else el.lbStatus.textContent = "";
    el.lbStatus.classList.toggle("show", !!el.lbStatus.textContent);
  }

  let highlighted = false;
  for (const en of entries) {
    const row = document.createElement("div");
    row.className = "lb-row";
    if (!highlighted && mine && en.name === mine) { row.classList.add("me"); highlighted = true; }

    const rank = document.createElement("span");
    rank.className = "lb-rank";
    rank.textContent = String(en.rank).padStart(2, "0");

    const name = document.createElement("span");
    name.className = "lb-name";
    name.textContent = en.name;

    const score = document.createElement("span");
    score.className = "lb-score";
    score.textContent = String(en.score).padStart(6, "0");

    row.appendChild(rank);
    row.appendChild(name);
    row.appendChild(score);
    el.lbList.appendChild(row);
  }
}
