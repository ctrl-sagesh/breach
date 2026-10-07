import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

// Required for output: 'export' — without it, Next treats this route as dynamic and the export fails.
export const dynamic = 'force-static';

// Generated as a static robots.txt at build time.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
