import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng } from '../cards.js';
import { GAMES } from '../games/index.js';
import * as BC from '../games/baicao.js';
import * as XD from '../games/xidach.js';
import * as TL from '../games/tienlen.js';
import * as MB from '../games/maubinh.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));

// ---------------- BÀI CÀO ----------------
test('bài cào: tính nút và 3 Tây', () => {
  assert.equal(BC.score(['Ks', 'Qh', 'Jd']).name, '3 Tây');
  assert.equal(BC.score(['Ts', 'Kh', '5d']).pts, 5);
  assert.equal(BC.score(['As', '9h', 'Td']).pts, 0);
  assert.equal(BC.score(['7s', '8h', '9d']).pts, 4);
});

test('bài cào: so với nhà cái, 3 Tây ăn gấp đôi, nhà cái thiếu chip', () => {
  let g = BC.startRound(BC.create({ players: players(3) }), 0, seededRng(1)); // nhà cái ghế 0
  g = BC.act(g, 1, { type: 'bet', mult: 2 }, 0); // 100
  g = BC.act(g, 2, { type: 'bet', mult: 1 }, 0); // 50
  g.seats[0].hand = ['2s', '3h', 'Td'];  // 5 nút
  g.seats[1].hand = ['Ks', 'Qh', 'Jd'];  // 3 Tây → +200
  g.seats[2].hand = ['As', '2h', 'Td'];  // 3 nút → thua 50
  for (const i of [0, 1, 2]) g = BC.act(g, i, { type: 'reveal' }, 0);
  assert.equal(g.phase, 'done');
  assert.deepEqual(g.seats.map((s) => s.stack), [1350, 1700, 1450]);
});

// ---------------- XÌ DÁCH ----------------
test('xì dách: tính điểm Át và các bộ đặc biệt', () => {
  assert.equal(XD.rate(['As', 'Ah']).name, 'Xì bàng');
  assert.equal(XD.rate(['As', 'Kd']).name, 'Xì dách');
  assert.equal(XD.total(['As', '9h']), 20);        // 2 lá: Át = 11
  assert.equal(XD.total(['As', '5h', '5d']), 20);   // 3 lá: Át = 10
  assert.equal(XD.total(['As', 'Ah', '9d']), 20);   // 10 + 1 + 9
  assert.equal(XD.rate(['2s', '3h', '4d', '5c', '6s']).name, 'Ngũ linh (20)');
  assert.ok(XD.rate(['Ks', 'Qh', '5d']).bust);
});

test('xì dách: dưới 16 không được dằn, quắc gặp quắc thì hoà', () => {
  let g = XD.startRound(XD.create({ players: players(2) }), 0, seededRng(2)); // nhà cái ghế 0, con ghế 1
  g.deck = ['Kc', 'Qc', 'Ks', '9d', '6c', '7h']; // chia: con 7h, cái 6c, con 9d, cái Ks → con 16, cái 16
  g = XD.act(g, 1, { type: 'bet', mult: 1 }, 0);
  assert.equal(g.phase, 'play');
  assert.equal(g.toAct, 1);
  assert.equal(XD.legal(g, 1).stand, true);
  g = XD.act(g, 1, { type: 'hit' }, 0);       // rút Qc → 26 quắc → tự kết thúc lượt
  assert.equal(g.toAct, 0);
  g = XD.act(g, 0, { type: 'hit' }, 0);       // nhà cái 16 + Kc = 26 quắc
  assert.equal(g.phase, 'done');
  assert.deepEqual(g.seats.map((s) => s.stack), [1500, 1500]);
});

// ---------------- TIẾN LÊN ----------------
test('tiến lên: nhận diện bộ bài', () => {
  assert.equal(TL.combo(['3s', '4h', '5d']).type, 'straight');
  assert.equal(TL.combo(['Qs', 'Kh', 'Ad']).type, 'straight');
  assert.equal(TL.combo(['Ks', 'Ah', '2d']), null);           // sảnh không có heo
  assert.equal(TL.combo(['3s', '3h', '4d', '4c', '5s', '5h']).type, 'pairseq');
  assert.equal(TL.combo(['7s', '7h', '7d', '7c']).type, 'quad');
  assert.equal(TL.combo(['7s', '8h']), null);
});

