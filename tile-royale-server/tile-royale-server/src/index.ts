import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { TileRoyaleRoom } from "./rooms/TileRoyaleRoom";
import { GauntletRoom } from "./rooms/GauntletRoom";
import { initDb, getRankingsWeekly, getRankingsAllTime, getPlayerStats, getDbStatus, getGlobalStats, getWorldRecords, getPlayerPercentiles, findPlayerByTag, sendFriendRequest, respondFriendRequest, getFriends, getFriendRequests, getFriendsLeaderboard, getFriendshipStatus, getFavoriteMode, updatePlayerProgress, getPlayerAchievements, getNews, getLatestNews, createNewsPost, deleteNewsPost, upsertPlayer, writeGameResult, query, getPlayerNotifications, markNotificationRead, claimNotificationReward, createPlayerNotification, savePlayerData, loadPlayerData, upsertPushToken, getPushTokenCount, getPlayerPushToken, checkAndRecordPromoRedemption, getPromoStats, getTrustedDiamonds, setTrustedDiamonds, addTrustedDiamonds, getKothWeeklyLeaderboard, getKothDailyStats, claimKothDailyReward, claimKothWeeklyPrize, recordPurchaseReceipt, getPurchaseReceipt, getProcessedTokens, getPurchaseSpendStats, upsertPracticeScore, getPracticeLeaderboard, createRingGrant, validateRingGrant, createRingTrade, acceptRingTrade, cancelRingTrade, upsertSoloScore, getSoloLeaderboard, getGauntletMMR, getGauntletLeaderboard, claimGauntletWeeklyReward, recordDailyLoginClaim, recordMissionClaim, getAndValidateModeRewardClaim, deletePlayerData, resetAllPlayerData, recordTrophyMilestoneClaim, recordAchievementUnlock, hasAchievementUnlock, checkAdRewardCooldown, recordAdRewardClaim, recordOfflineRewardClaim, getPlayerLastSeen, recordDcClaim, recordDiamondSpend, getMissionServerCount, recordSurpriseGrant, recordLevelUpClaim, recordSoloLevelClaim, getPlayerGameStats, recordTicketEvent, recordDcSwap, recordKothFastestClaim, recordSoloMilestoneClaim } from "./db";
import { google } from "googleapis";
import * as firebaseAdmin from "firebase-admin";

// Server-side mirror of the solo level gem rewards (levels with no reward = 0).
// Rewards only exist at every 10th level; pattern: 50 at most, 200 at x50, 400 at x100, 600 at Lv1000.
const SOLO_GEM_REWARDS: Record<number, number> = {
  10:50,20:50,30:50,40:50,50:200,60:50,70:50,80:50,90:50,100:400,
  110:50,120:50,130:50,140:50,150:200,160:50,170:50,180:50,190:50,200:400,
  210:50,220:50,230:50,240:50,250:200,260:50,270:50,280:50,290:50,300:400,
  310:50,320:50,330:50,340:50,350:200,360:50,370:50,380:50,390:50,400:400,
  410:50,420:50,430:50,440:50,450:200,460:50,470:50,480:50,490:50,500:400,
  510:50,520:50,530:50,540:50,550:200,560:50,570:50,580:50,590:50,600:400,
  610:50,620:50,630:50,640:50,650:200,660:50,670:50,680:50,690:50,700:400,
  710:50,720:50,730:50,740:50,750:200,760:50,770:50,780:50,790:50,800:400,
  810:50,820:50,830:50,840:50,850:200,860:50,870:50,880:50,890:50,900:400,
  910:50,920:50,930:50,940:50,950:200,960:50,970:50,980:50,990:50,1000:600,
};

// ─── Firebase Cloud Messaging ─────────────────────────────────────────────────
// Set FIREBASE_SERVICE_ACCOUNT env var to the JSON content of a Firebase
// service account key (from Firebase Console → Project Settings → Service Accounts).
// When the var is absent the server runs normally but push notifications are skipped.

let _fcmReady = false;

(function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.log('[FCM] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
    return;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
    });
    _fcmReady = true;
    console.log('[FCM] ✅ Firebase Admin initialized');
  } catch(e: any) {
    console.error('[FCM] Failed to initialize Firebase Admin:', e?.message);
  }
})();

// Send a push notification to a single FCM token.
// Silently swips invalid/expired tokens — caller does not need to handle errors.
async function _sendFcm(token: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  if (!_fcmReady) return;
  try {
    await firebaseAdmin.messaging().send({
      token,
      notification: { title, body },
      data,
      android: { priority: 'high' },
    });
  } catch(e: any) {
    // messaging/registration-token-not-registered → stale token, ignore silently
    if (e?.errorInfo?.code !== 'messaging/registration-token-not-registered') {
      console.warn('[FCM] send error:', e?.errorInfo?.code || e?.message);
    }
  }
}

// Send a push notification to a player by their player_id.
// Looks up the FCM token from the database and fires the message.
async function sendPushToPlayer(playerId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  if (!_fcmReady) return;
  try {
    const token = await getPlayerPushToken(playerId);
    if (!token) return;
    await _sendFcm(token, title, body, data);
  } catch(e: any) {
    console.warn('[FCM] sendPushToPlayer error:', e?.message);
  }
}

// ─── IAP Key Check ────────────────────────────────────────────────────────────
// GOOGLE_PLAY_KEY_JSON must be set in production. Without it, verifyWithGooglePlay()
// returns false and ALL new purchases are rejected with google_play_rejected.
// Restore of existing tokens (already in purchase_receipts) still works.
if (!process.env.GOOGLE_PLAY_KEY_JSON) {
  console.error('[IAP] ❌ CRITICAL: GOOGLE_PLAY_KEY_JSON is not set.');
  console.error('[IAP]    All new purchase verification will be rejected until this is configured.');
  console.error('[IAP]    Set GOOGLE_PLAY_KEY_JSON in Railway environment variables before going live.');
}

