// ====== KẾT NỐI SUPABASE (chỉ chạy ở máy chủ Vercel) ======
// Gọi thẳng REST API của Supabase bằng fetch, không cần cài thêm thư viện.
import crypto from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SECRET = process.env.SUPABASE_SECRET_KEY || '';

export const hasDb = () => Boolean(URL_ && SECRET);
export const publicConfig = () => ({ url: URL_, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '' });

function headers(extra = {}) {
  const h = { apikey: SECRET, 'Content-Type': 'application/json', ...extra };
  if (SECRET.startsWith('eyJ')) h.Authorization = `Bearer ${SECRET}`; // khoá kiểu cũ (service_role) là JWT
  return h;
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const e = new Error(data?.message || `Supabase lỗi ${r.status}`);
    e.status = r.status;
    e.code = data?.code;
    throw e;
  }
  return data;
}

// ---------- Người chơi ----------
export const getUser = async (key) => (await rest(`poker_users?name_key=eq.${encodeURIComponent(key)}&select=*`))[0] || null;
export const insertUser = (row) => rest('poker_users', { method: 'POST', body: row, prefer: 'return=minimal' });
export const updateUser = (key, patch) => rest(`poker_users?name_key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });

export const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: args });

// Thành tích (cần chạy supabase/02_thanh_tich.sql; chưa chạy thì trả null, game vẫn chơi bình thường)
const STAT_COLS = 'name,games,wins,top3,best_place,hands,last_played';
export async function getStats(key) {
  try { return (await rest(`poker_users?name_key=eq.${encodeURIComponent(key)}&select=${STAT_COLS}`))[0] || null; } catch { return null; }
}
export async function topPlayers() {
  try { return await rest(`poker_users?select=${STAT_COLS}&games=gt.0&order=wins.desc,top3.desc,games.asc&limit=20`); } catch { return null; }
}

// ---------- Bàn chơi ----------
export const getRoom = async (code) => (await rest(`poker_rooms?code=eq.${code}&select=*`))[0] || null;
export const insertRoom = (row) => rest('poker_rooms', { method: 'POST', body: row, prefer: 'return=minimal' });

// Ghi có điều kiện phiên bản: nếu ai đó vừa ghi trước thì trả về null (để thử lại)
export async function saveRoom(code, version, patch) {
  const rows = await rest(`poker_rooms?code=eq.${code}&version=eq.${version}`, {
    method: 'PATCH',
    body: { ...patch, version: version + 1, updated_at: new Date().toISOString() },
    prefer: 'return=representation',
  });
  if (!rows.length) return null;
  await rest('poker_signals', {
    method: 'POST',
    body: { code, version: version + 1, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  return rows[0];
}

export async function deleteRoom(code) {
  await rest(`poker_rooms?code=eq.${code}`, { method: 'DELETE', prefer: 'return=minimal' });
  await rest(`poker_signals?code=eq.${code}`, { method: 'DELETE', prefer: 'return=minimal' });
}

// Dọn bàn bỏ quên: không có hoạt động nào quá 30 phút
export async function cleanupRooms() {
  const before = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await rest(`poker_rooms?updated_at=lt.${before}`, { method: 'DELETE', prefer: 'return=minimal' });
  await rest(`poker_signals?updated_at=lt.${before}`, { method: 'DELETE', prefer: 'return=minimal' });
}

// ---------- Tiện ích ----------
export const NAME_RE = /^[\p{L}\p{N} _.-]{2,14}$/u;
export const cleanName = (n) => String(n || '').normalize('NFC').trim().replace(/\s+/g, ' ');
export const keyOf = (n) => cleanName(n).toLowerCase();
export const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export const serverRng = () => () => crypto.randomInt(0, 2 ** 32) / 2 ** 32; // trộn bài bằng số ngẫu nhiên mật mã
