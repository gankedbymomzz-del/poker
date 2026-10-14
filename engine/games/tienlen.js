// ====== TIẾN LÊN MIỀN NAM ======
// 2–4 người, mỗi người 13 lá. Ai hết bài trước về Nhất. Chơi theo số ván, cộng điểm theo thứ hạng.
import { newDeck, shuffle } from '../cards.js';
import { clone, err, nextSeat, finishByScore, hideCards } from './common.js';

export const meta = {
  id: 'tienlen', name: 'Tiến lên miền Nam', min: 2, max: 4, scoring: 'point', defaultRounds: 8,
  rules: [
    'Mỗi người 13 lá. Thứ tự: 3 < 4 < … < K < A < 2 (heo). Chất: ♠ < ♣ < ♦ < ♥.',
    'Bộ hợp lệ: lẻ, đôi, sám (3 lá), tứ quý, sảnh (từ 3 lá liên tiếp, không có heo), đôi thông (từ 3 đôi liên tiếp).',
    'Phải đánh cùng loại, cùng số lá và lớn hơn. Bỏ lượt thì không được đánh lại cho tới vòng mới.',
    'Chặt heo: 3 đôi thông hoặc tứ quý chặt được 1 heo; tứ quý hoặc 4 đôi thông chặt được đôi heo; tứ quý chặt được 3 đôi thông; 4 đôi thông chặt được tứ quý.',
    'Bị chặt heo mất điểm ngay: heo đen (♠ ♣) 1 điểm, heo đỏ (♦ ♥) 2 điểm mỗi con, cộng cho người chặt.',
    'Tới trắng (thắng ngay khi chia): tứ quý heo, sảnh rồng (3 → A), 6 đôi, 5 đôi thông.',
    'Ván đầu người có 3♠ đi trước, các ván sau người về Nhất đi trước.',
    'Điểm mỗi ván (4 người): Nhất +3, Nhì +1, Ba −1, Bét −3.',
  ],
};

const TURN_MS = 25000;
export const TL_RANKS = '3456789TJQKA2';
export const TL_SUITS = 'scdh';
const rk = (c) => TL_RANKS.indexOf(c[0]);           // 0 (3) … 12 (2)
const val = (c) => rk(c) * 4 + TL_SUITS.indexOf(c[1]); // giá trị tuyệt đối của lá
export const sortHand = (cards) => cards.slice().sort((a, b) => val(a) - val(b));
const isHeo = (c) => c[0] === '2';
const heoPts = (c) => (c[1] === 'd' || c[1] === 'h' ? 2 : 1);
const POS_POINTS = { 2: [1, -1], 3: [2, 0, -2], 4: [3, 1, -1, -3] };

// Nhận diện bộ bài
export function combo(cards) {
  const cs = sortHand(cards);
  const n = cs.length;
  if (!n) return null;
  const top = val(cs[n - 1]);
  const ranks = cs.map(rk);
  const same = ranks.every((r) => r === ranks[0]);
  if (n === 1) return { type: 'single', len: 1, top };
  if (same && n === 2) return { type: 'pair', len: 2, top };
  if (same && n === 3) return { type: 'triple', len: 3, top };
  if (same && n === 4) return { type: 'quad', len: 4, top };
  if (n >= 3 && !ranks.includes(12) && new Set(ranks).size === n && ranks[n - 1] - ranks[0] === n - 1) return { type: 'straight', len: n, top };
  if (n >= 6 && n % 2 === 0 && !ranks.includes(12)) {
    let ok = true;
    for (let i = 0; i < n; i += 2) if (ranks[i] !== ranks[i + 1] || (i > 0 && ranks[i] !== ranks[i - 2] + 1)) ok = false;
    if (ok) return { type: 'pairseq', len: n / 2, top };
  }
  return null;
}

const heoCount = (c) => (c.type === 'single' || c.type === 'pair') && c.top >= 48; // 48 = giá trị nhỏ nhất của heo

// a có chặt / đè được b không
export function beats(a, b) {
  if (!a || !b) return false;
  if (a.type === b.type && a.len === b.len) return a.top > b.top;
  if (b.type === 'single' && b.top >= 48) return a.type === 'quad' || (a.type === 'pairseq' && a.len >= 3);
  if (b.type === 'pair' && b.top >= 48) return a.type === 'quad' || (a.type === 'pairseq' && a.len >= 4);
  if (b.type === 'pairseq' && b.len === 3) return a.type === 'quad' || (a.type === 'pairseq' && a.len >= 4);
  if (b.type === 'quad') return a.type === 'pairseq' && a.len >= 4;
  return false;
}

