import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { TileRoyaleRoom } from "./rooms/TileRoyaleRoom";
import { initDb, getRankingsWeekly, getRankingsAllTime, getPlayerStats, getDbStatus, getGlobalStats, getWorldRecords, getPlayerPercentiles, findPlayerByTag, sendFriendRequest, respondFriendRequest, getFriends, getFriendRequests, getFriendsLeaderboard, getFriendshipStatus, getFavoriteMode, updatePlayerProgress, getNews, getLatestNews, createNewsPost, deleteNewsPost, upsertPlayer, writeGameResult, query, getPlayerNotifications, markNotificationRead, claimNotificationReward, createPlayerNotification, savePlayerData, loadPlayerData } from "./db";

const port   = Number(process.env.PORT   || 3000);
const region = process.env.REGION || "EU";   // EU | NA | ASIA
const app    = express();

// Bump this when releasing a client version that is required (breaks old clients)
const MIN_CLIENT_VERSION = "v0.4.5";

app.use(cors({ origin: '*' }));
app.use(express.json());

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
    // Notify the requester that their friend request was accepted
    const targetStats = await getPlayerStats(targetId);
    const targetName  = targetStats?.player_name || 'A player';
    createPlayerNotification(
      requesterId,
      'Friend Request Accepted',
      `You are now friends with ${targetName}.`,
      'friend'
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
  let saveJson: string;
  try {
    saveJson = JSON.stringify(saveData);
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid saveData' }); return;
  }
  if (saveJson.length > 1_000_000) {
    res.status(400).json({ ok: false, error: 'Save data too large (max 1 MB)' }); return;
  }
  const ok = await savePlayerData(playerId, saveJson);
  res.json({ ok: ok ?? false });
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
    res.json({ found: true, saveData, updatedAt: result.updatedAt });
  } catch {
    res.json({ found: false });
  }
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
