// Colour themes. The palettes live in globals.css as CSS variables keyed by data-theme.

export type ThemeId = 'green' | 'amber' | 'cyan';

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  /** Missions that must be completed before the theme unlocks. */
  unlockAfter: number;
}

export const THEMES: ThemeInfo[] = [
  { id: 'green', label: 'Phosphor Green', unlockAfter: 0 },
  { id: 'amber', label: 'Amber Monitor', unlockAfter: 2 },
  { id: 'cyan', label: 'Cyan Ice', unlockAfter: 5 },
];

export function isThemeUnlocked(theme: ThemeInfo, completedCount: number): boolean {
  return completedCount >= theme.unlockAfter;
}
