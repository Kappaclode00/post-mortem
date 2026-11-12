# Post-Mortem

A free, self-hosted game review and training app for your Chess.com games. It is a static web app (a PWA): no backend, no accounts, no API keys, no analytics, no AI service. Stockfish (the WebAssembly build, about 10 to 20 times faster than the asm.js build, with asm.js as a fallback) runs in your browser, and every lesson the app shows comes from Stockfish's output plus fixed rules written in `index.html`.

## How to use it

1. Open the site, type your Chess.com username, pick a month and how many months to load, then press **Load games**. Your username is remembered on that device.
2. On the **Games** tab press **Analyze** on a game, or **Analyze N unreviewed** for all of them. Depth is Fast (8), Standard (10) or Deep (13). Results are cached in your browser, so a game is analyzed once.
3. **Review** shows the board, an evaluation bar and graph, and the move list. It opens at your first mistake. Each mistake or blunder gets a plain-language lesson (what happened, why it was weaker, what to look for next time) plus the engine's best line.
4. **Patterns** shows accuracy, mistakes by phase and type, your costliest moves, an opening table, your 3 biggest weaknesses with a training suggestion each, and one strength.
5. **Train** turns your own mistakes into puzzles. Missed ones go into a retry queue.

## Install as an app

- **iPhone (Safari):** open the site, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the site, tap the menu, then **Install app** (or **Add to Home screen**).
- **Desktop Chrome or Edge:** use the install icon in the address bar.

Analyzed games work offline. Loading new games and analyzing new ones needs a connection.

## Files

`index.html` (all HTML, CSS and JS), `manifest.webmanifest`, `sw.js`, `icon.svg`, and `vendor/chess.js` (a same-origin copy of chess.js used only if the CDN copy cannot load, so the app also starts offline).

## Updating

Edit the files and `git push`. GitHub Pages and Cloudflare Pages both redeploy from the `main` branch. Bump `CACHE` in `sw.js` if you want installed copies to drop old cached files immediately (the service worker is network first, so they refresh on their own when online).

## Tests

```
./tests/fetch-deps.sh     # downloads chess.js 0.10.3 and stockfish.js 10.0.2 for tests
node tests/unit.test.js   # scoring, parsing and every coach detector, on real Chess.com PGNs and hand-built positions
python3 -m http.server 8123 &  # then, with Playwright installed:
SHOTS=/tmp node tests/e2e-local.js
```

## Credits and licences

- [Stockfish](https://stockfishchess.org/) via [stockfish.js 10.0.2](https://github.com/nmrugg/stockfish.js) (`stockfish.wasm.js` from jsDelivr, falling back to `stockfish.js` from cdnjs or jsDelivr) is loaded at run time from a public CDN into a Web Worker. Stockfish is **GPL-3.0** software. It is not bundled in this repository, but if you copy or redistribute the Stockfish files, the GPL applies to them.
- [chess.js](https://github.com/jhlywa/chess.js) 0.10.3 (BSD-2-Clause) for move generation and PGN parsing. `vendor/chess.js` is an unmodified copy.
- Schibsted Grotesk (SIL Open Font Licence) from Google Fonts, with a system font fallback.
- Game data comes from the public [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).
- This app's own code is MIT licensed (see `LICENSE`).

## Ideas for a version 2

Time-trouble stats from the `%clk` comments, an opening explorer using the free Lichess API, a month-over-month progress chart, and a comparison with a stronger player's games.
