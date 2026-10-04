// Builds public/og.png: the 1200x630 card used by Open Graph (WhatsApp, Discord, Slack) and Twitter.
// Runs before `next build`, so the static export ships the image. Drawn in the game's style: phosphor green on black,
// scanlines, a glowing title, a live-looking prompt and attack arcs.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const GREEN = '#33ff66';
const DIM = '#1b7a3a';
const EDGE = '#14412a';

const arcs = [
  { x1: 160, y1: 300, x2: 460, y2: 210 },
  { x1: 460, y1: 210, x2: 760, y2: 330 },
  { x1: 760, y1: 330, x2: 1040, y2: 200 },
  { x1: 300, y1: 430, x2: 700, y2: 470 },
];

const arcPath = ({ x1, y1, x2, y2 }) => {
  const cx = (x1 + x2) / 2;
  const cy = Math.min(y1, y2) - Math.hypot(x2 - x1, y2 - y1) * 0.35;
  return `<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.55"/>
  <circle cx="${x2}" cy="${y2}" r="5" fill="${GREEN}" opacity="0.9"/>`;
};

const scan = Array.from({ length: Math.ceil(H / 4) }, (_, i) => `<rect x="0" y="${i * 4 + 2}" width="${W}" height="1" fill="#000" opacity="0.28"/>`).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%">
      <stop offset="0%" stop-color="#06180c"/>
      <stop offset="100%" stop-color="#010402"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-40%" width="140%" height="180%">
      <feGaussianBlur stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${arcs.map(arcPath).join('\n  ')}
  <rect x="48" y="48" width="${W - 96}" height="${H - 96}" fill="none" stroke="${EDGE}" stroke-width="3" rx="6"/>
  <text x="96" y="250" font-family="Consolas, 'Courier New', monospace" font-size="150" font-weight="700" letter-spacing="28" fill="${GREEN}" filter="url(#glow)">BREACH</text>
  <text x="100" y="318" font-family="Consolas, 'Courier New', monospace" font-size="34" fill="${GREEN}" opacity="0.9">Take jobs. Breach fake networks. Mind your trace.</text>
  <text x="100" y="400" font-family="Consolas, 'Courier New', monospace" font-size="30" fill="${GREEN}" filter="url(#glow)">guest@breach:~$ start</text>
  <rect x="100" y="420" width="18" height="30" fill="${GREEN}" opacity="0.9"/>
  <g font-family="Consolas, 'Courier New', monospace" font-size="24" letter-spacing="4">
    <text x="100" y="530" fill="${DIM}">EASY</text>
    <text x="260" y="530" fill="${DIM}">MEDIUM</text>
    <text x="440" y="530" fill="${DIM}">HARD</text>
    <text x="100" y="570" fill="${GREEN}" opacity="0.7">FREELANCE INTRUSION TERMINAL</text>
  </g>
  ${scan}
</svg>`;

const out = path.resolve('public', 'og.png');
await mkdir(path.dirname(out), { recursive: true });
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(out, png);
console.log(`wrote ${path.relative(process.cwd(), out)} (${png.length} bytes)`);
