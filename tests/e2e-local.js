// Local end-to-end run in real Chromium with the real Stockfish 10.0.2 file.
// The cloud sandbox cannot reach the CDNs or api.chess.com, so those URLs are routed to identical local bytes / captured real Chess.com data.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const T = __dirname;
const real = require('./real-games.json');
const depth = process.env.DEPTH || '10';
const apiGames = real.map((g, i) => {
  const wh = g.pgn.match(/\[White "([^"]+)"/)[1], bl = g.pgn.match(/\[Black "([^"]+)"/)[1];
  const mkP = (n, r) => ({ username: n, rating: 3000, result: r });
  const hikaruWon = i === 0;
  return { url: g.url, pgn: g.pgn, time_class: i === 0 ? 'blitz' : 'bullet', rules: 'chess', end_time: 1790000000 - i * 1000,
    white: mkP(wh, wh.toLowerCase() === 'hikaru' ? (hikaruWon ? 'win' : 'checkmated') : (hikaruWon ? 'abandoned' : 'win')),
    black: mkP(bl, bl.toLowerCase() === 'hikaru' ? (hikaruWon ? 'win' : 'resigned') : (hikaruWon ? 'abandoned' : 'win')) };
});
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route('**/chess.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', headers: cors, body: fs.readFileSync(path.join(T, 'chess-0.10.3.js')) }));
  await ctx.route(/stockfish(\.wasm)?(\.js)?$/, r => {
    const u = r.request().url();
    const f = /\.wasm\.js$/.test(u) ? 'stockfish-10.0.2.wasm.js' : /\.wasm$/.test(u) ? 'stockfish-10.0.2.wasm' : 'stockfish-10.0.2.js';
    if (process.env.ASM_ONLY && /jsdelivr/.test(u) && /wasm/.test(u)) return r.fulfill({ status: 404, headers: cors, body: 'no' });
    r.fulfill({ status: 200, contentType: /\.wasm$/.test(u) ? 'application/wasm' : 'application/javascript', headers: cors, body: fs.readFileSync(path.join(T, f)) });
  });
  await ctx.route('**/fonts.g*apis.com/**', r => r.abort());
  await ctx.route('https://api.chess.com/**', r => {
    const u = r.request().url();
    if (/\/games\/2026\/10$/.test(u) && /hikaru/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ games: apiGames.concat([{ url: 'x', rules: 'chess960', pgn: '' }]) }) });
    if (/nosuchuser/.test(u)) return r.fulfill({ status: 404, headers: cors, body: '{}' });
    if (/ratelimit/.test(u)) return r.fulfill({ status: 429, headers: cors, body: '{}' });
    if (/\/pub\/player\/hikaru$/.test(u)) return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' });
    return r.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const out = {};
  await page.goto('http://localhost:8123/index.html');
  await page.waitForFunction(() => window.Chess && window.__pm);
  // failure paths
  await page.fill('#user', 'nosuchuser'); await page.fill('#month', '2026-10'); await page.click('#loadBtn');
  await page.waitForSelector('#msg .note'); out.unknownUser = await page.textContent('#msg');
  await page.fill('#user', 'ratelimit'); await page.click('#loadBtn'); await page.waitForFunction(() => /429/.test(document.getElementById('msg').textContent));
  out.rate429 = await page.textContent('#msg');
  await page.fill('#user', 'Hikaru'); await page.selectOption('#depth', depth); await page.selectOption('#months', '1'); await page.click('#loadBtn');
  await page.waitForSelector('li.game');
  out.gameCount = await page.locator('li.game').count();
  out.chips = await page.textContent('#chips');
  await page.screenshot({ path: process.env.SHOTS + '/01-games.png' });
  // analyze game 1 and time it
  const t0 = Date.now();
  await page.click('li.game:nth-child(1) button[data-act=analyze]');
  await page.waitForSelector('#rv:not([hidden])', { timeout: 600000 });
  out.analyzeSeconds0 = (Date.now() - t0) / 1000;
  out.reviewTitle = await page.textContent('#rvTitle');
  out.squares = await page.locator('#board .sq').count();
  out.moves = await page.locator('#movelist button').count();
  out.detail = (await page.textContent('#detail')).slice(0, 700);
  await page.screenshot({ path: process.env.SHOTS + '/02-review.png', fullPage: true });
  await page.keyboard.press('ArrowRight'); out.afterArrow = await page.textContent('#detail').then(t => t.slice(0, 80));
  await page.check('#showBest'); out.arrow = (await page.innerHTML('#arrow')).length > 20; await page.uncheck('#showBest');
  await page.click('#graph', { position: { x: 200, y: 50 } });
  // second game
  await page.click('nav button[data-tab=games]');
  const t1 = Date.now();
  await page.click('li.game:nth-child(2) button[data-act=analyze]');
  await page.waitForSelector('#rv:not([hidden])', { timeout: 600000 });
  out.analyzeSeconds1 = (Date.now() - t1) / 1000;
  out.detail2 = (await page.textContent('#detail')).slice(0, 900);
  await page.screenshot({ path: process.env.SHOTS + '/03-review2.png', fullPage: true });
  await page.click('nav button[data-tab=patterns]');
  out.patterns = (await page.textContent('#patterns')).replace(/\s+/g, ' ').slice(0, 1800);
  await page.screenshot({ path: process.env.SHOTS + '/04-patterns.png', fullPage: true });
  await page.click('nav button[data-tab=train]');
  out.trainHead = (await page.textContent('#train')).replace(/\s+/g, ' ').slice(0, 300);
  await page.screenshot({ path: process.env.SHOTS + '/05-train.png', fullPage: true });
  // play a puzzle: try a legal move from the first piece of the side to move
  const info = await page.evaluate(() => { const p = window.__pm.S.train.puz; const c = new Chess(p.fen); const mv = c.moves({ verbose: true }); return { best: p.bestUci, side: p.side, mv: mv.map(m => m.from + m.to) }; });
  out.puz = info;
  const wrong = info.mv.find(m => m !== info.best);
  await page.click('#tboard .sq[data-sq=' + wrong.slice(0, 2) + ']'); await page.click('#tboard .sq[data-sq=' + wrong.slice(2, 4) + ']');
  await page.waitForFunction(() => /verdict/.test(document.getElementById('train').innerHTML), null, { timeout: 120000 });
  out.wrongVerdict = (await page.textContent('#train .verdict'));
  await page.screenshot({ path: process.env.SHOTS + '/06-train-answer.png', fullPage: true });
  await page.click('[data-act=next]');
  const info2 = await page.evaluate(() => { const p = window.__pm.S.train.puz; return p ? { best: p.bestUci } : null; });
  if (info2) { await page.click('#tboard .sq[data-sq=' + info2.best.slice(0, 2) + ']'); await page.click('#tboard .sq[data-sq=' + info2.best.slice(2, 4) + ']'); await page.waitForSelector('#train .verdict'); out.rightVerdict = await page.textContent('#train .verdict'); }
  out.trainState = await page.evaluate(() => ({ solved: window.__pm.S.train.solved, missed: window.__pm.S.train.missed, retry: JSON.parse(localStorage.getItem('pm1:retry') || '[]').length }));
  out.logs = logs.filter(l => !/Failed to load resource|ERR_FAILED/.test(l)).slice(0, 20);
  // raw dump for unit tests
  const raws = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('pm1:raw:')).map(k => [k, JSON.parse(localStorage[k])]));
  out.rawKeys = raws.map(r => r[0]);
  fs.writeFileSync(path.join(T, 'real-engine.json'), JSON.stringify({ depth, games: raws.map((r, idx) => ({ i: real.findIndex(g => r[0].indexOf(g.url) >= 0), raw: r[1] })) }));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
