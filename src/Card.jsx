import { SUIT_SYMBOL, isRed, rankOf, rankLabel } from '../engine/cards.js';

// Lá bài: c = 'As' | null (úp) | undefined (ô trống)
export default function Card({ c, size = 'md', dim = false, glow = false }) {
  if (c === undefined) return <span className={`card slot ${size}`} />;
  if (!c) return <span className={`card back ${size}`} aria-label="Bài úp" />;
  return (
    <span
      className={`card face ${size} ${isRed(c) ? 'red' : ''} ${dim ? 'dim' : ''} ${glow ? 'glow' : ''}`}
      aria-label={`${rankLabel(rankOf(c))} ${SUIT_SYMBOL[c[1]]}`}
    >
      <b>{rankLabel(rankOf(c))}</b>
      <i>{SUIT_SYMBOL[c[1]]}</i>
    </span>
  );
}
