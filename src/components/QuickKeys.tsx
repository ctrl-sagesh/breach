'use client';

// Tap targets above the on-screen keyboard. Run-now keys execute immediately; insert keys fill the prompt.

import type { InputMode } from '../engine/session';

interface QuickKeysProps {
  mode: InputMode;
  onRun: (cmd: string) => void;
  onInsert: (text: string) => void;
  onTab: () => void;
  onHistory: (dir: 'up' | 'down') => void;
}

const RUN_NOW = ['help', 'ls', 'pwd', 'nmap', 'ps', 'mail', 'hint', 'whoami', 'exit'];
const INSERT = ['ls -la', 'cd ', 'cat ', 'ssh ', 'su ', 'john ', 'base64 -d', 'grep -r ', 'find ', 'kill ', 'submit '];

export default function QuickKeys({ mode, onRun, onInsert, onTab, onHistory }: QuickKeysProps) {
  const shell = mode === 'shell';
  return (
    <div className="border-t border-[var(--edge)] bg-[var(--panel)] px-2 py-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      <div className="term-scroll flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="quick keys">
        <button type="button" className="quick-key" disabled={!shell} onClick={onTab}>
          TAB
        </button>
        <button type="button" className="quick-key" disabled={!shell} onClick={() => onHistory('up')}>
          ↑
        </button>
        <button type="button" className="quick-key" disabled={!shell} onClick={() => onHistory('down')}>
          ↓
        </button>
        {RUN_NOW.map((cmd) => (
          <button key={cmd} type="button" className="quick-key" disabled={!shell} onClick={() => onRun(cmd)}>
            {cmd}
          </button>
        ))}
        {INSERT.map((text) => (
          <button key={text} type="button" className="quick-key" disabled={!shell} onClick={() => onInsert(text)}>
            {text.trim()}
          </button>
        ))}
      </div>
    </div>
  );
}
