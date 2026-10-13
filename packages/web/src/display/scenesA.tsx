import React, { useEffect, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import type { Snapshot } from '../lib/types';
import { Bracket } from '../ui/Bracket';
import { TeamMark, TimerRing, cssVars, Of } from '../ui/parts';
import { Bolt, Card, Check, Clock, Joker, ArrowUp, Spark, Trophy } from '../ui/icons';

export const stageName = (n: number) => [t.blitz, t.gambler, t.climb][n - 1];

export function Intro() {
  const steps = [
    { n: 48, label: t.teamsWord },
    { n: 12, label: t.teamsWord },
    { n: 3, label: t.teamsWord },
    { n: 1, label: t.championWord },
  ];
  return (
    <section className="d-intro">
      <div className="intro-logo">
        <span className="brandmark huge">ع</span>
        <i className="halo" />
        <i className="halo h2" />
      </div>
      <h1 className="intro-title">{t.title}</h1>
      <p className="intro-tag">{t.tagline}</p>
      <div className="funnel">
        {steps.map((step, i) => (
          <React.Fragment key={step.n}>
            <div className="funnel-step" style={{ animationDelay: `${0.5 + i * 0.35}s` }}>
              <b className="num">{step.n}</b>
              <small>{step.label}</small>
            </div>
            {i < steps.length - 1 && (
              <span className="funnel-arrow" style={{ animationDelay: `${0.65 + i * 0.35}s` }} />
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="intro-stages">
        {[1, 2, 3].map((n, i) => (
          <article
            key={n}
            data-stage={n}
            style={{ animationDelay: `${1.9 + i * 0.3}s` }}
            className="intro-stage"
          >
            <span className="num stage-no">0{n}</span>
            <h2>{stageName(n)}</h2>
            <p>{[t.blitzTag, t.gamblerTag, t.climbTag][i]}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function BracketScene({ s }: { s: Snapshot }) {
  return (
    <section className="d-bracket">
      <Bracket rounds={s.rounds} currentKey={s.roundKey} />
    </section>
  );
}

function ruleCards(s: Snapshot) {
  const c = s.settings;
  if (s.stage === 1) {
    const tiers = c.speedTiers;
    return [
      { icon: <Clock />, big: `${c.blitzMs / 1000}`, unit: t.secondsShort, text: t.ruleBlitzTime },
      { icon: <Card />, big: `${c.blitzCount}`, unit: t.questionsWord, text: t.ruleBlitzOrder },
      {
        icon: <Spark />,
        big: `${c.easyPoints} · ${c.mediumPoints} · ${c.hardPoints}`,
        unit: t.pointsWord,
        text: t.ruleBlitzPoints,
      },
      {
        icon: <Joker />,
        big: `+${c.jokerCorrect} / ${c.jokerWrong}`,
        unit: t.joker,
        text: t.ruleJoker,
        tone: 'gold',
      },
      {
        icon: <Bolt />,
        big: tiers.map((x) => `+${x.points}`).join(' · '),
        unit: t.speedBonus,
        text: tiers.map((x) => `${t.withinWord} ${x.untilMs / 1000} ${t.secondsShort}`).join(' · '),
        tone: 'gold',
        wide: true,
      },
    ];
  }
  if (s.stage === 2)
    return [
      { icon: <Spark />, big: t.ruleWheel, unit: '', text: t.ruleWheelText },
      {
        icon: <Card />,
        big: c.cards.join(' · '),
        unit: t.pickCard,
        text: t.ruleCardsText,
        tone: 'gold',
      },
      {
        icon: <Clock />,
        big: `${c.questionMs / 1000}`,
        unit: t.secondsShort,
        text: t.ruleGamblerTime,
      },
      {
        icon: <ArrowUp />,
        big: '+ / −',
        unit: t.ruleBalance,
        text: t.ruleBalanceText,
      },
      {
        icon: <Trophy />,
        big: `${c.gamblerCount}`,
        unit: t.questionsWord,
        text: t.ruleGamblerWin,
        wide: true,
      },
    ];
  return [
    { icon: <ArrowUp />, big: `${c.ladderTop}`, unit: t.stepsWord, text: t.ruleLadderTop },
    { icon: <Check />, big: `+${c.climbUp}`, unit: t.stepWord, text: t.ruleLadderUp, tone: 'good' },
    {
      icon: <Spark />,
      big: `−${c.climbDown}`,
      unit: t.stepsWord,
      text: t.ruleLadderDown,
      tone: 'bad',
    },
    {
      icon: <Clock />,
      big: `${c.questionMs / 1000}`,
      unit: t.secondsShort,
      text: t.ruleGamblerTime,
    },
    {
      icon: <Trophy />,
      big: `${c.climbCount}`,
      unit: t.questionsWord,
      text: t.ruleClimbEnd,
      wide: true,
    },
  ];
}

export function Rules({ s }: { s: Snapshot }) {
  const cards = ruleCards(s);
  return (
    <section className="d-rules">
      <p className="eyebrow">{t.rulesTitle}</p>
      <h1 className="stage-title">{stageName(s.stage)}</h1>
      <div className="rule-grid">
        {cards.map((c: any, i) => (
          <article
            key={i}
            className={`rule ${c.tone ?? ''} ${c.wide ? 'wide' : ''}`}
            style={{ animationDelay: `${0.25 + i * 0.28}s` }}
          >
            <span className="rule-icon">{c.icon}</span>
            <div>
              <b className="num rule-big">{c.big}</b>
              <small className="rule-unit">{c.unit}</small>
              <p>{c.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Lobby({ s, tie = false }: { s: Snapshot; tie?: boolean }) {
  const teams = tie ? s.lineup.filter((x) => s.tieIds.includes(x.id)) : s.lineup;
  const ready = teams.filter((x) => x.ready).length;
  const all = ready === teams.length && teams.length > 0;
  return (
    <section className={`d-lobby ${all ? 'all-ready' : ''}`}>
      <p className="eyebrow">{tie ? t.tie : t.lineupReveal}</p>
      <h1 className="stage-title">
        {stageName(s.stage)} <span className="num">{s.stage === 3 ? '' : s.seq}</span>
      </h1>
      <div className={`lineup lineup-${teams.length}`}>
        {teams.map((team, i) => {
          const state = team.ready ? 'ready' : team.checkedIn ? 'in' : 'wait';
          return (
            <article
              key={team.id}
              className={`slot ${state}`}
              style={cssVars({ '--team': team.color, '--delay': `${0.15 + i * 0.4}s` })}
            >
              <span className="slot-no num">0{i + 1}</span>
              <div className="slot-mark">
                <TeamMark team={team} size={96} />
                {state !== 'wait' && <i className="slot-pop" key={state} />}
              </div>
              <h2>{team.name}</h2>
              <div className={`slot-state ${state}`}>
                {state === 'ready' ? (
                  <>
                    <Check /> {t.ready}
                  </>
                ) : state === 'in' ? (
                  t.checkedIn
                ) : (
                  <>
                    <span className="dots">
                      <i />
                      <i />
                      <i />
                    </span>{' '}
                    {t.waitingDevice}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="ready-meter">
        <div className="ready-bar">
          <span style={{ width: `${(ready / Math.max(1, teams.length)) * 100}%` }} />
        </div>
        <Of a={ready} b={teams.length} />
        <small>{all ? t.allReady : t.ready}</small>
      </div>
    </section>
  );
}

export function Countdown({ s, remaining }: { s: Snapshot; remaining: number }) {
  const n = Math.max(1, Math.ceil(remaining / 1000));
  return (
    <section className="d-countdown">
      <p className="eyebrow">{stageName(s.stage)}</p>
      <h2>{t.prepare}</h2>
      <div className="count-wrap" key={n}>
        <div className="count num">{n}</div>
        <i className="count-ring" />
        <i className="count-ring r2" />
      </div>
    </section>
  );
}

/** "GO!" flash that appears for a moment when the countdown ends. */
export function GoFlash({ phase, stage }: { phase: string; stage: number }) {
  const prev = useRef(phase);
  const [show, setShow] = useState(0);
  useEffect(() => {
    if (prev.current === 'COUNTDOWN' && phase !== 'COUNTDOWN') {
      setShow((x) => x + 1);
    }
    prev.current = phase;
  }, [phase]);
  // The hide timer is tied to the flash itself, so later phase changes cannot cancel it.
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(0), 1200);
    return () => clearTimeout(id);
  }, [show]);
  if (!show) return null;
  return (
    <div className="go-flash" key={show} data-stage={stage}>
      <b>{t.go}</b>
    </div>
  );
}

export function Paused() {
  return (
    <div className="d-paused">
      <div className="pause-bars">
        <i />
        <i />
      </div>
      <h1>{t.paused}</h1>
      <p>{t.pausedHint}</p>
    </div>
  );
}

export function RingTimer({
  s,
  remaining,
  unit,
  size = 9,
}: {
  s: Snapshot;
  remaining: number;
  unit: number;
  size?: number;
}) {
  const total =
    s.phase === 'COUNTDOWN'
      ? s.settings.countdownMs
      : s.stage === 1 && s.phase === 'RUNNING'
        ? s.settings.blitzMs
        : s.settings.questionMs;
  return (
    <TimerRing
      remaining={remaining}
      total={total}
      size={size * unit}
      paused={s.paused}
      warnAt={10000}
      label={t.secondsShort}
    />
  );
}
