// ====== MẬU BINH (BINH XẬP XÁM) ======
// 2–4 người, mỗi người 13 lá xếp thành 3 chi: chi cuối 5 lá ≥ chi giữa 5 lá ≥ chi đầu 3 lá.
// So từng chi với từng người. Dùng chung bộ chấm bài của Poker.
import { newDeck, shuffle, rankOf, rankLabel } from '../cards.js';
import { eval5, handName } from '../evaluate.js';
import { clone, err, finishByScore, hideCards } from './common.js';

export const meta = {
  id: 'maubinh', name: 'Mậu binh', min: 2, max: 4, scoring: 'point', defaultRounds: 8,
  rules: [
    'Mỗi người 13 lá, xếp thành 3 chi: chi đầu 3 lá, chi giữa 5 lá, chi cuối 5 lá.',
    'Chi cuối phải lớn hơn hoặc bằng chi giữa, chi giữa lớn hơn hoặc bằng chi đầu. Xếp sai là binh lủng: thua cả 3 chi gấp đôi.',
    'Thứ hạng bài như Poker. Chi đầu 3 lá chỉ tính mậu thầu, đôi, sám.',
    'So từng chi với từng người: thắng +1, thua −1 (nhân thưởng chi nếu có).',
    'Thắng cả 3 chi với một người là sập hầm: nhân đôi số chi ăn người đó.',
    'Thưởng chi: chi đầu sám ×3; chi giữa cù lũ ×2, tứ quý ×8, thùng phá sảnh ×10; chi cuối tứ quý ×4, thùng phá sảnh ×5.',
    'Mậu binh tới trắng (ăn 6 chi mỗi người, không cần so): sảnh rồng (13 lá khác nhau), 6 đôi.',
  ],
};

const ARRANGE_MS = 90000;

// Chi 3 lá: chỉ mậu thầu / đôi / sám, cùng thang điểm với chi 5 lá
export function eval3(cards) {
  const rs = cards.map(rankOf).sort((a, b) => b - a);
  let cat; let tb;
  if (rs[0] === rs[2]) { cat = 3; tb = [rs[0]]; }
  else if (rs[0] === rs[1]) { cat = 1; tb = [rs[0], rs[2]]; }
  else if (rs[1] === rs[2]) { cat = 1; tb = [rs[1], rs[0]]; }
  else { cat = 0; tb = rs; }
  let score = cat;
  for (let i = 0; i < 5; i += 1) score = score * 15 + (tb[i] || 0);
  return { score, cat, tb };
}
const name3 = (e) => (e.cat === 3 ? `Sám ${rankLabel(e.tb[0])}` : e.cat === 1 ? `Đôi ${rankLabel(e.tb[0])}` : `Mậu thầu ${rankLabel(e.tb[0])}`);

export function special(hand) {
  const rs = hand.map(rankOf);
  if (new Set(rs).size === 13) return { rank: 2, name: 'Sảnh rồng' };
  const cnt = {};
  rs.forEach((r) => { cnt[r] = (cnt[r] || 0) + 1; });
  if (Object.values(cnt).reduce((a, c) => a + Math.floor(c / 2), 0) >= 6) return { rank: 1, name: '6 đôi' };
  return null;
}

// Đánh giá một cách xếp
export function judge(arr) {
  const t = eval3(arr.top); const m = eval5(arr.mid); const b = eval5(arr.bot);
  const foul = !(b.score >= m.score && m.score >= t.score);
  return {
    foul,
    chi: [
      { e: t, name: name3(t), bonus: t.cat === 3 ? 3 : 1 },
      { e: m, name: handName(m.cat, m.tb), bonus: m.cat === 8 ? 10 : m.cat === 7 ? 8 : m.cat === 6 ? 2 : 1 },
      { e: b, name: handName(b.cat, b.tb), bonus: b.cat === 8 ? 5 : b.cat === 7 ? 4 : 1 },
    ],
  };
}

function* choose(arr, k, start = 0, pick = []) {
  if (pick.length === k) { yield pick.slice(); return; }
  for (let i = start; i <= arr.length - (k - pick.length); i += 1) { pick.push(arr[i]); yield* choose(arr, k, i + 1, pick); pick.pop(); }
}

// Xếp tự động: thử mọi cách hợp lệ, chọn cách tốt nhất theo điểm ước lượng.
// Chấm trước mỗi bộ 5 lá / 3 lá đúng 1 lần rồi tra bằng mảng đánh số theo bit (13 lá → 8.192 ô).
const MAX = 15 ** 6;
const PICK5_OF_8 = [...choose([0, 1, 2, 3, 4, 5, 6, 7], 5)];
export function autoArrange(hand) {
  const n = hand.length;
  const idx = hand.map((_, i) => i);
  const size = 1 << n;
  const s5 = new Float64Array(size); const c5 = new Int8Array(size);
  const s3 = new Float64Array(size); const c3 = new Int8Array(size);
  const masks5 = [];
  for (const ids of choose(idx, 5)) {
    const m = ids.reduce((x, i) => x | (1 << i), 0);
    const e = eval5(ids.map((i) => hand[i]));
    s5[m] = e.score; c5[m] = e.cat; masks5.push(m);
  }
  for (const ids of choose(idx, 3)) {
    const m = ids.reduce((x, i) => x | (1 << i), 0);
    const e = eval3(ids.map((i) => hand[i]));
    s3[m] = e.score; c3[m] = e.cat;
  }
  const full = size - 1;
  const rest = new Int32Array(8);
  let best = -1; let bb = 0; let bm = 0;
  for (const mb of masks5) {
    const sb = s5[mb];
    let k = 0;
    for (let i = 0; i < n; i += 1) if (!(mb & (1 << i))) rest[k++] = 1 << i;
    for (const p of PICK5_OF_8) {
      const mm = rest[p[0]] | rest[p[1]] | rest[p[2]] | rest[p[3]] | rest[p[4]];
      const sm = s5[mm];
      if (sm > sb) continue;
      const mt = full & ~mb & ~mm;
      const st = s3[mt];
      if (st > sm) continue;
      const v = sb / MAX + 1.25 * (sm / MAX) + 1.6 * (st / MAX) + (c3[mt] === 3 ? 0.6 : 0) + (c5[mm] === 6 ? 0.25 : 0);
      if (v > best) { best = v; bb = mb; bm = mm; }
    }
  }
  const pick = (m) => hand.filter((_, i) => m & (1 << i));
  return { top: pick(full & ~bb & ~bm), mid: pick(bm), bot: pick(bb) };
}

