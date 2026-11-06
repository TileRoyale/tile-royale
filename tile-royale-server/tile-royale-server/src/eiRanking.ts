// Event Island (Patient Angler) leaderboard rules.
//
// Reward brackets match ACI (aciRanking.ts) and the game client (www/event_island.js, EI_LB_TIERS):
// below 100 players the real place counts (1st, 2nd-5th, 6th-10th, 11th-25th), so the winner of a
// 7-player board is never "Top 14%". From 100 players the Top 1% / 5% / 10% / 25% percentile.

export const EI_LB_PERCENT_FROM = 100;

export const EI_LB_BRACKETS = [
  { key: 'top1',  pct: 1,  tokens: 10 },
  { key: 'top5',  pct: 5,  tokens: 5  },
  { key: 'top10', pct: 10, tokens: 3  },
  { key: 'top25', pct: 25, tokens: 1  },
] as const;

export type EiLbBracket = typeof EI_LB_BRACKETS[number]['key'] | 'none';

/** Below 100 players the place itself is the "percent" (place 1 -> Top 1, places 2-5 -> Top 5 ...). */
export function eiLbPercentile(rank: number, total: number): number {
  if (!Number.isInteger(rank) || rank < 1 || !Number.isFinite(total) || total < 1 || rank > total) return Infinity;
  return total < EI_LB_PERCENT_FROM ? rank : (rank / total) * 100;
}

export function eiLbReward(rank: number, total: number): { bracket: EiLbBracket; tokens: number } {
  const p = eiLbPercentile(rank, total);
  const b = EI_LB_BRACKETS.find(x => p <= x.pct);
  return b ? { bracket: b.key, tokens: b.tokens } : { bracket: 'none', tokens: 0 };
}

// Event windows (UTC), copied from EI_EVENTS in the game's www/event_island.js. A NEW EVENT MUST BE
// ADDED HERE TOO, otherwise its scores and leaderboard rewards are rejected.
export const EI_EVENT_WINDOWS: Record<string, { start: number; end: number }> = {
  founders_island:       { start: Date.parse('2026-08-10T10:00:00Z'), end: Date.parse('2026-08-17T10:00:00Z') },
  harvest_island:        { start: Date.parse('2026-09-06T10:00:00Z'), end: Date.parse('2026-09-13T10:00:00Z') },
  november_event_island: { start: Date.parse('2026-11-09T08:00:00Z'), end: Date.parse('2026-11-16T08:00:00Z') },
};

// A score sent a few minutes after the end (slow network, last tick) still counts.
export const EI_SUBMIT_GRACE_MS = 10 * 60 * 1000;

export function eiCanSubmit(eventId: string, now: number): boolean {
  const w = EI_EVENT_WINDOWS[eventId];
  return !!w && now >= w.start && now <= w.end + EI_SUBMIT_GRACE_MS;
}

// The game claims at the exact end moment by its own clock; a phone clock a few minutes ahead of
// the server must not make that claim fail.
export const EI_CLAIM_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Leaderboard rewards are only paid once the event is over. */
export function eiCanClaim(eventId: string, now: number): boolean {
  const w = EI_EVENT_WINDOWS[eventId];
  return !!w && now >= w.end - EI_CLAIM_CLOCK_SKEW_MS;
}
