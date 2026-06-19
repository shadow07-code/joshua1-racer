// DOM wiring for the HTML overlays layered over the canvas: the title-screen
// LEADERBOARD button, the pre-race name-entry panel, the leaderboard panel, and
// the game-over action bar. main.js owns game state; this module just shows/hides
// the overlays and reports user intent back through callbacks.

import { sanitizeName, getPlayerName } from "./leaderboard.js";
import { H } from "./config.js";

let el = {};            // cached elements
let cb = {};            // callbacks supplied by main.js

export function initUI(callbacks) {
  cb = callbacks || {};
  el = {
    btnLeaderboard: document.getElementById("btn-leaderboard"),
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
  if (el.goBoard) el.goBoard.addEventListener("click", (e) => { e.stopPropagation(); cb.onGameOverLeaderboard && cb.onGameOverLeaderboard(); });
  if (el.goExit) el.goExit.addEventListener("click", (e) => { e.stopPropagation(); cb.onExit && cb.onExit(); });

  // Pause menu.
  if (el.pauseResume) el.pauseResume.addEventListener("click", (e) => { e.stopPropagation(); cb.onPauseResume && cb.onPauseResume(); });
  if (el.pauseRestart) el.pauseRestart.addEventListener("click", (e) => { e.stopPropagation(); cb.onPauseRestart && cb.onPauseRestart(); });
  if (el.pauseQuit) el.pauseQuit.addEventListener("click", (e) => { e.stopPropagation(); cb.onPauseQuit && cb.onPauseQuit(); });

  // Keep the title buttons aligned when the viewport changes.
  window.addEventListener("resize", () => {
    if ((el.btnLeaderboard && el.btnLeaderboard.classList.contains("show")) ||
        (el.soundControls  && el.soundControls.classList.contains("show"))) {
      positionTitleUI();
    }
  });
}

function toggle(node, show) { if (node) node.classList.toggle("show", !!show); }

// Place the title-screen buttons stacked above the "TAP TO START" banner
// (banner top = H-118 in canvas units). From bottom to top:
//   install  → leaderboard  → sound controls
// All anchored relative to that same banner so they read as one vertical column.
export function positionTitleUI() {
  const scale = window.innerHeight / H;
  const installBottom = (118 + 8) * scale;
  if (el.btnLeaderboard) el.btnLeaderboard.style.bottom = (installBottom + 48) + "px";
  if (el.soundControls)  el.soundControls.style.bottom  = (installBottom + 100) + "px";
}

export function setLeaderboardButtonVisible(show) {
  toggle(el.btnLeaderboard, show);
  if (show) positionTitleUI();
}

export function setSoundControlsVisible(show) {
  toggle(el.soundControls, show);
  if (show) positionTitleUI();
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
