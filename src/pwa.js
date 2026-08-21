// Service worker registration + "Add to phone" install flow.
//
// A permanent button on the home/title screen (#btn-install) triggers the
// native install prompt where available (Android/Chrome/Edge), and shows manual
// "Share → Add to Home Screen" instructions on iOS Safari (which has no prompt).
// The bottom banner is reused as that instruction popup.
import { H } from "./config.js";
import { syncTitleControls } from "./ui.js";

const IOS_DISMISS_KEY = "joshua1.iosBannerDismissed";
const INSTALLED_KEY = "joshua1.installed";
const SPLASH_SEEN_KEY = "joshua1.installSplashSeen";

let stashedPrompt = null;          // captured beforeinstallprompt event
let _banner, _yes, _no, _msg;      // instruction banner elements
let _installBtn = null;            // permanent home-screen button
let _splash, _splashInstall, _splashBrowser;   // first-load install splash
let _installedThisSession = false; // user installed during this session

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
// Offer install whenever we're NOT already running as the installed (standalone)
// app, and the user hasn't installed during this session. We deliberately DON'T
// permanently suppress via the sticky INSTALLED_KEY flag — that flag previously
// kept the CTA hidden forever even when the app wasn't actually installed, which
// is the "install button never shows" bug we're fixing.
function shouldOfferInstall() {
  return !isStandalone() && !_installedThisSession;
}

function showBanner(ios) {
  if (!_banner) return;
  if (_msg) _msg.textContent = ios
    ? "TAP  SHARE  ⬆  THEN  ‘ADD TO HOME SCREEN’"
    : "OPEN BROWSER MENU ⋮ → ‘INSTALL APP’ / ‘ADD TO HOME SCREEN’";
  if (_yes) _yes.textContent = ios ? "GOT IT" : "GOT IT";
  _banner.classList.add("show");
}
function hideBanner() { if (_banner) _banner.classList.remove("show"); }

// Fire the native prompt if we have it; otherwise show manual instructions. Either
// way the first-load splash (if up) gets dismissed so the title is reachable.
async function doInstall() {
  if (stashedPrompt) {
    stashedPrompt.prompt();
    try { await stashedPrompt.userChoice; } catch {}
    stashedPrompt = null;
    hideBanner();
    dismissSplash();
  } else {
    // No native prompt available (iOS, or Android before the engagement heuristic
    // fires) — surface manual instructions. Drop the splash first so the banner,
    // which sits below it, is actually visible over the title.
    dismissSplash();
    showBanner(isIos());
  }
}

function removeInstallButton() {
  if (_installBtn) { _installBtn.classList.remove("show"); _installBtn.remove(); _installBtn = null; }
  syncTitleControls();   // the console is one row shorter now — re-centre it
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

  // Once installed, drop the button, the banner, and the splash for this session.
  window.addEventListener("appinstalled", () => {
    _installedThisSession = true;
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
    stashedPrompt = null;
    hideBanner();
    removeInstallButton();
    hideSplash();
  });

  if (_yes) _yes.addEventListener("click", () => {
    if (stashedPrompt) { doInstall(); }
    else { try { localStorage.setItem(IOS_DISMISS_KEY, "1"); } catch {} hideBanner(); }
  });
  if (_no) _no.addEventListener("click", () => hideBanner());
}

// First-load install splash — a full-screen gate shown once on a browser visit,
// translucent over the live title. Wired here; shown only when we should offer
// install AND it hasn't been seen/dismissed before.
export function initInstallSplash() {
  _splash = document.getElementById("install-splash");
  _splashInstall = document.getElementById("splash-install");
  _splashBrowser = document.getElementById("splash-browser");
  if (!_splash) return;
  if (_splashInstall) _splashInstall.addEventListener("click", (e) => { e.stopPropagation(); doInstall(); });
  if (_splashBrowser) _splashBrowser.addEventListener("click", (e) => { e.stopPropagation(); dismissSplash(); });
  let seen = false;
  try { seen = localStorage.getItem(SPLASH_SEEN_KEY) === "1"; } catch {}
  if (shouldOfferInstall() && !seen) _splash.classList.add("show");
}
// "Play in browser" / post-prompt: remember the choice and reveal the title.
function dismissSplash() {
  try { localStorage.setItem(SPLASH_SEEN_KEY, "1"); } catch {}
  hideSplash();
}
function hideSplash() { if (_splash) _splash.classList.remove("show"); }

// Permanent install button on the home screen.
export function initInstallButton() {
  _installBtn = document.getElementById("btn-install");
  if (!_installBtn) return;
  if (!shouldOfferInstall()) { removeInstallButton(); return; }
  _installBtn.addEventListener("click", (e) => { e.stopPropagation(); doInstall(); });
  // The app boots on the title/home screen, so show it right away — don't wait
  // for the first render() tick (keeps it visible even if the canvas is slow).
  setInstallButtonVisible(true);
}

// Show the button only where it makes sense (the title screen). main.js calls
// this on state changes. The button is a flow child of #title-controls, so it
// carries NO position of its own any more — ui.js places the whole console.
// (It used to self-anchor to a "TAP TO START" banner position that had long
// since moved, which is part of how the home screen drifted out of alignment.)
export function setInstallButtonVisible(show) {
  if (!_installBtn) return;
  _installBtn.classList.toggle("show", !!show);
  syncTitleControls();
}
