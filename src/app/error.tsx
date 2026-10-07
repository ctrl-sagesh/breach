'use client';

// Catches a render error anywhere under the root layout, so a crash shows "SYSTEM FAULT" instead of a blank page.
// Styled like the rest of the game; globals.css is still in scope here, since the root layout (which loads it) stays
// mounted around this boundary. See global-error.tsx for the rarer case where the layout itself fails.

import { useEffect } from 'react';
import Icon from '../components/Icon';
import { Header, Screen } from '../components/ui';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[BREACH] system fault:', error);
  }, [error]);

  return (
    <Screen>
      <Header title="SYSTEM FAULT" subtitle="Something in the rig crashed. Your save lives on this device and should still be there." icon="alert" />
      <p className="mb-8 text-sm text-[var(--dim)]">{error.digest ? `Fault code: ${error.digest}` : 'No fault code was given.'}</p>
      <div className="mt-auto flex flex-col gap-3">
        <button type="button" className="btn flex items-center justify-center gap-2" onClick={() => window.location.reload()}>
          <Icon name="reset" size={16} />
          Reload BREACH
        </button>
        <button type="button" className="btn" onClick={reset}>
          Try again without reloading
        </button>
      </div>
    </Screen>
  );
}
