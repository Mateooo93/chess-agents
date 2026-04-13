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
const ASPIRATION_WINDOW = 25;
const CHECK_EXTENSION = 1;
const FILES = 'abcdefgh';
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const PROMOTIONS = ['q', 'r', 'b', 'n'];

const PST = {
  p: [0,0,0,0,0,0,0,0,60,60,60,60,60,60,60,60,15,15,25,35,35,25,15,15,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-25,-25,10,10,5,0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,5,15,20,20,15,5,-30,-30,0,15,25,25,15,0,-30,-30,5,15,25,25,15,5,-30,-30,0,10,15,15,10,0,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,10,15,15,10,0,-10,-10,5,10,15,15,10,5,-10,-10,0,15,15,15,15,0,-10,-10,10,15,15,15,15,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,5,5,0,0,0,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,5,10,10,10,10,10,10,5,0,0,0,0,0,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20],
  k_middlegame: [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20],
  k_endgame: [-50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,0,0,-10,-20,-30,-30,-10,20,30,30,20,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,30,40,40,30,-10,-30,-30,-10,20,30,30,20,-10,-30,-30,-30,0,0,0,0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50],
};

const OPENING_BOOK = new Map([
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'e2e4'],
  ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  ['rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -', 'g1f3'],
  ['rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -', 'd7d5'],
  ['rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'c2c4'],
  ['rnbqkbnr/pp1ppppp/8/2p5/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -', 'e2e3'],
  ['rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq -', 'b1c3'],
  ['rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq -', 'e7e5'],
  ['rnbqkbnr/pppp1ppp/8/4p3/1P6/8/P1PPPPPP/RNBQKBNR w KQkq -', 'c1b2'],
  ['rnbqkbnr/pppppppp/8/8/5N2/8/PPPPPPPP/RNBQKB1R b KQkq -', 'd7d5'],
  ['rnbqkbnr/pppppppp/8/8/6P1/8/PPPPPP1P/RNBQKBNR b KQkq -', 'd7d5'],
]);

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
        const rank = 7 - rowIdx;  // FEN rank 0 is actual rank 8
        board[rank * 8 + file] = char;
        file++;
      }
    }
  }
  return { board, side: side === 'w' ? WHITE : BLACK, castling: castling === '-' ? '' : castling, ep: ep === '-' ? -1 : algebraicToSquare(ep), halfmove: 0, fullmove: 1 };
}

function toFEN(state) {
  let fen = '';
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const sq = toSquare(file, rank);
      const piece = state.board[sq];
      if (piece === '.') {
        empty++;
      } else {
        if (empty > 0) { fen += empty; empty = 0; }
        fen += piece;
      }
    }
    if (empty > 0) fen += empty;
    if (rank > 0) fen += '/';
  }
  fen += ` ${state.side === WHITE ? 'w' : 'b'} ${state.castling || '-'} ${state.ep === -1 ? '-' : squareName(state.ep)} ${state.halfmove} ${state.fullmove}`;
  return fen;
}

function isEndgame(state) {
  let queens = 0, minors = 0, majors = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === '.' || p === 'k' || p === 'K') continue;
    const t = typeOf(p);
    if (t === 'q') queens++;
    else if (t === 'n' || t === 'b') minors++;
    else if (t === 'r') majors++;
  }
  return queens === 0 || (minors + majors <= 2);
}

function evaluate(state) {
  let score = 0;
  const isEnd = isEndgame(state);

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === '.') continue;
    const c = colorOf(p);
    const t = typeOf(p);
    let val = PIECE_VALUE[t];

    const pstSq = c === WHITE ? sq : 63 - sq;
    let pst = (t === 'k') ? (isEnd ? PST.k_endgame[pstSq] : PST.k_middlegame[pstSq]) : PST[t][pstSq];
    val += pst;

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

  score += state.side === WHITE ? 10 : -10;
  return state.side === WHITE ? score : -score;
}

const TT = new Map();

