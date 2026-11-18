'use client';

// Top-level screen router. Owns the save data, the current attempt, the run log that feeds the leaderboard and the ops
// log, achievements, cloud sync, and transitions between screens.

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { GameSession } from '../engine/session';
import { rankForScore, scoreMission, type MissionResult } from '../engine/scoring';
import { DIFFICULTY, pointsFor } from '../engine/difficulty';
import type { MissionDef, Tier } from '../engine/types';
import type { RunCommand } from '../engine/replay';
import { MISSIONS } from '../missions';
import { play, setAmbienceActive, setAudioSettings, setMusicTrack, setTension, startMusic } from '../lib/audio';
import { setHapticsEnabled } from '../lib/haptics';
import { DEFAULT_SAVE, effectiveReduceMotion, loadSave, persistSave, type SaveData } from '../lib/save';
import { campaignDone, factsFromWin, newlyUnlocked, type AchievementDef } from '../lib/achievements';
import { dailyMission, dailyNumber, isHardFriday, streakFor, utcDate } from '../lib/daily';
import { realWorldFor } from '../lib/realworld';
import { trackDailyPlayed, trackMissionCleared, trackMissionStarted, trackMissionTraced, trackRestoreUsed } from '../lib/analytics';
import { buildSubmission, getPlayerId, type Submission } from '../lib/leaderboard';
import { debounce, syncSave, type RestoreResult } from '../lib/cloud';
import { addAttempt, type AttemptRecord, type Outcome } from '../lib/history';
import { mergeSaves } from '../lib/merge';
import { summarize } from '../lib/progress';
import type { DailyStats, ShareFacts } from '../lib/share';
import Achievements, { AchievementToast } from './Achievements';
import Boot from './Boot';
import BoardScreen from './BoardScreen';
import Briefing from './Briefing';
import Debrief from './Debrief';
import DailyScreen from './DailyScreen';
import EndScreen from './EndScreen';
import Landing from './Landing';
import MainMenu from './MainMenu';
import MissionScreen from './MissionScreen';
import MissionSelect from './MissionSelect';
import About from './About';
import OpsLog from './OpsLog';
import Privacy from './Privacy';
import Profile from './Profile';
import Register from './Register';
import Settings from './Settings';
import Transfer from './Transfer';

type Screen =
  | { name: 'boot' }
  | { name: 'landing' }
  | { name: 'register' }
  | { name: 'menu' }
  | { name: 'select' }
  | { name: 'settings' }
  | { name: 'card' }
  | { name: 'daily' }
  | { name: 'board' }
  | { name: 'achievements' }
  | { name: 'history' }
  | { name: 'profile' }
  /** Reachable from the landing page (before a handle exists) and from Settings, so Back needs to know which. */
  | { name: 'privacy'; from: 'landing' | 'settings' }
  | { name: 'about'; from: 'landing' | 'settings' }
  | { name: 'briefing'; index: number }
  /** `date` is set for the daily job, which is generated from the date rather than taken from the list. */
  | { name: 'play'; index: number; date?: string }
  | { name: 'transfer'; index: number; result: MissionResult; date?: string }
  | { name: 'debrief'; index: number; result: MissionResult; date?: string };

/** How long the CRT switch-off takes before the job board appears. */
const CRT_OFF_MS = 420;
/** Sync waits this long after the last change, so several changes send one request. */
const SYNC_DEBOUNCE_MS = 4000;

/** What a finished attempt sends to the board, kept until the debrief posts it. */
interface LastRun {
  missionId: string;
  tier: Tier;
  scope: 'campaign' | 'daily';
  date?: string;
  commands: RunCommand[];
}

function missionFor(index: number, date?: string): MissionDef {
  return date ? dailyMission(date) : MISSIONS[index];
}

