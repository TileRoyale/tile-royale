import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { TileRoyaleRoom } from "./rooms/TileRoyaleRoom";
import { initDb, getRankingsWeekly, getRankingsAllTime, getPlayerStats, getDbStatus, getGlobalStats, getWorldRecords, getPlayerPercentiles, findPlayerByTag, sendFriendRequest, respondFriendRequest, getFriends, getFriendRequests, getFriendsLeaderboard, getFriendshipStatus, getFavoriteMode, updatePlayerProgress, getNews, getLatestNews, createNewsPost, deleteNewsPost, upsertPlayer, writeGameResult, query, getPlayerNotifications, markNotificationRead, claimNotificationReward, createPlayerNotification, savePlayerData, loadPlayerData, upsertPushToken, getPushTokenCount, checkAndRecordPromoRedemption, getPromoStats, getTrustedDiamonds, setTrustedDiamonds, addTrustedDiamonds, getKothWeeklyLeaderboard, getKothDailyStats, claimKothDailyReward, claimKothWeeklyPrize, recordPurchaseReceipt, getPurchaseReceipt, getProcessedTokens, upsertPracticeScore, getPracticeLeaderboard, createRingGrant, validateRingGrant, createRingTrade, acceptRingTrade, cancelRingTrade } from "./db";
import { google } from "googleapis";

const port   = Number(process.env.PORT   || 3000);
const region = process.env.REGION || "EU";   // EU | NA | ASIA
const app    = express();

// Bump this when releasing a client version that is required (breaks old clients)
const MIN_CLIENT_VERSION = "v0.4.5";

app.use(cors({ origin: '*' }));
app.use(express.json());

