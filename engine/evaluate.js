// ====== CHẤM ĐIỂM BÀI ======
// Xét mọi tổ hợp 5 lá từ 5–7 lá, chọn tổ hợp mạnh nhất. Điểm càng lớn bài càng mạnh.
import { rankOf, rankLabel } from './cards.js';

export const CATEGORY = ['Mậu thầu', 'Đôi', 'Thú', 'Sám cô', 'Sảnh', 'Thùng', 'Cù lũ', 'Tứ quý', 'Thùng phá sảnh'];

export function eval5(cards) {
  const rs = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightHigh = rs[0];
    else if (rs[0] === 14 && rs[1] === 5) straightHigh = 5; // sảnh A-2-3-4-5, Át đóng vai lá thấp nhất
  }
  const counts = {};
  rs.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  const groups = Object.entries(counts).map(([r, n]) => [Number(r), n]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let cat;
  let tb;
  if (straightHigh && flush) { cat = 8; tb = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = 7; tb = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 6; tb = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = 5; tb = rs; }
  else if (straightHigh) { cat = 4; tb = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = 3; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2) { cat = 1; tb = groups.map((g) => g[0]); }
  else { cat = 0; tb = rs; }

  let score = cat;
  for (let i = 0; i < 5; i += 1) score = score * 15 + (tb[i] || 0);
  return { score, cat, tb };
}

function* combos(arr, k, start = 0, pick = []) {
  if (pick.length === k) { yield pick.slice(); return; }
  for (let i = start; i <= arr.length - (k - pick.length); i += 1) {
    pick.push(arr[i]);
    yield* combos(arr, k, i + 1, pick);
    pick.pop();
  }
}

export function handName(cat, tb) {
  const L = rankLabel;
  switch (cat) {
    case 8: return tb[0] === 14 ? 'Thùng phá sảnh lớn' : `Thùng phá sảnh tới ${L(tb[0])}`;
    case 7: return `Tứ quý ${L(tb[0])}`;
    case 6: return `Cù lũ ${L(tb[0])} đôi ${L(tb[1])}`;
    case 5: return `Thùng, cao nhất ${L(tb[0])}`;
    case 4: return `Sảnh tới ${L(tb[0])}`;
    case 3: return `Sám cô ${L(tb[0])}`;
    case 2: return `Thú ${L(tb[0])} và ${L(tb[1])}`;
    case 1: return `Đôi ${L(tb[0])}`;
    default: return `Mậu thầu ${L(tb[0])}`;
  }
}

// Bài tốt nhất từ 5–7 lá
export function evaluate(cards) {
  if (cards.length < 5) {
    // Chưa đủ 5 lá (vd. preflop chỉ có 2 lá tẩy): chỉ xét đôi hoặc lá cao
    const rs = cards.map(rankOf).sort((a, b) => b - a);
    const pair = rs.length >= 2 && rs[0] === rs[1];
    const cat = pair ? 1 : 0;
    return { score: 0, cat, tb: rs, best: cards.slice(), name: handName(cat, rs) };
  }
  let best = null;
  for (const c5 of combos(cards, 5)) {
    const e = eval5(c5);
    if (!best || e.score > best.score) best = { ...e, best: c5 };
  }
  return { ...best, name: handName(best.cat, best.tb) };
}
