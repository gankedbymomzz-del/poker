import { useEffect, useState } from 'react';
import { call, loadPlayer, savePlayer, loadRoom, saveRoom } from './lib/api.js';
import BotGame from './BotGame.jsx';
import OnlineGame from './OnlineGame.jsx';

// Màn hình chính: ghi danh → tạo bàn / vào bàn / chơi với máy
export default function App() {
  const [player, setPlayer] = useState(loadPlayer);
  const [screen, setScreen] = useState('home'); // home | bots | online
  const [room, setRoom] = useState(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(5);
  const [fast, setFast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // Tải lại trang giữa chừng → tự vào lại đúng bàn
  useEffect(() => {
    const saved = loadRoom();
    if (player && saved) enter('join', saved, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (fn) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const register = () => run(async () => {
    const r = await call('register', { name: name.trim() });
    const p = { name: r.name, token: r.token };
    savePlayer(p);
    setPlayer(p);
  });

  async function enter(action, c, silent = false) {
    setBusy(true); setErr('');
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

  const exit = (note) => { setScreen('home'); setRoom(null); if (typeof note === 'string') setMsg(note); };

  if (screen === 'bots') return <BotGame name={player?.name || 'Bạn'} bots={bots} fast={fast} onExit={exit} />;
  if (screen === 'online' && room) return <OnlineGame initial={room} onExit={exit} />;

  return (
    <div className="setup">
      <p className="kicker">Texas Hold'em · Sit &amp; Go</p>
      <h1>Poker<br /><span>Nhà Số 7</span></h1>
      <p className="lead">2–6 người một bàn, 1.500 chip ảo mỗi người, blind tăng dần. Người cuối cùng còn chip là vô địch.</p>

      {!player ? (
        <>
          <label className="field">
            <span>Đặt tên để vào bàn</span>
            <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && register()} placeholder="Tên hiển thị" />
          </label>
          <button className="btn gold big" disabled={busy || name.trim().length < 2} onClick={register}>Ghi danh</button>
        </>
      ) : (
        <>
          <p className="hello">Xin chào <b>{player.name}</b> · <button className="link" onClick={() => { savePlayer(null); setPlayer(null); }}>đổi tên</button></p>

          <div className="menu-card">
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

          <div className="menu-card">
            <h2>Luyện tập với máy</h2>
            <div className="field">
              <span>Số người chơi máy</span>
              <div className="seg">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} className={bots === n ? 'on' : ''} onClick={() => setBots(n)}>{n}</button>)}
              </div>
            </div>
            <div className="field">
              <span>Tăng blind</span>
              <div className="seg">
                <button className={!fast ? 'on' : ''} onClick={() => setFast(false)}>6 phút</button>
                <button className={fast ? 'on' : ''} onClick={() => setFast(true)}>1 phút</button>
              </div>
            </div>
            <button className="btn" onClick={() => setScreen('bots')}>Vào bàn luyện tập</button>
          </div>
        </>
      )}
      {err && <p className="err">{err}</p>}
      {msg && <p className="waiting">{msg}</p>}
      <p className="note">Chip ảo, chỉ để giải trí. Không có giá trị quy đổi.</p>
    </div>
  );
}
