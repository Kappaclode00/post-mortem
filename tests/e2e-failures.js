// Failure paths, offline/PWA behaviour, mobile + dark mode screenshots (local Chromium, routed CDN bytes).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const T = __dirname; const real = require('./real-games.json'); const cors = { 'access-control-allow-origin': '*' };
const mk = (i, extra) => Object.assign({ url: real[i].url, pgn: real[i].pgn, time_class: 'blitz', rules: 'chess', end_time: 1790000000 - i, white: { username: real[i].pgn.match(/\[White "([^"]+)"/)[1], result: 'win', rating: 3000 }, black: { username: real[i].pgn.match(/\[Black "([^"]+)"/)[1], result: 'resigned', rating: 3000 } }, extra || {});
(async () => {
  const browser = await chromium.launch(); const out = {};
  async function newPage(opts, sf) {
    const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 900 } });
    const page = await ctx.newPage(); const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
    await ctx.route('**/chess.min.js', r => r.abort());  // force the same-origin vendor fallback
    await ctx.route(/stockfish(\.wasm)?(\.js)?$/, r => { const u = r.request().url(); if (!sf) return r.fulfill({ status: 404, headers: cors, body: 'nope' }); const n = /\.wasm\.js$/.test(u) ? 'stockfish-10.0.2.wasm.js' : /\.wasm$/.test(u) ? 'stockfish-10.0.2.wasm' : 'stockfish-10.0.2.js'; r.fulfill({ status: 200, contentType: /\.wasm$/.test(u) ? 'application/wasm' : 'application/javascript', headers: cors, body: fs.readFileSync(path.join(T, n)) }); });
    await ctx.route('**/fonts.g*apis.com/**', r => r.abort());
    const st = { offline: false }; ctx._st = st;
    await ctx.route('https://api.chess.com/**', r => st.offline ? r.abort('internetdisconnected') : r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ games: [mk(0), mk(1), mk(1, { url: 'https://www.chess.com/game/live/999', end_time: 5, pgn: '[Event "x"]\n\nthis is not a pgn at all' })] }) }));
    return { ctx, page, logs };
  }
  // 1. vendor fallback + engine failure + bad PGN
  let { ctx, page, logs } = await newPage(null, false);
  await page.goto('http://localhost:8123/index.html'); await page.waitForFunction(() => window.__pm);
  out.vendorFallbackChess = await page.evaluate(() => typeof Chess);
  await page.fill('#user', 'hikaru'); await page.fill('#month', '2026-10'); await page.click('#loadBtn'); await page.waitForSelector('li.game');
  await page.click('li.game:nth-child(1) button[data-act=analyze]');
  await page.waitForFunction(() => /Stockfish could not be loaded/.test(document.getElementById('msg').textContent), null, { timeout: 60000 });
  out.engineFail = await page.textContent('#msg');
  await ctx.close();
  // 2. bad PGN with working engine; then offline reload
  ({ ctx, page, logs } = await newPage(null, true));
  await page.goto('http://localhost:8123/index.html'); await page.waitForFunction(() => window.__pm);
  await page.fill('#user', 'hikaru'); await page.fill('#month', '2026-10'); await page.click('#loadBtn'); await page.waitForSelector('li.game');
  await page.click('#analyzeAll'); await page.waitForFunction(() => !window.__pm.S.busy && document.querySelectorAll('li.game button[data-act=review]').length >= 1, null, { timeout: 300000 });
  out.badPgnRow = (await page.textContent('li.game:nth-child(3)')).replace(/\s+/g, ' ');
  out.analyzeBtn = await page.textContent('#analyzeAll');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready);
  out.swControlled = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); });
  await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller);
  ctx._st.offline = true; await ctx.setOffline(true); await page.reload(); await page.waitForSelector('li.game', { timeout: 15000 });
  out.offlineRows = await page.locator('li.game').count();
  out.offlineChess = await page.evaluate(() => typeof Chess);
  await page.click('li.game:nth-child(1) button[data-act=review]'); await page.waitForSelector('#rv:not([hidden])');
  out.offlineReview = (await page.textContent('#detail')).slice(0, 60);
  await page.fill('#user', 'hikaru'); await page.click('#loadBtn'); await page.waitForSelector('#msg .note');
  out.offlineLoadMsg = await page.textContent('#msg');
  out.logs = logs.filter(l => !/Failed to load|ERR_/.test(l)).slice(0, 8);
  await ctx.close();
  // 3. phone + dark mode
  ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true }, true));
  await page.goto('http://localhost:8123/index.html'); await page.waitForFunction(() => window.__pm);
  await page.fill('#user', 'hikaru'); await page.fill('#month', '2026-10'); await page.click('#loadBtn'); await page.waitForSelector('li.game');
  await page.click('li.game:nth-child(1) button[data-act=analyze]'); await page.waitForSelector('#rv:not([hidden])', { timeout: 300000 });
  await page.screenshot({ path: process.env.SHOTS + '/m1-review-dark.png', fullPage: true });
  out.hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.click('nav button[data-tab=games]'); await page.screenshot({ path: process.env.SHOTS + '/m2-games-dark.png', fullPage: true });
  console.log(JSON.stringify(out, null, 1)); await browser.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
