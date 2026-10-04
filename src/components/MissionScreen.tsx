'use client';

import { useEffect, useState } from 'react';
import type { GameSession } from '../engine/session';
import type { MissionDef } from '../engine/types';
import type { TypingSpeed } from '../lib/save';
import { play, setTension } from '../lib/audio';
import Icon from './Icon';
import { formatTime, pad2 } from './ui';
import Terminal from './Terminal';
import TraceMeter from './TraceMeter';

interface MissionScreenProps {
  mission: MissionDef;
  session: GameSession;
  attemptKey: number;
  speed: TypingSpeed;
  reduceMotion: boolean;
  onWon: (session: GameSession) => void;
  onRetry: () => void;
  onAbort: () => void;
  onCommand?: (raw: string) => void;
}

type Phase = 'playing' | 'tearing' | 'traced';
type Flash = { kind: 'granted' | 'denied'; id: number } | null;

const ALARM_TRACE = 75;
const COUNTDOWN_WARN = 120;

export default function MissionScreen({ mission, session, attemptKey, speed, reduceMotion, onWon, onRetry, onAbort, onCommand }: MissionScreenProps) {
  const [, setTick] = useState(0);
  const [phase, setPhase] = useState<Phase>('playing');
  const [flash, setFlash] = useState<Flash>(null);

  // Once per second: refresh the clock and check the countdown on timed tiers.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (session.expireIfLate()) setPhase('tearing');
      setTick((t) => t + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  // Drone tension follows the trace.
  useEffect(() => {
    setTension(session.trace);
  }, [session.trace]);

  // A failed attempt tears the screen, then cuts to the TRACED card. Reduced motion skips the tear.
  useEffect(() => {
    if (phase !== 'tearing') return;
    // A trace kill ends on an explosion: the alarm has been climbing, then the boom lands as the screen tears.
    const traceKill = session.failReason === 'trace';
    if (reduceMotion) {
      if (traceKill) play('boom');
      setPhase('traced');
      return;
    }
    const boom = traceKill ? window.setTimeout(() => play('boom'), 180) : null;
    const timer = window.setTimeout(() => setPhase('traced'), 900);
    return () => {
      window.clearTimeout(timer);
      if (boom !== null) window.clearTimeout(boom);
    };
  }, [phase, reduceMotion, session.failReason]);

  // Banners disappear by themselves.
  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const handleUpdate = () => {
    setTick((t) => t + 1);
    if (session.status === 'won') onWon(session);
    if (session.status === 'failed' && phase === 'playing') setPhase('tearing');
  };

  const handleFlash = (kind: 'granted' | 'denied') => setFlash({ kind, id: Date.now() });

  const trace = session.trace;
  const alarmed = trace >= ALARM_TRACE && phase === 'playing';
  const remaining = session.timeRemaining();
  const showCountdown = session.config.showTimer && remaining !== null;

  return (
    <div className="relative mx-auto flex h-[var(--app-h,100dvh)] w-full max-w-5xl flex-col overflow-hidden">
      <div className={`flex min-h-0 flex-1 flex-col ${phase === 'tearing' ? 'tear' : ''} ${alarmed && !reduceMotion ? 'shake' : ''}`}>
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[var(--edge)] px-3 py-2 text-sm">
          <div className="glow font-semibold">
            MISSION {pad2(mission.number)} // {mission.codename}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {showCountdown ? (
              <span className={remaining <= COUNTDOWN_WARN ? 'trace-hot' : ''} aria-label="time remaining">
                LEFT {formatTime(remaining)}
              </span>
            ) : (
              <span>T+ {formatTime(session.elapsedSeconds())}</span>
            )}
            <span>
              HINTS {session.hintsUsed}/{session.hintLimit}
            </span>
            <button type="button" className="btn btn-danger !min-h-[32px] !px-2 !py-1 text-xs" onClick={onAbort}>
              ABORT
            </button>
          </div>
        </header>

        <div className="px-3 py-2">
          <TraceMeter value={trace} />
        </div>

        {phase !== 'traced' ? (
          <Terminal
            key={attemptKey}
            session={session}
            speed={speed}
            onUpdate={handleUpdate}
            onQuit={onAbort}
            onFlash={handleFlash}
            onCommand={onCommand}
          />
        ) : null}
      </div>

      {alarmed && !reduceMotion ? <div className="alarm-vignette" aria-hidden="true" /> : null}
      {phase === 'tearing' && session.failReason === 'trace' && !reduceMotion ? <div className="boom-flash" aria-hidden="true" /> : null}

      {flash ? (
        <div key={flash.id} className={`banner banner-${flash.kind}`} role="status">
          {flash.kind === 'granted' ? 'ACCESS GRANTED' : 'ACCESS DENIED'}
        </div>
      ) : null}

      {phase === 'traced' ? <Traced reason={session.failReason} onRetry={onRetry} onAbort={onAbort} /> : null}
    </div>
  );
}

function Traced({ reason, onRetry, onAbort }: { reason: 'trace' | 'time' | null; onRetry: () => void; onAbort: () => void }) {
  useEffect(() => {
    play('fail');
  }, []);
  const headline = reason === 'time' ? 'TIME EXPIRED' : 'TRACED';
  const body =
    reason === 'time'
      ? 'The clock ran out. The client has already moved on, and so has the job.'
      : 'Your rig was located. The connection is gone and the contract is void. Your notes are still yours.';
  return (
    <div className="traced-in absolute inset-0 flex items-center justify-center bg-black p-6">
      <div className="w-full max-w-md text-center">
        <Icon name="alert" size={40} className="trace-hot mx-auto mb-3" />
        <p className="trace-hot break-words text-3xl font-bold tracking-[0.2em] sm:text-4xl sm:tracking-[0.3em]">{headline}</p>
        <p className="mt-4 text-sm leading-relaxed">{body}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="btn" onClick={onRetry}>
            Retry mission
          </button>
          <button type="button" className="btn btn-danger" onClick={onAbort}>
            Back to job board
          </button>
        </div>
      </div>
    </div>
  );
}
