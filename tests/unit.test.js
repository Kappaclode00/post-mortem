const assert = require('assert');
const { load, Chess } = require('./loadcore.js');
const C = load();
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } }
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);

/* scoring formulas */
t('winPct(0)=50, symmetric, clamped', () => {
  assert(near(C.winPct(0), 50)); assert(near(C.winPct(300) + C.winPct(-300), 100));
  assert(near(C.winPct(5000), C.winPct(1500))); assert(C.winPct(100) > 59 && C.winPct(100) < 60);
});
t('moveAccuracy bounds', () => { assert(near(C.moveAccuracy(0), 100.0, 0.01)); assert(C.moveAccuracy(100) === 0); assert(C.moveAccuracy(10) < 64 && C.moveAccuracy(10) > 63); });
t('classify thresholds', () => {
  assert.equal(C.classify(0.5, false), 'best'); assert.equal(C.classify(30, true), 'best');
  assert.equal(C.classify(4.9, false), 'good'); assert.equal(C.classify(5, false), 'inaccuracy');
  assert.equal(C.classify(9.99, false), 'inaccuracy'); assert.equal(C.classify(10, false), 'mistake');
  assert.equal(C.classify(19.9, false), 'mistake'); assert.equal(C.classify(20, false), 'blunder');
});
t('phaseOf', () => { assert.equal(C.phaseOf(10), 'opening'); assert.equal(C.phaseOf(11), 'middlegame'); assert.equal(C.phaseOf(30), 'middlegame'); assert.equal(C.phaseOf(31), 'endgame'); });
t('scoreToWhite and mate scores', () => {
  assert.equal(C.scoreToWhite('cp', 50, true), 50); assert.equal(C.scoreToWhite('cp', 50, false), -50);
  assert.equal(C.scoreToWhite('mate', 3, true), 9970); assert.equal(C.scoreToWhite('mate', -2, true), -9980);
  assert.equal(C.scoreToWhite('mate', 1, false), -9990);
});
t('parseInfoLine skips bounds, takes pv', () => {
  assert.equal(C.parseInfoLine('info depth 5 seldepth 6 score cp 20 lowerbound nodes 5 pv e2e4'), null);
  const r = C.parseInfoLine('info depth 10 seldepth 12 multipv 1 score mate -3 nodes 1000 nps 1 time 5 pv e7e5 g1f3');
  assert.equal(r.kind, 'mate'); assert.equal(r.val, -3); assert.deepEqual(r.pv, ['e7e5', 'g1f3']); assert.equal(r.depth, 10);
  assert.equal(C.parseInfoLine('info string hello'), null);
});
t('terminal positions', () => {
  assert.equal(C.terminalEval('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'), 10000); // black mated
  assert.equal(C.terminalEval('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 0);     // stalemate
  assert.equal(C.terminalEval('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), null);
  assert.equal(C.terminalEval('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'), 10000);
});
t('opening name parsing', () => {
  assert.equal(C.parseOpening('https://www.chess.com/openings/Sicilian-Defense-Open-Najdorf-Variation-6.Be3'), 'Sicilian Defense Open');
  assert.equal(C.parseOpening('https://www.chess.com/openings/Sicilian-Defense...6.O-O-e5-7.Nc3-Nge7'), 'Sicilian Defense');
  assert.equal(C.parseOpening('https://www.chess.com/openings/Kings-Indian-Attack-Double-Fianchetto-Pachman-System-6.e4-O-O'), 'Kings Indian Attack');
  assert.equal(C.parseOpening('https://www.chess.com/openings/Indian-Game-Tartakower-Attack...4.e4-d6-5.Ne2-O-O-6.O-O'), 'Indian Game Tartakower');
  assert.equal(C.parseOpening('', 'B20'), 'ECO B20');
  assert.equal(C.parseOpening('https://www.chess.com/openings/Italian-Game'), 'Italian Game');
});
t('normalizeGame result and side', () => {
  const g = { url: 'u', rules: 'chess', white: { username: 'Kle', result: 'agreed', rating: 1 }, black: { username: 'x', result: 'agreed', rating: 2 }, pgn: '', time_class: 'blitz', end_time: 5 };
  const n = C.normalizeGame(g, 'kle'); assert(n.isWhite); assert.equal(n.result, 'draw'); assert.equal(n.opp.name, 'x');
  g.white.result = 'checkmated'; assert.equal(C.normalizeGame(g, 'KLE').result, 'loss');
  g.white.result = 'win'; assert.equal(C.normalizeGame(g, 'x').isWhite, false);
});
t('mergeGames keeps chess only, dedupes, newest first', () => {
  const m = C.mergeGames([[{ url: 'a', rules: 'chess', end_time: 1 }, { url: 'b', rules: 'chess960', end_time: 9 }], [{ url: 'a', rules: 'chess', end_time: 1 }, { url: 'c', rules: 'chess', end_time: 3 }]]);
  assert.deepEqual(m.map(x => x.url), ['c', 'a']);
});

/* detectors on hand-built positions */
function lesson(o) {
  const base = { color: 'w', played: { san: o.san || '?', uci: o.uci || 'a1a2' }, fullmove: 20, history: [], afterBest: null, afterPv: [], bestPv: [] };
  return C.buildLesson(Object.assign(base, o));
}
t('hung queen (undefended, captured by a pawn)', () => {
  const L = lesson({ fenBefore: '4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1', fenAfter: '4k3/8/8/4p3/3Q4/8/8/4K3 b - - 1 1', san: 'Qd4', uci: 'd1d4',
    afterBest: 'e5d4', afterPv: ['e5d4'], moverBefore: 900, moverAfter: -300, bestUci: 'e1e2', bestPv: ['e1e2'] });
  assert.equal(L.type, 'hung_piece'); assert(/queen on d4/.test(L.what), L.what); assert(/9 points/.test(L.why), L.why);
});
t('hung knight (defended, but taken by a pawn)', () => {
  const L = lesson({ fenBefore: '4k3/8/3p4/8/8/2N5/8/4K3 w - - 0 1', fenAfter: '4k3/8/3p4/4N3/8/8/8/4K3 b - - 1 1', san: 'Ne5', uci: 'c3e5',
    afterBest: 'd6e5', afterPv: ['d6e5'], moverBefore: 300, moverAfter: -100, bestUci: 'e1e2', bestPv: ['e1e2'] });
  assert.equal(L.type, 'hung_piece'); assert(/knight on e5/.test(L.what), L.what);
});
t('missed fork (knight forks king and rook)', () => {
  const L = lesson({ fenBefore: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', fenAfter: 'r3k3/8/8/1N6/8/8/3K4/8 b - - 1 1', san: 'Kd2', uci: 'e1d2',
    bestUci: 'b5c7', bestPv: ['b5c7', 'e8d8', 'c7a8'], moverBefore: 500, moverAfter: 0, afterBest: 'a8a2', afterPv: ['a8a2'] });
  assert.equal(L.type, 'missed_fork'); assert(/Nc7\+/.test(L.what), L.what); assert(/fork/.test(L.what)); assert(/1\. Nc7\+ Kd8 2\. Nxa8/.test(L.why), L.why);
});
t('missed mate in 1', () => {
  const L = lesson({ fenBefore: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', fenAfter: '6k1/5ppp/8/8/8/8/8/R4K2 b - - 1 1', san: 'Kf1', uci: 'g1f1',
    bestUci: 'a1a8', bestPv: ['a1a8'], moverBefore: 9990, moverAfter: 0 });
  assert.equal(L.type, 'missed_mate'); assert(/checkmate in 1 starting with Ra8#/.test(L.what), L.what);
});
t('walked into mate', () => {
  const L = lesson({ fenBefore: '6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1', fenAfter: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', color: 'b', san: 'h5', uci: 'h7h5',
    afterBest: 'a1a8', afterPv: ['a1a8'], moverBefore: 0, moverAfter: -9990, bestUci: 'g8h7', bestPv: ['g8h7'] });
  assert.equal(L.type, 'walked_into_mate'); assert(/checkmate in 1/.test(L.what), L.what);
});
t('missed pin (rook pins the knight to the king)', () => {
  const L = lesson({ fenBefore: '4k3/4n3/8/8/8/8/8/R5K1 w - - 0 1', fenAfter: '4k3/4n3/8/8/8/8/7K/R7 b - - 1 1', san: 'Kh2', uci: 'g1h2',
    bestUci: 'a1e1', bestPv: ['a1e1', 'e8d8', 'e1e7'], moverBefore: 500, moverAfter: 100, afterBest: 'e8d8', afterPv: ['e8d8'] });
  assert.equal(L.type, 'missed_pin'); assert(/pinned the knight on e7/.test(L.what), L.what);
});
t('missed skewer (rook attacks queen with rook behind)', () => {
  const L = lesson({ fenBefore: '3q3r/8/8/8/8/8/8/3RK2k w - - 0 1', fenAfter: '3q3r/8/8/8/8/8/8/3R1K1k b - - 1 1', san: 'Kf1', uci: 'e1f1',
    bestUci: 'd1d8', bestPv: ['d1d8', 'h8d8'], moverBefore: 0, moverAfter: -50 });
  assert.notEqual(L.type, 'hung_piece'); // direct capture of the queen is a missed capture, not a skewer
});
t('missed skewer proper (bishop hits queen, rook behind)', () => {
  const L = lesson({ fenBefore: 'k6r/8/8/4q3/8/8/1B6/6K1 w - - 0 1', fenAfter: 'k6r/8/8/4q3/8/8/1B6/5K2 b - - 1 1', san: 'Kf1', uci: 'g1f1',
    bestUci: 'b2c3', bestPv: ['b2c3', 'e5e6', 'c3h8'], moverBefore: 100, moverAfter: -800, afterBest: 'e5e1', afterPv: [] });
  assert.equal(L.type, 'missed_skewer'); assert(/queen on e5, with a rook behind it/.test(L.what), L.what);
});
t('allowed fork (knight forks king and rook)', () => {
  const L = lesson({ fenBefore: '4k3/8/8/8/8/2n5/8/2R2K2 w - - 0 1', fenAfter: '4k3/8/8/8/8/2n5/8/2R3K1 b - - 1 1', san: 'Kg1', uci: 'f1g1',
    afterBest: 'c3e2', afterPv: ['c3e2', 'g1f1', 'e2c1'], moverBefore: 200, moverAfter: -400, bestUci: 'c1c3', bestPv: ['c1c3'] });
  assert.equal(L.type, 'allowed_fork'); assert(/Ne2\+/.test(L.what), L.what);
});
t('missed capture of a loose piece', () => {
  const L = lesson({ fenBefore: '4k3/8/8/8/3q4/8/8/3RK3 w - - 0 1', fenAfter: '4k3/8/8/8/3q4/8/8/3R2K1 b - - 1 1', san: 'Kg1', uci: 'e1g1',
    bestUci: 'd1d4', bestPv: ['d1d4'], moverBefore: 0, moverAfter: -900 });
  assert.equal(L.type, 'missed_capture'); assert(/capturing the queen on d4/.test(L.what), L.what);
});
t('opening: queen out early', () => {
  const fenB = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const c = new Chess(fenB); const mv = c.move('Qh5');
  const L = lesson({ fenBefore: fenB, fenAfter: c.fen(), san: 'Qh5', uci: 'd1h5', playedMove: mv, fullmove: 2, bestUci: 'g1f3', bestPv: ['g1f3'], moverBefore: 40, moverAfter: -100, afterBest: 'b8c6', afterPv: ['b8c6'] });
  assert.equal(L.type, 'opening_queen');
});
t('opening: same piece twice', () => {
  const fenB = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
  const c = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'); const h = c.move('Nf3');
  c.move('Nc6'); const f2 = c.fen(); const mv = c.move('Ng5');
  const L = lesson({ fenBefore: f2, fenAfter: c.fen(), san: 'Ng5', uci: 'f3g5', playedMove: mv, history: [h], fullmove: 3, bestUci: 'f1b5', bestPv: ['f1b5'], moverBefore: 40, moverAfter: -60, afterBest: 'd7d5', afterPv: ['d7d5'] });
  assert.equal(L.type, 'opening_twice');
});
t('opening: king still in the centre at move 14', () => {
  const fen = 'r1bqk2r/ppp2ppp/2n2n2/3pp3/1b2P3/2NP1N2/PPP2PPP/R1BQKB1R w KQkq - 0 7';
  const L = lesson({ fenBefore: fen, fenAfter: fen, san: 'a3', uci: 'a2a3', playedMove: { piece: 'p', from: 'a2', to: 'a3', flags: 'n' }, fullmove: 14, history: [], bestUci: 'f1e2', bestPv: ['f1e2'], moverBefore: 60, moverAfter: 0 });
  assert.equal(L.type, 'opening_king');
});
t('endgame: did not push the passed pawn', () => {
  const L = lesson({ fenBefore: '8/8/4k3/8/3P4/8/6K1/8 w - - 0 40', fenAfter: '8/8/4k3/8/3P4/8/5K2/8 b - - 1 40', san: 'Kf2', uci: 'g2f2', fullmove: 40, playedMove: { piece: 'k', from: 'g2', to: 'f2', flags: 'n' },
    bestUci: 'd4d5', bestPv: ['d4d5'], moverBefore: 300, moverAfter: 0 });
  assert.equal(L.type, 'endgame_passed');
});
t('endgame: king far from the action', () => {
  const L = lesson({ fenBefore: '8/8/8/8/3k4/8/3P4/K7 w - - 0 40', fenAfter: '8/8/8/8/3k4/3P4/8/K7 b - - 0 40', san: 'd3', uci: 'd2d3', fullmove: 40, playedMove: { piece: 'p', from: 'd2', to: 'd3', flags: 'n' },
    bestUci: 'a1b2', bestPv: ['a1b2'], moverBefore: 100, moverAfter: -100 });
  assert.equal(L.type, 'endgame_king');
});
t('positional fallback names the engine idea', () => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const L = lesson({ fenBefore: fen, fenAfter: fen, san: 'a3', uci: 'a2a3', fullmove: 25, playedMove: { piece: 'p', from: 'a2', to: 'a3', flags: 'n' }, bestUci: 'g1f3', bestPv: ['g1f3', 'b8c6'], moverBefore: 60, moverAfter: 20 });
  assert.equal(L.type, 'positional'); assert(/Nf3, developing a knight/.test(L.what), L.what); assert(/controlling/.test(L.what), L.what);
});
t('lessons have all three parts, no em dashes', () => {
  const L = lesson({ fenBefore: '4k3/8/8/4p3/8/8/8/3QK3 w - - 0 1', fenAfter: '4k3/8/8/4p3/3Q4/8/8/4K3 b - - 1 1', san: 'Qd4', uci: 'd1d4', afterBest: 'e5d4', afterPv: ['e5d4'], moverBefore: 900, moverAfter: -300, bestUci: 'e1e2', bestPv: ['e1e2'] });
  assert(L.what && L.why && L.next); assert(!/—/.test(JSON.stringify(L)));
});

/* real Chess.com games: parsing and invariants with synthetic flat engine data */
const real = require('./real-games.json');
t('real PGNs (with %clk) parse and replay', () => {
  real.forEach(g => { const r = C.replayPgn(g.pgn); assert(r.moves.length > 30); assert.equal(r.fens.length, r.moves.length + 1); });
});
t('real game normalisation', () => {
  const raw = { url: real[0].url, rules: 'chess', pgn: real[0].pgn, time_class: 'blitz', end_time: 1, white: { username: 'mightysmasher', result: 'abandoned', rating: 2859 }, black: { username: 'Hikaru', result: 'win', rating: 3456 } };
  const n = C.normalizeGame(raw, 'hikaru'); assert.equal(n.isWhite, false); assert.equal(n.result, 'win'); assert.equal(n.opening, 'Kings Indian Attack');
});
t('analyzeGame on real game with flat evals gives 100% accuracy and no lessons', () => {
  const r = C.replayPgn(real[0].pgn); const n = r.moves.length;
  const raw = { ev: new Array(n + 1).fill(0), best: r.moves.map(m => m.from + m.to + (m.promotion || '')).concat([null]), pv: new Array(n + 1).fill([]) };
  const a = C.analyzeGame(real[0].pgn, false, raw);
  assert(near(a.accuracy, 100, 0.01)); assert(a.moves.every(m => !m.lesson));
});
t('analyzeGame sign handling: black blunder is measured from black\'s side', () => {
  const r = C.replayPgn(real[0].pgn); const n = r.moves.length;
  const ev = new Array(n + 1).fill(0); for (let i = 2; i <= n; i++) ev[i] = 400; // black's first move (ply 1) swings the eval 0 -> +400 for White
  const raw = { ev, best: new Array(n + 1).fill('a1a1'), pv: new Array(n + 1).fill([]) };
  const a = C.analyzeGame(real[0].pgn, false, raw);
  const p2 = a.moves[2];  // white, ply 2: 400 -> 400, no loss
  const p3 = a.moves[1];  // black, ply 1: 0 -> 400 for White, so Black loses
  assert(p3.loss > 20 && p3.cls === 'blunder' && p3.isUser); assert.equal(p2.loss, 0);
});
const eng = (() => { try { return require('./real-engine.json'); } catch (e) { return null; } })();
if (eng) {
  t('real Stockfish output on real games: sane scores and lessons', () => {
    eng.games.forEach(e => {
      const a = C.analyzeGame(real[e.i].pgn, false, e.raw);
      assert(a.accuracy > 0 && a.accuracy <= 100);
      a.moves.filter(m => m.lesson).forEach(m => { assert(m.lesson.what && m.lesson.why && m.lesson.next, JSON.stringify(m.lesson)); assert(m.loss >= 10); });
    });
  });
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
