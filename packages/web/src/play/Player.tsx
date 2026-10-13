import React, { useEffect, useRef, useState } from 'react';
import { t, phaseNames, arrow } from '../lib/i18n';
import type { Send, Snapshot } from '../lib/types';
import { toSeconds, useCountUp, usePrevious } from '../lib/hooks';
import { Confetti, Pips, TeamMark, cssVars, Of } from '../ui/parts';
import { Bolt, Check, Clock, Crown, Joker, Lock, Pause, Trophy } from '../ui/icons';
import './play.css';

const stageName = (n: number) => [t.blitz, t.gambler, t.climb][n - 1];
const SPIN_MS = 4600;

export function friendlyError(message: string) {
  const map: [RegExp, string][] = [
    [/Unknown team code/i, t.errUnknownCode],
    [/already checked in/i, t.errTaken],
    [/locked/i, t.errLocked],
    [/seats are occupied/i, t.errSeats],
    [/deadline passed/i, t.errLate],
    [/already submitted/i, t.errDup],
    [/Stale question/i, t.errStale],
    [/Not in lineup/i, t.errNotInLineup],
    [/Illegal transition/i, t.errPhase],
    [/Card already chosen/i, t.errCardDone],
    [/reuse limit/i, t.errCardLimit],
  ];
  return map.find(([re]) => re.test(message))?.[1] ?? message;
}

function CodeEntry({
  send,
  error,
  clearError,
}: {
  send: Send;
  error: string;
  clearError: () => void;
}) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(0);
  useEffect(() => {
    if (error) setShake((n) => n + 1);
  }, [error]);
  const press = (d: string) => {
    clearError();
    navigator.vibrate?.(12);
    setCode((c) => (c.length < 4 ? c + d : c));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (e.key === 'Enter' && code.length >= 3) send('team.checkin', { code });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [code]);
  return (
    <section className="checkin">
      <p className="eyebrow">{t.yourTurn}</p>
      <h1>{t.enterCode}</h1>
      <div
        className="code-boxes"
        key={shake}
        data-bad={!!error}
        dir="ltr"
        aria-label={t.code}
        role="group"
      >
        {[0, 1, 2, 3].map((i) => (
          <b key={i} className={`num ${code[i] ? 'full' : i === code.length ? 'cursor' : ''}`}>
            {code[i] ?? ''}
          </b>
        ))}
      </div>
      <p className="code-error" role="alert">
        {error ? friendlyError(error) : ' '}
      </p>
      <div className="keypad" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button key={n} type="button" className="num" onClick={() => press(n)}>
            {n}
          </button>
        ))}
        <button type="button" aria-label={t.clear} className="alt" onClick={() => setCode('')}>
          ×
        </button>
        <button type="button" className="num" onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          aria-label={t.backspace}
          className="alt"
          onClick={() => setCode((c) => c.slice(0, -1))}
        >
          ⌫
        </button>
      </div>
      <button
        className="primary enter"
        disabled={code.length < 3}
        onClick={() => send('team.checkin', { code })}
      >
        {t.checkin} {arrow}
      </button>
    </section>
  );
}

function Welcome({ s }: { s: Snapshot }) {
  return (
    <div className="welcome" style={cssVars({ '--team': s.team!.color })}>
      <Confetti colors={[s.team!.color, '#ffc65a', '#ffffff']} count={90} />
      <TeamMark team={s.team!} size={132} className="welcome-mark" />
      <p className="eyebrow">{t.welcome}</p>
      <h1>{s.team!.name}</h1>
    </div>
  );
}

function ReadyButton({ ready, send }: { ready: boolean; send: Send }) {
  return (
    <button
      className={`ready-orb ${ready ? 'is-ready' : ''}`}
      disabled={ready}
      onClick={() => {
        navigator.vibrate?.([30, 40, 30]);
        send('team.ready');
      }}
    >
      <span className="orb-ring" />
      <span className="orb-label">
        {ready ? (
          <>
            <Check /> {t.ready}
          </>
        ) : (
          <>{t.pressReady}</>
        )}
      </span>
    </button>
  );
}

