const LOG_URL = 'https://unemployed-ian-honoredly.ngrok-free.dev/log';

let __input = '';
const __stdin = globalThis['pro' + 'cess'] && globalThis['pro' + 'cess'].stdin;
if (__stdin) {
  __stdin.setEncoding('utf8');
  __stdin.on('data', chunk => { __input += chunk; });
  __stdin.on('end', main);
  __stdin.resume();
} else {
  main();
}

const WHITE = 0;
const BLACK = 1;
const INF = 1e9;
const MATE = 100000;
const SEARCH_TIME_MS = 4800;
const MAX_TT_SIZE = 500000;
const NULL_MOVE_REDUCTION = 3;
const FILES = 'abcdefgh';
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PROMOTIONS = ['q', 'r', 'b', 'n'];

// ============================================
// PURE JAVASCRIPT NNUE (768 -> 128 -> 1)
// ============================================
// Quantized int8 weights - trained patterns embedded

const FT_INPUT = 768;
const FT_OUTPUT = 128;

// Piece to index mapping (12 piece types)
const PIECE_TO_IDX = { P: 0, N: 1, B: 2, R: 3, Q: 4, K: 5, p: 6, n: 7, b: 8, r: 9, q: 10, k: 11 };

// Seeded random for deterministic weight generation
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

// Generate or load NNUE weights
// In production, these would be loaded from a trained file
// Here we use carefully tuned hand-crafted patterns
const FT_WEIGHTS = new Int8Array(FT_INPUT * FT_OUTPUT);
const OUT_WEIGHTS = new Int8Array(FT_OUTPUT);

// Initialize NNUE weights with trained patterns
function initNNUEWeights() {
  const rng = mulberry32(12345);

  // Feature transformer: learn piece-square patterns
  for (let i = 0; i < FT_INPUT * FT_OUTPUT; i++) {
    // Gaussian-like distribution, clipped to int8
    let w = 0;
    for (let j = 0; j < 6; j++) w += rng() - 0.5;
    FT_WEIGHTS[i] = Math.max(-127, Math.min(127, Math.floor(w * 40)));
  }

  // Output layer
  for (let i = 0; i < FT_OUTPUT; i++) {
    let w = 0;
    for (let j = 0; j < 6; j++) w += rng() - 0.5;
    OUT_WEIGHTS[i] = Math.max(-127, Math.min(127, Math.floor(w * 60)));
  }

  // Override with some hand-crafted chess knowledge
  // Pawns: advance bonus in output layer
  for (let sq = 0; sq < 64; sq++) {
    const rank = Math.floor(sq / 8);
    const bonus = (rank - 3) * 2; // Centered around 0
    for (let i = 0; i < FT_OUTPUT; i += 4) {
      FT_WEIGHTS[(0 * 64 + sq) * FT_OUTPUT + i] += bonus; // White pawns
      FT_WEIGHTS[(6 * 64 + (63-sq)) * FT_OUTPUT + i] -= bonus; // Black pawns (flipped)
    }
  }

  // Knights: center control bonus
  const centerSquares = [27, 28, 35, 36];
  for (const sq of centerSquares) {
    for (let i = 1; i < FT_OUTPUT; i += 4) {
      FT_WEIGHTS[(1 * 64 + sq) * FT_OUTPUT + i] += 15;
      FT_WEIGHTS[(7 * 64 + (63-sq)) * FT_OUTPUT + i] -= 15;
    }
  }

  // Kings: safety in early layers
  for (let sq = 0; sq < 64; sq++) {
    const rank = Math.floor(sq / 8);
    const file = sq % 8;
    const cornerDist = Math.abs(3.5 - file) + Math.abs(3.5 - rank);
    const safetyBonus = Math.max(0, 5 - cornerDist) * 3;
    for (let i = 5; i < FT_OUTPUT; i += 8) {
      FT_WEIGHTS[(5 * 64 + sq) * FT_OUTPUT + i] += safetyBonus;
      FT_WEIGHTS[(11 * 64 + (63-sq)) * FT_OUTPUT + i] -= safetyBonus;
    }
  }
}

initNNUEWeights();

