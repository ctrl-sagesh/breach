// The one place the deployed URL is written down. Everything that needs it — page metadata, the OG image text, the
// share card, robots.txt and sitemap.xml — imports this instead of hardcoding the domain.
// Set NEXT_PUBLIC_SITE_URL when building for a different deployment; this is the production fallback.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://breach-sh.vercel.app';
