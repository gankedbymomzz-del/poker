import { useEffect, useMemo, useState } from 'react';
import { legalActions, potTotal } from '../engine/game.js';
import { evaluate } from '../engine/evaluate.js';
import Card from './Card.jsx';

export const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
export const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Vị trí ghế quanh bàn bầu dục: k = 0 là dưới cùng (ghế của bạn), đi theo chiều kim đồng hồ
export function seatPos(k, n) {
  const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
  return { left: `${50 + 41 * Math.cos(a)}%`, top: `${47 + 39 * Math.sin(a)}%` };
}

const LAST = { check: 'Nhường', call: 'Theo', raise: 'Tố', allin: 'All-in', fold: 'Bỏ bài', timeout: 'Hết giờ' };

/**
 * game: trạng thái lõi luật (hoặc bản đã ẩn bài từ máy chủ)
 * me: chỉ số ghế của bạn trong game, -1 nếu chỉ xem
 * layout: (i) => { k, n } vị trí hiển thị của ghế i
 * now: giờ hiện tại (đã chỉnh theo giờ máy chủ nếu chơi phòng)
 * onAct: (action) => Promise | void
 */
export default function Table({ game, me, layout, now, onAct, headerExtra, away, footerNote, busy }) {
  const [raiseTo, setRaiseTo] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [err, setErr] = useState('');

  const h = game.hand;
  const L = me >= 0 && h && !away ? legalActions(game, me) : null;
  useEffect(() => { if (L?.raise) setRaiseTo(L.raise.min); setRaiseOpen(false); setErr(''); }, [game.v, game.handNo]);

  const meSeat = me >= 0 ? game.seats[me] : null;
  const myHand = useMemo(() => {
    if (!meSeat?.hole || meSeat.folded) return null;
    return evaluate([...meSeat.hole, ...h.board]);
  }, [game.v, game.handNo, h?.board.length, meSeat?.hole?.join()]);

  if (!h) return null;
  const pot = potTotal(game);
  const [sb, bb] = game.config.levels[game.level];
  const elapsed = now - game.startedAt;
  const nextLevelIn = game.config.levelMs - (elapsed % game.config.levelMs);
  const nextIdx = Math.min(game.config.levels.length - 1, Math.floor(elapsed / game.config.levelMs) + 1);
  const nextLevel = game.config.levels[nextIdx];
  const result = h.street === 'done' ? h.result : null;
  const winners = new Set(result ? result.pots.flatMap((p) => p.winners.map(Number)) : []);
  const bestCards = new Set();
  if (result?.showdown) result.pots.forEach((p) => p.winners.forEach((w) => result.hands[w]?.best.forEach((c) => bestCards.add(c))));
  const timeLeft = h.deadline ? Math.max(0, (h.deadline - now) / game.config.actionMs) : 0;

  const doAct = async (a) => {
    setErr('');
    try { await onAct(a); } catch (e) { setErr(e.message); }
  };
  const quick = (frac) => {
    if (!L?.raise) return;
    const target = h.currentBet + Math.round((pot + L.toCall) * frac);
    setRaiseTo(Math.max(L.raise.min, Math.min(L.raise.max, target)));
  };

  let waiting = '';
  if (!L && !game.finished && h.street !== 'done') {
    if (me < 0) waiting = 'Bạn đang xem bàn';
    else if (away) waiting = 'Bạn đang tạm vắng, máy tự bỏ bài thay bạn';
    else if (meSeat.out) waiting = `Bạn đã bị loại, hạng ${meSeat.place}`;
    else if (meSeat.folded) waiting = 'Bạn đã bỏ bài, chờ ván sau…';
    else if (meSeat.allIn) waiting = 'Bạn đã all-in, chờ lật bài…';
    else waiting = `Chờ ${game.seats[h.toAct]?.name ?? ''}…`;
  }
  if (h.street === 'done' && !game.finished) waiting = 'Ván mới sau vài giây…';

  return (
    <div className="room">
      <header className="top">
        {headerExtra}
        <div className="pill">Ván {game.handNo}</div>
        <div className="pill blinds">Blind <b>{fmt(sb)}/{fmt(bb)}</b></div>
        <div className="pill">Lên {fmt(nextLevel[0])}/{fmt(nextLevel[1])} sau <b>{mmss(nextLevelIn)}</b></div>
        <button className="pill btn-log" onClick={() => setShowLog(true)}>Diễn biến</button>
      </header>

      <div className="table-wrap">
        <div className="felt">
          <div className="center">
            <div className="board">
              {[0, 1, 2, 3, 4].map((i) => (
                <Card key={i} c={h.board[i]} glow={bestCards.has(h.board[i])} dim={result?.showdown && !bestCards.has(h.board[i])} />
              ))}
            </div>
            <div className="pot">Hũ <b>{fmt(pot)}</b></div>
            {result && (
              <div className="result">
                {result.pots.filter((p) => !p.returned).map((p, k) => (
                  <div key={k}>
                    <b>{p.winners.map((w) => game.seats[w].name).join(' & ')}</b>
                    {' '}{k === 0 ? 'ăn hũ' : `ăn hũ phụ ${k}`} {fmt(p.amount)}
                    {result.showdown && <small>{result.hands[p.winners[0]].name}</small>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {game.seats.map((s, i) => {
            const { k, n } = layout(i);
            const active = h.toAct === i;
            const showCards = i !== me && s.hole;
            const cardsBack = i !== me && !s.hole && (s.hasCards ?? (!s.folded && !s.out));
            return (
              <div
                key={s.id}
                className={`seat ${active ? 'active' : ''} ${s.folded ? 'folded' : ''} ${s.out ? 'out' : ''} ${winners.has(i) ? 'won' : ''} ${i === me ? 'me' : ''}`}
                style={seatPos(k, n)}
              >
                {i !== me && !s.out && (
                  <div className="seat-cards">
                    {showCards ? s.hole.map((c) => <Card key={c} c={c} size="sm" glow={bestCards.has(c)} />)
                      : cardsBack ? <><Card c={null} size="sm" /><Card c={null} size="sm" /></> : null}
                  </div>
                )}
                <div className="avatar" style={active ? { '--p': timeLeft } : undefined}>
                  <span>{s.name[0]}</span>
                </div>
                <div className="info">
                  <b>{s.name}</b>
                  <span>{s.out ? `Hạng ${s.place}` : fmt(s.stack)}</span>
                </div>
                <div className="tags">
                  {game.button === i && <em className="dealer">D</em>}
                  {h.sbIdx === i && h.street === 'preflop' && <em>SB</em>}
                  {h.bbIdx === i && h.street === 'preflop' && <em>BB</em>}
                </div>
                {s.bet > 0 && <div className="bet">{fmt(s.bet)}</div>}
                {!s.out && (s.allIn || s.folded || s.last) && (
                  <div className="status">{s.allIn ? 'All-in' : s.folded ? 'Bỏ bài' : LAST[s.last]}</div>
                )}
                {s.awayTag && <div className="status away">Tạm vắng</div>}
                {result?.showdown && result.hands[i] && i !== me && <div className="hand-name">{result.hands[i].name}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="me-bar">
        {meSeat && (
          <div className="my-cards">
            {meSeat.hole ? meSeat.hole.map((c) => <Card key={c} c={c} size="lg" glow={bestCards.has(c)} dim={meSeat.folded} />) : null}
            <div className="my-info">
              <b>{meSeat.out ? `Bị loại, hạng ${meSeat.place}` : `${fmt(meSeat.stack)} chip`}</b>
              {myHand && <span>{myHand.name}</span>}
            </div>
          </div>
        )}

        {L && !game.finished && (
          <div className="actions">
            {raiseOpen && L.raise ? (
              <div className="raise-panel">
                <div className="raise-top">
                  <span>{L.raise.isBet ? 'Cược' : 'Tố lên'} <b>{fmt(raiseTo)}</b></span>
                  <button className="link" onClick={() => setRaiseOpen(false)}>Huỷ</button>
                </div>
                <input
                  type="range" min={L.raise.min} max={L.raise.max} step={Math.max(1, Math.floor(bb / 2))}
                  value={raiseTo} onChange={(e) => setRaiseTo(Number(e.target.value))} aria-label="Mức cược"
                />
                <div className="quick">
                  <button onClick={() => quick(0.5)}>½ hũ</button>
                  <button onClick={() => quick(0.75)}>¾ hũ</button>
                  <button onClick={() => quick(1)}>Cả hũ</button>
                  <button onClick={() => setRaiseTo(L.raise.max)}>All-in</button>
                </div>
                <button className="btn gold" disabled={busy}
                  onClick={() => doAct(raiseTo >= L.raise.max ? { type: 'allin' } : { type: 'raise', to: raiseTo })}>
                  Xác nhận {fmt(raiseTo)}
                </button>
              </div>
            ) : (
              <div className="btn-row">
                <button className="btn ghost" disabled={busy} onClick={() => doAct({ type: 'fold' })}>Bỏ bài</button>
                {L.check
                  ? <button className="btn" disabled={busy} onClick={() => doAct({ type: 'check' })}>Nhường</button>
                  : <button className="btn" disabled={busy} onClick={() => doAct({ type: 'call' })}>Theo {fmt(L.call)}</button>}
                {L.raise && <button className="btn gold" disabled={busy} onClick={() => setRaiseOpen(true)}>{L.raise.isBet ? 'Cược' : 'Tố'}</button>}
              </div>
            )}
            <div className="timer"><i style={{ width: `${timeLeft * 100}%` }} /></div>
          </div>
        )}
        {err && <p className="err">{err}</p>}
        {waiting && <p className="waiting">{waiting}</p>}
        {footerNote}
      </footer>

      {showLog && (
        <div className="log" onClick={() => setShowLog(false)}>
          <div className="log-box" onClick={(e) => e.stopPropagation()}>
            <h3>Diễn biến ván {game.handNo}</h3>
            {h.log.map((l, i) => <p key={i} className={l.startsWith('—') ? 'st' : ''}>{l}</p>)}
            <button className="btn" onClick={() => setShowLog(false)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FinalBoard({ game, onAgain, againLabel = 'Chơi giải mới', note }) {
  return (
    <div className="log">
      <div className="log-box final">
        <p className="kicker">Kết thúc giải sau {game.handNo} ván</p>
        <h2>{game.seats[game.winner]?.name} vô địch</h2>
        <ol>
          {[...game.seats].sort((a, b) => a.place - b.place).map((s) => (
            <li key={s.id}><span>{s.place}</span>{s.name}</li>
          ))}
        </ol>
        {onAgain && <button className="btn gold big" onClick={onAgain}>{againLabel}</button>}
        {note && <p className="waiting">{note}</p>}
      </div>
    </div>
  );
}
