// "Report bug / feedback": builds a mailto link prefilled with the game version, the tier, and the mission when there
// is one. Pure, so the prefill can be checked without opening a mail client.

import type { Tier } from '../engine/types';
import { BUG_REPORT_CONTACT } from '../missions/shared';

export interface FeedbackContext {
  version: string;
  tier: Tier;
  /** The job's codename, when the report comes from a debrief. Omitted from Settings. */
  mission?: string;
}

export function buildFeedbackMailto(ctx: FeedbackContext): string {
  const subject = 'BREACH feedback';
  const lines = [`Version: ${ctx.version}`, `Tier: ${ctx.tier}`];
  if (ctx.mission) lines.push(`Mission: ${ctx.mission}`);
  lines.push('', '(describe the issue or idea here)');
  const body = lines.join('\n');
  return `mailto:${BUG_REPORT_CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
