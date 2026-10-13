import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ar as t, phaseNames } from '../../shared/src/ar';
import { DEFAULTS, type Question, type Team, type Role } from '@ashour/shared';
import { useConnection, identity } from './ws';
import { parseImport } from './import';
import '@fontsource/tajawal/arabic-400.css';
import '@fontsource/tajawal/arabic-700.css';
import './style.css';
type Send = (type: string, payload?: Record<string, unknown>) => void;
const stageName = (n: number) => [t.blitz, t.gambler, t.climb][n - 1];
import { formatTime } from './time';
function App() {
  const path = location.pathname;
  const role: Role = path === '/admin' ? 'admin' : path === '/play' ? 'team' : 'display';
  const [pin, setPin] = useState(sessionStorage.getItem('ashour-pin') ?? ''),
    [inputPin, setInputPin] = useState('');
  const c = useConnection(role, pin),
    s = c.snapshot;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  if (path === '/')
    return (
      <div className="landing">
        <div className="brandmark">ع</div>
        <p className="eyebrow">ASHOUR / LOCAL LIVE</p>
        <h1>{t.title}</h1>
        <p>{t.tagline}</p>
        <div className="portal-links">
          <a href="/admin">{t.admin} ↗</a>
          <a href="/display">{t.display} ↗</a>
          <a href="/play">{t.play} ↗</a>
        </div>
        <small>{t.offlineHint}</small>
      </div>
    );
  if (role === 'admin' && !pin)
    return (
      <div className="login panel">
        <div className="brandmark">ع</div>
        <h1>{t.login}</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem('ashour-pin', inputPin);
            setPin(inputPin);
          }}
        >
          <label>
            {t.pin}
            <input
              type="password"
              autoFocus
              value={inputPin}
              onChange={(e) => setInputPin(e.target.value)}
              required
              minLength={6}
            />
          </label>
          <button className="primary">{t.connect}</button>
        </form>
        <a href="/">{t.home}</a>
      </div>
    );
  const remaining = s ? (s.paused ? s.remainingMs : Math.max(0, s.endsAt - (now + c.offset))) : 0;
  return (
    <div className={`app ${role}`}>
      <div className={`connection ${c.connected ? '' : 'disconnected'}`}>
        <span className="dot" />
        {c.connected ? t.online : t.offline} <span className="mono">LAN</span>
      </div>
      {c.error && (
        <div className="error" role="alert">
          {c.error}
          <button onClick={() => c.setError('')}>×</button>
          {role === 'admin' && (
            <button
              onClick={() => {
                sessionStorage.removeItem('ashour-pin');
                setPin('');
              }}
            >
              {t.exit}
            </button>
          )}
          <button
            onClick={() => {
              const d = identity(role);
              localStorage.removeItem(d.key + '-id');
              localStorage.removeItem(d.key + '-token');
              location.reload();
            }}
          >
            {t.refreshIdentity}
          </button>
        </div>
      )}
      {!s ? (
        <div className="loading">
          {t.waiting}
          <div className="pulse" />
        </div>
      ) : role === 'admin' ? (
        <Admin
          s={s}
          send={c.send}
          bulk={c.bulk}
          remaining={remaining}
          now={now + c.offset}
          connected={c.connected}
        />
      ) : role === 'team' ? (
        <Player s={s} send={c.send} remaining={remaining} connected={c.connected} />
      ) : (
        <Display s={s} remaining={remaining} />
      )}
    </div>
  );
}
function Timer({ s, remaining }: { s: any; remaining: number }) {
  return (
    <div className={`timer mono ${remaining < 10000 && remaining > 0 ? 'urgent' : ''}`}>
      {s.paused ? (
        <span>{t.paused}</span>
      ) : s.phase === 'COUNTDOWN' ? (
        Math.max(1, Math.ceil(remaining / 1000))
      ) : (
        formatTime(remaining)
      )}
      <small>{s.paused ? t.resume : t.timing}</small>
    </div>
  );
}
function Admin({
  s,
  send,
  bulk,
  remaining,
  now,
  connected,
}: {
  s: any;
  send: Send;
  bulk: (type: string, payload: unknown) => Promise<boolean | undefined>;
  remaining: number;
  now: number;
  connected: boolean;
}) {
  const [tab, setTab] = useState('control');
  const tabs = [
    'control',
    'bracket',
    'teams',
    'questions',
    'audit',
    'settings',
    'exports',
  ] as const;
  return (
    <>
      <aside>
        <a className="brand" href="/">
          <span className="brandmark">ع</span>
          <span>
            {t.title}
            <small>ASHOUR LIVE</small>
          </span>
        </a>
        <p className="eyebrow">{t.subtitle}</p>
        <nav>
          {tabs.map((key, i) => (
            <button className={tab === key ? 'selected' : ''} onClick={() => setTab(key)} key={key}>
              <span className="mono">0{i + 1}</span>
              {t[key]}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a href="/display" target="_blank" rel="noreferrer">
            {t.display} ↗
          </a>
          <a href="/play" target="_blank" rel="noreferrer">
            {t.play} ↗
          </a>
          <small>{t.local} · WebSocket</small>
        </div>
      </aside>
      <main className="admin-main">
        <header>
          <div>
            <p className="eyebrow">
              {t.local} / {t.stage} <span className="mono">0{s.stage}</span>
            </p>
            <h1>{t[tab as keyof typeof t]}</h1>
          </div>
          <div className="header-controls">
            <select
              aria-label={t.automatic}
              value={s.settings.automation}
              onChange={(e) => send('automation.set', { mode: e.target.value })}
            >
              <option value="auto">{t.automatic}</option>
              <option value="assisted">{t.assisted}</option>
              <option value="manual">{t.manual}</option>
            </select>
            <span className="phase">{phaseNames[s.phase]}</span>
          </div>
        </header>
        {s.autoAt > 0 && (
          <div className="auto-banner">
            {t.autoIn} <b className="mono">{Math.max(0, Math.ceil((s.autoAt - now) / 1000))}</b>{' '}
            {t.seconds} · {s.autoAction}
            <button onClick={() => send('auto.cancel')}>{t.cancelAuto}</button>
          </div>
        )}
        <div className={!connected ? 'controls-offline' : ''}>
          <fieldset disabled={!connected} className="root-fieldset">
            {tab === 'control' && <Control s={s} send={send} remaining={remaining} />}
            {tab === 'questions' && <QuestionBank s={s} send={send} bulk={bulk} />}
            {tab === 'teams' && <Teams s={s} send={send} bulk={bulk} />}
            {tab === 'bracket' && <Bracket rounds={s.rounds} send={send} />}
            {tab === 'audit' && <Audit rows={s.audit} />}
            {tab === 'settings' && <Settings s={s} send={send} />}
            {tab === 'exports' && <Exports />}
          </fieldset>
        </div>
        <footer>
          ASHOUR · {t.offlineHint} <span className="mono">v1 / {s.version}</span>
        </footer>
      </main>
    </>
  );
}
function Control({ s, send, remaining }: { s: any; send: Send; remaining: number }) {
  const [key, setKey] = useState(s.roundKey),
    [lineup, setLineup] = useState<number[]>([]),
    [adjustId, setAdjustId] = useState(''),
    [delta, setDelta] = useState('-5'),
    [reason, setReason] = useState(''),
    [leakId, setLeakId] = useState(''),
    [replacement, setReplacement] = useState('');
  useEffect(() => {
    setKey(s.roundKey);
    setLineup(s.lineup.map((t: any) => t.id));
  }, [s.roundKey]);
  const action =
    s.stage === 3 && s.phase === 'RESULTS'
      ? undefined
      : s.paused
        ? ['round.resume', t.resume]
        : (
            {
              IDLE: ['round.showRules', t.rules],
              RULES: ['lineup.announce', t.announce],
              HANDSHAKE: ['round.start', t.start],
              WHEEL: ['wheel.spin', t.spin],
              CARD_PICK: ['question.start', t.startQuestion],
              AUDIENCE: ['question.reveal', t.reveal],
              REVEAL: ['question.next', t.nextQuestion],
              REVIEW: ['tiebreak.open', t.tie],
              TIE_READY: ['tiebreak.launch', t.launchTie],
              TIE_REVIEW: ['question.reveal', t.reveal],
              RESULTS: ['round.next', t.nextRound],
            } as Record<string, string[]>
          )[s.phase];
  const pending = s.answers.filter((a: any) => a.verdict === 'pending');
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.target as HTMLElement).matches('input,textarea,select') || !pending.length) return;
      if (e.key === '1' || e.key === '2')
        send('grade.set', {
          answerId: pending[0].id,
          verdict: e.key === '1' ? 'correct' : 'wrong',
        });
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pending.map((a: any) => a.id).join(','), send]);
  return (
    <>
      <section className="round-hero">
        <div>
          <p className="eyebrow">
            {t.round} <span className="mono">{s.seq}</span> / {t.stage} {s.stage}
          </p>
          <h2>{stageName(s.stage)}</h2>
          <p>
            {phaseNames[s.phase]}{' '}
            <span className="badge">
              {s.ready.length}/{s.lineup.length} {t.ready}
            </span>
          </p>
          <div className="action-row">
            {action && (
              <button className="primary" onClick={() => send(action[0])}>
                {action[1]} ←
              </button>
            )}
            {['RUNNING', 'COUNTDOWN', 'TIE_RUNNING'].includes(s.phase) && !s.paused && (
              <button onClick={() => send('round.pause')}>{t.pause}</button>
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
        </div>
        <Timer s={s} remaining={remaining} />
      </section>
      <div className="section-heading">
        <h2>{t.lineup}</h2>
        <span>
          {s.lineup.length === 3 ? '3' : '4'} / {t.teams}
        </span>
      </div>
      <div className="team-grid">
        {s.lineup.map((team: any, i: number) => (
          <article
            className="team-card"
            key={team.id}
            style={{ '--team': team.color } as React.CSSProperties}
          >
            <div className="team-top">
              <span className="seat mono">0{i + 1}</span>
              <span className={`badge ${team.ready ? 'green' : ''}`}>
                {team.ready ? t.ready : team.device ? t.checkedIn : t.noDevice}
              </span>
            </div>
            <h3>{team.name}</h3>
            <div className="score-row">
              <strong className="mono">{team.score ?? '—'}</strong>
              <span>{s.stage === 3 ? t.ladder : t.score}</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${(team.progress / s.settings.blitzCount) * 100}%` }} />
            </div>
            <div className="mini-stats">
              <span>
                {t.progress} <b className="mono">{team.progress}</b>
              </span>
              <span>
                {t.card} <b className="mono">{team.card ?? '—'}</b>
              </span>
            </div>
            <div className="device-row">
              <span
                className={`dot ${team.device?.last_seen_at > Date.now() - 6000 ? '' : 'off'}`}
              />
              <span>
                {team.device?.last_seen_at > Date.now() - 6000 ? t.online : t.noDevice}{' '}
                <b className="mono">{team.device?.rtt_ms ?? '—'} ms</b>
              </span>
              {team.device && (
                <button onClick={() => send('checkin.kick', { teamId: team.id })}>{t.kick}</button>
              )}
            </div>
            {team.finishMs !== null && (
              <small>
                {t.finish}: <span className="mono">{(team.finishMs / 1000).toFixed(3)} s</span>
              </small>
            )}
          </article>
        ))}
      </div>
      {s.phase === 'RESULTS' && (
        <div className="winner-strip">
          <span>🏆</span>
          <div>
            <small>{s.stage === 3 ? t.champion : t.winner}</small>
            <h2>{s.teams.find((team: Team) => team.id === s.winner)?.name}</h2>
          </div>
        </div>
      )}
      {s.phase === 'REVIEW' && (
        <div className="notice">
          {t.leadersTie}:{' '}
          {s.tieIds
            .map((id: number) => s.teams.find((team: Team) => team.id === id)?.name)
            .join(' · ')}
        </div>
      )}
      <div className="two-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>{t.grading}</h2>
            <span className="badge">{pending.length}</span>
          </div>
          {!pending.length ? (
            <p className="muted">{t.noPending}</p>
          ) : (
            pending.map((a: any) => (
              <div className="grade-row" key={a.id}>
                <div>
                  <b>{s.teams.find((team: Team) => team.id === a.teamId)?.name}</b>
                  <p className="answer-text">{String(a.answer)}</p>
                  <small className="mono">
                    {(a.elapsedUs / 1000).toFixed(3)} ms · RTT {a.rttMs ?? '—'} ms
                  </small>
                  <p className="model-text">
                    {t.model}:{' '}
                    {JSON.stringify(
                      s.questions.find((q: Question) => q.id === a.questionId)?.correct,
                    )}
                  </p>
                </div>
                <div>
                  <button
                    className="success"
                    onClick={() => send('grade.set', { answerId: a.id, verdict: 'correct' })}
                  >
                    {t.correct} [1]
                  </button>
                  <button
                    className="danger-outline"
                    onClick={() => send('grade.set', { answerId: a.id, verdict: 'wrong' })}
                  >
                    {t.wrong} [2]
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <h2>{t.questionPreview}</h2>
          {s.question ? (
            <>
              <small>
                {s.question.category} · #{s.question.id}
              </small>
              <h3>{s.question.body}</h3>
              <div className="preview-options">
                {s.question.options.map((o: string, i: number) => (
                  <span className={s.question.correct === i ? 'correct-option' : ''} key={i}>
                    {o}
                  </span>
                ))}
              </div>
              <p>
                {t.model}:{' '}
                {Array.isArray(s.question.correct)
                  ? s.question.correct.join(' / ')
                  : s.question.options[s.question.correct]}
              </p>
            </>
          ) : (
            <p className="muted">{t.noQuestion}</p>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>{t.selectRound}</h2>
        <div className="form-inline">
          <select value={key} onChange={(e) => setKey(e.target.value)}>
            {s.rounds
              .filter((r: any) => !r.completed || r.key === s.roundKey)
              .map((r: any) => (
                <option key={r.key} value={r.key}>
                  {stageName(r.stage)} · {r.seq}
                </option>
              ))}
          </select>
          <button onClick={() => send('round.select', { key })}>{t.selectRound}</button>
        </div>
        <p className="muted">{t.lineupHint}</p>
        <div className="lineup-options">
          {s.teams.map((team: Team) => (
            <label key={team.id}>
              <input
                type="checkbox"
                checked={lineup.includes(team.id)}
                onChange={(e) =>
                  setLineup(
                    e.target.checked ? [...lineup, team.id] : lineup.filter((id) => id !== team.id),
                  )
                }
              />
              {team.name} <span className="mono">{team.code}</span>
            </label>
          ))}
        </div>
        <button onClick={() => send('round.assignTeams', { teamIds: lineup })}>
          {t.saveLineup}
        </button>
      </section>
      <section className="panel emergency">
        <h2>{t.emergency}</h2>
        <div className="action-row">
          <button onClick={() => send('undo.last')}>{t.undo}</button>
          <button onClick={() => send('question.reroll')}>{t.reroll}</button>
          <button
            onClick={() => {
              if (confirm(t.confirmReset)) send('devices.reset');
            }}
          >
            {t.resetDevices}
          </button>
        </div>
        <form
          className="form-inline"
          onSubmit={(e) => {
            e.preventDefault();
            send('score.adjust', { teamId: Number(adjustId), delta: Number(delta), reason });
          }}
        >
          <label>
            {t.team}
            <select required value={adjustId} onChange={(e) => setAdjustId(e.target.value)}>
              <option value="">—</option>
              {s.lineup.map((team: Team) => (
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
            <input required value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button>{t.adjust}</button>
        </form>
        <div className="form-inline">
          <label>
            {t.manualQuestionId}
            <input type="number" value={leakId} onChange={(e) => setLeakId(e.target.value)} />
          </label>
          <label>
            {t.emergencyReplacement}
            <input
              type="number"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />
          </label>
          <button
            className="danger-outline"
            onClick={() => {
              if (confirm(t.confirmLeak))
                send('question.cancelLeak', {
                  ...(leakId ? { questionId: Number(leakId) } : {}),
                  ...(replacement ? { replacementId: Number(replacement) } : {}),
                });
            }}
          >
            {t.leak}
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>{t.scene}</h2>
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
      </section>
    </>
  );
}
function Importer({
  kind,
  bulk,
}: {
  kind: 'teams' | 'questions';
  bulk: (type: string, payload: unknown) => Promise<boolean | undefined>;
}) {
  const [message, setMessage] = useState('');
  return (
    <label className="import-label">
      {t.import}
      <input
        type="file"
        accept=".json,.csv"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const rows = parseImport(await f.text(), kind);
            const ok = await bulk(`${kind}.save`, { [kind]: rows });
            setMessage(ok ? t.saved : t.error);
          } catch (error) {
            setMessage(String(error));
          }
          e.target.value = '';
        }}
      />
      <small role="status">{message || t.importHelp}</small>
    </label>
  );
}
function QuestionBank({
  s,
  send,
  bulk,
}: {
  s: any;
  send: Send;
  bulk: (type: string, payload: unknown) => Promise<boolean | undefined>;
}) {
  const [filter, setFilter] = useState(''),
    [stage, setStage] = useState(''),
    [pool, setPool] = useState(''),
    [used, setUsed] = useState(''),
    [draft, setDraft] = useState<any>(null),
    [opts, setOpts] = useState(''),
    [correct, setCorrect] = useState(''),
    [seq, setSeq] = useState('1'),
    [ids, setIds] = useState('');
  function edit(q?: Question) {
    const d = q ?? {
      stage: 1,
      pool: 'main',
      difficulty: 'easy',
      category: 'هندسة',
      type: 'mcq',
      body: '',
      options: [],
      correct: 0,
      explanation: '',
      setNo: 1,
    };
    setDraft({ ...d });
    setOpts(d.options.join('\n'));
    setCorrect(Array.isArray(d.correct) ? d.correct.join('\n') : String(d.correct));
  }
  const filtered = s.questions.filter(
    (q: Question) =>
      (!filter || q.body.includes(filter) || String(q.id) === filter) &&
      (!stage || String(q.stage) === stage) &&
      (!pool || q.pool === pool) &&
      (!used || String(!!q.used) === used),
  );
  return (
    <>
      <div className="notice warning">{t.demoWarning}</div>
      <div className="coverage-grid">
        {[
          [1, 120],
          [2, 24],
          [3, 15],
          [null, 21],
        ].map(([st, required]) => {
          const count = s.questions.filter((q: Question) => q.stage === st && !q.used).length;
          return (
            <div className="panel" key={String(st)}>
              <small>{st ? stageName(st) : t.reserve}</small>
              <strong className="mono">
                {count}
                <span> / {required}</span>
              </strong>
              <small>
                {t.available} / {t.required}
              </small>
            </div>
          );
        })}
      </div>
      <section className="panel">
        <div className="form-inline">
          <input
            aria-label={t.filter}
            placeholder={t.filter}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select aria-label={t.stage} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">
              {t.stage}: {t.all}
            </option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {stageName(n)}
              </option>
            ))}
          </select>
          <select aria-label={t.pool} value={pool} onChange={(e) => setPool(e.target.value)}>
            <option value="">
              {t.pool}: {t.all}
            </option>
            {['main', 'reserve', 'tiebreaker'].map((p) => (
              <option key={p} value={p}>
                {t[p as keyof typeof t]}
              </option>
            ))}
          </select>
          <select aria-label={t.used} value={used} onChange={(e) => setUsed(e.target.value)}>
            <option value="">{t.all}</option>
            <option value="true">{t.used}</option>
            <option value="false">{t.unused}</option>
          </select>
          <button className="primary" onClick={() => edit()}>
            {t.add}
          </button>
        </div>
        <Importer kind="questions" bulk={bulk} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t.body}</th>
                <th>{t.category}</th>
                <th>{t.difficulty}</th>
                <th>{t.status}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q: Question) => (
                <tr key={q.id}>
                  <td className="mono">{q.id}</td>
                  <td>
                    {q.body}
                    <small>
                      {t[q.type]} · {q.stage ?? t.reserve} / {q.setNo ?? '—'}
                    </small>
                  </td>
                  <td>{q.category}</td>
                  <td>{t[q.difficulty as keyof typeof t]}</td>
                  <td>
                    <span className="badge">{q.used ? t.used : t.unused}</span>
                  </td>
                  <td>
                    <button disabled={q.used} onClick={() => edit(q)}>
                      {t.edit}
                    </button>
                    <button
                      disabled={q.used}
                      onClick={() => {
                        if (confirm(t.confirmDelete)) send('questions.delete', { id: q.id });
                      }}
                    >
                      {t.remove}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>{t.setBuilder}</h2>
        <div className="form-inline">
          <label>
            {t.setNo}
            <input
              type="number"
              min={1}
              max={12}
              value={seq}
              onChange={(e) => setSeq(e.target.value)}
            />
          </label>
          <label className="grow">
            {t.questionIds}
            <input value={ids} onChange={(e) => setIds(e.target.value)} />
          </label>
          <button
            onClick={() =>
              send('set.build', { seq: Number(seq), questionIds: ids.split(',').map(Number) })
            }
          >
            {t.buildSet}
          </button>
          <button
            onClick={() => {
              if (confirm(t.confirmUsage)) send('questions.resetUsed');
            }}
          >
            {t.resetUsage}
          </button>
        </div>
      </section>
      {draft && (
        <Modal title={draft.id ? t.edit : t.add} close={() => setDraft(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const q = {
                ...draft,
                stage: draft.stage === null ? null : Number(draft.stage),
                options: draft.type === 'mcq' ? opts.split('\n').filter(Boolean) : [],
                correct:
                  draft.type === 'mcq' ? Number(correct) : correct.split('\n').filter(Boolean),
                setNo: draft.setNo ? Number(draft.setNo) : null,
              };
              delete q.used;
              delete q.deleted;
              const ok = await bulk('questions.save', { questions: [q] });
              if (ok) setDraft(null);
            }}
          >
            <div className="form-grid">
              <label>
                {t.stage}
                <select
                  value={draft.stage ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, stage: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">{t.reserve}</option>
                  {[1, 2, 3].map((n) => (
                    <option value={n} key={n}>
                      {stageName(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.pool}
                <select
                  value={draft.pool}
                  onChange={(e) => setDraft({ ...draft, pool: e.target.value })}
                >
                  {['main', 'reserve', 'tiebreaker'].map((v) => (
                    <option key={v} value={v}>
                      {t[v as keyof typeof t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.difficulty}
                <select
                  value={draft.difficulty}
                  onChange={(e) => setDraft({ ...draft, difficulty: e.target.value })}
                >
                  {['easy', 'medium', 'hard', 'joker'].map((v) => (
                    <option key={v} value={v}>
                      {t[v as keyof typeof t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.type}
                <select
                  value={draft.type}
                  onChange={(e) => {
                    setDraft({ ...draft, type: e.target.value });
                    setCorrect('');
                  }}
                >
                  {['mcq', 'text', 'numeric'].map((v) => (
                    <option key={v} value={v}>
                      {t[v as keyof typeof t]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.category}
                <input
                  required
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                />
              </label>
              <label>
                {t.setNo}
                <input
                  type="number"
                  value={draft.setNo ?? ''}
                  onChange={(e) => setDraft({ ...draft, setNo: e.target.value })}
                />
              </label>
            </div>
            <label>
              {t.body}
              <textarea
                required
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>
            {draft.type === 'mcq' && (
              <label>
                {t.options}
                <textarea value={opts} onChange={(e) => setOpts(e.target.value)} />
              </label>
            )}
            <label>
              {draft.type === 'mcq' ? t.correctIndex : t.accepted}
              <textarea required value={correct} onChange={(e) => setCorrect(e.target.value)} />
            </label>
            <label>
              {t.explanation}
              <textarea
                value={draft.explanation}
                onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
              />
            </label>
            <button className="primary">{t.save}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Teams({
  s,
  send,
  bulk,
}: {
  s: any;
  send: Send;
  bulk: (type: string, payload: unknown) => Promise<boolean | undefined>;
}) {
  const [draft, setDraft] = useState<any>(null),
    [filter, setFilter] = useState('');
  return (
    <section className="panel">
      <div className="form-inline">
        <input
          aria-label={t.filter}
          placeholder={t.filter}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => setDraft({ code: '', name: '', color: '#27d6b0' })}
        >
          {t.add}
        </button>
        <button onClick={() => window.print()}>{t.print}</button>
      </div>
      <Importer kind="teams" bulk={bulk} />
      <div className="team-table table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t.name}</th>
              <th>{t.code}</th>
              <th>{t.status}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {s.teams
              .filter((team: Team) => team.name.includes(filter) || team.code.includes(filter))
              .map((team: Team) => (
                <tr key={team.id}>
                  <td>
                    <span className="team-dot" style={{ background: team.color }} />
                    {team.name}
                  </td>
                  <td>
                    <span className="code-card mono">{team.code}</span>
                  </td>
                  <td>{t[team.status as keyof typeof t] ?? team.status}</td>
                  <td>
                    <button onClick={() => setDraft({ ...team })}>{t.edit}</button>
                    <button
                      onClick={() => {
                        if (confirm(t.confirmDelete)) send('teams.delete', { id: team.id });
                      }}
                    >
                      {t.remove}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <Modal title={t.team} close={() => setDraft(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const { status, ...d } = draft;
              if (await bulk('teams.save', { teams: [d] })) setDraft(null);
            }}
          >
            <label>
              {t.name}
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              {t.code}
              <input
                required
                pattern="[0-9]{3,4}"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>
            <label>
              {t.color}
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              />
            </label>
            <button className="primary">{t.save}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function Bracket({ rounds, send }: { rounds: any[]; send?: Send }) {
  return (
    <div className="bracket-board">
      {[1, 2, 3].map((stage) => (
        <section key={stage}>
          <h2>
            {stageName(stage)}{' '}
            <small className="mono">
              {stage === 1 ? '48 → 12' : stage === 2 ? '12 → 3' : '3 → 1'}
            </small>
          </h2>
          <div className="bracket-rounds">
            {rounds
              .filter((r) => r.stage === stage)
              .map((r) => (
                <article className={`bracket-round ${r.completed ? 'complete' : ''}`} key={r.key}>
                  <header>
                    <b>
                      {t.round} <span className="mono">{r.seq}</span>
                    </b>
                    {r.completed ? (
                      <span>✓</span>
                    ) : (
                      send && (
                        <button onClick={() => send('round.select', { key: r.key })}>
                          {t.select}
                        </button>
                      )
                    )}
                  </header>
                  {r.teams.length ? (
                    r.teams.map((team: Team) => (
                      <div
                        className={`bracket-team ${r.winner === team.id ? 'advanced' : ''}`}
                        key={team.id}
                      >
                        <span className="team-dot" style={{ background: team.color }} />
                        {team.name}
                        {r.winner === team.id && <span>↗</span>}
                      </div>
                    ))
                  ) : (
                    <p className="muted">{t.waiting}</p>
                  )}
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
function Audit({ rows }: { rows: any[] }) {
  const [filter, setFilter] = useState('');
  return (
    <section className="panel">
      <input
        aria-label={t.filter}
        placeholder={t.filter}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t.time}</th>
              <th>{t.actor}</th>
              <th>{t.event}</th>
              <th>{t.details}</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => `${r.actor} ${r.type} ${r.payload_json}`.includes(filter))
              .map((r) => (
                <tr key={r.id}>
                  <td className="mono">{new Date(r.at_wall_ms).toLocaleTimeString('en-GB')}</td>
                  <td className="mono">{r.actor}</td>
                  <td className="mono">{r.type}</td>
                  <td>
                    <code>{r.payload_json}</code>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Settings({ s, send }: { s: any; send: Send }) {
  const [value, setValue] = useState(JSON.stringify(s.settings, null, 2)),
    [error, setError] = useState('');
  return (
    <section className="panel">
      <h2>{t.configuration}</h2>
      <p>{t.configurationHelp}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            send('settings.update', { settings: JSON.parse(value) });
            setError('');
          } catch (err) {
            setError(String(err));
          }
        }}
      >
        <textarea
          className="json-editor mono"
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p role="alert">{error}</p>}
        <button className="primary">{t.save}</button>
      </form>
    </section>
  );
}
async function download(url: string, name: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${identity('admin').token}` },
  });
  if (!response.ok) throw new Error((await response.json()).error);
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function Exports() {
  const [error, setError] = useState('');
  return (
    <section className="panel">
      <h2>{t.exports}</h2>
      <p>{t.backupHelp}</p>
      <div className="action-row">
        {[
          ['/api/export', 'ashour-export.json', t.downloadJson],
          ['/api/results.csv', 'ashour-results.csv', t.downloadCsv],
          ['/api/backup', 'ashour-backup.sqlite', t.backup],
        ].map(([url, name, label]) => (
          <button
            key={url}
            onClick={() => void download(url, name).catch((e) => setError(String(e)))}
          >
            {label} ↓
          </button>
        ))}
        <button
          onClick={async () => {
            try {
              const response = await fetch('/api/export', {
                headers: { Authorization: `Bearer ${identity('admin').token}` },
              });
              if (!response.ok) throw new Error(t.error);
              const data = await response.json();
              const popup = window.open('', '_blank');
              if (!popup) throw new Error('Allow popups to print');
              const doc = popup.document;
              doc.title = t.results;
              doc.documentElement.dir = 'rtl';
              const heading = doc.createElement('h1');
              heading.textContent = t.results;
              doc.body.append(heading);
              for (const row of data.scores) {
                const p = doc.createElement('p');
                p.textContent = `${row.round_key} · ${data.teams.find((team: Team) => team.id === row.team_id)?.name} · ${row.score}`;
                doc.body.append(p);
              }
              popup.print();
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          {t.printResults}
        </button>
      </div>
      <p>{t.restoreHelp}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);
  return (
    <div className="modal-backdrop">
      <section className="modal panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="section-heading">
          <h2>{title}</h2>
          <button aria-label={t.cancel} onClick={close}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Player({
  s,
  send,
  remaining,
  connected,
}: {
  s: any;
  send: Send;
  remaining: number;
  connected: boolean;
}) {
  const [code, setCode] = useState(''),
    [answer, setAnswer] = useState('');
  useEffect(() => setAnswer(''), [s.question?.id]);
  useEffect(() => {
    const handler = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);
  return (
    <main className="player-main">
      <header>
        <a className="brand" href="/">
          <span className="brandmark">ع</span>
          <span>{t.title}</span>
        </a>
        <span className="eyebrow">{stageName(s.stage)}</span>
      </header>
      <fieldset className="root-fieldset" disabled={!connected}>
        {!s.team ? (
          <section className="checkin panel">
            <p className="eyebrow">{t.yourTurn}</p>
            <h1>{t.enterCode}</h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send('team.checkin', { code });
              }}
            >
              <input
                className="code-input mono"
                aria-label={t.code}
                inputMode="numeric"
                pattern="[0-9]{3,4}"
                maxLength={4}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <div className="keypad" dir="ltr">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setCode((c) => (c + String(n)).slice(0, 4))}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" aria-label={t.clear} onClick={() => setCode('')}>
                  ×
                </button>
                <button type="button" onClick={() => setCode((c) => (c + '0').slice(0, 4))}>
                  0
                </button>
                <button
                  type="button"
                  aria-label={t.backspace}
                  onClick={() => setCode((c) => c.slice(0, -1))}
                >
                  ⌫
                </button>
              </div>
              <button className="primary">{t.checkin} ←</button>
            </form>
          </section>
        ) : (
          <>
            <div className="player-team" style={{ '--team': s.team.color } as React.CSSProperties}>
              <span className="team-dot" style={{ background: s.team.color }} />
              <h2>{s.team.name}</h2>
              <span className="mono">{s.team.code}</span>
              {['IDLE', 'HANDSHAKE', 'RESULTS'].includes(s.phase) && (
                <button onClick={() => send('team.checkout')}>{t.checkout}</button>
              )}
            </div>
            {s.paused ? (
              <section className="player-wait">
                <div className="pause-icon">Ⅱ</div>
                <h1>{t.paused}</h1>
              </section>
            ) : !s.active ? (
              <section className="player-wait">
                <div className="pulse" />
                <h1>{t.notInRound}</h1>
              </section>
            ) : ['HANDSHAKE', 'TIE_READY'].includes(s.phase) ? (
              <section className="player-wait">
                <p className="eyebrow">{t.prepare}</p>
                <h1>
                  {t.welcome} {s.team.name}
                </h1>
                <button
                  className={`ready-button ${s.ready.includes(s.team.id) ? 'is-ready' : ''}`}
                  disabled={s.ready.includes(s.team.id)}
                  onClick={() => send('team.ready')}
                >
                  {s.ready.includes(s.team.id) ? '✓ ' + t.ready : t.ready + ' ←'}
                </button>
              </section>
            ) : s.phase === 'COUNTDOWN' ? (
              <section className="player-wait">
                <h1>{t.prepare}</h1>
                <Timer s={s} remaining={remaining} />
              </section>
            ) : s.phase === 'CARD_PICK' ? (
              <section className="player-wait">
                <p className="eyebrow">{t.category}</p>
                <h1>{s.category}</h1>
                <p>{t.pickCard}</p>
                <div className="cards">
                  {s.settings.cards.map((value: number) => (
                    <button
                      disabled={s.ownCard !== null}
                      className={s.ownCard === value ? 'chosen' : ''}
                      key={value}
                      onClick={() => send('card.select', { value })}
                    >
                      <span className="mono">{value}</span>
                      <small>{t.score}</small>
                    </button>
                  ))}
                </div>
                {s.ownCard && (
                  <p>
                    ✓ {t.card}: {s.ownCard}
                  </p>
                )}
              </section>
            ) : s.question ? (
              <section className="player-question">
                <div className="question-top">
                  <span className="badge">{s.question.category}</span>
                  <span className="mono">
                    {s.stage === 1 ? s.ownProgress + 1 : s.index + 1} /{' '}
                    {s.stage === 1
                      ? s.settings.blitzCount
                      : s.stage === 2
                        ? s.settings.gamblerCount
                        : s.settings.climbCount}
                  </span>
                  <Timer s={s} remaining={remaining} />
                </div>
                <h1>{s.question.body}</h1>
                {s.submitted ? (
                  <div className="submitted">
                    <span>✓</span>
                    {t.submitted}
                  </div>
                ) : s.question.type === 'mcq' ? (
                  <div className="answer-options">
                    {s.question.options.map((option: string, i: number) => (
                      <button
                        key={i}
                        onClick={() =>
                          send('answer.submit', { roundQuestionId: s.question.id, answer: i })
                        }
                      >
                        <span className="mono">{String.fromCharCode(65 + i)}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send('answer.submit', { roundQuestionId: s.question.id, answer });
                    }}
                  >
                    <textarea
                      required
                      autoFocus
                      aria-label={t.answer}
                      inputMode={s.question.type === 'numeric' ? 'decimal' : 'text'}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      maxLength={2000}
                    />
                    <button className="primary">{t.submit} ←</button>
                  </form>
                )}
              </section>
            ) : s.phase === 'RESULTS' ? (
              <section className="player-wait">
                <span className="trophy">{s.winner === s.team.id ? '🏆' : '✓'}</span>
                <h1>{t.ownResults}</h1>
                <strong className="result-score mono">{s.ownScore}</strong>
                <p>{s.winner === s.team.id ? t.winner : t.roundLocked}</p>
              </section>
            ) : (
              <section className="player-wait">
                <div className="pulse" />
                <h1>
                  {['AUDIENCE', 'REVEAL', 'TIE_REVIEW', 'REVIEW'].includes(s.phase)
                    ? t.submitted
                    : t.noQuestion}
                </h1>
                <p>{phaseNames[s.phase]}</p>
              </section>
            )}
          </>
        )}
      </fieldset>
    </main>
  );
}
function Display({ s, remaining }: { s: any; remaining: number }) {
  const [sound, setSound] = useState(false);
  const [audio, setAudio] = useState<AudioContext | null>(null);
  useEffect(() => {
    if (!sound || !audio || !s.settings.sound) return;
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);
    o.frequency.value = s.phase === 'RESULTS' ? 660 : s.phase === 'REVEAL' ? 523 : 440;
    g.gain.setValueAtTime(0.05, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.3);
    o.start();
    o.stop(audio.currentTime + 0.3);
  }, [s.phase, sound]);
  const scores = [...s.lineup].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
  const winner = s.rounds.flatMap((r: any) => r.teams).find((team: Team) => team.id === s.winner);
  const showIntro = s.scene === 'intro' || (s.scene === 'auto' && s.phase === 'IDLE');
  return (
    <main className="display-main">
      <header>
        <a className="brand" href="/">
          <span className="brandmark">ع</span>
          <span>{t.title}</span>
        </a>
        <span className="eyebrow">
          {stageName(s.stage)} · {t.round} <span className="mono">{s.seq}</span>
        </span>
        <div className="display-tools">
          <button
            onClick={() => {
              void document.documentElement.requestFullscreen();
            }}
          >
            {t.fullScreen}
          </button>
          <button
            onClick={() => {
              if (!audio) setAudio(new AudioContext());
              else void audio.resume();
              setSound(!sound);
            }}
          >
            {sound ? t.soundOn : t.enableSound}
          </button>
        </div>
      </header>
      {s.scene === 'bracket' ? (
        <Bracket rounds={s.rounds} />
      ) : showIntro ? (
        <section className="display-intro">
          <p className="eyebrow">ASHOUR / THE COMPETITION</p>
          <h1>{t.intro}</h1>
          <p>{t.tagline}</p>
          <div className="stage-strip">
            {[1, 2, 3].map((n) => (
              <div key={n}>
                <span className="mono">0{n}</span>
                <h2>{stageName(n)}</h2>
                <p className="mono">{n === 1 ? '48 → 12' : n === 2 ? '12 → 3' : '3 → 🏆'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : s.paused ? (
        <section className="display-center">
          <div className="pause-icon">Ⅱ</div>
          <h1>{t.paused}</h1>
        </section>
      ) : s.phase === 'COUNTDOWN' ? (
        <section className="display-center">
          <p>{t.prepare}</p>
          <div className="countdown mono" key={Math.ceil(remaining / 1000)}>
            {Math.max(1, Math.ceil(remaining / 1000))}
          </div>
        </section>
      ) : s.phase === 'RULES' ? (
        <section className="display-center rules">
          <p className="eyebrow">{t.rules}</p>
          <h1>{stageName(s.stage)}</h1>
          <p>
            {s.stage === 1
              ? `${s.settings.blitzCount} ${t.questions} · ${s.settings.blitzMs / 1000} ${t.seconds} · ${s.settings.easyPoints} / ${s.settings.mediumPoints} / ${s.settings.hardPoints} · ${t.joker} ${s.settings.jokerCorrect} / ${s.settings.jokerWrong}`
              : s.stage === 2
                ? `${t.pickCard}: ${s.settings.cards.join(' / ')} · ${s.settings.questionMs / 1000} ${t.seconds} · + / −`
                : `${s.settings.climbCount} ${t.questions} · +${s.settings.climbUp} / −${s.settings.climbDown} · ${t.ladder}: ${s.settings.ladderTop}`}
          </p>
        </section>
      ) : s.phase === 'RESULTS' ? (
        <section className={`display-results ${s.stage === 3 ? 'ceremony' : ''}`}>
          <div className="confetti">
            {Array.from({ length: 28 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${i * 3.7}%`,
                  animationDelay: `${(i % 7) * 0.3}s`,
                  background: ['#27d6b0', '#f8bc55', '#8f91ff'][i % 3],
                }}
              />
            ))}
          </div>
          <p className="eyebrow">{s.stage === 3 ? t.champion : t.winner}</p>
          <div className="trophy">🏆</div>
          <h1>{winner?.name}</h1>
          <Scoreboard teams={scores} count={s.settings.blitzCount} />
        </section>
      ) : s.question && ['AUDIENCE', 'REVEAL'].includes(s.phase) ? (
        <section className="audience-question">
          <p className="eyebrow">
            {s.phase === 'REVEAL' ? t.model : t.audience} · {s.question.category}
          </p>
          <h1>{s.question.body}</h1>
          {s.question.type === 'mcq' && (
            <div className="audience-options">
              {s.question.options.map((option: string, i: number) => (
                <div className={s.question.correct === i ? 'correct-option' : ''} key={i}>
                  <span className="mono">{String.fromCharCode(65 + i)}</span>
                  {option}
                </div>
              ))}
            </div>
          )}
          {s.question.correct !== undefined && (
            <p className="revealed-answer">
              ✓{' '}
              {Array.isArray(s.question.correct)
                ? s.question.correct.join(' / ')
                : s.question.options[s.question.correct]}
            </p>
          )}
          {s.phase === 'REVEAL' && <Scoreboard teams={scores} count={s.settings.blitzCount} />}
        </section>
      ) : ['WHEEL', 'CARD_PICK'].includes(s.phase) ? (
        <section className="display-center">
          <p className="eyebrow">{t.gambler}</p>
          <div className={`slot-machine ${s.phase === 'WHEEL' ? 'spinning' : ''}`}>
            <div>✦</div>
            <h1>{s.category || t.category}</h1>
            <div>✦</div>
          </div>
          <p>{t.pickCard}</p>
          <div className="public-lineup">
            {s.lineup.map((team: any) => (
              <div key={team.id}>
                <h2>{team.name}</h2>
                <b className="mono">{team.card ?? '?'}</b>
              </div>
            ))}
          </div>
        </section>
      ) : s.stage === 3 && s.phase === 'RUNNING' ? (
        <section className="ladder-scene">
          <Timer s={s} remaining={remaining} />
          <h1>{t.ladder}</h1>
          <div className="ladder">
            <div className="ladder-trophy">🏆</div>
            {Array.from(
              { length: s.settings.ladderTop + 1 },
              (_, i) => s.settings.ladderTop - i,
            ).map((step) => (
              <div className="ladder-step" key={step}>
                <b className="mono">{step}</b>
                {s.lineup
                  .filter((team: any) => team.score === step)
                  .map((team: any) => (
                    <span key={team.id} style={{ background: team.color }}>
                      {team.name}
                    </span>
                  ))}
              </div>
            ))}
          </div>
          <p>{t.noQuestion}</p>
        </section>
      ) : ['HANDSHAKE', 'TIE_READY'].includes(s.phase) ? (
        <section className="display-center">
          <p className="eyebrow">{t.prepare}</p>
          <h1>{s.phase === 'TIE_READY' ? t.tie : t.lineup}</h1>
          <div className="public-lineup">
            {s.lineup.map((team: any, i: number) => (
              <article
                key={team.id}
                className={team.ready ? 'public-ready' : ''}
                style={
                  { '--team': team.color, animationDelay: `${i * 0.3}s` } as React.CSSProperties
                }
              >
                <span className="mono seat">0{i + 1}</span>
                <h2>{team.name}</h2>
                <p>{team.ready ? '✓ ' + t.ready : t.waiting}</p>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="live-scoreboard">
          <div className="section-heading">
            <h1>{s.phase === 'REVIEW' ? t.leadersTie : t.leaderboard}</h1>
            {['RUNNING', 'TIE_RUNNING'].includes(s.phase) && <Timer s={s} remaining={remaining} />}
          </div>
          <Scoreboard teams={scores} count={s.settings.blitzCount} />
          <p className="muted">{phaseNames[s.phase]}</p>
        </section>
      )}
      <footer>
        {t.local} <span>ASHOUR / LIVE</span>
      </footer>
    </main>
  );
}
function Scoreboard({ teams, count = DEFAULTS.blitzCount }: { teams: any[]; count?: number }) {
  return (
    <div className="scoreboard">
      {teams.map((team, i) => (
        <div key={team.id} style={{ '--team': team.color } as React.CSSProperties}>
          <b className="mono rank">0{i + 1}</b>
          <span className="team-dot" style={{ background: team.color }} />
          <h2>{team.name}</h2>
          <div className="progress-track">
            <span style={{ width: `${(team.progress / count) * 100}%` }} />
          </div>
          <strong className="mono">{team.score ?? '—'}</strong>
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
