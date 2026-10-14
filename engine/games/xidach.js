// ====== XÌ DÁCH — nhà cái xoay vòng ======
// Cược → chia 2 lá → kiểm tra Xì bàng / Xì dách → con lần lượt rút/dằn → nhà cái rút/dằn → so bài.
import { newDeck, shuffle, rankOf } from '../cards.js';
import { clone, err, nextSeat, finishByScore, hideCards } from './common.js';

export const meta = {
  id: 'xidach', name: 'Xì dách', min: 2, max: 6, scoring: 'chip', defaultRounds: 8,
  rules: [
    'Nhà cái xoay vòng mỗi ván. Con đặt cược 1–3 lần mức cược rồi nhận 2 lá.',
    'Xì bàng (2 Át) > Xì dách (Át + 10/J/Q/K) > Ngũ linh (5 lá không quá 21) > điểm thường.',
    'Át tính 1, 10 hoặc 11 khi có 2 lá; từ 3 lá trở lên tính 1 hoặc 10. J, Q, K tính 10.',
    'Con dưới 16 điểm không được dằn, phải rút. Nhà cái dưới 15 điểm phải rút. Tối đa 5 lá.',
    'Quá 21 là quắc. Con quắc thì thua, trừ khi nhà cái cũng quắc thì hoà.',
    'Xì bàng, Xì dách, Ngũ linh ăn hoặc thua gấp đôi. Nhà cái có Xì bàng/Xì dách thì lật ngay.',
  ],
};

const BET_MS = 12000;
const TURN_MS = 20000;

// Tổng điểm tốt nhất ≤ 21 (nếu không có thì lấy tổng nhỏ nhất)
export function total(cards) {
  const aces = cards.filter((c) => rankOf(c) === 14).length;
  let base = 0;
  for (const c of cards) { const r = rankOf(c); if (r !== 14) base += r >= 10 ? 10 : r; }
  const choices = cards.length === 2 ? [1, 10, 11] : [1, 10];
  let sums = [base];
  for (let k = 0; k < aces; k += 1) sums = sums.flatMap((v) => choices.map((x) => v + x));
  const ok = sums.filter((v) => v <= 21);
  return ok.length ? Math.max(...ok) : Math.min(...sums);
}

export function rate(cards) {
  const t = total(cards);
  const rs = cards.map(rankOf);
  if (cards.length === 2 && rs[0] === 14 && rs[1] === 14) return { rank: 1000, t, name: 'Xì bàng', x2: true, special: true };
  if (cards.length === 2 && rs.includes(14) && rs.some((r) => r >= 10 && r <= 13)) return { rank: 900, t, name: 'Xì dách', x2: true, special: true };
  if (t > 21) return { rank: -1, t, name: `Quắc (${t})`, bust: true };
  if (cards.length === 5) return { rank: 800 - t, t, name: `Ngũ linh (${t})`, x2: true };
  return { rank: t, t, name: `${t} điểm` };
}

export function create({ players, now = Date.now(), options = {} }) {
  if (players.length < meta.min || players.length > meta.max) throw err(`Xì dách cần ${meta.min}–${meta.max} người`);
  return {
    type: 'xidach', v: 0, round: 0, dealer: -1, phase: 'idle', toAct: null, deadline: null, finished: false, winner: null,
    config: { base: options.base || 50, rounds: options.rounds || meta.defaultRounds, startStack: 1500 },
    startedAt: now,
    seats: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, stack: 1500, out: false, place: null, hand: null, bet: 0, done: false, delta: 0, result: null, revealed: false })),
    log: [],
  };
}

const alive = (g) => g.seats.map((_, i) => i).filter((i) => !g.seats[i].out);
const punters = (g) => alive(g).filter((i) => i !== g.dealer);

export function startRound(g0, now = Date.now(), rng = Math.random) {
  const g = clone(g0);
  if (g.finished) return g;
  if (alive(g).length < 2 || g.round >= g.config.rounds) { finishByScore(g); return g; }
  g.round += 1;
  g.dealer = nextSeat(g.seats, g.dealer, (s) => !s.out);
  g.deck = shuffle(newDeck(), rng);
  for (const s of g.seats) Object.assign(s, { hand: null, bet: 0, done: false, delta: 0, result: null, revealed: false });
  g.phase = 'bet'; g.toAct = null; g.deadline = now + BET_MS;
  g.log = [`Ván ${g.round} · nhà cái: ${g.seats[g.dealer].name}`];
  g.v += 1;
  return g;
}

export function legal(g, seat) {
  const s = g.seats[seat];
  if (!s || s.out || g.finished) return null;
  if (g.phase === 'bet' && seat !== g.dealer && !s.bet) {
    const opts = [1, 2, 3].filter((m) => m * g.config.base <= s.stack);
    return { bet: opts.length ? opts : [0] };
  }
  if (g.phase === 'play' && g.toAct === seat) {
    const t = total(s.hand);
    const need = seat === g.dealer ? 15 : 16;
    const canHit = s.hand.length < 5 && t <= 21;
    return { hit: canHit, stand: t >= need || !canHit, total: t, need };
  }
  return null;
}

