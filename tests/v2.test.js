const assert = require('assert');
const { load, Chess } = require('./loadcore.js');
const C = load();
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.stack.split('\n').slice(0, 3).join('\n     ')); } }
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ROWS = [
  ['C50', 'Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
  ['C50', 'Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['C44', 'Scotch Game', 'e4 e5 Nf3 Nc6 d4']
];
const book = C.buildBook(ROWS);
const flat = (pgn, ev, best, pv) => {
  const r = C.replayPgn(pgn), n = r.moves.length;
  return { ev: ev || new Array(n + 1).fill(0), best: best || r.moves.map(m => m.from + m.to + (m.promotion || '')).concat([null]), pv: pv || new Array(n + 1).fill([]) };
};

/* ---- opening book ---- */
t('buildBook: prefixes, names and next moves', () => {
  assert(book['e4 e5']); assert.equal(book['e4 e5 Nf3 Nc6 Bc4'].name, 'Italian Game');
  assert.deepEqual(Object.keys(book['e4 e5 Nf3 Nc6'].next).sort(), ['Bc4', 'd4']);
  assert(!book['e4 e5 Nf3 Nc6 Bc4 Nf6']);
});
t('book flags, leave point, report and book moves', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 *';
  const a = C.analyzeGame(pgn, true, flat(pgn));
  C.decorateAnalysis(a, book);
  assert.deepEqual(a.moves.map(m => m.inBook), [true, true, true, true, true, false, false]);
  assert.equal(a.moves[4].label, 'book'); assert.equal(a.moves[4].bookName, 'Italian Game');
  const r = a.opening;
  assert.equal(r.leftPly, 5); assert.equal(r.by, 'opponent'); assert.equal(r.name, 'Italian Game');
  assert.deepEqual(r.bookNext.map(b => b.san), ['Bc5']);
  assert(/Your opponent left the known lines with 3\.\.\. Nf6/.test(r.text), r.text);
  assert(/Giuoco Piano/.test(r.text));
});
t('user leaving book with a costly move names the book move', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Nc3 *';
  const raw = flat(pgn); raw.ev[7] = -300;   // 4.Qh5 loses 300cp
  const a = C.decorateAnalysis(C.analyzeGame(pgn, true, raw), book);
  assert.equal(a.opening.by, 'you'); assert(a.opening.loss > 10);
  assert(/cost about \d+% win chance/.test(a.opening.text), a.opening.text);
});
t('no book given: report says unavailable and labels still work', () => {
  const pgn = '1. e4 e5 2. Nf3 *'; const a = C.decorateAnalysis(C.analyzeGame(pgn, true, flat(pgn)), null);
  assert.equal(a.opening.available, false); assert(a.moves.every(m => m.label !== 'book'));
});
t('book re-decoration after the book arrives', () => {
  const pgn = '1. e4 e5 2. Nf3 *'; const a = C.analyzeGame(pgn, true, flat(pgn));
  C.decorateAnalysis(a, null); assert.equal(a.moves[0].label, 'best');
  C.decorateAnalysis(a, book); assert.equal(a.moves[0].label, 'book');
});

