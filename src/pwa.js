// Service worker registration + "Add to phone" install flow.
//
// A permanent button on the home/title screen (#btn-install) triggers the
// native install prompt where available (Android/Chrome/Edge), and shows manual
// "Share → Add to Home Screen" instructions on iOS Safari (which has no prompt).
// The bottom banner is reused as that instruction popup.
import { H } from "./config.js";

const IOS_DISMISS_KEY = "joshua1.iosBannerDismissed";
const INSTALLED_KEY = "joshua1.installed";

let stashedPrompt = null;          // captured beforeinstallprompt event
let _banner, _yes, _no, _msg;      // instruction banner elements
let _installBtn = null;            // permanent home-screen button

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // If the page was already controlled by a service worker, then a *new* worker
  // taking control means a fresh deploy just activated — reload once so the new
  // code/assets are actually used. Guarded so first-ever installs don't reload.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);
    }).catch(() => {
      // Non-fatal: SW just won't be available offline.
    });
  });
}

function isIos() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
         window.navigator.standalone === true;
}
function isInstalled() {
  try { return isStandalone() || localStorage.getItem(INSTALLED_KEY) === "1"; }
  catch { return isStandalone(); }
}

function showBanner(ios) {
  if (!_banner) return;
  if (_msg) _msg.textContent = ios
    ? "TAP  SHARE  ⬆  THEN  ‘ADD TO HOME SCREEN’"
    : "📲  ADD TO HOME SCREEN — PLAY OFFLINE";
  if (_yes) _yes.textContent = ios ? "GOT IT" : "INSTALL";
  _banner.classList.add("show");
}
function hideBanner() { if (_banner) _banner.classList.remove("show"); }

// Fire the native prompt if we have it; otherwise show manual instructions.
async function doInstall() {
  if (stashedPrompt) {
    stashedPrompt.prompt();
    try { await stashedPrompt.userChoice; } catch {}
    stashedPrompt = null;
    hideBanner();
  } else {
    showBanner(isIos());
  }
}

function removeInstallButton() {
  if (_installBtn) { _installBtn.classList.remove("show"); _installBtn.remove(); _installBtn = null; }
}

export function initInstallBanner() {
  _banner = document.getElementById("install-banner");
  _yes = document.getElementById("install-yes");
  _no = document.getElementById("install-no");
  _msg = document.getElementById("install-msg");

  // Capture the Android/Chrome/Edge prompt so the permanent button can fire it.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    stashedPrompt = e;
  });

  // Once installed, remember it and drop both the button and the banner.
  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
    stashedPrompt = null;
    hideBanner();
    removeInstallButton();
  });

  if (_yes) _yes.addEventListener("click", () => {
    if (stashedPrompt) { doInstall(); }
    else { try { localStorage.setItem(IOS_DISMISS_KEY, "1"); } catch {} hideBanner(); }
  });
  if (_no) _no.addEventListener("click", () => hideBanner());
}

// Permanent install button on the home screen.
export function initInstallButton() {
  _installBtn = document.getElementById("btn-install");
  if (!_installBtn) return;
  if (isInstalled()) { removeInstallButton(); return; }
  _installBtn.addEventListener("click", (e) => { e.stopPropagation(); doInstall(); });
  // The app boots on the title/home screen, so show it right away — don't wait
  // for the first render() tick (keeps it visible even if the canvas is slow).
  setInstallButtonVisible(true);
}

// Show the button only where it makes sense (the title screen). main.js calls
// this on state changes. When showing, position it just above the canvas-space
// "TAP TO START" banner (which sits at y = H − 118, 18px tall).
export function setInstallButtonVisible(show) {
  if (!_installBtn) return;
  _installBtn.classList.toggle("show", !!show);
  if (show) {
    // Canvas fills the viewport (object-fit: contain with matched aspect).
    // Scale factor = screen px per canvas px.
    const scale = window.innerHeight / H;
    // Banner top in canvas space is H-118.  Put the install button's bottom
    // edge 6 canvas-px above that → offset from viewport bottom = (118+6)*scale
    // plus the button's own height (handled by CSS bottom = distance to btn bottom).
    const bottomPx = (118 + 8) * scale;
    _installBtn.style.bottom = bottomPx + "px";
  }
}
