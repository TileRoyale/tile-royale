export const PA_MYTHIC_ZONES: Record<string, string[]> = {
  pond: ['my_pond_pondkeeper', 'my_pond_grenade'], river: ['my_river_sturgeon', 'my_river_driftwood'],
  lake: ['my_lake_beast', 'my_lake_bell'], bay: ['my_bay_seahorse', 'my_bay_figurehead'],
  sea: ['my_sea_kraken', 'my_sea_buoy'], ocean: ['my_ocean_remora', 'my_ocean_message'],
  trench: ['my_trench_matriarch', 'my_trench_smoker'],
};
export const PA_MYTHIC_MIN_MEAN_DAYS = 7;
export const PA_MYTHIC_MAX_MEAN_DAYS = 90;
export const PA_MYTHIC_COOLDOWN_MS = 17 * 60 * 60 * 1000;
const PA_MYTHIC_UNLOCKS: Record<string, { rod?: string; transport?: string }> = {
  pond: {}, river: { rod:'river_rod', transport:'waders' }, lake: { rod:'lake_rod', transport:'rowing_boat' },
  bay: { rod:'bay_rod', transport:'speedboat' }, sea: { rod:'sea_rod', transport:'fishing_vessel' },
  ocean: { rod:'ocean_rod', transport:'research_vessel' }, trench: { rod:'abyss_rod', transport:'deep_submersible' },
};
export function paMythicActiveZones(save: any): string[] {
  const rods = new Set(Array.isArray(save?.ownedRods) ? save.ownedRods : []);
  const transport = new Set(Array.isArray(save?.ownedTransport) ? save.ownedTransport : []);
  const requested = Array.isArray(save?.activeAutomationZones) ? save.activeAutomationZones : [];
  return [...new Set(requested)].filter((zone): zone is string => {
    if (typeof zone !== 'string' || !PA_MYTHIC_ZONES[zone]) return false;
    const unlock = PA_MYTHIC_UNLOCKS[zone];
    return (!unlock.rod || rods.has(unlock.rod)) && (!unlock.transport || transport.has(unlock.transport));
  }).slice(0, 2);
}
export function paMythicAdvance(progress: number, elapsedMs: number, fortune: number, activeZones: string[]): number {
  if (!activeZones.length) return Math.max(0, progress);
  return Math.max(0, progress) + Math.max(0, elapsedMs) / (paMythicMeanDays(fortune) * 86400000);
}
export function paMythicEligibleElapsed(lastEvalMs: number, nowMs: number, cooldownUntilMs: number | null): number {
  const eligibleFrom = Math.max(lastEvalMs, Number(cooldownUntilMs) || 0);
  return Math.max(0, nowMs - eligibleFrom);
}
export function paMythicPendingZone(activeZones: string[], random = Math.random): string | null {
  if (!activeZones.length) return null;
  return activeZones[Math.min(activeZones.length - 1, Math.floor(Math.max(0, random()) * activeZones.length))];
}
export function paMythicFortune(save: any): number {
  const stats = save?.stats || {};
  const logScore = (value: unknown, cap: number) => Math.min(1, Math.log10(1 + Math.max(0, Number(value) || 0)) / Math.log10(1 + cap));
  const expeditions = (Number(stats.ghostShipExpeditions)||0) + (Number(stats.dvCompleted)||0)
    + (Number(save?.abyssExpeditionsCompleted)||0) + (Number(save?.maelstrom?.stats?.missionsCompleted)||0);
  const fishdexRatio = Math.min(1, (Array.isArray(save?.fishdex) ? new Set(save.fishdex).size : 0) / 517);
  const masteryRatio = Math.min(1, Math.max(0, Number(stats.mythicMasteryRatio) || 0));
  const score =
    20 * logScore(stats.mythicCatchRate, 1e13) +
    15 * logScore(stats.autoCatchTotal, 1e16) +
     7 * logScore(stats.lifeCoinsEarned, 1e24) +
     7 * logScore(stats.lifePearlsEarned, 1e10) +
     6 * logScore(save?.prestigeCount, 40) +
    10 * logScore(stats.totalLegendary, 1e6) +
     8 * logScore(expeditions, 1e4) +
     7 * logScore(stats.islesDiscovered, 300) +
     5 * logScore(stats.totalSeagull, 1e4) +
     5 * logScore(stats.totalCrystalBugs, 1e3) +
     4 * logScore(stats.trophyCatches, 1e4) +
     3 * fishdexRatio +
     3 * masteryRatio;
  return Math.max(0, Math.min(100, Math.round(score)));
}
export function paMythicMeanDays(fortune: number): number {
  const normalized = Math.max(0, Math.min(100, Number(fortune) || 0)) / 100;
  return PA_MYTHIC_MAX_MEAN_DAYS * Math.pow(PA_MYTHIC_MIN_MEAN_DAYS / PA_MYTHIC_MAX_MEAN_DAYS, normalized);
}
export function paMythicTarget(random = Math.random): number {
  const u = Math.min(1 - Number.EPSILON, Math.max(Number.MIN_VALUE, random()));
  return -Math.log(u);
}
export function paMythicPick(zone: string, discoveries: Record<string, number>, random = Math.random): string | null {
  const pool = PA_MYTHIC_ZONES[zone]; if (!pool?.length) return null;
  const weighted = pool.map(id => ({ id, weight: Number(discoveries[id] || 0) > 0 ? 1 : 4 }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of weighted) { roll -= entry.weight; if (roll < 0) return entry.id; }
  return weighted[weighted.length - 1].id;
}
