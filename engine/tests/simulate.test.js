// Giả lập hàng nghìn ván với hành động ngẫu nhiên: kiểm tra luật không bao giờ "gãy"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startHand, act, legalActions } from '../game.js';
import { botDecide } from '../bots.js';
import { seededRng } from '../cards.js';

function randomAction(L, rng) {
  const r = rng();
  if (L.toCall > 0 && r < 0.18) return { type: 'fold' };
  if (L.raise && r > 0.72) {
    if (r > 0.95) return { type: 'allin' };
    const to = L.raise.min + Math.floor(rng() * (L.raise.max - L.raise.min + 1));
    return { type: 'raise', to };
  }
  return L.check ? { type: 'check' } : { type: 'call' };
}

function runGame(seed, useBots) {
  const rng = seededRng(seed);
  const n = 2 + (seed % 5);
  let now = 0;
  let g = createGame({ players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })), levelMs: 60000, now });
  const START = n * g.config.startStack;
  let hands = 0;
  while (!g.finished && hands < 400) {
    g = startHand(g, now, rng);
    hands += 1;
    let steps = 0;
    while (g.hand.street !== 'done') {
      const i = g.hand.toAct;
      const s = g.seats[i];
      assert.ok(!s.folded && !s.allIn && !s.out, 'người được gọi nói phải còn bài và còn chip');
      const L = legalActions(g, i);
      const a = useBots ? botDecide(g, i, rng) : randomAction(L, rng);
      g = act(g, i, a, now);
      now += 3000;
      const inPlay = g.seats.reduce((a2, x) => a2 + x.stack + (g.hand.street === 'done' ? 0 : x.total), 0);
      assert.equal(inPlay, START, 'tổng chip phải luôn bảo toàn');
      assert.ok(g.seats.every((x) => x.stack >= 0), 'không ai bị âm chip');
      steps += 1;
      assert.ok(steps < 500, 'ván không được lặp vô hạn');
    }
    assert.equal(g.seats.reduce((a2, x) => a2 + x.stack, 0), START);
    if (g.hand.result.showdown) assert.equal(g.hand.board.length, 5);
  }
  return { g, hands, n };
}

test('giả lập 400 giải đấu, hành động ngẫu nhiên', () => {
  let totalHands = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    const { g, hands, n } = runGame(seed, false);
    totalHands += hands;
    if (g.finished) {
      const places = g.seats.map((s) => s.place).sort((a, b) => a - b);
      assert.deepEqual(places, Array.from({ length: n }, (_, i) => i + 1), 'hạng phải đủ 1..n, không trùng');
    }
  }
  console.log(`  đã chơi ${totalHands} ván ngẫu nhiên`);
  assert.ok(totalHands > 1000);
});

test('giả lập 100 giải đấu giữa các bot', () => {
  let totalHands = 0;
  for (let seed = 1000; seed < 1100; seed += 1) totalHands += runGame(seed, true).hands;
  console.log(`  đã chơi ${totalHands} ván giữa bot`);
  assert.ok(totalHands > 500);
});
