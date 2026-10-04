'use client';

// Account settings: your handle, your recovery key (shown again on this device), creating a key if you skipped, and
// restoring an account from a key on a new device. Everything works offline except the parts that need the server.

import { useState, type FormEvent } from 'react';
import { cloudConfigured, registerAccount, renameAccount, restoreAccount, type RestoreResult } from '../lib/cloud';
import { getPlayerId } from '../lib/leaderboard';
import { nicknameProblem } from '../lib/nickname';
import { isWellFormedKey, normalizeRecoveryKey } from '../lib/recoverykey';
import type { SaveData } from '../lib/save';
import Icon from './Icon';

interface AccountPanelProps {
  save: SaveData;
  onChange: (patch: Partial<SaveData>) => void;
  onRestored: (restored: RestoreResult) => void;
}

export default function AccountPanel({ save, onChange, onRestored }: AccountPanelProps) {
  const [handle, setHandle] = useState(save.nickname ?? '');
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [typedKey, setTypedKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const registered = Boolean(save.syncToken && save.playerId);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    const next = handle.trim();
    const problem = nicknameProblem(next);
    if (problem) return setNote({ kind: 'err', text: problem });
    setBusy(true);
    if (registered && cloudConfigured()) {
      const r = await renameAccount(save.playerId!, save.syncToken!, next);
      if (!r.ok) {
        setBusy(false);
        return setNote({ kind: 'err', text: r.reason });
      }
    }
    onChange({ nickname: next });
    setBusy(false);
    setNote({ kind: 'ok', text: registered ? 'Handle changed everywhere.' : 'Handle changed on this device.' });
  };

  const createKey = async () => {
    setBusy(true);
    const playerId = save.playerId ?? getPlayerId();
    const r = await registerAccount(playerId, save.nickname ?? '', { ...save, playerId });
    setBusy(false);
    if (!r.ok) return setNote({ kind: 'err', text: r.reason });
    onChange({ playerId, recoveryKey: r.value.recoveryKey, syncToken: r.value.syncToken });
    setNote({ kind: 'ok', text: 'Recovery key created. Save it now.' });
  };

  const restore = async (e: FormEvent) => {
    e.preventDefault();
    if (!isWellFormedKey(typedKey)) return setNote({ kind: 'err', text: 'That does not look like a recovery key. It has four words and four digits.' });
    setBusy(true);
    const r = await restoreAccount(normalizeRecoveryKey(typedKey));
    setBusy(false);
    if (!r.ok) return setNote({ kind: 'err', text: r.reason });
    onRestored(r.value);
    setTypedKey('');
    setNote({ kind: 'ok', text: `Restored ${r.value.nickname}. Your progress now includes the cloud copy.` });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mb-8 space-y-6" aria-label="account">
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]">
          <Icon name="radar" size={16} />
          HANDLE
        </h2>
        <form onSubmit={rename} className="flex flex-col gap-2 sm:flex-row">
          <input className="term-input panel flex-1 px-3 py-2" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={16} aria-label="handle" spellCheck={false} />
          <button type="submit" className="btn" disabled={busy}>
            Change handle
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]">
          <Icon name="lock" size={16} />
          RECOVERY KEY
        </h2>
        {save.recoveryKey ? (
          <div className="space-y-3">
            <p className="glow break-all text-xl font-bold tracking-widest">{save.recoveryKey}</p>
            <button type="button" className="btn flex items-center gap-2 text-sm" onClick={() => copy(save.recoveryKey!)}>
              <Icon name="card" size={16} />
              {copied ? 'Copied' : 'Copy key'}
            </button>
          </div>
        ) : registered ? (
          <p className="text-sm text-[var(--dim)]">Your key was shown on the device where you registered. This device is signed in with its own sync token.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--dim)]">You have no recovery key yet. Create one to sync your progress and restore it on another device.</p>
            <button type="button" className="btn text-sm" onClick={createKey} disabled={busy || !cloudConfigured()}>
              Create recovery key
            </button>
          </div>
        )}
        <p className="mt-3 border-l-2 border-[var(--warn)] pl-3 text-xs leading-relaxed">
          Browsers can clear their data, and iPhones delete a site&apos;s data after seven days unused. Without this key, your progress cannot come back.
        </p>
      </div>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm tracking-widest text-[var(--dim)]">
          <Icon name="reset" size={16} />
          RESTORE FROM KEY
        </h2>
        <form onSubmit={restore} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="term-input panel flex-1 px-3 py-2 uppercase"
            value={typedKey}
            onChange={(e) => setTypedKey(e.target.value)}
            placeholder="GHOST-AMBER-FALCON-CEDAR-7419"
            aria-label="recovery key"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn" disabled={busy || !typedKey.trim()}>
            Restore
          </button>
        </form>
      </div>

      {note ? (
        <p className={`text-sm ${note.kind === 'err' ? 'text-[var(--alert)]' : 'text-[var(--dim)]'}`} role="status">
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
