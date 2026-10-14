import { useEffect, useRef, useState } from 'react';
import { gameOf } from '../engine/games/index.js';
import GameView from './games/GameView.jsx';
import { FinalBoardAny } from './games/shared.jsx';

// Luyện tập với máy: chạy luật ngay trên điện thoại, dùng chung cho cả 5 game
const BOT_NAMES = ['Thị Lành', 'Bé Na', 'Thầy Phan', 'Cô Hạnh', 'Bà Tư'];
const NEXT = { poker: 3500, baicao: 5000, xidach: 5000, tienlen: 6000, maubinh: 10000 };
const ME = 0;

export default function PracticeGame({ type, name, bots, fast, onExit }) {
  const G = gameOf(type);
  const [g, setG] = useState(() => {
    const n = Math.min(bots, G.meta.max - 1);
    const players = [{ id: 'me', name }, ...BOT_NAMES.slice(0, n).map((x, i) => ({ id: `bot${i}`, name: x, bot: true }))];
    const t = Date.now();
    const options = type === 'poker' ? { levelMs: fast ? 60000 : 6 * 60000, actionMs: 30000 } : { rounds: 6 };
    return G.startRound(G.create({ players, now: t, options }), t);
  });
  const gRef = useRef(g);
  gRef.current = g;

  useEffect(() => {
    const x = gRef.current;
    if (x.finished) return undefined;
    if (G.roundDone(x)) {
      const t = setTimeout(() => setG((y) => G.startRound(y, Date.now())), NEXT[type]);
      return () => clearTimeout(t);
    }
    const bot = x.seats.findIndex((s, i) => s.bot && G.legal(x, i));
    if (bot >= 0) {
      const t = setTimeout(() => setG((y) => {
        if (y.v !== x.v || !G.legal(y, bot)) return y;
        const a = G.botAction(y, bot);
        return a ? G.act(y, bot, a, Date.now()) : y;
      }), type === 'maubinh' ? 900 + Math.random() * 2500 : 600 + Math.random() * 900);
      return () => clearTimeout(t);
    }
    const deadline = x.deadline ?? x.hand?.deadline;
    if (deadline) {
      const t = setTimeout(() => setG((y) => G.tick(y, Date.now())), Math.max(0, deadline - Date.now()) + 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [g.v, g.round, g.handNo, g.phase, g.hand?.street]);

  const n = g.seats.length;
  return (
    <>
      <GameView
        game={G.view(g, ME)}
        me={ME}
        layout={(i) => ({ k: (i - ME + n) % n, n })}
        offset={0}
        onAct={(a) => { setG(G.act(gRef.current, ME, a, Date.now())); }} // sai luật thì báo lỗi cho người chơi
        headerExtra={<button className="pill btn-pill" onClick={onExit}>Thoát</button>}
      />
      {g.finished && <FinalBoardAny game={g} onAgain={onExit} againLabel="Về màn hình chính" />}
    </>
  );
}