function negamax(state, depth, alpha, beta, maxDepth, deadline) {
  if (Date.now() >= deadline) throw new Error('timeout');

  const fen = toFEN(state);
  const shortFen = fen.split(' ').slice(0, 4).join(' ');

  if (depth === 0) return { score: quiescence(state, alpha, beta, deadline) };

  const ttEntry = TT.get(shortFen);
  if (ttEntry && ttEntry.depth >= depth) {
    if (ttEntry.flag === 'exact') return { score: ttEntry.score, move: ttEntry.move };
    if (ttEntry.flag === 'lower' && ttEntry.score >= beta) return { score: ttEntry.score };
    if (ttEntry.flag === 'upper' && ttEntry.score <= alpha) return { score: ttEntry.score };
  }

  const moves = generateMoves(state);
  if (moves.length === 0) {
    if (inCheck(state, state.side)) return { score: -MATE + (maxDepth - depth) };
    return { score: 0 };
  }

  let bestMove = null;
  let bestScore = -INF;
  let flag = 'upper';

  for (const move of moves) {
    const newState = applyMove(state, move);
    const result = negamax(newState, depth - 1, -beta, -alpha, maxDepth, deadline);
    const score = -result.score;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) {
      alpha = score;
      flag = 'exact';
    }
    if (score >= beta) {
      flag = 'lower';
      break;
    }
  }

  if (TT.size < MAX_TT_SIZE) {
    TT.set(shortFen, { depth, score: bestScore, flag, move: bestMove });
  }

  return { score: bestScore, move: bestMove };
}

