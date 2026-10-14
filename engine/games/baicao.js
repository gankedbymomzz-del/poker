// ====== BÀI CÀO 3 LÁ — nhà cái xoay vòng ======
// Mỗi ván: con đặt cược (1–3 lần mức cược) → chia 3 lá → nặn bài → so với nhà cái.
// Điểm = tổng nút lấy hàng đơn vị (A=1, 10/J/Q/K=10). 3 Tây (3 lá J/Q/K) lớn nhất, ăn gấp đôi.
import { newDeck, shuffle, rankOf } from '../cards.js';
import { clone, err, nextSeat, finishByScore, hideCards } from './common.js';

export const meta = {
  id: 'baicao', name: 'Bài cào 3 lá', min: 2, max: 6, scoring: 'chip', defaultRounds: 8,
  rules: [
    'Nhà cái xoay vòng theo chiều kim đồng hồ mỗi ván.',
    'Con đặt cược 1, 2 hoặc 3 lần mức cược trước khi chia bài.',
    'Mỗi người 3 lá. Điểm = tổng nút, chỉ lấy hàng đơn vị (A = 1; 10, J, Q, K = 10).',
    '3 Tây (cả 3 lá đều là J, Q, K) lớn nhất, ăn hoặc thua gấp đôi.',
    'Con so riêng với nhà cái: điểm cao hơn thì thắng, bằng điểm thì hoà.',
    'Nhà cái hết chip giữa chừng thì chỉ trả được đến khi hết.',
  ],
};

const BET_MS = 12000;
const PEEK_MS = 15000;

export function cardPoint(c) { const r = rankOf(c); return r >= 10 && r <= 13 ? 10 : r === 14 ? 1 : r; }
export function score(cards) {
  if (cards.every((c) => { const r = rankOf(c); return r >= 11 && r <= 13; })) return { pts: 10, name: '3 Tây', special: true };
  const pts = cards.reduce((a, c) => a + cardPoint(c), 0) % 10;
  return { pts, name: pts === 0 ? 'Bù (0 nút)' : `${pts} nút`, special: false };
}

export function create({ players, now = Date.now(), options = {} }) {
  if (players.length < meta.min || players.length > meta.max) throw err(`Bài cào cần ${meta.min}–${meta.max} người`);
  return {
    type: 'baicao', v: 0, round: 0, dealer: -1, phase: 'idle', deadline: null, finished: false, winner: null,
    config: { base: options.base || 50, rounds: options.rounds || meta.defaultRounds, startStack: 1500 },
    startedAt: now,
    seats: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, stack: 1500, out: false, place: null, hand: null, bet: 0, ready: false, delta: 0, result: null, revealed: false })),
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
  for (const s of g.seats) Object.assign(s, { hand: null, bet: 0, ready: false, delta: 0, result: null, revealed: false });
  g.phase = 'bet';
  g.deadline = now + BET_MS;
  g.log = [`Ván ${g.round} · nhà cái: ${g.seats[g.dealer].name}`];
  g.v += 1;
  return g;
}

export function legal(g, seat) {
  const s = g.seats[seat];
  if (!s || s.out || g.finished) return null;
  if (g.phase === 'bet' && seat !== g.dealer && !s.bet) {
    const opts = [1, 2, 3].filter((m) => m * g.config.base <= s.stack);
    return { bet: opts.length ? opts : [0] }; // 0 = tất tay số chip còn lại
  }
  if (g.phase === 'peek' && !s.ready) return { reveal: true };
  return null;
}

function deal(g, now) {
  for (let r = 0; r < 3; r += 1) for (const i of alive(g)) (g.seats[i].hand ||= []).push(g.deck.pop());
  g.phase = 'peek';
  g.deadline = now + PEEK_MS;
}

function settle(g) {
  const d = g.seats[g.dealer];
  const ds = score(d.hand);
  d.result = ds; d.revealed = true;
  const pays = [];
  for (const i of punters(g)) {
    const s = g.seats[i];
    const ps = score(s.hand);
    s.result = ps; s.revealed = true;
    if (ps.pts > ds.pts) pays.push({ i, amt: s.bet * (ps.special ? 2 : 1) });
    else if (ps.pts < ds.pts) {
      const lose = Math.min(s.stack, s.bet * (ds.special ? 2 : 1));
      s.stack -= lose; s.delta -= lose; d.stack += lose; d.delta += lose;
      g.log.push(`${s.name} thua ${lose}`);
    } else g.log.push(`${s.name} hoà`);
  }
  for (const { i, amt } of pays) { // nhà cái trả sau khi đã thu tiền người thua
    const s = g.seats[i];
    const paid = Math.min(amt, d.stack);
    d.stack -= paid; d.delta -= paid; s.stack += paid; s.delta += paid;
    g.log.push(paid < amt ? `${s.name} thắng ${amt}, nhà cái chỉ còn trả được ${paid}` : `${s.name} thắng ${paid}`);
  }
  for (const s of g.seats) if (!s.out && s.stack <= 0) { s.out = true; g.log.push(`${s.name} hết chip`); }
  g.phase = 'done';
  g.deadline = null;
}

export function act(g0, seat, action, now = Date.now()) {
  const g = clone(g0);
  const L = legal(g, seat);
  if (!L) throw err('Chưa tới lượt bạn');
  const s = g.seats[seat];
  let { type } = action;
  if (type === 'timeout') type = L.bet ? 'bet' : 'reveal';
  if (type === 'bet' && L.bet) {
    const m = action.mult ?? L.bet[0];
    if (!L.bet.includes(m)) throw err('Mức cược không hợp lệ');
    s.bet = m === 0 ? s.stack : m * g.config.base;
    g.log.push(`${s.name} cược ${s.bet}`);
    if (punters(g).every((i) => g.seats[i].bet)) deal(g, now);
  } else if (type === 'reveal' && L.reveal) {
    s.ready = true;
    if (alive(g).every((i) => g.seats[i].ready)) settle(g);
  } else throw err('Hành động không hợp lệ');
  g.v += 1;
  return g;
}

export function tick(g, now = Date.now()) {
  if (g.finished || !g.deadline || now < g.deadline) return g;
  let x = g;
  for (let i = 0; i < x.seats.length; i += 1) if (legal(x, i)) x = act(x, i, { type: 'timeout' }, now);
  return x;
}

export const roundDone = (g) => g.phase === 'done';
export const view = (g, viewer) => hideCards(g, viewer);
export const botAction = (g, seat, rng = Math.random) => {
  const L = legal(g, seat);
  if (!L) return null;
  if (L.bet) return { type: 'bet', mult: L.bet[Math.floor(rng() * L.bet.length)] };
  return { type: 'reveal' };
};
