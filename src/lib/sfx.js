// Âm thanh bàn bài tổng hợp bằng Web Audio — không cần file mp3
let ctx = null;
let noiseBuf = null;
const KEY = 'poker-sound';
let on = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })();

export const soundOn = () => on;
export function setSound(v) { on = v; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* bỏ qua */ } }

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function noise(dur, freq, vol, delay = 0, q = 1) {
  if (!on || !ctx || document.hidden) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(ctx.destination); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
}
function tone(freq, dur, vol, delay = 0, type = 'sine') {
  if (!on || !ctx || document.hidden) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  deal: (delay = 0) => noise(0.07, 3200, 0.25, delay, 0.8),             // lá bài lướt trên nỉ
  flip: () => { noise(0.05, 2400, 0.3); noise(0.06, 1500, 0.15, 0.04); }, // lật bài
  chips: () => [0, 0.05, 0.11].forEach((d, i) => tone(2600 + i * 300, 0.05, 0.08, d, 'triangle')),
  check: () => [0, 0.09].forEach((d) => noise(0.04, 900, 0.35, d, 2)),   // gõ bàn
  fold: () => noise(0.18, 1200, 0.15, 0, 0.6),
  turn: () => { tone(880, 0.15, 0.08); tone(1320, 0.25, 0.06, 0.12); },
  toss: () => noise(0.35, 1800, 0.12, 0, 1.5),                           // icon bay
  splat: () => { noise(0.18, 500, 0.35, 0, 0.7); tone(140, 0.15, 0.08, 0, 'square'); }, // trúng đích
  msg: () => tone(1250, 0.07, 0.05, 0, 'triangle'),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 0.08, i * 0.1, 'triangle')),
};
