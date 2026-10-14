// Gọi API bàn poker trên máy chủ Vercel
const PLAYER_KEY = 'poker-player';
const ROOM_KEY = 'poker-room';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

export const loadPlayer = () => read(PLAYER_KEY);
export const savePlayer = (p) => write(PLAYER_KEY, p);
export const loadRoom = () => read(ROOM_KEY);
export const saveRoom = (code) => write(ROOM_KEY, code);

export async function call(action, payload = {}) {
  const p = loadPlayer();
  let r;
  try {
    r = await fetch('/api/poker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, name: p?.name, token: p?.token, ...payload }),
    });
  } catch {
    throw Object.assign(new Error('Mất kết nối mạng'), { status: 0 });
  }
  let data = null;
  try { data = await r.json(); } catch { /* không phải JSON */ }
  if (!r.ok) throw Object.assign(new Error(data?.error || 'Máy chủ chưa sẵn sàng'), { status: r.status });
  return data;
}
