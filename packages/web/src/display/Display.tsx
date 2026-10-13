import React, { useEffect, useRef, useState } from 'react';
import { t, dir } from '../lib/i18n';
import type { Snapshot } from '../lib/types';
import { usePrevious, useTeamEffects, type DisplayEvent } from '../lib/hooks';
import { sfx } from '../lib/sfx';
import { ToastStack, useToasts, Of } from '../ui/parts';
import { Flame } from '../ui/icons';
import {
  BracketScene,
  Countdown,
  GoFlash,
  Intro,
  Lobby,
  Paused,
  Rules,
  stageName,
} from './scenesA';
import { Duel, Leaderboard, Race, RoundResults, TieAnnounce } from './scenesB';
import { Champion, LadderScene, QuestionScene, TeamTime, Wheel } from './scenesC';
import './display.css';

/** Mirrors the root font-size clamp in display.css so SVG rings scale with the screen. */
function useUnit() {
  const calc = () => Math.min(44, Math.max(12, 0.0055 * innerWidth + 0.0095 * innerHeight));
  const [u, setU] = useState(calc);
  useEffect(() => {
    const on = () => setU(calc());
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return u;
}

export function Display({ s, remaining, now }: { s: Snapshot; remaining: number; now: number }) {
  const unit = useUnit();
  const { toasts, push } = useToasts(3000, 2);
  const [soundOn, setSoundOn] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const wake = () => {
      setIdle(false);
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setIdle(true), 4000);
    };
    wake();
    addEventListener('mousemove', wake);
    addEventListener('keydown', wake);
    return () => {
      removeEventListener('mousemove', wake);
      removeEventListener('keydown', wake);
      clearTimeout(idleTimer.current);
    };
  }, []);

  const onEvent = (e: DisplayEvent) => {
    const live = s.settings.liveScores;
    if (e.kind === 'streak' && live) {
      if (![3, 5, 8, 10].includes(e.count)) return;
      push(
        <>
          <Flame /> {e.team.name} · <b className="num">{e.count}</b> {t.inARow}
        </>,
        'gold',
      );
      sfx.play('streak');
    } else if (e.kind === 'bonus' && live) {
      push(
        <>
          ⚡ {e.team.name} · {t.speedBonus} <b className="num">+{e.points}</b>
        </>,
        'gold',
      );
    } else if (e.kind === 'correct' || e.kind === 'wrong') {
      if (s.stage === 1 && !live) return;
      if (s.stage === 3) sfx.play(e.kind === 'correct' ? 'ladderUp' : 'ladderDown');
      else sfx.play(e.kind === 'correct' ? 'correct' : 'wrong');
    }
  };
  const fx = useTeamEffects(s, onEvent);

  // ----- phase / state sounds -----
  const phase = s.phase;
  const prevPhase = usePrevious(phase);
  useEffect(() => {
    if (phase === prevPhase) return;
    if (phase === 'RULES' || phase === 'HANDSHAKE' || phase === 'TIE_READY') sfx.play('whoosh');
    if (phase === 'RESULTS') sfx.play(s.stage === 3 ? 'fanfare' : 'win');
    if (phase === 'REVIEW' && s.tieIds.length > 1) sfx.play('alarm');
    if (phase === 'AUDIENCE') sfx.play('swoosh');
    if (phase === 'REVEAL') sfx.play('drum');
    if (prevPhase === 'COUNTDOWN' && phase !== 'COUNTDOWN') sfx.play('go');
  }, [phase]);
  const secs = Math.ceil(remaining / 1000);
  const prevSecs = usePrevious(secs);
  useEffect(() => {
    if (secs === prevSecs || s.paused) return;
    if (phase === 'COUNTDOWN' && secs > 0) sfx.play('beep');
    else if (['RUNNING', 'TIE_RUNNING'].includes(phase) && secs <= 10 && secs > 0)
      sfx.play('urgent');
    else if (['RUNNING', 'TIE_RUNNING'].includes(phase) && secs === 0 && (prevSecs ?? 1) > 0)
      sfx.play('timeUp');
  }, [secs]);
  const checkedCount = s.lineup.filter((x) => x.checkedIn).length;
  const readyCount = s.ready.length;
  const prevChecked = usePrevious(checkedCount);
  const prevReady = usePrevious(readyCount);
  useEffect(() => {
    if (!['HANDSHAKE', 'TIE_READY'].includes(phase)) return;
    if (checkedCount > prevChecked) sfx.play('pop', checkedCount);
    if (readyCount > prevReady) sfx.play('ready');
  }, [checkedCount, readyCount]);

  const enableSound = () => {
    if (soundOn) {
      sfx.disable();
      setSoundOn(false);
    } else if (sfx.enable()) {
      setSoundOn(true);
      sfx.play('go');
    }
  };

  // ----- scene routing -----
  const anyDone = s.rounds.some((r) => r.completed);
  let scene: React.ReactNode;
  // Scenes that must keep their DOM across phases (so animations continue) share a key.
  const sceneKey =
    s.scene !== 'auto'
      ? `scene-${s.scene}`
      : ['WHEEL', 'CARD_PICK'].includes(phase)
        ? `wheel-${s.roundKey}-${s.index}`
        : s.stage === 3 && ['RUNNING', 'AUDIENCE', 'REVEAL'].includes(phase)
          ? `ladder-${s.roundKey}`
          : s.stage === 2 && ['AUDIENCE', 'REVEAL'].includes(phase)
            ? `q-${s.roundKey}-${s.index}`
            : s.stage === 1 && ['RUNNING', 'REVIEW'].includes(phase) && s.tieIds.length < 2
              ? `race-${s.roundKey}`
              : `${s.roundKey}-${phase}`;
  if (s.scene === 'intro') scene = <Intro />;
  else if (s.scene === 'bracket') scene = <BracketScene s={s} />;
  else if (s.scene === 'leaderboard')
    scene = <Leaderboard s={s} fx={fx} remaining={remaining} unit={unit} />;
  else {
    switch (phase) {
      case 'IDLE':
        scene = anyDone ? <BracketScene s={s} /> : <Intro />;
        break;
      case 'RULES':
        scene = <Rules s={s} />;
        break;
      case 'HANDSHAKE':
        scene = <Lobby s={s} />;
        break;
      case 'TIE_READY':
        scene = <Lobby s={s} tie />;
        break;
      case 'COUNTDOWN':
        scene = <Countdown s={s} remaining={remaining} />;
        break;
      case 'RUNNING':
        scene =
          s.stage === 1 ? (
            <Race s={s} remaining={remaining} fx={fx} unit={unit} />
          ) : s.stage === 2 ? (
            <TeamTime s={s} remaining={remaining} unit={unit} fx={fx} />
          ) : (
            <LadderScene s={s} fx={fx} remaining={remaining} unit={unit} />
          );
        break;
      case 'WHEEL':
      case 'CARD_PICK':
        scene = <Wheel s={s} now={now} unit={unit} />;
        break;
      case 'AUDIENCE':
      case 'REVEAL':
        scene =
          s.stage === 3 ? (
            <LadderScene s={s} fx={fx} remaining={remaining} unit={unit} />
          ) : (
            <QuestionScene s={s} fx={fx} />
          );
        break;
      case 'REVIEW':
        scene =
          s.tieIds.length > 1 ? (
            <TieAnnounce s={s} />
          ) : s.stage === 3 ? (
            <LadderScene s={s} fx={fx} remaining={remaining} unit={unit} />
          ) : (
            <Race s={s} remaining={0} fx={fx} unit={unit} />
          );
        break;
      case 'TIE_RUNNING':
      case 'TIE_REVIEW':
        scene = <Duel s={s} remaining={remaining} unit={unit} />;
        break;
      case 'RESULTS':
        scene = s.stage === 3 ? <Champion s={s} fx={fx} /> : <RoundResults s={s} fx={fx} />;
        break;
      default:
        scene = <Intro />;
    }
  }
  const qualified = s.rounds.filter((r) => r.stage === 1 && r.completed).length;
  return (
    <main className={`display-root ${idle ? 'idle' : ''}`} data-stage={s.stage} dir={dir}>
      <div className="aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="d-top">
        <a className="brand" href="/">
          <span className="brandmark">ع</span>
          <span>{t.title}</span>
        </a>
        <div className="d-crumbs">
          <span className="crumb stage">{stageName(s.stage)}</span>
          {s.stage !== 3 && (
            <span className="crumb">
              {s.stage === 2 ? t.groupLabel : t.round} <b className="num">{s.seq}</b>
            </span>
          )}
          <span className="crumb">
            {t.qualifiedCount} <Of a={qualified} b={12} />
          </span>
        </div>
        <div className="d-tools">
          <button onClick={() => void document.documentElement.requestFullscreen?.()}>
            {t.fullScreen}
          </button>
          <button className={soundOn ? 'selected' : ''} onClick={enableSound}>
            {soundOn ? t.soundOn : t.enableSound}
          </button>
        </div>
      </header>
      <div className="d-stage" key={sceneKey}>
        {scene}
      </div>
      <GoFlash phase={phase} stage={s.stage} />
      {s.paused && <Paused />}
      <ToastStack toasts={toasts} variant="display" />
    </main>
  );
}
