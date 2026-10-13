import React, { useState } from 'react';
import { t } from '../lib/i18n';
import type { PublicTeam, RoundView } from '../lib/types';
import { Of, TeamMark, cssVars } from './parts';
import { Trophy } from './icons';

const stageName = (n: number) => [t.blitz, t.gambler, t.climb][n - 1];

export type SwapRef = { key: string; teamId: number };

/**
 * The full tournament tree. Winners light up, eliminated teams dim, the active round pulses.
 * When `onSwap` is given the team chips become draggable (admin draw tool).
 */
export function Bracket({
  rounds,
  currentKey,
  onSelect,
  onSwap,
  dirty,
  compact = false,
}: {
  rounds: RoundView[];
  currentKey?: string;
  onSelect?: (key: string) => void;
  onSwap?: (a: SwapRef, b: SwapRef) => void;
  dirty?: Set<string>;
  compact?: boolean;
}) {
  const [drag, setDrag] = useState<SwapRef | null>(null);
  const [over, setOver] = useState<string>('');
  const stages = [1, 2, 3].map((n) => rounds.filter((r) => r.stage === n));
  const completed = stages[0].filter((r) => r.completed).length;
  const slotsFor = (r: RoundView) => (r.stage === 3 ? 3 : 4);
  return (
    <div className={`bracket ${compact ? 'compact' : ''}`}>
      {stages.map((list, si) => (
        <React.Fragment key={si}>
          <section className={`b-stage s${si + 1}`} data-stage={si + 1}>
            <h2>
              <span>{stageName(si + 1)}</span>
              <small>
                {si === 0 ? <Of a={completed} b={12} /> : si === 1 ? '12 → 3' : '3 → 🏆'}
              </small>
            </h2>
            <div className="b-grid">
              {list.map((r) => {
                const empty = Array.from(
                  { length: Math.max(0, slotsFor(r) - r.teams.length) },
                  (_, i) => i,
                );
                return (
                  <article
                    key={r.key}
                    className={`b-round ${r.completed ? 'done' : ''} ${currentKey === r.key ? 'active' : ''} ${dirty?.has(r.key) ? 'dirty' : ''}`}
                    data-key={r.key}
                  >
                    <header>
                      <b>
                        {si === 2 ? t.finalLabel : si === 1 ? t.groupLabel : t.round}{' '}
                        {si !== 2 && <span className="num">{r.seq}</span>}
                      </b>
                      {r.completed ? (
                        <i className="tag">✓</i>
                      ) : (
                        onSelect && (
                          <button className="mini" onClick={() => onSelect(r.key)}>
                            {t.select}
                          </button>
                        )
                      )}
                    </header>
                    {r.teams.map((team: PublicTeam) => {
                      const won = r.winner === team.id;
                      const out = r.completed && !won;
                      return (
                        <div
                          key={team.id}
                          className={`b-team ${won ? 'won' : ''} ${out ? 'out' : ''} ${over === `${r.key}:${team.id}` ? 'over' : ''}`}
                          style={cssVars({ '--team': team.color })}
                          draggable={!!onSwap && !r.completed}
                          onDragStart={() => setDrag({ key: r.key, teamId: team.id })}
                          onDragEnd={() => {
                            setDrag(null);
                            setOver('');
                          }}
                          onDragOver={(e) => {
                            if (drag && onSwap && !r.completed) {
                              e.preventDefault();
                              setOver(`${r.key}:${team.id}`);
                            }
                          }}
                          onDragLeave={() => setOver('')}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (drag && onSwap && !r.completed)
                              onSwap(drag, { key: r.key, teamId: team.id });
                            setDrag(null);
                            setOver('');
                          }}
                        >
                          <TeamMark team={team} size={compact ? 18 : 24} />
                          <span className="b-name">{team.name}</span>
                          {won && <i className="adv">▲</i>}
                        </div>
                      );
                    })}
                    {empty.map((i) => (
                      <div key={`e${i}`} className="b-team empty">
                        <span className="slot-q">؟</span>
                        <span className="b-name">{t.tbd}</span>
                      </div>
                    ))}
                  </article>
                );
              })}
            </div>
          </section>
          {si < 2 && <div className="b-link" aria-hidden="true" />}
        </React.Fragment>
      ))}
      <div className="b-cup" aria-hidden="true">
        <Trophy />
      </div>
    </div>
  );
}
