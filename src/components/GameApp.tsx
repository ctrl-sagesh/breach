'use client';

// Top-level screen router. Owns the save data, the current mission attempt, and transitions between screens.

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameSession } from '../engine/session';
import { rankForScore, scoreMission, type MissionResult } from '../engine/scoring';
import { DIFFICULTY, pointsFor } from '../engine/difficulty';
import { MISSIONS } from '../missions';
import { setAudioSettings, startAmbience } from '../lib/audio';
import { DEFAULT_SAVE, effectiveReduceMotion, loadSave, persistSave, type SaveData } from '../lib/save';
import { summarize } from '../lib/progress';
import Boot from './Boot';
import Briefing from './Briefing';
import Debrief from './Debrief';
import EndScreen from './EndScreen';
import Landing from './Landing';
import MainMenu from './MainMenu';
import MissionScreen from './MissionScreen';
import MissionSelect from './MissionSelect';
import Settings from './Settings';
import Transfer from './Transfer';

type Screen =
  | { name: 'boot' }
  | { name: 'landing' }
  | { name: 'menu' }
  | { name: 'select' }
  | { name: 'settings' }
  | { name: 'card' }
  | { name: 'briefing'; index: number }
  | { name: 'play'; index: number }
  | { name: 'transfer'; index: number; result: MissionResult }
  | { name: 'debrief'; index: number; result: MissionResult };

/** How long the CRT switch-off takes before the job board appears. */
const CRT_OFF_MS = 420;

