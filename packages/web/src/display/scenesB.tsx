import React from 'react';
import { t } from '../lib/i18n';
import type { LineupTeam, Snapshot } from '../lib/types';
import { type TeamFx, useCountUp, toSeconds } from '../lib/hooks';
import { Confetti, TeamMark, cssVars, Of } from '../ui/parts';
import { ArrowDown, ArrowUp, Bolt, Check, Cross, Crown, Flame, Trophy } from '../ui/icons';
import { RingTimer, stageName } from './scenesA';

function Score({ value, className = '' }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return <b className={`num ${className}`}>{shown}</b>;
}

export const byScore = (teams: LineupTeam[]) =>
  [...teams].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

/** Absolutely positioned rows so rank changes animate as smooth swaps. */
export function Lanes({
  s,
  fx,
  mode,
  live = true,
}: {
  s: Snapshot;
  fx: Record<number, TeamFx>;
  mode: 'blitz' | 'balance';
  live?: boolean;
}) {
  const teams = s.lineup;
  const order = live ? byScore(teams) : teams;
  const rankOf = (id: number) => order.findIndex((x) => x.id === id);
  const n = teams.length;
  const leader = order[0]?.id;
  return (
    <div className={`lanes lanes-${mode}`} style={cssVars({ '--rows': n })}>
      {teams.map((team) => {
        const rank = rankOf(team.id);
        const f = fx[team.id];
        const finished = team.finishMs !== null;
        return (
          <article
            key={team.id}
            className={`lane ${rank === 0 && live ? 'leader' : ''} ${finished ? 'finished' : ''}`}
            style={cssVars({
              '--team': team.color,
              height: `${100 / n}%`,
              transform: `translateY(${rank * 100}%)`,
            })}
          >
            <div className="lane-in">
              <div className="lane-rank">
                {live ? (
                  <>
                    {rank === 0 && team.id === leader ? <Crown className="crown" /> : null}
                    <b className="num">{rank + 1}</b>
                    {f?.move ? (
                      <i className={`move ${f.move > 0 ? 'up' : 'down'}`} key={f.at}>
                        {f.move > 0 ? <ArrowUp /> : <ArrowDown />}
                      </i>
                    ) : null}
                  </>
                ) : (
                  <b className="num">{teams.indexOf(team) + 1}</b>
                )}
              </div>
              <TeamMark team={team} size={64} />
              <div className="lane-body">
                <h2>
                  {team.name}
                  {f && f.streak >= 3 && live && (
                    <span className="streak" key={f.streak}>
                      <Flame /> <span className="num">{f.streak}</span>
                    </span>
                  )}
                </h2>
                {mode === 'blitz' ? (
                  <div className="track">
                    {Array.from({ length: s.settings.blitzCount }, (_, i) => (
                      <i
                        key={i}
                        className={i < team.progress ? 'on' : i === team.progress ? 'now' : ''}
                      />
                    ))}
                    <span
                      className="runner"
                      style={{
                        insetInlineStart: `${(team.progress / s.settings.blitzCount) * 100}%`,
                      }}
                    >
                      <TeamMark team={team} size={34} />
                    </span>
                  </div>
                ) : (
                  <div className="lane-sub">
                    {team.card !== null && s.phase !== 'CARD_PICK' && s.phase !== 'WHEEL' ? (
                      <span className="chip">
                        {t.card} <b className="num">{team.card}</b>
                      </span>
                    ) : null}
                  </div>
                )}
                <div className="lane-meta">
                  {mode === 'blitz' && (
                    <span className="muted">
                      <Of a={team.progress} b={s.settings.blitzCount} />
                    </span>
                  )}
                  {finished && (
                    <span className="finish-chip">
                      <Bolt /> {toSeconds(team.finishMs!, 1)} {t.secondsShort}
                      {live && team.bonus > 0 && <b className="num"> +{team.bonus}</b>}
                    </span>
                  )}
                </div>
              </div>
              <div className="lane-score">
                {live ? <Score value={team.score ?? 0} /> : <b className="num hidden-score">?</b>}
                {live && f?.delta ? (
                  <span className={`delta ${f.delta > 0 ? 'good' : 'bad'}`} key={f.at}>
                    {f.delta > 0 ? '+' : ''}
                    {f.delta}
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function Race({
  s,
  remaining,
  fx,
  unit,
}: {
  s: Snapshot;
  remaining: number;
  fx: Record<number, TeamFx>;
  unit: number;
}) {
  const live = s.settings.liveScores;
  const done = s.lineup.filter((x) => x.finishMs !== null).length;
  return (
    <section className="d-race">
      <header className="race-head">
        <div>
          <p className="eyebrow">
            {t.round} <span className="num">{s.seq}</span> · {t.timeToTeams}
          </p>
          <h1 className="stage-title">{stageName(1)}</h1>
          <p className="muted">
            {t.finishedWord}: <Of a={done} b={s.lineup.length} />
          </p>
        </div>
        <RingTimer s={s} remaining={remaining} unit={unit} size={9.5} />
      </header>
      <Lanes s={s} fx={fx} mode="blitz" live={live} />
    </section>
  );
}

export function Standings({ s, fx }: { s: Snapshot; fx: Record<number, TeamFx> }) {
  const order = byScore(s.lineup);
  return (
    <div className={`standings s${s.stage}`}>
      <div className="st-head">
        <span />
        <span />
        <span>{t.team}</span>
        {s.stage === 1 && <span>{t.basePoints}</span>}
        {s.stage === 1 && <span>{t.speedBonus}</span>}
        <span>{s.stage === 3 ? t.ladder : t.total}</span>
      </div>
      {order.map((team, i) => (
        <div
          key={team.id}
          className={`st-row ${team.id === s.winner ? 'winner' : ''}`}
          style={cssVars({ '--team': team.color, animationDelay: `${0.9 + i * 0.25}s` })}
        >
          <b className="num rank">{i + 1}</b>
          <TeamMark team={team} size={44} />
          <h3>{team.name}</h3>
          {s.stage === 1 && <b className="num">{(team.score ?? 0) - team.bonus}</b>}
          {s.stage === 1 && (
            <b className="num bonus">
              {team.bonus > 0 ? (
                <>
                  <Bolt /> +{team.bonus}
                </>
              ) : (
                '—'
              )}
            </b>
          )}
          <b className="num total">{team.score ?? 0}</b>
        </div>
      ))}
    </div>
  );
}

export function RoundResults({ s, fx }: { s: Snapshot; fx: Record<number, TeamFx> }) {
  const winner = s.lineup.find((x) => x.id === s.winner);
  return (
    <section className="d-results">
      <Confetti />
      <p className="eyebrow">
        {stageName(s.stage)} · {s.stage === 3 ? '' : <span className="num">{s.seq}</span>}
      </p>
      <div className="spotlight">
        <div className="crown-wrap">
          <Crown />
        </div>
        {winner && <TeamMark team={winner} size={150} className="winner-mark" />}
        <p className="eyebrow">{t.winner}</p>
        <h1 className="winner-name">{winner?.name}</h1>
        <p className="advance">
          <Check /> {s.stage === 1 ? t.advancesToGambler : t.advancesToFinal}
        </p>
      </div>
      <Standings s={s} fx={fx} />
    </section>
  );
}

export function Leaderboard({
  s,
  fx,
  remaining,
  unit,
}: {
  s: Snapshot;
  fx: Record<number, TeamFx>;
  remaining: number;
  unit: number;
}) {
  const qualified = s.rounds
    .filter((r) => r.completed && r.winner)
    .map((r) => ({ round: r, team: r.teams.find((x) => x.id === r.winner)! }))
    .filter((x) => x.team);
  return (
    <section className="d-leaderboard">
      <div className="lb-main">
        <header className="race-head">
          <div>
            <p className="eyebrow">{stageName(s.stage)}</p>
            <h1 className="stage-title">{t.leaderboard}</h1>
          </div>
          {['RUNNING', 'TIE_RUNNING'].includes(s.phase) && (
            <RingTimer s={s} remaining={remaining} unit={unit} size={7} />
          )}
        </header>
        <Lanes s={s} fx={fx} mode={s.stage === 1 ? 'blitz' : 'balance'} live />
      </div>
      <aside className="lb-side">
        <h2>
          <Trophy /> {t.qualifiers}
        </h2>
        <div className="q-list">
          {qualified.length === 0 && <p className="muted">{t.noQualifiersYet}</p>}
          {qualified.map(({ round, team }) => (
            <div key={round.key} className="q-item" style={cssVars({ '--team': team.color })}>
              <TeamMark team={team} size={34} />
              <span>{team.name}</span>
              <small className="num">
                {round.stage}·{round.seq}
              </small>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

export function TieAnnounce({ s }: { s: Snapshot }) {
  const tied = s.lineup.filter((x) => s.tieIds.includes(x.id));
  return (
    <section className="d-tie">
      <p className="eyebrow">{stageName(s.stage)}</p>
      <h1 className="tie-title">{t.leadersTie}</h1>
      <div className="vs-row">
        {tied.map((team, i) => (
          <React.Fragment key={team.id}>
            {i > 0 && <b className="vs">VS</b>}
            <article
              className="vs-card"
              style={cssVars({ '--team': team.color, animationDelay: `${i * 0.25}s` })}
            >
              <TeamMark team={team} size={120} />
              <h2>{team.name}</h2>
              <b className="num">{team.score}</b>
            </article>
          </React.Fragment>
        ))}
      </div>
      <p className="muted">{t.tieHint}</p>
    </section>
  );
}

export function Duel({ s, remaining, unit }: { s: Snapshot; remaining: number; unit: number }) {
  const tied = s.lineup.filter((x) => s.tieIds.includes(x.id));
  const running = s.phase === 'TIE_RUNNING';
  return (
    <section className="d-tie duel">
      <p className="eyebrow">{t.tie}</p>
      <h1 className="tie-title">{running ? t.tieRunning : t.tieJudging}</h1>
      {running && <RingTimer s={s} remaining={remaining} unit={unit} size={11} />}
      <div className="vs-row">
        {tied.map((team, i) => (
          <React.Fragment key={team.id}>
            {i > 0 && <b className="vs">VS</b>}
            <article
              className={`vs-card ${team.answered ? 'answered' : ''}`}
              style={cssVars({ '--team': team.color })}
            >
              <TeamMark team={team} size={96} />
              <h2>{team.name}</h2>
              <span className="chip">
                {team.answered ? (
                  <>
                    <Check /> {t.answeredWord}
                  </>
                ) : (
                  t.thinking
                )}
              </span>
            </article>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

export function VerdictBadge({ verdict }: { verdict?: string | null }) {
  if (!verdict || verdict === 'pending') return null;
  return verdict === 'correct' ? (
    <span className="verdict good">
      <Check />
    </span>
  ) : (
    <span className="verdict bad">
      <Cross />
    </span>
  );
}
