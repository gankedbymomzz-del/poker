// ====== API BÀN CHƠI NHIỀU NGƯỜI (Poker, Bài cào, Xì dách, Tiến lên, Mậu binh) ======
// POST /api/poker { action, name, token, code?, seat?, ...hành động của game }
// action: register | me | leaders | create | join | state | sit | setgame | start | act | leave | back | restart
// GET  /api/poker?action=config → địa chỉ + khoá công khai Supabase cho điện thoại nghe tín hiệu
//
// Nguyên tắc: máy chủ nắm toàn bộ trạng thái (kể cả bộ bài), mỗi người chỉ nhận phần mình được xem.
import crypto from 'node:crypto';
import {
  hasDb, publicConfig, getUser, insertUser, getRoom, insertRoom, saveRoom, cleanupRooms, rpc, getStats, topPlayers,
  NAME_RE, cleanName, keyOf, hash, serverRng,
} from './_lib/db.js';
import { gameOf, GAMES } from '../engine/games/index.js';

const SEATS = 6;
// Nghỉ giữa 2 ván để mọi người xem kết quả (Mậu binh cần lâu hơn để so chi)
const NEXT_MS = { poker: 4000, baicao: 6000, xidach: 6000, tienlen: 7000, maubinh: 12000 };
const nextMs = (type) => NEXT_MS[type] || 5000;
const SETTINGS = { startStack: 1500, levelMs: 6 * 60 * 1000, actionMs: 20000 };

const send = (res, status, data) => res.status(status).json(data);
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const readBody = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});

async function auth(b) {
  if (!b.token) return null;
  const key = keyOf(b.name);
  const u = await getUser(key);
  if (!u || u.token_hash !== hash(b.token)) return null;
  return { key, name: u.name };
}

const newState = (host) => ({ host, type: 'poker', rounds: null, seats: Array(SEATS).fill(null), game: null, map: [], doneAt: null, finishedAt: null, settings: SETTINGS });
const statusOf = (st) => (!st.game ? 'lobby' : st.game.finished ? 'finished' : 'playing');

// Tự chạy tiếp bàn: người hết giờ, người đã rời bàn, chia ván mới — dùng chung cho mọi game
function progress(st, now) {
  const G = gameOf(st.type);
  let changed = false;
  for (let guard = 0; st.game && !st.game.finished && guard < 80; guard += 1) {
    if (G.roundDone(st.game)) {
      if (!st.doneAt) { st.doneAt = now; changed = true; break; }
      if (now - st.doneAt < nextMs(st.type)) break;
      st.game = G.startRound(st.game, now, serverRng());
      st.doneAt = null;
      changed = true;
      continue;
    }
    // Người đã rời bàn: máy tự hành động thay ngay
    const away = st.game.seats.findIndex((_, i) => st.seats[st.map[i]]?.away && G.legal(st.game, i));
    if (away >= 0) {
      st.game = G.act(st.game, away, { type: 'timeout' }, now);
      if (G.roundDone(st.game)) st.doneAt = now;
      changed = true;
      continue;
    }
    // Hết giờ
    const t = G.tick(st.game, now);
    if (t !== st.game) {
      st.game = t;
      if (G.roundDone(t)) st.doneAt = now;
      changed = true;
      continue;
    }
    break;
  }
  if (st.game?.finished && !st.finishedAt) { st.finishedAt = now; changed = true; }
  return changed;
}

// Đọc → sửa → ghi có kiểm tra phiên bản. Hai người bấm cùng lúc thì người sau tự thử lại.
async function mutate(code, fn) {
  for (let i = 0; i < 4; i += 1) {
    const row = await getRoom(code);
    if (!row) throw httpErr(404, 'Không tìm thấy bàn, có thể đã đóng');
    const st = row.state;
    if (fn(st, row) === false) return row;
    const saved = await saveRoom(code, row.version, { state: st, status: statusOf(st), host: st.host });
    if (saved) return saved;
  }
  throw httpErr(409, 'Bàn đang bận, thử lại');
}

// Giải vừa kết thúc → ghi thành tích đúng 1 lần (ai "giành" được cờ statsDone thì người đó ghi)
async function recordIfFinished(row) {
  const st = row?.state;
  if (!st?.game?.finished || st.statsDone) return;
  let claimed = false;
  await mutate(row.code, (s) => { if (s.statsDone || !s.game?.finished) return false; s.statsDone = true; claimed = true; return true; });
  if (!claimed) return;
  await Promise.all(st.game.seats.map((s) => rpc('poker_record_result', {
    p_key: s.id, p_place: s.place || st.game.seats.length, p_hands: s.hands || st.game.handNo,
  }).catch(() => {})));
}

