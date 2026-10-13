import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ar as t } from '../../../shared/src/ar';
import type { LineupTeam, Snapshot } from '../lib/types';
import { type TeamFx, useCountUp } from '../lib/hooks';
import { sfx } from '../lib/sfx';
import { Confetti, Of, TeamMark, cssVars } from '../ui/parts';
import { Check, Cross, Crown, Lock, Trophy } from '../ui/icons';
import { RingTimer, stageName } from './scenesA';
import { Standings, VerdictBadge, byScore } from './scenesB';

const SPIN_MS = 4600;
const ease = (k: number) => 1 - Math.pow(1 - k, 4);

export function Wheel({ s, now, unit }: { s: Snapshot; now: number; unit: number }) {
  const cats = s.categories.length ? s.categories : [s.category || '؟'];
  const loops = 7;
  const strip = useMemo(() => Array.from({ length: loops }, () => cats).flat(), [cats.join('|')]);
  const itemPx = unit * 6.4;
  const winH = itemPx * 3;
  const target = s.category;
  const targetIdx = (loops - 1) * cats.length + Math.max(0, cats.indexOf(target));
  const stripRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);
  const afterSpin = s.phase === 'CARD_PICK';
  const sinceSpin = now - s.spinAt;
  const key = `${s.spinAt}:${target}`;
  const offsetRef = useRef(now - Date.now());
  offsetRef.current = now - Date.now();
  useEffect(() => {
    if (!afterSpin || !target) {
      setLanded(false);
      return;
    }
    const finalY = -(targetIdx - 1) * itemPx;
    const el = stripRef.current;
    if (!el) return;
    const elapsedAtMount = Date.now() + offsetRef.current - s.spinAt;
    if (elapsedAtMount >= SPIN_MS) {
      el.style.transform = `translateY(${finalY}px)`;
      setLanded(true);
      return;
    }
    setLanded(false);
    let frame = 0,
      lastItem = -1,
      done = false;
    const run = () => {
      const t0 = Date.now() + offsetRef.current - s.spinAt;
      const k = Math.min(1, Math.max(0, t0 / SPIN_MS));
      const y = finalY * ease(k);
      el.style.transform = `translateY(${y}px)`;
      const item = Math.floor(-y / itemPx);
      if (item !== lastItem) {
        lastItem = item;
        sfx.play('reelTick');
      }
      if (k < 1) frame = requestAnimationFrame(run);
      else if (!done) {
        done = true;
        sfx.play('reelStop');
        setLanded(true);
      }
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [key, afterSpin, itemPx]);
  const idle = s.phase === 'WHEEL';
  return (
    <section className="d-wheel">
      <p className="eyebrow">
        {stageName(2)} · {t.groupLabel} <span className="num">{s.seq}</span> · {t.questionWord}{' '}
        <Of a={s.index + 1} b={s.settings.gamblerCount} />
      </p>
      <h1 className="stage-title">
        {landed ? t.chosenCategory : idle ? t.wheelReady : t.wheelSpinning}
      </h1>
      <div className={`cabinet ${landed ? 'landed' : ''} ${!idle && !landed ? 'spinning' : ''}`}>
        <div className="bulbs top" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i % 6) * 0.12}s` }} />
          ))}
        </div>
        <div className="reel-window" style={{ height: winH }}>
          <div className="reel-mask top" />
          <div className="reel-mask bottom" />
          <div className="reel-line" style={{ height: itemPx }} />
          <div
            ref={stripRef}
            className={`reel-strip ${idle ? 'idle' : ''}`}
            style={cssVars({ '--cycle': `${cats.length * itemPx}px`, '--item': `${itemPx}px` })}
          >
            {strip.map((c, i) => (
              <div
                key={i}
                className={`reel-item ${landed && i === targetIdx ? 'hit' : ''}`}
                style={{ height: itemPx }}
              >
                {c}
              </div>
            ))}
          </div>
        </div>
        <div className="bulbs bottom" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i % 6) * 0.12}s` }} />
          ))}
        </div>
      </div>
      {landed && (
        <div className="wager-status">
          <p>{t.pickCard}</p>
          <div className="wager-teams">
            {s.lineup.map((team) => (
              <div
                key={team.id}
                className={`wager ${team.card !== null ? 'locked' : ''}`}
                style={cssVars({ '--team': team.color })}
              >
                <TeamMark team={team} size={44} />
                <span>{team.name}</span>
                <i>
                  {team.card !== null ? (
                    <Lock />
                  ) : (
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </i>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TeamStrip({
  s,
  fx,
  reveal,
  showCard = true,
}: {
  s: Snapshot;
  fx: Record<number, TeamFx>;
  reveal: boolean;
  showCard?: boolean;
}) {
  return (
    <div className="team-strip">
      {s.lineup.map((team) => {
        const f = fx[team.id];
        return (
          <article
            key={team.id}
            className={`strip-team ${reveal ? (team.verdict ?? '') : ''}`}
            style={cssVars({ '--team': team.color })}
          >
            <TeamMark team={team} size={52} />
            <div>
              <h3>{team.name}</h3>
              {showCard && team.card !== null && (
                <span className="chip">
                  {t.card} <b className="num">{team.card}</b>
                </span>
              )}
            </div>
            <div className="strip-score">
              <AnimatedScore value={team.score ?? 0} />
              {reveal && <VerdictBadge verdict={team.verdict} />}
              {reveal && f?.delta ? (
                <span className={`delta ${f.delta > 0 ? 'good' : 'bad'}`} key={f.at}>
                  {f.delta > 0 ? '+' : ''}
                  {f.delta}
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AnimatedScore({ value }: { value: number }) {
  const v = useCountUp(value);
  return <b className="num">{v}</b>;
}

export function TeamTime({
  s,
  remaining,
  unit,
  fx,
}: {
  s: Snapshot;
  remaining: number;
  unit: number;
  fx: Record<number, TeamFx>;
}) {
  const answered = s.lineup.filter((x) => x.answered).length;
  return (
    <section className="d-teamtime">
      <p className="eyebrow">
        {stageName(2)} · {t.groupLabel} <span className="num">{s.seq}</span> · {t.questionWord}{' '}
        <Of a={s.index + 1} b={s.settings.gamblerCount} />
      </p>
      <div className="tt-head">
        <div className="tt-title">
          <div className="category-pill">{s.category}</div>
          <h1 className="stage-title">{t.teamsAnswering}</h1>
          <p className="muted">
            {t.answeredWord}: <Of a={answered} b={s.lineup.length} />
          </p>
        </div>
        <RingTimer s={s} remaining={remaining} unit={unit} size={10} />
      </div>
      <div className="wager-reveal">
        {s.lineup.map((team, i) => (
          <article
            key={team.id}
            className={`wager-card ${team.answered ? 'done' : ''}`}
            style={cssVars({ '--team': team.color, animationDelay: `${i * 0.18}s` })}
          >
            <div className="wc-face">
              <span className="num wc-value">{team.card ?? '?'}</span>
              <small>{t.pointsWord}</small>
            </div>
            <div className="wc-team">
              <TeamMark team={team} size={36} />
              <span className="wc-name">{team.name}</span>
            </div>
            <span className="wc-balance">
              {t.score} <b className="num">{team.score ?? 0}</b>
            </span>
            <span className={`wc-state ${team.answered ? 'ok' : ''}`}>
              {team.answered ? (
                <>
                  <Check /> {t.answeredWord}
                </>
              ) : (
                <>{t.thinking}</>
              )}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

export function QuestionBlock({ s }: { s: Snapshot }) {
  const q = s.question;
  if (!q) return null;
  const revealed = q.correct !== undefined;
  return (
    <div className="q-block">
      <div className="q-meta">
        <span className="category-pill">{q.category}</span>
        <span className="chip">{s.phase === 'REVEAL' ? t.modelAnswer : t.audience}</span>
      </div>
      <h1 className="q-body">{q.body}</h1>
      {q.type === 'mcq' ? (
        <div className="q-options">
          {q.options.map((o, i) => (
            <div
              key={i}
              className={`q-opt c${i} ${revealed ? (q.correct === i ? 'right' : 'dim') : ''}`}
              style={{ animationDelay: `${0.15 + i * 0.12}s` }}
            >
              <b className="letter num">{String.fromCharCode(65 + i)}</b>
              <span>{o}</span>
              {revealed && q.correct === i && <Check className="tick" />}
            </div>
          ))}
        </div>
      ) : (
        revealed && (
          <div className="model-answer">
            <small>{t.modelAnswer}</small>
            <b>{Array.isArray(q.correct) ? q.correct.join(' / ') : ''}</b>
          </div>
        )
      )}
      {revealed && q.explanation && <p className="explain">{q.explanation}</p>}
    </div>
  );
}

export function QuestionScene({ s, fx }: { s: Snapshot; fx: Record<number, TeamFx> }) {
  return (
    <section className="d-question">
      <p className="eyebrow">
        {stageName(2)} · {t.groupLabel} <span className="num">{s.seq}</span> · {t.questionWord}{' '}
        <Of a={s.index + 1} b={s.settings.gamblerCount} />
      </p>
      <QuestionBlock s={s} />
      <TeamStrip s={s} fx={fx} reveal={s.phase === 'REVEAL'} />
    </section>
  );
}

export function LadderGraphic({ s, fx }: { s: Snapshot; fx: Record<number, TeamFx> }) {
  const top = s.settings.ladderTop;
  const steps = Array.from({ length: top + 1 }, (_, i) => i);
  const pct = (step: number) => 6 + (step / top) * 84;
  const n = s.lineup.length;
  return (
    <div className="ladder-graphic">
      <div className="ladder-cup">
        <Trophy />
        <i className="cup-glow" />
      </div>
      <div className="ladder-body">
        <i className="rail left" />
        <i className="rail right" />
        {steps.map((step) => (
          <div
            key={step}
            className={`rung ${step === top ? 'top' : ''}`}
            style={{ bottom: `${pct(step)}%` }}
          >
            <b className="num">{step}</b>
            <i />
          </div>
        ))}
        {s.lineup.map((team, i) => {
          const f = fx[team.id];
          const step = Math.max(0, Math.min(top, team.score ?? 0));
          return (
            <div
              key={team.id}
              className={`pawn ${f?.delta ? (f.delta > 0 ? 'climb' : 'fall') : ''} ${team.id === s.winner ? 'champ' : ''}`}
              style={cssVars({
                '--team': team.color,
                bottom: `${pct(step)}%`,
                insetInlineStart: `${((i + 0.5) / n) * 78 + 11}%`,
              })}
            >
              <TeamMark team={team} size={58} />
              <span className="pawn-name">{team.name}</span>
              {f?.delta ? (
                <span className={`delta ${f.delta > 0 ? 'good' : 'bad'}`} key={f.at}>
                  {f.delta > 0 ? `+${f.delta}` : f.delta}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LadderScene({
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
  const running = s.phase === 'RUNNING';
  const answered = s.lineup.filter((x) => x.answered).length;
  return (
    <section className="d-ladder">
      <LadderGraphic s={s} fx={fx} />
      <div className="ladder-panel">
        <header>
          <div>
            <p className="eyebrow">{stageName(3)}</p>
            <h1 className="stage-title">
              {t.questionWord} <Of a={s.index + 1} b={s.settings.climbCount} />
            </h1>
          </div>
          {running && <RingTimer s={s} remaining={remaining} unit={unit} size={9} />}
        </header>
        {running ? (
          <div className="ladder-wait">
            <h2>{t.teamsAnswering}</h2>
            <div className="answered-row">
              {s.lineup.map((team) => (
                <span
                  key={team.id}
                  className={`chip big ${team.answered ? 'ok' : ''}`}
                  style={cssVars({ '--team': team.color })}
                >
                  <TeamMark team={team} size={28} /> {team.name}{' '}
                  {team.answered ? (
                    <Check />
                  ) : (
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </span>
              ))}
            </div>
            <p className="muted">
              {t.answeredWord}: <Of a={answered} b={s.lineup.length} />
            </p>
          </div>
        ) : (
          <>
            <QuestionBlock s={s} />
            <div className="mini-verdicts">
              {s.phase === 'REVEAL' &&
                s.lineup.map((team) => (
                  <span
                    key={team.id}
                    className={`chip big ${team.verdict ?? ''}`}
                    style={cssVars({ '--team': team.color })}
                  >
                    <TeamMark team={team} size={28} /> {team.name}{' '}
                    <VerdictBadge verdict={team.verdict} />
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function Champion({ s, fx }: { s: Snapshot; fx: Record<number, TeamFx> }) {
  const champ = s.lineup.find((x) => x.id === s.winner) ?? byScore(s.lineup)[0];
  return (
    <section className="d-champion" data-stage="3">
      <div className="beams" aria-hidden="true" />
      <Confetti continuous count={160} />
      <p className="eyebrow">{t.champion}</p>
      <div className="trophy-hero">
        <Trophy />
        <i className="cup-glow" />
      </div>
      <div className="champ-crown">
        <Crown />
      </div>
      {champ && <TeamMark team={champ} size={160} className="winner-mark" />}
      <h1 className="champ-name">{champ?.name}</h1>
      <p className="champ-sub">{t.championSub}</p>
      <div className="champ-board">
        <Standings s={s} fx={fx} />
      </div>
    </section>
  );
}