function quiescence(state, alpha, beta, deadline) {
  if (Date.now() >= deadline) throw new Error('timeout');

  const standPat = evaluate(state);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const captureMoves = generateMoves(state).filter(m => m.capture || m.promotion);

  for (const move of captureMoves) {
    const newState = applyMove(state, move);
    const score = -quiescence(newState, -beta, -alpha, deadline);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

function generateMoves(state) {
  const moves = [];
  const us = state.side;
  const them = 1 - us;

  for (let sq = 0; sq < 64; sq++) {
    const p = state.board[sq];
    if (p === '.' || colorOf(p) !== us) continue;
    const t = typeOf(p);
    const f = fileOf(sq), r = rankOf(sq);

    if (t === 'p') {
      const dir = us === WHITE ? -1 : 1;
      const startRank = us === WHITE ? 6 : 1;
      const promoRank = us === WHITE ? 0 : 7;

      const pushSq = toSquare(f, r + dir);
      if (inBounds(f, r + dir) && state.board[pushSq] === '.') {
        if (r + dir === promoRank) {
          for (const prom of ['q', 'r', 'b', 'n']) {
            moves.push({ from: sq, to: pushSq, promotion: us === WHITE ? prom.toUpperCase() : prom });
          }
        } else {
          moves.push({ from: sq, to: pushSq });
          if (r === startRank && state.board[toSquare(f, r + 2 * dir)] === '.') {
            moves.push({ from: sq, to: toSquare(f, r + 2 * dir) });
          }
        }
      }

      for (const df of [-1, 1]) {
        const capF = f + df;
        const capR = r + dir;
        if (inBounds(capF, capR)) {
          const capSq = toSquare(capF, capR);
          const target = state.board[capSq];
          if (target !== '.' && colorOf(target) === them) {
            if (capR === promoRank) {
              for (const prom of ['q', 'r', 'b', 'n']) {
                moves.push({ from: sq, to: capSq, promotion: us === WHITE ? prom.toUpperCase() : prom, capture: target });
              }
            } else {
              moves.push({ from: sq, to: capSq, capture: target });
            }
          }
          if (capSq === state.ep) {
            moves.push({ from: sq, to: capSq, isEnPassant: true });
          }
        }
      }
    } else if (t === 'n') {
      for (const [df, dr] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) {
        if (inBounds(f + df, r + dr)) {
          const tsq = toSquare(f + df, r + dr);
          const target = state.board[tsq];
          if (target === '.' || colorOf(target) === them) {
            moves.push({ from: sq, to: tsq, capture: target !== '.' ? target : undefined });
          }
        }
      }
    } else if (t === 'k') {
      for (const [df, dr] of [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]]) {
        if (inBounds(f + df, r + dr)) {
          const tsq = toSquare(f + df, r + dr);
          const target = state.board[tsq];
          if (target === '.' || colorOf(target) === them) {
            moves.push({ from: sq, to: tsq, capture: target !== '.' ? target : undefined });
          }
        }
      }
      if (us === WHITE && sq === 60) {
        if (state.castling.includes('K') && state.board[61] === '.' && state.board[62] === '.' && state.board[63] === 'R' &&
            !isSquareAttacked(state, 60, BLACK) && !isSquareAttacked(state, 61, BLACK) && !isSquareAttacked(state, 62, BLACK)) {
          moves.push({ from: sq, to: 62, isCastle: true });
        }
        if (state.castling.includes('Q') && state.board[59] === '.' && state.board[58] === '.' && state.board[57] === '.' && state.board[56] === 'R' &&
            !isSquareAttacked(state, 60, BLACK) && !isSquareAttacked(state, 59, BLACK) && !isSquareAttacked(state, 58, BLACK)) {
          moves.push({ from: sq, to: 58, isCastle: true });
        }
      } else if (us === BLACK && sq === 4) {
        if (state.castling.includes('k') && state.board[5] === '.' && state.board[6] === '.' && state.board[7] === 'r' &&
            !isSquareAttacked(state, 4, WHITE) && !isSquareAttacked(state, 5, WHITE) && !isSquareAttacked(state, 6, WHITE)) {
          moves.push({ from: sq, to: 6, isCastle: true });
        }
        if (state.castling.includes('q') && state.board[3] === '.' && state.board[2] === '.' && state.board[1] === '.' && state.board[0] === 'r' &&
            !isSquareAttacked(state, 4, WHITE) && !isSquareAttacked(state, 3, WHITE) && !isSquareAttacked(state, 2, WHITE)) {
          moves.push({ from: sq, to: 2, isCastle: true });
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
          const target = state.board[tsq];
          if (target === '.') {
            moves.push({ from: sq, to: tsq });
          } else {
            if (colorOf(target) === them) {
              moves.push({ from: sq, to: tsq, capture: target });
            }
            break;
          }
        }
      }
    }
  }

  return moves.filter(m => {
    const newState = applyMove(state, m);
    return !inCheck(newState, us);
  });
}

function applyMove(state, move) {
  const newBoard = state.board.slice();
  newBoard[move.to] = move.promotion || newBoard[move.from];
  newBoard[move.from] = '.';

  if (move.isEnPassant) {
    const capSq = state.side === WHITE ? move.to + 8 : move.to - 8;
    newBoard[capSq] = '.';
  }

  if (move.isCastle) {
    if (move.to === 62) { newBoard[61] = 'R'; newBoard[63] = '.'; }
    else if (move.to === 58) { newBoard[59] = 'R'; newBoard[56] = '.'; }
    else if (move.to === 6) { newBoard[5] = 'r'; newBoard[7] = '.'; }
    else if (move.to === 2) { newBoard[3] = 'r'; newBoard[0] = '.'; }
  }

  let newCastling = state.castling;
  const p = state.board[move.from];
  if (p === 'K') newCastling = newCastling.replace('K', '').replace('Q', '');
  if (p === 'k') newCastling = newCastling.replace('k', '').replace('q', '');
  if (move.from === 63 || move.to === 63) newCastling = newCastling.replace('K', '');
  if (move.from === 56 || move.to === 56) newCastling = newCastling.replace('Q', '');
  if (move.from === 7 || move.to === 7) newCastling = newCastling.replace('k', '');
  if (move.from === 0 || move.to === 0) newCastling = newCastling.replace('q', '');

  let newEp = -1;
  if ((p === 'P' || p === 'p') && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    newEp = toSquare(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) >> 1);
  }

  return {
    board: newBoard,
    side: 1 - state.side,
    castling: newCastling,
    ep: newEp,
    halfmove: (p === 'P' || p === 'p' || move.capture) ? 0 : state.halfmove + 1,
    fullmove: state.side === BLACK ? state.fullmove + 1 : state.fullmove
  };
}

