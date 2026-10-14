import { useEffect, useRef, useState } from 'react';
import { sfx } from './lib/sfx.js';

// Giao lưu trong bàn: chat, biểu cảm, ném icon vào ghế người khác, vay/trả chip
export const EMOTES = ['😂', '😡', '😭', '👍', '🔥', '🙏', '😎', '🤡'];
export const THROWS = ['🍅', '🌹', '🥚', '💣', '🍺', '💋', '👏', '💩'];
const PHRASES = ['Theo đi!', 'Tố mạnh vậy?', 'Bài đẹp quá', 'Xui thật', 'Nhanh lên nào', 'Ván nữa không?', 'GG'];
const AMOUNTS = [200, 500, 1000];
const LOAN_TTL = 90000;
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

// Toạ độ giữa ghế (ghế của mình đang ẩn trên bàn thì lấy vùng bài phía dưới)
function centerOf(pid) {
  const els = [...document.querySelectorAll(`[data-pid="${CSS.escape(pid)}"]`)];
  const el = els.find((e) => e.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) };
}

export default function Social({ room, meKey, call, panel, setPanel, throwTo, setThrowTo }) {
  const [fx, setFx] = useState([]);
  const [bubbles, setBubbles] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [lender, setLender] = useState(null);
  const [amount, setAmount] = useState(500);
  const seen = useRef(null);
  const listRef = useRef(null);
  const chat = room.chat || [];
  const lastId = chat.length ? chat[chat.length - 1].id : 0;
  const chipGame = ['poker', 'baicao', 'xidach'].includes(room.type) && room.game && !room.game.finished;

  // Tin mới: icon bay, bong bóng chat
  useEffect(() => {
    if (seen.current === null) { seen.current = lastId; return; }
    const fresh = chat.filter((m) => m.id > seen.current);
    seen.current = lastId;
    fresh.forEach((m) => {
      if (m.y === 'throw') {
        const a = centerOf(m.k); const b = centerOf(m.to);
        if (!a || !b) return;
        const id = `t${m.id}`;
        setFx((f) => [...f, { id, e: m.e, a, b }]);
        sfx.toss();
        setTimeout(() => sfx.splat(), 780);
        setTimeout(() => setFx((f) => f.filter((x) => x.id !== id)), 1500);
      } else if (m.y === 'msg' || m.y === 'emote') {
        const a = centerOf(m.k);
        if (m.k !== meKey) sfx.msg();
        if (!a) return;
        const id = `b${m.id}`;
        setBubbles((bb) => [...bb.filter((x) => x.k !== m.k), { id, k: m.k, text: m.text, emote: m.y === 'emote', a }]);
        setTimeout(() => setBubbles((bb) => bb.filter((x) => x.id !== id)), 3800);
      }
    });
  }, [lastId]);

  useEffect(() => { if (panel === 'chat' && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [panel, lastId]);

  const send = async (action, payload) => {
    setErr('');
    try { await call(action, payload); return true; } catch (e) { setErr(e.message); return false; }
  };
  const sendText = async (t) => { const v = (t ?? text).trim(); if (!v) return; if (await send('chat', { text: v }) && t == null) setText(''); };

  // Vay chip
  const now = Date.now();
  const loans = room.loans || [];
  const incoming = loans.filter((l) => l.from === meKey && l.status === 'pending' && now - l.t < LOAN_TTL);
  const myDebts = loans.filter((l) => l.to === meKey && ['active', 'accepted'].includes(l.status));
  const myCredits = loans.filter((l) => l.from === meKey && ['active', 'accepted'].includes(l.status));
  const others = (room.game?.seats || []).filter((s) => s.id !== meKey);
  const lenderSeat = others.find((s) => s.id === lender);

  return (
    <>
      {/* Icon đang bay */}
      {fx.map((f) => (
        <span key={f.id} className="throw-fx" aria-hidden="true"
          style={{ left: f.a.x, top: f.a.y, '--dx': `${f.b.x - f.a.x}px`, '--dy': `${f.b.y - f.a.y}px` }}>
          <span>{f.e}</span>
        </span>
      ))}
      {/* Bong bóng chat cạnh ghế */}
      {bubbles.map((b) => (
        <div key={b.id} className={`chat-bubble ${b.emote ? 'emote' : ''}`} style={{ left: b.a.x, top: b.a.y }}>{b.text}</div>
      ))}

      {/* Có người hỏi vay mình */}
      {incoming[0] && panel !== 'loan' && (
        <div className="loan-banner" role="alert">
          <span><b>{incoming[0].toName}</b> hỏi vay <b>{fmt(incoming[0].amount)}</b> chip</span>
          <div>
            <button className="btn small ghost" onClick={() => send('loanreply', { id: incoming[0].id, accept: false })}>Từ chối</button>
            <button className="btn small gold" onClick={() => send('loanreply', { id: incoming[0].id, accept: true })}>Cho vay</button>
          </div>
        </div>
      )}

      {/* Chọn icon ném vào người khác */}
      {throwTo && (
        <div className="sheet-wrap" onClick={() => setThrowTo(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Ném icon vào {throwTo.name}</h3>
            <div className="throw-grid">
              {THROWS.map((e) => (
                <button key={e} onClick={async () => { if (await send('throw', { to: throwTo.pid, e })) setThrowTo(null); }}>{e}</button>
              ))}
            </div>
            {err && <p className="err">{err}</p>}
            <button className="btn ghost" onClick={() => setThrowTo(null)}>Huỷ</button>
          </div>
        </div>
      )}

      {/* Khung chat */}
      {panel === 'chat' && (
        <div className="sheet-wrap" onClick={() => setPanel(null)}>
          <div className="sheet chat-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Trò chuyện</h3>
            <div className="chat-list" ref={listRef}>
              {!chat.length && <p className="waiting">Chưa có tin nhắn. Chào cả bàn một câu đi!</p>}
              {chat.map((m) => (
                <div key={m.id} className={`chat-msg ${m.y} ${m.k === meKey ? 'me' : ''}`}>
                  {m.y === 'sys' && <span>{m.text}</span>}
                  {m.y === 'throw' && <span>{m.n} ném {m.e} vào {m.toName}</span>}
                  {(m.y === 'msg' || m.y === 'emote') && <>{m.k !== meKey && <b>{m.n}</b>}<span className={m.y === 'emote' ? 'emo' : ''}>{m.text}</span></>}
                </div>
              ))}
            </div>
            <div className="chip-row">{EMOTES.map((e) => <button key={e} className="emo-btn" onClick={() => sendText(e)}>{e}</button>)}</div>
            <div className="chip-row">{PHRASES.map((p) => <button key={p} onClick={() => sendText(p)}>{p}</button>)}</div>
            <div className="chat-input">
              <input value={text} maxLength={120} placeholder="Nhắn cả bàn…" onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendText()} enterKeyHint="send" />
              <button className="btn gold small" disabled={!text.trim()} onClick={() => sendText()}>Gửi</button>
            </div>
            <p className="note">Mẹo: chạm vào ghế người khác trên bàn để ném icon.</p>
            {err && <p className="err">{err}</p>}
          </div>
        </div>
      )}

      {/* Vay / trả chip */}
      {panel === 'loan' && (
        <div className="sheet-wrap" onClick={() => setPanel(null)}>
          <div className="sheet loan-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Vay chip</h3>
            <p className="note left">Chip chuyển khi ván hiện tại kết thúc. Hết chip mà được vay thì vào chơi lại.</p>

            {incoming.map((l) => (
              <div key={l.id} className="loan-item incoming">
                <span><b>{l.toName}</b> hỏi vay bạn <b>{fmt(l.amount)}</b></span>
                <div>
                  <button className="btn small ghost" onClick={() => send('loanreply', { id: l.id, accept: false })}>Từ chối</button>
                  <button className="btn small gold" onClick={() => send('loanreply', { id: l.id, accept: true })}>Cho vay</button>
                </div>
              </div>
            ))}

            {chipGame ? (
              <>
                <h4>Hỏi vay</h4>
                <div className="lender-list">
                  {others.map((s) => (
                    <button key={s.id} className={lender === s.id ? 'on' : ''} onClick={() => setLender(s.id)} disabled={s.stack <= 51}>
                      <b>{s.name}</b><small>{fmt(s.stack)} chip</small>
                    </button>
                  ))}
                </div>
                <div className="seg">
                  {AMOUNTS.map((a) => <button key={a} className={amount === a ? 'on' : ''} onClick={() => setAmount(a)}>{fmt(a)}</button>)}
                  <input className="amt" type="number" min={50} step={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Số chip" />
                </div>
                <button className="btn gold" disabled={!lender || !(amount >= 50) || (lenderSeat && amount > lenderSeat.stack - 1)}
                  onClick={async () => { if (await send('loan', { to: lender, amount })) setLender(null); }}>
                  {lender ? `Hỏi vay ${lenderSeat?.name} ${fmt(amount)} chip` : 'Chọn người cho vay'}
                </button>
              </>
            ) : <p className="waiting">Chỉ vay được khi đang chơi Poker, Bài cào hoặc Xì dách.</p>}

            <h4>Sổ nợ</h4>
            {!myDebts.length && !myCredits.length && <p className="waiting">Chưa có khoản nợ nào.</p>}
            {myDebts.map((l) => (
              <div key={l.id} className="loan-item debt">
                <span>Bạn nợ <b>{l.fromName}</b> <b>{fmt(l.amount - l.repaid)}</b>{l.status === 'accepted' && <small> (chờ nhận chip)</small>}</span>
                {l.status === 'active' && <button className="btn small" onClick={() => send('repay', { id: l.id })}>Trả hết</button>}
              </div>
            ))}
            {myCredits.map((l) => (
              <div key={l.id} className="loan-item credit">
                <span><b>{l.toName}</b> nợ bạn <b>{fmt(l.amount - l.repaid)}</b>{l.status === 'accepted' && <small> (chờ chuyển)</small>}</span>
              </div>
            ))}
            {room.pendingTransfers > 0 && <p className="note left">{room.pendingTransfers} lệnh chuyển chip sẽ thực hiện khi hết ván.</p>}
            {err && <p className="err">{err}</p>}
            <button className="btn ghost" onClick={() => setPanel(null)}>Đóng</button>
          </div>
        </div>
      )}
    </>
  );
}