// Tới trắng
export function instantWin(hand) {
  const ranks = hand.map(rk);
  const cnt = {};
  ranks.forEach((r) => { cnt[r] = (cnt[r] || 0) + 1; });
  if (cnt[12] === 4) return 'Tứ quý heo';
  if ([...Array(12).keys()].every((r) => cnt[r])) return 'Sảnh rồng';
  if (Object.values(cnt).reduce((a, c) => a + Math.floor(c / 2), 0) >= 6) return '6 đôi';
  let run = 0;
  for (let r = 0; r < 12; r += 1) { run = cnt[r] >= 2 ? run + 1 : 0; if (run >= 5) return '5 đôi thông'; }
  return null;
}

export function create({ players, now = Date.now(), options = {} }) {
  if (players.length < meta.min || players.length > meta.max) throw err(`Tiến lên cần ${meta.min}–${meta.max} người`);
  return {
    type: 'tienlen', v: 0, round: 0, phase: 'idle', toAct: null, deadline: null, finished: false, winner: null,
    config: { rounds: options.rounds || meta.defaultRounds },
    startedAt: now,
    seats: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, score: 0, place: null, hand: null, passed: false, finishPos: null, delta: 0, revealed: false })),
    trick: null, lastWinner: null, order: [], log: [],
  };
}

const withCards = (g) => g.seats.map((_, i) => i).filter((i) => g.seats[i].hand?.length);

export function startRound(g0, now = Date.now(), rng = Math.random) {
  const g = clone(g0);
  if (g.finished) return g;
  if (g.round >= g.config.rounds) { finishByScore(g, 'score'); return g; }
  g.round += 1;
  const deck = shuffle(newDeck(), rng);
  for (const s of g.seats) Object.assign(s, { hand: sortHand(deck.splice(0, 13)), passed: false, finishPos: null, delta: 0, revealed: false });
  g.trick = null; g.order = []; g.phase = 'play';
  g.log = [`Ván ${g.round}`];
  g.v += 1;

  // Tới trắng
  const tw = g.seats.map((s, i) => ({ i, why: instantWin(s.hand) })).filter((x) => x.why);
  if (tw.length) {
    const w = tw[0].i;
    const n = g.seats.length;
    g.seats.forEach((s, i) => { s.revealed = true; const d = i === w ? 2 * (n - 1) : -2; s.delta = d; s.score += d; });
    g.seats[w].finishPos = 1;
    g.order = [w];
    g.lastWinner = w;
    g.log.push(`${g.seats[w].name} tới trắng: ${tw[0].why}!`);
    g.instant = tw[0].why;
    g.phase = 'done'; g.toAct = null; g.deadline = null;
    return g;
  }
  g.instant = null;
  let first = g.lastWinner;
  if (first == null) first = g.seats.findIndex((s) => s.hand.includes('3s'));
  if (first < 0) first = g.seats.reduce((b, s, i) => (val(s.hand[0]) < val(g.seats[b].hand[0]) ? i : b), 0); // ít người: không ai có 3♠
  g.toAct = first;
  g.deadline = now + TURN_MS;
  return g;
}

export function legal(g, seat) {
  if (g.phase !== 'play' || g.toAct !== seat || g.finished) return null;
  return { play: true, pass: !!g.trick, lead: !g.trick, trick: g.trick };
}

function finishRound(g) {
  const pts = POS_POINTS[g.seats.length];
  const last = withCards(g)[0];
  if (last != null) { g.seats[last].finishPos = g.order.length + 1; g.order.push(last); }
  g.order.forEach((i, k) => { const s = g.seats[i]; s.delta += pts[k]; s.score += pts[k]; s.revealed = true; });
  g.lastWinner = g.order[0];
  g.log.push(`Kết quả: ${g.order.map((i, k) => `${k + 1}. ${g.seats[i].name}`).join(' · ')}`);
  g.phase = 'done'; g.toAct = null; g.deadline = null;
}

// Chuyển lượt cho người kế tiếp còn bài và chưa bỏ lượt
function advance(g, from, now) {
  if (withCards(g).length <= 1) { finishRound(g); return; }
  const next = nextSeat(g.seats, from, (s, i) => s.hand.length > 0 && !s.passed && i !== g.trick?.by);
  const trickOwner = g.trick?.by;
  const ownerStillIn = trickOwner != null;
  if (next === -1 || (ownerStillIn && next === trickOwner)) { newTrick(g, now); return; }
  // Nếu mọi người khác đã bỏ lượt → người đánh cuối được đi vòng mới
  const others = g.seats.filter((s, i) => i !== trickOwner && s.hand.length > 0 && !s.passed);
  if (!others.length) { newTrick(g, now); return; }
  g.toAct = next;
  g.deadline = now + TURN_MS;
}

function newTrick(g, now) {
  const owner = g.trick?.by ?? g.toAct;
  g.trick = null;
  for (const s of g.seats) s.passed = false;
  // Người đánh cuối đã hết bài → quyền đi chuyển cho người kế tiếp còn bài
  g.toAct = g.seats[owner].hand.length ? owner : nextSeat(g.seats, owner, (s) => s.hand.length > 0);
  g.deadline = now + TURN_MS;
  g.log.push(`— Vòng mới: ${g.seats[g.toAct].name} đi —`);
}

