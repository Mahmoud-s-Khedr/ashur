import React, { useState } from 'react';
import { ar as t, phaseNames } from '../../../shared/src/ar';
import type { Bulk, Send, Snapshot } from '../lib/types';
import { ToastStack, TimerRing } from '../ui/parts';
import { stageName } from './common';
import { ControlTab } from './ControlTab';
import { BracketTab } from './BracketTab';
import { TeamsTab } from './TeamsTab';
import { QuestionsTab } from './QuestionsTab';
import { SettingsTab } from './SettingsTab';
import { SetupTab } from './SetupTab';
import { AuditTab, ExportsTab } from './MiscTabs';
import type { Toast } from '../ui/parts';
import './admin.css';

const TABS = [
  'control',
  'bracket',
  'teams',
  'questions',
  'setup',
  'audit',
  'settings',
  'exports',
] as const;
type Tab = (typeof TABS)[number];
const ICONS: Record<Tab, string> = {
  control: '◉',
  bracket: '⛓',
  teams: '⚑',
  questions: '❓',
  setup: '⚙',
  audit: '☰',
  settings: '✦',
  exports: '⇩',
};

export function Admin({
  s,
  send,
  bulk,
  remaining,
  now,
  connected,
  toasts,
}: {
  s: Snapshot;
  send: Send;
  bulk: Bulk;
  remaining: number;
  now: number;
  connected: boolean;
  toasts: Toast[];
}) {
  const [tab, setTab] = useState<Tab>(
    () => (sessionStorage.getItem('ashour-tab') as Tab) || 'control',
  );
  const go = (next: Tab) => {
    setTab(next);
    try {
      sessionStorage.setItem('ashour-tab', next);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="admin-shell" data-stage={s.stage}>
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
          {TABS.map((key) => (
            <button className={tab === key ? 'selected' : ''} onClick={() => go(key)} key={key}>
              <span className="ico">{ICONS[key]}</span>
              {t[key]}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="chip">
            {stageName(s.stage)}
            {s.stage !== 3 && (
              <>
                {' · '}
                <b className="num">{s.seq}</b>
              </>
            )}
          </span>
          <span className="chip live">{phaseNames[s.phase]}</span>
        </div>
        <div className="sidebar-footer">
          <a href="/display" target="_blank" rel="noreferrer">
            {t.display} ↗
          </a>
          <a href="/play" target="_blank" rel="noreferrer">
            {t.play} ↗
          </a>
          <small>
            {t.local} · v<span className="num">{s.version}</span>
          </small>
        </div>
      </aside>
      <main className="admin-main">
        <header>
          <div>
            <p className="eyebrow">
              {t.local} / {t.stage} <span className="num">0{s.stage}</span>
            </p>
            <h1>{t[tab]}</h1>
          </div>
          <div className="header-controls">
            <label className="auto-select">
              <span>{t.automation}</span>
              <select
                aria-label={t.automatic}
                value={s.settings.automation}
                onChange={(e) => send('automation.set', { mode: e.target.value })}
              >
                <option value="auto">{t.automatic}</option>
                <option value="assisted">{t.assisted}</option>
                <option value="manual">{t.manual}</option>
              </select>
            </label>
            <span className={`phase ${s.paused ? 'paused' : ''}`}>
              {s.paused ? t.paused : phaseNames[s.phase]}
            </span>
          </div>
        </header>
        {s.autoAt > 0 && (
          <div className="auto-banner">
            <TimerRing
              remaining={Math.max(0, s.autoAt - now)}
              total={s.settings.autoDelayMs}
              size={44}
              warnAt={0}
            >
              <b className="num">{Math.max(0, Math.ceil((s.autoAt - now) / 1000))}</b>
            </TimerRing>
            <span>
              {t.autoIn} <b className="num">{Math.max(0, Math.ceil((s.autoAt - now) / 1000))}</b>{' '}
              {t.seconds} · <code>{s.autoAction}</code>
            </span>
            <button onClick={() => send('auto.cancel')}>{t.cancelAuto}</button>
          </div>
        )}
        <div className={!connected ? 'controls-offline' : ''}>
          <fieldset disabled={!connected} className="root-fieldset">
            {tab === 'control' && <ControlTab s={s} send={send} remaining={remaining} />}
            {tab === 'bracket' && <BracketTab s={s} send={send} />}
            {tab === 'teams' && <TeamsTab s={s} send={send} bulk={bulk} />}
            {tab === 'questions' && <QuestionsTab s={s} send={send} bulk={bulk} />}
            {tab === 'setup' && <SetupTab s={s} send={send} />}
            {tab === 'audit' && <AuditTab rows={s.audit ?? []} />}
            {tab === 'settings' && <SettingsTab s={s} send={send} />}
            {tab === 'exports' && <ExportsTab s={s} />}
          </fieldset>
        </div>
        <footer>
          ASHOUR · {t.offlineHint} <span className="num">v1 / {s.version}</span>
        </footer>
      </main>
      <ToastStack toasts={toasts} />
    </div>
  );
}
