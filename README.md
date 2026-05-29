# Joshua 1 Racer

A 2D 8-bit GameBoy-style top-down car racing game. Endless survival mode, two maps (City + Jungle), 5 AI competitors on Medium or Hard, chiptune music in Bm/Gm, and a wanted-meter chase system — cops in the city, tigers + elephants in the jungle.

Pure vanilla HTML5 Canvas + JS. No build step, no dependencies. Installable as a PWA.

## Run locally

Open `index.html` directly in any modern browser, or serve it for full PWA features:

```
npx serve .
# or
python -m http.server 5500
```

Then open the printed URL.

## Controls

- **Desktop:** Left/Right arrows = steer, M = mute, P = pause, Esc = back to menu. Car auto-accelerates (no brake).
- **Mobile:** Tap the left/right half of the screen to steer. Car auto-accelerates (no brake).

## Optional: generate PNG icons for older iOS

The PWA ships with SVG icons in the manifest, which work on all modern browsers. If you want PNG fallbacks (older iOS Safari, some app stores), open `tools/generate-icons.html` in a browser and click each download button — save the PNGs into `icons/`, then add the corresponding entries back into `manifest.webmanifest`.

## Deploy to Vercel

```
npm i -g vercel
vercel             # first run — accept defaults
vercel --prod      # gives you the shareable prod URL
```

Share the prod URL with friends. On first load, an "Add to Home Screen" banner appears so they can install it as a real app.

## Project layout

```
index.html
manifest.webmanifest
sw.js
vercel.json
icons/
src/
  main.js          # game loop + state machine
  config.js        # palette, dims, tunables
  input.js         # keyboard + touch
  audio.js         # chiptune engine + Bm/Gm tracker + SFX
  render.js        # canvas helpers
  sprites.js       # pixel grids
  road.js          # curvy bottom-up scroll
  maps.js          # city + jungle data
  scoring.js       # score + high-score persistence
  hud.js
  pwa.js           # SW register + install banner
  entities/
    player.js
    ai.js
    hazards.js
    pickups.js
    cops.js        # cops / tigers / elephants
```
