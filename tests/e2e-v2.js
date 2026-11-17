// Local end-to-end run for the review features: labels, story, opening book, line playback, quiz.
// CDN and Chess.com requests are routed to local bytes or mocks (the cloud sandbox cannot reach them).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const T = __dirname, SHOTS = process.env.SHOTS || '/tmp/pm-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const real = require('./real-games.json');
const mkP = (n, r) => ({ username: n, rating: 3000, result: r });
const apiGames = real.map((g, i) => {
  const wh = g.pgn.match(/\[White "([^"]+)"/)[1], bl = g.pgn.match(/\[Black "([^"]+)"/)[1], won = i === 0;
  return { url: g.url, pgn: g.pgn, time_class: 'blitz', rules: 'chess', end_time: 1790000000 - i * 1000,
    white: mkP(wh, wh.toLowerCase() === 'hikaru' ? (won ? 'win' : 'checkmated') : (won ? 'abandoned' : 'win')),
    black: mkP(bl, bl.toLowerCase() === 'hikaru' ? (won ? 'win' : 'resigned') : (won ? 'abandoned' : 'win')) };
});
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  const cors = { 'access-control-allow-origin': '*' };
  await ctx.route('**/chess.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', headers: cors, body: fs.readFileSync(path.join(T, 'chess-0.10.3.js')) }));
  await ctx.route(/stockfish(\.wasm)?(\.js)?$/, r => {
    const u = r.request().url();
    const f = /\.wasm\.js$/.test(u) ? 'stockfish-10.0.2.wasm.js' : /\.wasm$/.test(u) ? 'stockfish-10.0.2.wasm' : 'stockfish-10.0.2.js';
    r.fulfill({ status: 200, contentType: /\.wasm$/.test(u) ? 'application/wasm' : 'application/javascript', headers: cors, body: fs.readFileSync(path.join(T, f)) });
  });
  await ctx.route('**/fonts.g*apis.com/**', r => r.abort());
  await ctx.route('https://api.chess.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ games: apiGames }) }));
  const res = {};
  await page.goto('http://localhost:8123/index.html');
  await page.waitForFunction(() => window.Chess && window.__pm);
  await page.waitForFunction(() => window.__pm.S.book, null, { timeout: 15000 });
  await page.fill('#user', 'Hikaru'); await page.fill('#month', '2026-10'); await page.selectOption('#depth', '8'); await page.selectOption('#months', '1'); await page.click('#loadBtn');
  await page.waitForSelector('li.game');
  await page.click('li.game:nth-child(1) button[data-act=analyze]');
  await page.waitForSelector('#rv:not([hidden])', { timeout: 600000 });
  await page.waitForTimeout(500);
  res.badge = await page.locator('#board .bdg').count();
  res.storyHead = await page.textContent('#story summary');
  res.storyText = (await page.textContent('#story')).slice(0, 700);
  res.detail = (await page.textContent('#detail')).slice(0, 400);
  res.marks = await page.locator('#movelist .mk').count();
  await page.screenshot({ path: SHOTS + '/v2-01-review.png', fullPage: true });
  // jump to a user mistake through the key moment buttons
  const kmCount = await page.locator('#story button[data-jump]').count();
  res.keyMomentButtons = kmCount;
  // find a user move with a lesson and open it
  const ply = await page.evaluate(() => { const a = __pm.S.rv.a; const m = a.moves.find(x => x.isUser && !x.inBook && x.loss >= 10 && x.refuteUci) || a.moves.find(x => x.isUser && x.loss >= 5); return m ? m.ply : -1; });
  res.mistakePly = ply;
  if (ply >= 0) {
    await page.evaluate(p => rvGo(p + 1), ply);
    res.mistakeDetail = (await page.textContent('#detail')).slice(0, 600);
    await page.click('button[data-alt=best]');
    res.altTitle = await page.textContent('#detail h3');
    await page.click('button[data-aact=next]'); await page.click('button[data-aact=next]');
    res.altCur = await page.textContent('.stp.cur');
    await page.screenshot({ path: SHOTS + '/v2-02-bestline.png', fullPage: true });
    await page.click('button[data-aact=exit]');
    if (await page.locator('button[data-alt=fail]').count()) {
      await page.click('button[data-alt=fail]'); await page.click('button[data-aact=next]'); res.thrAtIdx1 = await page.locator('#board .sq.thr').count(); res.refuteSan = await page.evaluate(() => { const al = __pm.S.rv.alt; return al.steps[1] && al.steps[1].san; }); await page.click('button[data-aact=next]');
      res.failCur = await page.textContent('.stp.cur'); res.thr = await page.locator('#board .sq.thr').count();
      await page.screenshot({ path: SHOTS + '/v2-03-fail.png', fullPage: true });
      await page.click('button[data-aact=exit]');
    }
  }
  // opening
  res.openingText = await page.evaluate(() => __pm.S.rv.a.opening.text);
  res.lichessLink = await page.getAttribute('#story a.linkbtn', 'href');
  // quiz
  await page.click('#quizBtn'); await page.waitForSelector('#detail .ctrl button[data-qact=hint]');
  res.quizHead = await page.textContent('#detail');
  res.evalHidden = await page.getAttribute('#evalbar', 'aria-label');
  const q1 = await page.evaluate(() => { const q = __pm.S.rv.quiz, m = __pm.S.rv.a.moves[q.items[q.i]]; return { best: m.bestUci, side: m.color, n: q.items.length }; });
  res.quizItems = q1.n;
  await page.screenshot({ path: SHOTS + '/v2-04-quiz.png', fullPage: true });
  await page.click('button[data-qact=hint]'); res.hintSq = await page.locator('#board .sq.hint').count();
  const flipped = q1.side === 'b';
  await page.click('#board .sq[data-sq=' + q1.best.slice(0, 2) + ']'); await page.click('#board .sq[data-sq=' + q1.best.slice(2, 4) + ']');
  await page.waitForSelector('#detail .verdict'); res.quizCorrect = await page.textContent('#detail .verdict');
  await page.screenshot({ path: SHOTS + '/v2-05-quiz-solved.png', fullPage: true });
  if (q1.n > 1) {
    await page.click('button[data-qact=next]');
    // play a wrong legal move on purpose: first legal move of the side to move that differs from best
    const wrong = await page.evaluate(() => { const q = __pm.S.rv.quiz, m = __pm.S.rv.a.moves[q.items[q.i]]; const c = new Chess(m.fenBefore); const mv = c.moves({ verbose: true }).find(x => x.from + x.to !== m.bestUci.slice(0, 4) && x.piece !== 'k'); return mv ? mv.from + mv.to : null; });
    if (wrong) {
      await page.click('#board .sq[data-sq=' + wrong.slice(0, 2) + ']'); await page.click('#board .sq[data-sq=' + wrong.slice(2, 4) + ']');
      await page.waitForSelector('#detail .verdict', { timeout: 60000 }); res.quizWrong = await page.textContent('#detail .verdict');
      await page.screenshot({ path: SHOTS + '/v2-06-quiz-wrong.png', fullPage: true });
    }
  }
  await page.click('#quizBtn'); // leave
  res.afterQuiz = await page.locator('#board .bdg').count();
  // keyboard stepping still works
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
  // phone width
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  res.phoneOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.screenshot({ path: SHOTS + '/v2-07-phone.png', fullPage: true });
  // dark mode
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 1000 }, colorScheme: 'dark' });
  res.errors = logs.filter(l => /^(error|PAGEERROR)/.test(l) && !/fonts|ERR_FAILED|401|Failed to load resource/.test(l));
  res.book = logs.filter(l => /opening book/.test(l));
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})().catch(e => { console.error('E2E FAILED', e); process.exit(1); });
