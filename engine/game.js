// ====== MÁY CHƠI TEXAS HOLD'EM NO-LIMIT (SIT & GO) ======
// Hàm thuần: nhận trạng thái + hành động → trả trạng thái MỚI (không sửa trạng thái cũ).
// Dùng y nguyên ở máy chủ (bước 2) và ở bàn chơi thử với máy (bước 1).
import { newDeck, shuffle } from './cards.js';
import { evaluate } from './evaluate.js';
import { buildPots, distribute } from './pots.js';

export const DEFAULT_LEVELS = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200],
  [150, 300], [200, 400], [300, 600], [400, 800], [600, 1200], [1000, 2000],
];

const clone = (x) => JSON.parse(JSON.stringify(x));
const err = (msg) => Object.assign(new Error(msg), { rule: true });

export function createGame({
  players, startStack = 1500, levels = DEFAULT_LEVELS, levelMs = 6 * 60 * 1000, actionMs = 20000, now = Date.now(),
}) {
  if (!players || players.length < 2 || players.length > 6) throw err('Cần từ 2 đến 6 người chơi');
  return {
    v: 0,
    config: { startStack, levels, levelMs, actionMs },
    startedAt: now,
    seats: players.map((p) => ({
      id: p.id, name: p.name, bot: !!p.bot, stack: startStack, out: false, place: null,
      hole: null, bet: 0, total: 0, folded: false, allIn: false, mustAct: false, canRaise: false, last: null,
    })),
    button: -1,
    handNo: 0,
    level: 0,
    hand: null,
    finished: false,
    winner: null,
  };
}

const N = (g) => g.seats.length;
const inHand = (g) => g.seats.map((_, i) => i).filter((i) => !g.seats[i].out && !g.seats[i].folded);
const canAct = (g) => inHand(g).filter((i) => !g.seats[i].allIn);

function nextIdx(g, from, pred) {
  const n = N(g);
  for (let k = 1; k <= n; k += 1) {
    const i = (((from + k) % n) + n) % n;
    if (pred(g.seats[i], i)) return i;
  }
  return -1;
}

export function levelAt(g, now) {
  return Math.min(g.config.levels.length - 1, Math.floor((now - g.startedAt) / g.config.levelMs));
}

function put(s, amount) {
  const a = Math.max(0, Math.min(amount, s.stack));
  s.stack -= a; s.bet += a; s.total += a;
  if (s.stack === 0) s.allIn = true;
  return a;
}

function log(g, text) { g.hand.log.push(text); }

// Người tiếp theo cần hành động (theo chiều kim đồng hồ từ `from`)
function nextToAct(g, from) {
  const h = g.hand;
  const others = (i) => canAct(g).filter((j) => j !== i).length;
  return nextIdx(g, from, (s, i) => !s.out && !s.folded && !s.allIn && s.mustAct
    && !(others(i) === 0 && s.bet >= h.currentBet)); // một mình còn chip và đã theo đủ → không cần nói
}

// ---------- BẮT ĐẦU VÁN ----------
export function startHand(g0, now = Date.now(), rng = Math.random) {
  const g = clone(g0);
  if (g.finished) return g;
  const alive = g.seats.map((_, i) => i).filter((i) => !g.seats[i].out);
  if (alive.length < 2) { g.finished = true; return g; }

  g.handNo += 1;
  g.level = levelAt(g, now);
  const [sb, bb] = g.config.levels[g.level];
  for (const s of g.seats) {
    Object.assign(s, { hole: null, bet: 0, total: 0, folded: s.out, allIn: false, mustAct: false, canRaise: false, last: null });
  }
  g.button = nextIdx(g, g.button, (s) => !s.out);
  const headsUp = alive.length === 2;
  // Heads-up: Dealer kiêm Small Blind
  const sbIdx = headsUp ? g.button : nextIdx(g, g.button, (s) => !s.out);
  const bbIdx = nextIdx(g, sbIdx, (s) => !s.out);

  const deck = shuffle(newDeck(), rng);
  g.hand = {
    street: 'preflop', deck, board: [], sb, bb, sbIdx, bbIdx,
    currentBet: bb, minRaise: bb, lastFullBet: bb,
    toAct: null, deadline: null, log: [], result: null, reveal: [], runout: false,
    startStacks: g.seats.map((s) => s.stack),
  };
  for (const i of alive) g.seats[i].hole = [deck.pop(), deck.pop()];

  const s1 = g.seats[sbIdx];
  const s2 = g.seats[bbIdx];
  log(g, `Ván ${g.handNo} · blind ${sb}/${bb}`);
  log(g, `${s1.name} đặt Small Blind ${put(s1, sb)}`);
  log(g, `${s2.name} đặt Big Blind ${put(s2, bb)}`);

  for (const i of alive) {
    const s = g.seats[i];
    if (!s.allIn) { s.mustAct = true; s.canRaise = true; }
  }
  const first = nextToAct(g, headsUp ? bbIdx : bbIdx);
  // Heads-up preflop: Dealer (SB) nói trước — chính là người sau BB
  if (first === -1) { endStreet(g, now); return g; }
  g.hand.toAct = first;
  g.hand.deadline = now + g.config.actionMs;
  return g;
}