/* ---- labels ---- */
t('label thresholds: best, excellent, good, inaccuracy, mistake, blunder', () => {
  const pgn = '1. a3 a6 2. b3 b6 3. c3 c6 4. d3 d6 5. e3 e6 6. f3 f6 *';
  const r = C.replayPgn(pgn), n = r.moves.length;
  const ev = new Array(n + 1).fill(0), best = new Array(n + 1).fill('zzzz');
  // white moves at plies 0,2,4,6,8,10; give each a different loss (in centipawns, from White's side)
  const drops = { 0: 0, 2: 12, 4: 50, 6: 100, 8: 160, 10: 400 };
  for (let p = 0; p < n; p += 2) { ev[p] = 0; ev[p + 1] = -(drops[p] || 0); }
  best[0] = 'a2a3';
  const a = C.decorateAnalysis(C.analyzeGame(pgn, true, { ev, best, pv: new Array(n + 1).fill([]) }), null);
  const lab = p => a.moves[p].label;
  assert.equal(lab(0), 'best'); assert.equal(lab(2), 'excellent'); assert.equal(lab(4), 'good');
  assert.equal(lab(6), 'inaccuracy'); assert.equal(lab(8), 'mistake'); assert.equal(lab(10), 'blunder');
});
t('miss: not punishing the opponent mistake', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 d6 *';
  const n = 8, ev = [20, 20, 20, 20, 20, 20, 400, 250, 250];   // black's Nf6 (ply 5) is a mistake, then white's d3 gives up some of the edge
  const best = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', null, null];
  const raw = { ev, best, pv: new Array(n + 1).fill([]) };
  const a = C.decorateAnalysis(C.analyzeGame(pgn, true, raw), null);
  assert(a.moves[5].loss >= 10 && !a.moves[5].isUser);
  assert.equal(a.moves[6].label, 'miss', a.moves[6].label + ' loss ' + a.moves[6].loss);
});
t('brilliant: a sound knight sacrifice (Fried Liver line)', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 *';
  const r = C.replayPgn(pgn); const fenB = r.fens[10];
  const rec = { uci: 'g5f7', fenBefore: fenB, color: 'w', bestPv: ['g5f7', 'e8f7', 'd1f3', 'f7e6', 'b1c3', 'c6b4'], moverBefore: 40, moverAfter: 90 };
  assert(C.sacrificeInfo(rec), 'sacrifice not found');
  assert.equal(C.sacrificeInfo(Object.assign({}, rec, { moverBefore: 1200 })), null, 'already winning is not brilliant');
  assert.equal(C.sacrificeInfo(Object.assign({}, rec, { moverAfter: -300 })), null, 'losing sacrifice is not brilliant');
  assert.equal(C.sacrificeInfo(Object.assign({}, rec, { bestPv: ['g5f7', 'e8f7'] })), null, 'short lines are not enough');
});
t('brilliant: a plain trade is not a sacrifice', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 *';
  const r = C.replayPgn(pgn); const fenB = r.fens[8];   // 5.exd5 position
  const rec = { uci: 'e4d5', fenBefore: fenB, color: 'w', bestPv: ['e4d5', 'f6d5', 'g5f7', 'e8f7', 'd1f3', 'f7e6'], moverBefore: 40, moverAfter: 40 };
  assert.equal(C.sacrificeInfo(rec), null);
});
t('great: a knight fork wins material', () => {
  const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
  const rec = { uci: 'd5c7', fenBefore: fen, color: 'w', bestPv: ['d5c7', 'e8d7', 'c7a8'], moverBefore: 100, moverAfter: 600 };
  const g = C.greatInfo(rec); assert(g && g.kind === 'fork', JSON.stringify(g)); assert(/forks the king on e8 and the rook on a8/.test(g.text), g.text);
});
t('great: saving a queen that was about to be taken', () => {
  const fen = '4k3/8/8/2p5/3Q4/8/8/4K3 w - - 0 1';
  const rec = { uci: 'd4c5', fenBefore: fen, color: 'w', bestPv: ['d4c5'], moverBefore: 150, moverAfter: 160 };
  const g = C.greatInfo(rec); assert(g && g.kind === 'rescue', JSON.stringify(g));
  assert.equal(C.greatInfo(Object.assign({}, rec, { moverBefore: 1500 })), null, 'already crushing');
});

