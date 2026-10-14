// ====== POKER: bọc lõi luật sẵn có vào khuôn chung ======
import * as P from '../game.js';
import { botDecide } from '../bots.js';

export const meta = {
  id: 'poker', name: "Poker Texas Hold'em", min: 2, max: 6, scoring: 'chip', defaultRounds: null,
  rules: [
    'Mỗi người 2 lá tẩy + 5 lá chung, ghép 5 lá tốt nhất.',
    '4 vòng cược: Preflop, Flop (3 lá), Turn, River rồi lật bài.',
    'Tố tối thiểu = mức cược hiện tại + mức tố gần nhất. All-in thiếu không mở lại quyền tố.',
    '1.500 chip mỗi người, blind tăng mỗi 6 phút. Hết chip bị loại, người cuối cùng còn chip vô địch.',
  ],
};
export const create = ({ players, now, options = {} }) => ({ type: 'poker', ...P.createGame({ players, now, ...options }) });
export const startRound = P.startHand;
export const legal = (g, seat) => P.legalActions(g, seat);
export const act = P.act;
export const tick = P.tick;
export const roundDone = (g) => g.hand?.street === 'done';
export const view = P.publicView;
export const botAction = (g, seat, rng) => (P.legalActions(g, seat) ? botDecide(g, seat, rng) : null);