// ---------- CÁC HÀNH ĐỘNG HỢP LỆ ----------
export function legalActions(g, seat) {
  const h = g.hand;
  if (!h || h.toAct !== seat) return null;
  const s = g.seats[seat];
  const toCall = Math.max(0, h.currentBet - s.bet);
  const maxTo = s.bet + s.stack;
  const res = {
    fold: true,
    check: toCall === 0,
    call: toCall > 0 ? Math.min(toCall, s.stack) : 0,
    toCall,
    raise: null,
    allIn: maxTo,
    pot: potTotal(g),
  };
  const othersWithChips = canAct(g).filter((i) => i !== seat).length > 0;
  if (s.canRaise && maxTo > h.currentBet && othersWithChips) {
    // Tố tối thiểu = mức cược hiện tại + mức tố đủ gần nhất (luật chuẩn No-Limit)
    const minTo = h.currentBet === 0 ? h.bb : h.currentBet + h.minRaise;
    res.raise = { min: Math.min(minTo, maxTo), max: maxTo, isBet: h.currentBet === 0 };
  }
  return res;
}

export const potTotal = (g) => g.seats.reduce((a, s) => a + s.total, 0);

function raiseTo(g, seat, to) {
  const h = g.hand;
  const s = g.seats[seat];
  const prev = h.currentBet;
  put(s, to - s.bet);
  h.currentBet = Math.max(h.currentBet, s.bet);
  const size = h.currentBet - prev; // mức tăng thêm so với cược trước đó
  const full = prev === 0 || size >= h.minRaise;
  if (full) {
    h.minRaise = Math.max(h.bb, size);
    h.lastFullBet = h.currentBet;
    for (const i of canAct(g)) if (i !== seat) { g.seats[i].mustAct = true; g.seats[i].canRaise = true; }
  } else {
    // All-in thiếu: không mở lại quyền tố cho người đã hành động
    for (const i of canAct(g)) {
      if (i === seat) continue;
      const q = g.seats[i];
      if (!q.mustAct) q.canRaise = false;
      q.mustAct = true;
    }
  }
}

// ---------- THỰC HIỆN HÀNH ĐỘNG ----------
// action: { type: 'fold' | 'check' | 'call' | 'raise' | 'allin' | 'timeout', to?: số chip tổng muốn cược ở vòng này }
export function act(g0, seat, action, now = Date.now()) {
  const g = clone(g0);
  const h = g.hand;
  if (!h || h.street === 'done') throw err('Ván đã kết thúc');
  if (h.toAct !== seat) throw err('Chưa tới lượt bạn');
  const s = g.seats[seat];
  const L = legalActions(g, seat);
  let type = action.type;
  if (type === 'timeout') { type = L.check ? 'check' : 'fold'; log(g, `${s.name} hết giờ`); }

  if (type === 'fold') {
    s.folded = true;
    log(g, `${s.name} bỏ bài`);
  } else if (type === 'check') {
    if (!L.check) throw err('Không thể nhường, phải theo hoặc bỏ bài');
    log(g, `${s.name} nhường`);
  } else if (type === 'call') {
    if (!L.call) throw err('Không có gì để theo');
    put(s, L.call);
    log(g, `${s.name} theo ${L.call}${s.allIn ? ' (all-in)' : ''}`);
  } else if (type === 'raise') {
    if (!L.raise) throw err('Không được tố lúc này');
    const to = Math.floor(Number(action.to));
    if (!(to >= L.raise.min && to <= L.raise.max)) throw err(`Mức cược phải từ ${L.raise.min} đến ${L.raise.max}`);
    raiseTo(g, seat, to);
    log(g, `${s.name} ${L.raise.isBet ? 'cược' : 'tố lên'} ${to}${s.allIn ? ' (all-in)' : ''}`);
  } else if (type === 'allin') {
    const to = s.bet + s.stack;
    if (to <= h.currentBet) { put(s, s.stack); log(g, `${s.name} all-in ${s.bet}`); }
    else if (!L.raise) { put(s, L.call); log(g, `${s.name} theo ${L.call}${s.allIn ? ' (all-in)' : ''}`); } // bị khoá quyền tố → chỉ theo
    else { raiseTo(g, seat, to); log(g, `${s.name} all-in ${to}`); }
  } else {
    throw err('Hành động không hợp lệ');
  }
  s.mustAct = false;
  s.last = type;
  g.v += 1;
  advance(g, seat, now);
  return g;
}

