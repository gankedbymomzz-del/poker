import { useEffect, useState } from 'react';
import { call, loadPlayer, savePlayer, loadRoom, saveRoom } from './lib/api.js';
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
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(3);
  const [ptype, setPtype] = useState('poker');
  const [fast, setFast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [stats, setStats] = useState(null);
  const [leaders, setLeaders] = useState(null);

  // Trình duyệt chỉ cho phát âm thanh sau lần chạm đầu tiên
  useEffect(() => {
    const u = () => unlock();
    window.addEventListener('pointerdown', u);
    return () => window.removeEventListener('pointerdown', u);
  }, []);

  // Tải lại trang giữa chừng → tự vào lại đúng bàn
  useEffect(() => {
    const saved = loadRoom();
    if (player && saved) enter('join', saved, true);
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
      const r = await call('register', { name: name.trim() });
      const p = { name: r.name, token: r.token };
      savePlayer(p);
      setPlayer(p);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  async function enter(action, c, silent = false) {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await call(action, c ? { code: c } : {});
      saveRoom(r.room.code);
      setRoom(r.room);
      setScreen('online');
    } catch (e) {
      if (silent) saveRoom(null); else setErr(e.message);
      if (e.status === 401) { savePlayer(null); setPlayer(null); }
    } finally { setBusy(false); }
  }

  const openLeaders = async () => {
    setLeaders({ loading: true });
    try { const r = await call('leaders'); setLeaders({ top: r.top }); } catch (e) { setLeaders({ error: e.message }); }
  };

  const exit = (note) => { setScreen('home'); setRoom(null); if (typeof note === 'string') setMsg(note); };

  if (screen === 'bots') return <PracticeGame type={ptype} name={player?.name || 'Bạn'} bots={bots} fast={fast} onExit={exit} />;
  if (screen === 'online' && room) return <OnlineGame initial={room} onExit={exit} />;

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
        <h1>Sòng bài <span>Nhà Số 7</span></h1>
        <p className="lead">Tạo bàn, gửi mã cho bạn bè, chọn game và chơi cùng nhau. Chip ảo, chỉ để giải trí.</p>
      </div>

      {!player ? (
        <div className="panel">
          <label className="field">
            <span>Đặt tên để vào bàn</span>
            <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị"
              onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && register()} />
          </label>
          <button className="btn gold big" disabled={busy || name.trim().length < 2} onClick={register}>Ghi danh</button>
        </div>
      ) : (
        <>
          <div className="panel profile">
            <div className="avatar big" style={{ '--hue': [...player.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7) }}>
              <span>{player.name[0]}</span>
            </div>
            <div className="who">
              <b>{player.name}</b>
              <button className="link" onClick={() => { savePlayer(null); setPlayer(null); setStats(null); }}>Đổi tên</button>
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
            <button className="btn gold big" disabled={busy} onClick={() => enter('create')}>Tạo bàn mới</button>
            <div className="or"><span>hoặc vào bàn có sẵn</span></div>
            <div className="join">
              <input value={code} inputMode="numeric" placeholder="Mã 4 số" aria-label="Mã bàn"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 4 && enter('join', code)} />
              <button className="btn" disabled={busy || code.length !== 4} onClick={() => enter('join', code)}>Vào bàn</button>
            </div>
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
