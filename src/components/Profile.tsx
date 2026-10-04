'use client';

// The player profile: handle, campaign rank per tier, jobs cleared, streaks, achievements, favourite command, total time.
// Everything here is read from the local save, so it works offline. The card at the bottom shares it as an image.

import { DIFFICULTY, TIERS } from '../engine/difficulty';
import { ACHIEVEMENTS } from '../lib/achievements';
import { bestStreak, streakFor, utcDate } from '../lib/daily';
import { favouriteCommand, totalSeconds } from '../lib/history';
import { summarize } from '../lib/progress';
import type { SaveData } from '../lib/save';
import ShareBar from './ShareBar';
import { Header, Screen } from './ui';

interface ProfileProps {
  save: SaveData;
  onBack: () => void;
}

export default function Profile({ save, onBack }: ProfileProps) {
  const handle = save.nickname ?? 'unregistered';
  const perTier = TIERS.map((t) => ({ tier: t, summary: summarize(save, t) }));
  const jobsCleared = perTier.reduce((n, p) => n + p.summary.completed, 0);
  const points = perTier.reduce((n, p) => n + p.summary.points, 0);
  const doneDates = Object.keys(save.dailies).filter((d) => Object.values(save.dailies[d] ?? {}).some(Boolean));
  const current = streakFor(doneDates, utcDate());
  const best = bestStreak(doneDates);
  const unlocked = save.achievements.length;
  const fav = favouriteCommand(save.history);
  const hours = (totalSeconds(save.history) / 3600).toFixed(1);

  const bestRank = perTier.map((p) => p.summary.rank.name).sort((a, b) => rankOrder(b) - rankOrder(a))[0];

  return (
    <Screen>
      <Header title="PROFILE" subtitle="Your record on this rig. Shared as a card, never as a file." icon="card" />

      <section className="panel mb-6 p-4">
        <p className="text-xs tracking-widest text-[var(--dim)]">HANDLE</p>
        <p className="glow text-2xl font-bold">{handle}</p>
        <p className="mt-2 text-sm">
          Best rank so far: <span className="glow">{bestRank}</span> · {points} points
        </p>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {perTier.map(({ tier, summary }) => (
          <div key={tier} className="panel p-3">
            <p className="text-xs tracking-widest text-[var(--dim)]">{DIFFICULTY[tier].label.toUpperCase()} RANK</p>
            <p className="glow">{summary.rank.name}</p>
            <p className="text-xs text-[var(--dim)]">
              {summary.completed}/{summary.total} jobs
            </p>
          </div>
        ))}
      </section>

      <dl className="panel mb-6 grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-4">
        <Stat label="JOBS CLEARED" value={String(jobsCleared)} />
        <Stat label="DAILY STREAK" value={`${current} day${current === 1 ? '' : 's'}`} />
        <Stat label="BEST STREAK" value={`${best} day${best === 1 ? '' : 's'}`} />
        <Stat label="ACHIEVEMENTS" value={`${unlocked}/${ACHIEVEMENTS.length}`} />
        <Stat label="FAVOURITE COMMAND" value={fav ? `${fav.name} (${fav.count})` : 'none yet'} />
        <Stat label="TIME HACKING" value={`${hours} h`} />
        <Stat label="ATTEMPTS LOGGED" value={String(save.history.length)} />
      </dl>

      <ShareBar
        fileName="breach-profile"
        facts={{
          label: `PROFILE · ${handle.toUpperCase()}`,
          tier: 'all tiers',
          rank: bestRank,
          score: points,
          streak: best > 0 ? best : undefined,
          detail: `${jobsCleared} jobs · ${unlocked} achievements`,
        }}
      />

      <div className="mt-auto pt-6">
        <button type="button" className="btn w-full" onClick={onBack}>
          Back
        </button>
      </div>
    </Screen>
  );
}

const RANK_ORDER = ['Script Kiddie', 'Packet Sniffer', 'Keyboard Cowboy', 'Black Hat', 'Shadow Broker', 'Ghost'];
function rankOrder(name: string): number {
  return RANK_ORDER.indexOf(name);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--dim)]">{label}</dt>
      <dd className="glow tabular-nums">{value}</dd>
    </div>
  );
}