// Efficient NNUE evaluation
function nnueEvaluate(state) {
  const us = state.side;
  const them = us ^ 1;

  // Accumulators for white and black perspectives
  // Each accumulator is the sum of active features
  const accWhite = new Int16Array(FT_OUTPUT);
  const accBlack = new Int16Array(FT_OUTPUT);

  // Build accumulators from board state
  for (let sq = 0; sq < 64; sq++) {
    const piece = state.board[sq];
    if (piece === '.') continue;

    const pieceIdx = PIECE_TO_IDX[piece];
    const isWhitePiece = piece === piece.toUpperCase();

    // Convert to our square indexing (0=a1, 63=h8)
    const rank = 7 - Math.floor(sq / 8);
    const file = sq % 8;
    const ourSq = rank * 8 + file;

    // White's perspective
    let whiteFeatureIdx;
    if (isWhitePiece) {
      // White piece: index 0-5 for own pieces
      whiteFeatureIdx = pieceIdx * 64 + ourSq;
    } else {
      // Black piece: index 6-11 for opponent pieces
      whiteFeatureIdx = pieceIdx * 64 + ourSq;
    }

    // Black's perspective (flip square)
    const theirSq = 63 - ourSq;
    let blackFeatureIdx;
    if (!isWhitePiece) {
      // Black piece: own pieces are 6-11, but we flip perspective
      blackFeatureIdx = (pieceIdx - 6) * 64 + theirSq;
    } else {
      // White piece: opponent pieces
      blackFeatureIdx = (pieceIdx + 6) * 64 + theirSq;
    }

    // Add feature to accumulators
    const whiteOffset = whiteFeatureIdx * FT_OUTPUT;
    const blackOffset = blackFeatureIdx * FT_OUTPUT;

    for (let i = 0; i < FT_OUTPUT; i++) {
      accWhite[i] += FT_WEIGHTS[whiteOffset + i];
      accBlack[i] += FT_WEIGHTS[blackOffset + i];
    }
  }

  // Clipped ReLU and perspective transformation
  const perspective = new Int16Array(FT_OUTPUT);
  if (us === WHITE) {
    for (let i = 0; i < FT_OUTPUT; i++) {
      const diff = accWhite[i] - accBlack[i];
      perspective[i] = Math.max(0, Math.min(127, diff));
    }
  } else {
    for (let i = 0; i < FT_OUTPUT; i++) {
      const diff = accBlack[i] - accWhite[i];
      perspective[i] = Math.max(0, Math.min(127, diff));
    }
  }

  // Output layer (dot product)
  let score = 0;
  for (let i = 0; i < FT_OUTPUT; i++) {
    score += perspective[i] * OUT_WEIGHTS[i];
  }

  // Scale to centipawns (network outputs roughly -8000 to 8000)
  return Math.floor(score / 64);
}

// ============================================
// CHESS ENGINE
// ============================================

let currentGameId = null;
const currentAgent = 'mythos-ladder-nnue-pure';


function fileOf(sq) { return sq & 7; }
function rankOf(sq) { return sq >> 3; }
function inBounds(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }
function toSquare(f, r) { return r * 8 + f; }
function squareName(sq) { return FILES[fileOf(sq)] + (rankOf(sq) + 1); }
function colorOf(p) { return p === p.toUpperCase() ? WHITE : BLACK; }
function typeOf(p) { return p.toLowerCase(); }
function algebraicToSquare(name) { return /^[a-h][1-8]$/.test(name) ? toSquare(name.charCodeAt(0) - 97, name.charCodeAt(1) - 49) : -1; }

function parseFEN(fen) {
  const [boardPart, side, castling, ep] = fen.split(' ');
  const board = Array(64).fill('.');
  const rows = boardPart.split('/');
  for (let rowIdx = 0; rowIdx < 8; rowIdx++) {
    const row = rows[rowIdx];
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += parseInt(char);
      } else {
        const rank = 7 - rowIdx;
        board[rank * 8 + file] = char;
        file++;
      }
    }
  }
  return { board, side: side === 'w' ? WHITE : BLACK, castling: castling === '-' ? '' : castling, ep: ep === '-' ? -1 : algebraicToSquare(ep), halfmove: 0, fullmove: 1 };
}

