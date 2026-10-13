import { Of } from '../ui/parts';
import React, { useMemo, useState } from 'react';
import { t } from '../lib/i18n';
import type { Question } from '@ashour/shared';
import type { Bulk, Send, Snapshot } from '../lib/types';
import { Importer, Modal, Section, stageName } from './common';

const DIFFS = ['easy', 'medium', 'hard', 'joker'] as const;
const NEED: Record<string, number> = { easy: 3, medium: 3, hard: 3, joker: 1 };

function Preview({ q }: { q: Question }) {
  return (
    <div className="q-preview">
      <div className="q-preview-top">
        <span className="chip">{q.category}</span>
        <span className="chip">{t[q.difficulty as keyof typeof t]}</span>
      </div>
      <h2>{q.body}</h2>
      {q.type === 'mcq' ? (
        <div className="preview-options">
          {q.options.map((o, i) => (
            <span key={i} className={q.correct === i ? 'correct-option' : ''}>
              <b className="num">{String.fromCharCode(65 + i)}</b> {o}
            </span>
          ))}
        </div>
      ) : (
        <p className="model-text">
          {t.model}: {Array.isArray(q.correct) ? q.correct.join(' / ') : ''}
        </p>
      )}
      {q.explanation && <p className="muted">{q.explanation}</p>}
    </div>
  );
}

