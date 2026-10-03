# Tower Blocks for PewPlay

This directory contains the original static game adapted for the PewPlay game template. Open `index.html` to play.

`game.json` holds the game page text. `preview.png` and `cover.png` provide the page images. The PewPlay workflow checks pushes to `preview` and `main`. The game remains a draft until you remove `"draft": true` after reviewing it.

Game controls: Drop each moving block onto the tower. Keep the stack aligned as it grows.

## Second pass (October 2026)

- three.js r83 and GSAP were loaded from cdnjs and the Comfortaa font from Google Fonts. They were not in the repo, so `script.js` now draws the same isometric scene with a small built-in Canvas 2D renderer and its own tweens: no external requests, works from `file://`.
- Same rules and numbers as the original (block size, speeds, 0.3 tolerance for a perfect drop, cutting logic). The missed block now falls away instead of vanishing; perfect drops get a ring, a "Perfect" label and a chime.
- Scene scaled to every screen (whole sliding range always visible), sharp on high-DPI screens; on short screens the view moves down so the game-over text does not cover the tower.
- Start / game over / restart in the page, best score in `tower-blocks:best`, pause on hidden tab (P/Esc), mute button (M) saved in `tower-blocks:muted`.
- New cover and three screenshots in `screenshots/`.