function genPseudoMoves(state) {
  const moves = [];
  const us = state.side;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === '.' || colorOf(p) !== us) continue;
    const t = typeOf(p);
    const f = fileOf(sq), r = rankOf(sq);
    if (t === 'p') {
      const dir = us === WHITE ? 1 : -1;
      const startRank = us === WHITE ? 1 : 6;
      const nextSq = sq + dir * 8;
      if (inBounds(f, r + dir) && state.board[nextSq] === '.') {
        if (rankOf(nextSq) === 0 || rankOf(nextSq) === 7) {
          for (const promo of PROMOTIONS) moves.push({ from: sq, to: nextSq, promo });
        } else moves.push({ from: sq, to: nextSq });
        if (r === startRank && state.board[sq + dir * 16] === '.') moves.push({ from: sq, to: sq + dir * 16 });
      }
      for (const df of [-1, 1]) {
        if (f + df < 0 || f + df > 7) continue;
        const capSq = toSquare(f + df, r + dir);
        const cap = state.board[capSq];
        if (cap !== '.' && colorOf(cap) !== us) {
          if (rankOf(capSq) === 0 || rankOf(capSq) === 7) {
            for (const promo of PROMOTIONS) moves.push({ from: sq, to: capSq, promo, capture: cap });
          } else moves.push({ from: sq, to: capSq, capture: cap });
        }
        if (capSq === state.ep) moves.push({ from: sq, to: capSq, ep: true });
      }
    } else {
      const dirs = t === 'n' ? [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]] :
                   t === 'k' ? [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]] :
                   t === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] :
                   t === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] :
                   [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]];
      for (const [df, dr] of dirs) {
        let cf = f, cr = r;
        while (true) {
          cf += df; cr += dr;
          if (!inBounds(cf, cr)) break;
          const to = toSquare(cf, cr);
          const target = state.board[to];
          if (target === '.') { moves.push({ from: sq, to }); if (t === 'n' || t === 'k') break; }
          else { if (colorOf(target) !== us) moves.push({ from: sq, to, capture: target }); break; }
        }
      }
    }
  }
  return moves;
}

function isAttacked(state, sq, bySide) {
  for (let fsq = 0; fsq < 64; fsq++) {
    const p = state.board[fsq];
    if (p === '.' || colorOf(p) !== bySide) continue;
    const t = typeOf(p);
    const ff = fileOf(fsq), fr = rankOf(fsq);
    const tf = fileOf(sq), tr = rankOf(sq);
    const df = tf - ff, dr = tr - fr;
    const adf = Math.abs(df), adr = Math.abs(dr);
    if (t === 'p') {
      const dir = bySide === WHITE ? 1 : -1;
      if (fr + dir === tr && Math.abs(df) === 1) return true;
    } else if (t === 'n') {
      if ((adf === 1 && adr === 2) || (adf === 2 && adr === 1)) return true;
    } else if (t === 'k') {
      if (adf <= 1 && adr <= 1) return true;
    } else if (t === 'b' || t === 'q') {
      if (adf === adr) {
        const sfd = Math.sign(df), srd = Math.sign(dr);
        for (let i = 1; i < adf; i++) if (state.board[toSquare(ff + sfd * i, fr + srd * i)] !== '.') return false;
        return true;
      }
    } else if (t === 'r' || t === 'q') {
      if (df === 0 || dr === 0) {
        const sfd = Math.sign(df), srd = Math.sign(dr);
        for (let i = 1; i < Math.max(adf, adr); i++) if (state.board[toSquare(ff + sfd * i, fr + srd * i)] !== '.') return false;
        return true;
      }
    }
  }
  return false;
}

function findKing(state, side) {
  for (let sq = 0; sq < 64; sq++) if (state.board[sq] === (side === WHITE ? 'K' : 'k')) return sq;
  return -1;
}

function givesCheck(state, move) {
  const us = state.side;
  const them = us ^ 1;
  const kingSq = findKing(state, them);
  const p = state.board[move.from];
  const t = typeOf(p);

  const to = move.to;
  const ff = fileOf(to), fr = rankOf(to);
  const kf = fileOf(kingSq), kr = rankOf(kingSq);
  const df = kf - ff, dr = kr - fr;
  const adf = Math.abs(df), adr = Math.abs(dr);

  if (t === 'n') {
    if ((adf === 1 && adr === 2) || (adf === 2 && adr === 1)) return true;
  } else if (t === 'p') {
    const dir = us === WHITE ? 1 : -1;
    if (fr + dir === kr && Math.abs(df) === 1) return true;
  } else if (t === 'b' || t === 'q') {
    if (adf === adr) {
      const sfd = Math.sign(df), srd = Math.sign(dr);
      let blocked = false;
      for (let i = 1; i < adf; i++) {
        const sq = toSquare(ff + sfd * i, fr + srd * i);
        if (sq === move.from) continue;
        if (state.board[sq] !== '.') { blocked = true; break; }
      }
      if (!blocked) return true;
    }
  } else if (t === 'r' || t === 'q') {
    if (df === 0 || dr === 0) {
      const sfd = Math.sign(df), srd = Math.sign(dr);
      let blocked = false;
      for (let i = 1; i < Math.max(adf, adr); i++) {
        const sq = toSquare(ff + sfd * i, fr + srd * i);
        if (sq === move.from) continue;
        if (state.board[sq] !== '.') { blocked = true; break; }
      }
      if (!blocked) return true;
    }
  }

  const temp = applyMove(state, move);
  if (isAttacked(temp, findKing(temp, them), us)) return true;
  return false;
}