const port   = Number(process.env.PORT   || 3000);
const region = process.env.REGION || "EU";   // EU | NA | ASIA
const app    = express();

// Bump this when releasing a client version that is required (breaks old clients)
const MIN_CLIENT_VERSION = "v0.8.4";

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

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

// Data deletion request page
app.get("/delete-data", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tile Royale – Data Deletion Request</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 680px; margin: 40px auto; padding: 0 20px; color: #222; line-height: 1.7; }
  h1 { font-size: 26px; } h2 { font-size: 18px; margin-top: 28px; }
  p, li { font-size: 15px; } ul { padding-left: 20px; }
  .step { background: #f5f5f5; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .step strong { display: block; margin-bottom: 4px; }
  a { color: #1a73e8; }
  footer { margin-top: 48px; font-size: 13px; color: #888; }
</style>
</head>
<body>
<h1>Tile Royale — Data Deletion Request</h1>
<p>You can request deletion of all your Tile Royale data at any time. We will process your request within 30 days.</p>

<h2>How to request deletion</h2>

<div class="step">
  <strong>Step 1 — Find your Player ID</strong>
  Open Tile Royale → tap your profile icon → your Player ID is shown at the bottom of the profile screen (a long code starting with letters and numbers).
</div>

<div class="step">
  <strong>Step 2 — Send an email</strong>
  Email us at <a href="mailto:tileroyalegame@gmail.com">tileroyalegame@gmail.com</a> with:<br>
  Subject: <em>Data Deletion Request</em><br>
  Body: your Player ID
</div>

<h2>What data is deleted</h2>
<ul>
  <li>Player profile (name, avatar, Player ID)</li>
  <li>Game statistics and match history</li>
  <li>Game save data (progress, currencies, items, skins)</li>
  <li>Purchase records</li>
  <li>Push notification token</li>
  <li>Friend connections and trade history</li>
</ul>

<h2>What data is retained</h2>
<ul>
  <li>Anonymised aggregate statistics (no personal identifiers) may be retained for up to 90 days for service improvement purposes.</li>
</ul>

<p>For questions, contact us at <a href="mailto:tileroyalegame@gmail.com">tileroyalegame@gmail.com</a>.</p>

<footer>© 2026 Henly Games · Tile Royale</footer>
</body>
</html>`);
});

// AdMob app-ads.txt — must be served from the developer website registered in Play Console
app.get("/app-ads.txt", (_req, res) => {
  res.type('text/plain').send('google.com, pub-2005005437331878, DIRECT, f08c47fec0942fa0');
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
  const { playerId, trophy_points, achievement_count, achievement_total, diamonds, achievement_ids } = req.body;
  if (!playerId || playerId.length < 10) return res.json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available)          return res.json({ ok: false, error: 'db_unavailable' });

  const pts   = Math.max(0, Math.min(Number(trophy_points)     || 0, 99999));
  const count = Math.max(0, Math.min(Number(achievement_count) || 0, 9999));
  const total = Math.max(1, Math.min(Number(achievement_total) || 108, 9999));
  const gems  = Math.max(0, Math.min(Number(diamonds)          || 0, 9999999));
  const ids   = Array.isArray(achievement_ids)
    ? achievement_ids.filter((x: any) => typeof x === 'string').slice(0, 200)
    : undefined;

  await updatePlayerProgress(playerId, pts, count, total, gems, ids);
  res.json({ ok: true });
});

// GET /player/achievements/:playerId — returns server-stored achievement ID list
app.get("/player/achievements/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.json({ ok: false, achievement_ids: [] });
  const ids = await getPlayerAchievements(playerId);
  res.json({ ok: true, achievement_ids: ids });
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
  if (status === 'sent') {
    const requesterStats = await getPlayerStats(requesterId);
    const requesterName  = requesterStats?.player_name || 'A player';
    createPlayerNotification(
      target.player_id,
      '👋 Friend Request',
      `${requesterName} wants to be your friend!`,
      'friend', null, null
    ).catch(() => {});
    sendPushToPlayer(target.player_id, '👋 Friend Request', `${requesterName} wants to be your friend!`).catch(() => {});
  }
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
    sendPushToPlayer(requesterId, '🤝 Friend Added!', `${targetName} accepted your friend request. You earned 💎 ${REFERRAL_REWARD}!`).catch(() => {});

    // Reward the accepter
    createPlayerNotification(
      targetId,
      '🤝 New Friend!',
      `You and ${requesterName} are now friends. Claim your reward!`,
      'friend',
      'diamonds',
      REFERRAL_REWARD
    ).catch(() => {});
    sendPushToPlayer(targetId, '🤝 New Friend!', `You and ${requesterName} are now friends. You earned 💎 ${REFERRAL_REWARD}!`).catch(() => {});
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

// POST /daily-login/claim  { playerId, day, claimDate }
// Idempotent: server records the claim so localStorage manipulation can't re-trigger it.
app.post("/daily-login/claim", async (req, res) => {
  const { playerId, day, claimDate } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!claimDate || !/^\d{4}-\d{2}-\d{2}$/.test(claimDate))
    return res.status(400).json({ ok: false, error: 'invalid_date' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true }); // allow offline
  const result = await recordDailyLoginClaim(playerId, claimDate, Number(day) || 1);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /missions/claim  { playerId, missionId, periodKey, missionType, target, periodStart, periodEnd }
// periodKey = ISO date (daily) or ISO week-start Monday (weekly).
// For game-based mission types the server re-counts game_results before accepting.
app.post("/missions/claim", async (req, res) => {
  const { playerId, missionId, periodKey, missionType, target, periodStart, periodEnd } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!missionId || !periodKey) return res.status(400).json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true }); // allow offline

  // Server-side progress re-validation for game-based missions
  if (missionType && target && periodStart && periodEnd) {
    const serverCount = await getMissionServerCount(
      String(playerId), String(missionType), String(periodStart), String(periodEnd)
    );
    // serverCount === -1 → type not server-validatable (xp, tickets) → allow through
    // serverCount === 0  → no DB rows for this period (e.g. all games were bot games before
    //                      bot results were recorded) → trust client, allow through
    // serverCount > 0    → server has real data → validate strictly
    if (serverCount > 0 && serverCount < Number(target)) {
      return res.json({ ok: false, error: 'not_completed' });
    }
  }

  const result = await recordMissionClaim(playerId, String(missionId), String(periodKey));
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /trophyroad/claim  { playerId, milestonePts }
// Server-side idempotency for Trophy Road milestone rewards.
app.post("/trophyroad/claim", async (req, res) => {
  const { playerId, milestonePts } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (milestonePts === undefined || milestonePts === null)
    return res.status(400).json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });
  const result = await recordTrophyMilestoneClaim(String(playerId), Number(milestonePts));
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /achievements/unlock  { playerId, achievementId }
// Server-side idempotency for achievement rewards — blocks re-unlock after save wipe.
// For game-stat-based achievements the server re-validates from game_results before recording.
app.post("/achievements/unlock", async (req, res) => {
  const { playerId, achievementId } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!achievementId) return res.status(400).json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });

  // Precondition map: achievementId → { stat, goal } for stats we can verify from game_results.
  // Stats not in this map (totalTaps, totalDiamonds, solo, winStreak, etc.) pass through — they
  // are harder to validate server-side and grant low-value rewards.
  const ACH_PRECONDITIONS: Record<string, { stat: 'wins'|'games'|'top3'|'top5'|'rushWins'|'buckshotWins'|'buckshotGames'|'wildWins'|'wildGames', goal: number }> = {
    first_blood:     { stat: 'games',        goal: 1   },
    on_fire:         { stat: 'wins',          goal: 10  },
    centurion:       { stat: 'wins',          goal: 100 },
    grand_master:    { stat: 'wins',          goal: 500 },
    survivor:        { stat: 'top5',          goal: 1   },
    last_standing:   { stat: 'top3',          goal: 100 },
    true_champion:   { stat: 'top3',          goal: 1000 },
    speed_demon:     { stat: 'rushWins',      goal: 1   },
    buckshot_rookie: { stat: 'buckshotGames', goal: 5   },
    buckshot_king:   { stat: 'buckshotWins',  goal: 50  },
    wild_card:       { stat: 'wildGames',     goal: 1   },
    wild_master:     { stat: 'wildWins',      goal: 10  },
  };

  const precondition = ACH_PRECONDITIONS[String(achievementId)];
  if (precondition) {
    const stats = await getPlayerGameStats(String(playerId));
    if (stats !== null) {
      const actual = stats[precondition.stat] ?? 0;
      if (actual < precondition.goal) {
        console.warn(`[ACH] Rejected ${achievementId} for ${playerId}: need ${precondition.goal} ${precondition.stat}, have ${actual}`);
        return res.json({ ok: false, error: 'precondition_not_met' });
      }
    }
  }

  const result = await recordAchievementUnlock(String(playerId), String(achievementId));
  if (result === 'already_unlocked') return res.json({ ok: false, error: 'already_unlocked' });
  if (result === 'error')            return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /xp/levelup  { playerId, level }
// Records a level-up reward claim so it cannot be re-triggered after a save wipe.
// Client calls this when awardLevelUp() fires. Server grants nothing — client already
// applied the reward locally — this endpoint just raises the trusted-diamond ceiling
// and records the level so future saves cannot replay it.
app.post("/xp/levelup", async (req, res) => {
  const { playerId, level } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  const lvl = Number(level);
  if (!lvl || lvl < 2 || lvl > 500) return res.status(400).json({ ok: false, error: 'invalid_level' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });

  const result = await recordLevelUpClaim(String(playerId), lvl);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });

  // Free spin per level-up — raise ceiling by a conservative amount
  await addTrustedDiamonds(String(playerId), 0).catch(() => {});
  res.json({ ok: true });
});

// POST /solo/complete  { playerId, levelNum, gemReward }
// Records a solo level completion and raises the trusted-diamond ceiling by gemReward.
// Idempotent: duplicate calls return already_claimed without re-raising the ceiling.
app.post("/solo/complete", async (req, res) => {
  const { playerId, levelNum, gemReward } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  const lvl = Number(levelNum);
  const gems = Number(gemReward);
  if (!lvl || lvl < 1 || lvl > 1000) return res.status(400).json({ ok: false, error: 'invalid_level' });
  const expectedGems = SOLO_GEM_REWARDS[lvl] ?? 0;
  if (gems !== expectedGems) return res.status(400).json({ ok: false, error: 'invalid_reward' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });

  const result = await recordSoloLevelClaim(String(playerId), lvl, gems);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });

  if (gems > 0) await addTrustedDiamonds(String(playerId), gems).catch(() => {});
  res.json({ ok: true });
});

// POST /tickets/spend  { playerId, balance }
// Fire-and-forget audit record of a ticket spend. Not authoritative (client still controls
// balance) but provides a server-side audit trail for detecting impossible ticket counts.
app.post("/tickets/spend", async (req, res) => {
  const { playerId, balance } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });
  await recordTicketEvent(String(playerId), -1, 'match', Number(balance) || 0).catch(() => {});
  res.json({ ok: true });
});

// POST /dc/swap  { playerId, swapDate }
// Records a daily-challenge swap (one allowed per UTC calendar day per player).
app.post("/dc/swap", async (req, res) => {
  const { playerId, swapDate } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!swapDate || !/^\d{4}-\d{2}-\d{2}$/.test(swapDate))
    return res.status(400).json({ ok: false, error: 'invalid_date' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });
  const result = await recordDcSwap(String(playerId), swapDate);
  if (result === 'already_swapped') return res.json({ ok: false, error: 'already_swapped' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /ads/reward/claim  { playerId }
// Server enforces 1-hour cooldown and determines the reward type.
// Returns { ok: true, rewardIndex: 0-3 } so client uses a deterministic table.
function _serverRollAdReward(): number {
  const roll = Math.random() * 100;
  if (roll < 80) return 0; // tickets ×1
  if (roll < 90) return 1; // crystal ×1
  if (roll < 97) return 2; // caltrops ×1
  return 3;                 // shadow_tile ×1
}
const AD_REWARD_TYPES = ['tickets', 'crystal', 'caltrops', 'shadow_tile'];

app.post("/ads/reward/claim", async (req, res) => {
  const { playerId } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true, rewardIndex: 0 });
  const canClaim = await checkAdRewardCooldown(String(playerId));
  if (!canClaim) return res.json({ ok: false, error: 'cooldown_active' });
  const rewardIndex = _serverRollAdReward();
  await recordAdRewardClaim(String(playerId), AD_REWARD_TYPES[rewardIndex]);
  res.json({ ok: true, rewardIndex });
});

// POST /offline-reward/claim  { playerId, claimDate, amount }
// One claim per UTC day, cross-validated against server last_seen_at.
app.post("/offline-reward/claim", async (req, res) => {
  const { playerId, claimDate, amount } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!claimDate || !/^\d{4}-\d{2}-\d{2}$/.test(claimDate))
    return res.status(400).json({ ok: false, error: 'invalid_date' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });

  // Cross-validate: server's last_seen_at must be more than 8h before now
  const lastSeen = await getPlayerLastSeen(String(playerId));
  const OFFLINE_RATE_MS = 8 * 60 * 60 * 1000;
  if (!lastSeen || (Date.now() - lastSeen.getTime()) < OFFLINE_RATE_MS)
    return res.json({ ok: false, error: 'not_eligible' });

  // Cap amount: OFFLINE_DIAMONDS=3 per 8h period, max 3 periods = 9 diamonds
  const safeAmount = Math.min(Number(amount) || 0, 9);
  const result = await recordOfflineRewardClaim(String(playerId), claimDate, safeAmount);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /dc/claim  { playerId, challengeDate, challengeId }
// Server-side idempotency for Daily Challenge claims — one per calendar date.
app.post("/dc/claim", async (req, res) => {
  const { playerId, challengeDate, challengeId } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!challengeDate || !/^\d{4}-\d{2}-\d{2}$/.test(challengeDate) || !challengeId)
    return res.status(400).json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });
  const result = await recordDcClaim(String(playerId), challengeDate, String(challengeId));
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /surprise/claim  { playerId, grantDate }
// One surprise bonus per player per UTC calendar day.
// Server determines the reward deterministically (playerId + grantDate hash) and
// returns rewardIndex so the client doesn't roll its own random.
function _serverRollSurpriseReward(playerId: string, grantDate: string): number {
  const seed = playerId + grantDate;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  return Math.abs(h) % 4;
}

app.post("/surprise/claim", async (req, res) => {
  const { playerId, grantDate } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!grantDate || !/^\d{4}-\d{2}-\d{2}$/.test(grantDate))
    return res.status(400).json({ ok: false, error: 'invalid_date' });
  const rewardIndex = _serverRollSurpriseReward(String(playerId), String(grantDate));
  if (!getDbStatus().available) return res.json({ ok: true, offline: true, rewardIndex });
  const result = await recordSurpriseGrant(String(playerId), grantDate);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true, rewardIndex });
});

// POST /diamonds/spend  { playerId, itemId, amount }
// Records the spend in the audit log. Client must call this before deducting locally.
app.post("/diamonds/spend", async (req, res) => {
  const { playerId, itemId, amount } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!itemId || !amount || Number(amount) <= 0)
    return res.status(400).json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });
  const result = await recordDiamondSpend(String(playerId), String(itemId), Number(amount));
  if (result === 'error') return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true });
});

// POST /mode-rewards/claim  { playerId, mode, period, periodKey, periodStart, periodEnd }
// Validates win count from server game_results — client win count not trusted.
app.post("/mode-rewards/claim", async (req, res) => {
  const { playerId, mode, period, periodKey, periodStart, periodEnd } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!['rush','buckshot','wild'].includes(mode))
    return res.status(400).json({ ok: false, error: 'invalid_mode' });
  if (!['daily','weekly'].includes(period))
    return res.status(400).json({ ok: false, error: 'invalid_period' });
  if (!periodKey || !periodStart || !periodEnd)
    return res.status(400).json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: false, error: 'db_unavailable' });

  const result = await getAndValidateModeRewardClaim(
    playerId, mode, period as 'daily'|'weekly', String(periodKey),
    String(periodStart), String(periodEnd)
  );
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'no_reward')       return res.json({ ok: false, error: 'no_reward' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true, tier: result.tier, tickets: result.tickets });
});

// DELETE /admin/delete-player/:playerId — hard-delete all player data (GDPR / privacy policy)
app.delete("/admin/delete-player/:playerId", requireAdmin, async (req, res) => {
  const { playerId } = req.params;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const ok = await deletePlayerData(playerId);
  if (!ok) return res.status(500).json({ ok: false, error: 'delete_failed' });
  console.log(`[Admin] Player data deleted: ${playerId}`);
  res.json({ ok: true, playerId });
});

// POST /admin/grant-welcome-diamonds — grant 500 diamonds to all players with trusted_diamonds < 500
app.post("/admin/grant-welcome-diamonds", requireAdmin, async (_req, res) => {
  if (!getDbStatus().available) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const before = await query(`SELECT COUNT(*)::INT AS cnt FROM players WHERE trusted_diamonds IS NULL OR trusted_diamonds < 500`);
  await query(`UPDATE players SET trusted_diamonds = 500 WHERE trusted_diamonds IS NULL OR trusted_diamonds < 500`);
  const updated = before?.[0]?.cnt ?? 0;
  console.log(`[Admin] grant-welcome-diamonds: updated ${updated} players`);
  res.json({ ok: true, updated });
});

// POST /admin/reset-all-data — wipe all player data except name/avatar/tag and push tokens
// One-time use for major version resets (e.g. v1.0.0 launch).
app.post("/admin/reset-all-data", requireAdmin, async (_req, res) => {
  if (!getDbStatus().available) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  console.log('[Admin] RESET ALL PLAYER DATA initiated');
  const result = await resetAllPlayerData();
  if (!result.ok) return res.status(500).json({ ok: false, error: result.error });
  console.log('[Admin] RESET ALL PLAYER DATA complete');
  res.json({ ok: true });
});

// POST /admin/player/reset-whale — revoke whale status from a player's save blob
// Used when a whale badge was granted via refund, fraud, or fallback exploit.
app.post("/admin/player/reset-whale", requireAdmin, async (req, res) => {
  const { playerId } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  try {
    await query(
      `UPDATE player_saves
       SET save_data = jsonb_set(save_data, '{whaleBadge}', 'false'::jsonb)
       WHERE player_id = $1 AND save_data ? 'whaleBadge'`,
      [playerId]
    );
    console.log(`[Admin] Whale badge revoked for ${playerId}`);
    res.json({ ok: true, playerId });
  } catch (e: any) {
    console.error('[Admin] reset-whale error:', e?.message);
    res.status(500).json({ ok: false, error: 'db_error' });
  }
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
  // Fire push notification alongside the inbox entry
  sendPushToPlayer(String(playerId), String(title), String(body)).catch(() => {});
  res.status(201).json({ ok: true, notification: notif });
});

// POST /admin/broadcast-notification — send an inbox notification + FCM push to ALL players
// Body: { title, body, type?, reward_type?, reward_amount? }
app.post("/admin/broadcast-notification", requireAdmin, async (req, res) => {
  const { title, body, type = 'message', reward_type = null, reward_amount = null } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  if (!getDbStatus().available) return res.status(503).json({ error: 'db_unavailable' });

  // Get all player IDs
  const rows = await query(`SELECT player_id FROM players`);
  if (!rows) return res.status(500).json({ error: 'failed to fetch players' });

  // Bulk-insert inbox notifications
  let sent = 0;
  for (const row of rows) {
    const pid = row.player_id;
    await createPlayerNotification(
      pid, String(title), String(body), String(type),
      reward_type ? String(reward_type) : null,
      reward_amount != null ? Number(reward_amount) : null
    ).catch(() => {});
    sent++;
  }

  // Bulk FCM push — query all tokens directly
  const tokenRows = await query(`SELECT DISTINCT token FROM push_tokens`);
  let pushed = 0;
  if (tokenRows && _fcmReady) {
    for (const t of tokenRows) {
      await _sendFcm(t.token, String(title), String(body)).catch(() => {});
      pushed++;
    }
  }

  res.json({ ok: true, notified: sent, pushed });
});

// POST /admin/news/clear — delete ALL news posts (for clean slate before posting new ones)
app.delete("/admin/news/clear", requireAdmin, async (_req, res) => {
  if (!getDbStatus().available) return res.status(503).json({ error: 'db_unavailable' });
  const rows = await query(`DELETE FROM news_posts RETURNING id`);
  res.json({ ok: true, deleted: rows?.length ?? 0 });
});

// DELETE /admin/notifications/broadcast — delete all inbox notifications of a given type from all players
// Body: { type } — e.g. { type: 'announcement' }
app.delete("/admin/notifications/broadcast", requireAdmin, async (req, res) => {
  const { type } = req.body;
  if (!type) return res.status(400).json({ error: 'type is required' });
  if (!getDbStatus().available) return res.status(503).json({ error: 'db_unavailable' });
  const rows = await query(`DELETE FROM player_notifications WHERE type = $1 RETURNING id`, [type]);
  res.json({ ok: true, deleted: rows?.length ?? 0 });
});

// POST /report/suspicious  { playerId, reason }
// Client-submitted anti-cheat flag. Logged for review; does not auto-ban.
app.post("/report/suspicious", async (req, res) => {
  const { playerId, reason } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  const safeReason = String(reason || 'unknown').substring(0, 120);
  console.warn(`[AntiCheat] ⚠️ Suspicious player reported: ${playerId} — ${safeReason}`);
  if (getDbStatus().available) {
    await query(
      `INSERT INTO suspicious_reports (player_id, reason) VALUES ($1, $2)`,
      [playerId, safeReason]
    ).catch(() => {}); // table created lazily below
  }
  res.json({ ok: true });
});

// ─── End-to-end validation endpoint ─────────────────────────────────────────
// Inserts synthetic data, runs all queries, reports results, then cleans up.
// Safe to call repeatedly. Requires X-Admin-Key header to prevent public access.
app.get("/validate", requireAdmin, async (_req, res) => {
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
  'WELCOME':      { diamonds: 100,  items: { crystal: 1, caltrops: 2 },        desc: 'Welcome to Tile Royale!',             maxUses: 999999 },
  'TILEROYALE':   { diamonds: 1000, items: { crystal: 3 },                      desc: 'Official launch bonus!',              maxUses: 999999 },
  'WILDMODE':     { diamonds: 300,  items: { shadow_tile: 3 },                  desc: 'Wild mode launch reward',             maxUses: 999999 },
  'KOTHWEEK1':    { diamonds: 500,  items: { crystal: 1, caltrops: 1 },         desc: 'King of the Hill launch!',            maxUses: 999999 },
  'WHALE4EVER':   { diamonds: 2000, items: { shadow_tile: 5 },                  desc: 'Whale appreciation gift 🐋',          maxUses: 999999 },
  'BUGFIX':       { diamonds: 200,                                               desc: 'Thanks for your patience!',           maxUses: 999999 },
  'RAZ4WIN':      { action: 'koth_top3',                                        desc: 'KOTH Top 3 status + Custom Lobby unlock', maxUses: 999999 },
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
  // Dev codes must never appear in production — this path is a safety net only
  if (promo.dev) return res.json({ ok: false, error: 'invalid_code' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });
  const result = await checkAndRecordPromoRedemption(playerId, code, promo.maxUses);
  if (result === 'already_redeemed')  return res.json({ ok: false, error: 'already_redeemed' });
  if (result === 'max_uses_reached')  return res.json({ ok: false, error: 'expired' });
  if (result === 'error')             return res.json({ ok: false, error: 'server_error' });

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

// ─── Game End Rewards ─────────────────────────────────────────────────────────

// POST /game/end-rewards  { playerId, placement, mode, isCustomLobby, xpBoostActive, isBotMatch?, tilesTapped?, totalPlayers? }
// Returns server-authoritative diamond grant for the just-completed game.
// Calculates daily cap from actual game_results.
// Also raises the trusted diamond ceiling so the cloud save accepts the grant.
// Bot/offline games send isBotMatch:true — we write their result here since TileRoyaleRoom only covers multiplayer.
app.post("/game/end-rewards", async (req, res) => {
  const { playerId, placement, mode, isCustomLobby, xpBoostActive, isBotMatch, tilesTapped, totalPlayers } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });

  // Custom lobby games give no rewards
  if (Boolean(isCustomLobby)) return res.json({ ok: true, diamonds: 0, xp: 0 });

  const p = Math.max(1, Math.min(Number(placement) || 99, 99));

  // Record bot/offline game results — TileRoyaleRoom only covers multiplayer games
  if (Boolean(isBotMatch) && getDbStatus().available) {
    const taps = Math.max(0, Math.min(Number(tilesTapped) || 0, 10000));
    const total = Math.max(2, Math.min(Number(totalPlayers) || 30, 100));
    writeGameResult(playerId, p, total, String(mode || 'rush'),
      taps > 0 ? { tilesTapped: taps, avgReactionMs: 0, bestReactionMs: 0 } : undefined,
      true
    ).catch(e => console.error("[DB] writeGameResult (bot) failed:", e));
  }

  // Base diamond reward by placement
  const baseDiamonds = p === 1 ? 6 : p === 2 ? 4 : p === 3 ? 2 : 1;

  let diamonds = baseDiamonds;

  if (getDbStatus().available) {
    // Daily cap: sum diamonds earned from game_results today (server-written rows are authoritative)
    const capRows = await query(
      `SELECT COALESCE(SUM(
         CASE WHEN placement = 1 THEN 6
              WHEN placement = 2 THEN 4
              WHEN placement = 3 THEN 2
              ELSE 1 END
       ), 0) AS earned_today
       FROM game_results
       WHERE player_id = $1
         AND played_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
         AND (is_bot_match IS NULL OR is_bot_match = false)`,
      [playerId]
    );
    const earnedToday = Number(capRows?.[0]?.earned_today ?? 0);
    const dailyLeft   = Math.max(0, 80 - earnedToday);
    diamonds = Math.min(baseDiamonds, dailyLeft);

    // Raise server-trusted ceiling so the cloud save accepts the grant
    if (diamonds > 0) await addTrustedDiamonds(playerId, diamonds);
  }

  // XP: server returns a cap — client must not exceed this.
  // Includes base + streak bonus + survival bonus + optional 2× boost.
  const baseXp    = p === 1 ? 150 : p === 2 ? 100 : p === 3 ? 85 : p <= 5 ? 65 : 40;
  const xpCap     = baseXp * (Boolean(xpBoostActive) ? 2 : 1);

  res.json({ ok: true, diamonds, xp: xpCap });
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
      // BASE_PURCHASE is only allowed if the player has at least one verified IAP receipt.
      // Without verified purchases, fresh installs cannot anchor a 30k ceiling by editing localStorage.
      const purchaseRows = await query(
        `SELECT COUNT(*)::INT AS cnt FROM purchase_receipts WHERE player_id = $1`,
        [playerId]
      );
      const hasPurchases = (purchaseRows?.[0]?.cnt ?? 0) > 0;
      const BASE_PURCHASE = hasPurchases ? 30_000 : 0;
      const PER_GAME_BOOTSTRAP = 80;
      const gameCountRows = await query(
        `SELECT COUNT(*)::INT AS cnt FROM game_results WHERE player_id = $1`,
        [playerId]
      );
      const gamesOnRecord = gameCountRows?.[0]?.cnt ?? 0;
      const allowedMax = Math.max(500, BASE_PURCHASE + gamesOnRecord * PER_GAME_BOOTSTRAP);

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
  const clientVersion = typeof saveData._saveVersion === 'number' ? saveData._saveVersion : undefined;
  const saveResult = await savePlayerData(playerId, saveJson, clientVersion);
  if (saveResult.conflict) {
    // Another device saved newer state — tell client to reload before retrying
    res.json({ ok: false, conflict: true, serverVersion: saveResult.serverVersion });
    return;
  }
  const resp: Record<string, any> = { ok: saveResult.ok };
  if (saveResult.newVersion !== undefined) resp.saveVersion = saveResult.newVersion;
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
  if (!result) { res.json({ found: false, dataResetVersion: '1.0.0' }); return; }
  try {
    const saveData = JSON.parse(result.saveJson);
    // Return the server-trusted diamond value so the client can apply it as override
    const trusted = getDbStatus().available ? await getTrustedDiamonds(playerId) : null;
    const resp: Record<string, any> = { found: true, saveData, updatedAt: result.updatedAt, saveVersion: result.saveVersion, dataResetVersion: '1.0.0' };
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

// POST /koth/fastest/claim  { playerId, claimDate, claimType, reactionMs, amount }
// Records KOTH fastest-clicker reward claim (daily or weekly), idempotent.
app.post("/koth/fastest/claim", async (req, res) => {
  const { playerId, claimDate, claimType, reactionMs, amount } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!claimDate || !/^\d{4}-\d{2}-\d{2}$/.test(claimDate))
    return res.status(400).json({ ok: false, error: 'invalid_date' });
  if (!['daily', 'weekly'].includes(String(claimType)))
    return res.status(400).json({ ok: false, error: 'invalid_type' });
  const ms  = Math.max(0, Number(reactionMs) || 0);
  const amt = Math.min(500, Math.max(0, Number(amount) || 0));
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });
  const result = await recordKothFastestClaim(String(playerId), claimDate, String(claimType), ms, amt);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  if (amt > 0) await addTrustedDiamonds(String(playerId), amt).catch(() => {});
  res.json({ ok: true });
});

// POST /solo/milestone/claim  { playerId, milestonePts, gems }
// Records a solo milestone reward claim, idempotent per player per milestone threshold.
app.post("/solo/milestone/claim", async (req, res) => {
  const { playerId, milestonePts, gems } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  const pts = Number(milestonePts);
  const g   = Math.min(1000, Math.max(0, Number(gems) || 0));
  if (!pts || pts < 1) return res.status(400).json({ ok: false, error: 'invalid_milestone' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });
  const result = await recordSoloMilestoneClaim(String(playerId), pts, g);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });
  if (g > 0) await addTrustedDiamonds(String(playerId), g).catch(() => {});
  res.json({ ok: true });
});

// POST /ring/reward  { playerId, amount, rewardType }
// Raises the trusted-diamond ceiling for ring salvage and ring achievement rewards.
// rewardType: 'salvage' | 'achievement'
// Max 500 diamonds per call (highest single ring achievement reward). Rate-limited to 50/day.
app.post("/ring/reward", async (req, res) => {
  const { playerId, amount, rewardType } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  const amt = Number(amount);
  if (!amt || amt <= 0 || amt > 500) return res.status(400).json({ ok: false, error: 'invalid_amount' });
  if (!['salvage', 'achievement'].includes(String(rewardType)))
    return res.status(400).json({ ok: false, error: 'invalid_type' });
  if (!getDbStatus().available) return res.json({ ok: true, offline: true });

  // Rate-limit: max 50 ring reward grants per 24 hours per player
  const rows = await query(
    `SELECT COUNT(*)::int AS cnt FROM ticket_events
     WHERE player_id = $1 AND source = 'ring_reward' AND created_at > now() - interval '24 hours'`,
    [playerId]
  );
  const cnt = Number(rows?.[0]?.cnt ?? 0);
  if (cnt >= 50) return res.json({ ok: false, error: 'rate_limit' });

  // Record the grant so rate limit works on subsequent calls
  await query(
    `INSERT INTO ticket_events (player_id, delta, source, balance) VALUES ($1, 0, 'ring_reward', $2)`,
    [playerId, amt]
  ).catch(() => {});

  await addTrustedDiamonds(String(playerId), amt).catch(() => {});
  res.json({ ok: true });
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
// Free/freeSpin spins are rate-limited to 20 per 24 hours to prevent direct-API abuse.
app.post("/ring/spin", async (req, res) => {
  const { playerId, spinType = 'free' } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });

  // Rate-limit free spins: max 20 per 24 hours per player
  if (spinType === 'free' || spinType === 'freeSpin') {
    const rows = await query(
      `SELECT COUNT(*) AS cnt FROM ring_grants
       WHERE player_id = $1
         AND (spin_type = 'free' OR spin_type = 'freeSpin')
         AND granted_at > now() - interval '24 hours'`,
      [playerId]
    );
    const cnt = Number(rows?.[0]?.cnt ?? 0);
    if (cnt >= 20) return res.json({ ok: false, error: 'free_spin_rate_limit' });
  }

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
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!grantId || !ringId)
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
  if (!claimerPlayerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(claimerPlayerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!tradeCode)
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
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!tradeCode)
    return res.json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });

  const ok = await cancelRingTrade(String(playerId), String(tradeCode).toUpperCase());
  res.json({ ok });
});

// ─── Solo Mode Leaderboard ───────────────────────────────────────────────────

// POST /solo/submit  { playerId, playerName, avatar, totalStars, levelsCompleted, perfectLevels }
app.post("/solo/submit", async (req, res) => {
  const { playerId, playerName, avatar, totalStars, levelsCompleted, perfectLevels } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.json({ ok: false, error: 'db_unavailable' });

  const stars  = Math.max(0, Math.min(Number(totalStars)      || 0, 300));
  const levels = Math.max(0, Math.min(Number(levelsCompleted) || 0, 100));
  const perf   = Math.max(0, Math.min(Number(perfectLevels)   || 0, 100));
  const name   = String(playerName || 'Player').substring(0, 16);
  const av     = String(avatar     || '🔥').substring(0, 10);

  const ok = await upsertSoloScore(playerId, name, av, stars, levels, perf);
  res.json({ ok });
});

// GET /solo/rankings?playerId=xxx — top 50 players by score
app.get("/solo/rankings", async (req, res) => {
  const playerId = (req.query.playerId as string) || '';
  if (!getDbStatus().available) return res.json({ dbAvailable: false, rankings: [] });
  const rankings = await getSoloLeaderboard(playerId);
  if (!rankings) return res.json({ dbAvailable: false, rankings: [] });
  res.json({ dbAvailable: true, rankings });
});

// ─── Gauntlet MMR ────────────────────────────────────────────────────────────

// GET /gauntlet/mmr/:playerId
app.get("/gauntlet/mmr/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.json({ ok: false, error: 'invalid_player' });
  if (!getDbStatus().available) return res.json({ ok: true, mmr: null });
  const data = await getGauntletMMR(playerId);
  res.json({ ok: true, data });
});

// GET /gauntlet/leaderboard?playerId=xxx
app.get("/gauntlet/leaderboard", async (req, res) => {
  const playerId = (req.query.playerId as string) || '';
  if (!getDbStatus().available) return res.json({ dbAvailable: false, rankings: [] });
  const rankings = await getGauntletLeaderboard(playerId);
  if (!rankings) return res.json({ dbAvailable: false, rankings: [] });
  res.json({ dbAvailable: true, rankings });
});

// POST /gauntlet/weekly/claim  { playerId, weekStart }
// weekStart: ISO Monday date "YYYY-MM-DD" of the PREVIOUS week.
// Server re-derives the player's rank from the live leaderboard and grants the reward.
// Idempotent: returns ok:false with error 'already_claimed' on duplicate.
app.post("/gauntlet/weekly/claim", async (req, res) => {
  const { playerId, weekStart } = req.body;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart))
    return res.status(400).json({ ok: false, error: 'invalid_week_start' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });

  // Derive rank from current leaderboard snapshot
  const rankings = await getGauntletLeaderboard(playerId);
  if (!rankings) return res.json({ ok: false, error: 'db_error' });

  const total   = rankings.length;
  const myEntry = rankings.find((r: any) => r.is_me);
  const rank    = myEntry ? Number(myEntry.rank) : total + 1;

  // Map rank → reward tiers (mirrors client _gmPlacementInfo)
  const pct = total > 0 ? (rank / total) * 100 : 100;
  let spins = 1, diamonds = 10;
  if (rank === 1)    { spins = 40; diamonds = 400; }
  else if (pct <= 2) { spins = 25; diamonds = 250; }
  else if (pct <= 3) { spins = 20; diamonds = 200; }
  else if (pct <= 5) { spins = 15; diamonds = 150; }
  else if (pct <= 10){ spins = 10; diamonds = 100; }
  else if (pct <= 25){ spins = 7;  diamonds = 70;  }
  else if (pct <= 50){ spins = 5;  diamonds = 50;  }
  else if (pct <= 75){ spins = 3;  diamonds = 30;  }

  const result = await claimGauntletWeeklyReward(playerId, weekStart, rank, total, spins, diamonds);
  if (result === 'already_claimed') return res.json({ ok: false, error: 'already_claimed' });
  if (result === 'error')           return res.json({ ok: false, error: 'db_error' });

  // Raise trusted-diamond ceiling for the legitimate gain
  if (diamonds > 0) await addTrustedDiamonds(playerId, diamonds).catch(() => {});

  console.log(`[Gauntlet] Weekly claim ${playerId} rank ${rank}/${total} → ${spins} spins ${diamonds}💎`);
  res.json({ ok: true, rank, total, spins, diamonds });
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
  'offer.firstweek': { type:'bundle', bundleId:'offer.firstweek', diamonds:300,   items:{crystal:5}, skins:['table_lava'], tickets:5, priceVal:1.99 },
};

// Verify purchase with Google Play Developer API.
// Returns true if purchaseState === 0 (Purchased).
// Skipped (returns true) when GOOGLE_PLAY_KEY_JSON env var is not set.
async function verifyWithGooglePlay(productId: string, purchaseToken: string): Promise<boolean> {
  const keyJson = process.env.GOOGLE_PLAY_KEY_JSON;
  if (!keyJson) {
    console.error('[IAP] Purchase rejected — GOOGLE_PLAY_KEY_JSON not configured.');
    return false;
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

// GET /purchase/spend-stats/:playerId
// Returns aggregated spend totals from purchase_receipts so the client can
// re-hydrate whale achievement progress after a localStorage wipe.
app.get("/purchase/spend-stats/:playerId", async (req, res) => {
  const { playerId } = req.params;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(playerId))
    return res.status(400).json({ error: 'invalid_player' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'db_unavailable' });
  const stats = await getPurchaseSpendStats(playerId);
  res.json({ ok: true, stats: stats ?? { totalSpentCents: 0, singlePurchaseMax: 0, bundlesBought: 0, purchaseCount: 0 } });
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

gameServer.define("gauntlet", GauntletRoom)
  .sortBy({ clients: -1 });

initDb().then(() => {
  gameServer.listen(port).then(() => {
    console.log(`🔥 Tile Royale [${region}] running on port ${port}`);
    console.log(`📊 Monitor: http://localhost:${port}/colyseus`);
  });
});