function Editor({
  initial,
  categories,
  bulk,
  close,
}: {
  initial: any;
  categories: string[];
  bulk: Bulk;
  close: () => void;
}) {
  const [d, setD] = useState<any>(initial);
  const [opts, setOpts] = useState<string[]>(() => {
    const o = [...(initial.options ?? [])];
    while (o.length < 4) o.push('');
    return o;
  });
  const [correctIdx, setCorrectIdx] = useState<number>(
    typeof initial.correct === 'number' ? initial.correct : 0,
  );
  const [accepted, setAccepted] = useState<string>(
    Array.isArray(initial.correct) ? initial.correct.join('\n') : '',
  );
  const [error, setError] = useState('');
  return (
    <Modal title={d.id ? t.edit : t.add} close={close} wide>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const mcq = d.type === 'mcq';
          const options = mcq ? opts.filter((o) => o.trim()) : [];
          if (mcq && (options.length < 2 || !opts[correctIdx]?.trim()))
            return setError(t.mcqInvalid);
          const q: any = {
            ...d,
            stage: d.stage === null || d.stage === '' ? null : Number(d.stage),
            options,
            correct: mcq
              ? opts.slice(0, correctIdx).filter((o) => o.trim()).length
              : accepted
                  .split('\n')
                  .map((x) => x.trim())
                  .filter(Boolean),
            setNo: d.setNo ? Number(d.setNo) : null,
          };
          delete q.used;
          delete q.deleted;
          if (!mcq && !q.correct.length) return setError(t.acceptedRequired);
          if (await bulk('questions.save', { questions: [q] })) close();
        }}
      >
        <div className="form-grid">
          <label>
            {t.stage}
            <select
              value={d.stage ?? ''}
              onChange={(e) =>
                setD({ ...d, stage: e.target.value ? Number(e.target.value) : null })
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
            <select value={d.pool} onChange={(e) => setD({ ...d, pool: e.target.value })}>
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
              value={d.difficulty}
              onChange={(e) => setD({ ...d, difficulty: e.target.value })}
            >
              {DIFFS.map((v) => (
                <option key={v} value={v}>
                  {t[v]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.type}
            <select value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>
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
              list="cats"
              value={d.category}
              onChange={(e) => setD({ ...d, category: e.target.value })}
            />
            <datalist id="cats">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            {t.setNo}
            <input
              type="number"
              min={1}
              max={12}
              value={d.setNo ?? ''}
              onChange={(e) => setD({ ...d, setNo: e.target.value })}
            />
          </label>
        </div>
        <label>
          {t.body}
          <textarea
            required
            value={d.body}
            onChange={(e) => setD({ ...d, body: e.target.value })}
          />
        </label>
        {d.type === 'mcq' ? (
          <fieldset className="opts-editor">
            <legend>{t.optionsPick}</legend>
            {opts.map((o, i) => (
              <div key={i} className={`opt-line ${correctIdx === i ? 'on' : ''}`}>
                <input
                  type="radio"
                  name="correct"
                  checked={correctIdx === i}
                  onChange={() => setCorrectIdx(i)}
                  aria-label={t.correct}
                />
                <b className="num">{String.fromCharCode(65 + i)}</b>
                <input
                  value={o}
                  onChange={(e) => setOpts(opts.map((x, k) => (k === i ? e.target.value : x)))}
                />
              </div>
            ))}
            <button
              type="button"
              className="mini"
              onClick={() => setOpts([...opts, ''])}
              disabled={opts.length >= 6}
            >
              + {t.addOption}
            </button>
          </fieldset>
        ) : (
          <label>
            {t.accepted}
            <textarea value={accepted} onChange={(e) => setAccepted(e.target.value)} />
          </label>
        )}
        <label>
          {t.explanation}
          <textarea
            value={d.explanation ?? ''}
            onChange={(e) => setD({ ...d, explanation: e.target.value })}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="primary">{t.save}</button>
      </form>
    </Modal>
  );
}

export function QuestionsTab({ s, send, bulk }: { s: Snapshot; send: Send; bulk: Bulk }) {
  const questions: Question[] = s.questions ?? [];
  const [filter, setFilter] = useState('');
  const [stage, setStage] = useState('');
  const [pool, setPool] = useState('');
  const [used, setUsed] = useState('');
  const [diff, setDiff] = useState('');
  const [cat, setCat] = useState('');
  const [draft, setDraft] = useState<any>(null);
  const [view, setView] = useState<Question | null>(null);
  const [limit, setLimit] = useState(60);
  const categories = useMemo(() => [...new Set(questions.map((q) => q.category))], [questions]);
  const filtered = questions.filter(
    (q) =>
      (!filter || q.body.includes(filter) || String(q.id) === filter) &&
      (!stage || (stage === 'none' ? q.stage === null : String(q.stage) === stage)) &&
      (!pool || q.pool === pool) &&
      (!used || String(!!q.used) === used) &&
      (!diff || q.difficulty === diff) &&
      (!cat || q.category === cat),
  );
  const newDraft = () => ({
    stage: 1,
    pool: 'main',
    difficulty: 'easy',
    category: categories[0] ?? 'هندسة',
    type: 'mcq',
    body: '',
    options: [],
    correct: 0,
    explanation: '',
    setNo: null,
  });
  const sets = Array.from({ length: 12 }, (_, i) => {
    const qs = questions.filter((q) => q.stage === 1 && q.pool === 'main' && q.setNo === i + 1);
    const count = Object.fromEntries(
      DIFFS.map((d) => [d, qs.filter((q) => q.difficulty === d).length]),
    );
    const ok = DIFFS.every((d) => count[d] === NEED[d]) && qs.length === 10;
    return { seq: i + 1, qs, count, ok, usedN: qs.filter((q) => q.used).length };
  });
  const autoFill = () => {
    const free = questions.filter(
      (q) => q.stage === 1 && q.pool === 'main' && !q.used && q.type === 'mcq' && q.setNo === null,
    );
    const byDiff = Object.fromEntries(
      DIFFS.map((d) => [d, free.filter((q) => q.difficulty === d)]),
    );
    let built = 0;
    for (const set of sets) {
      if (set.ok) continue;
      const keep = set.qs.filter((q) => !q.used);
      const ids: number[] = [];
      let possible = true;
      for (const d of DIFFS) {
        const have = keep.filter((q) => q.difficulty === d).slice(0, NEED[d]);
        const missing = NEED[d] - have.length;
        const extra = byDiff[d].splice(0, Math.max(0, missing));
        if (extra.length < missing) possible = false;
        ids.push(...have.map((q) => q.id), ...extra.map((q) => q.id));
      }
      if (possible && ids.length === 10) {
        send('set.build', { seq: set.seq, questionIds: ids });
        built++;
      }
    }
    if (!built) alert(t.autoFillNothing);
  };
  const coverage = [
    [1, 120],
    [2, 24],
    [3, 15],
    [null, 21],
  ] as const;
  return (
    <>
      <div className="notice warning">{t.demoWarning}</div>
      <div className="coverage-grid">
        {coverage.map(([st, required]) => {
          const count = questions.filter((q) => q.stage === st && !q.used).length;
          return (
            <div
              className={`panel cover ${count >= required ? 'full' : 'missing'}`}
              key={String(st)}
            >
              <small>{st ? stageName(st) : t.reserve}</small>
              <strong className="num">
                {count}
                <span> / {required}</span>
              </strong>
              <div className="cover-bar">
                <span style={{ width: `${Math.min(100, (count / required) * 100)}%` }} />
              </div>
              <small>
                {t.available} / {t.required}
              </small>
            </div>
          );
        })}
      </div>
      <Section
        title={t.setBuilder}
        badge={`${sets.filter((x) => x.ok).length}/12`}
        actions={
          <>
            <button onClick={autoFill}>{t.autoFill}</button>
            <button
              onClick={() => {
                if (confirm(t.confirmUsage)) send('questions.resetUsed');
              }}
            >
              {t.resetUsage}
            </button>
          </>
        }
      >
        <div className="set-matrix">
          {sets.map((set) => (
            <article key={set.seq} className={`set-card ${set.ok ? 'ok' : 'bad'}`}>
              <header>
                <b>
                  {t.round} <span className="num">{set.seq}</span>
                </b>
                <span className="badge">{set.ok ? '✓' : '!'}</span>
              </header>
              <div className="set-counts">
                {DIFFS.map((d) => (
                  <span key={d} className={set.count[d] === NEED[d] ? 'ok' : 'bad'} title={t[d]}>
                    {t[d]} <Of a={set.count[d]} b={NEED[d]} />
                  </span>
                ))}
              </div>
              {set.usedN > 0 && (
                <small className="muted">
                  {t.used}: {set.usedN}
                </small>
              )}
            </article>
          ))}
        </div>
      </Section>
      <Section
        title={t.questions}
        badge={`${filtered.length}/${questions.length}`}
        actions={
          <button className="primary" onClick={() => setDraft(newDraft())}>
            {t.add}
          </button>
        }
      >
        <div className="form-inline filters">
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
            <option value="none">{t.reserve}</option>
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
          <select aria-label={t.difficulty} value={diff} onChange={(e) => setDiff(e.target.value)}>
            <option value="">
              {t.difficulty}: {t.all}
            </option>
            {DIFFS.map((d) => (
              <option key={d} value={d}>
                {t[d]}
              </option>
            ))}
          </select>
          <select aria-label={t.category} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">
              {t.category}: {t.all}
            </option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select aria-label={t.used} value={used} onChange={(e) => setUsed(e.target.value)}>
            <option value="">{t.all}</option>
            <option value="true">{t.used}</option>
            <option value="false">{t.unused}</option>
          </select>
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
              {filtered.slice(0, limit).map((q) => (
                <tr key={q.id}>
                  <td className="num">{q.id}</td>
                  <td>
                    {q.body}
                    <small>
                      {t[q.type]} · {q.stage ? stageName(q.stage) : t.reserve} / {q.setNo ?? '—'}
                    </small>
                  </td>
                  <td>{q.category}</td>
                  <td>
                    <span className={`badge diff-${q.difficulty}`}>
                      {t[q.difficulty as keyof typeof t]}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${q.used ? 'gold' : ''}`}>
                      {q.used ? t.used : t.unused}
                    </span>
                  </td>
                  <td>
                    <button className="mini" onClick={() => setView(q)}>
                      {t.preview}
                    </button>
                    <button className="mini" disabled={q.used} onClick={() => setDraft({ ...q })}>
                      {t.edit}
                    </button>
                    <button
                      className="mini"
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
        {filtered.length > limit && (
          <button onClick={() => setLimit(limit + 60)}>
            {t.showMore} ({filtered.length - limit})
          </button>
        )}
      </Section>
      {draft && (
        <Editor initial={draft} categories={categories} bulk={bulk} close={() => setDraft(null)} />
      )}
      {view && (
        <Modal title={t.preview} close={() => setView(null)}>
          <Preview q={view} />
        </Modal>
      )}
    </>
  );
}
