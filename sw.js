// Joshua 1 Racer — service worker
// Cache-first for app shell; network-fallback for everything else.
const VERSION = "joshua1-v12";
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
  "./src/entities/player.js",
  "./src/entities/ai.js",
  "./src/entities/traffic.js",
  "./src/entities/oilspills.js",
  "./src/entities/smoke.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // Use addAll with allSettled-like behavior so a missing optional asset doesn't fail install.
      Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch(() => {
            // Optional assets (like maskable PNG variants) may be absent in dev.
          })
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

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Cache successful same-origin responses opportunistically.
          if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
            const clone = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