// Privacy Policy page
app.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tile Royale – Privacy Policy</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.7; }
  h1 { font-size: 28px; } h2 { font-size: 18px; margin-top: 32px; }
  p, li { font-size: 15px; } ul { padding-left: 20px; }
  footer { margin-top: 48px; font-size: 13px; color: #888; }
</style>
</head>
<body>
<h1>Privacy Policy — Tile Royale</h1>
<p><strong>Last updated: June 2, 2026</strong></p>
<p>Tile Royale ("the Game") is developed and operated by Timo Jakimainen. This Privacy Policy explains what data we collect, why we collect it, and how we use it.</p>

<h2>1. Data We Collect</h2>
<ul>
  <li><strong>Player ID</strong> – A randomly generated anonymous identifier (UUID) created on first launch. No account registration or login is required.</li>
  <li><strong>Player name and avatar</strong> – The display name and emoji avatar you choose in-game.</li>
  <li><strong>Game statistics</strong> – Match results, placements, tiles tapped, reaction times, wins, and similar gameplay data.</li>
  <li><strong>Game save data</strong> – Your progress, currency, owned items, skins, and settings.</li>
  <li><strong>Purchase records</strong> – A record of in-app purchases made through Google Play Billing, including product ID and purchase token. We do not store payment card details.</li>
  <li><strong>Device and ad data</strong> – Google AdMob may collect advertising identifiers and usage data to serve ads. See the <a href="https://policies.google.com/privacy">Google Privacy Policy</a> for details.</li>
  <li><strong>Push notification token</strong> – If you grant notification permission, an FCM token is stored to deliver game notifications.</li>
</ul>

<h2>2. How We Use Your Data</h2>
<ul>
  <li>To run the multiplayer game and display leaderboards and player profiles.</li>
  <li>To save and restore your game progress across devices.</li>
  <li>To verify in-app purchases and prevent fraud.</li>
  <li>To send optional push notifications about game events.</li>
  <li>To display advertisements via Google AdMob.</li>
</ul>

<h2>3. Data Storage</h2>
<p>Game data is stored on a secure server hosted on Railway (railway.app) in the European Union. Data is retained for as long as your account is active. You may request deletion by contacting us.</p>

<h2>4. Data Sharing</h2>
<p>We do not sell your data. We share data only with the following service providers necessary to operate the Game:</p>
<ul>
  <li><strong>Google Play Billing</strong> – for processing in-app purchases.</li>
  <li><strong>Google AdMob</strong> – for displaying advertisements.</li>
  <li><strong>Firebase Cloud Messaging</strong> – for push notifications.</li>
  <li><strong>Railway</strong> – for server hosting and database storage.</li>
</ul>

<h2>5. Children's Privacy</h2>
<p>Tile Royale is not directed at children under 13. We do not knowingly collect personal data from children under 13. If you believe a child has provided us data, please contact us and we will delete it.</p>

<h2>6. Your Rights</h2>
<p>You may request access to, correction of, or deletion of your data at any time by contacting us. Because the Game uses an anonymous Player ID, please include the Player ID shown in your in-game profile when making a request.</p>

<h2>7. Contact</h2>
<p>Email: <a href="mailto:tileroyalegame@gmail.com">tileroyalegame@gmail.com</a></p>

<h2>8. Changes to This Policy</h2>
<p>We may update this policy from time to time. The latest version is always available at this URL.</p>

<footer>© 2026 Henly Games · Tile Royale</footer>
</body>
</html>`);
});

// Health check + region info (clients ping this to measure latency)
app.get("/", (_req, res) => {
  const db = getDbStatus();
  res.json({
    status:      "ok",
    game:        "Tile Royale",
    version:     "1.4.0-wild-mp",
    region,
    timestamp:   Date.now(),
    dbAvailable: db.available,
    dbUrl:       db.urlDetected ? "SET" : "MISSING",
  });
});

// Diagnostic endpoint — shows DB connection status without exposing secrets
app.get("/debug/db", (_req, res) => {
  const db = getDbStatus();
  res.json({
    dbAvailable:  db.available,
    urlDetected:  db.urlDetected,
    error:        db.error,
    note:         db.urlDetected
      ? (db.available ? "Connected and ready" : "URL found but connection failed — see error")
      : "Add a PostgreSQL database in Railway dashboard and link it to this service",
  });
});

// Version gate — client checks this on startup
app.get("/version", (_req, res) => {
  res.json({ minClientVersion: MIN_CLIENT_VERSION });
});

// Ping endpoint — clients GET this to measure HTTP latency
app.get("/ping", (_req, res) => {
  res.json({ pong: true, region, t: Date.now() });
});

// ─── Global Rankings ──────────────────────────────────────────────────────────
// GET /rankings?period=weekly|alltime
// Returns top 50 players ranked by wins, then top3, then avg_placement.
app.get("/rankings", async (req, res) => {
  const period = (req.query.period as string) || "weekly";
  const rows = period === "alltime"
    ? await getRankingsAllTime()
    : await getRankingsWeekly();

  if (rows === null) {
    // DB unavailable — return empty list, not an error
    return res.json({ period, rankings: [], dbAvailable: false });
  }
  res.json({ period, rankings: rows, dbAvailable: true });
});

// GET /playerstats/:playerId
// Returns full stats + rank for one player UUID.
app.get("/playerstats/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!playerId || playerId.length < 10) {
    return res.status(400).json({ error: "Invalid playerId" });
  }

  const stats = await getPlayerStats(playerId);
  if (!stats) {
    return res.json({ playerId, found: false });
  }
  res.json({ playerId, found: true, ...stats });
});

// GET /globalstats — aggregate averages across all players for VS-global comparison
app.get("/globalstats", async (_req, res) => {
  const stats = await getGlobalStats();
  if (!stats) return res.json({ dbAvailable: false });
  res.json({ dbAvailable: true, ...stats });
});

// GET /worldrecords — world-best values with holder name + avatar
app.get("/worldrecords", async (_req, res) => {
  if (!getDbStatus().available) return res.json({ dbAvailable: false });
  const records = await getWorldRecords();
  res.json({ dbAvailable: true, ...records });
});

// GET /publicprofile/:playerId?viewerId=xxx
// Full public profile: stats + rank + favorite mode + world record badges + friendship status.
app.get("/publicprofile/:playerId", async (req, res) => {
  const { playerId } = req.params;
  const viewerId = (req.query.viewerId as string) || null;

  if (!playerId || playerId.length < 10) {
    return res.status(400).json({ error: "Invalid playerId" });
  }
  if (!getDbStatus().available) {
    return res.json({ found: false, dbAvailable: false });
  }

  const [stats, favoriteMode, records, friendshipStatus] = await Promise.all([
    getPlayerStats(playerId),
    getFavoriteMode(playerId),
    getWorldRecords(),
    viewerId && viewerId !== playerId ? getFriendshipStatus(viewerId, playerId) : Promise.resolve(viewerId === playerId ? 'self' : 'none'),
  ]);

  if (!stats) return res.json({ found: false });

  // Determine world record badges
  const world_record_badges: string[] = [];
  if (records.fastest_reaction_player_id  === playerId) world_record_badges.push('fastest_reaction');
  if (records.most_wins_player_id         === playerId) world_record_badges.push('most_wins');
  if (records.longest_win_streak_player_id=== playerId) world_record_badges.push('longest_win_streak');
  if (records.most_tiles_tapped_player_id === playerId) world_record_badges.push('most_tiles_tapped');
  if (records.most_weekly_wins_player_id  === playerId) world_record_badges.push('weekly_champion');

  res.json({
    found:                true,
    player_id:            stats.player_id,
    player_tag:           stats.player_tag,
    player_name:          stats.player_name,
    avatar:               stats.avatar,
    weekly_rank:          stats.weekly_rank,
    alltime_rank:         stats.rank,
    games:                stats.games,
    wins:                 stats.wins,
    win_rate:             stats.win_rate,
    avg_placement:        stats.avg_placement,
    best_win_streak:      stats.best_win_streak,
    fastest_reaction_ms:  stats.fastest_reaction_ms,
    total_tiles_tapped:   stats.total_tiles_tapped,
    favorite_mode:        favoriteMode,
    world_record_badges,
    trophy_points:        stats.trophy_points,
    achievement_count:    stats.achievement_count,
    achievement_total:    stats.achievement_total,
    created_at:           stats.created_at,
    last_seen_at:         stats.last_seen_at,
    friendship_status:    friendshipStatus,
  });
});

// POST /friends/add — add friend by player_id (used by public profile overlay)
app.post("/friends/add", async (req, res) => {
  const { requesterId, targetId } = req.body;
  if (!requesterId || !targetId) return res.json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available)  return res.json({ ok: false, error: 'db_unavailable' });
  const status = await sendFriendRequest(requesterId, targetId);
  res.json({ ok: status === 'sent', status });
});

// POST /playerprogress — lightweight sync of trophy points + achievement summary + diamonds from client
app.post("/playerprogress", async (req, res) => {
  const { playerId, trophy_points, achievement_count, achievement_total, diamonds } = req.body;
  if (!playerId || playerId.length < 10) return res.json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available)          return res.json({ ok: false, error: 'db_unavailable' });

  const pts   = Math.max(0, Math.min(Number(trophy_points)     || 0, 99999));
  const count = Math.max(0, Math.min(Number(achievement_count) || 0, 9999));
  const total = Math.max(1, Math.min(Number(achievement_total) || 108, 9999));
  const gems  = Math.max(0, Math.min(Number(diamonds)          || 0, 9999999));

  await updatePlayerProgress(playerId, pts, count, total, gems);
  res.json({ ok: true });
});

// GET /playerpercentiles/:playerId — per-stat percentile vs all players
app.get("/playerpercentiles/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!getDbStatus().available) return res.json({ dbAvailable: false, found: false });
  const pcts = await getPlayerPercentiles(playerId);
  if (!pcts) return res.json({ dbAvailable: true, found: false });
  res.json({ dbAvailable: true, found: true, ...pcts });
});

// ─── News & Announcements ─────────────────────────────────────────────────────

// GET /news — latest 20 active posts (pinned first)
app.get("/news", async (_req, res) => {
  if (!getDbStatus().available) return res.json({ posts: [], dbAvailable: false });
  const posts = await getNews();
  res.json({ posts, dbAvailable: true });
});

// GET /news/latest — single newest active post (for startup popup check)
app.get("/news/latest", async (_req, res) => {
  if (!getDbStatus().available) return res.json({ post: null, dbAvailable: false });
  const post = await getLatestNews();
  res.json({ post: post ?? null, dbAvailable: true });
});

// Admin middleware — checks X-Admin-Key header against ADMIN_KEY env var
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = process.env.ADMIN_KEY;
  if (!key)                          return res.status(503).json({ error: 'admin_not_configured' });
  if (req.headers['x-admin-key'] !== key) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// POST /admin/news — create a news post
// Body: { title, body, type?, image_url?, expires_at?, pinned? }
app.post("/admin/news", requireAdmin, async (req, res) => {
  const { title, body, type = 'news', image_url = null, expires_at = null, pinned = false } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  if (!getDbStatus().available) return res.status(503).json({ error: 'db_unavailable' });
  const post = await createNewsPost(title, body, type, image_url, expires_at, !!pinned);
  if (!post) return res.status(500).json({ error: 'insert failed' });
  res.status(201).json({ ok: true, post });
});

// DELETE /admin/news/:id — remove a post
app.delete("/admin/news/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'invalid id' });
  if (!getDbStatus().available) return res.status(503).json({ error: 'db_unavailable' });
  const deleted = await deleteNewsPost(id);
  res.json({ ok: deleted });
});

// ─── Friends System ──────────────────────────────────────────────────────────

// POST /friends/request  { requesterId, targetTag }
app.post("/friends/request", async (req, res) => {
  const { requesterId, targetTag } = req.body;
  if (!requesterId || targetTag == null) return res.json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available)          return res.json({ ok: false, error: 'db_unavailable' });

  const tag = parseInt(String(targetTag).replace('#', ''), 10);
  if (isNaN(tag) || tag < 1000 || tag > 9999) return res.json({ ok: false, status: 'invalid_tag' });

  const target = await findPlayerByTag(tag);
  if (!target) return res.json({ ok: false, status: 'not_found' });

  const status = await sendFriendRequest(requesterId, target.player_id);
  res.json({ ok: status === 'sent', status, targetName: target.player_name, targetTag: target.player_tag });
});

// POST /friends/respond  { targetId, requesterId, action: 'accept'|'decline' }
app.post("/friends/respond", async (req, res) => {
  const { targetId, requesterId, action } = req.body;
  if (!targetId || !requesterId || !['accept','decline'].includes(action))
    return res.json({ ok: false, error: 'invalid_params' });
  if (!getDbStatus().available) return res.json({ ok: false, error: 'db_unavailable' });
  const ok = await respondFriendRequest(targetId, requesterId, action as 'accept' | 'decline');

  if (ok && action === 'accept') {
    const REFERRAL_REWARD = 100;
    const [targetStats, requesterStats] = await Promise.all([
      getPlayerStats(targetId),
      getPlayerStats(requesterId),
    ]);
    const targetName    = targetStats?.player_name    || 'A player';
    const requesterName = requesterStats?.player_name || 'A player';

    // Reward the requester (sent the request)
    createPlayerNotification(
      requesterId,
      '🤝 Friend Added!',
      `${targetName} accepted your friend request. Claim your referral reward!`,
      'friend',
      'diamonds',
      REFERRAL_REWARD
    ).catch(() => {});

    // Reward the accepter
    createPlayerNotification(
      targetId,
      '🤝 New Friend!',
      `You and ${requesterName} are now friends. Claim your reward!`,
      'friend',
      'diamonds',
      REFERRAL_REWARD
    ).catch(() => {});
  }

  res.json({ ok });
});

// IMPORTANT: /friends/requests/:id must be declared BEFORE /friends/:id to avoid route conflict
// GET /friends/requests/:playerId
app.get("/friends/requests/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!getDbStatus().available) return res.json({ requests: [], dbAvailable: false });
  const requests = await getFriendRequests(playerId);
  res.json({ requests, dbAvailable: true });
});

// GET /friends/:playerId/leaderboard?period=weekly|alltime
app.get("/friends/:playerId/leaderboard", async (req, res) => {
  const { playerId } = req.params;
  const period = req.query.period === 'weekly' ? 'weekly' : 'alltime';
  if (!getDbStatus().available) return res.json({ rankings: [], dbAvailable: false });
  const rankings = await getFriendsLeaderboard(playerId, period);
  res.json({ rankings, dbAvailable: true });
});

// GET /friends/:playerId
app.get("/friends/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!getDbStatus().available) return res.json({ friends: [], dbAvailable: false });
  const friends = await getFriends(playerId);
  res.json({ friends, dbAvailable: true });
});

// ─── Player Inbox / Notifications ────────────────────────────────────────────

// GET /notifications/:playerId — newest-first, max 50
app.get("/notifications/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!playerId || playerId.length < 10) return res.status(400).json({ error: 'invalid_player' });
  if (!getDbStatus().available) return res.json({ notifications: [], dbAvailable: false });
  const notifications = await getPlayerNotifications(playerId);
  res.json({ notifications, dbAvailable: true });
});

// POST /notifications/read  { notificationId, playerId }
app.post("/notifications/read", async (req, res) => {
  const { notificationId, playerId } = req.body;
  if (!notificationId || !playerId) return res.status(400).json({ error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: false, error: 'db_unavailable' });
  const ok = await markNotificationRead(Number(notificationId), String(playerId));
  res.json({ ok });
});

// POST /notifications/claim  { notificationId, playerId }
app.post("/notifications/claim", async (req, res) => {
  const { notificationId, playerId } = req.body;
  if (!notificationId || !playerId) return res.status(400).json({ error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: false, error: 'db_unavailable' });
  const result = await claimNotificationReward(Number(notificationId), String(playerId));
  if (!result) return res.json({ ok: false, error: 'not_claimable' });
  // Raise trusted ceiling for server-issued diamond rewards
  if (result.reward_type === 'diamonds' && result.reward_amount > 0) {
    addTrustedDiamonds(String(playerId), Number(result.reward_amount)).catch(() => {});
  }
  res.json({ success: true, reward_type: result.reward_type, reward_amount: result.reward_amount });
});

// POST /admin/notification — send a notification to a player
// Body: { playerId, title, body, type?, reward_type?, reward_amount? }
app.post("/admin/notification", requireAdmin, async (req, res) => {
  const { playerId, title, body, type = 'message', reward_type = null, reward_amount = null } = req.body;
  if (!playerId || !title || !body) return res.status(400).json({ error: 'playerId, title and body are required' });
  if (!getDbStatus().available) return res.status(503).json({ error: 'db_unavailable' });
  const notif = await createPlayerNotification(
    String(playerId), String(title), String(body), String(type),
    reward_type ? String(reward_type) : null,
    reward_amount != null ? Number(reward_amount) : null
  );
  if (!notif) return res.status(500).json({ error: 'insert failed' });
  res.status(201).json({ ok: true, notification: notif });
});

// ─── End-to-end validation endpoint ─────────────────────────────────────────
// Inserts synthetic data, runs all queries, reports results, then cleans up.
// Safe to call repeatedly.
app.get("/validate", async (_req, res) => {
  const TEST_ID   = "00000000-0000-4000-a000-000000000001";
  const TEST_NAME = "_validate_player_";
  const results: Record<string, any> = {};

  if (!getDbStatus().available) {
    return res.json({ error: "DB not available" });
  }

  try {
    // ── Step 1: Player registration ──────────────────────────────────────────
    await upsertPlayer(TEST_ID, TEST_NAME, "🧪");
    const pRows = await query("SELECT * FROM players WHERE player_id = $1", [TEST_ID]);
    results.playerRegistering = pRows && pRows.length === 1 ? "YES" : "NO";
    results.playerRow = pRows?.[0] ?? null;

    // Upsert again with name change — must not create duplicate
    await upsertPlayer(TEST_ID, TEST_NAME + "_renamed", "🧪");
    const pRows2 = await query("SELECT * FROM players WHERE player_id = $1", [TEST_ID]);
    results.noDuplicateOnRename = pRows2?.length === 1 ? "YES" : "NO";

    // ── Step 2: Game result recording ────────────────────────────────────────
    // 3 games: 1st, 2nd, 3rd
    await writeGameResult(TEST_ID, 1, 30, "rush",     { tilesTapped: 25, avgReactionMs: 310, bestReactionMs: 180 });
    await writeGameResult(TEST_ID, 2, 30, "wild",     { tilesTapped: 19, avgReactionMs: 380, bestReactionMs: 220 });
    await writeGameResult(TEST_ID, 3, 30, "buckshot", { tilesTapped: 12, avgReactionMs: 420, bestReactionMs: 260 });
    const grRows = await query(
      "SELECT * FROM game_results WHERE player_id = $1 ORDER BY played_at", [TEST_ID]);
    results.matchResultsSaving = grRows && grRows.length === 3 ? "YES" : "NO";
    results.sampleRows = grRows?.slice(0,3) ?? [];

    // ── Step 3+4: Rankings + player stats ────────────────────────────────────
    const weekly  = await getRankingsWeekly();
    const alltime = await getRankingsAllTime();
    const myEntry = alltime?.find((r: any) => r.player_id === TEST_ID);

    results.weeklyRankingsWorking  = weekly  !== null ? "YES" : "NO";
    results.alltimeRankingsWorking = alltime !== null ? "YES" : "NO";
    results.rankingEntry = myEntry ?? null;

    const stats = await getPlayerStats(TEST_ID);
    results.playerStatsWorking = stats ? "YES" : "NO";
    results.playerStats = stats;

    // ── Validation checks ────────────────────────────────────────────────────
    results.checks = {
      wins:           myEntry?.wins        == 1    ? "✅" : `❌ got ${myEntry?.wins}`,
      games:          myEntry?.games       == 3    ? "✅" : `❌ got ${myEntry?.games}`,
      top3:           myEntry?.top3        == 3    ? "✅" : `❌ got ${myEntry?.top3}`,
      top5:           myEntry?.top5        == 3    ? "✅" : `❌ got ${myEntry?.top5}`,
      avgPlacement:   myEntry?.avg_placement == "2.00" ? "✅" : `❌ got ${myEntry?.avg_placement}`,
      winRate:        myEntry?.win_rate    == "33.3" ? "✅" : `❌ got ${myEntry?.win_rate}`,
      tilesTapped:    stats?.total_tiles_tapped == 56 ? "✅" : `❌ got ${stats?.total_tiles_tapped}`,
      fastestReaction:stats?.fastest_reaction_ms == 180 ? "✅" : `❌ got ${stats?.fastest_reaction_ms}`,
      bestStreak:     stats?.best_win_streak == 1  ? "✅" : `❌ got ${stats?.best_win_streak}`,
      rank:           stats?.rank != null          ? "✅" : "❌ missing",
      weeklyRank:     stats?.weekly_rank != null   ? "✅" : "❌ missing",
    };

  } catch (e: any) {
    results.error = e?.message ?? String(e);
  } finally {
    // ── Cleanup — remove test data ────────────────────────────────────────────
    await query("DELETE FROM game_results WHERE player_id = $1", [TEST_ID]);
    await query("DELETE FROM players     WHERE player_id = $1", [TEST_ID]);
    results.cleaned = true;
  }

  const allOk = Object.values(results.checks ?? {}).every(v => String(v).startsWith("✅"));
  results.READY_FOR_PHASE_2 = allOk ? "YES" : "NO — see checks";

  res.json(results);
});

// ─── Promo Codes (server-side only — never sent to client) ────────────────────

const PROMO_CODES: Record<string, {
  diamonds?: number;
  items?: Record<string, number>;
  skins?: string[];
  action?: string;
  desc: string;
  maxUses: number;
  expires?: string;
  dev?: boolean;
}> = {
  'WELCOME2025':  { diamonds: 500,  items: { crystal: 2, caltrops: 2 },        desc: 'Welcome gift!',                       maxUses: 999999 },
  'TILEROYALE':   { diamonds: 1000, items: { crystal: 3 },                      desc: 'Official launch bonus!',              maxUses: 999999 },
  'SUMMER2025':   { diamonds: 750,  items: { caltrops: 3 },                     desc: 'Summer campaign reward',              maxUses: 999999, expires: '2025-09-01' },
  'WILDMODE':     { diamonds: 300,  items: { shadow_tile: 3 },                  desc: 'Wild mode launch reward',             maxUses: 999999 },
  'KOTHWEEK1':    { diamonds: 500,  items: { crystal: 1, caltrops: 1 },         desc: 'King of the Hill launch!',            maxUses: 999999 },
  'WHALE4EVER':   { diamonds: 2000, items: { shadow_tile: 5 },                  desc: 'Whale appreciation gift 🐋',          maxUses: 999999 },
  'BUGFIX':       { diamonds: 200,                                               desc: 'Thanks for your patience!',           maxUses: 999999 },
  'RAZ4WIN':      { action: 'koth_top3',                                        desc: 'KOTH Top 3 status + Custom Lobby unlock', maxUses: 999999 },
  'DEV-GEMS':     { diamonds: 10000,                                             desc: 'Dev: +10 000 diamonds',               maxUses: 999999, dev: true },
  'DEV-LEVEL10':  { action: 'level10',                                          desc: 'Dev: Set Level 10',                   maxUses: 999999, dev: true },
  'DEV-GAUNTLET': { action: 'gauntlet',                                         desc: 'Dev: Open Gauntlet',                  maxUses: 999999, dev: true },
};

// POST /promo/redeem  { playerId, code }
app.post("/promo/redeem", async (req, res) => {
  const { playerId, code: rawCode } = req.body;

  if (!playerId || typeof playerId !== 'string')
    return res.json({ ok: false, error: 'missing_player' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!rawCode || typeof rawCode !== 'string')
    return res.json({ ok: false, error: 'missing_code' });

  const code  = rawCode.trim().toUpperCase();
  const promo = PROMO_CODES[code];

  if (!promo)
    return res.json({ ok: false, error: 'invalid_code' });
  if (promo.expires && new Date() > new Date(promo.expires))
    return res.json({ ok: false, error: 'expired' });
  // Dev codes skip redemption recording — reusable indefinitely for testing
  if (!promo.dev) {
    if (!getDbStatus().available)
      return res.json({ ok: false, error: 'db_unavailable' });
    const result = await checkAndRecordPromoRedemption(playerId, code);
    if (result === 'already_redeemed') return res.json({ ok: false, error: 'already_redeemed' });
    if (result === 'error')            return res.json({ ok: false, error: 'server_error' });
  }

  const reward: Record<string, any> = {};
  if (promo.diamonds) reward.diamonds = promo.diamonds;
  if (promo.items)    reward.items    = promo.items;
  if (promo.skins)    reward.skins    = promo.skins;
  if (promo.action)   reward.action   = promo.action;

  // Raise the trusted ceiling so the next save isn't rejected for this legitimate gain
  if (promo.diamonds) addTrustedDiamonds(playerId, promo.diamonds).catch(() => {});

  res.json({ ok: true, desc: promo.desc, reward });
});

// GET /admin/promo/stats — redemption counts per code
app.get("/admin/promo/stats", requireAdmin, async (_req, res) => {
  if (!getDbStatus().available) return res.json({ stats: [], dbAvailable: false });
  const stats = await getPromoStats();
  res.json({ stats, dbAvailable: true });
});

// ─── Push Token Registration ──────────────────────────────────────────────────

// POST /push/register  { playerId, token, platform }
app.post("/push/register", async (req, res) => {
  const { playerId, token, platform } = req.body;
  if (!playerId || !token || typeof token !== 'string')
    return res.json({ success: false, error: 'missing_params' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ success: false, error: 'invalid_player' });
  if (token.length < 10 || token.length > 500)
    return res.json({ success: false, error: 'invalid_token' });
  if (!getDbStatus().available) return res.json({ success: false, error: 'db_unavailable' });
  const ok = await upsertPushToken(playerId, token, String(platform || 'android'));
  res.json({ success: ok });
});

// GET /admin/push/count — total registered push tokens
app.get("/admin/push/count", requireAdmin, async (_req, res) => {
  if (!getDbStatus().available) return res.json({ totalTokens: 0, dbAvailable: false });
  const totalTokens = await getPushTokenCount();
  res.json({ totalTokens, dbAvailable: true });
});

// ─── Cloud Save ────────────────────────────────────────────────────────────────

// POST /save — upsert full game state for a player
app.post("/save", async (req, res) => {
  const { playerId, saveData } = req.body;
  if (!playerId || typeof playerId !== 'string' || !saveData) {
    res.status(400).json({ ok: false, error: 'Missing playerId or saveData' }); return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId)) {
    res.status(400).json({ ok: false, error: 'Invalid playerId' }); return;
  }

  // ── Economy integrity: validate + clamp diamonds ──────────────────────────
  // MAX_CLIENT_EARN covers all legitimate client-side earnings per save period:
  // achievements, daily challenges, offline rewards, surprise drops, etc.
  const MAX_CLIENT_EARN = 5000;
  let finalData = saveData;
  let adjustedDiamonds: number | undefined;

  if (getDbStatus().available) {
    const incoming = Math.max(0, Math.floor(Number(saveData.diamonds) || 0));
    const trusted  = await getTrustedDiamonds(playerId);

    if (trusted === null) {
      // First save: estimate the maximum legitimate diamonds from server-side game history
      // so a fresh-install exploit (edit localStorage → save) cannot anchor an inflated ceiling.
      //
      //   BASE_PURCHASE  = covers the largest possible in-app purchase stack
      //                    (Deep Ocean Bundle: 30k + all diamond packages: ~30k ≈ 60k total)
      //   PER_GAME       = generous daily-cap approximation per game result on record
      //
      // NOTE: once billing is server-validated, purchased amounts will be added via
      // addTrustedDiamonds() before this save arrives, making BASE_PURCHASE irrelevant
      // for that path. Until then, this cap must stay above the max single-session purchase.
      const BASE_PURCHASE = 100_000;   // covers all realistic IAP stacks; still stops 999k+ exploits
      const PER_GAME_BOOTSTRAP = 80;
      const gameCountRows = await query(
        `SELECT COUNT(*)::INT AS cnt FROM game_results WHERE player_id = $1`,
        [playerId]
      );
      const gamesOnRecord = gameCountRows?.[0]?.cnt ?? 0;
      const allowedMax = BASE_PURCHASE + gamesOnRecord * PER_GAME_BOOTSTRAP;

      const cappedIncoming = Math.min(incoming, allowedMax);
      if (incoming > allowedMax) {
        adjustedDiamonds = cappedIncoming;
        finalData = { ...saveData, diamonds: cappedIncoming };
        console.warn(`[Economy] first-save cap ${playerId}: ${incoming} → ${cappedIncoming} (games on record: ${gamesOnRecord})`);
      }
      await setTrustedDiamonds(playerId, cappedIncoming);
    } else if (incoming > trusted + MAX_CLIENT_EARN) {
      // Suspicious jump — cap to trusted ceiling, log for monitoring
      adjustedDiamonds = trusted;
      finalData = { ...saveData, diamonds: trusted };
      console.warn(`[Economy] diamond cap ${playerId}: ${incoming} → ${trusted}`);
    } else {
      // Legitimate gain — advance the trusted ceiling
      await setTrustedDiamonds(playerId, incoming);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  let saveJson: string;
  try {
    saveJson = JSON.stringify(finalData);
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid saveData' }); return;
  }
  if (saveJson.length > 1_000_000) {
    res.status(400).json({ ok: false, error: 'Save data too large (max 1 MB)' }); return;
  }
  const ok = await savePlayerData(playerId, saveJson);
  const resp: Record<string, any> = { ok: ok ?? false };
  if (adjustedDiamonds !== undefined) resp.adjustedDiamonds = adjustedDiamonds;
  res.json(resp);
});

// GET /save/:playerId — load cloud save
app.get("/save/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId)) {
    res.json({ found: false }); return;
  }
  const result = await loadPlayerData(playerId);
  if (!result) { res.json({ found: false }); return; }
  try {
    const saveData = JSON.parse(result.saveJson);
    // Return the server-trusted diamond value so the client can apply it as override
    const trusted = getDbStatus().available ? await getTrustedDiamonds(playerId) : null;
    const resp: Record<string, any> = { found: true, saveData, updatedAt: result.updatedAt };
    if (trusted !== null) resp.trustedDiamonds = trusted;
    res.json(resp);
  } catch {
    res.json({ found: false });
  }
});

// ─── KOTH Leaderboard ────────────────────────────────────────────────────────

// GET /koth/leaderboard?playerId=xxx&period=current|prev
// Returns weekly top-20 leaderboard + player's rank, and (for current) daily percentile.
// period=prev queries the week that just ended — used by the client for prize distribution.
app.get("/koth/leaderboard", async (req, res) => {
  const playerId = (req.query.playerId as string) || '';
  const period   = (req.query.period  as string) === 'prev' ? 'prev' : 'current';

  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId)) {
    return res.status(400).json({ error: 'invalid_player' });
  }
  if (!getDbStatus().available) {
    return res.json({ dbAvailable: false, weekly: [], playerWeeklyRank: null, playerWeeklyWins: 0, daily: null });
  }

  const timeFilter = period === 'prev'
    ? `AND played_at >= date_trunc('week', now() - interval '7 days') AND played_at < date_trunc('week', now())`
    : `AND played_at >= date_trunc('week', now())`;

  const [weeklyData, dailyStats, poolRows] = await Promise.all([
    getKothWeeklyLeaderboard(playerId, period),
    period === 'current' ? getKothDailyStats(playerId) : Promise.resolve(null),
    query(`SELECT COUNT(*)::INT AS cnt FROM game_results WHERE mode = 'koth' ${timeFilter}`),
  ]);

  // Pool = game count × entry_fee × pool_pct (50 × 0.5 = 25 per game row)
  const serverPool = Math.floor((poolRows?.[0]?.cnt ?? 0) * 25);

  res.json({
    dbAvailable:      true,
    weekly:           weeklyData?.weekly          ?? [],
    playerWeeklyRank: weeklyData?.playerRank      ?? null,
    playerWeeklyWins: weeklyData?.playerWins      ?? 0,
    daily:            dailyStats,
    serverPool,
  });
});

// POST /koth/daily/claim  { playerId }
// Server validates today's percentile and grants the daily reward — idempotent via DB unique constraint.
app.post("/koth/daily/claim", async (req, res) => {
  const { playerId } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId)) {
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  }
  if (!getDbStatus().available) {
    return res.json({ ok: false, reason: 'db_unavailable' });
  }
  const result = await claimKothDailyReward(playerId);
  if (!result) return res.json({ ok: false, reason: 'server_error' });
  res.json(result);
});

// POST /koth/prizes/claim  { playerId, weekStart }
// Server validates last week's rank and grants the prize — idempotent via DB unique constraint.
// weekStart: ISO Monday date "YYYY-MM-DD" (UTC)
app.post("/koth/prizes/claim", async (req, res) => {
  const { playerId, weekStart } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId)) {
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  }
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.status(400).json({ ok: false, error: 'invalid_week_start' });
  }
  if (!getDbStatus().available) {
    return res.json({ ok: false, reason: 'db_unavailable' });
  }
  const result = await claimKothWeeklyPrize(playerId, weekStart);
  if (!result) return res.json({ ok: false, reason: 'server_error' });
  res.json(result);
});

// ─── Ring System ─────────────────────────────────────────────────────────────

// Server-side ring pool — mirrors client RINGS array (100 rings, indices 0-99).
const RING_RARITIES_SERVER = [
  { id: 'secret',    prob: 0.0001 },
  { id: 'legendary', prob: 0.001  },
  { id: 'epic',      prob: 0.05   },
  { id: 'rare',      prob: 0.15   },
  { id: 'uncommon',  prob: 0.30   },
  { id: 'common',    prob: 0.4989 },
];
const RING_RARITY_RANGES: Record<string, [number, number]> = {
  secret:    [0,  1],   // ring_0 .. ring_1
  legendary: [2,  11],  // ring_2 .. ring_11
  epic:      [12, 36],  // ring_12 .. ring_36
  rare:      [37, 66],  // ring_37 .. ring_66
  uncommon:  [67, 79],  // ring_67 .. ring_79
  common:    [80, 99],  // ring_80 .. ring_99
};

function _serverRollRarity(): string {
  const r = Math.random();
  let cumulative = 0;
  for (const rar of RING_RARITIES_SERVER) {
    cumulative += rar.prob;
    if (r < cumulative) return rar.id;
  }
  return 'common';
}

function _serverRollRing(rarityId: string): string {
  const [lo, hi] = RING_RARITY_RANGES[rarityId] || [80, 99];
  const idx = lo + Math.floor(Math.random() * (hi - lo + 1));
  return `ring_${idx}`;
}

// POST /ring/spin  { playerId, spinType }
// Server rolls the rarity and ring, records in ring_grants, returns to client.
// spinType: 'free' | 'freeSpin' | 'ad' | 'diamond'
app.post("/ring/spin", async (req, res) => {
  const { playerId, spinType = 'free' } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });

  const rarityId = _serverRollRarity();
  const ringId   = _serverRollRing(rarityId);
  const grantId  = await createRingGrant(playerId, ringId, rarityId, String(spinType));

  if (!grantId) return res.json({ ok: false, error: 'grant_failed' });
  res.json({ ok: true, ringId, rarityId, grantId });
});

// POST /ring/trade/create  { playerId, grantId, ringId }
// Validates the grant and creates a trade code.
app.post("/ring/trade/create", async (req, res) => {
  const { playerId, grantId, ringId } = req.body;
  if (!playerId || !grantId || !ringId)
    return res.json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });

  const status = await validateRingGrant(String(grantId), String(playerId), String(ringId));
  if (status !== 'ok') return res.json({ ok: false, error: status });

  const tradeCode = await createRingTrade(String(playerId), String(grantId), String(ringId));
  if (!tradeCode) return res.json({ ok: false, error: 'trade_create_failed' });

  res.json({ ok: true, tradeCode });
});

// POST /ring/trade/accept  { claimerPlayerId, tradeCode }
// Validates the trade code and transfers the ring + new grant to the claimer.
app.post("/ring/trade/accept", async (req, res) => {
  const { claimerPlayerId, tradeCode } = req.body;
  if (!claimerPlayerId || !tradeCode)
    return res.json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });

  const result = await acceptRingTrade(String(claimerPlayerId), String(tradeCode).toUpperCase());
  if (result === 'not_found') return res.json({ ok: false, error: 'code_not_found' });
  if (result === 'expired')   return res.json({ ok: false, error: 'code_expired' });
  if (result === 'self')      return res.json({ ok: false, error: 'cannot_trade_with_self' });
  if (!result)                return res.json({ ok: false, error: 'server_error' });

  res.json({ ok: true, ringId: result.ringId, rarityId: result.rarityId, grantId: result.newGrantId });
});

// POST /ring/trade/cancel  { playerId, tradeCode }
// Cancels a trade — returns the grant to 'held' status.
app.post("/ring/trade/cancel", async (req, res) => {
  const { playerId, tradeCode } = req.body;
  if (!playerId || !tradeCode)
    return res.json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });

  const ok = await cancelRingTrade(String(playerId), String(tradeCode).toUpperCase());
  res.json({ ok });
});

// ─── Practice Mode Leaderboard ───────────────────────────────────────────────

// POST /practice/score  { playerId, playerName, avatar, taps30s, reactionMs }
// Submits a practice result — server keeps personal bests only (UPSERT).
app.post("/practice/score", async (req, res) => {
  const { playerId, playerName, avatar, taps30s, reactionMs } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.json({ ok: false, error: 'db_unavailable' });

  const t = Math.max(0, Math.min(Number(taps30s)   || 0, 999));
  const r = Math.max(0, Math.min(Number(reactionMs) || 0, 9999));
  const name   = String(playerName  || 'Player').substring(0, 16);
  const av     = String(avatar      || '🔥').substring(0, 10);

  await upsertPracticeScore(playerId, name, av, t, r);
  res.json({ ok: true });
});

// GET /practice/leaderboard — top 10 by taps and top 10 by reaction
app.get("/practice/leaderboard", async (_req, res) => {
  if (!getDbStatus().available) return res.json({ dbAvailable: false, taps: [], reaction: [] });
  const lb = await getPracticeLeaderboard();
  if (!lb) return res.json({ dbAvailable: false, taps: [], reaction: [] });
  res.json({ dbAvailable: true, taps: lb.taps, reaction: lb.reaction });
});

// ─── IAP Purchase Verification ───────────────────────────────────────────────

const PACKAGE_NAME = "com.tileroyale.game";

// Server-authoritative product catalog — must match client shop.js exactly.
// diamonds = total granted (amount + bonus combined).
const PRODUCT_CATALOG: Record<string, {
  type:         'diamonds' | 'bundle';
  bundleId?:    string;
  diamonds:     number;
  items?:       Record<string, number>;
  skins?:       string[];
  tickets?:     number;
  nameChanges?: number;
  whaleBadge?:  boolean;
  priceVal:     number;
}> = {
  'd.starter':       { type:'diamonds', diamonds:250,   priceVal:1.99  },
  'd.popular':       { type:'diamonds', diamonds:700,   priceVal:4.99  },
  'd.value':         { type:'diamonds', diamonds:1500,  priceVal:9.99  },
  'd.mega':          { type:'diamonds', diamonds:3200,  priceVal:19.99 },  // 2800+400
  'd.ultra':         { type:'diamonds', diamonds:7500,  priceVal:39.99 },  // 6500+1000
  'd.legend':        { type:'diamonds', diamonds:17500, priceVal:79.99 },  // 15000+2500
  'bundle.starter':  { type:'bundle', bundleId:'bundle.starter',  diamonds:750,   items:{crystal:5,caltrops:5},             tickets:10,  priceVal:4.99  },
  'bundle.fire':     { type:'bundle', bundleId:'bundle.fire',     diamonds:1800,  items:{crystal:10,caltrops:10},            skins:['table_lava','tile_lava'],                                                             priceVal:11.99 },
  'bundle.champion': { type:'bundle', bundleId:'bundle.champion', diamonds:4000,  items:{crystal:20,caltrops:20},            skins:['table_galaxy','tile_holo','fx_void'],                                                 priceVal:19.99 },
  'bundle.legend':   { type:'bundle', bundleId:'bundle.legend',   diamonds:10000, items:{crystal:50,caltrops:50},            skins:['table_galaxy','tile_holo','fx_void','fx_rainbow','tap_portal'], tickets:50, nameChanges:5, priceVal:49.99 },
  'bundle.mobydick': { type:'bundle', bundleId:'bundle.mobydick', diamonds:7500,  items:{crystal:10,caltrops:10,shadow_tile:5}, skins:['vic_mobydick'], tickets:20, whaleBadge:true, priceVal:49.99 },
  'bundle.whale1':   { type:'bundle', bundleId:'bundle.whale1',   diamonds:16000, items:{shadow_tile:20},                   skins:['table_obsidian','tile_obsidian','tile_diamond'], tickets:100, whaleBadge:true, priceVal:79.99  },
  'bundle.whale2':   { type:'bundle', bundleId:'bundle.whale2',   diamonds:26000, items:{shadow_tile:50},                   skins:['fx_godray','fx_blackhole','tap_shockwave','tap_goldcrack','table_aurora','table_obsidian','tile_obsidian','tile_diamond'], whaleBadge:true, priceVal:129.99 },
};

// Verify purchase with Google Play Developer API.
// Returns true if purchaseState === 0 (Purchased).
// Skipped (returns true) when GOOGLE_PLAY_KEY_JSON env var is not set.
async function verifyWithGooglePlay(productId: string, purchaseToken: string): Promise<boolean> {
  const keyJson = process.env.GOOGLE_PLAY_KEY_JSON;
  if (!keyJson) {
    console.log('[Purchase] GOOGLE_PLAY_KEY_JSON not set — skipping API verification (token deduplication only)');
    return true;
  }
  try {
    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const publisher = google.androidpublisher({ version: 'v3', auth });
    const res = await publisher.purchases.products.get({
      packageName: PACKAGE_NAME,
      productId,
      token: purchaseToken,
    });
    const state = res.data.purchaseState;
    if (state !== 0) {
      console.warn(`[Purchase] Google Play rejected token — purchaseState=${state}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[Purchase] Google Play API error:', err?.message || err);
    return false;
  }
}

