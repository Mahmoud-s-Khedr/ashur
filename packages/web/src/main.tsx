import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ar as t, ackLabels } from '../../shared/src/ar';
import type { Role } from '@ashour/shared';
import { useConnection, identity } from './ws';
import { useNow } from './lib/hooks';
import { useToasts } from './ui/parts';
import { Admin } from './admin/Admin';
import { Display } from './display/Display';
import { Player } from './play/Player';
import '@fontsource/tajawal/arabic-400.css';
import '@fontsource/tajawal/arabic-700.css';
import '@fontsource/tajawal/arabic-800.css';
import '@fontsource/tajawal/arabic-900.css';
import '@fontsource/tajawal/latin-400.css';
import '@fontsource/tajawal/latin-700.css';
import '@fontsource/tajawal/latin-800.css';
import '@fontsource/tajawal/latin-900.css';
import './styles/base.css';

function App() {
  const path = location.pathname;
  const role: Role = path === '/admin' ? 'admin' : path === '/play' ? 'team' : 'display';
  const [pin, setPin] = useState(sessionStorage.getItem('ashour-pin') ?? '');
  const [inputPin, setInputPin] = useState('');
  const { toasts, push } = useToasts(2600);
  const c = useConnection(role, pin, (type) => {
    const label = ackLabels[type];
    if (role === 'admin' && label) push(`✓ ${label}`, 'good');
  });
  const s = c.snapshot;
  const now = useNow(100);
  const serverNow = now + c.offset;

  useEffect(() => {
    document.documentElement.classList.toggle('display-page', path === '/display');
    document.documentElement.classList.toggle('play-page', path === '/play');
  }, [path]);

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
  const remaining = s ? (s.paused ? s.remainingMs : Math.max(0, s.endsAt - serverNow)) : 0;
  // Check-in problems are shown inside the keypad; only other errors use the global banner.
  const inlineError = role === 'team' && !s?.team;
  return (
    <div className={`app ${role}`}>
      <div className={`connection ${c.connected ? '' : 'disconnected'}`}>
        <span className="dot" />
        {c.connected ? t.online : t.offline}
      </div>
      {c.error && !inlineError && (
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
          now={serverNow}
          connected={c.connected}
          toasts={toasts}
        />
      ) : role === 'team' ? (
        <div className={c.connected ? '' : 'offline-lock'}>
          <Player
            s={s}
            send={c.send}
            remaining={remaining}
            now={serverNow}
            error={c.error}
            clearError={() => c.setError('')}
          />
        </div>
      ) : (
        <Display s={s} remaining={remaining} now={serverNow} />
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
