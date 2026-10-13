import React, { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import type { Send, Snapshot } from '../lib/types';
import { Bracket, type SwapRef } from '../ui/Bracket';
import { Section, shuffle } from './common';

export function BracketTab({ s, send }: { s: Snapshot; send: Send }) {
  const teams = s.teams ?? [];
  const [draft, setDraft] = useState<Record<string, number[]>>({});
  const editable = ['IDLE', 'RULES', 'HANDSHAKE'].includes(s.phase);
  const merged = (key: string) => draft[key] ?? s.rounds.find((r) => r.key === key)!.teamIds;
  const dirty = useMemo(
    () =>
      new Set(
        Object.keys(draft).filter(
          (k) => draft[k].join() !== s.rounds.find((r) => r.key === k)!.teamIds.join(),
        ),
      ),
    [draft, s.rounds],
  );
  const view = s.rounds.map((r) => ({
    ...r,
    teams: merged(r.key)
      .map((id) => teams.find((x) => x.id === id))
      .filter((x): x is NonNullable<typeof x> => !!x),
  }));
  const full = (key: string) => {
    const r = s.rounds.find((x) => x.key === key)!;
    return merged(key).length === (r.stage === 3 ? 3 : 4);
  };
  const swap = (a: SwapRef, b: SwapRef) => {
    if (!editable || (a.key === b.key && a.teamId === b.teamId)) return;
    if (!full(a.key) || !full(b.key)) return;
    const next = { ...draft };
    const la = [...merged(a.key)];
    const lb = a.key === b.key ? la : [...merged(b.key)];
    const ia = la.indexOf(a.teamId),
      ib = lb.indexOf(b.teamId);
    if (ia < 0 || ib < 0) return;
    la[ia] = b.teamId;
    lb[ib] = a.teamId;
    next[a.key] = la;
    next[b.key] = lb;
    setDraft(next);
  };
  const randomize = () => {
    const open = s.rounds.filter((r) => r.stage === 1 && !r.completed);
    const pool = shuffle(open.flatMap((r) => merged(r.key)));
    const next = { ...draft };
    open.forEach((r, i) => (next[r.key] = pool.slice(i * 4, i * 4 + 4)));
    setDraft(next);
  };
  const save = () => {
    send('bracket.bulk', {
      assignments: [...dirty].map((key) => ({ key, teamIds: merged(key) })),
    });
    setDraft({});
  };
  return (
    <>
      <Section
        title={t.drawTitle}
        badge={dirty.size ? `${dirty.size} ${t.changed}` : undefined}
        actions={
          <>
            <button disabled={!editable} onClick={randomize}>
              {t.randomDraw}
            </button>
            <button disabled={!dirty.size} onClick={() => setDraft({})}>
              {t.discard}
            </button>
            <button className="primary" disabled={!editable || !dirty.size} onClick={save}>
              {t.saveDraw}
            </button>
          </>
        }
      >
        <p className="muted">{editable ? t.drawHint : t.drawLocked}</p>
        <div className="bracket-admin">
          <Bracket
            rounds={view}
            currentKey={s.roundKey}
            dirty={dirty}
            compact
            onSelect={
              editable || s.phase === 'RESULTS' ? (key) => send('round.select', { key }) : undefined
            }
            onSwap={editable ? swap : undefined}
          />
        </div>
      </Section>
    </>
  );
}
