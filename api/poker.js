// ====== API BÀN CHƠI NHIỀU NGƯỜI (Poker, Bài cào, Xì dách, Tiến lên, Mậu binh) ======
// POST /api/poker { action, name, token, code?, seat?, ...hành động của game }
// action: register | me | leaders | create | join | state | sit | setgame | start | act | leave | back | restart
//         chat | throw | loan | loanreply | repay
// GET  /api/poker?action=config → địa chỉ + khoá công khai Supabase cho điện thoại nghe tín hiệu
//
// Nguyên tắc: máy chủ nắm toàn bộ trạng thái (kể cả bộ bài), mỗi người chỉ nhận phần mình được xem.
import crypto from 'node:crypto';
import {
  hasDb, publicConfig, getUser, insertUser, updateUser, getRoom, insertRoom, saveRoom, deleteRoom, cleanupRooms, rpc, getStats, topPlayers,
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
  if (!u) return null;
  const ok = u.token_hash.startsWith('p:') ? u.token_hash === pinHash(key, b.token) : u.token_hash === hash(b.token);
  return ok ? { key, name: u.name } : null;
}

// ====== MẬT KHẨU QUẢN TRỊ ======
// Biến môi trường ADMIN_PASSWORD: ai nhập đúng mật khẩu này mới mở được bàn.
// Người khác vào bàn bằng link mời (mã bàn + mã mời) do chủ bàn gửi.
function adminOk(pass) {
  const real = String(process.env.ADMIN_PASSWORD || '');
  if (!real || !pass) return false;
  const a = crypto.createHash('sha256').update(real).digest();
  const b = crypto.createHash('sha256').update(String(pass)).digest();
  return crypto.timingSafeEqual(a, b);
}

// ====== ĐĂNG NHẬP: TÊN + MÃ PIN ======
// Lưu dạng 'p:' + hash(tên + PIN) → đăng nhập được trên mọi máy bằng tên + PIN.
// Tài khoản cũ (chưa có PIN) được nhận lại bằng PIN mới ở lần đăng nhập kế tiếp.
const PIN_RE = /^\d{4,8}$/;
const pinHash = (key, pin) => `p:${hash(`${key}:${pin}`)}`;
const newInvite = () => crypto.randomBytes(6).toString('base64url');
const inviteOk = (st, b) => Boolean(st?.invite && b.invite && b.invite === st.invite);

const newState = (host) => ({ host, invite: newInvite(), type: 'poker', rounds: null, seats: Array(SEATS).fill(null), game: null, map: [], doneAt: null, finishedAt: null, settings: SETTINGS });
const statusOf = (st) => (!st.game ? 'lobby' : st.game.finished ? 'finished' : 'playing');

// ====== CHAT & NÉM ICON ======
const CHAT_KEEP = 60;
export const EMOTES = ['😂', '😡', '😭', '👍', '🔥', '🙏', '😎', '🤡'];
export const THROWS = ['🍅', '🌹', '🥚', '💣', '🍺', '💋', '👏', '💩'];
const BAD = ['đm', 'đmm', 'dm', 'dmm', 'đcm', 'dcm', 'vcl', 'vkl', 'vl', 'clm', 'cmm', 'địt', 'lồn', 'cặc', 'buồi', 'đụ', 'đĩ', 'fuck', 'shit'];
const BAD_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${BAD.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
const cleanText = (t) => String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 120).replace(BAD_RE, '***');

function pushChat(st, msg) {
  st.chatSeq = (st.chatSeq || 0) + 1;
  st.chat = [...(st.chat || []), { id: st.chatSeq, t: Date.now(), ...msg }].slice(-CHAT_KEEP);
}
const sys = (st, text) => pushChat(st, { y: 'sys', text });
function rateLimit(st, key, now, ms = 700) {
  st.lastChat ||= {};
  if (now - (st.lastChat[key] || 0) < ms) throw httpErr(429, 'Gửi chậm lại một chút');
  st.lastChat[key] = now;
}

// ====== VAY CHIP ======
// Chip chỉ chuyển giữa 2 ván (chuyển giữa ván sẽ phá luật cược). Người cho/trả luôn giữ lại ít nhất 1 chip.
const CHIP_GAMES = new Set(['poker', 'baicao', 'xidach']);
const LOAN_TTL = 90000;
const fmtChip = (n) => Number(n).toLocaleString('vi-VN');

