'use client';

// Posts a finished run to the global board. One step: enter a handle, post the run, and — the first time, when
// there is no account yet — create the cloud account and show the recovery key in the same place. The celebratory
// "you're on the board" line only ever shows once the post is actually verified; see lib/board.ts for that rule.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { nicknameProblem } from '../lib/nickname';
import { leaderboardConfigured, submitRun, type Submission, type SubmitResult } from '../lib/leaderboard';
import { cloudConfigured, registerAccount } from '../lib/cloud';
import { boardHeadline } from '../lib/board';
import type { SaveData } from '../lib/save';
import Icon from './Icon';

interface BoardPanelProps {
  nickname?: string;
  /** Builds the request from the saved command log. Called when the run is sent. */
  build: (nickname: string) => Submission;
  onNickname: (nickname: string) => void;
  /**
   * Set when there is no account yet. Posting the score also registers the handle and shows the
   * recovery key, once, as part of the same step, instead of a separate screen later.
   */
  registration?: {
    playerId: string;
    save: SaveData;
    onRegistered: (patch: Partial<SaveData>) => void;
  };
}

type State = { phase: 'idle' } | { phase: 'sending' } | { phase: 'done'; result: SubmitResult; recoveryKey?: string; keyOffline?: boolean };

export default function BoardPanel({ nickname, build, onNickname, registration }: BoardPanelProps) {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [draft, setDraft] = useState(nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sent = useRef(false);

  const send = async (name: string) => {
    if (sent.current) return;
    sent.current = true;
    setState({ phase: 'sending' });
    const result = await submitRun(build(name));
    setState({ phase: 'done', result });
  };

  /** First-ever post: create the cloud account (if one can be reached) and post the run in the same step. */
  const registerAndSend = async (name: string, reg: NonNullable<BoardPanelProps['registration']>) => {
    if (sent.current) return;
    sent.current = true;
    setState({ phase: 'sending' });
    if (cloudConfigured()) {
      const result = await registerAccount(reg.playerId, name, { ...reg.save, nickname: name, playerId: reg.playerId });
      if (result.ok) {
        reg.onRegistered({ nickname: name, playerId: reg.playerId, recoveryKey: result.value.recoveryKey, syncToken: result.value.syncToken });
        const submitted = await submitRun(build(name));
        setState({ phase: 'done', result: submitted, recoveryKey: result.value.recoveryKey });
        return;
      }
      // Offline or refused: the handle still saves locally, and a key can be made later from Settings.
      reg.onRegistered({ nickname: name, playerId: reg.playerId, registerSkipped: false });
    } else {
      reg.onRegistered({ nickname: name, registerSkipped: false });
    }
    const submitted = await submitRun(build(name));
    setState({ phase: 'done', result: submitted, keyOffline: true });
  };

  // With a nickname already on file, the run goes up as soon as the panel opens. No form needed.
  useEffect(() => {
    if (!leaderboardConfigured()) {
      setState({ phase: 'done', result: { status: 'offline', reason: 'The global board is not set up on this build. Your score is saved on this device.' } });
      return;
    }
    if (nickname) void send(nickname);
    // send is recreated each render, but this should run once when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    const problem = nicknameProblem(name);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (registration) void registerAndSend(name, registration);
    else {
      onNickname(name);
      void send(name);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (state.phase === 'done' && state.result.status === 'offline' && !state.recoveryKey && !state.keyOffline) {
    return (
      <section className="panel mb-6 p-4 text-sm" aria-label="global board">
        <p className="mb-1 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
          <Icon name="radar" size={16} />
          GLOBAL BOARD
        </p>
        <p>{state.result.reason}</p>
      </section>
    );
  }

  if (!nickname && state.phase === 'idle') {
    return (
      <section className="panel mb-6 p-4 text-sm" aria-label="global board">
        <p className="mb-2 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
          <Icon name="radar" size={16} />
          POST TO THE GLOBAL BOARD
        </p>
        <form onSubmit={pick} className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Nickname</span>
            <input
              className="term-input panel w-full px-3 py-2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={16}
              placeholder="nickname (3-16 characters)"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="btn">
            Post score
          </button>
        </form>
        {error ? <p className="mt-2 text-xs text-[var(--alert)]">{error}</p> : null}
        <p className="mt-2 text-xs text-[var(--dim)]">
          {registration
            ? "Only your nickname and the run leave this device. No account, no email. You'll get a recovery key for this handle right after."
            : 'Only your nickname and the run leave this device. No account, no email.'}
        </p>
      </section>
    );
  }

  return (
    <section className="panel mb-6 p-4 text-sm" aria-label="global board">
      <p className="mb-1 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
        <Icon name="radar" size={16} />
        {state.phase === 'done' ? boardHeadline(state.result) : 'GLOBAL BOARD'}
      </p>
      {state.phase === 'sending' ? <p>Checking your run...</p> : null}

      {state.phase === 'done' && state.recoveryKey ? (
        <div className="my-3 space-y-2 border-l-2 border-[var(--warn)] pl-3">
          <p className="text-xs tracking-widest text-[var(--dim)]">YOUR RECOVERY KEY</p>
          <p className="glow break-all text-lg font-bold tracking-widest">{state.recoveryKey}</p>
          <button type="button" className="btn flex items-center gap-2 text-xs" onClick={() => copy(state.recoveryKey!)}>
            <Icon name="card" size={14} />
            {copied ? 'Copied' : 'Copy key'}
          </button>
          <p className="text-xs text-[var(--warn)]">Save this somewhere safe. It is the only way to get your progress back on another device, and it is shown once.</p>
          <p className="text-xs text-[var(--dim)]">You can see it again on this device in Settings.</p>
        </div>
      ) : null}
      {state.phase === 'done' && state.keyOffline ? (
        <p className="my-2 text-xs text-[var(--dim)]">Cloud save is offline, so your handle is saved on this device only. Make a recovery key from Settings once you are online.</p>
      ) : null}

      {state.phase === 'done' && state.result.status === 'saved' ? (
        <p>
          Verified: <span className="glow">{state.result.score}</span> points on the board
          {state.result.improved ? '' : ' (your best is already higher)'}.
        </p>
      ) : null}
      {state.phase === 'done' && state.result.status === 'rejected' ? <p className="text-[var(--alert)]">Not posted: {state.result.reason}</p> : null}
      {state.phase === 'done' && state.result.status === 'offline' ? <p>{state.result.reason}</p> : null}
    </section>
  );
}
