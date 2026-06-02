// Joshua 1 Racer — service worker
// Network-first for the app shell (HTML/JS/manifest) so updates roll out the
// moment the player is online; cache-first for static icons. Falls back to the
// cache when offline so the installed PWA still launches.
const VERSION = "joshua1-v32";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./src/main.js",
  "./src/config.js",
  "./src/render.js",
  "./src/sprites.js",
  "./src/input.js",
  "./src/audio.js",
  "./src/road.js",
  "./src/maps.js",
  "./src/scoring.js",
  "./src/scenery.js",
  "./src/hud.js",
  "./src/pwa.js",
  "./src/ui.js",
  "./src/leaderboard.js",
  "./src/entities/player.js",
  "./src/entities/ai.js",
  "./src/entities/traffic.js",
  "./src/entities/oilspills.js",
  "./src/entities/cops.js",
  "./src/entities/smoke.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // `cache: "reload"` bypasses the browser's HTTP cache so we never precache
      // a stale copy of an asset. A missing optional asset doesn't fail install.
      Promise.all(
        ASSETS.map((url) =>
          fetch(new Request(url, { cache: "reload" }))
            .then((res) => { if (res && res.ok) return cache.put(url, res); })
            .catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Leaderboard API — always go to the network, never cache (live data).
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  // App shell = anything that holds the game's code/markup. Serve it
  // network-first so a fresh deploy is picked up immediately when online.
  const isShell = sameOrigin && (
    req.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".webmanifest")
  );

  if (isShell) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Static assets (icons, etc.) — cache-first for speed/offline.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && sameOrigin) {
            const clone = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