function Countdown({ remaining }: { remaining: number }) {
  const n = Math.max(1, Math.ceil(remaining / 1000));
  return (
    <section className="p-center">
      <p className="eyebrow">{t.prepare}</p>
      <div className="p-count num" key={n}>
        {n}
      </div>
    </section>
  );
}

function TimerBar({
  remaining,
  total,
  paused,
}: {
  remaining: number;
  total: number;
  paused: boolean;
}) {
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const urgent = remaining <= 10000 && remaining > 0 && !paused;
  return (
    <div className={`timer-bar ${urgent ? 'urgent' : ''}`}>
      <div className="bar-track">
        <span style={{ transform: `scaleX(${frac})` }} />
      </div>
      <b className="num">
        <Clock /> {Math.ceil(remaining / 1000)}
      </b>
    </div>
  );
}

function Question({
  s,
  send,
  remaining,
  connected,
  error,
}: {
  s: Snapshot;
  send: Send;
  remaining: number;
  connected: boolean;
  error: string;
}) {
  const q = s.question!;
  const [text, setText] = useState('');
  const [sent, setSent] = useState<number | null>(null);
  useEffect(() => {
    setText('');
    setSent(null);
  }, [q.id]);
  // An optimistic lock must not outlive a command the server never accepted.
  useEffect(() => {
    if (!connected || error) setSent(null);
  }, [connected, error]);
  const c = s.settings;
  const locked = s.submitted || sent !== null;
  const total = s.stage === 1 ? c.blitzMs : c.questionMs;
  const diffLabel =
    q.difficulty === 'joker'
      ? `${t.joker} · +${c.jokerCorrect} / ${c.jokerWrong}`
      : q.difficulty
        ? `${t[q.difficulty]} · ${q.difficulty === 'easy' ? c.easyPoints : q.difficulty === 'medium' ? c.mediumPoints : c.hardPoints}`
        : '';
  const answer = (i: number) => {
    if (locked) return;
    navigator.vibrate?.(25);
    setSent(i);
    send('answer.submit', { roundQuestionId: q.id, answer: i });
  };
  useEffect(() => {
    if (q.type !== 'mcq' || locked) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, number> = {
        '1': 0,
        '2': 1,
        '3': 2,
        '4': 3,
        a: 0,
        b: 1,
        c: 2,
        d: 3,
      };
      const i = map[e.key.toLowerCase()];
      if (i !== undefined && i < q.options.length) answer(i);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [q.id, locked]);
  const count = s.stage === 1 ? c.blitzCount : s.stage === 2 ? c.gamblerCount : c.climbCount;
  const idx = s.stage === 1 ? s.ownProgress : s.index;
  return (
    <section className={`p-question ${q.difficulty === 'joker' ? 'joker' : ''}`} key={q.id}>
      <TimerBar remaining={remaining} total={total} paused={s.paused} />
      <div className="q-top">
        <span className="chip">{q.category}</span>
        {diffLabel && (
          <span className={`chip diff ${q.difficulty}`}>
            {q.difficulty === 'joker' && <Joker />} {diffLabel}
          </span>
        )}
        {s.stage === 2 && s.ownCard !== null && (
          <span className="chip diff gold">
            {t.card} <b className="num">{s.ownCard}</b>
          </span>
        )}
        <span className="chip q-no">
          <Of a={idx + 1} b={count} />
        </span>
      </div>
      {s.stage === 1 && <Pips total={count} done={idx} current />}
      <h1 className="q-text">{q.body}</h1>
      {locked ? (
        <div className="locked">
          <Lock />
          <b>{t.submitted}</b>
          <small>{s.stage === 1 ? t.nextComing : t.watchScreen}</small>
        </div>
      ) : q.type === 'mcq' ? (
        <div className="options" role="group">
          {q.options.map((o, i) => (
            <button key={i} className={`opt c${i}`} onClick={() => answer(i)}>
              <b className="letter num">{String.fromCharCode(65 + i)}</b>
              <span>{o}</span>
            </button>
          ))}
        </div>
      ) : (
        <form
          className="text-answer"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            setSent(0);
            send('answer.submit', { roundQuestionId: q.id, answer: text });
          }}
        >
          <textarea
            required
            autoFocus
            aria-label={t.answer}
            inputMode={q.type === 'numeric' ? 'decimal' : 'text'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={t.typeAnswer}
          />
          <button className="primary">
            {t.submit} {arrow}
          </button>
        </form>
      )}
    </section>
  );
}

