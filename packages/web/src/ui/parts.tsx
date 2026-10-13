import React, { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import type { PublicTeam } from '../lib/types';

export const cssVars = (vars: Record<string, string | number>) => vars as React.CSSProperties;

/** "7 من 15": reads unambiguously in RTL, unlike a bare 7 / 15. */
export function Of({
  a,
  b,
  className = '',
}: {
  a: React.ReactNode;
  b: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`of ${className}`}>
      <b className="num">{a}</b> {t.ofWord} <b className="num">{b}</b>
    </span>
  );
}

export function initials(name: string) {
  const digits = /(\d+)\s*$/.exec(name)?.[1];
  if (digits) return digits;
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
}

export function TeamMark({
  team,
  size = 44,
  className = '',
}: {
  team: Pick<PublicTeam, 'id' | 'name' | 'color' | 'logoV'>;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const logo = !!team.logoV && !broken;
  return (
    <span
      className={`team-mark ${logo ? 'has-logo' : ''} ${className}`}
      style={cssVars({ '--team': team.color, '--size': `${size}px` })}
      aria-hidden="true"
    >
      {logo ? (
        <img
          src={`/logo/${team.id}?v=${team.logoV}`}
          alt=""
          onError={() => setBroken(true)}
          draggable={false}
        />
      ) : (
        <b>{initials(team.name)}</b>
      )}
    </span>
  );
}

export function TimerRing({
  remaining,
  total,
  size = 140,
  label,
  paused = false,
  warnAt = 10000,
  children,
}: {
  remaining: number;
  total: number;
  size?: number;
  label?: React.ReactNode;
  paused?: boolean;
  warnAt?: number;
  children?: React.ReactNode;
}) {
  const stroke = Math.max(6, size * 0.075);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const urgent = !paused && remaining > 0 && remaining <= warnAt;
  return (
    <div
      className={`timer-ring ${urgent ? 'urgent' : ''} ${paused ? 'paused' : ''}`}
      style={{ width: size, height: size }}
      role="timer"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="inner">
        {children ?? (
          <>
            <b className="num">{Math.ceil(remaining / 1000)}</b>
            {label && <small>{label}</small>}
          </>
        )}
      </div>
    </div>
  );
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
};

/** Canvas confetti. `continuous` keeps emitting; otherwise one burst. */
export function Confetti({
  continuous = false,
  colors = ['#27d6b0', '#f8bc55', '#8f91ff', '#ff7d9f', '#ffffff'],
  count = 140,
}: {
  continuous?: boolean;
  colors?: string[];
  count?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0,
      h = 0,
      frame = 0,
      last = performance.now();
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const parts: Particle[] = [];
    const spawn = (n: number, burst: boolean) => {
      for (let i = 0; i < n; i++) {
        const fromTop = !burst;
        parts.push({
          x: fromTop ? Math.random() * w : w / 2 + (Math.random() - 0.5) * w * 0.2,
          y: fromTop ? -20 : h * 0.55,
          vx: fromTop ? (Math.random() - 0.5) * 80 : (Math.random() - 0.5) * 900,
          vy: fromTop ? 120 + Math.random() * 160 : -300 - Math.random() * 700,
          w: 6 + Math.random() * 8,
          h: 10 + Math.random() * 12,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 12,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 6 + Math.random() * 3,
        });
      }
    };
    if (!continuous) spawn(count, true);
    else spawn(Math.floor(count / 2), false);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (continuous && parts.length < count * 2 && !reduce) spawn(2, false);
      ctx.clearRect(0, 0, w, h);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 520 * dt;
        p.vx *= 0.995;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.life -= dt;
        if (p.y > h + 30 || p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (continuous || parts.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [continuous, count]);
  return <canvas ref={ref} className="confetti-canvas" aria-hidden="true" />;
}

export type Toast = { id: number; text: React.ReactNode; tone?: 'good' | 'bad' | 'gold' | 'info' };
let toastId = 0;
export function useToasts(ttl = 3600, max = 4) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (text: React.ReactNode, tone: Toast['tone'] = 'info') => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-(max - 1)), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  };
  return { toasts, push };
}
export function ToastStack({ toasts, variant = '' }: { toasts: Toast[]; variant?: string }) {
  return (
    <div className={`toast-stack ${variant}`} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Pips({ total, done, current }: { total: number; done: number; current?: boolean }) {
  return (
    <div className="pips" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < done ? 'done' : i === done && current ? 'now' : ''} />
      ))}
    </div>
  );
}

/**
 * A rendering error in one scene must never leave a dead screen during a live event:
 * show a short notice, then reload to rebuild state from the server snapshot.
 */
export class ScreenGuard extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  private timer: ReturnType<typeof setTimeout> | undefined;
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Screen error, reloading:', error);
    this.timer = setTimeout(() => location.reload(), 2500);
  }
  componentWillUnmount() {
    clearTimeout(this.timer);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="loading" role="alert">
        <div className="pulse" />
        {t.recovering}
      </div>
    );
  }
}
