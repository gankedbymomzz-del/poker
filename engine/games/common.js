// ====== DÙNG CHUNG CHO CÁC GAME BÀI ======
export const clone = (x) => JSON.parse(JSON.stringify(x));
export const err = (msg) => Object.assign(new Error(msg), { rule: true });

// Ghế tiếp theo theo chiều kim đồng hồ thoả điều kiện
export function nextSeat(seats, from, pred) {
  const n = seats.length;
  for (let k = 1; k <= n; k += 1) {
    const i = (((from + k) % n) + n) % n;
    if (pred(seats[i], i)) return i;
  }
  return -1;
}

// Kết thúc giải: xếp hạng theo điểm/chip (bằng nhau thì cùng hạng)
export function finishByScore(g, key = 'stack') {
  const order = g.seats.map((s, i) => i).sort((a, b) => g.seats[b][key] - g.seats[a][key]);
  order.forEach((i, k) => {
    const prev = order[k - 1];
    g.seats[i].place = k > 0 && g.seats[prev][key] === g.seats[i][key] ? g.seats[prev].place : k + 1;
    g.seats[i].hands = g.round;
  });
  g.finished = true;
  g.winner = order[0];
}

// Ẩn bài người khác: chỉ giữ bài của người xem và bài đã lật
export function hideCards(g, viewer, field = 'hand') {
  const v = clone(g);
  delete v.deck;
  v.seats.forEach((s, i) => {
    s.cardCount = Array.isArray(s[field]) ? s[field].length : 0;
    if (i !== viewer && !s.revealed) s[field] = null;
  });
  return v;
}
