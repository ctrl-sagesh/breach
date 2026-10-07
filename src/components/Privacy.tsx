'use client';

// Privacy, read like a briefing file: what's kept on this device, what the cloud keeps when you register, that there
// are no tracking cookies, and how to ask for your data to be deleted.

import { BUG_REPORT_CONTACT } from '../missions/shared';
import Icon from './Icon';
import { Header, Screen } from './ui';

export default function Privacy({ onBack }: { onBack: () => void }) {
  return (
    <Screen>
      <Header title="PRIVACY" subtitle="What this game keeps, and where. Short, because that's how it should be." icon="lock" />

      <div className="mb-8 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
            <Icon name="terminal" size={16} />
            ON THIS DEVICE
          </h2>
          <p>
            Your progress, achievements, settings, nickname, and the ops log — including the commands you typed — live in this browser&apos;s local
            storage. None of it leaves the device unless you register a handle.
          </p>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
            <Icon name="radar" size={16} />
            IN THE CLOUD, IF YOU REGISTER
          </h2>
          <p className="mb-2">Registering a handle sends: your nickname, a one-way hash of your recovery key, a one-way hash of this device&apos;s sync token, and a copy of your save for syncing. Posting to the global board sends a job&apos;s command log, so the score can be checked by replaying it.</p>
          <p>
            Nothing you send is tied to your name, your email, or any account. The recovery key and sync token are never stored readable on the
            server — only their hashes.
          </p>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
            <Icon name="sound-off" size={16} />
            NO TRACKING COOKIES
          </h2>
          <p>This is a static site. It does not set tracking cookies. Analytics, where enabled, runs without cookies and without identifying you.</p>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-xs tracking-widest text-[var(--dim)]">
            <Icon name="mail" size={16} />
            DELETING YOUR DATA
          </h2>
          <p>
            Clearing this browser&apos;s site data removes everything stored locally. To remove a registered handle and its cloud save, email{' '}
            <a className="underline underline-offset-4" href={`mailto:${BUG_REPORT_CONTACT}`}>
              {BUG_REPORT_CONTACT}
            </a>{' '}
            with your handle or recovery key. There is no self-serve delete yet — a person reads every request.
          </p>
        </section>
      </div>

      <div className="mt-auto">
        <button type="button" className="btn flex w-full items-center justify-center gap-2" onClick={onBack}>
          <Icon name="back" size={16} />
          Back
        </button>
      </div>
    </Screen>
  );
}
