// CORS origin matching for the Edge Functions. Pure, so it is tested here in Node and then bundled into the
// functions the same way the engine and the merge logic are (see supabase/functions/_shared/engine-entry.ts).
//
// A pattern may contain one `*`, which matches exactly one subdomain label: `https://*.itch.zone` matches
// `https://html-classic.itch.zone`, but not `https://a.b.itch.zone` (more than one label) and not
// `https://itch.zone.evil.com` or `https://evil.com/?x=itch.zone` (the match is anchored to the whole origin string,
// scheme included, so a pattern cannot be satisfied by a prefix, a suffix or an extra path).

const WILDCARD_LABEL = '[a-zA-Z0-9-]+';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToRegExp(pattern: string): RegExp {
  const parts = pattern.split('*').map(escapeRegExp);
  return new RegExp(`^${parts.join(WILDCARD_LABEL)}$`);
}

/** Splits a comma-separated ALLOWED_ORIGINS value into trimmed, non-empty patterns. */
export function parseAllowedOrigins(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whether `origin` (the browser's Origin header) matches one of the allowed patterns. */
export function originAllowed(origin: string | null, allowed: readonly string[]): boolean {
  if (!origin) return false;
  return allowed.some((pattern) => patternToRegExp(pattern).test(origin));
}

/**
 * CORS headers for one request. Only includes access-control-allow-origin (echoing the exact origin, never `*`) when
 * the origin matches the allow list, with Vary: Origin so caches never mix up responses for different origins.
 * When the origin is missing or not allowed, the headers are still valid to send — the browser just will not let the
 * page read the response, which is the rejection the caller wants.
 */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'content-type, apikey, authorization',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
  if (originAllowed(origin, allowed)) headers['access-control-allow-origin'] = origin as string;
  return headers;
}
