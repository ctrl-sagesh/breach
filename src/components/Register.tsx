'use client';

// "Register your handle": the first screen after the landing page. Pick a handle, get a recovery key, shown once.
// Skippable. Without a key, progress stays on this device, so the screen explains why the key matters.

import { useState, type FormEvent } from 'react';
import { cloudConfigured, registerAccount } from '../lib/cloud';
import { getPlayerId } from '../lib/leaderboard';
import { nicknameProblem } from '../lib/nickname';
import type { SaveData } from '../lib/save';
import Icon from './Icon';
import { Header, Screen } from './ui';

interface RegisterProps {
  save: SaveData;
  /** Called with the new handle, and the key and token when the account was created. */
  onRegistered: (patch: Partial<SaveData>) => void;
  /** Leaves the register screen once the key is saved, or the player is done with it. */
  onDone: () => void;
  onSkip: () => void;
}

type Step = { name: 'handle' } | { name: 'key'; recoveryKey: string; online: boolean } | { name: 'busy' };

export default function Register({ save, onRegistered, onDone, onSkip }: RegisterProps) {
  const [draft, setDraft] = useState(save.nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ name: 'handle' });
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const handle = draft.trim();
    const problem = nicknameProblem(handle);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    if (!cloudConfigured()) {
      onRegistered({ nickname: handle, registerSkipped: false });
      setStep({ name: 'key', recoveryKey: '', online: false });
      return;
    }
    setStep({ name: 'busy' });
    const playerId = getPlayerId();
    const result = await registerAccount(playerId, handle, { ...save, nickname: handle, playerId });
    if (!result.ok) {
      // Offline or refused: keep the handle on this device and say why. The key can be made later from Settings.
      setError(result.reason);
      onRegistered({ nickname: handle, playerId, registerSkipped: false });
      setStep({ name: 'handle' });
      return;
    }
    onRegistered({ nickname: handle, playerId, recoveryKey: result.value.recoveryKey, syncToken: result.value.syncToken });
    setStep({ name: 'key', recoveryKey: result.value.recoveryKey, online: true });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (step.name === 'key') {
    return (
      <Screen>
        <Header title="RECOVERY KEY" subtitle="Save it now. It is shown once on this screen." icon="lock" />
        {step.online ? (
          <>
            <p className="mb-2 text-xs tracking-widest text-[var(--dim)]">YOUR KEY</p>
            <p className="glow mb-3 break-all text-2xl font-bold tracking-widest sm:text-3xl">{step.recoveryKey}</p>
            <div className="mb-6 flex flex-wrap gap-2">
              <button type="button" className="btn flex items-center gap-2 text-sm" onClick={() => copy(step.recoveryKey)}>
                <Icon name="card" size={16} />
                {copied ? 'Copied' : 'Copy key'}
              </button>
            </div>
            <div className="mb-6 space-y-2 border-l-2 border-[var(--warn)] pl-3 text-sm">
              <p className="text-[var(--warn)]">Save this somewhere safe.</p>
              <p>
                Browsers can clear their data, and iPhones delete a site&apos;s data after seven days unused. This key is the only way to get your progress back on
                another device or browser.
              </p>
              <p className="text-[var(--dim)]">You can see it again on this device in Settings. It is never stored on our servers in readable form.</p>
            </div>
          </>
        ) : (
          <p className="mb-6 text-sm">
            Cloud save is offline, so your handle is saved on this device only. Create your recovery key from Settings once you are online.
          </p>
        )}
        <div className="mt-auto">
          <button type="button" className="btn w-full" onClick={onDone}>
            I have saved it. Continue
          </button>
        </div>
      </Screen>
    );
  }

  const busy = step.name === 'busy';
  return (
    <Screen>
      <Header title="REGISTER YOUR HANDLE" subtitle="Every operator needs a name on the board." icon="terminal" />

      <form onSubmit={submit} className="mb-6 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs tracking-widest text-[var(--dim)]">HANDLE</span>
          <input
            className="term-input panel w-full px-3 py-3"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            placeholder="3 to 16 characters"
            aria-describedby="handle-help"
            disabled={busy}
          />
        </label>
        <p id="handle-help" className="text-xs text-[var(--dim)]">
          Letters, numbers, _ and -. Your handle shows on the global board. It is not tied to an email or an account.
        </p>
        {error ? <p className="text-sm text-[var(--alert)]">{error}</p> : null}
        <button type="submit" className="btn flex w-full items-center justify-center gap-2" disabled={busy}>
          <Icon name="check" size={16} />
          {busy ? 'Registering...' : 'Register handle'}
        </button>
      </form>

      <div className="mt-auto">
        <button type="button" className="btn w-full text-sm" onClick={onSkip} disabled={busy}>
          Skip for now
        </button>
        <p className="mt-3 text-center text-xs text-[var(--dim)]">Skipping keeps everything on this device. You can register later from Settings.</p>
      </div>
    </Screen>
  );
}