/* ---- describing a played move ---- */
const dp = (fen, uci) => C.describePlayed(fen, uci);
t('describePlayed: development, free capture, fork, mate, castle, promotion, check', () => {
  assert(/develops the knight/.test(dp(START, 'g1f3')), dp(START, 'g1f3'));
  assert(/wins a pawn on d5 that nothing protected/.test(dp('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5')));
  assert(/forks the king on e8 and the rook on a8/.test(dp('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7')));
  assert.equal(dp('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8'), 'delivers checkmate');
  assert(/castles/.test(dp('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')));
  assert(/promotes the pawn to a queen/.test(dp('8/P7/8/8/7k/8/8/K7 w - - 0 1', 'a7a8q')));
  assert(/gives check/.test(dp('4k3/8/8/8/8/8/8/R6K w - - 0 1', 'a1a8')), dp('4k3/8/8/8/8/8/8/R6K w - - 0 1', 'a1a8'));
  assert(/places the rook on the open d-file/.test(dp('4k3/8/8/8/8/8/8/R6K w - - 0 1', 'a1d1')), dp('4k3/8/8/8/8/8/8/R6K w - - 0 1', 'a1d1'));
});
t('describePlayed: pin and trade wording', () => {
  assert(/pins the knight on e7 to the king/.test(dp('4k3/4n3/8/8/8/8/8/R6K w - - 0 1', 'a1e1')), dp('4k3/4n3/8/8/8/8/8/R6K w - - 0 1', 'a1e1'));
  assert(/trades off the knight on c6/.test(dp('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'b5c6')), dp('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'b5c6'));
});

/* ---- commentary, story, quiz ---- */
const SCHOLAR = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0';
const scholarRaw = () => ({ ev: [20, 30, 25, 35, 40, 50, 9990, 10000], best: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'd8e7', 'h5f7', null], pv: [[], [], [], [], [], [], [], []] });
t('commentary: opponent blunder points you to the punishing move', () => {
  const a = C.decorateAnalysis(C.analyzeGame(SCHOLAR, true, scholarRaw()), null);
  const m = a.moves[5]; assert.equal(m.label, 'blunder'); assert.equal(a.counts.o.blunder, 1);
  const c = C.commentFor(m, a);
  assert(/your opponent/.test(c) && /Qxf7#, which delivers checkmate/.test(c), c);
});
t('commentary: your mistakes use the lesson text and name the better move', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 *';
  const raw = flat(pgn); raw.ev[7] = -300; raw.best[6] = 'b1c3';
  const a = C.decorateAnalysis(C.analyzeGame(pgn, true, raw), null);
  const m = a.moves[6]; assert.equal(m.label, 'blunder');
  const c = C.commentFor(m, a); assert(/Nc3/.test(c) && /Win chance/.test(c), c);
});
t('commentary: every label yields a clean non-empty sentence (no em dash, undefined or NaN)', () => {
  const real = require('./real-games.json');
  real.forEach(g => {
    const r = C.replayPgn(g.pgn), n = r.moves.length;
    const ev = []; let x = 0; for (let i = 0; i <= n; i++) { x += ((i * 37) % 90) - 45 + (i % 11 === 0 ? -250 : 0); ev.push(x); }
    const best = r.moves.map((m, i) => (i % 3 ? m.from + m.to + (m.promotion || '') : null)).concat([null]);
    const a = C.decorateAnalysis(C.analyzeGame(g.pgn, i0 => true, { ev, best, pv: new Array(n + 1).fill([]) }), book);
    a.moves.forEach(m => { const c = C.commentFor(m, a); assert(c && c.length > 5, 'empty comment at ' + m.ply); assert(!/—|undefined|NaN|null/.test(c), c); assert(C.LABEL_WORD[m.label], m.label); });
  });
});
t('story: headline, paragraphs, key moments, no em dash', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 *';
  const raw = flat(pgn); raw.ev[7] = -300; raw.best[6] = 'b1c3';
  const a = C.decorateAnalysis(C.analyzeGame(pgn, true, raw), book);
  const s = C.buildStory(a, { result: 'loss', opp: { name: 'rival' } });
  assert(/loss/i.test(s.headline)); assert(s.paragraphs.length >= 3);
  assert(s.moments.length === 1 && s.moments[0].ply === 6, JSON.stringify(s.moments));
  assert(!/—/.test(JSON.stringify(s)), JSON.stringify(s));
  assert(s.paragraphs.some(p => /turned at move 4\. b4/.test(p)), s.paragraphs.join(' | '));
});
t('quizItems: your mistakes and finds in game order', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 *';
  const raw = flat(pgn); raw.ev[7] = -300; raw.best[6] = 'b1c3';
  const a = C.decorateAnalysis(C.analyzeGame(pgn, true, raw), book);
  assert.deepEqual(C.quizItems(a), [6]);
});
t('lineFens gives playable steps', () => {
  const l = C.lineFens(START, ['e2e4', 'e7e5', 'g1f3'], 8);
  assert.deepEqual(l.map(x => x.san), ['e4', 'e5', 'Nf3']); assert.equal(l[2].from, 'g1');
  assert.equal(C.lineFens(START, ['e2e4', 'zzzz'], 8).length, 1);
});
const eng = (() => { try { return require('./real-engine.json'); } catch (e) { return null; } })();
if (eng) t('real Stockfish output: labels, comments, story and opening report all build', () => {
  const real = require('./real-games.json'), fs = require('fs'), path = require('path');
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vendor', 'openings.json'), 'utf8'));
  const bk = C.buildBook(rows);
  eng.games.forEach(e => {
    const a = C.decorateAnalysis(C.analyzeGame(real[e.i].pgn, false, e.raw), bk);
    a.moves.forEach(m => { const c = C.commentFor(m, a); assert(c && !/—|undefined|NaN/.test(c), c); });
    const s = C.buildStory(a, { result: 'win', opp: { name: 'x' } }); assert(s.paragraphs.length >= 2);
    console.log('     ' + JSON.stringify(a.counts.u) + ' | ' + a.opening.text);
  });
});
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
