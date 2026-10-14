import { useEffect, useMemo, useRef, useState } from 'react';
import { legalActions, potTotal } from '../engine/game.js';
import { evaluate } from '../engine/evaluate.js';
import Card from './Card.jsx';
import { sfx, soundOn, setSound } from './lib/sfx.js';
import { TimerBar, TurnRing, Countdown } from './lib/timers.jsx';

export const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
export const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Toạ độ ghế quanh bàn bầu dục (phần trăm). k = 0 là dưới cùng, đi theo chiều kim đồng hồ
// Bàn chưa đủ 6 người: xếp đối thủ dọc nửa trên của bàn, chừa trống dải giữa cho bài chung
const ARCS = { 1: [270], 2: [210, 330], 3: [195, 270, 345], 4: [195, 245, 295, 345] };
export function seatXY(k, n) {
  const deg = k === 0 ? 90 : (ARCS[n - 1]?.[k - 1] ?? 90 + (k * 360) / n);
  const a = (deg * Math.PI) / 180;
  return { x: 50 + 44 * Math.cos(a), y: 48 + 40 * Math.sin(a) };
}
export function seatPos(k, n) {
  const { x, y } = seatXY(k, n);
  return { left: `${x}%`, top: `${y}%` };
}

const LAST = { check: 'Nhường', call: 'Theo', raise: 'Tố', allin: 'All-in', fold: 'Bỏ bài', timeout: 'Hết giờ' };
const DEAL_GAP = 140;   // ms giữa 2 lá khi chia
const FLY_MS = 420;     // thời gian 1 lá bay
const DECK = { x: 50, y: 30 };
const AUTO_KEY = 'poker-autoflip';
const hueOf = (name) => [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/**
 * game: trạng thái lõi luật (đã ẩn bài người khác)
 * me: chỉ số ghế của bạn, -1 nếu chỉ xem
 * layout: (i) => { k, n } vị trí hiển thị ghế i
 */
export default function Table({ game, me, layout, offset = 0, onAct, headerExtra, away, footerNote, busy }) {
  const [raiseTo, setRaiseTo] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showSet, setShowSet] = useState(false);
  const [err, setErr] = useState('');
  const [dealing, setDealing] = useState(null);
  const [flipped, setFlipped] = useState([false, false]);
  const [autoFlip, setAutoFlip] = useState(() => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } });
  const [snd, setSnd] = useState(soundOn());
  const lastHand = useRef(null);
  const prevSeats = useRef(null);
  const prevBoard = useRef(0);
  const prevTurn = useRef(false);

  const h = game.hand;
  const n = game.seats.length;
  const L = me >= 0 && h && !away ? legalActions(game, me) : null;
  const meSeat = me >= 0 ? game.seats[me] : null;
  const result = h?.street === 'done' ? h.result : null;

  useEffect(() => { if (L?.raise) setRaiseTo(L.raise.min); setRaiseOpen(false); setErr(''); }, [game.v, game.handNo]);

  // ---------- Chia bài: mỗi ván mới, từng lá bay từ bộ bài tới từng ghế ----------
  useEffect(() => {
    if (!h || lastHand.current === game.handNo) return undefined;
    const firstView = lastHand.current === null;
    lastHand.current = game.handNo;
    setFlipped([autoFlip, autoFlip]);
    prevBoard.current = h.board.length;
    if (firstView && h.street !== 'preflop') { setDealing(null); setFlipped([true, true]); return undefined; } // vào giữa ván
    const order = [];
    for (let k = 1; k <= n; k += 1) {
      const i = (game.button + k) % n;
      const s = game.seats[i];
      if (!s.out && (s.hole || s.hasCards)) order.push(i);
    }
    const total = order.length * 2 * DEAL_GAP + FLY_MS;
    setDealing({ hand: game.handNo, order });
    for (let j = 0; j < order.length * 2; j += 1) sfx.deal((j * DEAL_GAP) / 1000);
    const t = setTimeout(() => setDealing(null), total);
    return () => clearTimeout(t);
  }, [game.handNo]);

  // ---------- Âm thanh theo diễn biến ----------
  useEffect(() => {
    if (!h) return;
    const prev = prevSeats.current;
    if (prev && prev.hand === game.handNo) {
      let chips = false; let check = false; let fold = false;
      game.seats.forEach((s, i) => {
        const p = prev.seats[i];
        if (s.bet > p.bet || s.total > p.total) chips = true;
        else if (s.last !== p.last && s.last === 'check') check = true;
        if (s.folded && !p.folded) fold = true;
      });
      if (chips) sfx.chips(); else if (check) sfx.check(); else if (fold) sfx.fold();
    }
    prevSeats.current = { hand: game.handNo, seats: game.seats.map((s) => ({ bet: s.bet, total: s.total, last: s.last, folded: s.folded })) };
    if (h.board.length > prevBoard.current) {
      const added = h.board.length - prevBoard.current;
      for (let k = 0; k < added; k += 1) { sfx.deal(k * 0.16); setTimeout(() => sfx.flip(), 260 + k * 160); }
      prevBoard.current = h.board.length;
    }
    if (result && me >= 0 && result.pots.some((p) => !p.returned && p.winners.map(Number).includes(me))) setTimeout(() => sfx.win(), 300);
  }, [game.v, game.handNo]);

  // ---------- Báo tới lượt ----------
  const myTurn = !!L && !game.finished;
  useEffect(() => {
    if (myTurn && !prevTurn.current) { sfx.turn(); try { navigator.vibrate?.(60); } catch { /* bỏ qua */ } }
    prevTurn.current = myTurn;
  }, [myTurn]);

  const reveal = result?.showdown;
  const myCardsUp = [flipped[0] || reveal, flipped[1] || reveal];
  const myHand = useMemo(() => {
    if (!meSeat?.hole || meSeat.folded || !myCardsUp[0] || !myCardsUp[1]) return null;
    return evaluate([...meSeat.hole, ...h.board]);
  }, [game.v, game.handNo, h?.board.length, meSeat?.hole?.join(), myCardsUp[0], myCardsUp[1]]);

  if (!h) return null;
  const pot = potTotal(game);
  const [sb, bb] = game.config.levels[game.level];
  const nextIdx = Math.min(game.config.levels.length - 1, game.level + 1);
  const nextLevel = game.config.levels[nextIdx];
  const nextLevelAt = game.startedAt + (game.level + 1) * game.config.levelMs;
  const winners = new Set(result ? result.pots.filter((p) => !p.returned).flatMap((p) => p.winners.map(Number)) : []);
  const bestCards = new Set();
  if (reveal) result.pots.forEach((p) => p.winners.forEach((w) => result.hands[w]?.best.forEach((c) => bestCards.add(c))));
  const isDealing = !!dealing;

  const flipMine = (idx) => {
    if (myCardsUp[idx]) return;
    sfx.flip();
    setFlipped((f) => f.map((v, i) => (i === idx ? true : v)));
  };
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
    else if (meSeat.out) waiting = '';
    else if (meSeat.folded) waiting = 'Bạn đã bỏ bài, chờ ván sau…';
    else if (meSeat.allIn) waiting = 'Bạn đã all-in, chờ lật bài…';
    else waiting = `Chờ ${game.seats[h.toAct]?.name ?? ''} suy nghĩ…`;
  }
  if (h.street === 'done' && !game.finished) waiting = 'Ván mới sau vài giây…';

  return (
    <div className="room">
      <header className="top">
        {headerExtra}
        <div className="pill">Ván <b>{game.handNo}</b></div>
        <div className="pill blinds">Blind <b>{fmt(sb)}/{fmt(bb)}</b></div>
        <Countdown to={nextLevelAt} offset={offset}>
          {(ms) => <div className="pill">Lên {fmt(nextLevel[0])}/{fmt(nextLevel[1])} sau <b>{mmss(ms)}</b></div>}
        </Countdown>
        <button className="pill btn-pill" onClick={() => setShowLog(true)}>Diễn biến</button>
        <button className="pill btn-pill icon" onClick={() => setShowSet(true)} aria-label="Cài đặt">⚙</button>
      </header>

      <div className="table-wrap">
        <div className="felt">
          <div className="felt-logo" aria-hidden="true">NHÀ SỐ 7</div>

          {/* Bộ bài của người chia */}
          <div className="deck" style={{ left: `${DECK.x}%`, top: `${DECK.y}%` }} aria-hidden="true">
            <Card c={null} size="sm" className="d1" /><Card c={null} size="sm" className="d2" /><Card c={null} size="sm" className="d3" />
          </div>

          <div className="center">
            <div className="board">
              {[0, 1, 2, 3, 4].map((i) => (h.board[i]
                ? <Card key={`${game.handNo}-${i}`} c={h.board[i]} flipIn delay={i < 3 ? i * 160 : 0}
                    glow={bestCards.has(h.board[i])} dim={reveal && !bestCards.has(h.board[i])} />
                : <Card key={`s${i}`} c={undefined} />))}
            </div>
            <div className="pot"><i className="chip-stack" /> Hũ <b>{fmt(pot)}</b></div>
            {result && (
              <div className="result">
                {result.pots.filter((p) => !p.returned).map((p, k) => (
                  <div key={k}>
                    <b>{p.winners.map((w) => game.seats[w].name).join(' & ')}</b>
                    {' '}{k === 0 ? 'ăn hũ' : `ăn hũ phụ ${k}`} <b>{fmt(p.amount)}</b>
                    {reveal && <small>{result.hands[p.winners[0]].name}</small>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {game.seats.map((s, i) => {
            const { k, n: nn } = layout(i);
            const active = h.toAct === i && !isDealing;
            const showCards = i !== me && s.hole;
            const backs = i !== me && !s.hole && (s.hasCards ?? (!s.folded && !s.out));
            return (
              <div
                key={s.id}
                data-pid={s.id}
                className={`seat ${active ? 'active' : ''} ${s.folded ? 'folded' : ''} ${s.out ? 'out' : ''} ${winners.has(i) ? 'won' : ''} ${i === me ? 'me' : ''}`}
                style={{ ...seatPos(k, nn), '--hue': hueOf(s.name) }}
              >
                {i !== me && !s.out && !isDealing && (
                  <div className="seat-cards">
                    {showCards ? s.hole.map((c, j) => <Card key={`${game.handNo}-${c}`} c={c} size="sm" flipIn delay={j * 120} glow={bestCards.has(c)} />)
                      : backs ? <><Card c={null} size="sm" /><Card c={null} size="sm" /></> : null}
                  </div>
                )}
                <div className="avatar">
                  {active && <TurnRing deadline={h.deadline} total={game.config.actionMs} offset={offset} />}
                  <span>{s.name[0]}</span>
                  {game.button === i && <em className="dealer">D</em>}
                </div>
                <div className="info">
                  <b>{s.name}</b>
                  <span>{s.out ? `Hạng ${s.place}` : fmt(s.stack)}</span>
                </div>
                {h.street === 'preflop' && (h.sbIdx === i || h.bbIdx === i) && !s.out && <em className="blind-tag">{h.sbIdx === i ? 'SB' : 'BB'}</em>}
                {s.bet > 0 && <div className="bet"><i className="chip" />{fmt(s.bet)}</div>}
                {!s.out && (s.allIn || s.folded || s.last) && !s.awayTag && (
                  <div className={`status ${s.allIn ? 'allin' : ''}`}>{s.allIn ? 'All-in' : s.folded ? 'Bỏ bài' : LAST[s.last]}</div>
                )}
                {s.awayTag && <div className="status away">Tạm vắng</div>}
                {reveal && result.hands[i] && i !== me && <div className="hand-name">{result.hands[i].name}</div>}
              </div>
            );
          })}

          {/* Lá bài đang bay từ bộ bài tới từng ghế */}
          {dealing && (
            <div className="fly-layer" aria-hidden="true">
              {dealing.order.flatMap((i, j) => [0, 1].map((r) => {
                const { k, n: nn } = layout(i);
                const t = i === me ? { x: 50 + (r ? 4 : -4), y: 104 } : (() => { const p = seatXY(k, nn); return { x: p.x + (r ? 2.5 : -2.5), y: p.y - 9 }; })();
                return (
                  <span
                    key={`${dealing.hand}-${i}-${r}`}
                    className="flyer"
                    style={{
                      '--fx': DECK.x, '--fy': DECK.y, '--tx': t.x, '--ty': t.y,
                      '--rot': `${r ? 8 : -8}deg`, animationDelay: `${(r * dealing.order.length + j) * DEAL_GAP}ms`,
                    }}
                  />
                );
              }))}
            </div>
          )}
        </div>
      </div>

      <footer className={`me-bar ${myTurn ? 'my-turn' : ''}`} data-pid={meSeat?.id}>
        {meSeat && !meSeat.out && meSeat.hole && !isDealing && (
          <div className="my-cards">
            <div className="hole">
              {meSeat.hole.map((c, idx) => (
                <Card key={`${game.handNo}-${idx}`} c={c} size="lg" faceDown={!myCardsUp[idx]}
                  onClick={!myCardsUp[idx] ? () => flipMine(idx) : undefined}
                  glow={bestCards.has(c)} dim={meSeat.folded} />
              ))}
            </div>
            <div className="my-info">
              <b>{fmt(meSeat.stack)} <small>chip</small></b>
              {myHand ? <span>{myHand.name}</span> : !myCardsUp[0] || !myCardsUp[1] ? <span className="hint">Chạm vào bài để lật</span> : null}
            </div>
          </div>
        )}
        {meSeat?.out && <p className="waiting">Bạn đã bị loại, hạng {meSeat.place}</p>}

        {L && !game.finished && !isDealing && (
          <div className="actions">
            {myTurn && <div className="turn-tag">Tới lượt bạn</div>}
            {raiseOpen && L.raise ? (
              <div className="raise-panel">
                <div className="raise-top">
                  <span>{L.raise.isBet ? 'Cược' : 'Tố lên'} <b>{fmt(raiseTo)}</b></span>
                  <button className="link" onClick={() => setRaiseOpen(false)}>Huỷ</button>
                </div>
                <input type="range" min={L.raise.min} max={L.raise.max} step={Math.max(1, Math.floor(bb / 2))}
                  value={raiseTo} onChange={(e) => setRaiseTo(Number(e.target.value))} aria-label="Mức cược" />
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
                <button className="btn act-fold" disabled={busy} onClick={() => doAct({ type: 'fold' })}>Bỏ bài</button>
                {L.check
                  ? <button className="btn act-call" disabled={busy} onClick={() => doAct({ type: 'check' })}>Nhường<small>không cược thêm</small></button>
                  : <button className="btn act-call" disabled={busy} onClick={() => doAct({ type: 'call' })}>
                      {L.call >= meSeat.stack ? 'All-in' : 'Theo'}<small>{fmt(L.call)} chip</small>
                    </button>}
                {L.raise && (
                  <button className="btn gold" disabled={busy} onClick={() => setRaiseOpen(true)}>
                    {L.raise.isBet ? 'Cược' : 'Tố'}<small>từ {fmt(L.raise.min)}</small>
                  </button>
                )}
              </div>
            )}
            <TimerBar deadline={h.deadline} total={game.config.actionMs} offset={offset} />
          </div>
        )}
        {err && <p className="err">{err}</p>}
        {waiting && !isDealing && <p className="waiting">{waiting}</p>}
        {isDealing && <p className="waiting">Đang chia bài…</p>}
        {footerNote}
      </footer>

      {showLog && (
        <div className="sheet-wrap" onClick={() => setShowLog(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Diễn biến ván {game.handNo}</h3>
            <div className="log-list">
              {h.log.map((l, i) => <p key={i} className={l.startsWith('—') ? 'st' : ''}>{l}</p>)}
            </div>
            <button className="btn" onClick={() => setShowLog(false)}>Đóng</button>
          </div>
        </div>
      )}

      {showSet && (
        <div className="sheet-wrap" onClick={() => setShowSet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Cài đặt</h3>
            <label className="toggle">
              <span>Âm thanh</span>
              <input type="checkbox" checked={snd} onChange={(e) => { setSnd(e.target.checked); setSound(e.target.checked); }} />
            </label>
            <label className="toggle">
              <span>Tự lật bài khi chia xong<small>Tắt để tự chạm lật cho hồi hộp</small></span>
              <input type="checkbox" checked={autoFlip} onChange={(e) => {
                setAutoFlip(e.target.checked);
                try { localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0'); } catch { /* bỏ qua */ }
              }} />
            </label>
            <button className="btn" onClick={() => setShowSet(false)}>Xong</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FinalBoard({ game, onAgain, againLabel = 'Chơi giải mới', note }) {
  const order = [...game.seats].sort((a, b) => a.place - b.place);
  return (
    <div className="sheet-wrap center">
      <div className="sheet final">
        <p className="kicker">Kết thúc giải sau {game.handNo} ván</p>
        <div className="trophy" aria-hidden="true">🏆</div>
        <h2>{game.seats[game.winner]?.name}</h2>
        <p className="champ">Vô địch</p>
        <ol className="standings">
          {order.map((s) => (
            <li key={s.id} className={`p${s.place}`}><span>{s.place}</span><b>{s.name}</b><small>{s.hands ? `${s.hands} ván` : ''}</small></li>
          ))}
        </ol>
        {onAgain && <button className="btn gold big" onClick={onAgain}>{againLabel}</button>}
        {note && <p className="waiting">{note}</p>}
      </div>
    </div>
  );
}
