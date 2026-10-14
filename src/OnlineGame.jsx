import { useCallback, useEffect, useRef, useState } from 'react';
import { call, saveRoom } from './lib/api.js';
import { subscribeRoom } from './lib/realtime.js';
import { seatPos } from './Table.jsx';
import GameView from './games/GameView.jsx';
import { FinalBoardAny } from './games/shared.jsx';
import { GAME_LIST, gameOf } from '../engine/games/index.js';

const ROUND_OPTS = [4, 8, 12];

// Chơi phòng: máy chủ giữ bài, điện thoại chỉ nhận phần mình được xem
export default function OnlineGame({ initial, onExit }) {
  const [room, setRoom] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [live, setLive] = useState('connecting');
  const roomRef = useRef(initial);
  const offset = useRef(initial.now - Date.now());
  const code = initial.code;

  const apply = useCallback((r) => {
    if (!r) return;
    offset.current = r.now - Date.now();
    if (!roomRef.current || r.version >= roomRef.current.version) { roomRef.current = r; setRoom(r); }
  }, []);

  const refresh = useCallback(async () => {
    try { apply((await call('state', { code })).room); setErr(''); } catch (e) {
      if (e.status === 404) { saveRoom(null); onExit('Bàn đã đóng'); } else setErr(e.message);
    }
  }, [code]);

  const doCall = async (action, extra = {}) => {
    setBusy(true); setErr('');
    try { apply((await call(action, { code, ...extra })).room); } catch (e) { setErr(e.message); throw e; } finally { setBusy(false); }
  };

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  useEffect(() => {
    let off = () => {};
    let alive = true;
    subscribeRoom(code, refresh, (s) => alive && setLive(s)).then((u) => { off = u; });
    return () => { alive = false; off(); };
  }, [code]);

  useEffect(() => {
    const ms = live === 'SUBSCRIBED' ? 6000 : 2000;
    const t = setInterval(() => { if (!document.hidden) refresh(); }, ms);
    return () => clearInterval(t);
  }, [live, code]);

  // Hẹn giờ đánh thức máy chủ: lúc có người hết giờ, lúc chia ván mới
  const g = room.game;
  const G = gameOf(room.type);
  const deadline = g ? (g.deadline ?? g.hand?.deadline) : null;
  const roundDone = g && !g.finished && G.roundDone(g);
  useEffect(() => {
    if (!g || g.finished) return undefined;
    const srvNow = Date.now() + offset.current;
    const wake = roundDone ? (room.doneAt || srvNow) + room.nextHandMs + 150 : (deadline || srvNow + 5000) + 300;
    const t = setTimeout(refresh, Math.max(200, wake - srvNow));
    return () => clearTimeout(t);
  }, [room.version, deadline, room.doneAt, roundDone]);

  const leave = async () => {
    try { await call('leave', { code }); } catch { /* bỏ qua */ }
    saveRoom(null);
    onExit();
  };

  const srvNow = now + offset.current;
  const header = (
    <>
      <button className="pill btn-pill" onClick={leave}>Rời bàn</button>
      <div className="pill">Bàn <b>{code}</b></div>
      <div className={`pill live ${live === 'SUBSCRIBED' ? 'on' : ''}`} title={live === 'SUBSCRIBED' ? 'Cập nhật tức thì' : 'Đang dùng chế độ dự phòng'}>●</div>
    </>
  );

  // ---------- Phòng chờ ----------
  if (room.status === 'lobby') {
    const seated = room.seats.filter(Boolean).length;
    const ref = room.mySeat >= 0 ? room.mySeat : 0;
    const meta = G.meta;
    const tooMany = seated > meta.max;
    const tooFew = seated < meta.min;
    return (
      <div className="room">
        <header className="top">{header}</header>
        <div className="table-wrap">
          <div className="felt">
            <div className="center lobby-center">
              <p className="kicker">Mã bàn</p>
              <button className="code" onClick={() => navigator.clipboard?.writeText(code)} title="Chạm để sao chép">{code}</button>
              <p className="lead small">{meta.name} · {meta.min}–{meta.max} người</p>
            </div>
            {room.seats.map((s, t) => (
              <div key={t} className={`seat lobby ${t === room.mySeat ? 'mine' : ''}`} style={seatPos((t - ref + 6) % 6, 6)}>
                {s ? (
                  <>
                    <div className="avatar"><span>{s.name[0]}</span></div>
                    <div className="info"><b>{s.name}</b><span>{s.key === room.host ? 'Chủ bàn' : 'Sẵn sàng'}</span></div>
                  </>
                ) : (
                  <button className="empty-seat" onClick={() => doCall('sit', { seat: t }).catch(() => {})} disabled={busy}>Ngồi đây</button>
                )}
              </div>
            ))}
          </div>
        </div>
        <footer className="me-bar">
          <div className="game-pick">
            {GAME_LIST.map((m) => (
              <button key={m.id} className={room.type === m.id ? 'on' : ''} disabled={!room.isHost || busy}
                onClick={() => doCall('setgame', { type: m.id, rounds: room.rounds }).catch(() => {})}>
                {m.name.replace("Poker Texas Hold'em", 'Poker')}
              </button>
            ))}
          </div>
          {meta.scoring !== 'chip' || room.type !== 'poker' ? (
            room.type !== 'poker' && (
              <div className="seg rounds">
                <span>Số ván</span>
                {ROUND_OPTS.map((r) => (
                  <button key={r} className={(room.rounds || meta.defaultRounds) === r ? 'on' : ''} disabled={!room.isHost || busy}
                    onClick={() => doCall('setgame', { type: room.type, rounds: r }).catch(() => {})}>{r}</button>
                ))}
              </div>
            )
          ) : null}
          {room.isHost ? (
            <button className="btn gold big" disabled={busy || tooFew || tooMany} onClick={() => doCall('start').catch(() => {})}>
              {tooFew ? `Cần ít nhất ${meta.min} người` : tooMany ? `${meta.name} tối đa ${meta.max} người` : `Bắt đầu (${seated} người)`}
            </button>
          ) : <p className="waiting">Chờ chủ bàn chọn game và bắt đầu…</p>}
          {err && <p className="err">{err}</p>}
          <p className="note">{meta.rules[0]}</p>
        </footer>
      </div>
    );
  }

  // ---------- Đang chơi / kết thúc ----------
  const ref = room.mySeat >= 0 ? room.mySeat : 0;
  const amAway = room.mySeat >= 0 && room.seats[room.mySeat]?.away;
  const viewGame = room.type === 'poker'
    ? { ...g, seats: g.seats.map((s, i) => ({ ...s, awayTag: !!room.seats[room.map[i]]?.away && !s.out })) }
    : g;
  return (
    <>
      <GameView
        game={viewGame}
        me={room.myEngine}
        layout={(i) => ({ k: (room.map[i] - ref + 6) % 6, n: 6 })}
        now={srvNow}
        busy={busy}
        away={amAway}
        onAct={(a) => doCall('act', a)}
        headerExtra={header}
        footerNote={amAway ? <button className="btn gold" onClick={() => doCall('back').catch(() => {})}>Quay lại bàn</button> : err ? <p className="err">{err}</p> : null}
      />
      {amAway && room.type !== 'poker' && (
        <div className="away-bar"><button className="btn gold" onClick={() => doCall('back').catch(() => {})}>Quay lại bàn</button></div>
      )}
      {g.finished && (
        <FinalBoardAny
          game={g}
          onAgain={room.isHost ? () => doCall('restart').catch(() => {}) : null}
          againLabel="Mở giải mới cùng bàn"
          note={room.isHost ? null : 'Chờ chủ bàn mở giải mới…'}
        />
      )}
    </>
  );
}
