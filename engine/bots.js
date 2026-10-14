// ====== MÁY CHƠI (BOT) ======
// Đơn giản nhưng hợp lý: đánh giá sức mạnh bài, so với tỷ lệ hũ, thỉnh thoảng tháu cáy.
import { rankOf } from './cards.js';
import { evaluate } from './evaluate.js';
import { legalActions, potTotal } from './game.js';

function preflopStrength([a, b]) {
  const r1 = Math.max(rankOf(a), rankOf(b));
  const r2 = Math.min(rankOf(a), rankOf(b));
  let s = ((r1 + r2) / 28) ** 2;          // lá càng cao càng tốt (K-Q ≈ 0,79, 7-2 ≈ 0,1)
  if (r1 === r2) s = 0.5 + (r1 / 14) * 0.5; // đôi: 2-2 ≈ 0,57 … A-A = 1
  if (a[1] === b[1]) s += 0.06;           // đồng chất
  if (r1 - r2 === 1) s += 0.04;           // liền nhau
  return Math.min(1, s);
}

function postflopStrength(hole, board) {
  const mine = evaluate([...hole, ...board]);
  const table = board.length >= 5 ? evaluate(board) : null;
  const base = [0.18, 0.45, 0.66, 0.76, 0.83, 0.87, 0.93, 0.97, 0.99][mine.cat];
  let s = base + (mine.tb[0] / 14) * 0.06;
  if (table && table.score === mine.score) s -= 0.25; // chỉ "đánh bài trên bàn"
  return Math.max(0, Math.min(1, s));
}

export function botDecide(g, seat, rng = Math.random) {
  const L = legalActions(g, seat);
  const s = g.seats[seat];
  const h = g.hand;
  const st = h.board.length ? postflopStrength(s.hole, h.board) : preflopStrength(s.hole);
  const pot = potTotal(g);
  const odds = L.toCall / Math.max(1, pot + L.toCall);
  const bluff = rng() < 0.07;

  if (L.raise && (st > 0.72 || (bluff && L.toCall <= h.bb * 3)) && rng() < 0.75) {
    const target = h.currentBet + Math.round((pot * (0.5 + rng() * 0.5)) / 10) * 10;
    const to = Math.max(L.raise.min, Math.min(L.raise.max, target));
    return { type: 'raise', to };
  }
  if (L.check) return { type: 'check' };
  // Phải bỏ ra bao nhiêu phần chip của mình? Càng nhiều càng cần bài mạnh
  const commit = L.toCall / Math.max(1, s.stack + s.bet);
  const need = commit >= 0.9 ? 0.62 : commit >= 0.4 ? 0.55 : commit >= 0.15 ? 0.42 : 0;
  if (st < need) return { type: 'fold' };
  if (st + 0.08 >= odds || (st > 0.4 && L.toCall <= h.bb * 2)) return { type: 'call' };
  return { type: 'fold' };
}