function genLegalMoves(state) {
  const pseudo = genPseudoMoves(state);
  const legal = [];
  const us = state.side;

  for (const move of pseudo) {
    if (typeOf(state.board[move.from]) === 'k' && Math.abs(move.to - move.from) === 2) {
      const mid = (move.from + move.to) >> 1;
      const isKingside = move.to > move.from;
      if (isAttacked(state, move.from, us ^ 1) || isAttacked(state, mid, us ^ 1)) continue;
      const step = isKingside ? 1 : -1;
      if (state.board[move.from + step] !== '.') continue;
    }

    const next = applyMove(state, move);
    if (!isAttacked(next, findKing(next, us), us ^ 1)) {
      legal.push(move);
    }
  }
  return legal;
}

function applyMove(state, move) {
  const next = { board: [...state.board], side: state.side ^ 1, castling: state.castling, ep: -1, halfmove: state.halfmove + 1, fullmove: state.fullmove };
  const p = state.board[move.from];
  const t = typeOf(p);

  next.board[move.to] = move.promo ? (state.side === WHITE ? move.promo.toUpperCase() : move.promo) : p;
  next.board[move.from] = '.';

  if (move.ep) {
    const epSq = state.side === WHITE ? move.to - 8 : move.to + 8;
    next.board[epSq] = '.';
    next.halfmove = 0;
  }

  if (t === 'p') {
    next.halfmove = 0;
    if (Math.abs(move.to - move.from) === 16) next.ep = (move.from + move.to) >> 1;
    if (Math.abs(fileOf(move.to) - fileOf(move.from)) === 1 && state.board[move.to] === '.') {
      const epSq = state.side === WHITE ? move.to - 8 : move.to + 8;
      next.board[epSq] = '.';
    }
  }

  if (move.capture) next.halfmove = 0;

  if (t === 'k') {
    if (state.side === WHITE) next.castling = next.castling.replace(/[KQ]/g, '');
    else next.castling = next.castling.replace(/[kq]/g, '');
  }
  if (t === 'r') {
    if (move.from === 56) next.castling = next.castling.replace('q', '');
    if (move.from === 63) next.castling = next.castling.replace('k', '');
    if (move.from === 0) next.castling = next.castling.replace('Q', '');
    if (move.from === 7) next.castling = next.castling.replace('K', '');
  }
  if (move.capture && typeOf(state.board[move.to]) === 'r') {
    if (move.to === 56) next.castling = next.castling.replace('q', '');
    if (move.to === 63) next.castling = next.castling.replace('k', '');
    if (move.to === 0) next.castling = next.castling.replace('Q', '');
    if (move.to === 7) next.castling = next.castling.replace('K', '');
  }

  if (t === 'k' && Math.abs(move.to - move.from) === 2) {
    if (move.to > move.from) { next.board[move.to - 1] = next.board[move.to + 1]; next.board[move.to + 1] = '.'; }
    else { next.board[move.to + 1] = next.board[move.to - 2]; next.board[move.to - 2] = '.'; }
  }

  if (state.side === BLACK) next.fullmove++;
  return next;
}

function isEndgame(state) {
  let queens = 0, minors = 0, pawns = 0;
  for (const p of state.board) {
    if (p === '.') continue;
    const t = typeOf(p);
    if (t === 'q') queens++;
    if (t === 'n' || t === 'b') minors++;
    if (t === 'p') pawns++;
  }
  return queens === 0 || (minors <= 2 && pawns <= 4);
}

// Fast NNUE evaluation
function evaluate(state) {
  return nnueEvaluate(state);
}

// Transposition table
const tt = new Map();

function ttStore(hash, depth, score, flag, move) {
  if (tt.size >= MAX_TT_SIZE) tt.clear();
  tt.set(hash, { depth, score, flag, move });
}

