import { useEffect, useRef, useState } from 'react';
import Card from '../Card.jsx';
import { seatXY, seatPos, fmt } from '../Table.jsx';
import { sfx, soundOn, setSound } from '../lib/sfx.js';
import { gameOf } from '../../engine/games/index.js';

export { fmt, seatPos, seatXY };
export const hueOf = (name) => [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

// Thanh trên: tên game, thông tin, nút Luật chơi và Cài đặt
export function GameHeader({ type, pills, headerExtra }) {
  const [sheet, setSheet] = useState(null);
  const [snd, setSnd] = useState(soundOn());
  const meta = gameOf(type).meta;
  return (
    <>
      <header className="top">
        {headerExtra}
        <div className="pill game-name">{meta.name}</div>
        {pills}
        <button className="pill btn-pill" onClick={() => setSheet('rules')}>Luật chơi</button>
        <button className="pill btn-pill icon" onClick={() => setSheet('set')} aria-label="Cài đặt">⚙</button>
      </header>
      {sheet && (
        <div className="sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {sheet === 'rules' ? (
              <>
                <h3>Luật {meta.name}</h3>
                <ul className="rules">{meta.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              </>
            ) : (
              <>
                <h3>Cài đặt</h3>
                <label className="toggle">
                  <span>Âm thanh</span>
                  <input type="checkbox" checked={snd} onChange={(e) => { setSnd(e.target.checked); setSound(e.target.checked); }} />
                </label>
              </>
            )}
            <button className="btn" onClick={() => setSheet(null)}>Đóng</button>
          </div>
        </div>
      )}
    </>
  );
}

// Lá bài bay từ bộ bài tới các ghế khi chia (dùng chung cho mọi game)
export function useDeal(trigger, targets, perSeat, gap = 110) {
  const [dealing, setDealing] = useState(null);
  const last = useRef(trigger);
  useEffect(() => {
    if (trigger == null || trigger === last.current) return undefined;
    last.current = trigger;
    if (!targets.length) return undefined;
    const total = targets.length * perSeat * gap + 420;
    setDealing({ key: trigger, targets, perSeat, gap });
    for (let j = 0; j < targets.length * perSeat; j += 1) sfx.deal((j * gap) / 1000);
    const t = setTimeout(() => setDealing(null), total);
    return () => clearTimeout(t);
  }, [trigger]);
  const layer = dealing && (
    <div className="fly-layer" aria-hidden="true">
      {Array.from({ length: dealing.perSeat }).flatMap((_, r) => dealing.targets.map((t, j) => (
        <span key={`${dealing.key}-${r}-${j}`} className="flyer"
          style={{ '--fx': 50, '--fy': 30, '--tx': t.x + (r - 1) * 2, '--ty': t.y, '--rot': `${(r - 1) * 7}deg`, animationDelay: `${(r * dealing.targets.length + j) * dealing.gap}ms` }} />
      )))}
    </div>
  );
  return [!!dealing, layer];
}

export function Deck() {
  return (
    <div className="deck" style={{ left: '50%', top: '30%' }} aria-hidden="true">
      <Card c={null} size="sm" className="d1" /><Card c={null} size="sm" className="d2" /><Card c={null} size="sm" className="d3" />
    </div>
  );
}

export function Delta({ v, unit = '' }) {
  if (!v) return <span className="delta zero">0{unit}</span>;
  return <span className={`delta ${v > 0 ? 'up' : 'down'}`}>{v > 0 ? '+' : ''}{fmt(v)}{unit}</span>;
}

export { TimerBar as Timer } from '../lib/timers.jsx';

export function FinalBoardAny({ game, onAgain, againLabel = 'Chơi giải mới', note }) {
  const point = gameOf(game.type).meta.scoring === 'point';
  const order = [...game.seats].sort((a, b) => a.place - b.place);
  return (
    <div className="sheet-wrap center">
      <div className="sheet final">
        <p className="kicker">Kết thúc giải sau {game.round ?? game.handNo} ván</p>
        <div className="trophy" aria-hidden="true">🏆</div>
        <h2>{order[0]?.name}</h2>
        <p className="champ">Vô địch</p>
        <ol className="standings">
          {order.map((s) => (
            <li key={s.id} className={`p${s.place}`}><span>{s.place}</span><b>{s.name}</b><small>{point ? `${s.score} điểm` : `${fmt(s.stack)} chip`}</small></li>
          ))}
        </ol>
        {onAgain && <button className="btn gold big" onClick={onAgain}>{againLabel}</button>}
        {note && <p className="waiting">{note}</p>}
      </div>
    </div>
  );
}
