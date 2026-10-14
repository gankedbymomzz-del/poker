import { useEffect, useRef, useState } from 'react';
import { createGame, startHand, act, tick, publicView } from '../engine/game.js';
import { botDecide } from '../engine/bots.js';
import Table, { FinalBoard } from './Table.jsx';

// Chơi với máy: toàn bộ luật chạy ngay trên điện thoại
const BOT_NAMES = ['Thị Lành', 'Bé Na', 'Thầy Phan', 'Cô Hạnh', 'Bà Tư'];
const NEXT_HAND_MS = 3500;
const ME = 0;

export default function BotGame({ name, bots, fast, onExit }) {
  const [game, setGame] = useState(() => {
    const players = [{ id: 'me', name }, ...BOT_NAMES.slice(0, bots).map((n, i) => ({ id: `bot${i}`, name: n, bot: true }))];
    const t = Date.now();
    return startHand(createGame({ players, levelMs: fast ? 60000 : 6 * 60000, actionMs: 30000, now: t }), t);
  });
  const [now, setNow] = useState(Date.now());
  const gRef = useRef(game);
  gRef.current = game;

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  useEffect(() => {
    const g = gRef.current;
    if (g.finished) return undefined;
    const h = g.hand;
    if (h.street === 'done') {
      const t = setTimeout(() => setGame((x) => startHand(x, Date.now())), NEXT_HAND_MS);
      return () => clearTimeout(t);
    }
    if (h.toAct == null) return undefined;
    if (g.seats[h.toAct].bot) {
      const t = setTimeout(() => setGame((x) => (x.v !== g.v ? x : act(x, x.hand.toAct, botDecide(x, x.hand.toAct), Date.now()))),
        650 + Math.random() * 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setGame((x) => tick(x, Date.now())), Math.max(0, h.deadline - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [game.v, game.handNo, game.hand?.street]);

  const n = game.seats.length;
  return (
    <>
      <Table
        game={publicView(game, ME)}
        me={ME}
        layout={(i) => ({ k: (i - ME + n) % n, n })}
        now={now}
        onAct={(a) => setGame((x) => act(x, ME, a, Date.now()))}
        headerExtra={<button className="pill btn-log" onClick={onExit}>Thoát</button>}
      />
      {game.finished && <FinalBoard game={game} onAgain={onExit} againLabel="Về màn hình chính" />}
    </>
  );
}
