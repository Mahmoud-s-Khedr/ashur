import React, { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import type { Settings } from '@ashour/shared';
import type { Send, Snapshot } from '../lib/types';
import { Section } from './common';

type Draft = Record<string, any>;

function Num({
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
}) {
  return (
    <label>
      {label}
      <span className="with-suffix">
        <input
          type="number"
          min={min}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
      {label}
    </label>
  );
}

export function SettingsTab({ s, send }: { s: Snapshot; send: Send }) {
  const c = s.settings;
  const [d, setD] = useState<Draft>({});
  const [json, setJson] = useState(JSON.stringify(s.settings, null, 2));
  const [error, setError] = useState('');
  const editable = ['IDLE', 'RESULTS'].includes(s.phase);
  useEffect(() => setJson(JSON.stringify(s.settings, null, 2)), [s.version]);
  const v = <K extends keyof Settings>(k: K): Settings[K] => (k in d ? d[k] : c[k]);
  const set = (k: string, val: unknown) => setD((x) => ({ ...x, [k]: val }));
  const tiers = v('speedTiers');
  const mapping = v('stage2Mapping');
  const dirty = Object.keys(d).length > 0;
  return (
    <>
      <div className={`notice ${editable ? '' : 'warning'}`}>
        {editable ? t.settingsHint : t.settingsLocked}
      </div>
      <fieldset disabled={!editable} className="root-fieldset">
        <div className="settings-grid">
          <Section title={t.timing}>
            <div className="form-grid">
              <Num
                label={t.blitzTime}
                suffix={t.secondsShort}
                value={v('blitzMs') / 1000}
                onChange={(x) => set('blitzMs', x * 1000)}
              />
              <Num
                label={t.questionTime}
                suffix={t.secondsShort}
                value={v('questionMs') / 1000}
                onChange={(x) => set('questionMs', x * 1000)}
              />
              <Num
                label={t.countdownTime}
                suffix={t.secondsShort}
                value={v('countdownMs') / 1000}
                onChange={(x) => set('countdownMs', x * 1000)}
              />
              <Num
                label={t.autoDelay}
                suffix={t.secondsShort}
                value={v('autoDelayMs') / 1000}
                onChange={(x) => set('autoDelayMs', x * 1000)}
              />
              <Num
                label={t.graceMs}
                suffix="ms"
                value={v('graceMs')}
                onChange={(x) => set('graceMs', x)}
              />
            </div>
          </Section>
          <Section title={t.blitz}>
            <div className="form-grid">
              <Num label={t.easy} value={v('easyPoints')} onChange={(x) => set('easyPoints', x)} />
              <Num
                label={t.medium}
                value={v('mediumPoints')}
                onChange={(x) => set('mediumPoints', x)}
              />
              <Num label={t.hard} value={v('hardPoints')} onChange={(x) => set('hardPoints', x)} />
              <Num
                label={`${t.joker} +`}
                value={v('jokerCorrect')}
                onChange={(x) => set('jokerCorrect', x)}
              />
              <Num
                label={`${t.joker} −`}
                min={-1000}
                value={v('jokerWrong')}
                onChange={(x) => set('jokerWrong', x)}
              />
              <Num
                label={t.jokerPosition}
                min={1}
                value={v('jokerPosition')}
                onChange={(x) => set('jokerPosition', x)}
              />
              <Num
                label={t.unansweredPenalty}
                min={-1000}
                value={v('blitzUnansweredPenalty')}
                onChange={(x) => set('blitzUnansweredPenalty', x)}
              />
            </div>
            <h3>{t.speedBonus}</h3>
            <div className="form-grid">
              {tiers.map((tier, i) => (
                <Num
                  key={tier.untilMs}
                  label={`${t.withinWord} ${tier.untilMs / 1000} ${t.secondsShort}`}
                  value={tier.points}
                  onChange={(x) =>
                    set(
                      'speedTiers',
                      tiers.map((y, k) => (k === i ? { ...y, points: x } : y)),
                    )
                  }
                />
              ))}
            </div>
          </Section>
          <Section title={t.gambler}>
            <div className="form-grid">
              <Num
                label={t.cardReuseLimit}
                value={v('cardReuseLimit')}
                onChange={(x) => set('cardReuseLimit', x)}
              />
              <Num
                label={t.initialBalance}
                min={-1000}
                value={v('gamblerInitial')}
                onChange={(x) => set('gamblerInitial', x)}
              />
            </div>
            <Toggle
              label={t.unansweredWrong}
              value={v('unansweredWrong')}
              onChange={(x) => set('unansweredWrong', x)}
            />
            <h3>{t.stage2Mapping}</h3>
            <p className="muted">{t.stage2MappingHint}</p>
            <div className="mapping">
              {mapping.map((group, gi) => (
                <div key={gi} className="map-group">
                  <b>
                    {t.groupLabel} {gi + 1}
                  </b>
                  {group.map((n, k) => (
                    <select
                      key={k}
                      value={n}
                      onChange={(e) => {
                        const next = mapping.map((g) => [...g]);
                        const to = Number(e.target.value);
                        // swap so every round still appears exactly once
                        for (const g of next) {
                          const at = g.indexOf(to);
                          if (at >= 0) g[at] = n;
                        }
                        next[gi][k] = to;
                        set('stage2Mapping', next);
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((r) => (
                        <option key={r} value={r}>
                          {t.round} {r}
                        </option>
                      ))}
                    </select>
                  ))}
                </div>
              ))}
            </div>
          </Section>
          <Section title={t.climb}>
            <div className="form-grid">
              <Num
                label={t.climbUp}
                min={1}
                value={v('climbUp')}
                onChange={(x) => set('climbUp', x)}
              />
              <Num
                label={t.climbDown}
                min={1}
                value={v('climbDown')}
                onChange={(x) => set('climbDown', x)}
              />
              <Num
                label={t.ladderTop}
                min={1}
                value={v('ladderTop')}
                onChange={(x) => set('ladderTop', x)}
              />
            </div>
          </Section>
          <Section title={t.experience}>
            <Toggle label={t.soundSetting} value={v('sound')} onChange={(x) => set('sound', x)} />
            <Toggle
              label={t.liveScoresSetting}
              value={v('liveScores')}
              onChange={(x) => set('liveScores', x)}
            />
            <p className="muted">{t.liveScoresHint}</p>
          </Section>
        </div>
        <div className="save-bar">
          {error && <span role="alert">{error}</span>}
          <button disabled={!dirty} onClick={() => setD({})}>
            {t.discard}
          </button>
          <button
            className="primary"
            disabled={!dirty}
            onClick={() => {
              send('settings.update', { settings: d });
              setD({});
            }}
          >
            {t.save}
          </button>
        </div>
      </fieldset>
      <details className="panel advanced">
        <summary>{t.advancedJson}</summary>
        <p className="muted">{t.configurationHelp}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              send('settings.update', { settings: JSON.parse(json) });
              setError('');
            } catch (err) {
              setError(String(err));
            }
          }}
        >
          <textarea
            className="json-editor num"
            dir="ltr"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <button disabled={!editable}>{t.save}</button>
        </form>
      </details>
    </>
  );
}
