import { SUIT_SYMBOL, isRed, rankOf, rankLabel } from '../engine/cards.js';

/**
 * Lá bài
 * c: 'As' = ngửa | null = úp | undefined = ô trống
 * flipIn: lật từ úp sang ngửa khi xuất hiện | faceDown: đang úp chờ người chơi chạm để lật
 */
export default function Card({ c, size = 'md', dim, glow, flipIn, faceDown, delay = 0, onClick, className = '' }) {
  if (c === undefined) return <span className={`card slot ${size}`} />;
  const showFace = c && !faceDown;
  const r = c ? rankLabel(rankOf(c)) : '';
  const s = c ? SUIT_SYMBOL[c[1]] : '';
  return (
    <span
      className={`card ${size} ${c && isRed(c) ? 'red' : ''} ${dim ? 'dim' : ''} ${glow ? 'glow' : ''} ${flipIn ? 'flip-in' : ''} ${showFace ? 'up' : 'down'} ${onClick ? 'tap' : ''} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={showFace ? `${r} ${s}` : 'Bài úp'}
    >
      <span className="card-inner" style={{ animationDelay: `${delay}ms` }}>
        <span className="face front">
          {c && (
            <>
              <span className="corner tl"><b>{r}</b><i>{s}</i></span>
              <span className="pip">{s}</span>
            </>
          )}
        </span>
        <span className="face back" />
      </span>
    </span>
  );
}
