'use client';

// Last resort: catches an error in the root layout itself, which error.tsx cannot cover (it lives inside that layout).
// This replaces <html> and <body> entirely, so it is kept deliberately plain — no imported components, no dependency
// on globals.css having loaded — because its one job is to never fail itself.

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#030a05', color: '#33ff66', fontFamily: 'Consolas, "Courier New", monospace' }}>
        <main
          style={{
            display: 'flex',
            minHeight: '100dvh',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '1.5rem',
            padding: '1.5rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.25em', margin: 0 }}>SYSTEM FAULT</h1>
          <p style={{ maxWidth: '28rem', fontSize: '0.9rem', color: '#1b7a3a', margin: 0 }}>
            BREACH could not start. Reloading usually fixes it; your save lives on this device and is untouched.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: '1px solid #1fbf4a',
              background: 'transparent',
              color: '#33ff66',
              padding: '0.6rem 1.4rem',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Reload BREACH
          </button>
          <button
            type="button"
            onClick={reset}
            style={{ background: 'none', border: 'none', color: '#1b7a3a', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Try again without reloading
          </button>
        </main>
      </body>
    </html>
  );
}
