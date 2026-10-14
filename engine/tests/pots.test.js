import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, distribute } from '../pots.js';

const seat = (total, folded = false) => ({ total, folded });

test('ví dụ A=100, B=300, C=500 cùng all-in', () => {
  const pots = buildPots([seat(100), seat(300), seat(500)]);
  assert.deepEqual(pots, [
    { amount: 300, eligible: [0, 1, 2] },
    { amount: 400, eligible: [1, 2] },
    { amount: 200, eligible: [2] }, // phần dư không ai theo → trả lại
  ]);
});

test('người bỏ bài vẫn góp vào hũ nhưng không được tranh', () => {
  const pots = buildPots([seat(50, true), seat(200), seat(200)]);
  assert.deepEqual(pots, [{ amount: 450, eligible: [1, 2] }]);
});

test('chia đôi hũ, chip lẻ cho người gần bên trái Dealer nhất', () => {
  const pots = [{ amount: 101, eligible: [0, 2] }];
  const res = distribute(pots, { 0: 50, 2: 50 }, 1, 3); // Dealer ghế 1 → ghế 2 gần bên trái nhất
  assert.deepEqual(res[0].shares, { 2: 51, 0: 50 });
});

test('mỗi hũ chia riêng cho người mạnh nhất trong số được tranh', () => {
  const pots = buildPots([seat(100), seat(300), seat(300)]);
  const res = distribute(pots, { 0: 900, 1: 500, 2: 400 }, 0, 3);
  assert.deepEqual(res.map((p) => p.shares), [{ 0: 300 }, { 1: 400 }]);
});