export function act(g0, seat, action, now = Date.now()) {
  const g = clone(g0);
  const L = legal(g, seat);
  if (!L) throw err('Chưa tới lượt bạn');
  const s = g.seats[seat];
  let a = action;
  if (a.type === 'timeout') a = L.lead ? { type: 'play', cards: [s.hand[0]] } : { type: 'pass' };

  if (a.type === 'pass') {
    if (!L.pass) throw err('Bạn đang đi đầu vòng, không được bỏ lượt');
    s.passed = true;
    g.log.push(`${s.name} bỏ lượt`);
    advance(g, seat, now);
  } else if (a.type === 'play') {
    const cards = [...new Set(a.cards || [])];
    if (!cards.length || !cards.every((c) => s.hand.includes(c))) throw err('Bài không có trong tay');
    const c = combo(cards);
    if (!c) throw err('Bộ bài không hợp lệ');
    if (g.trick && !beats(c, g.trick)) throw err('Bộ này không đè được bài trên bàn');
    // Chặt heo: chuyển điểm ngay
    if (g.trick && heoCount(g.trick) && c.type !== g.trick.type) {
      const victim = g.seats[g.trick.by];
      const p = g.trick.cards.reduce((x, h) => x + (isHeo(h) ? heoPts(h) : 0), 0);
      victim.score -= p; victim.delta -= p; s.score += p; s.delta += p;
      g.log.push(`${s.name} CHẶT HEO của ${victim.name}! (+${p} điểm)`);
      g.chop = { by: seat, from: g.trick.by, pts: p, v: g.v + 1 };
    }
    s.hand = s.hand.filter((h) => !cards.includes(h));
    g.trick = { ...c, cards: sortHand(cards), by: seat };
    g.log.push(`${s.name} đánh ${sortHand(cards).length} lá`);
    if (!s.hand.length) {
      s.finishPos = g.order.length + 1;
      g.order.push(seat);
      g.log.push(`${s.name} hết bài, về ${['Nhất', 'Nhì', 'Ba', 'Bét'][s.finishPos - 1]}`);
    }
    advance(g, seat, now);
  } else throw err('Hành động không hợp lệ');
  g.v += 1;
  return g;
}

export function tick(g, now = Date.now()) {
  if (g.finished || g.phase !== 'play' || g.toAct == null || now < g.deadline) return g;
  return act(g, g.toAct, { type: 'timeout' }, now);
}

export const roundDone = (g) => g.phase === 'done';
export const view = (g, viewer) => hideCards(g, viewer);

// ---------- Tìm các bộ có thể đánh (dùng cho bot và gợi ý) ----------
export function candidates(hand, trick) {
  const hs = sortHand(hand);
  const byRank = {};
  hs.forEach((c) => { (byRank[rk(c)] ||= []).push(c); });
  const out = [];
  hs.forEach((c) => out.push([c]));
  for (const cs of Object.values(byRank)) {
    for (let i = 0; i < cs.length; i += 1) for (let j = i + 1; j < cs.length; j += 1) out.push([cs[i], cs[j]]);
    if (cs.length >= 3) out.push(cs.slice(0, 3), cs.slice(-3));
    if (cs.length === 4) out.push(cs.slice());
  }
  for (let start = 0; start < 12; start += 1) {
    const seq = [];
    for (let r = start; r < 12 && byRank[r]; r += 1) {
      seq.push(byRank[r][byRank[r].length - 1]);
      if (seq.length >= 3) out.push(seq.slice());
    }
    const pseq = [];
    for (let r = start; r < 12 && byRank[r]?.length >= 2; r += 1) {
      pseq.push(...byRank[r].slice(-2));
      if (pseq.length >= 6) out.push(pseq.slice());
    }
  }
  const valid = out.map((cs) => ({ cs, c: combo(cs) })).filter((x) => x.c && (!trick || beats(x.c, trick)));
  valid.sort((a, b) => a.c.len - b.c.len || a.c.top - b.c.top);
  return valid;
}

export function botAction(g, seat) {
  if (!legal(g, seat)) return null;
  const s = g.seats[seat];
  const opts = candidates(s.hand, g.trick);
  if (!g.trick) {
    // Đi đầu: ưu tiên bộ dài nhất có lá nhỏ nhất để xả bài
    const low = rk(s.hand[0]);
    const best = opts.filter((o) => o.cs.some((c) => rk(c) === low)).sort((a, b) => b.cs.length - a.cs.length)[0];
    return { type: 'play', cards: (best || opts[0]).cs };
  }
  const normal = opts.filter((o) => o.c.type === g.trick.type);
  if (normal.length) return { type: 'play', cards: normal[0].cs };
  if (opts.length) return { type: 'play', cards: opts[0].cs }; // chặt
  return { type: 'pass' };
}
