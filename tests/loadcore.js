// Loads the pure core from index.html (or src/core.js while developing) with chess.js injected.
const fs = require('fs'), path = require('path');
const { Chess } = require('./chess-0.10.3.js');
function load() {
  const idx = path.join(__dirname, '..', 'index.html');
  let src = fs.existsSync(idx) ? fs.readFileSync(idx, 'utf8') : '';
  let m = src.match(/\/\*CORE-START\*\/([\s\S]*?)\/\*CORE-END\*\//);
  if (!m) m = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8').match(/\/\*CORE-START\*\/([\s\S]*?)\/\*CORE-END\*\//);
  const names = 'winPct moveAccuracy classify phaseOf scoreToWhite parseInfoLine buildLesson analyzeGame parseOpening normalizeGame mergeGames replayPgn terminalEval pvToSan numberedLine aggregate openingTable weaknesses buildPuzzles puzzleAccepts recordOf describeIdea fenToBoard attackersOf seeGain sqIdx MARKS CAT_LABEL'.split(' ');
  return new Function('Chess', m[1] + '\nreturn {' + names.join(',') + '};')(Chess);
}
module.exports = { load, Chess };
