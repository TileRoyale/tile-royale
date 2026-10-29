export type AciRewardBracket = 'top1' | 'top3' | 'top5' | 'participant';

export interface AciRewardCutoffs {
  top1: number;
  top3: number;
  top5: number;
}

/**
 * Returns leaderboard cutoffs for ACI rewards.
 *
 * Below 100 participants the actual finishing positions are used: first place
 * is Top 1, places 2-3 are Top 3, and places 4-5 are Top 5. At 100 or more
 * participants the brackets switch to the Top 1% / 3% / 5% percentile model.
 */
export function getAciRewardCutoffs(totalParticipants: number): AciRewardCutoffs {
  const total = Number.isFinite(totalParticipants)
    ? Math.max(0, Math.floor(totalParticipants))
    : 0;
  if (total === 0) return { top1: 0, top3: 0, top5: 0 };

  if (total < 100) {
    return {
      top1: 1,
      top3: Math.min(3, total),
      top5: Math.min(5, total),
    };
  }

  const top1 = Math.max(1, Math.floor(total * 0.01));
  const top3 = Math.max(top1, Math.floor(total * 0.03));
  const top5 = Math.max(top3, Math.floor(total * 0.05));
  return { top1, top3, top5 };
}

export function getAciRewardBracket(rank: number | null, totalParticipants: number): AciRewardBracket {
  if (rank === null || !Number.isInteger(rank) || rank < 1) return 'participant';
  const cutoffs = getAciRewardCutoffs(totalParticipants);
  if (cutoffs.top1 === 0 || rank > Math.floor(totalParticipants)) return 'participant';
  if (rank <= cutoffs.top1) return 'top1';
  if (rank <= cutoffs.top3) return 'top3';
  if (rank <= cutoffs.top5) return 'top5';
  return 'participant';
}