test('tiến lên: so bài và chặt heo', () => {
  const C = TL.combo;
  assert.ok(TL.beats(C(['5h']), C(['5s'])));                  // cùng số, chất cơ lớn hơn bích
  assert.ok(!TL.beats(C(['5s', '6s', '7s']), C(['5h', '6h', '7h'])));
  assert.ok(TL.beats(C(['3s', '3h', '4d', '4c', '5s', '5h']), C(['2s'])));    // 3 đôi thông chặt 1 heo
  assert.ok(!TL.beats(C(['3s', '3h', '4d', '4c', '5s', '5h']), C(['2s', '2h']))); // nhưng không chặt được đôi heo
  assert.ok(TL.beats(C(['9s', '9h', '9d', '9c']), C(['2s', '2h'])));          // tứ quý chặt đôi heo
  assert.ok(TL.beats(C(['3s', '3h', '4d', '4c', '5s', '5h', '6s', '6h']), C(['9s', '9h', '9d', '9c']))); // 4 đôi thông chặt tứ quý
});

test('tiến lên: tới trắng', () => {
  assert.equal(TL.instantWin(['2s', '2h', '2d', '2c', '3s', '4s', '5s', '6s', '7s', '8s', '9s', 'Ts', 'Js']), 'Tứ quý heo');
  assert.equal(TL.instantWin(['3s', '4s', '5h', '6s', '7s', '8d', '9s', 'Ts', 'Js', 'Qs', 'Ks', 'As', '2h']), 'Sảnh rồng');
  assert.equal(TL.instantWin(['3s', '3h', '5h', '5s', '7s', '7d', '9s', '9h', 'Js', 'Jh', 'Ks', 'Kd', '2h']), '6 đôi');
});

test('tiến lên: 2 đôi liên tiếp không phải đôi thông, không chặt được heo', () => {
  let g = TL.startRound(TL.create({ players: players(2) }), 0, seededRng(3));
  g.phase = 'play'; g.instant = null; g.trick = null; g.toAct = 0;
  g.seats[0].hand = TL.sortHand(['2h', '4s', '5s']);
  g.seats[1].hand = TL.sortHand(['6d', '6c', '7s', '7h', 'Ks']);
  g = TL.act(g, 0, { type: 'play', cards: ['2h'] }, 0);
  assert.throws(() => TL.act(g, 1, { type: 'play', cards: ['6d', '6c', '7s', '7h'] }, 0), /không hợp lệ/);
});

test('tiến lên: luồng đầy đủ có chặt heo đỏ', () => {
  let g = TL.startRound(TL.create({ players: players(2) }), 0, seededRng(3));
  g.phase = 'play'; g.instant = null; g.trick = null; g.toAct = 0;
  g.seats[0].hand = TL.sortHand(['2h', '4s', '5s']);
  g.seats[1].hand = TL.sortHand(['3s', '3h', '4d', '4c', '5d', '5c', 'Ks']);
  g = TL.act(g, 0, { type: 'play', cards: ['2h'] }, 0);
  g = TL.act(g, 1, { type: 'play', cards: ['3s', '3h', '4d', '4c', '5d', '5c'] }, 0); // chặt heo cơ → +2
  assert.equal(g.seats[1].score, 2);
  assert.equal(g.seats[0].score, -2);
  g = TL.act(g, 0, { type: 'pass' }, 0);
  assert.equal(g.toAct, 1);                     // vòng mới, người chặt đi tiếp
  assert.equal(g.trick, null);
  g = TL.act(g, 1, { type: 'play', cards: ['Ks'] }, 0); // hết bài → Nhất
  assert.equal(g.phase, 'done');
  assert.deepEqual(g.seats.map((s) => s.score), [-3, 3]); // -2 heo -1 bét | +2 heo +1 nhất
});