function newAttemptId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True for a visitor who has never started or finished anything — the one who gets the quick-start path and skips the boot sequence. */
function isFreshVisitor(s: SaveData): boolean {
  return (
    !s.nickname &&
    !s.registerSkipped &&
    s.history.length === 0 &&
    Object.values(s.completed).every((t) => Object.keys(t).length === 0) &&
    Object.values(s.attempts).every((t) => Object.keys(t).length === 0)
  );
}

export default function GameApp() {
  const [save, setSave] = useState<SaveData>(DEFAULT_SAVE);
  const [screen, setScreen] = useState<Screen>({ name: 'boot' });
  const [session, setSession] = useState<GameSession | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  const [wipeKey, setWipeKey] = useState(0);
  const [closing, setClosing] = useState(false);
  const [systemReduce, setSystemReduce] = useState(false);
  const [toast, setToast] = useState<AchievementDef[]>([]);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [afterRegister, setAfterRegister] = useState<Screen | null>(null);
  const lastScreen = useRef<Screen['name']>('boot');
  /** Set on the first-ever win, when there is no handle yet, so the next debrief exit detours through Register. */
  const firstWinRegister = useRef(false);
  /** The attempt's command log, timed from the moment the session opened. Replayed by the server and the viewer. */
  const run = useRef<{ startedAt: number; commands: RunCommand[]; recorded: boolean }>({ startedAt: 0, commands: [], recorded: false });
  /** Set when a save change came from a sync merge, so the change does not send another sync. */
  const fromSync = useRef(false);

  // Storage and matchMedia are read on the client only, so the static export pre-renders safely.
  useEffect(() => {
    const loaded = loadSave();
    setSave(loaded);
    // A returning player has already seen the boot sequence. Go straight to the landing page.
    if (!isFreshVisitor(loaded)) setScreen({ name: 'landing' });
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
    setAudioSettings({
      volume: save.volume,
      sfx: save.sfx,
      music: save.music,
      musicVolume: save.musicVolume,
      track: save.track,
      keySounds: save.keySounds,
      keySoundsVolume: save.keySoundsVolume,
    });
  }, [save.volume, save.sfx, save.music, save.musicVolume, save.track, save.keySounds, save.keySoundsVolume]);

  useEffect(() => {
    setHapticsEnabled(save.keyHaptics);
  }, [save.keyHaptics]);

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
      play('transition');
    }
  }, [screen.name]);

  // Menus and the landing page are calm. The soundtrack only follows the trace inside a mission.
  useEffect(() => {
    if (screen.name !== 'play') setTension(0);
    setAmbienceActive(screen.name === 'play');
  }, [screen.name]);

  const reduceMotion = effectiveReduceMotion(save.motion, systemReduce);

  const update = useCallback((patch: Partial<SaveData>) => {
    setSave((prev) => {
      const next = { ...prev, ...patch };
      persistSave(next);
      return next;
    });
  }, []);

  // Cloud sync. Local saves are the source of truth; a sync sends the local copy and takes back the merged one.
  const syncNow = async (snapshot: SaveData) => {
    if (!snapshot.playerId || !snapshot.syncToken) return;
    const r = await syncSave(snapshot.playerId, snapshot.syncToken, snapshot);
    if (!r.ok) return;
    fromSync.current = true;
    setSave((prev) => {
      const merged = mergeSaves(prev, r.value.save);
      persistSave(merged);
      return merged;
    });
  };
  const scheduleSync = useMemo(() => debounce((s: SaveData) => void syncNow(s), SYNC_DEBOUNCE_MS), []);

  useEffect(() => {
    if (fromSync.current) {
      fromSync.current = false;
      return;
    }
    if (save.syncToken) scheduleSync(save);
    // Sync follows every save change, except the ones a sync itself made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save]);

  useEffect(() => {
    setMusicTrack(save.track);
  }, [save.track]);

  const onBootDone = useCallback(() => setScreen({ name: 'landing' }), []);
  // Ambient music starts on the first click or key. Browsers do not allow sound before that.
  const onFirstGesture = useCallback(() => startMusic(), []);
  const toMenu = useCallback(() => setScreen({ name: 'menu' }), []);
  const toDaily = useCallback(() => setScreen({ name: 'daily' }), []);

  const setTier = (next: Tier) => update({ tier: next });

  const muted = !save.sfx && !save.music;
  const toggleMute = () => update({ sfx: muted, music: muted });

  /** A restore brings the account's identity and the cloud copy onto this device. Device settings stay. */
  const adoptRestored = (r: RestoreResult) => {
    trackRestoreUsed();
    fromSync.current = false;
    setSave((prev) => {
      const base: SaveData = { ...prev, playerId: r.playerId, nickname: r.nickname, syncToken: r.syncToken, recoveryKey: undefined, registerSkipped: false };
      const merged = r.save ? mergeSaves(base, r.save) : base;
      persistSave(merged);
      return merged;
    });
  };

  /** Sudo tries are a lifetime counter. Add this attempt's tries when the attempt ends. */
  const flushSudo = (s: GameSession | null) => {
    if (!s || s.sudoTries === 0) return;
    setSave((prev) => {
      const next = { ...prev, counters: { ...prev.counters, sudoTries: prev.counters.sudoTries + s.sudoTries } };
      persistSave(next);
      return next;
    });
  };

  const openSession = (mission: MissionDef, sessionTier: Tier, opts?: { quickBriefing?: boolean }) => {
    run.current = { startedAt: Date.now(), commands: [], recorded: false };
    const s = new GameSession(mission, { tier: sessionTier, quickBriefing: opts?.quickBriefing });
    setSession(s);
    setAttemptKey((k) => k + 1);
    return s;
  };

  /** "Start hacking" for a visitor who has never played: straight into job 1 on Easy, briefing printed in the terminal. */
  const quickStartFirstMission = () => {
    flushSudo(session);
    const mission = MISSIONS[0];
    setSave((prev) => {
      const next: SaveData = {
        ...prev,
        tier: 'easy',
        attempts: { ...prev.attempts, easy: { ...prev.attempts.easy, [mission.id]: (prev.attempts.easy[mission.id] ?? 0) + 1 } },
      };
      persistSave(next);
      return next;
    });
    openSession(mission, 'easy', { quickBriefing: true });
    trackMissionStarted('easy', 'campaign');
    setScreen({ name: 'play', index: 0 });
  };

  /** Where a debrief exit goes, unless this was the first-ever win, which detours through Register first. */
  const continueAfter = (target: Screen) => {
    if (firstWinRegister.current) {
      firstWinRegister.current = false;
      setAfterRegister(target);
      setScreen({ name: 'register' });
      return;
    }
    setScreen(target);
  };

  /** An attempt that ended without a win (trace, clock or abort) goes into the ops log once. */
  const logAttempt = (s: GameSession, mission: MissionDef, date: string | undefined, outcome: Outcome) => {
    if (run.current.recorded) return;
    run.current.recorded = true;
    const attemptNo = save.attempts[s.tier][mission.id] ?? 1;
    const record: AttemptRecord = {
      id: newAttemptId(),
      at: new Date().toISOString(),
      missionId: mission.id,
      scope: date ? 'daily' : 'campaign',
      tier: s.tier,
      attemptNo,
      outcome,
      score: 0,
      points: 0,
      seconds: s.elapsedSeconds(),
      trace: s.trace,
      hints: s.hintsUsed,
      commands: [...run.current.commands],
    };
    update({ history: addAttempt(save.history, record) });
  };

  const beginAttempt = (index: number) => {
    flushSudo(session);
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
    openSession(mission, save.tier);
    trackMissionStarted(save.tier, 'campaign');
    setScreen({ name: 'play', index });
  };

  /** One attempt per day per tier. The daily screen blocks a second start. */
  const beginDaily = () => {
    flushSudo(session);
    const date = utcDate();
    const mission = dailyMission(date);
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
    openSession(mission, save.tier);
    trackMissionStarted(save.tier, 'daily');
    trackDailyPlayed(save.tier);
    setScreen({ name: 'play', index: -1, date });
  };

  const onCommand = useCallback((raw: string) => {
    run.current.commands.push({ t: Math.max(0, Date.now() - run.current.startedAt), cmd: raw });
  }, []);

  const onWon = (index: number, s: GameSession, date?: string) => {
    const mission = missionFor(index, date);
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
    const now = new Date();
    const today = utcDate(now);
    const isDaily = Boolean(date);
    trackMissionCleared(s.tier, isDaily ? 'daily' : 'campaign');

    // First win ever, no handle yet: nudge registration once the debrief is done, instead of blocking play with it up front.
    const everCompleted = Object.values(save.completed).some((t) => Object.keys(t).length > 0);
    if (!save.nickname && !save.registerSkipped && !everCompleted) firstWinRegister.current = true;

    // Next save state, computed once so achievements and the ops log read the same numbers that get saved.
    const tierResults = save.completed[s.tier];
    const best = tierResults[mission.id];
    const keep = !best || result.points >= best.points ? result : best;
    const completed = isDaily ? save.completed : { ...save.completed, [s.tier]: { ...tierResults, [mission.id]: keep } };
    const dailies = isDaily ? { ...save.dailies, [today]: { ...save.dailies[today], [s.tier]: result } } : save.dailies;
    const sudoTotal = save.counters.sudoTries + s.sudoTries;
    const doneDates = Object.keys(dailies).filter((d) => Object.values(dailies[d] ?? {}).some(Boolean));
    const streak = streakFor(doneDates, today);
    const campaignDoneOnTier = !isDaily && campaignDone(completed[s.tier]);

    const facts = factsFromWin(s, { score: base, isDaily, campaignDoneOnTier, streak, sudoTotal, now });
    const unlocked = newlyUnlocked(facts, save.achievements);

    const record: AttemptRecord = {
      id: newAttemptId(),
      at: now.toISOString(),
      missionId: mission.id,
      scope: isDaily ? 'daily' : 'campaign',
      tier: s.tier,
      attemptNo: save.attempts[s.tier][mission.id] ?? 1,
      outcome: 'cleared',
      score: base,
      points: result.points,
      seconds: s.elapsedSeconds(),
      trace: s.trace,
      hints: s.hintsUsed,
      commands: [...run.current.commands],
    };
    run.current.recorded = true;

    const next: SaveData = {
      ...save,
      completed,
      dailies,
      counters: { ...save.counters, sudoTries: sudoTotal },
      achievements: [...save.achievements, ...unlocked.map((a) => a.id)],
      history: addAttempt(save.history, record),
    };
    persistSave(next);
    setSave(next);
    if (unlocked.length) setToast(unlocked);

    setLastRun({ missionId: mission.id, tier: s.tier, scope: isDaily ? 'daily' : 'campaign', date, commands: [...run.current.commands] });
    setSession(null);
    setScreen({ name: 'transfer', index, result, date });
  };

  const onFailed = (index: number, s: GameSession, date?: string) => {
    const outcome = s.failReason === 'time' ? 'timed-out' : 'traced';
    if (outcome === 'traced') trackMissionTraced(s.tier, date ? 'daily' : 'campaign');
    logAttempt(s, missionFor(index, date), date, outcome);
  };

  const onTransferDone = useCallback(() => {
    setScreen((current) =>
      current.name === 'transfer' ? { name: 'debrief', index: current.index, result: current.result, date: current.date } : current,
    );
  }, []);

  const abortMission = () => {
    flushSudo(session);
    const back: Screen = screen.name === 'play' && screen.date ? { name: 'daily' } : { name: 'select' };
    if (session && !session.finished) logAttempt(session, missionFor(screen.name === 'play' ? screen.index : -1, screen.name === 'play' ? screen.date : undefined), screen.name === 'play' ? screen.date : undefined, 'aborted');
    if (reduceMotion) {
      setSession(null);
      setScreen(back);
      return;
    }
    // CRT switch-off, then the job board.
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setSession(null);
      setScreen(back);
    }, CRT_OFF_MS);
  };

  const resetProgress = () => {
    // A reset is local. The device is signed out of its cloud copy, so the old progress does not sync back.
    // The account can still be restored with its recovery key.
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
      musicVolume: save.musicVolume,
      track: save.track,
      motion: save.motion,
      nickname: save.nickname,
      registerSkipped: save.registerSkipped,
    };
    persistSave(next);
    setSave(next);
  };

  const doneDates = Object.keys(save.dailies).filter((d) => Object.values(save.dailies[d] ?? {}).some(Boolean));
  const dailyStreak = streakFor(doneDates, utcDate());
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
          dailyStreak={dailyStreak}
          muted={muted}
          onToggleMute={toggleMute}
          onRestored={adoptRestored}
          onStart={() => {
            if (isFreshVisitor(save)) {
              quickStartFirstMission();
              return;
            }
            setScreen(!save.nickname && !save.registerSkipped ? { name: 'register' } : { name: 'menu' });
          }}
          onContinue={() => setScreen({ name: 'select' })}
          onDaily={toDaily}
          onPrivacy={() => setScreen({ name: 'privacy', from: 'landing' })}
          onAbout={() => setScreen({ name: 'about', from: 'landing' })}
          onFirstGesture={onFirstGesture}
        />
      );
      break;
    case 'register': {
      const leaveRegister = () => {
        const target = afterRegister ?? { name: 'menu' as const };
        setAfterRegister(null);
        setScreen(target);
      };
      body = (
        <Register
          save={save}
          celebratory={afterRegister !== null}
          onRegistered={(patch) => update(patch)}
          onDone={leaveRegister}
          onSkip={() => {
            update({ registerSkipped: true });
            leaveRegister();
          }}
        />
      );
      break;
    }
    case 'menu':
      body = (
        <MainMenu
          save={save}
          onNavigate={(target) => {
            if (target === 'select') setScreen({ name: 'select' });
            else if (target === 'settings') setScreen({ name: 'settings' });
            else if (target === 'daily') setScreen({ name: 'daily' });
            else if (target === 'board') setScreen({ name: 'board' });
            else if (target === 'achievements') setScreen({ name: 'achievements' });
            else if (target === 'history') setScreen({ name: 'history' });
            else if (target === 'profile') setScreen({ name: 'profile' });
            else setScreen({ name: 'card' });
          }}
        />
      );
      break;
    case 'select':
      body = <MissionSelect save={save} onTier={setTier} onOpen={(index) => setScreen({ name: 'briefing', index })} onBack={toMenu} />;
      break;
    case 'daily':
      body = <DailyScreen save={save} tier={save.tier} onTier={setTier} onStart={beginDaily} onBoard={() => setScreen({ name: 'board' })} onBack={toMenu} />;
      break;
    case 'board':
      body = <BoardScreen tier={save.tier} onTier={setTier} onBack={toMenu} />;
      break;
    case 'achievements':
      body = <Achievements unlocked={save.achievements} onBack={toMenu} />;
      break;
    case 'history':
      body = <OpsLog save={save} tier={save.tier} onTier={setTier} onBack={toMenu} />;
      break;
    case 'profile':
      body = <Profile save={save} onBack={toMenu} />;
      break;
    case 'settings':
      body = (
        <Settings
          save={save}
          onChange={update}
          onReset={resetProgress}
          onBack={toMenu}
          onRestored={adoptRestored}
          onPrivacy={() => setScreen({ name: 'privacy', from: 'settings' })}
          onAbout={() => setScreen({ name: 'about', from: 'settings' })}
        />
      );
      break;
    case 'privacy':
      body = <Privacy onBack={() => setScreen(screen.from === 'landing' ? { name: 'landing' } : { name: 'settings' })} />;
      break;
    case 'about':
      body = <About onBack={() => setScreen(screen.from === 'landing' ? { name: 'landing' } : { name: 'settings' })} />;
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
          onTier={setTier}
          onAccept={() => beginAttempt(screen.index)}
          onBack={() => setScreen({ name: 'select' })}
        />
      );
      break;
    }
    case 'play': {
      if (!session) break;
      const index = screen.index;
      const date = screen.date;
      const mission = missionFor(index, date);
      body = (
        <div key={attemptKey} className={closing ? 'crt-off' : 'crt-on'}>
          <MissionScreen
            mission={mission}
            session={session}
            attemptKey={attemptKey}
            speed={save.typing}
            reduceMotion={reduceMotion}
            onWon={(s) => onWon(index, s, date)}
            onRetry={() => (date ? toDaily() : beginAttempt(index))}
            onAbort={abortMission}
            onCommand={onCommand}
            onFailed={(s) => onFailed(index, s, date)}
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
      const date = screen.date;
      const mission = missionFor(index, date);
      const result = screen.result;
      const rank = rankForScore(result.score).name;
      const share: ShareFacts = date
        ? { label: `DAILY ${dailyNumber(date)}`, tier: DIFFICULTY[result.tier].label, rank, score: result.points, streak: streakFor(doneDates, date) }
        : { label: `JOB ${String(mission.number).padStart(2, '0')} · ${mission.codename}`, tier: DIFFICULTY[result.tier].label, rank, score: result.points };
      const daily: DailyStats | undefined = date
        ? {
            dailyNum: dailyNumber(date),
            tier: isHardFriday(date) ? `${DIFFICULTY[result.tier].label} · Hard Friday` : DIFFICULTY[result.tier].label,
            seconds: result.seconds,
            trace: result.trace,
            hintsUsed: result.hints,
          }
        : undefined;
      const posting = lastRun && lastRun.missionId === mission.id && lastRun.tier === result.tier ? lastRun : null;
      const board = posting
        ? {
            nickname: save.nickname,
            build: (nickname: string): Submission =>
              buildSubmission({
                playerId: getPlayerId(),
                nickname,
                scope: posting.scope,
                date: posting.date,
                missionId: posting.missionId,
                tier: posting.tier,
                commands: posting.commands,
              }),
            onNickname: (nickname: string) => update({ nickname }),
          }
        : null;
      body = (
        <Debrief
          mission={mission}
          result={result}
          hintLimit={DIFFICULTY[result.tier].hintLimit}
          rankName={rank}
          reduceMotion={reduceMotion}
          isLast={!date && index === MISSIONS.length - 1}
          nextLabel={date ? 'Daily menu' : undefined}
          onNext={() => continueAfter(date ? { name: 'daily' } : { name: 'briefing', index: index + 1 })}
          onCampaignEnd={() => continueAfter({ name: 'card' })}
          onMenu={() => continueAfter({ name: 'menu' })}
          card={realWorldFor(mission)}
          share={share}
          daily={daily}
          fileName={date ? `breach-daily-${date}` : `breach-job-${String(mission.number).padStart(2, '0')}`}
          board={board}
        />
      );
      break;
    }
  }

  const lastHoverEl = useRef<Element | null>(null);
  const onPointerOverCapture = (e: ReactPointerEvent) => {
    const btn = (e.target as Element).closest('.btn');
    if (btn && btn !== lastHoverEl.current) {
      lastHoverEl.current = btn;
      play('hover');
    } else if (!btn) {
      lastHoverEl.current = null;
    }
  };
  const onClickCapture = (e: ReactMouseEvent) => {
    if ((e.target as Element).closest('.btn')) play('click');
  };

  return (
    <div
      className={`relative min-h-dvh overflow-x-hidden ${reduceMotion ? 'reduce-motion' : ''}`}
      onPointerOver={onPointerOverCapture}
      onClick={onClickCapture}
    >
      {body}
      {wipeKey > 0 && !reduceMotion ? <div key={wipeKey} className="wipe" aria-hidden="true" /> : null}
      <AchievementToast items={toast} onDismiss={() => setToast([])} />
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
