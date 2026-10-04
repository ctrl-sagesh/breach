'use client';

// Watch a run type itself out. The commands are re-run through the engine, so what you see is what the original attempt
// printed. Play, pause, restart, and 1x, 2x or 4x. Long pauses in the original are shortened so nothing drags.

import { useEffect, useMemo, useState } from 'react';
import { replayTimeline, type RunCommand } from '../engine/replay';
import type { Line, MissionDef, Tier } from '../engine/types';
import Icon from './Icon';

interface ReplayViewerProps {
  mission: MissionDef;
  tier: Tier;
  commands: RunCommand[];
  title: string;
  onClose: () => void;
}

const SPEEDS = [1, 2, 4] as const;
/** Gaps longer than this are cut short, so a pause while reading does not stall the replay. */
const MAX_GAP_MS = 1500;

function lineClass(kind: Line['kind']): string {
  if (kind === 'err') return 'text-[var(--alert)]';
  if (kind === 'warn') return 'text-[var(--warn)]';
  if (kind === 'ok' || kind === 'sys' || kind === 'title') return 'glow';
  if (kind === 'dim' || kind === 'echo') return 'text-[var(--dim)]';
  if (kind === 'dir') return 'kali-dir';
  if (kind === 'exec') return 'kali-exec';
  return '';
}

export default function ReplayViewer({ mission, tier, commands, title, onClose }: ReplayViewerProps) {
  const timeline = useMemo(() => replayTimeline(mission, tier, commands), [mission, tier, commands]);
  const [done, setDone] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  // Schedule the next command after the gap the original had, scaled by speed.
  useEffect(() => {
    if (!playing || done >= timeline.length) return;
    const prevT = done === 0 ? 0 : timeline[done - 1].t;
    const gap = Math.min(MAX_GAP_MS, Math.max(40, timeline[done].t - prevT));
    const timer = window.setTimeout(() => setDone((n) => n + 1), gap / speed);
    return () => window.clearTimeout(timer);
  }, [playing, done, speed, timeline]);

  const finished = done >= timeline.length;
  const shown = timeline.slice(0, done);

  return (
    <section className="panel mb-6 flex flex-col gap-3 p-3" aria-label="replay">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="glow font-semibold tracking-widest">REPLAY // {title}</p>
        <button type="button" className="btn !min-h-[32px] !px-2 !py-1 text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="term-scroll max-h-[46vh] min-h-[10rem] overflow-y-auto whitespace-pre-wrap break-words rounded border border-[var(--edge)] bg-[var(--bg)] p-2 text-[13px] leading-snug" role="log" aria-live="off">
        {shown.map((step, i) =>
          step.lines.map((l, j) => (
            <div key={`${i}-${j}`} className={lineClass(l.kind)}>
              {l.text || ' '}
            </div>
          )),
        )}
        {!finished && playing ? <span className="caret">▮</span> : null}
        {finished ? <p className="mt-2 text-[var(--dim)]">end of recording</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" className="btn flex items-center gap-2 !min-h-[36px] text-xs" onClick={() => (finished ? (setDone(0), setPlaying(true)) : setPlaying((p) => !p))}>
          <Icon name={playing && !finished ? 'reset' : 'play'} size={14} />
          {finished ? 'Replay again' : playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn !min-h-[36px] text-xs" onClick={() => { setDone(0); setPlaying(true); }}>
          Restart
        </button>
        <div className="flex gap-1" role="radiogroup" aria-label="playback speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} className="btn !min-h-[36px] !px-3 text-xs" onClick={() => setSpeed(s)}>
              {s}x
            </button>
          ))}
        </div>
        <span className="tabular-nums text-[var(--dim)]">
          {done}/{timeline.length} commands
        </span>
      </div>
    </section>
  );
}