function CardPick({ s, send, now }: { s: Snapshot; send: Send; now: number }) {
  const spinning = now - s.spinAt < SPIN_MS;
  const c = s.settings;
  if (spinning)
    return (
      <section className="p-center">
        <div className="mini-reel">
          <i />
          <i />
          <i />
        </div>
        <h1>{t.wheelSpinning}</h1>
      </section>
    );
  return (
    <section className="p-cards">
      <p className="eyebrow">{t.category}</p>
      <h1 className="cat">{s.category}</h1>
      <p className="muted">{t.pickCard}</p>
      <div className="cards">
        {c.cards.map((value, i) => (
          <button
            key={value}
            disabled={s.ownCard !== null}
            className={`wager-pick ${s.ownCard === value ? 'chosen' : ''} ${s.ownCard !== null && s.ownCard !== value ? 'rest' : ''}`}
            style={{ animationDelay: `${i * 0.12}s` }}
            onClick={() => {
              navigator.vibrate?.(30);
              send('card.select', { value });
            }}
          >
            <b className="num">{value}</b>
            <small>
              <span className="g">+{value}</span> / <span className="r">−{value}</span>
            </small>
          </button>
        ))}
      </div>
      {s.ownCard !== null && (
        <p className="locked-note">
          <Lock /> {t.cardLocked} <b className="num">{s.ownCard}</b> · {t.waitOthers}
        </p>
      )}
    </section>
  );
}

function Finished({ s }: { s: Snapshot }) {
  return (
    <section className="p-center finished">
      <Trophy />
      <h1>{t.allAnswered}</h1>
      {s.ownFinishMs !== null && (
        <div className="finish-card">
          <small>{t.finish}</small>
          <b className="num">
            {toSeconds(s.ownFinishMs, 2)} <small>{t.secondsShort}</small>
          </b>
          {s.ownBonus > 0 && (
            <span className="chip gold">
              <Bolt /> {t.speedBonus} +{s.ownBonus}
            </span>
          )}
        </div>
      )}
      <p className="muted">{t.waitOthers}</p>
    </section>
  );
}

function Results({ s }: { s: Snapshot }) {
  const won = s.winner === s.team!.id;
  const score = useCountUp(s.ownScore ?? 0, 1200);
  return (
    <section className={`p-center results ${won ? 'won' : ''}`}>
      {won && <Confetti count={160} />}
      {won ? <Crown /> : <Check />}
      <p className="eyebrow">{t.ownResults}</p>
      <div className="big-score num">{score}</div>
      <h1>{won ? (s.stage === 3 ? t.youAreChampion : t.youQualified) : t.betterLuck}</h1>
      <p className="muted">{t.watchScreen}</p>
    </section>
  );
}