function isSquareAttacked(state, sq, bySide) {
  const them = bySide;
  const us = 1 - bySide;

  const pawnDir = them === WHITE ? -1 : 1;
  const pawn = them === WHITE ? 'P' : 'p';
  for (const df of [-1, 1]) {
    const attackSq = toSquare(fileOf(sq) + df, rankOf(sq) + pawnDir);
    if (inBounds(fileOf(sq) + df, rankOf(sq) + pawnDir)) {
      if (state.board[attackSq] === pawn) return true;
    }
  }

  const knight = them === WHITE ? 'N' : 'n';
  for (const [df, dr] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) {
    if (inBounds(fileOf(sq) + df, rankOf(sq) + dr)) {
      if (state.board[toSquare(fileOf(sq) + df, rankOf(sq) + dr)] === knight) return true;
    }
  }

  const king = them === WHITE ? 'K' : 'k';
  for (const [df, dr] of [[1,1],[1,0],[1,-1],[0,1],[0,-1],[-1,1],[-1,0],[-1,-1]]) {
    if (inBounds(fileOf(sq) + df, rankOf(sq) + dr)) {
      if (state.board[toSquare(fileOf(sq) + df, rankOf(sq) + dr)] === king) return true;
    }
  }

  const bishopDirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [df, dr] of bishopDirs) {
    let cf = fileOf(sq), cr = rankOf(sq);
    while (true) {
      cf += df; cr += dr;
      if (!inBounds(cf, cr)) break;
      const tsq = toSquare(cf, cr);
      const target = state.board[tsq];
      if (target !== '.') {
        if (colorOf(target) === them) {
          const t = typeOf(target);
          if (t === 'b' || t === 'q') return true;
        }
        break;
      }
    }
  }

  const rookDirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [df, dr] of rookDirs) {
    let cf = fileOf(sq), cr = rankOf(sq);
    while (true) {
      cf += df; cr += dr;
      if (!inBounds(cf, cr)) break;
      const tsq = toSquare(cf, cr);
      const target = state.board[tsq];
      if (target !== '.') {
        if (colorOf(target) === them) {
          const t = typeOf(target);
          if (t === 'r' || t === 'q') return true;
        }
        break;
      }
    }
  }

  return false;
}

function inCheck(state, side) {
  const king = side === WHITE ? 'K' : 'k';
  let kingSq = -1;
  for (let sq = 0; sq < 64; sq++) {
    if (state.board[sq] === king) {
      kingSq = sq;
      break;
    }
  }
  if (kingSq === -1) return false;
  return isSquareAttacked(state, kingSq, 1 - side);
}

function search(state, timeMs) {
  const deadline = Date.now() + timeMs;
  TT.clear();

  let bestMove = null;
  let bestScore = -INF;

  try {
    for (let depth = 1; depth <= 20; depth++) {
      const result = negamax(state, depth, -INF, INF, depth, deadline);
      if (result.move) {
        bestMove = result.move;
        bestScore = result.score;
      }
      if (Math.abs(bestScore) > MATE_THRESHOLD) break;
    }
  } catch (e) {
    // Timeout - use best move found so far
  }

  if (!bestMove) {
    const legal = generateMoves(state);
    if (legal.length > 0) bestMove = legal[0];
  }

  return bestMove;
}

function formatMove(move) {
  if (!move) return '0000';
  let uci = squareName(move.from) + squareName(move.to);
  if (move.promotion) uci += move.promotion.toLowerCase();
  return uci;
}

function main() {
  const fen = __input.trim();
  const state = parseFEN(fen);

  // Check opening book
  const fenParts = fen.split(' ');
  const boardFEN = fenParts[0] + ' ' + fenParts[1];
  if (OPENING_BOOK.has(boardFEN)) {
    console.log(OPENING_BOOK.get(boardFEN));
    return;
  }

  const move = search(state, SEARCH_TIME_MS);
  console.log(formatMove(move));
}