function view(row, meKey, now) {
  const st = row.state;
  const mySeat = st.seats.findIndex((s) => s?.key === meKey);
  const myEngine = mySeat >= 0 ? st.map.indexOf(mySeat) : -1;
  return {
    code: row.code, version: row.version, status: statusOf(st), now,
    type: st.type || 'poker', rounds: st.rounds || null,
    host: st.host, isHost: st.host === meKey,
    seats: st.seats.map((s) => s && { key: s.key, name: s.name, away: !!s.away }),
    map: st.map, mySeat, myEngine,
    doneAt: st.doneAt, nextHandMs: nextMs(st.type), settings: st.settings,
    game: st.game ? gameOf(st.type).view(st.game, myEngine) : null,
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.action === 'config') return send(res, 200, publicConfig());
    if (req.method !== 'POST') return send(res, 405, { error: 'Chỉ hỗ trợ POST' });
    if (!hasDb()) return send(res, 503, { error: 'Máy chủ chưa cấu hình Supabase' });

    const b = readBody(req);
    const now = Date.now();

    // ---------- Ghi danh ----------
    if (b.action === 'register') {
      const name = cleanName(b.name);
      if (!NAME_RE.test(name)) return send(res, 400, { error: 'Tên dài 2–14 ký tự, chỉ gồm chữ, số, khoảng trắng' });
      const key = keyOf(name);
      const u = await getUser(key);
      if (u) {
        if (b.token && u.token_hash === hash(b.token)) return send(res, 200, { name: u.name, token: b.token });
        return send(res, 409, { error: 'Tên này đã có người dùng, chọn tên khác' });
      }
      const token = crypto.randomUUID();
      try { await insertUser({ name_key: key, name, token_hash: hash(token) }); } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'Tên này vừa có người lấy, chọn tên khác' });
        throw e;
      }
      return send(res, 200, { name, token });
    }

    const me = await auth(b);
    if (!me) return send(res, 401, { error: 'Phiên đăng nhập hết hạn, hãy ghi danh lại' });

    // ---------- Thành tích & Bảng vàng ----------
    if (b.action === 'me') return send(res, 200, { stats: await getStats(me.key) });
    if (b.action === 'leaders') return send(res, 200, { top: await topPlayers() });

    // ---------- Tạo bàn ----------
    if (b.action === 'create') {
      cleanupRooms().catch(() => {});
      for (let i = 0; i < 12; i += 1) {
        const code = String(crypto.randomInt(1000, 10000));
        const state = newState(me.key);
        state.seats[0] = { key: me.key, name: me.name, away: false };
        try {
          await insertRoom({ code, host: me.key, status: 'lobby', version: 0, state });
          return send(res, 200, { room: view({ code, version: 0, state }, me.key, now) });
        } catch (e) { if (e.code !== '23505') throw e; } // trùng mã → thử mã khác
      }
      return send(res, 503, { error: 'Không tạo được bàn, thử lại' });
    }

    const code = String(b.code || '').replace(/\D/g, '').slice(0, 4);
    if (code.length !== 4) return send(res, 400, { error: 'Mã bàn gồm 4 chữ số' });
    const seatOf = (st) => st.seats.findIndex((s) => s?.key === me.key);

    let row;
    switch (b.action) {
      case 'state':
        row = await mutate(code, (st) => progress(st, now));
        break;

      case 'join':
        row = await mutate(code, (st) => {
          if (seatOf(st) >= 0) { const s = st.seats[seatOf(st)]; if (!s.away) return false; s.away = false; return true; }
          if (st.game && !st.game.finished) return false; // đang chơi → vào xem
          const free = st.seats.findIndex((s) => !s);
          if (free < 0) throw httpErr(409, 'Bàn đã đủ 6 người');
          st.seats[free] = { key: me.key, name: me.name, away: false };
          return true;
        });
        break;

      case 'sit':
        row = await mutate(code, (st) => {
          if (st.game && !st.game.finished) throw httpErr(409, 'Đang chơi, không đổi ghế được');
          const to = Number(b.seat);
          if (!(to >= 0 && to < SEATS) || st.seats[to]) throw httpErr(409, 'Ghế này đã có người');
          const from = seatOf(st);
          st.seats[to] = { key: me.key, name: me.name, away: false };
          if (from >= 0) st.seats[from] = null;
          return true;
        });
        break;

      case 'setgame':
        row = await mutate(code, (st) => {
          if (st.host !== me.key) throw httpErr(403, 'Chỉ chủ bàn mới chọn game được');
          if (st.game && !st.game.finished) throw httpErr(409, 'Giải đang diễn ra');
          if (!GAMES[b.type]) throw httpErr(400, 'Game không hợp lệ');
          st.type = b.type;
          const r = Number(b.rounds);
          st.rounds = Number.isInteger(r) && r >= 1 && r <= 50 ? r : null;
          return true;
        });
        break;

      case 'start':
        row = await mutate(code, (st) => {
          if (st.host !== me.key) throw httpErr(403, 'Chỉ chủ bàn mới bắt đầu được');
          if (st.game && !st.game.finished) throw httpErr(409, 'Giải đang diễn ra');
          const G = gameOf(st.type);
          const map = st.seats.map((s, i) => (s && !s.away ? i : -1)).filter((i) => i >= 0);
          if (map.length < G.meta.min) throw httpErr(409, `${G.meta.name} cần ít nhất ${G.meta.min} người`);
          if (map.length > G.meta.max) throw httpErr(409, `${G.meta.name} chỉ chơi tối đa ${G.meta.max} người, mời bớt người đứng dậy`);
          const players = map.map((i) => ({ id: st.seats[i].key, name: st.seats[i].name }));
          const options = st.type === 'poker' ? { ...st.settings } : { rounds: st.rounds || G.meta.defaultRounds };
          const g = G.create({ players, now, options });
          st.map = map;
          st.game = G.startRound(g, now, serverRng());
          st.doneAt = null;
          st.finishedAt = null;
          return true;
        });
        break;

      case 'act':
        row = await mutate(code, (st) => {
          if (!st.game || st.game.finished) throw httpErr(409, 'Bàn chưa chơi');
          const mine = st.map.indexOf(seatOf(st));
          if (mine < 0) throw httpErr(403, 'Bạn không ngồi trong giải này');
          const G = gameOf(st.type);
          progress(st, now); // xử lý người hết giờ trước
          if (st.game.finished || !G.legal(st.game, mine)) throw httpErr(409, 'Chưa tới lượt bạn');
          const { action: _a, name: _n, token: _t, code: _c, ...move } = b;
          st.game = G.act(st.game, mine, move, now);
          if (G.roundDone(st.game)) st.doneAt = now;
          progress(st, now); // người đã rời bàn tự bỏ bài ngay
          return true;
        });
        break;

      case 'leave':
        row = await mutate(code, (st) => {
          const i = seatOf(st);
          if (i < 0) return false;
          if (st.game && !st.game.finished && st.map.includes(i)) st.seats[i].away = true; // đang chơi → tự bỏ bài mỗi lượt
          else st.seats[i] = null;
          if (st.host === me.key) {
            const next = st.seats.find((s) => s && !s.away);
            if (next) st.host = next.key;
          }
          progress(st, now);
          return true;
        });
        return send(res, 200, { left: true });

      case 'back':
        row = await mutate(code, (st) => {
          const i = seatOf(st);
          if (i < 0 || !st.seats[i].away) return false;
          st.seats[i].away = false;
          return true;
        });
        break;

      case 'restart':
        row = await mutate(code, (st) => {
          if (st.host !== me.key) throw httpErr(403, 'Chỉ chủ bàn mới mở giải mới được');
          if (st.game && !st.game.finished) throw httpErr(409, 'Giải đang diễn ra');
          st.seats = st.seats.map((s) => (s && !s.away ? s : null));
          st.game = null; st.map = []; st.doneAt = null; st.finishedAt = null;
          return true;
        });
        break;

      default:
        return send(res, 400, { error: 'Hành động không hợp lệ' });
    }
    await recordIfFinished(row).catch(() => {});
    return send(res, 200, { room: view(row, me.key, now) });
  } catch (e) {
    if (e.rule) return send(res, 400, { error: e.message });
    if (e.status && e.status < 500) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'Lỗi máy chủ, thử lại sau' });
  }
}