function nextPlayer(g, from, now) {
  // Con lần lượt từ trái nhà cái, cuối cùng là nhà cái
  const order = [];
  for (let k = 1; k <= g.seats.length; k += 1) { const i = (g.dealer + k) % g.seats.length; if (!g.seats[i].out) order.push(i); }
  const idx = from == null ? -1 : order.indexOf(from);
  for (let k = idx + 1; k < order.length; k += 1) if (!g.seats[order[k]].done) { g.toAct = order[k]; g.deadline = now + TURN_MS; return; }
  settle(g);
}

function deal(g, now) {
  for (let r = 0; r < 2; r += 1) for (const i of alive(g)) (g.seats[i].hand ||= []).push(g.deck.pop());
  const d = g.seats[g.dealer];
  const dr = rate(d.hand);
  // Con có Xì bàng / Xì dách thì xong luôn
  for (const i of punters(g)) if (rate(g.seats[i].hand).special) g.seats[i].done = true;
  if (dr.special) { g.log.push(`Nhà cái có ${dr.name}!`); settle(g); return; }
  g.phase = 'play';
  nextPlayer(g, null, now);
}

function settle(g) {
  const d = g.seats[g.dealer];
  const dr = rate(d.hand);
  d.result = dr; d.revealed = true;
  const pays = [];
  for (const i of punters(g)) {
    const s = g.seats[i];
    const pr = rate(s.hand);
    s.result = pr; s.revealed = true;
    let outcome;
    if (pr.bust && dr.bust) outcome = 0;
    else if (pr.bust) outcome = -1;
    else if (dr.bust) outcome = 1;
    else outcome = Math.sign(pr.rank - dr.rank);
    if (outcome > 0) pays.push({ i, amt: s.bet * (pr.x2 ? 2 : 1) });
    else if (outcome < 0) {
      const lose = Math.min(s.stack, s.bet * (dr.x2 && !pr.bust ? 2 : 1));
      s.stack -= lose; s.delta -= lose; d.stack += lose; d.delta += lose;
      g.log.push(`${s.name} thua ${lose}`);
    } else g.log.push(`${s.name} hoà`);
  }
  for (const { i, amt } of pays) {
    const s = g.seats[i];
    const paid = Math.min(amt, d.stack);
    d.stack -= paid; d.delta -= paid; s.stack += paid; s.delta += paid;
    g.log.push(paid < amt ? `${s.name} thắng ${amt}, nhà cái chỉ trả được ${paid}` : `${s.name} thắng ${paid}`);
  }
  for (const s of g.seats) if (!s.out && s.stack <= 0) { s.out = true; g.log.push(`${s.name} hết chip`); }
  g.phase = 'done'; g.toAct = null; g.deadline = null;
}

export function act(g0, seat, action, now = Date.now()) {
  const g = clone(g0);
  const L = legal(g, seat);
  if (!L) throw err('Chưa tới lượt bạn');
  const s = g.seats[seat];
  let { type } = action;
  if (type === 'timeout') type = L.bet ? 'bet' : L.stand && !(L.total < L.need && L.hit) ? 'stand' : 'hit';
  if (type === 'bet' && L.bet) {
    const m = action.mult ?? L.bet[0];
    if (!L.bet.includes(m)) throw err('Mức cược không hợp lệ');
    s.bet = m === 0 ? s.stack : m * g.config.base;
    g.log.push(`${s.name} cược ${s.bet}`);
    if (punters(g).every((i) => g.seats[i].bet)) deal(g, now);
  } else if (type === 'hit' && L.hit) {
    s.hand.push(g.deck.pop());
    g.log.push(`${s.name} rút bài`);
    const L2 = legal(g, seat);
    if (!L2.hit) { s.done = true; nextPlayer(g, seat, now); } else g.deadline = now + TURN_MS;
  } else if (type === 'stand' && L.stand) {
    s.done = true;
    g.log.push(`${s.name} dằn`);
    nextPlayer(g, seat, now);
  } else throw err(type === 'stand' ? `Chưa đủ ${L.need} điểm, phải rút thêm` : 'Hành động không hợp lệ');
  g.v += 1;
  return g;
}

export function tick(g, now = Date.now()) {
  if (g.finished || !g.deadline || now < g.deadline) return g;
  let x = g;
  if (x.phase === 'bet') { for (let i = 0; i < x.seats.length; i += 1) if (legal(x, i)) x = act(x, i, { type: 'timeout' }, now); return x; }
  if (x.phase === 'play' && x.toAct != null) return act(x, x.toAct, { type: 'timeout' }, now);
  return x;
}

export const roundDone = (g) => g.phase === 'done';
export const view = (g, viewer) => hideCards(g, viewer);
export function botAction(g, seat, rng = Math.random) {
  const L = legal(g, seat);
  if (!L) return null;
  if (L.bet) return { type: 'bet', mult: L.bet[Math.floor(rng() * L.bet.length)] };
  if (L.hit && (L.total < L.need || (L.total <= 16 && rng() < 0.5))) return { type: 'hit' };
  return L.stand ? { type: 'stand' } : { type: 'hit' };
}