export default function GameApp() {
  const [save, setSave] = useState<SaveData>(DEFAULT_SAVE);
  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [session, setSession] = useState<GameSession | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  const [wipeKey, setWipeKey] = useState(0);
  const [closing, setClosing] = useState(false);
  const [systemReduce, setSystemReduce] = useState(false);
  const lastScreen = useRef<Screen['name']>('boot');

  // Storage and matchMedia are read on the client only, so the static export pre-renders safely.
  useEffect(() => {
    setSave(loadSave());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setSystemReduce(mq.matches);
    const onChange = () => setSystemReduce(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = save.theme;
  }, [save.theme]);

  useEffect(() => {
    setAudioSettings({ volume: save.volume, sfx: save.sfx, music: save.music });
  }, [save.volume, save.sfx, save.music]);

  // On phones, the visual viewport shrinks when the keyboard opens. Size the app to it so the prompt stays visible.
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
    };
  }, []);

  // Glitch wipe on every screen change (not on first paint).
  useEffect(() => {
    if (lastScreen.current !== screen.name) {
      lastScreen.current = screen.name;
      setWipeKey((k) => k + 1);
    }
  }, [screen.name]);

  const reduceMotion = effectiveReduceMotion(save.motion, systemReduce);

  const update = useCallback((patch: Partial<SaveData>) => {
    setSave((prev) => {
      const next = { ...prev, ...patch };
      persistSave(next);
      return next;
    });
  }, []);

  const onBootDone = useCallback(() => setScreen({ name: 'landing' }), []);
  // Ambient hum starts on the first click or key. Browsers do not allow sound before that.
  const onFirstGesture = useCallback(() => startAmbience(), []);
  const toMenu = useCallback(() => setScreen({ name: 'menu' }), []);

  const beginAttempt = (index: number) => {
    const mission = MISSIONS[index];
    setSave((prev) => {
      const next = {
        ...prev,
        attempts: {
          ...prev.attempts,
          [prev.tier]: { ...prev.attempts[prev.tier], [mission.id]: (prev.attempts[prev.tier][mission.id] ?? 0) + 1 },
        },
      };
      persistSave(next);
      return next;
    });
    setSession(new GameSession(mission, { tier: save.tier }));
    setAttemptKey((k) => k + 1);
    setScreen({ name: 'play', index });
  };

  const onWon = (index: number, s: GameSession) => {
    const mission = MISSIONS[index];
    const base = scoreMission(s.elapsedSeconds(), s.trace, s.hintsUsed);
    const result: MissionResult = {
      score: base,
      points: pointsFor(base, s.tier),
      tier: s.tier,
      seconds: s.elapsedSeconds(),
      trace: s.trace,
      hints: s.hintsUsed,
      endingId: s.endingId ?? undefined,
    };
    setSave((prev) => {
      const tierResults = prev.completed[s.tier];
      const best = tierResults[mission.id];
      const keep = !best || result.points >= best.points ? result : best;
      const next = { ...prev, completed: { ...prev.completed, [s.tier]: { ...tierResults, [mission.id]: keep } } };
      persistSave(next);
      return next;
    });
    setSession(null);
    setScreen({ name: 'transfer', index, result });
  };

  const onTransferDone = useCallback(() => {
    setScreen((current) => (current.name === 'transfer' ? { name: 'debrief', index: current.index, result: current.result } : current));
  }, []);

  const abortMission = () => {
    if (reduceMotion) {
      setSession(null);
      setScreen({ name: 'select' });
      return;
    }
    // CRT switch-off, then the job board.
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setSession(null);
      setScreen({ name: 'select' });
    }, CRT_OFF_MS);
  };

  const resetProgress = () => {
    const next: SaveData = {
      ...DEFAULT_SAVE,
      completed: { easy: {}, medium: {}, hard: {} },
      attempts: { easy: {}, medium: {}, hard: {} },
      tier: save.tier,
      theme: save.theme,
      crt: save.crt,
      typing: save.typing,
      sfx: save.sfx,
      music: save.music,
      volume: save.volume,
      motion: save.motion,
    };
    persistSave(next);
    setSave(next);
  };

  const hasSave = summarize(save).completed > 0 || Object.keys(save.attempts[save.tier]).length > 0;

  let body: React.ReactNode = null;
  switch (screen.name) {
    case 'boot':
      body = <Boot onDone={onBootDone} />;
      break;
    case 'landing':
      body = (
        <Landing
          tier={save.tier}
          hasSave={hasSave}
          onStart={toMenu}
          onContinue={() => setScreen({ name: 'select' })}
          onFirstGesture={onFirstGesture}
        />
      );
      break;
    case 'menu':
      body = (
        <MainMenu
          save={save}
          onNavigate={(target) => {
            if (target === 'select') setScreen({ name: 'select' });
            else if (target === 'settings') setScreen({ name: 'settings' });
            else setScreen({ name: 'card' });
          }}
        />
      );
      break;
    case 'select':
      body = (
        <MissionSelect
          save={save}
          onTier={(tier) => update({ tier })}
          onOpen={(index) => setScreen({ name: 'briefing', index })}
          onBack={toMenu}
        />
      );
      break;
    case 'settings':
      body = <Settings save={save} onChange={update} onReset={resetProgress} onBack={toMenu} />;
      break;
    case 'card':
      body = <EndScreen save={save} onMenu={toMenu} />;
      break;
    case 'briefing': {
      const mission = MISSIONS[screen.index];
      body = (
        <Briefing
          mission={mission}
          tier={save.tier}
          attempts={save.attempts[save.tier][mission.id] ?? 0}
          completed={Boolean(save.completed[save.tier][mission.id])}
          onTier={(tier) => update({ tier })}
          onAccept={() => beginAttempt(screen.index)}
          onBack={() => setScreen({ name: 'select' })}
        />
      );
      break;
    }
    case 'play': {
      if (!session) break;
      const index = screen.index;
      body = (
        <div key={attemptKey} className={closing ? 'crt-off' : 'crt-on'}>
          <MissionScreen
            mission={MISSIONS[index]}
            session={session}
            attemptKey={attemptKey}
            speed={save.typing}
            reduceMotion={reduceMotion}
            onWon={(s) => onWon(index, s)}
            onRetry={() => beginAttempt(index)}
            onAbort={abortMission}
          />
        </div>
      );
      break;
    }
    case 'transfer':
      body = <Transfer reduceMotion={reduceMotion} onDone={onTransferDone} />;
      break;
    case 'debrief': {
      const index = screen.index;
      body = (
        <Debrief
          mission={MISSIONS[index]}
          result={screen.result}
          hintLimit={DIFFICULTY[screen.result.tier].hintLimit}
          rankName={rankForScore(screen.result.score).name}
          reduceMotion={reduceMotion}
          isLast={index === MISSIONS.length - 1}
          onNext={() => setScreen({ name: 'briefing', index: index + 1 })}
          onCampaignEnd={() => setScreen({ name: 'card' })}
          onMenu={toMenu}
        />
      );
      break;
    }
  }

  return (
    <div className={`relative min-h-dvh ${reduceMotion ? 'reduce-motion' : ''}`}>
      {body}
      {wipeKey > 0 && !reduceMotion ? <div key={wipeKey} className="wipe" aria-hidden="true" /> : null}
      {save.crt ? (
        <>
          <div className="crt-scanlines" aria-hidden="true" />
          <div className="crt-vignette" aria-hidden="true" />
          <div className="crt-flicker" aria-hidden="true" />
          <div className="crt-frame" aria-hidden="true" />
        </>
      ) : null}
    </div>
  );
}
