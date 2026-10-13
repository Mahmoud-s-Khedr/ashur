import React, { useEffect, useMemo, useState } from 'react';
import { t, phaseNames, arrow } from '../lib/i18n';
import type { Question } from '@ashour/shared';
import type { LineupTeam, Send, Snapshot } from '../lib/types';
import { formatClock, toSeconds } from '../lib/hooks';
import { TeamMark, TimerRing, cssVars, Of } from '../ui/parts';
import { Check, Cross, Crown } from '../ui/icons';
import { Section, stageName } from './common';

type Action = {
  cmd: string;
  label: string;
  disabled?: boolean;
  hint?: string;
  payload?: Record<string, unknown>;
};

function primaryAction(s: Snapshot, tieQuestion?: number): Action | undefined {
  if (s.stage === 3 && s.phase === 'RESULTS') return undefined;
  if (s.paused) return { cmd: 'round.resume', label: t.resume };
  const everyoneReady = s.lineup.length > 0 && s.ready.length >= s.lineup.length;
  const everyonePicked = s.lineup.every((x) => x.card !== null);
  const pending = (s.answers ?? []).some((a: any) => a.verdict === 'pending');
  switch (s.phase) {
    case 'IDLE':
      return { cmd: 'round.showRules', label: t.rules };
    case 'RULES':
      return { cmd: 'lineup.announce', label: t.announce };
    case 'HANDSHAKE':
      return {
        cmd: 'round.start',
        label: t.start,
        disabled: !everyoneReady,
        hint: t.waitReadyHint,
      };
    case 'WHEEL':
      return { cmd: 'wheel.spin', label: t.spin };
    case 'CARD_PICK':
      return {
        cmd: 'question.start',
        label: t.startQuestion,
        disabled: !everyonePicked,
        hint: t.waitCardsHint,
      };
    case 'AUDIENCE':
      return { cmd: 'question.reveal', label: t.reveal, disabled: pending, hint: t.gradeFirstHint };
    case 'REVEAL':
      return { cmd: 'question.next', label: t.nextQuestion };
    case 'REVIEW':
      return s.tieIds.length > 1 ? { cmd: 'tiebreak.open', label: t.tie } : undefined;
    case 'TIE_READY':
      return {
        cmd: 'tiebreak.launch',
        payload: tieQuestion ? { questionId: tieQuestion } : undefined,
        label: t.launchTie,
        disabled: s.ready.length < s.tieIds.length,
        hint: t.waitReadyHint,
      };
    case 'TIE_REVIEW':
      return { cmd: 'question.reveal', label: t.reveal, disabled: pending, hint: t.gradeFirstHint };
    case 'RESULTS':
      return { cmd: 'round.next', label: t.nextRound };
    default:
      return undefined;
  }
}

const STEPS: Record<number, string[]> = {
  1: ['IDLE', 'RULES', 'HANDSHAKE', 'COUNTDOWN', 'RUNNING', 'RESULTS'],
  2: [
    'IDLE',
    'RULES',
    'HANDSHAKE',
    'COUNTDOWN',
    'WHEEL',
    'CARD_PICK',
    'RUNNING',
    'AUDIENCE',
    'REVEAL',
    'RESULTS',
  ],
  3: ['IDLE', 'RULES', 'HANDSHAKE', 'COUNTDOWN', 'RUNNING', 'AUDIENCE', 'REVEAL', 'RESULTS'],
};

function Stepper({ s }: { s: Snapshot }) {
  const steps = STEPS[s.stage];
  const tieish = ['TIE_READY', 'TIE_RUNNING', 'TIE_REVIEW', 'REVIEW'].includes(s.phase);
  const current = tieish ? 'RUNNING' : s.phase;
  const idx = steps.indexOf(current);
  return (
    <ol className="stepper">
      {steps.map((p, i) => (
        <li key={p} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
          <i>{i < idx ? <Check /> : i + 1}</i>
          <span>{phaseNames[p]}</span>
        </li>
      ))}
      {tieish && (
        <li className="now tie">
          <i>!</i>
          <span>{phaseNames[s.phase]}</span>
        </li>
      )}
    </ol>
  );
}

