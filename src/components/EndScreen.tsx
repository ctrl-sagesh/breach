'use client';

import { useState } from 'react';
import { DIFFICULTY } from '../engine/difficulty';
import { MISSIONS } from '../missions';
import type { SaveData } from '../lib/save';
import { buildShareCard, summarize } from '../lib/progress';
import { Header, Screen } from './ui';

interface EndScreenProps {
  save: SaveData;
  onMenu: () => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is blocked in some embeds. Fall back to a hidden textarea.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function EndScreen({ save, onMenu }: EndScreenProps) {
  const summary = summarize(save);
  const tier = save.tier;
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const endingMission = MISSIONS[MISSIONS.length - 1];
  const endingId = save.completed[tier][endingMission.id]?.endingId ?? null;
  const endingLabel = endingMission.endings?.find((e) => e.id === endingId)?.label ?? null;
  const card = buildShareCard(summary, endingLabel);
  const campaignDone = summary.completed === summary.total;

  const onCopy = async () => {
    const ok = await copyText(card);
    setCopied(ok ? 'ok' : 'failed');
  };

  return (
    <Screen>
      <Header title={campaignDone ? 'CAMPAIGN COMPLETE' : 'CAMPAIGN STATUS'} subtitle={`${DIFFICULTY[tier].label} difficulty. Share it, then vanish.`} icon="card" />

      <div className="panel mb-6 p-5">
        <p className="glow text-3xl font-bold">{summary.rank.name}</p>
        <p className="mt-2 text-sm">
          {summary.completed}/{summary.total} missions · {summary.points} points · {summary.hints} hint{summary.hints === 1 ? '' : 's'} · avg trace {summary.avgTrace}%
        </p>
        <p className="mt-3 text-xl tracking-widest">{summary.grid.join(' ')}</p>
        {endingLabel ? <p className="mt-3 text-sm">Ending: {endingLabel}</p> : null}
      </div>

      <pre className="panel mb-4 overflow-x-auto whitespace-pre-wrap p-4 text-sm leading-relaxed" aria-label="share text">
        {card}
      </pre>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className="btn flex-1" onClick={onCopy}>
          {copied === 'ok' ? 'Copied to clipboard' : copied === 'failed' ? 'Copy failed. Select the text above.' : 'Copy result'}
        </button>
        <button type="button" className="btn flex-1" onClick={onMenu}>
          Main menu
        </button>
      </div>
    </Screen>
  );
}
