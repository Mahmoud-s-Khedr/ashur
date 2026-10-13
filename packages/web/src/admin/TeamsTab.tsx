import React, { useState } from 'react';
import { t } from '../lib/i18n';
import type { Bulk, Send, Snapshot } from '../lib/types';
import { TeamMark, cssVars } from '../ui/parts';
import { FilePick, Importer, Modal, Section, imageToLogo, shuffle } from './common';

const PALETTE = [
  '#27d6b0',
  '#ffc65a',
  '#8f91ff',
  '#ff6f9c',
  '#4aa8ff',
  '#3ddc84',
  '#ff8a3c',
  '#c58bff',
];

export function TeamsTab({ s, send, bulk }: { s: Snapshot; send: Send; bulk: Bulk }) {
  const [draft, setDraft] = useState<any>(null);
  const [gen, setGen] = useState<{ count: string; prefix: string } | null>(null);
  const [filter, setFilter] = useState('');
  const teams = (s.teams ?? []).filter((x) => x.name.includes(filter) || x.code.includes(filter));
  const editable = ['IDLE', 'RESULTS'].includes(s.phase);
  const checked = new Set((s.devices ?? []).filter((d) => d.team_id).map((d) => d.team_id));
  const [genError, setGenError] = useState('');
  return (
    <Section
      title={t.teams}
      badge={s.teams?.length}
      actions={
        <>
          <button
            className="primary"
            disabled={!editable}
            onClick={() =>
              setDraft({
                code: '',
                name: '',
                color: PALETTE[(s.teams?.length ?? 0) % 8],
                logo: undefined,
              })
            }
          >
            {t.add}
          </button>
          <button disabled={!editable} onClick={() => setGen({ count: '48', prefix: 'الفريق' })}>
            {t.bulkGenerate}
          </button>
          <button onClick={() => window.print()}>{t.print}</button>
        </>
      }
    >
      <div className="form-inline">
        <input
          aria-label={t.filter}
          placeholder={t.filter}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <Importer kind="teams" bulk={bulk} />
      {!editable && <p className="muted">{t.teamsLocked}</p>}
      <div className="team-table table-wrap">
        <table>
          <thead>
            <tr>
              <th />
              <th>{t.name}</th>
              <th>{t.code}</th>
              <th>{t.status}</th>
              <th>{t.device}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id}>
                <td>
                  <TeamMark team={team} size={34} />
                </td>
                <td>{team.name}</td>
                <td>
                  <span className="code-card num">{team.code}</span>
                </td>
                <td>
                  <span
                    className={`badge ${team.status === 'qualified' || team.status === 'finalist' || team.status === 'champion' ? 'green' : ''}`}
                  >
                    {t[team.status as keyof typeof t] ?? team.status}
                  </span>
                </td>
                <td>
                  {checked.has(team.id) ? <span className="badge blue">{t.checkedIn}</span> : '—'}
                </td>
                <td>
                  <button
                    className="mini"
                    disabled={!editable}
                    onClick={() => setDraft({ ...team })}
                  >
                    {t.edit}
                  </button>
                  <button
                    className="mini"
                    disabled={!editable}
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

      <div className="print-cards" aria-hidden="true">
        {(s.teams ?? []).map((team) => (
          <div key={team.id} className="print-card" style={cssVars({ '--team': team.color })}>
            <small>{t.title}</small>
            <h3>{team.name}</h3>
            <b className="num">{team.code}</b>
            <span>{t.codeCardHint}</span>
          </div>
        ))}
      </div>

      {draft && (
        <Modal title={draft.id ? t.edit : t.add} close={() => setDraft(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const { status, logoV, ...d } = draft;
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
                inputMode="numeric"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              />
            </label>
            <label>
              {t.color}
              <div className="swatches">
                {PALETTE.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`swatch ${draft.color === c ? 'on' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                    onClick={() => setDraft({ ...draft, color: c })}
                  />
                ))}
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                />
              </div>
            </label>
            <label>
              {t.logo}
              <div className="logo-pick">
                <TeamMark
                  team={{
                    ...draft,
                    id: draft.id ?? 0,
                    logoV: draft.logo === null ? 0 : draft.logo ? 0 : draft.logoV,
                  }}
                  size={64}
                />
                {draft.logo && <img className="logo-preview" src={draft.logo} alt="" />}
                <FilePick
                  label={t.chooseFile}
                  accept="image/png,image/jpeg,image/webp"
                  onFile={async (f) => setDraft({ ...draft, logo: await imageToLogo(f) })}
                />
                {(draft.logo || draft.logoV) && (
                  <button
                    type="button"
                    className="mini"
                    onClick={() => setDraft({ ...draft, logo: null })}
                  >
                    {t.removeLogo}
                  </button>
                )}
              </div>
            </label>
            <button className="primary">{t.save}</button>
          </form>
        </Modal>
      )}
      {gen && (
        <Modal title={t.bulkGenerate} close={() => setGen(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const count = Math.max(1, Math.min(200, Number(gen.count)));
              const used = new Set((s.teams ?? []).map((x) => x.code));
              const free: string[] = [];
              for (let n = 100; n <= 999; n++) if (!used.has(String(n))) free.push(String(n));
              if (free.length < count) return setGenError(t.noFreeCodes);
              const codes = shuffle(free).slice(0, count).sort();
              const start = (s.teams ?? []).length;
              const rows = codes.map((code, i) => ({
                code,
                name: `${gen.prefix} ${start + i + 1}`,
                color: PALETTE[(start + i) % PALETTE.length],
              }));
              if (await bulk('teams.save', { teams: rows })) {
                setGen(null);
                setGenError('');
              }
            }}
          >
            <p className="muted">{t.bulkGenerateHint}</p>
            <label>
              {t.count}
              <input
                type="number"
                min={1}
                max={200}
                value={gen.count}
                onChange={(e) => setGen({ ...gen, count: e.target.value })}
              />
            </label>
            <label>
              {t.namePrefix}
              <input
                value={gen.prefix}
                onChange={(e) => setGen({ ...gen, prefix: e.target.value })}
              />
            </label>
            {genError && <p role="alert">{genError}</p>}
            <button className="primary">{t.generate}</button>
          </form>
        </Modal>
      )}
    </Section>
  );
}
