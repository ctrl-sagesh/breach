'use client';

// Share buttons for a finished job, a daily or the campaign. Download the PNG, share it through the phone's sheet
// where the browser supports sharing files, or copy the text. Each button says what happened.

import { useState } from 'react';
import { renderShareCard, shareText, type ShareFacts } from '../lib/share';
import { trackShareClicked } from '../lib/analytics';
import Icon from './Icon';

interface ShareBarProps {
  facts: ShareFacts;
  /** File name stem, such as breach-lighthouse. */
  fileName: string;
}

type Note = { kind: 'ok' | 'err'; text: string } | null;

export default function ShareBar({ facts, fileName }: ShareBarProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const download = async () => {
    trackShareClicked('download');
    setBusy(true);
    try {
      const blob = await renderShareCard(facts);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setNote({ kind: 'ok', text: 'Card saved.' });
    } catch {
      setNote({ kind: 'err', text: 'Could not draw the card on this device.' });
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    trackShareClicked('share');
    setBusy(true);
    try {
      const blob = await renderShareCard(facts);
      const file = new File([blob], `${fileName}.png`, { type: 'image/png' });
      const data = { title: 'BREACH', text: shareText(facts), files: [file] };
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share(data);
        setNote({ kind: 'ok', text: 'Shared.' });
      } else {
        // No file sharing here. Share the text and link instead.
        await navigator.share({ title: 'BREACH', text: shareText(facts) });
        setNote({ kind: 'ok', text: 'Shared.' });
      }
    } catch (err) {
      // The user closing the share sheet is not an error.
      if (err instanceof DOMException && err.name === 'AbortError') setNote(null);
      else setNote({ kind: 'err', text: 'Sharing is not available here. Use Copy text.' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    trackShareClicked('copy');
    try {
      await navigator.clipboard.writeText(shareText(facts));
      setNote({ kind: 'ok', text: 'Copied to clipboard.' });
    } catch {
      setNote({ kind: 'err', text: 'Copy failed. Select the text instead.' });
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <div className="space-y-2" aria-label="share">
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" className="btn flex items-center justify-center gap-2 text-sm" onClick={download} disabled={busy}>
          <Icon name="transfer" size={16} />
          Download card
        </button>
        {canNativeShare ? (
          <button type="button" className="btn flex items-center justify-center gap-2 text-sm" onClick={share} disabled={busy}>
            <Icon name="map" size={16} />
            Share
          </button>
        ) : null}
        <button type="button" className="btn flex items-center justify-center gap-2 text-sm" onClick={copy} disabled={busy}>
          <Icon name="card" size={16} />
          Copy text
        </button>
      </div>
      {note ? (
        <p className={`text-xs ${note.kind === 'err' ? 'text-[var(--alert)]' : 'text-[var(--dim)]'}`} role="status">
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
