// Small presentational helpers shared by the screens.

import type { StoryLine } from '../engine/types';
import Decrypt from './Decrypt';
import Icon, { type IconName } from './Icon';

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Story text. Lines marked glitch get the glitch treatment. */
export function Story({ lines }: { lines: StoryLine[] }) {
  return (
    <div className="space-y-3 leading-relaxed">
      {lines.map((line, i) => {
        if (typeof line === 'string') return <p key={i}>{line}</p>;
        return (
          <p key={i}>
            <span className="glitch glow" data-text={line.text}>
              {line.text}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function Screen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-6 screen-curve ${className}`}>{children}</main>
  );
}

export function Header({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: IconName }) {
  return (
    <header className="mb-6 border-b border-[var(--edge)] pb-3">
      <h1 className="glow flex items-center gap-3 text-xl font-bold tracking-[0.25em]">
        {icon ? <Icon name={icon} size={22} /> : null}
        <Decrypt text={title} />
      </h1>
      {subtitle ? <p className="text-sm text-[var(--dim)]">{subtitle}</p> : null}
    </header>
  );
}
