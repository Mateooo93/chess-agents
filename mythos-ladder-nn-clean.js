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

// Neural-style PSTs with piece interaction awareness
const PST = {
  p: [0,0,0,0,0,0,0,0,65,65,65,65,65,65,65,65,18,18,28,38,38,28,18,18,8,8,13,28,28,13,8,8,3,3,3,23,23,3,3,3,8,-2,-12,2,2,-12,-2,8,8,13,13,-30,-30,13,13,8,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,5,5,5,5,-20,-40,-30,10,20,25,25,20,10,-30,-30,5,20,30,30,20,5,-30,-30,5,20,30,30,20,5,-30,-30,5,15,25,25,15,5,-30,-40,-20,5,10,10,5,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,5,5,5,5,5,5,-10,-10,5,15,20,20,15,5,-10,-10,10,15,20,20,15,10,-10,-10,5,15,20,20,15,5,-10,-10,15,15,15,15,15,15,-10,-10,5,5,5,5,5,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,5,5,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,10,5,0,0,0,0,0,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k_middlegame: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
  k_endgame: [-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50],
};

// Pattern weights ("neural" evaluation terms)
const PATTERN_WEIGHTS = {
  doubledPawn: -15,
  isolatedPawn: -12,
  passedPawnBonus: [0, 10, 20, 40, 60, 90, 130, 0],
  bishopPair: 30,
  rookOpenFile: 25,
  rookSemiOpen: 12,
  outpostBonus: 15,
  kingShield: 8,
  pawnStorm: -10,
  spaceAdvantage: 3,
  tempo: 12,
};

const OPENING_BOOK = new Map([
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e2e4'],
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 'd7d5'],
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
]);

let currentGameId = null;
const currentAgent = 'mythos-ladder-nn';


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

// Pattern-based evaluation ("neural" style)
function evaluatePatterns(state) {
  let score = 0;
  const us = state.side;
  const them = us ^ 1;

  // Pawn structure analysis
  const whitePawns = [], blackPawns = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === 'P') whitePawns.push(sq);
    else if (p === 'p') blackPawns.push(sq);
  }

  // Doubled pawns
  for (let f = 0; f < 8; f++) {
    const wOnFile = whitePawns.filter(sq => fileOf(sq) === f).length;
    const bOnFile = blackPawns.filter(sq => fileOf(sq) === f).length;
    if (wOnFile > 1) score += PATTERN_WEIGHTS.doubledPawn * (wOnFile - 1);
    if (bOnFile > 1) score -= PATTERN_WEIGHTS.doubledPawn * (bOnFile - 1);
  }

  // Isolated pawns
  for (const sq of whitePawns) {
    const f = fileOf(sq);
    const hasNeighbor = whitePawns.some(p => Math.abs(fileOf(p) - f) === 1);
    if (!hasNeighbor) score += PATTERN_WEIGHTS.isolatedPawn;
  }
  for (const sq of blackPawns) {
    const f = fileOf(sq);
    const hasNeighbor = blackPawns.some(p => Math.abs(fileOf(p) - f) === 1);
    if (!hasNeighbor) score -= PATTERN_WEIGHTS.isolatedPawn;
  }

  // Passed pawns
  for (const sq of whitePawns) {
    const r = rankOf(sq), f = fileOf(sq);
    let blocked = false;
    for (let tr = r + 1; tr < 8; tr++) {
      if (state.board[toSquare(f, tr)] === 'p' ||
          (f > 0 && state.board[toSquare(f - 1, tr)] === 'p') ||
          (f < 7 && state.board[toSquare(f + 1, tr)] === 'p')) {
        blocked = true; break;
      }
    }
    if (!blocked) score += PATTERN_WEIGHTS.passedPawnBonus[r];
  }
  for (const sq of blackPawns) {
    const r = rankOf(sq), f = fileOf(sq);
    let blocked = false;
    for (let tr = r - 1; tr >= 0; tr--) {
      if (state.board[toSquare(f, tr)] === 'P' ||
          (f > 0 && state.board[toSquare(f - 1, tr)] === 'P') ||
          (f < 7 && state.board[toSquare(f + 1, tr)] === 'P')) {
        blocked = true; break;
      }
    }
    if (!blocked) score -= PATTERN_WEIGHTS.passedPawnBonus[7 - r];
  }

  // Bishop pair
  const whiteBishops = state.board.filter(p => p === 'B').length;
  const blackBishops = state.board.filter(p => p === 'b').length;
  if (whiteBishops >= 2) score += PATTERN_WEIGHTS.bishopPair;
  if (blackBishops >= 2) score -= PATTERN_WEIGHTS.bishopPair;

  // Rook on open/semi-open files
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (typeOf(p) !== 'r') continue;
    const f = fileOf(sq);
    const wPawns = whitePawns.filter(wp => fileOf(wp) === f).length;
    const bPawns = blackPawns.filter(bp => fileOf(bp) === f).length;
    const c = colorOf(p);
    if (c === WHITE) {
      if (wPawns === 0 && bPawns === 0) score += PATTERN_WEIGHTS.rookOpenFile;
      else if (wPawns === 0) score += PATTERN_WEIGHTS.rookSemiOpen;
    } else {
      if (wPawns === 0 && bPawns === 0) score -= PATTERN_WEIGHTS.rookOpenFile;
      else if (bPawns === 0) score -= PATTERN_WEIGHTS.rookSemiOpen;
    }
  }

  // King safety (simplified)
  const wKing = findKing(state, WHITE);
  const bKing = findKing(state, BLACK);
  const isEnd = isEndgame(state);

  if (!isEnd) {
    // King shield pawns
    const wkf = fileOf(wKing), wkr = rankOf(wKing);
    for (const df of [-1, 0, 1]) {
      for (const dr of [1, 2]) {
        const shieldSq = toSquare(wkf + df, wkr + dr);
        if (inBounds(wkf + df, wkr + dr) && state.board[shieldSq] === 'P') score += PATTERN_WEIGHTS.kingShield;
      }
    }
    const bkf = fileOf(bKing), bkr = rankOf(bKing);
    for (const df of [-1, 0, 1]) {
      for (const dr of [-1, -2]) {
        const shieldSq = toSquare(bkf + df, bkr + dr);
        if (inBounds(bkf + df, bkr + dr) && state.board[shieldSq] === 'p') score -= PATTERN_WEIGHTS.kingShield;
      }
    }
  } else {
    // Endgame king activity
    const wkCenter = Math.max(3 - Math.abs(fileOf(wKing) - 3.5), 0) + Math.max(3 - Math.abs(rankOf(wKing) - 3.5), 0);
    const bkCenter = Math.max(3 - Math.abs(fileOf(bKing) - 3.5), 0) + Math.max(3 - Math.abs(rankOf(bKing) - 3.5), 0);
    score += wkCenter * 10 - bkCenter * 10;
  }

  return us === WHITE ? score : -score;
}

