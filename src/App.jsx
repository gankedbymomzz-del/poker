import { useEffect, useMemo, useRef, useState } from 'react';
import { createGame, startHand, act, legalActions, tick, potTotal, levelAt } from '../engine/game.js';
import { evaluate } from '../engine/evaluate.js';
import { botDecide } from '../engine/bots.js';
import Card from './Card.jsx';

// Bàn chơi thử: bạn + 1–5 bot, toàn bộ luật chạy ngay trên máy (bước 1).
// Bước 2 sẽ chuyển phần luật lên máy chủ để nhiều người chơi thật.
const BOT_NAMES = ['Thị Lành', 'Bé Na', 'Thầy Phan', 'Cô Hạnh', 'Bà Tư'];
const NEXT_HAND_MS = 3500;
const ME = 0;

const fmt = (n) => n.toLocaleString('vi-VN');
const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Vị trí ghế quanh bàn hình bầu dục, ghế của bạn luôn ở dưới cùng
function seatPos(k, n) {
  const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
  return { left: `${50 + 41 * Math.cos(a)}%`, top: `${47 + 39 * Math.sin(a)}%` };
}

function Setup({ onStart }) {
  const [name, setName] = useState('Bạn');
  const [bots, setBots] = useState(5);
  const [fast, setFast] = useState(false);
  return (
    <div className="setup">
      <p className="kicker">Bàn thử luật · chơi với máy</p>
      <h1>Poker<br /><span>Nhà Số 7</span></h1>
      <p className="lead">Texas Hold'em No-Limit, thể thức Sit &amp; Go: mỗi người 1.500 chip ảo, blind tăng dần, người cuối cùng còn chip là vô địch.</p>
      <label className="field">
        <span>Tên của bạn</span>
        <input value={name} maxLength={14} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span>Số người chơi máy</span>
        <div className="seg">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={bots === n ? 'on' : ''} onClick={() => setBots(n)}>{n}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Tốc độ tăng blind</span>
        <div className="seg">
          <button className={!fast ? 'on' : ''} onClick={() => setFast(false)}>6 phút</button>
          <button className={fast ? 'on' : ''} onClick={() => setFast(true)}>1 phút (thử nhanh)</button>
        </div>
      </div>
      <button className="btn gold big" onClick={() => onStart({ name: name.trim() || 'Bạn', bots, fast })}>Vào bàn</button>
      <p className="note">Chip ảo, chỉ để giải trí. Không có giá trị quy đổi.</p>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [raiseTo, setRaiseTo] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [err, setErr] = useState('');
  const gRef = useRef(null);
  gRef.current = game;

  const begin = ({ name, bots, fast }) => {
    const players = [{ id: 'me', name }, ...BOT_NAMES.slice(0, bots).map((n, i) => ({ id: `bot${i}`, name: n, bot: true }))];
    const t = Date.now();
    const g = createGame({ players, levelMs: fast ? 60000 : 6 * 60000, actionMs: 30000, now: t });
    setGame(startHand(g, t));
  };

  // Đồng hồ 4 lần/giây
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  // Bot suy nghĩ, hết giờ, chia ván mới
  useEffect(() => {
    const g = gRef.current;
    if (!g || g.finished) return undefined;
    const h = g.hand;
    if (h.street === 'done') {
      const t = setTimeout(() => setGame((x) => startHand(x, Date.now())), NEXT_HAND_MS);
      return () => clearTimeout(t);
    }
    if (h.toAct == null) return undefined;
    if (g.seats[h.toAct].bot) {
      const t = setTimeout(() => {
        setGame((x) => {
          if (!x.hand || x.hand.toAct !== h.toAct || x.v !== g.v) return x;
          return act(x, x.hand.toAct, botDecide(x, x.hand.toAct), Date.now());
        });
      }, 650 + Math.random() * 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGame((x) => tick(x, Date.now())), Math.max(0, h.deadline - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [game?.v, game?.handNo, game?.hand?.street]);

  const L = game && game.hand ? legalActions(game, ME) : null;
  useEffect(() => { if (L?.raise) setRaiseTo(L.raise.min); setRaiseOpen(false); setErr(''); }, [game?.v, game?.handNo]);

  const myHand = useMemo(() => {
    const s = game?.seats[ME];
    if (!s?.hole || s.folded) return null;
    return evaluate([...s.hole, ...game.hand.board]);
  }, [game?.v, game?.handNo, game?.hand?.board.length]);

  if (!game) return <Setup onStart={begin} />;

  const h = game.hand;
  const n = game.seats.length;
  const pot = potTotal(game);
  const [sb, bb] = game.config.levels[game.level];
  const nextLevelIn = game.config.levelMs - ((now - game.startedAt) % game.config.levelMs);
  const nextLevel = game.config.levels[Math.min(game.config.levels.length - 1, levelAt(game, now) + 1)];
  const me = game.seats[ME];
  const result = h.street === 'done' ? h.result : null;
  const winners = new Set(result ? result.pots.flatMap((p) => p.winners) : []);
  const bestCards = new Set();
  if (result?.showdown) result.pots.forEach((p) => p.winners.forEach((w) => result.hands[w]?.best.forEach((c) => bestCards.add(c))));

  const doAct = (a) => {
    try { setGame(act(game, ME, a, Date.now())); } catch (e) { setErr(e.message); }
  };
  const quick = (frac) => {
    if (!L?.raise) return;
    const target = h.currentBet + Math.round((pot + L.toCall) * frac);
    setRaiseTo(Math.max(L.raise.min, Math.min(L.raise.max, target)));
  };

  return (
    <div className="room">
      <header className="top">
        <div className="pill">Ván {game.handNo}</div>
        <div className="pill blinds">Blind <b>{fmt(sb)}/{fmt(bb)}</b></div>
        <div className="pill">Lên {fmt(nextLevel[0])}/{fmt(nextLevel[1])} sau <b>{mmss(nextLevelIn)}</b></div>
        <button className="pill btn-log" onClick={() => setShowLog(!showLog)}>Diễn biến</button>
      </header>

      <div className="table-wrap">
        <div className="felt">
          <div className="center">
            <div className="board">
              {[0, 1, 2, 3, 4].map((i) => (
                <Card key={i} c={h.board[i]} size="md" glow={bestCards.has(h.board[i])} dim={result?.showdown && !bestCards.has(h.board[i])} />
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
            const k = (i - ME + n) % n;
            const active = h.toAct === i;
            const left = active && h.deadline ? (h.deadline - now) / game.config.actionMs : 0;
            const showCards = i !== ME && s.hole && (h.reveal.includes(i));
            return (
              <div
                key={s.id}
                className={`seat ${active ? 'active' : ''} ${s.folded ? 'folded' : ''} ${s.out ? 'out' : ''} ${winners.has(i) ? 'won' : ''} ${i === ME ? 'me' : ''}`}
                style={seatPos(k, n)}
              >
                {i !== ME && !s.out && (
                  <div className="seat-cards">
                    {showCards ? s.hole.map((c) => <Card key={c} c={c} size="sm" glow={bestCards.has(c)} />)
                      : s.hole && !s.folded ? <><Card c={null} size="sm" /><Card c={null} size="sm" /></> : null}
                  </div>
                )}
                <div className="avatar" style={active ? { '--p': Math.max(0, left) } : undefined}>
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
                {(s.allIn || s.folded || s.last) && !s.out && (
                  <div className="status">{s.allIn ? 'All-in' : s.folded ? 'Bỏ bài' : { check: 'Nhường', call: 'Theo', raise: 'Tố', allin: 'All-in', fold: 'Bỏ bài' }[s.last]}</div>
                )}
                {result?.showdown && result.hands[i] && i !== ME && <div className="hand-name">{result.hands[i].name}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="me-bar">
        <div className="my-cards">
          {me.hole ? me.hole.map((c) => <Card key={c} c={c} size="lg" glow={bestCards.has(c)} dim={me.folded} />) : null}
          <div className="my-info">
            <b>{me.out ? `Bạn bị loại, hạng ${me.place}` : `${fmt(me.stack)} chip`}</b>
            {myHand && <span>{myHand.name}</span>}
          </div>
        </div>

        {L && !game.finished && (
          <div className="actions">
            {raiseOpen && L.raise ? (
              <div className="raise-panel">
                <div className="raise-top">
                  <span>{L.raise.isBet ? 'Cược' : 'Tố lên'} <b>{fmt(raiseTo)}</b></span>
                  <button className="link" onClick={() => setRaiseOpen(false)}>Huỷ</button>
                </div>
                <input
                  type="range"
                  min={L.raise.min}
                  max={L.raise.max}
                  step={Math.max(1, Math.floor(bb / 2))}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                  aria-label="Mức cược"
                />
                <div className="quick">
                  <button onClick={() => quick(0.5)}>½ hũ</button>
                  <button onClick={() => quick(0.75)}>¾ hũ</button>
                  <button onClick={() => quick(1)}>Cả hũ</button>
                  <button onClick={() => setRaiseTo(L.raise.max)}>All-in</button>
                </div>
                <button className="btn gold" onClick={() => doAct(raiseTo >= L.raise.max ? { type: 'allin' } : { type: 'raise', to: raiseTo })}>
                  Xác nhận {fmt(raiseTo)}
                </button>
              </div>
            ) : (
              <div className="btn-row">
                <button className="btn ghost" onClick={() => doAct({ type: 'fold' })}>Bỏ bài</button>
                {L.check
                  ? <button className="btn" onClick={() => doAct({ type: 'check' })}>Nhường</button>
                  : <button className="btn" onClick={() => doAct({ type: 'call' })}>Theo {fmt(L.call)}</button>}
                {L.raise && <button className="btn gold" onClick={() => setRaiseOpen(true)}>{L.raise.isBet ? 'Cược' : 'Tố'}</button>}
              </div>
            )}
            <div className="timer"><i style={{ width: `${Math.max(0, (h.deadline - now) / game.config.actionMs) * 100}%` }} /></div>
            {err && <p className="err">{err}</p>}
          </div>
        )}
        {!L && !game.finished && h.street !== 'done' && (
          <p className="waiting">{me.folded ? 'Bạn đã bỏ bài, chờ ván sau…' : me.allIn ? 'Bạn đã all-in, chờ lật bài…' : `Chờ ${game.seats[h.toAct]?.name ?? ''}…`}</p>
        )}
        {h.street === 'done' && !game.finished && <p className="waiting">Ván mới sau vài giây…</p>}
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

      {game.finished && (
        <div className="log">
          <div className="log-box final">
            <p className="kicker">Kết thúc giải sau {game.handNo} ván</p>
            <h2>{game.seats[game.winner].name} vô địch</h2>
            <ol>
              {[...game.seats].sort((a, b) => a.place - b.place).map((s) => (
                <li key={s.id}><span>{s.place}</span>{s.name}</li>
              ))}
            </ol>
            <button className="btn gold big" onClick={() => setGame(null)}>Chơi giải mới</button>
          </div>
        </div>
      )}
    </div>
  );
}
