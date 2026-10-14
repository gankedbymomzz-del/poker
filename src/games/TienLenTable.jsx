import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../Card.jsx';
import * as TL from '../../engine/games/tienlen.js';
import { sfx } from '../lib/sfx.js';
import { GameHeader, useDeal, Deck, Delta, Timer, seatPos, seatXY, hueOf } from './shared.jsx';

const TYPE_VI = { single: 'Lẻ', pair: 'Đôi', triple: 'Sám', quad: 'Tứ quý', straight: 'Sảnh', pairseq: 'Đôi thông' };
const comboName = (c) => (!c ? '' : c.type === 'straight' ? `Sảnh ${c.len} lá` : c.type === 'pairseq' ? `${c.len} đôi thông` : TYPE_VI[c.type]);
const PLACE = ['Nhất', 'Nhì', 'Ba', 'Bét'];

export default function TienLenTable({ game: g, me, layout, offset = 0, onAct, headerExtra, away, busy }) {
  const L = me >= 0 && !away ? TL.legal(g, me) : null;
  const meSeat = me >= 0 ? g.seats[me] : null;
  const hand = meSeat?.hand ? TL.sortHand(meSeat.hand) : [];
  const [sel, setSel] = useState([]);
  const [hintIdx, setHintIdx] = useState(0);
  const [err, setErr] = useState('');
  const [chop, setChop] = useState(null);
  const lastChop = useRef(null);
  const lastTrick = useRef(null);

  useEffect(() => { setSel([]); setHintIdx(0); }, [hand.join(), g.trick?.cards?.join()]);
  useEffect(() => {
    if (g.chop && g.chop.v !== lastChop.current) {
      lastChop.current = g.chop.v;
      setChop(g.chop); sfx.turn(); sfx.chips();
      const t = setTimeout(() => setChop(null), 2200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [g.chop?.v]);
  useEffect(() => {
    const k = g.trick?.cards?.join() || null;
    if (k && k !== lastTrick.current) sfx.flip();
    lastTrick.current = k;
  }, [g.trick?.cards?.join()]);

  const order = g.seats.map((_, i) => i);
  const targets = order.map((i) => { if (i === me) return { x: 50, y: 104 }; const { k, n } = layout(i); const p = seatXY(k, n); return { x: p.x, y: p.y - 10 }; });
  const [dealing, flyLayer] = useDeal(g.phase === 'play' || g.phase === 'done' ? g.round : null, targets, 4, 70);

  const selCombo = useMemo(() => TL.combo(sel), [sel.join()]);
  const canPlay = !!L && !!selCombo && (!g.trick || TL.beats(selCombo, g.trick));
  const hints = useMemo(() => (L ? TL.candidates(hand, g.trick) : []), [hand.join(), g.trick?.cards?.join(), !!L]);

  const toggle = (c) => { sfx.deal(); setSel((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c])); };
  const hint = () => {
    if (!hints.length) { setErr('Không có bộ nào đè được, hãy bỏ lượt'); return; }
    setSel(hints[hintIdx % hints.length].cs); setHintIdx((x) => x + 1); setErr('');
  };
  const act = async (a) => { setErr(''); try { await onAct(a); } catch (e) { setErr(e.message); } };

  const trickOwner = g.trick ? g.seats[g.trick.by] : null;
  const done = g.phase === 'done';

  return (
    <div className="room">
      <GameHeader type={g.type} headerExtra={headerExtra} pills={<div className="pill">Ván <b>{g.round}/{g.config.rounds}</b></div>} />

      <div className="table-wrap">
        <div className="felt">
          <div className="felt-logo" aria-hidden="true">NHÀ SỐ 7</div>
          {!done && <Deck />}
          <div className="center tl-center">
            {g.trick ? (
              <>
                <div className="trick">{g.trick.cards.map((c, j) => <Card key={c} c={c} size="md" flipIn delay={j * 50} />)}</div>
                <div className="phase-tag">{trickOwner?.name} · {comboName(g.trick)}</div>
              </>
            ) : !done && g.toAct != null && <div className="phase-tag">Vòng mới · {g.seats[g.toAct].name} đi trước</div>}
            {done && g.instant && <div className="phase-tag gold">Tới trắng: {g.instant}</div>}
            {done && (
              <div className="result">
                {g.order.map((i, k) => <div key={i}><b>{PLACE[k] || `Hạng ${k + 1}`}</b> {g.seats[i].name} <Delta v={g.seats[i].delta} /></div>)}
              </div>
            )}
          </div>
          {chop && <div className="chop-banner">CHẶT HEO! <small>{g.seats[chop.by].name} +{chop.pts} điểm</small></div>}

          {g.seats.map((s, i) => {
            if (i === me) return null;
            const { k, n } = layout(i);
            return (
              <div key={s.id} data-pid={s.id} className={`seat ${g.toAct === i && !dealing ? 'active' : ''} ${s.passed ? 'folded' : ''}`}
                style={{ ...seatPos(k, n), '--hue': hueOf(s.name) }}>
                {!dealing && (
                  <div className="seat-cards stack">
                    {done && s.hand?.length
                      ? s.hand.slice(0, 6).map((c) => <Card key={c} c={c} size="sm" flipIn />)
                      : s.cardCount > 0 && <><Card c={null} size="sm" /><span className="count">{s.cardCount}</span></>}
                  </div>
                )}
                <div className="avatar"><span>{s.name[0]}</span></div>
                <div className="info"><b>{s.name}</b><span>{s.score} điểm</span></div>
                {s.finishPos && <div className="status allin">{PLACE[s.finishPos - 1]}</div>}
                {s.passed && !s.finishPos && <div className="status">Bỏ lượt</div>}
                {done && <Delta v={s.delta} />}
              </div>
            );
          })}
          {flyLayer}
        </div>
      </div>

      <footer className={`me-bar ${L ? 'my-turn' : ''}`} data-pid={meSeat?.id}>
        {meSeat && !dealing && (
          <>
            <div className="tl-top">
              <b>{meSeat.score} điểm</b>
              {meSeat.finishPos ? <span className="role">Về {PLACE[meSeat.finishPos - 1]}</span>
                : sel.length ? <span className={selCombo ? 'ok' : 'bad'}>{selCombo ? comboName(selCombo) : 'Chưa thành bộ'}</span>
                  : <span className="hint">Chạm lá bài để chọn</span>}
              {done && <Delta v={meSeat.delta} />}
            </div>
            <div className="hand-fan" style={{ '--n': hand.length }}>
              {hand.map((c) => (
                <Card key={c} c={c} size="md" onClick={L ? () => toggle(c) : undefined} className={sel.includes(c) ? 'picked' : ''} />
              ))}
            </div>
          </>
        )}
        {L && !dealing && (
          <div className="actions">
            <div className="turn-tag">{L.lead ? 'Bạn đi trước' : 'Tới lượt bạn'}</div>
            <div className="btn-row">
              {L.pass && <button className="btn danger" disabled={busy} onClick={() => { sfx.check(); act({ type: 'pass' }); }}>Bỏ lượt</button>}
              <button className="btn ghost" onClick={hint}>Gợi ý</button>
              <button className="btn gold" disabled={busy || !canPlay} onClick={() => act({ type: 'play', cards: sel })}>Đánh</button>
            </div>
            <Timer deadline={g.deadline} offset={offset} total={25000} />
          </div>
        )}
        {!L && g.phase === 'play' && meSeat && !meSeat.finishPos && <p className="waiting">Chờ {g.seats[g.toAct]?.name}…</p>}
        {done && !g.finished && <p className="waiting">Ván mới sau vài giây…</p>}
        {me < 0 && <p className="waiting">Bạn đang xem bàn</p>}
        {away && <p className="waiting">Bạn đang tạm vắng, máy tự chơi thay</p>}
        {err && <p className="err">{err}</p>}
      </footer>
    </div>
  );
}