function TeamCard({ s, team, i, send }: { s: Snapshot; team: LineupTeam; i: number; send: Send }) {
  const answers = (s.answers ?? [])
    .filter(
      (a: any) =>
        a.teamId === team.id && a.verdict !== 'void' && (s.set ?? []).includes(a.questionId),
    )
    .sort((a: any, b: any) => a.elapsedUs - b.elapsedUs);
  const online = !!team.device && team.device.last_seen_at > s.serverNow - 6000;
  const status = team.ready ? 'ready' : team.checkedIn ? 'in' : 'wait';
  const rank = [...s.lineup]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .findIndex((x) => x.id === team.id);
  return (
    <article className={`team-card ${status}`} style={cssVars({ '--team': team.color })}>
      <div className="team-top">
        <span className="seat num">0{i + 1}</span>
        <span className={`badge ${status === 'ready' ? 'green' : status === 'in' ? 'blue' : ''}`}>
          {status === 'ready' ? t.ready : status === 'in' ? t.checkedIn : t.noDevice}
        </span>
        {s.stage !== 1 && team.answered && <span className="badge green">{t.answeredWord}</span>}
      </div>
      <div className="team-id">
        <TeamMark team={team} size={46} />
        <h3>{team.name}</h3>
        {rank === 0 && (team.score ?? 0) > 0 && <Crown className="lead" />}
      </div>
      <div className="score-row">
        <strong className="num">{team.score ?? '—'}</strong>
        <span>{s.stage === 3 ? t.ladder : t.score}</span>
        {team.bonus > 0 && <span className="badge gold">+{team.bonus} ⚡</span>}
      </div>
      {s.stage === 1 ? (
        <>
          <div className="trail" title={t.progress}>
            {Array.from({ length: s.settings.blitzCount }, (_, k) => {
              const a: any = answers[k];
              return <i key={k} className={a ? a.verdict : k === team.progress ? 'now' : ''} />;
            })}
          </div>
          <div className="mini-stats">
            <span>
              {t.progress} <Of a={team.progress} b={s.settings.blitzCount} />
            </span>
            {team.finishMs !== null && (
              <span>
                {t.finish} <b className="num">{toSeconds(team.finishMs, 3)} s</b>
              </span>
            )}
          </div>
        </>
      ) : s.stage === 2 ? (
        <div className="mini-stats">
          <span>
            {t.card} <b className="num">{team.card ?? '—'}</b>
          </span>
        </div>
      ) : null}
      <div className="device-row">
        <span className={`dot ${online ? '' : 'off'}`} />
        <span>
          {online ? t.online : t.noDevice} <b className="num">{team.device?.rtt_ms ?? '—'} ms</b>
        </span>
        {team.device && (
          <button className="mini" onClick={() => send('checkin.kick', { teamId: team.id })}>
            {t.kick}
          </button>
        )}
      </div>
    </article>
  );
}