// POST /purchase/verify  { playerId, productId, purchaseToken, orderId? }
// Verifies with Google Play (if key configured), records in DB, grants reward.
// Idempotent: returns the original grant on duplicate token.
app.post("/purchase/verify", async (req, res) => {
  const { playerId, productId, purchaseToken, orderId = '' } = req.body;

  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!productId || typeof productId !== 'string')
    return res.json({ ok: false, error: 'invalid_product' });
  if (!purchaseToken || typeof purchaseToken !== 'string' || purchaseToken.length < 10)
    return res.json({ ok: false, error: 'invalid_token' });

  const product = PRODUCT_CATALOG[productId];
  if (!product) return res.json({ ok: false, error: 'unknown_product' });

  // Check for duplicate — return original grant so client can re-apply idempotently
  const existing = await getPurchaseReceipt(purchaseToken);
  if (existing !== null) {
    try {
      const grant = JSON.parse(existing);
      return res.json({ ok: false, error: 'already_processed', grant });
    } catch {
      return res.json({ ok: false, error: 'already_processed' });
    }
  }

  // Verify with Google Play (no-op when key not configured)
  const valid = await verifyWithGooglePlay(productId, purchaseToken);
  if (!valid) return res.json({ ok: false, error: 'google_play_rejected' });

  // Build grant payload
  const grant: Record<string, any> = {
    type:     product.type,
    bundleId: product.bundleId,
    diamonds: product.diamonds,
    priceVal: product.priceVal,
  };
  if (product.items)       grant.items       = product.items;
  if (product.skins)       grant.skins       = product.skins;
  if (product.tickets)     grant.tickets      = product.tickets;
  if (product.nameChanges) grant.nameChanges  = product.nameChanges;
  if (product.whaleBadge)  grant.whaleBadge   = true;

  // Record in DB — UNIQUE on purchase_token prevents double-delivery
  if (getDbStatus().available) {
    const result = await recordPurchaseReceipt(
      playerId, productId, purchaseToken, String(orderId), JSON.stringify(grant)
    );
    if (result === 'error') return res.json({ ok: false, error: 'db_error' });
    if (result === 'already_processed') {
      return res.json({ ok: false, error: 'already_processed', grant });
    }
    // Raise the server-trusted diamond ceiling for this legitimate purchase
    await addTrustedDiamonds(playerId, product.diamonds);
  }

  console.log(`[Purchase] ✅ Verified ${productId} for ${playerId} (💎 ${product.diamonds})`);
  res.json({ ok: true, grant });
});

