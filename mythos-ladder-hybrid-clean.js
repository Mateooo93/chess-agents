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

// Tuned PSTs with endgame scaling
const PST_MG = {
  p: [0,0,0,0,0,0,0,0,60,60,60,60,60,60,60,60,15,15,25,35,35,25,15,15,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-25,-25,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,5,5,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,10,5,0,0,0,0,0,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
};

const PST_EG = {
  p: [0,0,0,0,0,0,0,0,80,80,80,80,80,80,80,80,50,50,50,50,50,50,50,50,30,30,30,30,30,30,30,30,20,20,20,20,20,20,20,20,10,10,10,10,10,10,10,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-30,0,0,0,0,-30,-40,-30,0,10,15,15,10,0,-30,-30,5,20,25,25,20,5,-30,-30,5,20,25,25,20,5,-30,-30,0,15,20,20,15,0,-30,-40,-30,0,5,5,0,-30,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,5,10,15,15,10,5,-10,-10,5,15,20,20,15,5,-10,-10,5,15,20,20,15,5,-10,-10,5,10,15,15,10,5,-10,-10,0,0,0,0,0,0,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  q: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  k: [-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50],
};

// Simplified endgame knowledge
const EG_KNOWLEDGE = {
  KQvK: (state) => {
    const us = state.side;
    const ourKing = findKing(state, us);
    const theirKing = findKing(state, us ^ 1);
    const ourQueen = state.board.findIndex((p, i) => typeOf(p) === 'q' && colorOf(p) === us);
    if (ourQueen === -1) return null;

    // Drive enemy king to edge, then checkmate
    const distToEdge = Math.min(fileOf(theirKing), 7 - fileOf(theirKing), rankOf(theirKing), 7 - rankOf(theirKing));
    const distKings = Math.abs(fileOf(ourKing) - fileOf(theirKing)) + Math.abs(rankOf(ourKing) - rankOf(theirKing));

    // Prefer moves that reduce enemy king's distance to edge
    const moves = genLegalMoves(state);
    let bestMove = null;
    let bestScore = -INF;

    for (const move of moves) {
      const next = applyMove(state, move);
      const newDist = Math.min(
        fileOf(findKing(next, us ^ 1)),
        7 - fileOf(findKing(next, us ^ 1)),
        rankOf(findKing(next, us ^ 1)),
        7 - rankOf(findKing(next, us ^ 1))
      );
      const newKingDist = Math.abs(fileOf(findKing(next, us)) - fileOf(findKing(next, us ^ 1))) +
                        Math.abs(rankOf(findKing(next, us)) - rankOf(findKing(next, us ^ 1)));

      let score = 0;
      if (isAttacked(next, findKing(next, us ^ 1), us) && genLegalMoves(next).length === 0) score = MATE; // Checkmate
      else score = (4 - newDist) * 100 - newKingDist * 10;

      if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    return bestMove;
  },

  KRvK: (state) => {
    // Rook endgame: push king to edge
    const us = state.side;
    const moves = genLegalMoves(state);
    const theirKing = findKing(state, us ^ 1);
    const distToEdge = Math.min(fileOf(theirKing), 7 - fileOf(theirKing), rankOf(theirKing), 7 - rankOf(theirKing));

    let bestMove = null;
    let bestScore = -INF;

    for (const move of moves) {
      const next = applyMove(state, move);
      const newDist = Math.min(
        fileOf(findKing(next, us ^ 1)),
        7 - fileOf(findKing(next, us ^ 1)),
        rankOf(findKing(next, us ^ 1)),
        7 - rankOf(findKing(next, us ^ 1))
      );

      let score = (4 - newDist) * 100;
      if (typeOf(state.board[move.from]) === 'k') {
        // Keep our king close to their king
        const kingDist = Math.abs(fileOf(move.to) - fileOf(findKing(next, us ^ 1))) +
                         Math.abs(rankOf(move.to) - rankOf(findKing(next, us ^ 1)));
        score -= kingDist * 5;
      }

      if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    return bestMove;
  },

  KPvK: (state) => {
    // Pawn endgame: push pawn, support with king
    const us = state.side;
    const moves = genLegalMoves(state);
    const dir = us === WHITE ? 1 : -1;

    let bestMove = null;
    let bestScore = -INF;

    for (const move of moves) {
      const p = state.board[move.from];
      const t = typeOf(p);
      let score = 0;

      if (t === 'p') {
        const promoRank = us === WHITE ? 7 : 0;
        const distToPromo = Math.abs(promoRank - rankOf(move.to));
        score = (7 - distToPromo) * 1000; // Push pawn forward

        // Check for promotion
        if (rankOf(move.to) === promoRank) score += MATE / 2;
      } else if (t === 'k') {
        // King supports pawn
        const pawn = state.board.findIndex((p, i) => typeOf(p) === 'p' && colorOf(p) === us);
        if (pawn !== -1) {
          const distToPawn = Math.abs(fileOf(move.to) - fileOf(pawn)) + Math.abs(rankOf(move.to) - rankOf(pawn));
          score = 500 - distToPawn * 10;
        }
      }

      if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    return bestMove;
  }
};

const OPENING_BOOK = new Map([
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e2e4'],
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 'd7d5'],
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
  ['rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
]);

let currentGameId = null;
const currentAgent = 'mythos-ladder-hybrid';


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

function countMaterial(state, side) {
  let count = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const p of state.board) {
    if (p === '.' || colorOf(p) !== side) continue;
    const t = typeOf(p);
    if (count[t] !== undefined) count[t]++;
  }
  return count;
}

function isEndgame(state) {
  const wMat = countMaterial(state, WHITE);
  const bMat = countMaterial(state, BLACK);
  const wQueens = wMat.q, bQueens = bMat.q;
  const wMinors = wMat.n + wMat.b, bMinors = bMat.n + bMat.b;
  const wPawns = wMat.p, bPawns = bMat.p;

  // Endgame: no queens or very few pieces
  if (wQueens === 0 && bQueens === 0) return true;
  const wTotal = wMat.n * 3 + wMat.b * 3 + wMat.r * 5 + wMat.q * 9;
  const bTotal = bMat.n * 3 + bMat.b * 3 + bMat.r * 5 + bMat.q * 9;
  return wTotal <= 13 || bTotal <= 13;
}

function detectEndgameType(state) {
  const wMat = countMaterial(state, WHITE);
  const bMat = countMaterial(state, BLACK);

  // KQvK
  if (wMat.q === 1 && wMat.p === 0 && wMat.n === 0 && wMat.b === 0 && wMat.r === 0 &&
      bMat.p === 0 && bMat.n === 0 && bMat.b === 0 && bMat.r === 0 && bMat.q === 0) return 'KQvK';
  if (bMat.q === 1 && bMat.p === 0 && bMat.n === 0 && bMat.b === 0 && bMat.r === 0 &&
      wMat.p === 0 && wMat.n === 0 && wMat.b === 0 && wMat.r === 0 && wMat.q === 0) return 'KQvK';

  // KRvK
  if (wMat.r === 1 && wMat.p === 0 && wMat.n === 0 && wMat.b === 0 && wMat.q === 0 &&
      bMat.p === 0 && bMat.n === 0 && bMat.b === 0 && bMat.r === 0 && bMat.q === 0) return 'KRvK';
  if (bMat.r === 1 && bMat.p === 0 && bMat.n === 0 && bMat.b === 0 && bMat.q === 0 &&
      wMat.p === 0 && wMat.n === 0 && wMat.b === 0 && wMat.r === 0 && wMat.q === 0) return 'KRvK';

  // KPvK
  if ((wMat.p === 1 || bMat.p === 1) &&
      wMat.n === 0 && wMat.b === 0 && wMat.r === 0 && wMat.q === 0 &&
      bMat.n === 0 && bMat.b === 0 && bMat.r === 0 && bMat.q === 0) return 'KPvK';

  return null;
}

function evaluate(state) {
  let score = 0;
  const isEnd = isEndgame(state);
  const egType = detectEndgameType(state);

  // Scale PSTs by game phase
  const wMat = countMaterial(state, WHITE);
  const bMat = countMaterial(state, BLACK);
  const wPhase = wMat.q * 4 + wMat.r * 2 + wMat.b + wMat.n;
  const bPhase = bMat.q * 4 + bMat.r * 2 + bMat.b + bMat.n;
  const totalPhase = Math.min(wPhase + bPhase, 24);
  const mgWeight = totalPhase / 24;
  const egWeight = 1 - mgWeight;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === '.') continue;
    const c = colorOf(p);
    const t = typeOf(p);
    let val = PIECE_VALUE[t];

    const pstSq = c === WHITE ? sq : 63 - sq;
    const pstVal = PST_MG[t][pstSq] * mgWeight + (PST_EG[t] ? PST_EG[t][pstSq] : PST_MG[t][pstSq]) * egWeight;
    val += pstVal;

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

    // Bishop pair bonus
    if (t === 'b') {
      const bishops = state.board.filter((p, i) => typeOf(p) === 'b' && colorOf(p) === c).length;
      if (bishops >= 2) val += 25;
    }

    // Rook on open file
    if (t === 'r') {
      const f = fileOf(sq);
      let hasOwnPawn = false, hasOppPawn = false;
      for (let r = 0; r < 8; r++) {
        const psq = toSquare(f, r);
        const tp = state.board[psq];
        if (typeOf(tp) === 'p') {
          if (colorOf(tp) === c) hasOwnPawn = true;
          else hasOppPawn = true;
        }
      }
      if (!hasOwnPawn) val += hasOppPawn ? 15 : 25;
    }

    score += c === WHITE ? val : -val;
  }

  // Pawn structure
  for (let f = 0; f < 8; f++) {
    let whitePawns = 0, blackPawns = 0;
    for (let r = 0; r < 8; r++) {
      const p = state.board[toSquare(f, r)];
      if (p === 'P') whitePawns++;
      else if (p === 'p') blackPawns++;
    }
    if (whitePawns > 1) score -= 15 * (whitePawns - 1); // Doubled
    if (blackPawns > 1) score += 15 * (blackPawns - 1);
  }

  // Passed pawns
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (typeOf(p) !== 'p') continue;
    const c = colorOf(p);
    const f = fileOf(sq), r = rankOf(sq);
    let isPassed = true;
    const dir = c === WHITE ? 1 : -1;
    for (let tr = r + dir; c === WHITE ? tr < 8 : tr >= 0; tr += dir) {
      for (const df of [-1, 0, 1]) {
        if (f + df < 0 || f + df > 7) continue;
        const tp = state.board[toSquare(f + df, tr)];
        if (tp !== '.' && typeOf(tp) === 'p' && colorOf(tp) !== c) { isPassed = false; break; }
      }
      if (!isPassed) break;
    }
    if (isPassed) {
      const bonus = [0, 10, 30, 60, 100, 150, 220, 0];
      const idx = c === WHITE ? r : 7 - r;
      score += c === WHITE ? bonus[idx] : -bonus[idx];
    }
  }

  // King safety in middlegame
  if (!isEnd) {
    const wKing = findKing(state, WHITE);
    const bKing = findKing(state, BLACK);
    const wkf = fileOf(wKing), wkr = rankOf(wKing);
    const bkf = fileOf(bKing), bkr = rankOf(bKing);

    // Shield pawns
    for (const df of [-1, 0, 1]) {
      for (const dr of [1, 2]) {
        const sq = toSquare(wkf + df, wkr + dr);
        if (inBounds(wkf + df, wkr + dr) && state.board[sq] === 'P') score += 8;
        const bsq = toSquare(bkf + df, bkr - dr);
        if (inBounds(bkf + df, bkr - dr) && state.board[bsq] === 'p') score -= 8;
      }
    }
  }

  // Tempo
  score += state.side === WHITE ? 12 : -12;

  return state.side === WHITE ? score : -score;
}

// Endgame knowledge hook
function tryEndgameKnowledge(state) {
  const egType = detectEndgameType(state);
  if (!egType || !EG_KNOWLEDGE[egType]) return null;
  return EG_KNOWLEDGE[egType](state);
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

  // Check endgame knowledge first
  const egMove = tryEndgameKnowledge(state);
  if (egMove) {
    return { move: egMove, score: MATE / 2 };
  }

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
