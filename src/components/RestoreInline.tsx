'use client';

// "Restore from key" for the landing page: a single line that opens a field. Works on a new device or browser.

import { useState, type FormEvent } from 'react';
import { restoreAccount, type RestoreResult } from '../lib/cloud';
import { isWellFormedKey, normalizeRecoveryKey } from '../lib/recoverykey';

export default function RestoreInline({ onRestored }: { onRestored: (r: RestoreResult) => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isWellFormedKey(key)) {
      setError('That does not look like a recovery key.');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await restoreAccount(normalizeRecoveryKey(key));
    setBusy(false);
    if (!r.ok) {
      setError(r.reason);
      return;
    }
    onRestored(r.value);
    setKey('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="text-xs text-[var(--dim)] underline underline-offset-4" onClick={() => setOpen(true)}>
        Restore from recovery key
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="panel flex w-full max-w-sm flex-col gap-2 p-3 text-xs">
      <label className="block">
        <span className="mb-1 block tracking-widest text-[var(--dim)]">RECOVERY KEY</span>
        <input
          className="term-input w-full uppercase"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="GHOST-AMBER-FALCON-CEDAR-7419"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </label>
      {error ? <p className="text-[var(--alert)]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn !min-h-[36px] flex-1 text-xs" disabled={busy || !key.trim()}>
          {busy ? 'Restoring...' : 'Restore'}
        </button>
        <button type="button" className="btn !min-h-[36px] text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
