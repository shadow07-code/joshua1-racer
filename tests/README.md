# tests

Headless tests for Joshua 1 Racer. They run the real game code in Node, with no
browser: `harness.mjs` loads the literal `src/main.js` with a fake canvas that
records every draw, a fake Web Audio that logs every sound, fake touch and
keyboard input, and a clock the tests control.

Run every suite from the repo root:

    node tests/run_all.mjs

`node tests/run_all.mjs fun` runs only the suites whose file name contains
"fun", and any suite also runs on its own: `node tests/verify_fun.mjs`.

- `verify_*.mjs`, `soak.mjs`, `swcheck.mjs`: the pass/fail suites that `run_all.mjs` runs.
- `probes/`: measurements used when tuning. They print numbers rather than
  pass/fail, and several take minutes.
- `.gen/`: modules the harness regenerates on every run (gitignored).

This folder is never deployed: `.vercelignore` excludes it.
