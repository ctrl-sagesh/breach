'use client';

import { DIFFICULTY } from '../engine/difficulty';
import type { SaveData } from '../lib/save';
import { summarize } from '../lib/progress';
import Icon from './Icon';
import { Screen } from './ui';

const LOGO = `██████╗ ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗
██╔══██╗██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║
██████╔╝██████╔╝█████╗  ███████║██║     ███████║
██╔══██╗██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║
██████╔╝██║  ██║███████╗██║  ██║╚██████╗██║  ██║
╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝`;

export type MenuTarget = 'select' | 'settings' | 'card' | 'daily' | 'board' | 'achievements';

interface MainMenuProps {
  save: SaveData;
  onNavigate: (target: MenuTarget) => void;
}

export default function MainMenu({ save, onNavigate }: MainMenuProps) {
  const summary = summarize(save);
  const started = summary.completed > 0 || Object.keys(save.attempts[save.tier]).length > 0;
  const rank = summary.rank;

  return (
    <Screen className="justify-center">
      <pre
        className="glow mb-6 overflow-x-auto font-bold leading-none"
        style={{ fontSize: 'min(calc(100vw / 60), 11px)' }}
        aria-label="BREACH"
      >
        {LOGO}
      </pre>

      <p className="mb-8 text-sm text-[var(--dim)]">
        A freelance hacking terminal. Take jobs from anonymous clients. Breach fake networks. Mind your trace.
      </p>

      <nav className="flex flex-col gap-3">
        <button type="button" className="btn flex items-center gap-3 text-left" onClick={() => onNavigate('select')}>
          <Icon name="play" />
          {started ? 'Continue jobs' : 'Start first job'}
        </button>
        <button type="button" className="btn flex items-center gap-3 text-left" onClick={() => onNavigate('daily')}>
          <Icon name="calendar" />
          Daily challenge
        </button>
        <button type="button" className="btn flex items-center gap-3 text-left" onClick={() => onNavigate('board')}>
          <Icon name="radar" />
          Global board
        </button>
        <button type="button" className="btn flex items-center gap-3 text-left" onClick={() => onNavigate('achievements')}>
          <Icon name="check" />
          Achievements
        </button>
        <button type="button" className="btn flex items-center gap-3 text-left" onClick={() => onNavigate('settings')}>
          <Icon name="settings" />
          Settings
        </button>
        {summary.completed > 0 ? (
          <button type="button" className="btn flex items-center gap-3 text-left" onClick={() => onNavigate('card')}>
            <Icon name="card" />
            Result card
          </button>
        ) : null}
      </nav>

      <div className="panel mt-10 grid grid-cols-3 gap-2 p-3 text-xs">
        <div>
          <div className="text-[var(--dim)]">JOBS</div>
          <div className="glow text-sm">
            {summary.completed}/{summary.total}
          </div>
        </div>
        <div>
          <div className="text-[var(--dim)]">CAMPAIGN RANK</div>
          <div className="glow text-sm">{rank.name}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[var(--dim)]"><Icon name="tier" level={DIFFICULTY[save.tier].pointMultiplier >= 2.5 ? 3 : DIFFICULTY[save.tier].pointMultiplier >= 1.5 ? 2 : 1} size={14} />DIFFICULTY</div>
          <div className="glow text-sm">{DIFFICULTY[save.tier].label}</div>
        </div>
      </div>
    </Screen>
  );
}
