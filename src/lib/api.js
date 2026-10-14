// Gọi API bàn poker trên máy chủ Vercel
const PLAYER_KEY = 'poker-player';
const ROOM_KEY = 'poker-room';

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

export const loadPlayer = () => read(PLAYER_KEY);
export const savePlayer = (p) => write(PLAYER_KEY, p);
// Bàn đang chơi: { code, invite } (bản cũ chỉ lưu mã bàn)
export const loadRoom = () => { const r = read(ROOM_KEY); return typeof r === 'string' ? { code: r } : r; };
export const saveRoom = (room) => write(ROOM_KEY, room);

// Link mời dạng ?ban=1234&moi=xxxx
export function readInviteFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search);
    const code = (q.get('ban') || '').replace(/\D/g, '').slice(0, 4);
    const invite = q.get('moi') || '';
    if (code.length !== 4 || !invite) return null;
    window.history.replaceState(null, '', window.location.pathname); // xoá khỏi thanh địa chỉ
    return { code, invite };
  } catch { return null; }
}
export const inviteLink = (code, invite) => `${window.location.origin}/?ban=${code}&moi=${encodeURIComponent(invite)}`;

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
