#!/bin/sh
# Fetches the exact Stockfish and chess.js versions the app uses, for local tests only.
set -e
cd "$(dirname "$0")"
tmp=$(mktemp -d); cd "$tmp"
npm init -y >/dev/null && npm i chess.js@0.10.3 stockfish.js@10.0.2 >/dev/null
cd - >/dev/null
cp "$tmp/node_modules/stockfish.js/stockfish.js" stockfish-10.0.2.js
cp "$tmp/node_modules/chess.js/chess.js" chess-0.10.3.js
echo "ok"
cp "$tmp/node_modules/stockfish.js/stockfish.wasm.js" stockfish-10.0.2.wasm.js
cp "$tmp/node_modules/stockfish.js/stockfish.wasm" stockfish-10.0.2.wasm
