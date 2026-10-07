import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

// Required for output: 'export' — without it, Next treats this route as dynamic and the export fails.
export const dynamic = 'force-static';

// Generated as a static sitemap.xml at build time. The whole game lives on one route (CLAUDE.md), so one entry is right.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 }];
}