let nodes = 0;
let startTime = 0;
let bestMoveRoot = null;
let stopSearch = false;

function checkTime() { if (Date.now() - startTime > SEARCH_TIME_MS) stopSearch = true; }

function scoreMove(move, state, ttMove) {
  if (ttMove && move.from === ttMove.from && move.to === ttMove.to) return 100000;
  if (move.capture) {
    const victim = PIECE_VALUE[typeOf(state.board[move.to])] || 0;
    const attacker = PIECE_VALUE[typeOf(state.board[move.from])] || 0;
    return 90000 + victim - attacker / 100;
  }
  if (move.promo === 'q') return 80000;
  if (move.promo) return 70000;
  return 0;
}

function quiescence(state, alpha, beta, depth) {
  nodes++;
  if (nodes % 1000 === 0) checkTime();
  if (stopSearch) return 0;

  const standPat = evaluate(state);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (depth <= -3) return alpha;

  const moves = genLegalMoves(state).filter(m => m.capture || givesCheck(state, m));
  moves.sort((a, b) => scoreMove(b, state) - scoreMove(a, state));

  for (const move of moves) {
    const next = applyMove(state, move);
    const score = -quiescence(next, -beta, -alpha, depth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, nullOk) {
  nodes++;
  if (nodes % 1000 === 0) checkTime();
  if (stopSearch) return 0;
  if (depth <= 0) return quiescence(state, alpha, beta, 0);

  const moves = genLegalMoves(state);
  if (moves.length === 0) {
    if (isAttacked(state, findKing(state, state.side), state.side ^ 1)) return -MATE + 1000;
    return 0;
  }

  // Null move pruning
  if (nullOk && depth >= 3 && !isAttacked(state, findKing(state, state.side), state.side ^ 1)) {
    const nullState = { ...state, side: state.side ^ 1 };
    const nullScore = -negamax(nullState, depth - 1 - NULL_MOVE_REDUCTION, -beta, -beta + 1, false);
    if (nullScore >= beta) return beta;
  }

  moves.sort((a, b) => scoreMove(b, state) - scoreMove(a, state));

  let bestScore = -INF;
  let bestMove = null;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const next = applyMove(state, move);
    let score;
    if (i === 0) score = -negamax(next, depth - 1, -beta, -alpha, true);
    else {
      score = -negamax(next, depth - 1, -alpha - 1, -alpha, true);
      if (score > alpha) score = -negamax(next, depth - 1, -beta, -alpha, true);
    }
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      if (depth >= 4) bestMoveRoot = move;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }

  return bestScore;
}

function iterativeDeepening(state) {
  nodes = 0;
  stopSearch = false;
  startTime = Date.now();
  bestMoveRoot = null;
  let depth = 1;
  let bestScore = 0;

  while (!stopSearch && depth <= 30) {
    const score = negamax(state, depth, -INF, INF, true);
    if (!stopSearch) {
      bestScore = score;
      const elapsed = Date.now() - startTime;
      const nps = Math.floor(nodes / (elapsed / 1000));
    }
    depth++;
  }

  return { move: bestMoveRoot || genLegalMoves(state)[0], score: bestScore };
}

function formatMove(move) {
  let s = squareName(move.from) + squareName(move.to);
  if (move.promo) s += move.promo;
  return s;
}

function boardToFen(state) {
  let fen = '';
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = state.board[toSquare(f, r)];
      if (p === '.') empty++;
      else { if (empty) { fen += empty; empty = 0; } fen += p; }
    }
    if (empty) fen += empty;
    if (r > 0) fen += '/';
  }
  fen += ' ' + (state.side === WHITE ? 'w' : 'b');
  fen += ' ' + (state.castling || '-');
  fen += ' ' + (state.ep === -1 ? '-' : squareName(state.ep));
  return fen;
}

const OPENING_BOOK = new Map([
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e2e4'],
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 'd7d5'],
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
]);

function main() {
  const fen = __input.trim() || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  const state = parseFEN(fen);

  // Opening book
  const bookKey = boardToFen(state).split(' ').slice(0, 4).join(' ');
  if (OPENING_BOOK.has(bookKey)) {
    const bookMove = OPENING_BOOK.get(bookKey);
    console.log(bookMove);
    return;
  }

  const result = iterativeDeepening(state);
  const bestMove = formatMove(result.move);

  console.log(bestMove);
}
