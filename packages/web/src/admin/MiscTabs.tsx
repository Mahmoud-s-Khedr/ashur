import React, { useState } from 'react';
import { t, dir, lang } from '../lib/i18n';
import type { Team } from '@ashour/shared';
import type { Snapshot } from '../lib/types';
import { identity } from '../ws';
import { Section, download } from './common';

export function AuditTab({ rows }: { rows: any[] }) {
  const [filter, setFilter] = useState('');
  const shown = rows.filter((r) => `${r.actor} ${r.type} ${r.payload_json}`.includes(filter));
  return (
    <Section title={t.audit} badge={shown.length}>
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
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="num">{new Date(r.at_wall_ms).toLocaleTimeString('en-GB')}</td>
                <td className="num">{String(r.actor).slice(0, 14)}</td>
                <td className="num">{r.type}</td>
                <td>
                  <code>{r.payload_json}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A self-contained, print-ready results sheet: one ranked table per completed round. */
async function printResults() {
  const response = await fetch('/api/export', {
    headers: { Authorization: `Bearer ${identity('admin').token}` },
  });
  if (!response.ok) throw new Error(t.error);
  const data = await response.json();
  const teamName = (id: number) => data.teams.find((x: Team) => x.id === id)?.name ?? `#${id}`;
  const rounds: any[] = data.state.rounds.filter((r: any) =>
    data.scores.some((x: any) => x.round_key === r.key),
  );
  const label = (r: any) =>
    `${[t.blitz, t.gambler, t.climb][r.stage - 1]}${r.stage === 3 ? '' : ` · ${r.stage === 2 ? t.groupLabel : t.round} ${r.seq}`}`;
  const tables = rounds
    .map((r) => {
      // The ledger stores deltas; Stage 2 balances also include the configured starting balance.
      const base = r.stage === 2 ? data.state.settings.gamblerInitial : 0;
      const rows = data.scores
        .filter((x: any) => x.round_key === r.key)
        .map((x: any) => ({ ...x, score: x.score + base }))
        .sort((a: any, b: any) => b.score - a.score);
      return `<h2>${esc(label(r))}</h2><table><thead><tr><th>${esc(t.rankWord)}</th><th>${esc(t.team)}</th><th>${esc(t.score)}</th><th></th></tr></thead><tbody>${rows
        .map(
          (x: any, i: number) =>
            `<tr class="${x.team_id === r.winner ? 'win' : ''}"><td>${i + 1}</td><td>${esc(teamName(x.team_id))}</td><td>${x.score}</td><td>${x.team_id === r.winner ? esc(t.winnerMark) : ''}</td></tr>`,
        )
        .join('')}</tbody></table>`;
    })
    .join('');
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow popups to print');
  popup.document
    .write(`<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(t.resultsSheet)}</title><style>
    body{font-family:Tajawal,system-ui,sans-serif;margin:24px;color:#111}
    h1{margin:0 0 4px}small{color:#555}
    h2{margin:22px 0 6px;font-size:16pt;break-after:avoid}
    table{width:100%;border-collapse:collapse;break-inside:avoid}
    th,td{padding:6px 10px;border-bottom:1px solid #ccc;text-align:start}
    th{background:#f0f0f0}tr.win td{font-weight:800;background:#fff6dc}
  </style></head><body><h1>${esc(t.resultsSheet)}</h1><small>${esc(t.generatedAt)}: ${esc(new Date().toLocaleString())}</small>${tables}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export function ExportsTab({ s }: { s: Snapshot }) {
  const [error, setError] = useState('');
  return (
    <Section title={t.exports}>
      <p>{t.backupHelp}</p>
      <div className="action-row">
        {[
          ['/api/export', 'ashour-export.json', t.downloadJson],
          ['/api/results.csv', 'ashour-results.csv', t.downloadCsv],
          ['/api/audit.csv', 'ashour-audit.csv', t.downloadAudit],
          ['/api/backup', 'ashour-backup.sqlite', t.backup],
        ].map(([url, name, label]) => (
          <button
            key={url}
            onClick={() => void download(url, name).catch((e) => setError(String(e)))}
          >
            {label} ↓
          </button>
        ))}
        <button onClick={() => void printResults().catch((e) => setError(String(e)))}>
          {t.printResults}
        </button>
      </div>
      <p>{t.restoreHelp}</p>
      {error && <p role="alert">{error}</p>}
    </Section>
  );
}
