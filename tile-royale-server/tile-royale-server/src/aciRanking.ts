export type AciRewardBracket = 'top1' | 'top3' | 'top5' | 'participant';

export interface AciRewardCutoffs {
  top1: number;
  top3: number;
  top5: number;
}

/**
 * Returns conservative leaderboard cutoffs for the ACI percentage rewards.
 *
 * At least the winner always belongs to the top-1% bracket, even when there
 * are fewer than 100 participants. The other percentage brackets use floor,
 * so a small leaderboard does not manufacture extra rewarded positions.
 */
export function getAciRewardCutoffs(totalParticipants: number): AciRewardCutoffs {
  const total = Number.isFinite(totalParticipants)
    ? Math.max(0, Math.floor(totalParticipants))
    : 0;
  if (total === 0) return { top1: 0, top3: 0, top5: 0 };

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
