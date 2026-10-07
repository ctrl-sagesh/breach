// Share cards: the text you copy, and the 1200x630 PNG drawn on a canvas. Pure text is tested directly; drawing needs a browser.

import { SITE_URL } from './site';

export interface ShareFacts {
  /** "JOB 03 · LIGHTHOUSE", "CAMPAIGN", or "DAILY 42". */
  label: string;
  tier: string;
  rank: string;
  score: number;
  /** Days in a row, for dailies. Omitted elsewhere. */
  streak?: number;
  /** Extra line under the score, such as the ending or the completed count. */
  detail?: string;
}

/** The text that goes on the clipboard, and in the native share sheet. */
export function shareText(f: ShareFacts): string {
  const lines = [`BREACH ${f.label} [${f.tier.toUpperCase()}]: ${f.rank.toUpperCase()}, ${f.score} points`];
  if (f.streak !== undefined) lines.push(`Streak: ${f.streak} day${f.streak === 1 ? '' : 's'}`);
  if (f.detail) lines.push(f.detail);
  lines.push(SITE_URL);
  return lines.join('\n');
}

/** Draws the card onto a 2D canvas context. Green on black, the same look as the game. */
export function drawShareCard(ctx: CanvasRenderingContext2D, f: ShareFacts, width = 1200, height = 630): void {
  const GREEN = '#33ff66';
  const DIM = '#1b7a3a';
  const EDGE = '#14412a';
  const mono = "Consolas, 'Courier New', monospace";

  const bg = ctx.createRadialGradient(width / 2, height * 0.45, 40, width / 2, height / 2, width * 0.75);
  bg.addColorStop(0, '#06180c');
  bg.addColorStop(1, '#010402');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = EDGE;
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, width - 96, height - 96);

  // Scanlines, the same as the CRT overlay.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 2; y < height; y += 4) ctx.fillRect(0, y, width, 1);

  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = GREEN;
  ctx.shadowBlur = 24;
  ctx.fillStyle = GREEN;
  ctx.font = `700 120px ${mono}`;
  ctx.fillText('BREACH', 96, 220);
  ctx.shadowBlur = 0;

  ctx.font = `400 34px ${mono}`;
  ctx.fillStyle = GREEN;
  ctx.fillText(f.label, 100, 290);

  ctx.font = `700 150px ${mono}`;
  ctx.fillStyle = GREEN;
  ctx.fillText(String(f.score), 100, 440);
  ctx.font = `400 30px ${mono}`;
  ctx.fillStyle = DIM;
  ctx.fillText('POINTS', 100 + ctx.measureText(String(f.score)).width + 24, 440);

  ctx.font = `400 34px ${mono}`;
  ctx.fillStyle = GREEN;
  ctx.fillText(`RANK ${f.rank.toUpperCase()}   ·   ${f.tier.toUpperCase()}`, 100, 500);
  if (f.streak !== undefined) {
    ctx.fillText(`STREAK ${f.streak} DAY${f.streak === 1 ? '' : 'S'}`, 100, 548);
  } else if (f.detail) {
    ctx.font = `400 28px ${mono}`;
    ctx.fillText(f.detail.slice(0, 60), 100, 548);
  }

  ctx.font = `400 26px ${mono}`;
  ctx.fillStyle = DIM;
  ctx.fillText(SITE_URL.replace('https://', ''), 100, 580);
}

/** Renders the card to a PNG blob. Browser only. */
export function renderShareCard(f: ShareFacts): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no canvas'));
  drawShareCard(ctx, f);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('could not render'))), 'image/png');
  });
}
