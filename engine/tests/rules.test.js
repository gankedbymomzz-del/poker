import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, startHand, act, legalActions, tick } from '../game.js';
import { seededRng } from '../cards.js';

const T0 = 1_000_000;
const make = (stacks, levels = [[10, 20]]) => {
  const g = createGame({ players: stacks.map((_, i) => ({ id: `p${i}`, name: `P${i}` })), levels, now: T0 });
  stacks.forEach((s, i) => { g.seats[i].stack = s; });
  return startHand(g, T0, seededRng(7));
};
const total = (g) => g.seats.reduce((a, s) => a + s.stack + (g.hand.street === 'done' ? 0 : s.total), 0);
// Sắp bài chung: pop() lấy từ cuối mảng → đốt, flop×3, đốt, turn, đốt, river
const setBoard = (g, [f1, f2, f3, t, r]) => { g.hand.deck = [r, 'x', t, 'x', f3, f2, f1, 'x']; };

test('3 người: Dealer nói trước preflop, tố tối thiểu gấp đôi blind', () => {
  let g = make([1000, 1000, 1000]);
  assert.equal(g.button, 0);
  assert.equal(g.hand.toAct, 0);
  assert.equal(legalActions(g, 0).raise.min, 40);
  g = act(g, 0, { type: 'raise', to: 60 }, T0);
  assert.equal(legalActions(g, 1).raise.min, 100); // 60 + mức tăng 40
  assert.throws(() => act(g, 1, { type: 'raise', to: 90 }, T0), /từ 100/);
});

test('Big Blind được quyền "option" khi mọi người chỉ theo', () => {
  let g = make([1000, 1000, 1000]);
  g = act(g, 0, { type: 'call' }, T0);
  g = act(g, 1, { type: 'call' }, T0);
  assert.equal(g.hand.toAct, 2);
  const L = legalActions(g, 2);
  assert.ok(L.check && L.raise, 'BB được nhường hoặc tố');
  g = act(g, 2, { type: 'check' }, T0);
  assert.equal(g.hand.street, 'flop');
  assert.equal(g.hand.toAct, 1); // từ Flop: người còn bài đầu tiên bên trái Dealer
});

test('all-in thiếu không mở lại quyền tố cho người đã hành động', () => {
  let g = make([170, 1000, 1000]); // ghế 0 chỉ còn 150 sau preflop
  g = act(g, 0, { type: 'call' }, T0);
  g = act(g, 1, { type: 'call' }, T0);
  g = act(g, 2, { type: 'check' }, T0);
  // Flop: ghế 1 nói trước
  g = act(g, 1, { type: 'check' }, T0);
  g = act(g, 2, { type: 'raise', to: 100 }, T0);   // cược 100
  g = act(g, 0, { type: 'allin' }, T0);            // all-in 150: chỉ tăng 50, chưa đủ 1 lần tố
  assert.equal(legalActions(g, 1).raise.min, 250); // ghế 1 chưa phản ứng với cược 100 → vẫn được tố, tối thiểu 150+100
  g = act(g, 1, { type: 'call' }, T0);
  const L = legalActions(g, 2);
  assert.equal(L.raise, null, 'người cược 100 chỉ được theo hoặc bỏ');
  assert.equal(L.call, 50);
  g = act(g, 2, { type: 'allin' }, T0);            // bấm All-in khi bị khoá → chỉ tính là theo 50
  assert.equal(g.seats[2].stack, 1000 - 20 - 150);
});

test('heads-up: Dealer kiêm SB, nói trước preflop và nói sau từ Flop', () => {
  let g = make([1000, 1000]);
  assert.equal(g.hand.sbIdx, g.button);
  assert.equal(g.hand.toAct, g.button);
  g = act(g, g.button, { type: 'call' }, T0);
  g = act(g, g.hand.toAct, { type: 'check' }, T0);
  assert.equal(g.hand.street, 'flop');
  assert.notEqual(g.hand.toAct, g.button);
});

test('mọi người bỏ bài → người còn lại ăn hũ, cược thừa được trả lại', () => {
  let g = make([1000, 1000, 1000]);
  g = act(g, 0, { type: 'raise', to: 300 }, T0);
  g = act(g, 1, { type: 'fold' }, T0);
  g = act(g, 2, { type: 'fold' }, T0);
  assert.equal(g.hand.street, 'done');
  assert.deepEqual(g.seats.map((s) => s.stack), [1030, 990, 980]);
});

test('hũ phụ: A=100, B=300, C=500 cùng all-in', () => {
  let g = make([100, 300, 500]);
  g.seats[0].hole = ['As', 'Ah'];
  g.seats[1].hole = ['Ks', 'Kh'];
  g.seats[2].hole = ['Qs', 'Qh'];
  setBoard(g, ['2c', '7d', '9s', '3h', '5c']);
  g = act(g, 0, { type: 'allin' }, T0);
  g = act(g, 1, { type: 'allin' }, T0);
  g = act(g, 2, { type: 'allin' }, T0); // không ai còn chip để theo → chỉ theo 300, giữ lại 200
  assert.equal(g.hand.street, 'done');
  assert.equal(g.hand.runout, true);
  assert.deepEqual(g.seats.map((s) => s.stack), [300, 400, 200]);
  assert.equal(g.seats[0].place, null);
});

test('bị loại và kết thúc giải', () => {
  let g = make([200, 1000]);
  g.seats[0].hole = ['2s', '7h'];
  g.seats[1].hole = ['As', 'Ah'];
  setBoard(g, ['Kc', '9d', '4s', 'Jh', '3c']);
  g = act(g, g.hand.toAct, { type: 'allin' }, T0);
  g = act(g, g.hand.toAct, { type: 'allin' }, T0);
  assert.equal(g.finished, true);
  assert.equal(g.winner, 1);
  assert.equal(g.seats[0].place, 2);
  assert.equal(g.seats[1].stack, 1200);
});

test('hết giờ: tự nhường nếu được, không thì bỏ bài', () => {
  let g = make([1000, 1000, 1000]);
  g = tick(g, T0 + 21000);
  assert.equal(g.seats[0].folded, true); // phải theo 20 → bị bỏ bài
  g = act(g, 1, { type: 'call' }, T0);
  g = tick(g, T0 + 21000);
  assert.equal(g.hand.street, 'flop'); // BB được nhường → tự nhường
});

test('blind tăng theo thời gian', () => {
  let g = createGame({ players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], levelMs: 1000, now: T0 });
  g = startHand(g, T0 + 2500, seededRng(1));
  assert.deepEqual([g.hand.sb, g.hand.bb], [25, 50]);
});

test('không được hành động khi chưa tới lượt', () => {
  const g = make([1000, 1000, 1000]);
  assert.throws(() => act(g, 2, { type: 'fold' }, T0), /Chưa tới lượt/);
  assert.equal(total(g), 3000);
});