function LineupPicker({ s, send }: { s: Snapshot; send: Send }) {
  const need = s.stage === 3 ? 3 : 4;
  const [lineup, setLineup] = useState<number[]>(s.lineup.map((x) => x.id));
  const [find, setFind] = useState('');
  useEffect(
    () => setLineup(s.lineup.map((x) => x.id)),
    [s.roundKey, s.lineup.map((x) => x.id).join(',')],
  );
  const teams = s.teams ?? [];
  const byId = (id: number) => teams.find((x) => x.id === id);
  const shown = teams.filter(
    (x) => x.status !== 'eliminated' && (!find || x.name.includes(find) || x.code.includes(find)),
  );
  const changed = lineup.join(',') !== s.lineup.map((x) => x.id).join(',');
  const toggle = (id: number) =>
    setLineup((l) =>
      l.includes(id) ? l.filter((x) => x !== id) : l.length < need ? [...l, id] : l,
    );
  const editable = ['IDLE', 'RULES', 'HANDSHAKE'].includes(s.phase);
  return (
    <Section title={t.lineup} badge={`${lineup.length}/${need}`} className="lineup-panel">
      <div className="chips-row">
        {lineup.map((id) => {
          const team = byId(id);
          return team ? (
            <button
              key={id}
              className="chip-btn"
              style={cssVars({ '--team': team.color })}
              onClick={() => toggle(id)}
              disabled={!editable}
            >
              <TeamMark team={team} size={22} /> {team.name}{' '}
              <span className="num">{team.code}</span> ×
            </button>
          ) : null;
        })}
      </div>
      {editable && (
        <input
          placeholder={t.findByCode}
          value={find}
          disabled={!editable}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const exact = teams.find((x) => x.code === find);
              if (exact) {
                toggle(exact.id);
                setFind('');
              }
            }
          }}
        />
      )}
      {editable && (
        <div className="lineup-options">
          {shown.slice(0, 60).map((team) => (
            <label key={team.id} className={lineup.includes(team.id) ? 'on' : ''}>
              <input
                type="checkbox"
                disabled={!editable}
                checked={lineup.includes(team.id)}
                onChange={() => toggle(team.id)}
              />
              <TeamMark team={team} size={20} /> {team.name}{' '}
              <span className="num">{team.code}</span>
            </label>
          ))}
        </div>
      )}
      <button
        className="primary"
        disabled={!editable || lineup.length !== need || !changed}
        onClick={() => send('round.assignTeams', { teamIds: lineup })}
      >
        {t.saveLineup}
      </button>
      <small className="muted">{editable ? t.lineupHint : t.lineupLocked}</small>
    </Section>
  );
}

