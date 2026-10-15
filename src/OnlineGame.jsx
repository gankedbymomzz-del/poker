import { useCallback, useEffect, useRef, useState } from 'react';
import { call, saveRoom, inviteLink } from './lib/api.js';
import { subscribeRoom } from './lib/realtime.js';
import { seatPos } from './Table.jsx';
import GameView from './games/GameView.jsx';
import { FinalBoardAny } from './games/shared.jsx';
import { GAME_LIST, gameOf } from '../engine/games/index.js';
import Social from './Social.jsx';

const ROUND_OPTS = [4, 8, 12];

// Chơi phòng: máy chủ giữ bài, điện thoại chỉ nhận phần mình được xem
export default function OnlineGame({ initial, invite, onExit }) {
  const [room, setRoom] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [live, setLive] = useState('connecting');
  const [panel, setPanel] = useState(null);       // 'chat' | 'loan'
  const [throwTo, setThrowTo] = useState(null);
  const lastRead = useRef(null);
  const roomRef = useRef(initial);
  const offset = useRef(initial.now - Date.now());
  const code = initial.code;
  const [copied, setCopied] = useState(false);

  const apply = useCallback((r) => {
    if (!r) return;
    offset.current = r.now - Date.now();
    if (!roomRef.current || r.version > roomRef.current.version) { roomRef.current = r; setRoom(r); }
  }, []);

  const refresh = useCallback(async () => {
    try { apply((await call('state', { code, invite })).room); setErr(''); } catch (e) {
      if (e.status === 404) { saveRoom(null); onExit('Bàn đã đóng'); } else setErr(e.message);
    }
  }, [code]);

  const doCall = async (action, extra = {}) => {
    setBusy(true); setErr('');
    try { apply((await call(action, { code, invite, ...extra })).room); } catch (e) { setErr(e.message); throw e; } finally { setBusy(false); }
  };

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

  // Chủ bàn gửi link mời
  const shareInvite = async () => {
    const link = inviteLink(code, room.invite || invite);
    try {
      if (navigator.share) await navigator.share({ title: 'Mời vào bàn Nhà Số 7', text: `Vào bàn ${code} chơi cùng mình nhé`, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* người dùng huỷ chia sẻ */ }
  };

  const leave = async () => {
    let closed = false;
    try { closed = (await call('leave', { code, invite })).closed; } catch { /* bỏ qua */ }
    saveRoom(null);
    onExit(closed ? `Bàn ${code} đã đóng vì không còn ai chơi` : undefined);
  };

  const myKey = room.mySeat >= 0 ? room.seats[room.mySeat]?.key : null;

  // Tin chưa đọc
  const chat = room.chat || [];
  if (lastRead.current === null) lastRead.current = chat.length ? chat[chat.length - 1].id : 0;
  if (panel === 'chat' && chat.length) lastRead.current = chat[chat.length - 1].id;
  const unread = chat.filter((m) => m.id > lastRead.current && m.k !== myKey && m.y !== 'sys').length;
  const loanAlert = (room.loans || []).some((l) => l.from === myKey && l.status === 'pending' && Date.now() - l.t < 90000);
  const chipGame = ['poker', 'baicao', 'xidach'].includes(room.type) && room.game;

  // Chạm vào ghế người khác → ném icon
  const onTap = (e) => {
    const el = e.target.closest('[data-pid]');
    if (!el || el.tagName === 'FOOTER' || e.target.closest('button')) return;
    const pid = el.dataset.pid;
    const seat = room.seats.find((s) => s?.key === pid);
    if (!pid || pid === myKey || !seat || !myKey) return;
    setThrowTo({ pid, name: seat.name });
  };

  const header = (
    <>
      <button className="pill btn-pill" onClick={leave}>Rời bàn</button>
      <div className="pill">Bàn <b>{code}</b></div>
      {room.invite && <button className="pill btn-pill" onClick={shareInvite}>{copied ? 'Đã chép link' : '🔗 Mời'}</button>}
      <div className={`pill live ${live === 'SUBSCRIBED' ? 'on' : ''}`} title={live === 'SUBSCRIBED' ? 'Cập nhật tức thì' : 'Đang dùng chế độ dự phòng'}>●</div>
      <button className="pill btn-pill badge-wrap" onClick={() => setPanel('chat')} aria-label="Trò chuyện">💬{unread > 0 && <i className="badge">{unread}</i>}</button>
      {chipGame && (
        <button className="pill btn-pill badge-wrap" onClick={() => setPanel('loan')} aria-label="Vay chip">💰{loanAlert && <i className="badge">!</i>}</button>
      )}
    </>
  );
  const social = (
    <Social room={room} meKey={myKey} call={(a, p) => doCall(a, p)} panel={panel} setPanel={setPanel} throwTo={throwTo} setThrowTo={setThrowTo} />
  );

  // ---------- Phòng chờ ----------
  if (room.status === 'lobby') {
    const seated = room.seats.filter(Boolean).length;
    const ref = room.mySeat >= 0 ? room.mySeat : 0;
    const meta = G.meta;
    const tooMany = seated > meta.max;
    const tooFew = seated < meta.min;
    return (
      <div className="room" onClick={onTap}>
        {social}
        <header className="top">{header}</header>
        <div className="table-wrap">
          <div className="felt">
            <div className="center lobby-center">
              <p className="kicker">Bàn số</p>
              <div className="code">{code}</div>
              <p className="lead small">{meta.name} · {meta.min}–{meta.max} người</p>
              {room.invite && (
                <button className="btn gold small invite-btn" onClick={shareInvite}>{copied ? 'Đã sao chép link mời ✓' : 'Sao chép link mời'}</button>
              )}
            </div>
            {room.seats.map((s, t) => (
              <div key={t} data-pid={s?.key} className={`seat lobby ${t === room.mySeat ? 'mine' : ''}`} style={seatPos((t - ref + 6) % 6, 6)}>
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
    <div className="social-root" onClick={onTap}>
      {social}
      <GameView
        game={viewGame}
        me={room.myEngine}
        layout={(i) => ({ k: (room.map[i] - ref + 6) % 6, n: 6 })}
        offset={offset.current}
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
    </div>
  );
}
