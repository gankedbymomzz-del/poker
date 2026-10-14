import { useEffect, useState } from 'react';
import Card from '../Card.jsx';
import * as BC from '../../engine/games/baicao.js';
import * as XD from '../../engine/games/xidach.js';
import { sfx } from '../lib/sfx.js';
import { GameHeader, useDeal, Deck, Delta, Timer, seatPos, seatXY, fmt, hueOf } from './shared.jsx';

// Bàn có nhà cái: Bài cào 3 lá và Xì dách
export default function DealerTable({ game: g, me, layout, offset = 0, onAct, headerExtra, away, busy }) {
  const isXD = g.type === 'xidach';
  const M = isXD ? XD : BC;
  const L = me >= 0 && !away ? M.legal(g, me) : null;
  const meSeat = me >= 0 ? g.seats[me] : null;
  const [flipped, setFlipped] = useState([]);
  const [err, setErr] = useState('');
  const isDealer = me === g.dealer;

  useEffect(() => { setFlipped([]); setErr(''); }, [g.round]);
  useEffect(() => { if (g.phase === 'done') { const d = meSeat?.delta || 0; if (d > 0) setTimeout(() => sfx.win(), 300); } }, [g.phase, g.round]);

  // Chia bài khi tất cả đã đặt cược
  const dealtKey = g.phase !== 'bet' && g.phase !== 'idle' ? g.round : null;
  const order = [];
  for (let k = 1; k <= g.seats.length; k += 1) { const i = (g.dealer + k) % g.seats.length; if (!g.seats[i].out) order.push(i); }
  const targets = order.map((i) => { if (i === me) return { x: 50, y: 104 }; const { k, n } = layout(i); const p = seatXY(k, n); return { x: p.x, y: p.y - 10 }; });
  const [dealing, flyLayer] = useDeal(dealtKey, targets, isXD ? 2 : 3);

  const act = async (a) => { setErr(''); try { await onAct(a); } catch (e) { setErr(e.message); } };
  const reveal = meSeat?.revealed || g.phase === 'done';
  const myFaceUp = (i) => isXD || reveal || flipped.includes(i) || (meSeat && meSeat.ready);
  const allUp = meSeat?.hand && meSeat.hand.every((_, i) => myFaceUp(i));
  const myInfo = meSeat?.hand && allUp ? (isXD ? XD.rate(meSeat.hand).name : BC.score(meSeat.hand).name) : null;
  const totalMs = g.phase === 'bet' ? 12000 : isXD ? 20000 : 15000;

  let phaseText = '';
  if (g.phase === 'bet') phaseText = 'Đặt cược';
  else if (g.phase === 'peek') phaseText = 'Nặn bài';
  else if (g.phase === 'play') phaseText = g.toAct != null ? `Lượt ${g.seats[g.toAct].name}${g.toAct === g.dealer ? ' (nhà cái)' : ''}` : '';
  else if (g.phase === 'done') phaseText = 'Kết quả';

  return (
    <div className="room">
      <GameHeader type={g.type} headerExtra={headerExtra}
        pills={<><div className="pill">Ván <b>{g.round}/{g.config.rounds}</b></div><div className="pill blinds">Cược <b>{fmt(g.config.base)}</b></div></>} />

      <div className="table-wrap">
        <div className="felt">
          <div className="felt-logo" aria-hidden="true">NHÀ SỐ 7</div>
          <Deck />
          <div className="center">
            <div className="phase-tag">{phaseText}</div>
            {g.phase === 'done' && meSeat && !isDealer && <div className="big-delta"><Delta v={meSeat.delta} /></div>}
            {g.phase === 'done' && isDealer && <div className="big-delta"><Delta v={meSeat.delta} /><small>nhà cái</small></div>}
          </div>

          {g.seats.map((s, i) => {
            if (i === me) return null;
            const { k, n } = layout(i);
            const active = g.toAct === i || (g.phase === 'bet' && i !== g.dealer && !s.bet && !s.out) || (g.phase === 'peek' && !s.ready && !s.out);
            return (
              <div key={s.id} data-pid={s.id} className={`seat ${active && !dealing ? 'active' : ''} ${s.out ? 'out' : ''} ${g.phase === 'done' && s.delta > 0 ? 'won' : ''}`}
                style={{ ...seatPos(k, n), '--hue': hueOf(s.name) }}>
                {!s.out && !dealing && (
                  <div className="seat-cards">
                    {s.hand ? s.hand.map((c, j) => <Card key={`${g.round}-${c}`} c={c} size="sm" flipIn delay={j * 100} />)
                      : Array.from({ length: s.cardCount || 0 }).map((_, j) => <Card key={j} c={null} size="sm" />)}
                  </div>
                )}
                <div className="avatar"><span>{s.name[0]}</span>{g.dealer === i && <em className="dealer cai">Cái</em>}</div>
                <div className="info"><b>{s.name}</b><span>{s.out ? 'Hết chip' : fmt(s.stack)}</span></div>
                {s.bet > 0 && <div className="bet"><i className="chip" />{fmt(s.bet)}</div>}
                {g.phase === 'done' && s.result && <div className="hand-name">{s.result.name}</div>}
                {g.phase === 'done' && !s.out && <Delta v={s.delta} />}
                {g.phase === 'play' && s.done && i !== g.dealer && <div className="status">Dằn</div>}
                {g.phase === 'peek' && s.ready && <div className="status">Đã lật</div>}
              </div>
            );
          })}
          {flyLayer}
        </div>
      </div>

      <footer className={`me-bar ${L ? 'my-turn' : ''}`} data-pid={meSeat?.id}>
        {meSeat && !meSeat.out && meSeat.hand && !dealing && (
          <div className="my-cards">
            <div className="hole">
              {meSeat.hand.map((c, i) => (
                <Card key={`${g.round}-${i}`} c={c} size="lg" faceDown={!myFaceUp(i)}
                  onClick={!myFaceUp(i) ? () => { sfx.flip(); setFlipped((f) => [...f, i]); } : undefined} flipIn={isXD && i >= 2} />
              ))}
            </div>
            <div className="my-info">
              <b>{fmt(meSeat.stack)} <small>chip</small></b>
              {myInfo ? <span>{myInfo}</span> : <span className="hint">Chạm từng lá để nặn bài</span>}
              {isDealer && <span className="role">Bạn làm cái</span>}
            </div>
          </div>
        )}
        {meSeat && !meSeat.hand && !meSeat.out && (
          <div className="my-info center-info"><b>{fmt(meSeat.stack)} <small>chip</small></b>{isDealer && <span className="role">Bạn làm cái ván này</span>}</div>
        )}

        {L?.bet && (
          <div className="actions">
            <div className="turn-tag">Đặt cược</div>
            <div className="btn-row">
              {L.bet.map((m) => (
                <button key={m} className={`btn ${m === 1 ? '' : 'gold'}`} disabled={busy} onClick={() => act({ type: 'bet', mult: m })}>
                  {m === 0 ? `Tất tay ${fmt(meSeat.stack)}` : <>×{m} <b>{fmt(m * g.config.base)}</b></>}
                </button>
              ))}
            </div>
          </div>
        )}
        {L?.reveal && !dealing && (
          <div className="actions">
            <button className="btn gold big" disabled={busy} onClick={() => { sfx.flip(); setFlipped([0, 1, 2]); act({ type: 'reveal' }); }}>
              {allUp ? 'Xong, báo lật bài' : 'Lật hết bài'}
            </button>
          </div>
        )}
        {L && (L.hit !== undefined) && !dealing && (
          <div className="actions">
            <div className="turn-tag">Tới lượt bạn · {L.total} điểm</div>
            <div className="btn-row">
              <button className="btn gold" disabled={busy || !L.hit} onClick={() => { sfx.deal(); act({ type: 'hit' }); }}>Rút bài</button>
              <button className="btn" disabled={busy || !L.stand} onClick={() => act({ type: 'stand' })}>
                {L.stand ? 'Dằn' : `Dằn (cần ${L.need})`}
              </button>
            </div>
          </div>
        )}
        {(L || g.phase === 'bet' || g.phase === 'peek' || g.phase === 'play') && <Timer deadline={g.deadline} offset={offset} total={totalMs} />}
        {!L && g.phase === 'bet' && isDealer && <p className="waiting">Bạn làm cái, chờ con đặt cược…</p>}
        {!L && g.phase === 'bet' && !isDealer && meSeat?.bet > 0 && <p className="waiting">Đã cược {fmt(meSeat.bet)}, chờ mọi người…</p>}
        {!L && (g.phase === 'peek' || g.phase === 'play') && meSeat && !meSeat.out && <p className="waiting">Chờ người khác…</p>}
        {g.phase === 'done' && !g.finished && <p className="waiting">Ván mới sau vài giây…</p>}
        {me < 0 && <p className="waiting">Bạn đang xem bàn</p>}
        {away && <p className="waiting">Bạn đang tạm vắng, máy tự chơi thay</p>}
        {meSeat?.out && <p className="waiting">Bạn đã hết chip</p>}
        {err && <p className="err">{err}</p>}
      </footer>
    </div>
  );
}
