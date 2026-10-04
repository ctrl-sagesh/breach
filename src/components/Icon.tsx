// The game's icon set. Drawn on a 24px grid with one stroke weight and the theme glow, so every icon reads as part of the same screen.
// No emoji and no image files: each icon is an inline SVG that takes the current text colour.

import type { ReactNode } from 'react';

export type IconName =
  | 'terminal'
  | 'play'
  | 'settings'
  | 'sound-on'
  | 'sound-off'
  | 'card'
  | 'tier'
  | 'lock'
  | 'unlock'
  | 'calendar'
  | 'back'
  | 'radar'
  | 'alert'
  | 'map'
  | 'check'
  | 'help'
  | 'motion'
  | 'text'
  | 'colour'
  | 'crt'
  | 'reset'
  | 'transfer';

const PATHS: Record<Exclude<IconName, 'tier'>, ReactNode> = {
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="1.5" />
      <polyline points="6,9 9,12 6,15" />
      <line x1="11" y1="15" x2="17" y2="15" />
    </>
  ),
  play: <polygon points="7,5 19,12 7,19" />,
  settings: (
    <>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  'sound-on': (
    <>
      <polygon points="4,9 8,9 13,5 13,19 8,15 4,15" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M19 6a8 8 0 0 1 0 12" />
    </>
  ),
  'sound-off': (
    <>
      <polygon points="4,9 8,9 13,5 13,19 8,15 4,15" />
      <line x1="16" y1="9" x2="22" y2="15" />
      <line x1="22" y1="9" x2="16" y2="15" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="13" y2="13" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 7.7-1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </>
  ),
  back: <polyline points="15,6 9,12 15,18" />,
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <line x1="12" y1="12" x2="18.5" y2="6.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 22 20H2Z" />
      <line x1="12" y1="9.5" x2="12" y2="14" />
      <circle cx="12" cy="17" r="0.6" />
    </>
  ),
  map: <polygon points="3,6 9,4 15,6 21,4 21,18 15,20 9,18 3,20" />,
  check: <polyline points="5,12.5 10,17.5 19,7" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6" />
      <circle cx="12" cy="17" r="0.6" />
    </>
  ),
  motion: (
    <>
      <path d="M3 12h4l2-5 3 10 2-5h7" />
    </>
  ),
  text: (
    <>
      <polyline points="5,7 5,5 19,5 19,7" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="8" y1="19" x2="16" y2="19" />
    </>
  ),
  colour: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" />
    </>
  ),
  crt: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </>
  ),
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <polyline points="4,4 4,9 9,9" />
    </>
  ),
  transfer: (
    <>
      <line x1="4" y1="12" x2="19" y2="12" />
      <polyline points="14,7 19,12 14,17" />
      <line x1="4" y1="5" x2="4" y2="19" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  /** For the tier icon: how many of the three signal bars are lit, 1 to 3. */
  level?: 1 | 2 | 3;
  className?: string;
}

export default function Icon({ name, size = 20, level = 1, className = '' }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    className: `icon-glow shrink-0 ${className}`,
  };

  if (name === 'tier') {
    // Three signal bars. The lit ones carry the glow, the rest stay dim.
    const bars = [
      { x: 4, y: 15, h: 5 },
      { x: 10, y: 11, h: 9 },
      { x: 16, y: 7, h: 13 },
    ];
    return (
      <svg {...common}>
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width="3" height={b.h} rx="0.5" fill={i < level ? 'currentColor' : 'none'} opacity={i < level ? 1 : 0.35} />
        ))}
      </svg>
    );
  }

  return <svg {...common}>{PATHS[name]}</svg>;
}
