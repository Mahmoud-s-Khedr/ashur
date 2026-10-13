import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ar as t } from '../../../shared/src/ar';
import type { Send, Snapshot } from '../lib/types';
import { identity } from '../ws';
import { Section } from './common';

function Qr({ url }: { url: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0a1024', light: '#ffffff' } })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [url]);
  return <span className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const CHECKS = [
  'checkWired',
  'checkSleep',
  'checkFirewall',
  'checkSound',
  'checkFullscreen',
  'checkBank',
  'checkCodes',
  'checkBackup',
] as const;

export function SetupTab({ s, send }: { s: Snapshot; send: Send }) {
  const [net, setNet] = useState<{ port: number; addresses: string[] } | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ashour-checklist') ?? '{}');
    } catch {
      return {};
    }
  });
  useEffect(() => {
    fetch('/api/network', { headers: { Authorization: `Bearer ${identity('admin').token}` } })
      .then((r) => r.json())
      .then(setNet)
      .catch(() => setNet(null));
  }, []);
  const toggle = (k: string) => {
    const next = { ...done, [k]: !done[k] };
    setDone(next);
    try {
      localStorage.setItem('ashour-checklist', JSON.stringify(next));
    } catch {
      /* private mode: checklist simply is not remembered */
    }
  };
  const hosts = net?.addresses.length ? net.addresses : [location.hostname];
  const port = net?.port ?? Number(location.port || 80);
  const teamName = (id: number | null) => s.teams?.find((x) => x.id === id)?.name ?? '—';
  const now = Date.now();
  return (
    <>
      <Section title={t.connectDevices}>
        <p className="muted">{t.connectHint}</p>
        <div className="qr-grid">
          {hosts.flatMap((h) =>
            [
              ['/play', t.play],
              ['/display', t.display],
              ['/admin', t.admin],
            ].map(([path, name]) => {
              const url = `http://${h}:${port}${path}`;
              return (
                <article key={url} className="qr-card">
                  <Qr url={url} />
                  <b>{name}</b>
                  <code dir="ltr">{url}</code>
                </article>
              );
            }),
          )}
        </div>
      </Section>
      <div className="two-columns">
        <Section
          title={t.checklist}
          badge={`${CHECKS.filter((k) => done[k]).length}/${CHECKS.length}`}
        >
          <ul className="checklist">
            {CHECKS.map((k) => (
              <li key={k}>
                <label className={done[k] ? 'on' : ''}>
                  <input type="checkbox" checked={!!done[k]} onChange={() => toggle(k)} /> {t[k]}
                </label>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t.devicesTitle} badge={s.devices?.length}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.role}</th>
                  <th>{t.team}</th>
                  <th>{t.seat}</th>
                  <th>{t.status}</th>
                  <th>{t.rtt}</th>
                </tr>
              </thead>
              <tbody>
                {(s.devices ?? []).map((d) => {
                  const online = d.last_seen_at > now - 6000;
                  return (
                    <tr key={d.id}>
                      <td>{{ admin: t.admin, display: t.display, team: t.play }[d.role]}</td>
                      <td>{teamName(d.team_id)}</td>
                      <td className="num">{d.seat_no ?? '—'}</td>
                      <td>
                        <span className={`badge ${online ? 'green' : ''}`}>
                          {online ? t.online : t.offlineShort}
                        </span>
                      </td>
                      <td className="num">{d.rtt_ms ?? '—'} ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => {
              if (confirm(t.confirmReset)) send('devices.reset');
            }}
          >
            {t.resetDevices}
          </button>
        </Section>
      </div>
    </>
  );
}
