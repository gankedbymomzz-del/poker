import { useEffect, useMemo, useState } from 'react';
import Card from '../Card.jsx';
import * as MB from '../../engine/games/maubinh.js';
import { sfx } from '../lib/sfx.js';
import { GameHeader, Delta, Timer, seatPos, hueOf } from './shared.jsx';

const ROWS = [
  { key: 'top', label: 'Chi đầu', n: 3 },
  { key: 'mid', label: 'Chi giữa', n: 5 },
  { key: 'bot', label: 'Chi cuối', n: 5 },
];

export default function MauBinhTable({ game: g, me, layout, offset = 0, onAct, headerExtra, away, busy }) {
  const L = me >= 0 && !away ? MB.legal(g, me) : null;
  const meSeat = me >= 0 ? g.seats[me] : null;
  const handKey = meSeat?.hand?.join() || '';
  const suggested = useMemo(() => (meSeat?.hand?.length === 13 ? MB.autoArrange(meSeat.hand) : null), [handKey]);
  const [arr, setArr] = useState(suggested);
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState('');
  const [showRes, setShowRes] = useState(false);

  useEffect(() => { setArr(suggested); setPick(null); }, [handKey]);
  useEffect(() => { if (g.phase === 'done') { setShowRes(true); if ((meSeat?.delta || 0) > 0) setTimeout(() => sfx.win(), 400); } else setShowRes(false); }, [g.phase, g.round]);

  const mine = meSeat?.arr || arr;
  const J = useMemo(() => (mine && mine.top.length === 3 ? MB.judge(mine) : null), [mine && [mine.top, mine.mid, mine.bot].flat().join()]);
  const sp = useMemo(() => (meSeat?.hand ? MB.special(meSeat.hand) : null), [handKey]);

  const tap = (row, idx) => {
    if (!L) return;
    sfx.deal();
    if (!pick) { setPick({ row, idx }); return; }
    if (pick.row === row && pick.idx === idx) { setPick(null); return; }
    const next = { top: [...arr.top], mid: [...arr.mid], bot: [...arr.bot] };
    [next[pick.row][pick.idx], next[row][idx]] = [next[row][idx], next[pick.row][pick.idx]];
    setArr(next); setPick(null);
  };
  const act = async (a) => { setErr(''); try { await onAct(a); } catch (e) { setErr(e.message); } };

  const arranging = g.phase === 'arrange';
  return (
    <div className="room">
      <GameHeader type={g.type} headerExtra={headerExtra} pills={<div className="pill">Ván <b>{g.round}/{g.config.rounds}</b></div>} />

      <div className="table-wrap small-felt">
        <div className="felt">
          <div className="felt-logo" aria-hidden="true">NHÀ SỐ 7</div>
          <div className="center">
            <div className="phase-tag">{arranging ? 'Xếp bài' : 'So chi'}</div>
            {g.phase === 'done' && meSeat && <div className="big-delta"><Delta v={meSeat.delta} unit=" chi" /></div>}
            {g.phase === 'done' && <button className="btn ghost small" onClick={() => setShowRes(true)}>Xem so chi</button>}
          </div>
          {g.seats.map((s, i) => {
            if (i === me) return null;
            const { k, n } = layout(i);
            return (
              <div key={s.id} data-pid={s.id} className={`seat ${arranging && !s.ready ? 'active' : ''}`} style={{ ...seatPos(k, n), '--hue': hueOf(s.name) }}>
                <div className="avatar"><span>{s.name[0]}</span></div>
                <div className="info"><b>{s.name}</b><span>{s.score} điểm</span></div>
                {arranging && <div className="status">{s.ready ? 'Đã xếp xong' : 'Đang xếp…'}</div>}
                {g.phase === 'done' && <Delta v={s.delta} />}
              </div>
            );
          })}
        </div>
      </div>

      <footer className={`me-bar mb-bar ${L ? 'my-turn' : ''}`} data-pid={meSeat?.id}>
        {meSeat && mine && (
          <div className="mb-rows">
            {sp && <p className="mb-special">Mậu binh tới trắng: <b>{sp.name}</b>! Ăn 6 chi mỗi người</p>}
            {ROWS.map((r, ri) => (
              <div key={r.key} className="mb-row">
                <div className="mb-label">
                  <b>{r.label}</b>
                  <span>{J?.chi[ri].name}{J && J.chi[ri].bonus > 1 ? ` ×${J.chi[ri].bonus}` : ''}</span>
                </div>
                <div className="mb-cards">
                  {mine[r.key].map((c, idx) => (
                    <Card key={c} c={c} size="md" onClick={L ? () => tap(r.key, idx) : undefined}
                      className={pick && pick.row === r.key && pick.idx === idx ? 'picked' : ''} />
                  ))}
                </div>
              </div>
            ))}
            {J?.foul && !sp && <p className="err">Binh lủng! Chi sau phải lớn hơn hoặc bằng chi trước</p>}
          </div>
        )}
        {L && (
          <div className="actions">
            <div className="turn-tag">Chạm 2 lá để đổi chỗ</div>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => { setArr(suggested); setPick(null); }}>Xếp tự động</button>
              <button className="btn gold" disabled={busy} onClick={() => act({ type: 'arrange', ...arr })}>Xong</button>
            </div>
            <Timer deadline={g.deadline} offset={offset} total={90000} />
          </div>
        )}
        {!L && arranging && meSeat && <p className="waiting">Đã báo xong, chờ người khác xếp…</p>}
        {g.phase === 'done' && !g.finished && <p className="waiting">Ván mới sau vài giây…</p>}
        {me < 0 && <p className="waiting">Bạn đang xem bàn</p>}
        {away && <p className="waiting">Bạn đang tạm vắng, máy tự xếp thay</p>}
        {err && <p className="err">{err}</p>}
      </footer>

      {showRes && g.phase === 'done' && (
        <div className="sheet-wrap" onClick={() => setShowRes(false)}>
          <div className="sheet mb-result" onClick={(e) => e.stopPropagation()}>
            <h3>So chi ván {g.round}</h3>
            {g.seats.map((s, i) => (
              <div key={s.id} className={`mb-player ${i === me ? 'me' : ''}`}>
                <div className="mb-head">
                  <b>{s.name}</b>
                  {s.res?.special && <span className="tag gold">{s.res.special}</span>}
                  {s.res?.foul && <span className="tag bad">Binh lủng</span>}
                  <Delta v={s.delta} unit=" chi" />
                </div>
                {s.arr && ROWS.map((r, ri) => (
                  <div key={r.key} className="mb-mini">
                    <span className="mini-cards">{s.arr[r.key].map((c) => <Card key={c} c={c} size="sm" />)}</span>
                    <small>{s.res?.chi[ri]}</small>
                  </div>
                ))}
                {me >= 0 && i !== me && s.res?.vs?.[me] && (
                  <p className="vs">Với bạn: <Delta v={-s.res.vs[me].d} unit=" chi" /> {s.res.vs[me].note && <em>({s.res.vs[me].note})</em>}</p>
                )}
              </div>
            ))}
            <button className="btn" onClick={() => setShowRes(false)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