// Hết giờ suy nghĩ: tự nhường nếu được, không thì bỏ bài
export function tick(g, now = Date.now()) {
  const h = g.hand;
  if (!h || h.street === 'done' || h.toAct == null || now < h.deadline) return g;
  return act(g, h.toAct, { type: 'timeout' }, now);
}

function advance(g, lastSeat, now) {
  const h = g.hand;
  if (inHand(g).length === 1) { finishHand(g, now, false); return; }
  const next = nextToAct(g, lastSeat);
  if (next !== -1) { h.toAct = next; h.deadline = now + g.config.actionMs; return; }
  endStreet(g, now);
}

const STREETS = { preflop: ['flop', 3], flop: ['turn', 1], turn: ['river', 1] };

function endStreet(g, now) {
  const h = g.hand;
  for (const s of g.seats) s.bet = 0;
  h.currentBet = 0; h.lastFullBet = 0; h.minRaise = h.bb;
  h.toAct = null; h.deadline = null;

  while (true) {
    if (h.street === 'river') { finishHand(g, now, true); return; }
    const [next, n] = STREETS[h.street];
    h.deck.pop(); // đốt 1 lá
    for (let k = 0; k < n; k += 1) h.board.push(h.deck.pop());
    h.street = next;
    if (canAct(g).length <= 1) { h.runout = true; continue; } // mọi người đã all-in → lật hết bài
    for (const i of canAct(g)) { g.seats[i].mustAct = true; g.seats[i].canRaise = true; }
    log(g, `— ${{ flop: 'Flop', turn: 'Turn', river: 'River' }[next]} —`);
    h.toAct = nextToAct(g, g.button); // từ Flop: người còn bài đầu tiên bên trái Dealer nói trước
    h.deadline = now + g.config.actionMs;
    return;
  }
}

function finishHand(g, now, showdown) {
  const h = g.hand;
  const alive = inHand(g);
  const pots = buildPots(g.seats);
  let result;
  if (!showdown) {
    const w = alive[0];
    const amount = pots.reduce((a, p) => a + p.amount, 0);
    g.seats[w].stack += amount;
    result = { showdown: false, pots: [{ amount, eligible: [w], winners: [w], shares: { [w]: amount } }] };
    log(g, `${g.seats[w].name} thắng ${amount} (mọi người bỏ bài)`);
  } else {
    const scores = {};
    const hands = {};
    for (const i of alive) {
      const e = evaluate([...g.seats[i].hole, ...h.board]);
      scores[i] = e.score;
      hands[i] = { name: e.name, best: e.best, cat: e.cat };
    }
    const dist = distribute(pots, scores, g.button, N(g));
    for (const p of dist) for (const [i, amt] of Object.entries(p.shares)) g.seats[i].stack += amt;
    h.reveal = alive;
    result = { showdown: true, pots: dist, hands };
    dist.forEach((p, k) => {
      const names = p.winners.map((i) => g.seats[i].name).join(', ');
      const label = p.returned ? 'nhận lại' : k === 0 ? 'thắng hũ chính' : `thắng hũ phụ ${k}`;
      log(g, `${names} ${label} ${p.amount}${p.returned ? '' : ` · ${hands[p.winners[0]].name}`}`);
    });
  }
  h.result = result;
  h.street = 'done';
  h.toAct = null;
  h.deadline = null;

  // Loại người hết chip — ai vào ván với nhiều chip hơn xếp hạng cao hơn
  const busted = g.seats.map((s, i) => i).filter((i) => !g.seats[i].out && g.seats[i].stack === 0)
    .sort((a, b) => h.startStacks[a] - h.startStacks[b]);
  let remaining = g.seats.filter((s) => !s.out).length;
  for (const i of busted) {
    g.seats[i].out = true;
    g.seats[i].place = remaining;
    g.seats[i].hands = g.handNo;
    remaining -= 1;
    log(g, `${g.seats[i].name} bị loại, hạng ${g.seats[i].place}`);
  }
  const left = g.seats.map((_, i) => i).filter((i) => !g.seats[i].out);
  if (left.length === 1) {
    g.finished = true;
    g.winner = left[0];
    g.seats[left[0]].place = 1;
    g.seats[left[0]].hands = g.handNo;
    log(g, `${g.seats[left[0]].name} vô địch!`);
  }
}

// Ẩn bộ bài và bài tẩy người khác — máy chủ dùng hàm này trước khi gửi cho từng người
export function publicView(g, viewer) {
  const v = clone(g);
  if (v.hand) {
    delete v.hand.deck;
    v.seats.forEach((s, i) => {
      const show = i === viewer || v.hand.reveal.includes(i);
      s.hasCards = !!s.hole && !s.folded;
      if (!show) s.hole = null;
    });
  }
  return v;
}
