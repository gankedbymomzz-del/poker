import { useEffect, useState } from 'react';
import { call, loadPlayer, savePlayer, loadRoom, saveRoom, readInviteFromUrl } from './lib/api.js';
import { unlock } from './lib/sfx.js';
import Card from './Card.jsx';
import PracticeGame from './PracticeGame.jsx';
import { GAME_LIST, gameOf } from '../engine/games/index.js';
import OnlineGame from './OnlineGame.jsx';

// Màn hình chính: ghi danh → thành tích → tạo bàn / vào bàn / luyện tập với máy
export default function App() {
  const [player, setPlayer] = useState(loadPlayer);
  const [screen, setScreen] = useState('home'); // home | bots | online
  const [room, setRoom] = useState(null);
  const [name, setName] = useState('');
  const [bots, setBots] = useState(3);
  const [ptype, setPtype] = useState('poker');
  const [fast, setFast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [stats, setStats] = useState(null);
  const [leaders, setLeaders] = useState(null);
  const [pin, setPin] = useState('');
  const [adminSheet, setAdminSheet] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [invite] = useState(readInviteFromUrl); // mở từ link mời

  // Trình duyệt chỉ cho phát âm thanh sau lần chạm đầu tiên
  useEffect(() => {
    const u = () => unlock();
    window.addEventListener('pointerdown', u);
    return () => window.removeEventListener('pointerdown', u);
  }, []);

  // Mở từ link mời → vào thẳng bàn; tải lại trang giữa chừng → tự vào lại đúng bàn
  useEffect(() => {
    if (!player) return;
    if (invite) { enter('join', invite.code, false, invite.invite); return; }
    const saved = loadRoom();
    if (saved?.code) enter('join', saved.code, true, saved.invite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thành tích của bạn
  useEffect(() => {
    if (!player || screen !== 'home') return;
    call('me').then((r) => setStats(r.stats)).catch(() => setStats(null));
  }, [player, screen]);

  const register = async () => {
    setBusy(true); setErr('');
    try {
      const r = await call('register', { name: name.trim(), pin });
      const p = { name: r.name, token: r.token };
      savePlayer(p);
      setPlayer(p);
      if (invite) enter('join', invite.code, false, invite.invite);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  async function enter(action, c, silent = false, inv = null, extra = {}) {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await call(action, c ? { code: c, invite: inv } : extra);
      const myInvite = r.room.invite || inv || null;
      saveRoom({ code: r.room.code, invite: myInvite });
      setRoom({ ...r.room, myInvite });
      setScreen('online');
      return true;
    } catch (e) {
      if (silent) saveRoom(null); else setErr(e.message);
      if (e.status === 401) { savePlayer(null); setPlayer(null); }
      return false;
    } finally { setBusy(false); }
  }

  // Mở bàn: cần mật khẩu quản trị (có thể ghi nhớ trên máy này)
  const ADMIN_KEY = 'poker-admin';
  const openTable = async (pass) => {
    const p = pass ?? (() => { try { return localStorage.getItem(ADMIN_KEY); } catch { return null; } })();
    if (!p) { setAdminSheet(true); return; }
    const ok = await enter('create', null, false, null, { adminPass: p });
    if (ok) {
      setAdminSheet(false); setAdminPass('');
      try { if (remember) localStorage.setItem(ADMIN_KEY, p); } catch { /* bỏ qua */ }
    } else if (pass == null) {
      try { localStorage.removeItem(ADMIN_KEY); } catch { /* bỏ qua */ }
      setAdminSheet(true); // mật khẩu đã lưu không còn đúng → hỏi lại
    }
  };

  const openLeaders = async () => {
    setLeaders({ loading: true });
    try { const r = await call('leaders'); setLeaders({ top: r.top }); } catch (e) { setLeaders({ error: e.message }); }
  };

  const exit = (note) => { setScreen('home'); setRoom(null); if (typeof note === 'string') setMsg(note); };

  if (screen === 'bots') return <PracticeGame type={ptype} name={player?.name || 'Bạn'} bots={bots} fast={fast} onExit={exit} />;
  if (screen === 'online' && room) return <OnlineGame initial={room} invite={room.myInvite} onExit={exit} />;

  return (
    <div className="home">
      <div className="hero">
        <div className="fan" aria-hidden="true">
          <Card c="As" size="lg" className="f1" />
          <Card c="Kh" size="lg" className="f2" />
          <Card c="Qd" size="lg" className="f3" />
          <Card c="Jc" size="lg" className="f4" />
          <Card c="Ts" size="lg" className="f5" />
        </div>
        <p className="kicker">Poker · Bài cào · Xì dách · Tiến lên · Mậu binh</p>
        <h1>Góc giải trí <span>Nhà Số 7</span></h1>
        <p className="lead">Chơi bài cùng bạn bè qua link mời. Chip ảo, chỉ để giải trí.</p>
        {invite && !player && <p className="invite-note">Bạn được mời vào bàn <b>{invite.code}</b>. Đặt tên để vào chơi.</p>}
      </div>

      {!player ? (
        <div className="panel">
          <label className="field">
            <span>Tên của bạn</span>
            <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị" autoComplete="username" />
          </label>
          <label className="field">
            <span>Mã PIN (4–8 số)</span>
            <input value={pin} inputMode="numeric" type="password" maxLength={8} placeholder="Tự đặt, dùng để đăng nhập máy khác"
              autoComplete="current-password"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && pin.length >= 4 && register()} />
          </label>
          <p className="note left">Lần đầu: đặt tên và PIN mới. Lần sau, ở máy nào cũng đăng nhập bằng đúng tên và PIN đó.</p>
          <button className="btn gold big" disabled={busy || name.trim().length < 2 || pin.length < 4} onClick={register}>Vào chơi</button>
        </div>
      ) : (
        <>
          <div className="panel profile">
            <div className="avatar big" style={{ '--hue': [...player.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7) }}>
              <span>{player.name[0]}</span>
            </div>
            <div className="who">
              <b>{player.name}</b>
              <button className="link" onClick={() => { savePlayer(null); setPlayer(null); setStats(null); setPin(''); }}>Đăng xuất</button>
            </div>
            <div className="stats">
              <div><b>{stats?.games ?? 0}</b><span>Giải</span></div>
              <div><b>{stats?.wins ?? 0}</b><span>Vô địch</span></div>
              <div><b>{stats?.top3 ?? 0}</b><span>Top 3</span></div>
              <div><b>{stats?.best_place ?? '–'}</b><span>Hạng tốt nhất</span></div>
            </div>
            <button className="btn ghost small" onClick={openLeaders}>🏆 Bảng vàng</button>
          </div>

          <div className="panel">
            <h2>Chơi với bạn bè</h2>
            <button className="btn gold big" disabled={busy} onClick={() => openTable()}>Mở bàn mới</button>
            <p className="note left">Mở bàn cần <b>mật khẩu quản trị</b>. Người khác vào bàn bằng <b>link mời</b> do chủ bàn gửi.</p>
            {loadRoom()?.code && (
              <button className="btn ghost" disabled={busy} onClick={() => { const s = loadRoom(); enter('join', s.code, false, s.invite); }}>
                Quay lại bàn {loadRoom().code}
              </button>
            )}
          </div>

          <div className="panel">
            <h2>Luyện tập với máy</h2>
            <div className="game-pick">
              {GAME_LIST.map((m) => (
                <button key={m.id} className={ptype === m.id ? 'on' : ''}
                  onClick={() => { setPtype(m.id); setBots((b) => Math.min(b, m.max - 1)); }}>
                  {m.name.replace("Poker Texas Hold'em", 'Poker')}
                </button>
              ))}
            </div>
            <div className="field">
              <span>Số người chơi máy</span>
              <div className="seg">
                {Array.from({ length: gameOf(ptype).meta.max - 1 }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={bots === n ? 'on' : ''} onClick={() => setBots(n)}>{n}</button>
                ))}
              </div>
            </div>
            {ptype === 'poker' && (
              <div className="field">
                <span>Tăng blind</span>
                <div className="seg">
                  <button className={!fast ? 'on' : ''} onClick={() => setFast(false)}>6 phút</button>
                  <button className={fast ? 'on' : ''} onClick={() => setFast(true)}>1 phút</button>
                </div>
              </div>
            )}
            <button className="btn" onClick={() => setScreen('bots')}>Vào bàn luyện tập</button>
          </div>
        </>
      )}
      {err && <p className="err">{err}</p>}
      {msg && <p className="waiting">{msg}</p>}
      <p className="note">Chip ảo, chỉ để giải trí. Không có giá trị quy đổi.</p>

      {adminSheet && (
        <div className="sheet-wrap" onClick={() => setAdminSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Mật khẩu quản trị</h3>
            <input className="pass-input" type="password" value={adminPass} autoFocus placeholder="Nhập mật khẩu để mở bàn"
              onChange={(e) => setAdminPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adminPass && openTable(adminPass)} />
            <label className="toggle">
              <span>Ghi nhớ trên máy này<small>Lần sau mở bàn không cần nhập lại</small></span>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            </label>
            {err && <p className="err">{err}</p>}
            <button className="btn gold" disabled={busy || !adminPass} onClick={() => openTable(adminPass)}>Mở bàn</button>
            <button className="btn ghost" onClick={() => setAdminSheet(false)}>Huỷ</button>
          </div>
        </div>
      )}

      {leaders && (
        <div className="sheet-wrap" onClick={() => setLeaders(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>🏆 Bảng vàng</h3>
            {leaders.loading && <p className="waiting">Đang tải…</p>}
            {(leaders.error || leaders.top === null) && <p className="waiting">Chưa bật lưu thành tích (cần chạy file SQL số 02).</p>}
            {leaders.top?.length === 0 && <p className="waiting">Chưa có ai hoàn thành giải nào.</p>}
            {leaders.top?.length > 0 && (
              <ol className="leaders">
                {leaders.top.map((p, i) => (
                  <li key={p.name} className={p.name === player?.name ? 'me' : ''}>
                    <span className="rk">{i + 1}</span>
                    <b>{p.name}</b>
                    <small>{p.wins} vô địch · {p.top3} top 3 · {p.games} giải</small>
                  </li>
                ))}
              </ol>
            )}
            <button className="btn" onClick={() => setLeaders(null)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
