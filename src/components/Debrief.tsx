'use client';

// Job complete. Stats count up one by one with a tick, the rank stamps in with a glitch, then the story types out.
// Reduced motion skips straight to the finished state.

import { useEffect, useState } from 'react';
import type { MissionResult } from '../engine/scoring';
import type { MissionDef, StoryLine } from '../engine/types';
import { DIFFICULTY } from '../engine/difficulty';
import { play } from '../lib/audio';
import { formatTime, Header, Screen } from './ui';
import RealWorldCard from './RealWorldCard';
import BoardPanel from './BoardPanel';
import ShareBar from './ShareBar';
import type { RealWorldCard as Card } from '../lib/realworld';
import type { DailyStats, ShareFacts } from '../lib/share';
import type { Submission } from '../lib/leaderboard';
import { buildFeedbackMailto } from '../lib/feedback';
import { GAME_VERSION } from '../lib/version';

interface DebriefProps {
  mission: MissionDef;
  result: MissionResult;
  hintLimit: number;
  rankName: string;
  reduceMotion: boolean;
  isLast: boolean;
  onNext: () => void;
  onCampaignEnd: () => void;
  onMenu: () => void;
  nextLabel?: string;
  card: Card | null;
  share: ShareFacts;
  /** Set for a daily: switches ShareBar to the copyable emoji-row result, image card second. */
  daily?: DailyStats;
  fileName: string;
  board: { nickname?: string; build: (nickname: string) => Submission; onNickname: (nickname: string) => void } | null;
}

const COUNT_FRAMES = 18;

function paragraphs(lines: StoryLine[]): string[] {
  return lines.map((l) => (typeof l === 'string' ? l : l.text));
}

/** Cuts a list of paragraphs at `n` total characters, the way a typewriter reveals them. */
function revealed(paras: string[], n: number): string[] {
  let left = n;
  return paras.map((p) => {
    const take = Math.max(0, Math.min(p.length, left));
    left -= take;
    return p.slice(0, take);
  });
}

export default function Debrief({ mission, result, hintLimit, rankName, reduceMotion, isLast, nextLabel, onNext, onCampaignEnd, onMenu, card, share, daily, fileName, board }: DebriefProps) {
  const ending = mission.endings?.find((e) => e.id === result.endingId);
  const story = paragraphs(mission.debrief);
  const storyLength = story.reduce((n, p) => n + p.length, 0);

  const stats = [
    { label: 'SCORE', to: result.points, show: (v: number) => String(v) },
    { label: 'TIME', to: result.seconds, show: (v: number) => formatTime(v) },
    { label: 'TRACE', to: result.trace, show: (v: number) => `${v}%` },
    { label: 'HINTS', to: result.hints, show: (v: number) => `${v}/${hintLimit}` },
  ];

  const [statIndex, setStatIndex] = useState(reduceMotion ? stats.length : 0);
  const [statValue, setStatValue] = useState(0);
  const [stamped, setStamped] = useState(reduceMotion);
  const [typed, setTyped] = useState(reduceMotion ? storyLength : 0);

  useEffect(() => {
    play('sting');
  }, []);

  // Count the stats up, one after another.
  useEffect(() => {
    if (reduceMotion || statIndex >= stats.length) return;
    const target = stats[statIndex].to;
    if (statValue >= target) {
      const t = window.setTimeout(() => {
        setStatIndex((i) => i + 1);
        setStatValue(0);
      }, 220);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setStatValue((v) => Math.min(target, v + Math.max(1, Math.ceil(target / COUNT_FRAMES))));
      play('tick');
    }, 28);
    return () => window.clearTimeout(t);
  }, [statIndex, statValue, reduceMotion]);

  // Stamp the rank once every stat has landed.
  useEffect(() => {
    if (stamped || statIndex < stats.length) return;
    const t = window.setTimeout(() => {
      setStamped(true);
      play('rank');
    }, 320);
    return () => window.clearTimeout(t);
  }, [statIndex, stamped, stats.length]);

  // Type the story out once the stamp lands.
  useEffect(() => {
    if (!stamped || typed >= storyLength) return;
    const t = window.setTimeout(() => setTyped((n) => n + 2), 16);
    return () => window.clearTimeout(t);
  }, [stamped, typed, storyLength]);

  const storyDone = typed >= storyLength;
  const paras = revealed(story, typed);

  return (
    <Screen>
      <Header title="JOB COMPLETE" subtitle={`${mission.codename} :: ${mission.title} :: ${DIFFICULTY[result.tier].label}`} icon="check" />

      <div className="panel mb-6 grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
        {stats.map((s, i) => {
          const value = i < statIndex || reduceMotion ? s.to : i === statIndex ? statValue : 0;
          return (
            <div key={s.label}>
              <div className="text-xs text-[var(--dim)]">{s.label}</div>
              <div className="glow text-base font-semibold tabular-nums">{s.show(value)}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-6 flex min-h-[2.5rem] items-center [overflow-x:clip]">
        {stamped ? (
          <span className="stamp" aria-label={`rank ${rankName}`}>
            JOB RANK {rankName.toUpperCase()}
          </span>
        ) : null}
      </div>

      <div className="mb-8 space-y-3 leading-relaxed" aria-live="polite">
        {paras.map((p, i) => (p ? <p key={i}>{p}</p> : null))}
        {!storyDone && stamped ? <span className="caret">▮</span> : null}
      </div>

      {storyDone && ending ? (
        <div className="mb-8 border-l-2 border-[var(--fg)] pl-4">
          <p className="mb-2 text-sm text-[var(--dim)]">ENDING</p>
          <p className="mb-3 glow font-semibold">{ending.label}</p>
          <div className="space-y-3 leading-relaxed">
            {ending.text.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>
        </div>
      ) : null}

      {storyDone && card ? <RealWorldCard card={card} /> : null}

      {storyDone && board ? <BoardPanel nickname={board.nickname} build={board.build} onNickname={board.onNickname} /> : null}

      {storyDone ? (
        <div className="mb-6">
          <ShareBar facts={share} fileName={fileName} daily={daily} />
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-3 sm:flex-row">
        {isLast ? (
          <button type="button" className="btn flex-1" onClick={onCampaignEnd}>
            See your result card
          </button>
        ) : (
          <button type="button" className="btn flex-1" onClick={onNext}>
            {nextLabel ?? 'Next job'}
          </button>
        )}
        <button type="button" className="btn flex-1" onClick={onMenu}>
          Main menu
        </button>
      </div>
      <p className="mt-3 text-center text-xs">
        <a className="underline underline-offset-4 text-[var(--dim)] hover:text-[var(--fg)]" href={buildFeedbackMailto({ version: GAME_VERSION, tier: result.tier, mission: mission.codename })}>
          Report a bug on this job
        </a>
      </p>
    </Screen>
  );
}