function Emergency({ s, send }: { s: Snapshot; send: Send }) {
  const [adjustId, setAdjustId] = useState('');
  const [delta, setDelta] = useState('-5');
  const [reason, setReason] = useState('');
  const [leakQ, setLeakQ] = useState('');
  const [replacement, setReplacement] = useState('');
  const questions: Question[] = s.questions ?? [];
  const reserve = questions.filter((q) => q.pool === 'reserve' && !q.used);
  const setQs = (s.set ?? [])
    .map((id, i) => ({ q: questions.find((q) => q.id === id), i }))
    .filter((x) => x.q);
  const live = ['RUNNING', 'AUDIENCE', 'REVEAL'].includes(s.phase);
  const adjust = (d: number, why: string) => {
    if (!adjustId) return alert(t.pickTeamFirst);
    send('score.adjust', { teamId: Number(adjustId), delta: d, reason: why });
  };
  return (
    <Section title={t.emergency} className="emergency">
      <div className="action-row">
        {s.paused ? (
          <button className="primary" onClick={() => send('round.resume')}>
            {t.resume}
          </button>
        ) : (
          <button
            disabled={!['RUNNING', 'COUNTDOWN', 'TIE_RUNNING'].includes(s.phase)}
            onClick={() => send('round.pause')}
          >
            {t.pause}
          </button>
        )}
        <button onClick={() => send('undo.last')}>{t.undo}</button>
        <button
          onClick={() => {
            if (confirm(t.confirmReset)) send('devices.reset');
          }}
        >
          {t.resetDevices}
        </button>
        {s.phase === 'CARD_PICK' && (
          <>
            <button onClick={() => send('question.reroll')}>{t.reroll}</button>
            <button onClick={() => send('cards.forceFill')}>{t.forceCards}</button>
          </>
        )}
        {s.phase === 'HANDSHAKE' && (
          <button
            className="danger-outline"
            title={t.forceHint}
            onClick={() => send('round.forceStart')}
          >
            {t.force}
          </button>
        )}
      </div>
      <div className="adjust">
        <h3>{t.adjust}</h3>
        <div className="form-inline">
          <label>
            {t.team}
            <select value={adjustId} onChange={(e) => setAdjustId(e.target.value)}>
              <option value="">—</option>
              {s.lineup.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.delta}
            <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          </label>
          <label className="grow">
            {t.reason}
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <div className="action-row">
          <button
            className="danger-outline"
            onClick={() => adjust(-5, reason || t.objectionReason)}
          >
            {t.objectionPenalty}
          </button>
          <button disabled={!reason.trim()} onClick={() => adjust(Number(delta), reason)}>
            {t.applyAdjust}
          </button>
        </div>
      </div>
      <div className="adjust">
        <h3>{t.leak}</h3>
        <div className="form-inline">
          {s.stage === 1 && (
            <label className="grow">
              {t.manualQuestionId}
              <select value={leakQ} onChange={(e) => setLeakQ(e.target.value)}>
                <option value="">{t.currentQuestion}</option>
                {setQs.map(({ q, i }) => (
                  <option key={q!.id} value={q!.id}>
                    {i + 1}. {q!.body.slice(0, 40)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grow">
            {t.emergencyReplacement}
            <select value={replacement} onChange={(e) => setReplacement(e.target.value)}>
              <option value="">{t.autoHarder}</option>
              {reserve.map((q) => (
                <option key={q.id} value={q.id}>
                  #{q.id} · {t[q.difficulty as keyof typeof t]} · {q.body.slice(0, 36)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="danger-outline"
          disabled={!live}
          onClick={() => {
            if (confirm(t.confirmLeak))
              send('question.cancelLeak', {
                ...(leakQ ? { questionId: Number(leakQ) } : {}),
                ...(replacement ? { replacementId: Number(replacement) } : {}),
              });
          }}
        >
          {t.cancelAndReplace}
        </button>
      </div>
    </Section>
  );
}

export function ControlTab({ s, send, remaining }: { s: Snapshot; send: Send; remaining: number }) {
  const [tieQ, setTieQ] = useState('');
  const action = primaryAction(s, tieQ ? Number(tieQ) : undefined);
  const tieOptions = (s.questions ?? []).filter((q: Question) => q.pool !== 'main' && !q.used);
  const pending = (s.answers ?? []).filter((a: any) => a.verdict === 'pending');
  const total =
    s.phase === 'COUNTDOWN'
      ? s.settings.countdownMs
      : s.stage === 1 && s.phase === 'RUNNING'
        ? s.settings.blitzMs
        : s.settings.questionMs;
  const timed = ['RUNNING', 'COUNTDOWN', 'TIE_RUNNING'].includes(s.phase);
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && action && !action.disabled) {
        send(action.cmd, action.payload);
        return;
      }
      if (target.matches('input,textarea,select') || !pending.length) return;
      if (e.key === '1' || e.key === '2')
        send('grade.set', {
          answerId: pending[0].id,
          verdict: e.key === '1' ? 'correct' : 'wrong',
        });
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pending.map((a: any) => a.id).join(','), action?.cmd, action?.disabled, send]);
  const winner = s.lineup.find((x) => x.id === s.winner);
  return (
    <div className="control-grid">
      <div className="control-main">
        <section className="round-hero" data-stage={s.stage}>
          <div className="hero-text">
            <p className="eyebrow">
              {s.stage === 3 ? t.finalLabel : s.stage === 2 ? t.groupLabel : t.round}{' '}
              {s.stage !== 3 && <span className="num">{s.seq}</span>} · {t.stage}{' '}
              <span className="num">{s.stage}</span>
            </p>
            <h2>{stageName(s.stage)}</h2>
            <Stepper s={s} />
            <div className="action-row">
              {action && (
                <button
                  className="primary hero-btn"
                  disabled={action.disabled}
                  onClick={() => send(action.cmd, action.payload)}
                  title={action.disabled ? action.hint : t.ctrlEnter}
                >
                  {action.label} {arrow}
                </button>
              )}
              {action?.disabled && <small className="muted">{action.hint}</small>}
              {s.phase === 'TIE_READY' && (
                <select
                  aria-label={t.tieQuestionPick}
                  value={tieQ}
                  onChange={(e) => setTieQ(e.target.value)}
                >
                  <option value="">{t.tieQuestionAuto}</option>
                  {tieOptions.map((q: Question) => (
                    <option key={q.id} value={q.id}>
                      #{q.id} · {t[q.type]} · {q.body.slice(0, 40)}
                    </option>
                  ))}
                </select>
              )}
              <span className="badge">
                <Of a={s.ready.length} b={s.lineup.length} /> {t.ready}
              </span>
            </div>
          </div>
          <div className="hero-timer">
            {timed ? (
              <TimerRing
                remaining={remaining}
                total={total}
                size={132}
                paused={s.paused}
                label={t.secondsShort}
              />
            ) : (
              <div className="phase-badge">{phaseNames[s.phase]}</div>
            )}
          </div>
        </section>
        {s.phase === 'RESULTS' && winner && (
          <div className="winner-strip">
            <Crown />
            <div>
              <small>{s.stage === 3 ? t.champion : t.winner}</small>
              <h2>{winner.name}</h2>
            </div>
          </div>
        )}
        {s.phase === 'REVIEW' && s.tieIds.length > 1 && (
          <div className="notice">
            {t.leadersTie}:{' '}
            {s.tieIds.map((id) => s.teams?.find((x) => x.id === id)?.name).join(' · ')}
          </div>
        )}
        <div className="team-grid">
          {s.lineup.map((team, i) => (
            <TeamCard key={team.id} s={s} team={team} i={i} send={send} />
          ))}
        </div>
        <div className="two-columns">
          <Section title={t.grading} badge={pending.length}>
            {!pending.length ? (
              <p className="muted">{t.noPending}</p>
            ) : (
              pending.map((a: any) => (
                <div className="grade-row" key={a.id}>
                  <div>
                    <b>{s.teams?.find((x) => x.id === a.teamId)?.name}</b>
                    <p className="answer-text">{String(a.answer)}</p>
                    <small className="num">
                      {(a.elapsedUs / 1000).toFixed(3)} ms · RTT {a.rttMs ?? '—'} ms
                    </small>
                    <p className="model-text">
                      {t.model}:{' '}
                      {JSON.stringify(
                        s.questions?.find((q: Question) => q.id === a.questionId)?.correct,
                      )}
                    </p>
                  </div>
                  <div className="grade-btns">
                    <button
                      className="success"
                      onClick={() => send('grade.set', { answerId: a.id, verdict: 'correct' })}
                    >
                      <Check /> {t.correct} [1]
                    </button>
                    <button
                      className="danger-outline"
                      onClick={() => send('grade.set', { answerId: a.id, verdict: 'wrong' })}
                    >
                      <Cross /> {t.wrong} [2]
                    </button>
                  </div>
                </div>
              ))
            )}
          </Section>
          <Section title={t.questionPreview}>
            {s.question ? (
              <>
                <small className="muted">
                  {s.question.category} · #{s.question.id}
                </small>
                <h3 className="preview-body">{s.question.body}</h3>
                <div className="preview-options">
                  {s.question.options.map((o: string, i: number) => (
                    <span className={s.question!.correct === i ? 'correct-option' : ''} key={i}>
                      <b className="num">{String.fromCharCode(65 + i)}</b> {o}
                    </span>
                  ))}
                </div>
                {s.question.type !== 'mcq' && (
                  <p>
                    {t.model}:{' '}
                    {Array.isArray(s.question.correct) ? s.question.correct.join(' / ') : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">{t.noQuestion}</p>
            )}
          </Section>
        </div>
      </div>
      <div className="control-side">
        <LineupPicker s={s} send={send} />
        <Emergency s={s} send={send} />
        <Section title={t.scene}>
          <div className="action-row">
            {[
              ['auto', t.autoScene],
              ['intro', t.intro],
              ['bracket', t.bracket],
              ['leaderboard', t.leaderboard],
            ].map(([scene, name]) => (
              <button
                className={s.scene === scene ? 'selected' : ''}
                key={scene}
                onClick={() => send('display.scene', { scene })}
              >
                {name}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
