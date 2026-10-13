import { useEffect, useRef, useState } from 'react';
import type { LineupTeam, Snapshot } from './types';

/** Re-render on an interval; returns Date.now(). */
export function useNow(intervalMs = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function usePrevious<T>(value: T) {
  const ref = useRef<T>(value);
  const previous = ref.current;
  useEffect(() => {
    ref.current = value;
  });
  return previous;
}

/** Smoothly count a number toward its target. */
export function useCountUp(target: number, durationMs = 700) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    if (origin === target) return;
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      const value = Math.round(origin + (target - origin) * eased);
      from.current = value;
      setShown(value);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return shown;
}

export type TeamFx = {
  /** points gained/lost on the latest scoring event, cleared after a while */
  delta: number;
  /** rank movement since the last scoring event: +1 = climbed one place */
  move: number;
  /** consecutive correct answers (Blitz) */
  streak: number;
  at: number;
};

export type DisplayEvent =
  | { kind: 'streak'; team: LineupTeam; count: number; id: number }
  | { kind: 'correct'; team: LineupTeam; id: number }
  | { kind: 'wrong'; team: LineupTeam; id: number }
  | { kind: 'rank'; team: LineupTeam; move: number; id: number }
  | { kind: 'bonus'; team: LineupTeam; points: number; id: number };

/**
 * Derives purely visual effects from consecutive snapshots: score deltas, rank arrows,
 * streaks. The server remains the only source of game truth; this never feeds back.
 */
export function useTeamEffects(s: Snapshot | null, onEvent?: (e: DisplayEvent) => void) {
  const [fx, setFx] = useState<Record<number, TeamFx>>({});
  const last = useRef<{
    key: string;
    teams: Record<number, LineupTeam>;
    ranks: Record<number, number>;
  }>({
    key: '',
    teams: {},
    ranks: {},
  });
  const streaks = useRef<Record<number, number>>({});
  const counter = useRef(0);
  const cb = useRef(onEvent);
  cb.current = onEvent;
  useEffect(() => {
    if (!s) return;
    const key = `${s.roundKey}`;
    const ranking = [...s.lineup]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .reduce<Record<number, number>>((acc, t, i) => ({ ...acc, [t.id]: i }), {});
    if (last.current.key !== key) {
      last.current = {
        key,
        teams: Object.fromEntries(s.lineup.map((t) => [t.id, t])),
        ranks: ranking,
      };
      streaks.current = {};
      setFx({});
      return;
    }
    const changes: Record<number, TeamFx> = {};
    for (const team of s.lineup) {
      const before = last.current.teams[team.id];
      if (!before || before.score === null || team.score === null) continue;
      const delta = team.score - before.score;
      if (delta === 0 && team.progress === before.progress) continue;
      if (delta === 0) continue;
      const baseDelta = team.score - team.bonus - (before.score - before.bonus);
      if (s.stage === 1 && team.progress > before.progress) {
        if (baseDelta > 0) {
          streaks.current[team.id] = (streaks.current[team.id] ?? 0) + 1;
          cb.current?.({ kind: 'correct', team, id: ++counter.current });
          const n = streaks.current[team.id];
          if (n >= 3) cb.current?.({ kind: 'streak', team, count: n, id: ++counter.current });
        } else {
          streaks.current[team.id] = 0;
          cb.current?.({ kind: 'wrong', team, id: ++counter.current });
        }
        if (team.bonus > before.bonus)
          cb.current?.({
            kind: 'bonus',
            team,
            points: team.bonus - before.bonus,
            id: ++counter.current,
          });
      } else if (s.stage !== 1) {
        cb.current?.({ kind: delta > 0 ? 'correct' : 'wrong', team, id: ++counter.current });
      }
      changes[team.id] = {
        delta,
        move: (last.current.ranks[team.id] ?? 0) - (ranking[team.id] ?? 0),
        streak: streaks.current[team.id] ?? 0,
        at: Date.now(),
      };
      if (changes[team.id].move !== 0)
        cb.current?.({ kind: 'rank', team, move: changes[team.id].move, id: ++counter.current });
    }
    last.current = {
      key,
      teams: Object.fromEntries(s.lineup.map((t) => [t.id, t])),
      ranks: ranking,
    };
    if (Object.keys(changes).length) {
      setFx((prev) => ({ ...prev, ...changes }));
      const stamp = Date.now();
      setTimeout(() => {
        setFx((prev) => {
          const next = { ...prev };
          for (const id of Object.keys(changes)) {
            const k = Number(id);
            if (next[k] && next[k].at <= stamp) next[k] = { ...next[k], delta: 0, move: 0 };
          }
          return next;
        });
      }, 3200);
    }
  }, [s]);
  return fx;
}

export function formatClock(ms: number, tenths = false) {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  const base = `${m}:${String(sec).padStart(2, '0')}`;
  return tenths ? `${base}.${Math.floor((total % 1000) / 100)}` : base;
}

export const toSeconds = (ms: number, digits = 3) => (ms / 1000).toFixed(digits);