export function create({ players, now = Date.now(), options = {} }) {
  if (players.length < meta.min || players.length > meta.max) throw err(`Mậu binh cần ${meta.min}–${meta.max} người`);
  return {
    type: 'maubinh', v: 0, round: 0, phase: 'idle', deadline: null, finished: false, winner: null,
    config: { rounds: options.rounds || meta.defaultRounds },
    startedAt: now,
    seats: players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, score: 0, place: null, hand: null, arr: null, delta: 0, revealed: false, res: null })),
    log: [],
  };
}

export function startRound(g0, now = Date.now(), rng = Math.random) {
  const g = clone(g0);
  if (g.finished) return g;
  if (g.round >= g.config.rounds) { finishByScore(g, 'score'); return g; }
  g.round += 1;
  const deck = shuffle(newDeck(), rng);
  for (const s of g.seats) Object.assign(s, { hand: deck.splice(0, 13), arr: null, delta: 0, revealed: false, res: null });
  g.phase = 'arrange';
  g.deadline = now + ARRANGE_MS;
  g.log = [`Ván ${g.round}`];
  g.v += 1;
  return g;
}

export function legal(g, seat) {
  const s = g.seats[seat];
  if (!s || g.finished || g.phase !== 'arrange' || s.arr) return null;
  return { arrange: true };
}

function settle(g) {
  const n = g.seats.length;
  const info = g.seats.map((s) => ({ sp: special(s.hand), j: judge(s.arr) }));
  g.seats.forEach((s, i) => { s.revealed = true; s.res = { special: info[i].sp?.name || null, foul: !info[i].sp && info[i].j.foul, chi: info[i].j.chi.map((c) => c.name), vs: {} }; });
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const A = info[i]; const B = info[j];
      let d = 0; let note = '';
      if (A.sp || B.sp) {
        const ra = A.sp?.rank || 0; const rb = B.sp?.rank || 0;
        d = ra > rb ? 6 : ra < rb ? -6 : 0; note = 'tới trắng';
      } else if (A.j.foul || B.j.foul) {
        d = A.j.foul && B.j.foul ? 0 : A.j.foul ? -6 : 6; note = 'binh lủng';
      } else {
        let wins = 0; let losses = 0;
        for (let k = 0; k < 3; k += 1) {
          const sa = A.j.chi[k].e.score; const sb = B.j.chi[k].e.score;
          if (sa > sb) { d += A.j.chi[k].bonus; wins += 1; } else if (sa < sb) { d -= B.j.chi[k].bonus; losses += 1; }
        }
        if (wins === 3) { d *= 2; note = 'sập hầm'; } else if (losses === 3) { d *= 2; note = 'sập hầm'; }
      }
      g.seats[i].delta += d; g.seats[j].delta -= d;
      g.seats[i].res.vs[j] = { d, note }; g.seats[j].res.vs[i] = { d: -d, note };
    }
  }
  for (const s of g.seats) { s.score += s.delta; g.log.push(`${s.name}: ${s.delta >= 0 ? '+' : ''}${s.delta} chi`); }
  g.phase = 'done'; g.deadline = null;
}

export function act(g0, seat, action, now = Date.now()) {
  const g = clone(g0);
  if (!legal(g, seat)) throw err('Bạn đã báo xếp bài xong rồi');
  const s = g.seats[seat];
  let arr;
  if (action.type === 'timeout' || action.type === 'auto') arr = autoArrange(s.hand);
  else if (action.type === 'arrange') {
    arr = { top: action.top || [], mid: action.mid || [], bot: action.bot || [] };
    const all = [...arr.top, ...arr.mid, ...arr.bot];
    if (arr.top.length !== 3 || arr.mid.length !== 5 || arr.bot.length !== 5 || new Set(all).size !== 13 || !all.every((c) => s.hand.includes(c))) {
      throw err('Cách xếp không hợp lệ: cần 3 + 5 + 5 lá từ bài của bạn');
    }
  } else throw err('Hành động không hợp lệ');
  s.arr = arr;
  g.log.push(`${s.name} đã xếp xong`);
  if (g.seats.every((x) => x.arr)) settle(g);
  g.v += 1;
  return g;
}

export function tick(g, now = Date.now()) {
  if (g.finished || g.phase !== 'arrange' || now < g.deadline) return g;
  let x = g;
  for (let i = 0; i < x.seats.length; i += 1) if (legal(x, i)) x = act(x, i, { type: 'timeout' }, now);
  return x;
}

export const roundDone = (g) => g.phase === 'done';
export function view(g, viewer) {
  const v = hideCards(g, viewer);
  v.seats.forEach((s, i) => { s.ready = !!g.seats[i].arr; if (i !== viewer && !s.revealed) s.arr = null; });
  return v;
}
export const botAction = (g, seat) => (legal(g, seat) ? { type: 'auto' } : null);