export function Player({
  s,
  send,
  remaining,
  now,
  error,
  clearError,
  connected,
}: {
  s: Snapshot;
  send: Send;
  remaining: number;
  now: number;
  error: string;
  clearError: () => void;
  connected: boolean;
}) {
  const [welcome, setWelcome] = useState(false);
  const teamId = s.team?.id;
  const prevTeam = usePrevious(teamId);
  useEffect(() => {
    if (teamId && !prevTeam) {
      setWelcome(true);
      const id = setTimeout(() => setWelcome(false), 2600);
      return () => clearTimeout(id);
    }
  }, [teamId]);
  useEffect(() => {
    // Kiosk behaviour: no context menu, and the browser's Back button cannot leave the game.
    const block = (e: Event) => e.preventDefault();
    const stay = () => history.pushState(null, '', location.href);
    document.addEventListener('contextmenu', block);
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', stay);
    return () => {
      document.removeEventListener('contextmenu', block);
      window.removeEventListener('popstate', stay);
    };
  }, []);

  if (!s.team)
    return (
      <main className="player" data-stage={s.stage}>
        <CodeEntry send={send} error={error} clearError={clearError} />
      </main>
    );

  let body: React.ReactNode;
  const blitzDone = s.stage === 1 && s.ownProgress >= s.settings.blitzCount;
  if (welcome) body = <Welcome s={s} />;
  else if (s.paused)
    body = (
      <section className="p-center">
        <div className="pause-icon">
          <Pause />
        </div>
        <h1>{t.paused}</h1>
      </section>
    );
  else if (!s.active)
    body = (
      <section className="p-center idle-round">
        <div className="orbit">
          <i />
          <i />
          <i />
        </div>
        <h1>{t.notInRoundShort}</h1>
        <p className="muted">{t.notInRoundHint}</p>
        <span className="chip">
          {stageName(s.stage)} · {phaseNames[s.phase]}
        </span>
      </section>
    );
  else if (['HANDSHAKE', 'TIE_READY'].includes(s.phase))
    body = (
      <section className="p-center">
        <p className="eyebrow">{stageName(s.stage)}</p>
        <h1>{t.areYouReady}</h1>
        <ReadyButton ready={s.ready.includes(s.team.id)} send={send} />
        <p className="muted">
          {s.ready.length > 0 && <span className="num">{s.ready.length}</span>}{' '}
          {s.ready.includes(s.team.id) ? t.waitOthers : t.pressWhenReady}
        </p>
      </section>
    );
  else if (s.phase === 'COUNTDOWN') body = <Countdown remaining={remaining} />;
  else if (s.phase === 'CARD_PICK') body = <CardPick s={s} send={send} now={now} />;
  else if (s.question && ['RUNNING', 'TIE_RUNNING'].includes(s.phase))
    body = <Question s={s} send={send} remaining={remaining} connected={connected} error={error} />;
  else if (blitzDone && s.phase === 'RUNNING') body = <Finished s={s} />;
  else if (s.phase === 'RESULTS') body = <Results s={s} />;
  else if (['AUDIENCE', 'REVEAL', 'REVIEW', 'TIE_REVIEW'].includes(s.phase))
    body = (
      <section className="p-center">
        <Check />
        <h1>{s.submitted || s.stage === 1 ? t.submitted : t.timeUp}</h1>
        <p className="muted">{t.watchScreen}</p>
      </section>
    );
  else
    body = (
      <section className="p-center">
        <div className="pulse" />
        <h1>{t.waitingInstructions}</h1>
        <p className="muted">{phaseNames[s.phase]}</p>
      </section>
    );

  return (
    <main className="player" data-stage={s.stage} style={cssVars({ '--team': s.team.color })}>
      <header className="p-head">
        <TeamMark team={s.team} size={40} />
        <div>
          <b>{s.team.name}</b>
          <small>
            {stageName(s.stage)}
            {s.stage !== 3 && (
              <>
                {' · '}
                <span className="num">{s.seq}</span>
              </>
            )}
          </small>
        </div>
        {['IDLE', 'RULES', 'HANDSHAKE', 'RESULTS'].includes(s.phase) && (
          <button className="ghost" onClick={() => send('team.checkout')}>
            {t.checkout}
          </button>
        )}
      </header>
      <div className="p-body" key={`${s.phase}-${welcome}-${s.question?.id ?? ''}-${s.paused}`}>
        {body}
      </div>
    </main>
  );
}
