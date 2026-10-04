import type { Metadata, Viewport } from 'next';
import './globals.css';

const TITLE = 'BREACH: a hacking terminal game';
const DESCRIPTION =
  'Take freelance jobs from anonymous clients, breach fake networks with real tools, and mind your trace. A browser terminal game that teaches real security ideas.';

// Social cards need absolute URLs. Set NEXT_PUBLIC_SITE_URL to the deployed address when building.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'BREACH',
  openGraph: {
    type: 'website',
    siteName: 'BREACH',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'BREACH: a hacking terminal game' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#030a05',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="green">
      <body>{children}</body>
    </html>
  );
}
