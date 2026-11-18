'use client';

// About and credits. What BREACH is, what it runs on, and the one promise that matters: nothing here touches a real system.

import { GAME_VERSION } from '../lib/version';
import { BUG_REPORT_CONTACT } from '../missions/shared';
import Icon from './Icon';
import { Header, Screen } from './ui';

export default function About({ onBack }: { onBack: () => void }) {
  return (
    <Screen>
      <Header title="ABOUT" subtitle={`BREACH v${GAME_VERSION}`} icon="help" />

      <div className="mb-8 space-y-6 text-sm leading-relaxed">
        <section>
          <p>
            BREACH is a browser hacking terminal game. You take freelance jobs from anonymous clients, breach fake networks built for the job, and
            learn real security ideas by doing them: weak passwords, bad hashes, SQL injection, social engineering, and the rest of the usual ways
            in. Every machine, file and flag is made up for the mission. <span className="glow">Nothing here touches a real system.</span>
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xs tracking-widest text-[var(--dim)]">BUILT WITH</h2>
          <p>Next.js and TypeScript, rendered as a static site. The soundtrack&apos;s pads and tension layer are synthesised live with the Web Audio API; everything else you hear is a real recording. The global board and cloud save run on Supabase, behind server-side replay checks so a score can&apos;t be faked.</p>
        </section>

        <section>
          <h2 className="mb-2 text-xs tracking-widest text-[var(--dim)]">AUDIO CREDITS</h2>
          <p>
            Interface sounds by <a className="underline underline-offset-4" href="https://kenney.nl/" target="_blank" rel="noreferrer">Kenney</a> (CC0).
            Keyboard, alarm, modem and ambience recordings from <a className="underline underline-offset-4" href="https://freesound.org/" target="_blank" rel="noreferrer">Freesound</a> contributors
            stu556, za-games, wtermini, alphatone, rhinenux, soundandmelodies and music_is_wiggly_air (CC0). Soundtrack &quot;Cyberpunk Drone&quot; by Leberche (Pixabay Content License).
          </p>
          <p className="mt-1 text-xs text-[var(--dim)]">Full list with links in the repository&apos;s assets/audio/LICENSES.md.</p>
        </section>

        <section>
          <h2 className="mb-2 text-xs tracking-widest text-[var(--dim)]">CONTACT</h2>
          <p>
            Bugs, feedback, takedown requests —{' '}
            <a className="underline underline-offset-4" href={`mailto:${BUG_REPORT_CONTACT}`}>
              {BUG_REPORT_CONTACT}
            </a>
            .
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
