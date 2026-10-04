'use client';

import { useState } from 'react';
import { THEMES, isThemeUnlocked, type ThemeId } from '../lib/themes';
import type { MotionSetting, SaveData, TypingSpeed } from '../lib/save';
import { clearedOnAnyTier } from '../lib/progress';
import Icon from './Icon';
import { Header, Screen } from './ui';
import AccountPanel from './AccountPanel';
import { TRACKS, TRACK_LABELS } from '../lib/music';
import type { RestoreResult } from '../lib/cloud';

interface SettingsProps {
  save: SaveData;
  onChange: (patch: Partial<SaveData>) => void;
  onReset: () => void;
  onBack: () => void;
  onRestored: (restored: RestoreResult) => void;
}

const SPEEDS: { id: TypingSpeed; label: string }[] = [
  { id: 'fast', label: 'Fast' },
  { id: 'normal', label: 'Normal' },
  { id: 'instant', label: 'Instant' },
];

const MOTION: { id: MotionSetting; label: string }[] = [
  { id: 'system', label: 'Follow system' },
  { id: 'full', label: 'Full' },
  { id: 'reduce', label: 'Reduced' },
];

export default function Settings({ save, onChange, onReset, onBack, onRestored }: SettingsProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const cleared = clearedOnAnyTier(save);

  return (
    <Screen>
      <Header title="SETTINGS" subtitle="Preferences are saved on this device." icon="settings" />

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]"><Icon name="colour" size={16} />COLOUR</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const unlocked = isThemeUnlocked(t, cleared);
            return (
              <button
                key={t.id}
                type="button"
                className="btn text-left"
                disabled={!unlocked}
                aria-pressed={save.theme === t.id}
                onClick={() => onChange({ theme: t.id as ThemeId })}
              >
                <span className="block">
                  {save.theme === t.id ? '● ' : '○ '}
                  {t.label}
                </span>
                <span className="block text-xs normal-case tracking-normal">
                  {unlocked ? 'unlocked' : `locked: clear ${t.unlockAfter} job${t.unlockAfter === 1 ? '' : 's'}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]"><Icon name="sound-on" size={16} />SOUND</h2>
        <label className="mb-4 block text-sm">
          <span className="mb-2 flex justify-between">
            <span>Volume</span>
            <span className="tabular-nums">{Math.round(save.volume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(save.volume * 100)}
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
            className="w-full accent-[var(--fg)]"
            aria-label="volume"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className="btn" aria-pressed={save.sfx} onClick={() => onChange({ sfx: !save.sfx })}>
            Effects: {save.sfx ? 'on' : 'off'}
          </button>
          <button type="button" className="btn" aria-pressed={save.music} onClick={() => onChange({ music: !save.music })}>
            Music: {save.music ? 'on' : 'off'}
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]"><Icon name="motion" size={16} />MOTION</h2>
        <div className="grid grid-cols-3 gap-3">
          {MOTION.map((m) => (
            <button key={m.id} type="button" className="btn !min-h-[40px] text-xs sm:text-sm" aria-pressed={save.motion === m.id} onClick={() => onChange({ motion: m.id })}>
              {save.motion === m.id ? '● ' : ''}
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">Reduced turns off shake, flashes, wipes and the screen tear. Layout and text stay the same.</p>
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        <button type="button" className="btn" aria-pressed={save.crt} onClick={() => onChange({ crt: !save.crt })}>
          <Icon name="crt" size={16} />CRT effect: {save.crt ? 'on' : 'off'}
        </button>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]"><Icon name="text" size={16} />TEXT SPEED</h2>
        <div className="grid grid-cols-3 gap-3">
          {SPEEDS.map((s) => (
            <button key={s.id} type="button" className="btn" aria-pressed={save.typing === s.id} onClick={() => onChange({ typing: s.id })}>
              {save.typing === s.id ? '● ' : ''}
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">Tap or press Esc on the terminal to finish a line instantly.</p>
      </section>

      <section className="mb-8" aria-label="soundtrack">
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]">
          <Icon name="sound-on" size={16} />
          SOUNDTRACK
        </h2>
        <div className="mb-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="soundtrack">
          {TRACKS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={save.track === t} className="btn text-xs sm:text-sm" onClick={() => onChange({ track: t })}>
              {save.track === t ? '● ' : '○ '}
              {TRACK_LABELS[t]}
            </button>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-2 flex justify-between">
            <span>Music volume</span>
            <span className="tabular-nums">{Math.round(save.musicVolume * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(save.musicVolume * 100)}
            onChange={(e) => onChange({ musicVolume: Number(e.target.value) / 100 })}
            className="w-full accent-[var(--fg)]"
            aria-label="music volume"
          />
        </label>
        <p className="mt-2 text-xs text-[var(--dim)]">Separate from effects. The soundtrack gets quieter than the effects at any setting.</p>
      </section>

      <AccountPanel save={save} onChange={onChange} onRestored={onRestored} />

      <section className="mt-auto space-y-3 pt-8">
        <button
          type="button"
          className="btn btn-danger w-full"
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            setConfirmReset(false);
            onReset();
          }}
        >
          {confirmReset ? 'Tap again to erase all progress' : 'Reset progress'}
        </button>
        <button type="button" className="btn w-full" onClick={onBack}>
          Back
        </button>
      </section>
    </Screen>
  );
}
