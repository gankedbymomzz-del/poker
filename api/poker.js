// ====== API BÀN POKER NHIỀU NGƯỜI ======
// POST /api/poker { action, name, token, code?, seat?, type?, to? }
// action: register | create | join | state | sit | start | act | leave | back | restart
// GET  /api/poker?action=config → địa chỉ + khoá công khai Supabase cho điện thoại nghe tín hiệu
//
// Nguyên tắc: máy chủ nắm toàn bộ trạng thái (kể cả bộ bài), mỗi người chỉ nhận phần mình được xem.
import crypto from 'node:crypto';
import {
  hasDb, publicConfig, getUser, insertUser, getRoom, insertRoom, saveRoom, cleanupRooms,
  NAME_RE, cleanName, keyOf, hash, serverRng,
} from './_lib/db.js';
import { createGame, startHand, act, publicView } from '../engine/game.js';

const SEATS = 6;
const NEXT_HAND_MS = 4000; // nghỉ giữa 2 ván để mọi người xem kết quả
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

const newState = (host) => ({ host, seats: Array(SEATS).fill(null), game: null, map: [], doneAt: null, finishedAt: null, settings: SETTINGS });
const statusOf = (st) => (!st.game ? 'lobby' : st.game.finished ? 'finished' : 'playing');

// Tự chạy tiếp bàn: người hết giờ, người đã rời bàn, chia ván mới
function progress(st, now) {
  let changed = false;
  for (let guard = 0; st.game && !st.game.finished && guard < 60; guard += 1) {
    const h = st.game.hand;
    if (h.street === 'done') {
      if (!st.doneAt) { st.doneAt = now; changed = true; break; }
      if (now - st.doneAt < NEXT_HAND_MS) break;
      st.game = startHand(st.game, now, serverRng());
      st.doneAt = null;
      changed = true;
      continue;
    }
    const t = h.toAct;
    if (t == null) break;
    const away = st.seats[st.map[t]]?.away;
    if (!away && now < h.deadline) break;
    st.game = act(st.game, t, { type: 'timeout' }, now);
    if (st.game.hand.street === 'done') st.doneAt = now;
    changed = true;
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

function view(row, meKey, now) {
  const st = row.state;
  const mySeat = st.seats.findIndex((s) => s?.key === meKey);
  const myEngine = mySeat >= 0 ? st.map.indexOf(mySeat) : -1;
  return {
    code: row.code, version: row.version, status: statusOf(st), now,
    host: st.host, isHost: st.host === meKey,
    seats: st.seats.map((s) => s && { key: s.key, name: s.name, away: !!s.away }),
    map: st.map, mySeat, myEngine,
    doneAt: st.doneAt, nextHandMs: NEXT_HAND_MS, settings: st.settings,
    game: st.game ? publicView(st.game, myEngine) : null,
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

      case 'start':
        row = await mutate(code, (st) => {
          if (st.host !== me.key) throw httpErr(403, 'Chỉ chủ bàn mới bắt đầu được');
          if (st.game && !st.game.finished) throw httpErr(409, 'Giải đang diễn ra');
          const map = st.seats.map((s, i) => (s && !s.away ? i : -1)).filter((i) => i >= 0);
          if (map.length < 2) throw httpErr(409, 'Cần ít nhất 2 người ngồi vào bàn');
          const players = map.map((i) => ({ id: st.seats[i].key, name: st.seats[i].name }));
          const g = createGame({ players, ...st.settings, now });
          st.map = map;
          st.game = startHand(g, now, serverRng());
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
          progress(st, now); // xử lý người hết giờ trước
          if (st.game.hand.street === 'done' || st.game.hand.toAct !== mine) throw httpErr(409, 'Chưa tới lượt bạn');
          st.game = act(st.game, mine, { type: b.type, to: b.to }, now);
          if (st.game.hand.street === 'done') st.doneAt = now;
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
    return send(res, 200, { room: view(row, me.key, now) });
  } catch (e) {
    if (e.rule) return send(res, 400, { error: e.message });
    if (e.status && e.status < 500) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'Lỗi máy chủ, thử lại sau' });
  }
}
