import { useCallback, useEffect, useRef, useState } from 'react';
import { call, saveRoom } from './lib/api.js';
import { subscribeRoom } from './lib/realtime.js';
import Table, { FinalBoard, seatPos } from './Table.jsx';

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

  // Đồng hồ hiển thị
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  // Nghe tín hiệu thời gian thực
  useEffect(() => {
    let off = () => {};
    let alive = true;
    subscribeRoom(code, refresh, (s) => alive && setLive(s)).then((u) => { off = u; });
    return () => { alive = false; off(); };
  }, [code]);

  // Dự phòng: hỏi lại định kỳ (nhanh hơn nếu thời gian thực chưa kết nối được)
  useEffect(() => {
    const ms = live === 'SUBSCRIBED' ? 6000 : 2000;
    const t = setInterval(() => { if (!document.hidden) refresh(); }, ms);
    return () => clearInterval(t);
  }, [live, code]);

  // Hẹn giờ đánh thức máy chủ: lúc có người hết giờ, lúc chia ván mới
  useEffect(() => {
    const g = room.game;
    if (!g || g.finished) return undefined;
    const srvNow = Date.now() + offset.current;
    const wake = g.hand.street === 'done' ? (room.doneAt || srvNow) + room.nextHandMs + 150 : (g.hand.deadline || srvNow) + 300;
    const t = setTimeout(refresh, Math.max(200, wake - srvNow));
    return () => clearTimeout(t);
  }, [room.version, room.game?.hand?.deadline, room.doneAt]);

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
    return (
      <div className="room">
        <header className="top">{header}</header>
        <div className="table-wrap">
          <div className="felt">
            <div className="center lobby-center">
              <p className="kicker">Mã bàn</p>
              <button className="code" onClick={() => navigator.clipboard?.writeText(code)} title="Chạm để sao chép">{code}</button>
              <p className="lead small">Gửi mã cho bạn bè. Chạm ghế trống để đổi chỗ.</p>
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
          {room.isHost ? (
            <button className="btn gold big" disabled={busy || seated < 2} onClick={() => doCall('start').catch(() => {})}>
              {seated < 2 ? 'Cần ít nhất 2 người' : `Bắt đầu giải (${seated} người)`}
            </button>
          ) : <p className="waiting">Chờ chủ bàn bắt đầu…</p>}
          {err && <p className="err">{err}</p>}
          <p className="note">1.500 chip mỗi người · blind 10/20 tăng mỗi 6 phút · 20 giây mỗi lượt</p>
        </footer>
      </div>
    );
  }

  // ---------- Đang chơi / kết thúc ----------
  const g = room.game;
  const ref = room.mySeat >= 0 ? room.mySeat : 0;
  const amAway = room.mySeat >= 0 && room.seats[room.mySeat]?.away;
  const viewGame = {
    ...g,
    seats: g.seats.map((s, i) => ({ ...s, awayTag: !!room.seats[room.map[i]]?.away && !s.out })),
  };
  return (
    <>
      <Table
        game={viewGame}
        me={room.myEngine}
        layout={(i) => ({ k: (room.map[i] - ref + 6) % 6, n: 6 })}
        now={srvNow}
        busy={busy}
        away={amAway}
        onAct={(a) => doCall('act', a)}
        headerExtra={header}
        footerNote={amAway ? (
          <button className="btn gold" onClick={() => doCall('back').catch(() => {})}>Quay lại bàn</button>
        ) : err ? <p className="err">{err}</p> : null}
      />
      {g.finished && (
        <FinalBoard
          game={g}
          onAgain={room.isHost ? () => doCall('restart').catch(() => {}) : null}
          againLabel="Mở giải mới cùng bàn"
          note={room.isHost ? null : 'Chờ chủ bàn mở giải mới…'}
        />
      )}
    </>
  );
}
