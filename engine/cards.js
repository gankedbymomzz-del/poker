// ====== BỘ BÀI ======
// Lá bài viết 2 ký tự: hạng + chất. Ví dụ 'As' = Át bích, 'Td' = 10 rô
export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc'; // bích, cơ, rô, chuồn
export const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };

export const rankOf = (c) => RANKS.indexOf(c[0]) + 2; // 2..14 (Át = 14)
export const suitOf = (c) => c[1];
export const isRed = (c) => c[1] === 'h' || c[1] === 'd';
export const rankLabel = (r) => ({ 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));
export const cardLabel = (c) => `${rankLabel(rankOf(c))}${SUIT_SYMBOL[c[1]]}`;

export function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

// Trộn Fisher-Yates
export function shuffle(deck, rng = Math.random) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bộ sinh số ngẫu nhiên mật mã — dùng ở máy chủ để không ai đoán trước được bài
export function secureRng() {
  const buf = new Uint32Array(1);
  return () => { globalThis.crypto.getRandomValues(buf); return buf[0] / 4294967296; };
}

// Bộ sinh số có hạt giống — dùng cho kiểm thử lặp lại được
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