// POST /purchase/restore  { playerId, purchases: [{ productId, purchaseToken, orderId? }] }
// Processes all unacknowledged purchases returned by queryPurchasesAsync on the client.
// Skips tokens already in purchase_receipts. Returns { restored: [...] } for newly granted items.
app.post("/purchase/restore", async (req, res) => {
  const { playerId, purchases } = req.body;

  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!Array.isArray(purchases) || purchases.length === 0)
    return res.json({ ok: true, restored: [] });
  if (purchases.length > 50)
    return res.json({ ok: false, error: 'too_many_purchases' });

  const processedTokens = getDbStatus().available ? await getProcessedTokens(playerId) : new Set<string>();
  const restored: Array<{ purchaseToken: string; grant: Record<string, any> }> = [];

  for (const p of purchases) {
    const { productId, purchaseToken, orderId = '' } = p;
    if (!productId || !purchaseToken) continue;

    const product = PRODUCT_CATALOG[productId];
    if (!product) continue;

    // Already processed — skip (client will still consume the token)
    if (processedTokens.has(purchaseToken)) continue;

    // Check DB directly for race conditions
    const existing = await getPurchaseReceipt(purchaseToken);
    if (existing !== null) continue;

    // Verify with Google Play
    const valid = await verifyWithGooglePlay(productId, purchaseToken);
    if (!valid) continue;

    const grant: Record<string, any> = {
      type:     product.type,
      bundleId: product.bundleId,
      diamonds: product.diamonds,
      priceVal: product.priceVal,
    };
    if (product.items)       grant.items       = product.items;
    if (product.skins)       grant.skins       = product.skins;
    if (product.tickets)     grant.tickets      = product.tickets;
    if (product.nameChanges) grant.nameChanges  = product.nameChanges;
    if (product.whaleBadge)  grant.whaleBadge   = true;

    if (getDbStatus().available) {
      const result = await recordPurchaseReceipt(
        playerId, productId, purchaseToken, String(orderId), JSON.stringify(grant)
      );
      if (result !== 'ok') continue; // already processed by concurrent request — skip
      await addTrustedDiamonds(playerId, product.diamonds);
    }

    restored.push({ purchaseToken, grant });
    console.log(`[Purchase] 🔄 Restored ${productId} for ${playerId}`);
  }

  res.json({ ok: true, restored });
});

app.use("/colyseus", monitor());

const httpServer = createServer(app);

// Fix Android WebView WebSocket — override upgrade to allow null origin
httpServer.on('upgrade', (req, socket, head) => {
  if (!req.headers.origin) {
    req.headers.origin = 'https://tile-royale-eu-production.up.railway.app';
  }
});

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    pingInterval: 5000,
    pingMaxRetries: 3,
  }),
});

gameServer.define("tile_royale", TileRoyaleRoom)
  .filterBy(["mode"])
  .sortBy({ clients: -1 });

initDb().then(() => {
  gameServer.listen(port).then(() => {
    console.log(`🔥 Tile Royale [${region}] running on port ${port}`);
    console.log(`📊 Monitor: http://localhost:${port}/colyseus`);
  });
});
