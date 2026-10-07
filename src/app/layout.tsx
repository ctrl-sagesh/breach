import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SITE_URL } from '../lib/site';
import './globals.css';

const TITLE = 'BREACH: a hacking terminal game';
const DESCRIPTION =
  'Take freelance jobs from anonymous clients, breach fake networks with real tools, and mind your trace. A browser terminal game that teaches real security ideas.';

// Structured data for a browser game. See https://schema.org/VideoGame.
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'BREACH',
  description: DESCRIPTION,
  url: SITE_URL,
  image: `${SITE_URL}/og.png`,
  genre: ['Puzzle', 'Simulation', 'Educational'],
  applicationCategory: 'Game',
  operatingSystem: 'Any',
  playMode: 'SinglePlayer',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

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
      <body>
        {children}
        <Analytics />
        {/* eslint-disable-next-line react/no-danger */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      </body>
    </html>
  );
}