function applyTransfers(st) {
  if (!st.transfers?.length || !st.game) return false;
  const seats = st.game.seats;
  for (const tr of st.transfers) {
    const from = seats.find((s) => s.id === tr.from);
    const to = seats.find((s) => s.id === tr.to);
    const loan = (st.loans || []).find((l) => l.id === tr.loanId);
    if (!from || !to || !loan) continue;
    let amt = Math.min(tr.amount, from.stack - 1);
    if (tr.kind === 'repay') amt = Math.min(amt, loan.amount - loan.repaid);
    if (amt <= 0) {
      if (tr.kind === 'loan') loan.status = 'failed';
      sys(st, `${from.name} không đủ chip để ${tr.kind === 'loan' ? 'cho vay' : 'trả nợ'}`);
      continue;
    }
    from.stack -= amt;
    to.stack += amt;
    if (to.out && to.stack > 0) { to.out = false; to.place = null; } // hết chip mà được vay thì vào chơi lại
    if (tr.kind === 'loan') { loan.status = 'active'; loan.amount = amt; sys(st, `${to.name} đã nhận ${fmtChip(amt)} chip vay từ ${from.name}`); }
    else { loan.repaid += amt; if (loan.repaid >= loan.amount) loan.status = 'repaid'; sys(st, `${from.name} đã trả ${to.name} ${fmtChip(amt)} chip`); }
  }
  st.transfers = [];
  return true;
}

