// ====== HŨ CHÍNH & HŨ PHỤ ======
// Chia hũ theo từng tầng đóng góp. Ví dụ A=100, B=300, C=500 cùng all-in:
//   hũ chính 300 (A,B,C) | hũ phụ 400 (B,C) | 200 dư của C trả lại cho C

export function buildPots(seats) {
  const contrib = seats.map((s, i) => ({ i, t: s.total, f: s.folded })).filter((x) => x.t > 0);
  const levels = [...new Set(contrib.map((x) => x.t))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const lv of levels) {
    let amount = 0;
    for (const x of contrib) amount += Math.min(x.t, lv) - Math.min(x.t, prev);
    const eligible = contrib.filter((x) => !x.f && x.t >= lv).map((x) => x.i);
    prev = lv;
    if (amount <= 0) continue;
    const last = pots[pots.length - 1];
    if (!eligible.length && last) { last.amount += amount; continue; } // tầng chỉ người đã bỏ bài góp → dồn xuống hũ dưới
    if (last && last.eligible.join() === eligible.join()) last.amount += amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

// Thứ tự ưu tiên nhận chip lẻ: người ngồi gần bên trái nút Dealer nhất
export const leftOfButton = (button, n) => (a, b) => ((a - button - 1 + n) % n) - ((b - button - 1 + n) % n);

export function distribute(pots, scores, button, n) {
  return pots.map((pot) => {
    let winners;
    if (pot.eligible.length === 1) winners = pot.eligible.slice();
    else {
      const top = Math.max(...pot.eligible.map((i) => scores[i]));
      winners = pot.eligible.filter((i) => scores[i] === top);
    }
    winners.sort(leftOfButton(button, n));
    const share = Math.floor(pot.amount / winners.length);
    let rem = pot.amount - share * winners.length;
    const shares = {};
    for (const w of winners) { shares[w] = share + (rem > 0 ? 1 : 0); if (rem > 0) rem -= 1; }
    return { amount: pot.amount, eligible: pot.eligible, winners, shares, returned: pot.eligible.length === 1 };
  });
}
