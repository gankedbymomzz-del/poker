import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../evaluate.js';

const E = (s) => evaluate(s.split(' '));
const beats = (a, b) => assert.ok(E(a).score > E(b).score, `"${a}" phải thắng "${b}"`);
const ties = (a, b) => assert.equal(E(a).score, E(b).score, `"${a}" phải hoà "${b}"`);

test('nhận đúng 10 loại bài', () => {
  assert.equal(E('As Ks Qs Js Ts 2d 3c').name, 'Thùng phá sảnh lớn');
  assert.equal(E('9h 8h 7h 6h 5h Ad Kc').name, 'Thùng phá sảnh tới 9');
  assert.equal(E('7s 7h 7d 7c Kd 2c 3h').name, 'Tứ quý 7');
  assert.equal(E('Qs Qh Qd 4c 4d 2s 9h').name, 'Cù lũ Q đôi 4');
  assert.equal(E('2h 7h 9h Jh Kh 3c 4d').name, 'Thùng, cao nhất K');
  assert.equal(E('Ts 9h 8d 7c 6s 2h 2d').name, 'Sảnh tới 10');
  assert.equal(E('8s 8h 8d Kc 2s 4h 9c').name, 'Sám cô 8');
  assert.equal(E('Js Jh 5d 5c As 2h 3c').name, 'Thú J và 5');
  assert.equal(E('Ts Th Ad 7c 3s 2h 9c').name, 'Đôi 10');
  assert.equal(E('As Jh 8d 6c 2s 3h 9c').name, 'Mậu thầu A');
});

test('thứ hạng các loại bài', () => {
  beats('9h 8h 7h 6h 5h', '7s 7h 7d 7c Kd');
  beats('7s 7h 7d 7c 2d', 'As Ah Ad Kc Kd');
  beats('As Ah Ad 2c 2d', '2h 7h 9h Jh Kh');
  beats('2h 4h 6h 8h Th', 'As Kh Qd Jc Ts');
  beats('5s 4h 3d 2c Ah', 'As Ah Ad Kc Qd');
  beats('2s 2h 2d 3c 4d', 'As Ah Kd Kc Qd');
  beats('3s 3h 2d 2c 4d', 'As Ah Kd Qc Jd');
  beats('2s 2h 3d 4c 5d', 'As Kh Qd Jc 9d');
});

test('sảnh A-2-3-4-5 là sảnh thấp nhất, không có sảnh vòng', () => {
  assert.equal(E('Ah 2s 3d 4c 5h Kd Qd').name, 'Sảnh tới 5');
  beats('2s 3h 4d 5c 6d', 'As 2h 3d 4c 5d');
  assert.equal(E('Qh Ks As 2d 3c 9h 7s').cat, 0); // Q-K-A-2-3 không phải sảnh
  assert.equal(E('Ah 2h 3h 4h 5h Kd Qc').name, 'Thùng phá sảnh tới 5');
});

test('so lá phụ (kicker)', () => {
  beats('As Ad Kh 7c 3s', 'Ah Ac Qh Jc Ts');
  beats('Ks Kd 9h 9c Ad', 'Kh Kc 9s 9d Qh');      // thú bằng nhau, so lá thứ 5
  beats('Ah Kh 9h 5h 3h', 'As Ks 9s 5s 2s');      // thùng so từng lá
  beats('8s 8h 8d Ac 2s', '8c 8h 8d Kc Qs');
});

test('chọn 5 lá tốt nhất trong 7 lá', () => {
  assert.equal(E('As Ah Ad Kc Kd Ks 2h').name, 'Cù lũ A đôi K'); // 2 bộ ba
  assert.equal(E('Js Jh Jd 9c 9d 9s 2h').name, 'Cù lũ J đôi 9');
  assert.equal(E('As Ad Kh Kc Qs Qd 2h').name, 'Thú A và K');    // 3 đôi → lấy 2 đôi cao, kicker Q
  assert.equal(E('2h 3h 4h 5h 6h 7h 8h').name, 'Thùng phá sảnh tới 8');
});

test('chất không có thứ hạng → hoà', () => {
  ties('As Kd Qh Jc 9s', 'Ah Kc Qd Js 9h');
  ties('5s 6h 7d 8c 9s Ah Ad', '5h 6d 7c 8s 9h Kh Kd'.replace('Kh Kd', '2h 2d')); // cùng dùng sảnh trên bàn
});

test('preflop chỉ có 2 lá tẩy', () => {
  assert.equal(E('Ah Ad').name, 'Đôi A');
  assert.equal(E('Kh 7d').name, 'Mậu thầu K');
});