// Tự chạy tiếp bàn: người hết giờ, người đã rời bàn, chia ván mới — dùng chung cho mọi game
function progress(st, now) {
  const G = gameOf(st.type);
  let changed = false;
  if (st.game && !st.seats.some((s) => s && !s.away)) return false; // cả bàn đã rời: dừng hẳn, không chạy ẩn
  for (let guard = 0; st.game && !st.game.finished && guard < 80; guard += 1) {
    if (G.roundDone(st.game)) {
      if (st.transfers?.length && applyTransfers(st)) changed = true;
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
    invite: st.host === meKey ? st.invite || null : null,
    seats: st.seats.map((s) => s && { key: s.key, name: s.name, away: !!s.away }),
    map: st.map, mySeat, myEngine,
    doneAt: st.doneAt, nextHandMs: nextMs(st.type), settings: st.settings,
    game: st.game ? gameOf(st.type).view(st.game, myEngine) : null,
    chat: (st.chat || []).slice(-40),
    loans: st.loans || [],
    pendingTransfers: (st.transfers || []).length,
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
      const pin = String(b.pin || '');
      if (!PIN_RE.test(pin)) return send(res, 400, { error: 'Mã PIN gồm 4–8 chữ số' });
      const key = keyOf(name);
      const u = await getUser(key);
      if (u) {
        if (u.token_hash.startsWith('p:')) {
          if (u.token_hash !== pinHash(key, pin)) return send(res, 401, { error: 'Sai mã PIN của tên này' });
        } else {
          await updateUser(key, { token_hash: pinHash(key, pin) }); // tài khoản cũ: nhận lại bằng PIN
        }
        return send(res, 200, { name: u.name, token: pin });
      }
      try { await insertUser({ name_key: key, name, token_hash: pinHash(key, pin) }); } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'Tên này vừa có người lấy, chọn tên khác' });
        throw e;
      }
      return send(res, 200, { name, token: pin });
    }

    const me = await auth(b);
    if (!me) return send(res, 401, { error: 'Phiên đăng nhập hết hạn, hãy ghi danh lại' });

    // ---------- Thành tích & Bảng vàng ----------
    if (b.action === 'me') return send(res, 200, { stats: await getStats(me.key) });
    if (b.action === 'leaders') return send(res, 200, { top: await topPlayers() });

    // ---------- Tạo bàn ----------
    if (b.action === 'create') {
      if (!process.env.ADMIN_PASSWORD) return send(res, 503, { error: 'Chưa đặt mật khẩu quản trị (ADMIN_PASSWORD) trên Vercel' });
      if (!adminOk(b.adminPass)) return send(res, 403, { error: 'Sai mật khẩu quản trị' });
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
        row = await mutate(code, (st) => {
          if (seatOf(st) < 0 && !inviteOk(st, b)) throw httpErr(403, 'Bạn không có quyền xem bàn này');
          return progress(st, now);
        });
        break;

      case 'join':
        cleanupRooms().catch(() => {});
        row = await mutate(code, (st) => {
          if (seatOf(st) >= 0) { const s = st.seats[seatOf(st)]; if (!s.away) return false; s.away = false; return true; }
          if (!inviteOk(st, b)) throw httpErr(403, 'Cần link mời của chủ bàn để vào bàn này');
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

      case 'leave': {
        let empty = false;
        row = await mutate(code, (st) => {
          const i = seatOf(st);
          if (i < 0) return false;
          if (st.game && !st.game.finished && st.map.includes(i)) st.seats[i].away = true; // đang chơi → tự bỏ bài mỗi lượt
          else st.seats[i] = null;
          if (st.host === me.key) {
            const next = st.seats.find((s) => s && !s.away);
            if (next) st.host = next.key;
          }
          empty = !st.seats.some((s) => s && !s.away); // không còn ai đang ngồi chơi
          if (!empty) progress(st, now);
          return true;
        });
        if (empty) await deleteRoom(code).catch(() => {});
        return send(res, 200, { left: true, closed: empty });
      }

      case 'back':
        row = await mutate(code, (st) => {
          const i = seatOf(st);
          if (i < 0 || !st.seats[i].away) return false;
          st.seats[i].away = false;
          return true;
        });
        break;

      case 'chat':
        row = await mutate(code, (st) => {
          const text = cleanText(b.text);
          if (!text) throw httpErr(400, 'Tin nhắn trống');
          rateLimit(st, me.key, now);
          pushChat(st, { y: EMOTES.includes(text) ? 'emote' : 'msg', k: me.key, n: me.name, text });
          return true;
        });
        break;

      case 'throw':
        row = await mutate(code, (st) => {
          if (!THROWS.includes(b.e)) throw httpErr(400, 'Icon không hợp lệ');
          const to = st.seats.find((s) => s?.key === b.to);
          if (!to || b.to === me.key) throw httpErr(400, 'Hãy chọn người khác');
          rateLimit(st, `${me.key}:nem`, now, 1200);
          pushChat(st, { y: 'throw', k: me.key, n: me.name, to: to.key, toName: to.name, e: b.e });
          return true;
        });
        break;

      case 'loan':
        row = await mutate(code, (st) => {
          if (!CHIP_GAMES.has(st.type) || !st.game || st.game.finished) throw httpErr(409, 'Chỉ vay được khi đang chơi game tính chip');
          const lender = st.game.seats.find((s) => s.id === b.to);
          const amount = Math.floor(Number(b.amount));
          if (!lender || b.to === me.key) throw httpErr(400, 'Hãy chọn người cho vay');
          if (!(amount >= 50 && amount <= 100000)) throw httpErr(400, 'Số chip vay từ 50 đến 100.000');
          if (amount > lender.stack - 1) throw httpErr(409, `${lender.name} chỉ còn ${fmtChip(lender.stack)} chip`);
          st.loans ||= [];
          if (st.loans.filter((l) => l.to === me.key && l.status === 'pending').length >= 2) throw httpErr(409, 'Bạn đang có 2 lời hỏi vay chờ trả lời');
          st.loanSeq = (st.loanSeq || 0) + 1;
          st.loans.push({ id: st.loanSeq, from: lender.id, fromName: lender.name, to: me.key, toName: me.name, amount, repaid: 0, status: 'pending', t: now });
          sys(st, `${me.name} hỏi vay ${lender.name} ${fmtChip(amount)} chip`);
          return true;
        });
        break;

      case 'loanreply':
        row = await mutate(code, (st) => {
          const loan = (st.loans || []).find((l) => l.id === Number(b.id));
          if (!loan || loan.from !== me.key) throw httpErr(404, 'Không tìm thấy lời hỏi vay');
          if (loan.status !== 'pending') throw httpErr(409, 'Lời hỏi vay này đã xử lý');
          if (now - loan.t > LOAN_TTL) { loan.status = 'expired'; sys(st, `Lời hỏi vay của ${loan.toName} đã hết hạn`); return true; }
          if (b.accept) {
            loan.status = 'accepted';
            (st.transfers ||= []).push({ kind: 'loan', from: loan.from, to: loan.to, amount: loan.amount, loanId: loan.id });
            sys(st, `${me.name} đồng ý cho ${loan.toName} vay ${fmtChip(loan.amount)} chip (chuyển khi hết ván)`);
          } else {
            loan.status = 'declined';
            sys(st, `${me.name} từ chối cho ${loan.toName} vay`);
          }
          progress(st, now); // đang nghỉ giữa 2 ván thì chuyển luôn
          return true;
        });
        break;

      case 'repay':
        row = await mutate(code, (st) => {
          const loan = (st.loans || []).find((l) => l.id === Number(b.id));
          if (!loan || loan.to !== me.key || loan.status !== 'active') throw httpErr(404, 'Không có khoản nợ này');
          const remain = loan.amount - loan.repaid;
          const amount = Math.min(remain, Math.floor(Number(b.amount) || remain));
          if (!(amount > 0)) throw httpErr(400, 'Số chip trả không hợp lệ');
          (st.transfers ||= []).push({ kind: 'repay', from: me.key, to: loan.from, amount, loanId: loan.id });
          sys(st, `${me.name} sẽ trả ${loan.fromName} ${fmtChip(amount)} chip khi hết ván`);
          progress(st, now);
          return true;
        });
        break;

      case 'restart':
        row = await mutate(code, (st) => {
          if (st.host !== me.key) throw httpErr(403, 'Chỉ chủ bàn mới mở giải mới được');
          if (st.game && !st.game.finished) throw httpErr(409, 'Giải đang diễn ra');
          st.seats = st.seats.map((s) => (s && !s.away ? s : null));
          st.game = null; st.map = []; st.doneAt = null; st.finishedAt = null;
          st.loans = []; st.transfers = [];
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
