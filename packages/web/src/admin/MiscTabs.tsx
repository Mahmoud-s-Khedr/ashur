import React, { useState } from 'react';
import { ar as t } from '../../../shared/src/ar';
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

export function ExportsTab({ s }: { s: Snapshot }) {
  const [error, setError] = useState('');
  return (
    <Section title={t.exports}>
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
    </Section>
  );
}
