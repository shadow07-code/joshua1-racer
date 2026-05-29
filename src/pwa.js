// Service worker registration + Add-to-Home-Screen banner (Android Chrome + iOS Safari fallback).

const COOLDOWN_DAYS = 7;
const COOLDOWN_KEY = "joshua1.installBannerCooldown";
const IOS_DISMISS_KEY = "joshua1.iosBannerDismissed";
const INSTALLED_KEY = "joshua1.installed";

let stashedPrompt = null;

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  // If the page was already controlled by a service worker, then a *new* worker
  // taking control means a fresh deploy just activated — reload once so the new
  // code/assets are actually used (otherwise the player keeps the old version
  // until they manually refresh). Guarded so first-ever installs don't reload.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    window.location.reload();
  });

  // Defer registration until window load to avoid competing with first paint.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      // Check for an update now, and again periodically while the app is open.
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

function inCooldown() {
  try {
    const t = parseInt(localStorage.getItem(COOLDOWN_KEY) || "0", 10);
    if (!t) return false;
    return (Date.now() - t) < COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}

function setCooldown() {
  try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch {}
}

export function initInstallBanner() {
  const banner = document.getElementById("install-banner");
  const yes = document.getElementById("install-yes");
  const no = document.getElementById("install-no");
  const msg = document.getElementById("install-msg");
  if (!banner || !yes || !no || !msg) return;

  // Already installed (standalone or marked) — nothing to do.
  if (isStandalone() || localStorage.getItem(INSTALLED_KEY) === "1") return;

  // Capture Chrome/Edge/Android prompt.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    stashedPrompt = e;
    if (!inCooldown()) showBanner(false);
  });

  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
    hideBanner();
  });

  // iOS Safari fallback (no beforeinstallprompt).
  if (isIos() && !isStandalone() && !localStorage.getItem(IOS_DISMISS_KEY) && !inCooldown()) {
    // Slight delay so title screen renders first.
    setTimeout(() => showBanner(true), 1500);
  }

  yes.addEventListener("click", async () => {
    if (stashedPrompt) {
      stashedPrompt.prompt();
      try { await stashedPrompt.userChoice; } catch {}
      stashedPrompt = null;
      hideBanner();
    } else {
      // iOS — just hide and remember.
      try { localStorage.setItem(IOS_DISMISS_KEY, "1"); } catch {}
      hideBanner();
    }
  });

  no.addEventListener("click", () => {
    setCooldown();
    hideBanner();
  });

  function showBanner(ios) {
    msg.textContent = ios
      ? "TAP SHARE → ADD TO HOME SCREEN"
      : "📲 ADD TO HOME SCREEN — PLAY OFFLINE";
    if (ios) yes.textContent = "OK";
    banner.classList.add("show");
  }

  function hideBanner() {
    banner.classList.remove("show");
  }
}