// ---------------- MẬU BINH ----------------
test('mậu binh: binh lủng và sập hầm', () => {
  const ok = MB.judge({ top: ['2s', '3h', '5d'], mid: ['7s', '7h', '9d', 'Jc', 'Kd'], bot: ['As', 'Ah', 'Ad', '4c', '4d'] });
  assert.equal(ok.foul, false);
  const foul = MB.judge({ top: ['As', 'Ah', '5d'], mid: ['7s', '7h', '9d', 'Jc', 'Kd'], bot: ['Qs', 'Qh', 'Qd', '4c', '4d'] });
  assert.equal(foul.foul, true); // chi đầu đôi A lớn hơn chi giữa đôi 7
  let g = MB.startRound(MB.create({ players: players(2) }), 0, seededRng(5));
  g.seats[0].hand = ['2s', '3h', '5d', '7s', '7h', '9d', 'Jc', 'Kd', 'As', 'Ah', 'Ad', '4c', '4d'];
  g.seats[1].hand = ['2c', '3d', '6h', '8s', '8h', '9c', 'Tc', 'Qd', 'Ks', 'Kh', 'Kc', '5c', '5h'];
  g = MB.act(g, 0, { type: 'arrange', top: ['2s', '3h', '5d'], mid: ['7s', '7h', '9d', 'Jc', 'Kd'], bot: ['As', 'Ah', 'Ad', '4c', '4d'] }, 0);
  g = MB.act(g, 1, { type: 'arrange', top: ['2c', '3d', '6h'], mid: ['8s', '8h', '9c', 'Tc', 'Qd'], bot: ['Ks', 'Kh', 'Kc', '5c', '5h'] }, 0);
  // Ghế 1 thắng cả 3 chi: (6 cao > 5 cao), (đôi 8 > đôi 7), (cù lũ K > cù lũ A? không — cù lũ A lớn hơn)
  assert.equal(g.phase, 'done');
  assert.equal(g.seats[0].delta + g.seats[1].delta, 0);
  assert.equal(g.seats[1].delta, 1); // thắng chi đầu, chi giữa; thua chi cuối → +1
});

test('mậu binh: xếp tự động luôn hợp lệ', () => {
  const rng = seededRng(9);
  for (let k = 0; k < 15; k += 1) {
    let g = MB.startRound(MB.create({ players: players(2) }), 0, rng);
    const arr = MB.autoArrange(g.seats[0].hand);
    assert.equal(MB.judge(arr).foul, false);
  }
});

// ---------------- GIẢ LẬP CẢ GIẢI GIỮA CÁC BOT ----------------
for (const [id, G] of Object.entries(GAMES)) {
  if (id === 'poker') continue;
  test(`giả lập 60 giải ${G.meta.name} giữa các bot`, () => {
    let rounds = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = seededRng(seed * 7 + id.length);
      const n = G.meta.min + (seed % (G.meta.max - G.meta.min + 1));
      let now = 0;
      let g = G.create({ players: players(n), now, options: { rounds: 6 } });
      const key = G.meta.scoring === 'chip' ? 'stack' : 'score';
      const total0 = g.seats.reduce((a, s) => a + s[key], 0);
      for (let guard = 0; guard < 100 && !g.finished; guard += 1) {
        g = G.startRound(g, now, rng);
        if (g.finished) break;
        rounds += 1;
        let steps = 0;
        while (!G.roundDone(g)) {
          const seats = g.seats.map((_, i) => i).filter((i) => G.legal(g, i));
          assert.ok(seats.length, 'phải luôn có người cần hành động');
          const i = seats[0];
          g = G.act(g, i, G.botAction(g, i, rng), now);
          now += 1000;
          assert.ok((steps += 1) < 600, 'ván không được lặp vô hạn');
        }
        assert.equal(g.seats.reduce((a, s) => a + s[key], 0), total0, 'tổng chip/điểm phải bảo toàn');
        assert.ok(g.seats.every((s) => G.meta.scoring !== 'chip' || s.stack >= 0));
      }
      assert.ok(g.finished, 'giải phải kết thúc');
      assert.ok(g.seats.every((s) => s.place >= 1 && s.place <= n));
    }
    assert.ok(rounds > 100);
  });
}

test('hết giờ: mọi game tự xử lý được', () => {
  for (const [id, G] of Object.entries(GAMES)) {
    if (id === 'poker') continue;
    let g = G.startRound(G.create({ players: players(G.meta.min), now: 0 }), 0, seededRng(4));
    for (let k = 0; k < 400 && !G.roundDone(g); k += 1) g = G.tick(g, (k + 1) * 100000);
    assert.ok(G.roundDone(g), `${id} phải tự chạy hết ván khi không ai bấm`);
  }
});
