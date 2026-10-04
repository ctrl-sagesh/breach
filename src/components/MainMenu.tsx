'use client';

import { DIFFICULTY } from '../engine/difficulty';
import type { SaveData } from '../lib/save';
import { summarize } from '../lib/progress';
import Icon, { type IconName } from './Icon';
import { Screen } from './ui';

const LOGO = `██████╗ ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗
██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║
██████╔╝██████╔╝█████╗  ███████║██║     ███████║
██╔══██╗██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║
██████╔╝██║  ██║███████╗██║  ██║╚██████╗██║  ██║
╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝`;

export type MenuTarget = 'select' | 'settings' | 'card' | 'daily' | 'board' | 'achievements' | 'history' | 'profile';

interface MainMenuProps {
  save: SaveData;
  onNavigate: (target: MenuTarget) => void;
}

interface Item {
  label: string;
  icon: IconName;
  target: MenuTarget;
  show?: boolean;
}

export default function MainMenu({ save, onNavigate }: MainMenuProps) {
  const summary = summarize(save);
  const started = summary.completed > 0 || Object.keys(save.attempts[save.tier]).length > 0;
  const items: Item[] = [
    { label: started ? 'Continue jobs' : 'Start first job', icon: 'play', target: 'select' },
    { label: 'Daily challenge', icon: 'calendar', target: 'daily' },
    { label: 'Global board', icon: 'radar', target: 'board' },
    { label: 'Ops log', icon: 'terminal', target: 'history', show: save.history.length > 0 },
    { label: 'Profile', icon: 'card', target: 'profile' },
    { label: 'Achievements', icon: 'check', target: 'achievements' },
    { label: 'Result card', icon: 'card', target: 'card', show: summary.completed > 0 },
    { label: 'Settings', icon: 'settings', target: 'settings' },
  ];

  return (
    <Screen className="justify-center !py-3">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <p>
          <span className="text-[var(--dim)]">HANDLE </span>
          <span className="glow font-semibold">{save.nickname ?? 'unregistered'}</span>
        </p>
        <p className="text-xs text-[var(--dim)]">
          {DIFFICULTY[save.tier].label.toUpperCase()}
        </p>
      </div>

      {/* The logo is clipped, never scrolled: the menu must fit on a phone without a page scrollbar. */}
      <pre
        className="glow mb-3 max-w-full overflow-hidden font-bold leading-none"
        style={{ fontSize: 'min(calc(100vw / 62), 10px)' }}
        aria-label="BREACH"
      >
        {LOGO}
      </pre>

      <p className="mb-3 text-sm text-[var(--dim)]">
        A freelance hacking terminal. Take jobs from anonymous clients. Breach fake networks. Mind your trace.
      </p>

      <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="menu">
        {items
          .filter((i) => i.show !== false)
          .map((i) => (
            <button key={i.target} type="button" className="btn flex items-center gap-3 text-left !min-h-[40px] text-sm" onClick={() => onNavigate(i.target)}>
              <Icon name={i.icon} size={18} />
              {i.label}
            </button>
          ))}
      </nav>

      <div className="panel mt-4 grid grid-cols-3 gap-2 p-2 text-xs">
        <div>
          <div className="text-[var(--dim)]">JOBS</div>
          <div className="glow text-sm">
            {summary.completed}/{summary.total}
          </div>
        </div>
        <div>
          <div className="text-[var(--dim)]">CAMPAIGN RANK</div>
          <div className="glow text-sm">{summary.rank.name}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[var(--dim)]">
            <Icon name="tier" level={DIFFICULTY[save.tier].pointMultiplier >= 2.5 ? 3 : DIFFICULTY[save.tier].pointMultiplier >= 1.5 ? 2 : 1} size={14} />
            DIFFICULTY
          </div>
          <div className="glow text-sm">{DIFFICULTY[save.tier].label}</div>
        </div>
      </div>
    </Screen>
  );
}