function evaluate(state) {
  let score = 0;
  const isEnd = isEndgame(state);

  // Material + PST
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === '.') continue;
    const c = colorOf(p);
    const t = typeOf(p);
    let val = PIECE_VALUE[t];

    const pstSq = c === WHITE ? sq : 63 - sq;
    let pst = (t === 'k') ? (isEnd ? PST.k_endgame[pstSq] : PST.k_middlegame[pstSq]) : PST[t][pstSq];
    val += pst;

    // Mobility
    if (t !== 'k' && t !== 'p') {
      let moves = 0;
      const f = fileOf(sq), r = rankOf(sq);
      if (t === 'n') {
        for (const [df, dr] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) {
          if (inBounds(f + df, r + dr)) {
            const tsq = toSquare(f + df, r + dr);
            if (state.board[tsq] === '.' || colorOf(state.board[tsq]) !== c) moves++;
          }
        }
      } else {
        const dirs = t === 'b' ? [[1,1],[1,-1],[-1,1],[-1,-1]] : t === 'r' ? [[1,0],[-1,0],[0,1],[0,-1]] :
                     [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
        for (const [df, dr] of dirs) {
          let cf = f, cr = r;
          while (true) {
            cf += df; cr += dr;
            if (!inBounds(cf, cr)) break;
            const tsq = toSquare(cf, cr);
            const tp = state.board[tsq];
            if (tp === '.') moves++;
            else { if (colorOf(tp) !== c) moves++; break; }
          }
        }
      }
      val += moves * (t === 'n' || t === 'b' ? 3 : t === 'r' ? 2 : 1);
    }

    score += c === WHITE ? val : -val;
  }

  // Pattern evaluation
  score += evaluatePatterns(state);

  // Tempo
  score += state.side === WHITE ? PATTERN_WEIGHTS.tempo : -PATTERN_WEIGHTS.tempo;

  return state.side === WHITE ? score : -score;
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

  // Null move
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

function main() {
  const fen = __input.trim() || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
  const state = parseFEN(fen);

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
