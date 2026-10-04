'use client';

// Posts a finished run to the global board. Asks for a nickname once, then sends the run and shows what the server decided.
// The score shown is the one the server computed. If the board is unreachable, the local score stays and the panel says so.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { nicknameProblem } from '../lib/nickname';
import { leaderboardConfigured, submitRun, type Submission, type SubmitResult } from '../lib/leaderboard';
import Icon from './Icon';

interface BoardPanelProps {
  nickname?: string;
  /** Builds the request from the saved command log. Called when the run is sent. */
  build: (nickname: string) => Submission;
  onNickname: (nickname: string) => void;
}

type State = { phase: 'idle' } | { phase: 'sending' } | { phase: 'done'; result: SubmitResult };

export default function BoardPanel({ nickname, build, onNickname }: BoardPanelProps) {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [draft, setDraft] = useState(nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  const send = async (name: string) => {
    if (sent.current) return;
    sent.current = true;
    setState({ phase: 'sending' });
    const result = await submitRun(build(name));
    setState({ phase: 'done', result });
  };

  // With a nickname on file, the run goes up as soon as the panel opens.
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
    const problem = nicknameProblem(draft.trim());
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onNickname(draft.trim());
    void send(draft.trim());
  };

  if (state.phase === 'done' && state.result.status === 'offline') {
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
        <p className="mt-2 text-xs text-[var(--dim)]">Only your nickname and the run leave this device. No account, no email.</p>
      </section>
    );
  }

  return (
    <section className="panel mb-6 p-4 text-sm" aria-label="global board">
      <p className="mb-1 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
        <Icon name="radar" size={16} />
        GLOBAL BOARD
      </p>
      {state.phase === 'sending' ? <p>Checking your run...</p> : null}
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
