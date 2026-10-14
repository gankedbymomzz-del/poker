import { useEffect, useMemo, useState } from 'react';

// Đồng hồ không gây vẽ lại cả bàn:
// - TimerBar, TurnRing: tính 1 lần lúc bắt đầu lượt, sau đó để CSS tự chạy hết thời gian còn lại (card đồ hoạ xử lý)
// - Countdown: chỉ ô chữ nhỏ tự cập nhật mỗi giây
// offset = giờ máy chủ − giờ máy này (chơi phòng), 0 khi chơi với máy

function useRemain(deadline, total, offset) {
  return useMemo(() => {
    if (!deadline) return null;
    const remain = Math.max(0, deadline - (Date.now() + offset));
    return { remain, frac: Math.min(1, remain / total) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);
}

export function TimerBar({ deadline, total, offset = 0 }) {
  const r = useRemain(deadline, total, offset);
  if (!r) return null;
  return (
    <div className="timer">
      <i key={deadline} style={{ '--from': r.frac, animationDuration: `${r.remain}ms` }} />
    </div>
  );
}

const C = 2 * Math.PI * 25;
export function TurnRing({ deadline, total, offset = 0 }) {
  const r = useRemain(deadline, total, offset);
  if (!r) return null;
  return (
    <svg className="turn-ring" viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r="25" className="bg" />
      <circle key={deadline} cx="28" cy="28" r="25" className="fg"
        style={{ strokeDasharray: C, '--start': (1 - r.frac) * C, '--end': C, animationDuration: `${r.remain}ms` }} />
    </svg>
  );
}

export function Countdown({ to, offset = 0, children }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  return children(Math.max(0, to - (Date.now() + offset)));
}
