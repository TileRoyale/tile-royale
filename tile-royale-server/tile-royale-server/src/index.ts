import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import { TileRoyaleRoom } from "./rooms/TileRoyaleRoom";
import { GauntletRoom } from "./rooms/GauntletRoom";
import { initDb, getRankingsWeekly, getRankingsAllTime, getPlayerStats, getDbStatus, getGlobalStats, getWorldRecords, getPlayerPercentiles, findPlayerByTag, sendFriendRequest, respondFriendRequest, getFriends, getFriendRequests, getFriendsLeaderboard, getFriendshipStatus, getFavoriteMode, updatePlayerProgress, getPlayerAchievements, getNews, getLatestNews, createNewsPost, deleteNewsPost, upsertPlayer, writeGameResult, query, getPlayerNotifications, markNotificationRead, claimNotificationReward, createPlayerNotification, savePlayerData, loadPlayerData, upsertPushToken, getPushTokenCount, getPlayerPushToken, checkAndRecordPromoRedemption, getPromoStats, getTrustedDiamonds, setTrustedDiamonds, addTrustedDiamonds, getKothWeeklyLeaderboard, getKothDailyStats, claimKothDailyReward, claimKothWeeklyPrize, recordPurchaseReceipt, getPurchaseReceipt, getProcessedTokens, recordPAPurchaseReceipt, getPAPurchaseReceipt, getPurchaseSpendStats, upsertPracticeScore, getPracticeLeaderboard, createRingGrant, validateRingGrant, createRingTrade, acceptRingTrade, cancelRingTrade, upsertSoloScore, getSoloLeaderboard, getGauntletMMR, getGauntletLeaderboard, claimGauntletWeeklyReward, recordDailyLoginClaim, recordMissionClaim, getAndValidateModeRewardClaim, getModeRewardPercentile, deletePlayerData, resetAllPlayerData, recordTrophyMilestoneClaim, recordAchievementUnlock, hasAchievementUnlock, checkAdRewardCooldown, recordAdRewardClaim, recordOfflineRewardClaim, getPlayerLastSeen, recordDcClaim, recordDiamondSpend, getMissionServerCount, recordSurpriseGrant, recordLevelUpClaim, recordSoloLevelClaim, getPlayerGameStats, recordTicketEvent, recordDcSwap, recordKothFastestClaim, recordSoloMilestoneClaim, savePASave, loadPASave, loadPASaveHistory, checkAndRecordPARedeem, exportAllPASaves, getPAVerifiedProductIds, getPARemoteConfig, setPARemoteConfig, getPAPurchaseReceiptFull, isPAVoidedPurchaseProcessed, recordPAVoidedPurchase,
  getCEActivePlayerCount, getCEContribution, upsertCEContribution, getCECommunityTotal, getCELeaderboard,
  getCEClaimedMilestones, hasCEMilestoneClaim, recordCEMilestoneClaim,
  hasCELbClaim, recordCELbClaim, getCEPlayerPercentile,
  getCELbGrant, createOrGetCELbGrant, ackCELbGrant, getCEUnackedGrants,
  getCEArchivedEventsInWindow,
  archiveCEEvent, getCEArchivedEvent, upsertCEArchivedEvent,
  upsertEiLbScore, getEiLeaderboard, getEiLbScore, hasEiLbClaim, recordEiLbClaim, deleteEiLbEntries, deleteEiLbEntriesByName,
  popPACorrections, setPACorrections, peekPACorrections,
  getPool, getAciGoalComplete, setAciGoalComplete, getActiveAciCompetition, createAciCompetition,
  getAciResult, getAciLeaderboard, getAciParticipantCount,
  hasAciRewardClaim, recordAciRewardClaim, getAciPlayerRank,
  openAciBottle, redeemAciBottleCode, reportAciCasts, getAciCastCount,
  getAciCompetitionNameIndex, recordAciTrophy, getAciTrophies } from "./db";
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

// ─── Firebase Cloud Messaging (TileRoyale) ────────────────────────────────────
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

// ─── Patient Angler Firebase Auth (separate project: patient-angler-fa70f) ────
// Set PA_FIREBASE_SERVICE_ACCOUNT env var to the Patient Angler project service account.

let _paFirebaseAuth: firebaseAdmin.auth.Auth | null = null;

(function initPAFirebase() {
  const envVal = (process.env.PA_FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!envVal) {
    console.log('[PA Firebase] PA_FIREBASE_SERVICE_ACCOUNT not set — PA auth unavailable');
    return;
  }
  try {
    // Value may be raw JSON (starts with {) or base64-encoded JSON
    const raw = envVal.startsWith('{') ? envVal : Buffer.from(envVal, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(raw);
    const app = firebaseAdmin.initializeApp(
      { credential: firebaseAdmin.credential.cert(serviceAccount) },
      'patient-angler'
    );
    _paFirebaseAuth = app.auth();
    console.log('[PA Firebase] ✅ Patient Angler Firebase Admin initialized');
  } catch(e: any) {
    console.error('[PA Firebase] Failed:', e?.message);
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
const MIN_CLIENT_VERSION = "v1.0.22";

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
  res.type('text/plain').send('google.com, pub-1687381057809117, DIRECT, f08c47fec0942fa0');
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

// GET /mode-rewards/stats?playerId=&mode=&periodStart=&periodEnd=
// Read-only percentile preview — used by the client to show the real (not claimed-yet) tier.
app.get("/mode-rewards/stats", async (req, res) => {
  const { playerId, mode, periodStart, periodEnd } = req.query;
  if (!playerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(playerId)))
    return res.status(400).json({ ok: false, error: 'invalid_player' });
  if (!['rush','buckshot','wild'].includes(String(mode)))
    return res.status(400).json({ ok: false, error: 'invalid_mode' });
  if (!periodStart || !periodEnd)
    return res.status(400).json({ ok: false, error: 'missing_params' });
  if (!getDbStatus().available) return res.json({ ok: false, error: 'db_unavailable' });

  const stats = await getModeRewardPercentile(String(playerId), String(mode), String(periodStart), String(periodEnd));
  if (!stats) return res.json({ ok: false, error: 'db_error' });
  res.json({ ok: true, ...stats });
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

// ── Custom Lobby (server-side, in-memory, TTL 2h) ────────────────────────────
interface CLPlayer { playerId:string; name:string; avatar:string; isHost:boolean; }
interface CLobby {
  code:string; hostId:string; mode:string; maxPlayers:number; gridSize:number;
  buckshotTiles:number; wildItems:string[]; suddenDeath:boolean; botSpeed:number;
  players:CLPlayer[]; createdAt:number; started:boolean;
}
const _customLobbies = new Map<string,CLobby>();
setInterval(()=>{
  const cut = Date.now() - 2*60*60*1000;
  for(const [k,v] of _customLobbies) if(v.createdAt<cut) _customLobbies.delete(k);
}, 15*60*1000);
function _clGenCode():string {
  const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s=''; for(let i=0;i<6;i++) s+=c[Math.floor(Math.random()*c.length)];
  return _customLobbies.has(s)?_clGenCode():s;
}

// POST /custom-lobby/create
app.post("/custom-lobby/create",(req,res)=>{
  const {playerId,name,avatar,mode,maxPlayers,gridSize,buckshotTiles,wildItems,suddenDeath,botSpeed}=req.body;
  if(!playerId||!name) return res.status(400).json({error:'invalid'});
  const code=_clGenCode();
  _customLobbies.set(code,{
    code, hostId:playerId, mode:mode||'rush',
    maxPlayers:Math.min(30,Math.max(2,maxPlayers||10)),
    gridSize:Math.min(10,Math.max(2,gridSize||5)),
    buckshotTiles:Math.min(99,Math.max(1,buckshotTiles||3)),
    wildItems:Array.isArray(wildItems)?wildItems:[],
    suddenDeath:!!suddenDeath, botSpeed:botSpeed||2000,
    players:[{playerId,name:name.substring(0,16),avatar:avatar||'🔥',isHost:true}],
    createdAt:Date.now(), started:false,
  });
  res.json({ok:true,code});
});

// GET /custom-lobby/:code  — poll for state
app.get("/custom-lobby/:code",(req,res)=>{
  const lobby=_customLobbies.get(req.params.code.toUpperCase());
  if(!lobby) return res.status(404).json({error:'not_found'});
  res.json({ok:true,lobby});
});

// POST /custom-lobby/:code/join
app.post("/custom-lobby/:code/join",(req,res)=>{
  const lobby=_customLobbies.get(req.params.code.toUpperCase());
  if(!lobby) return res.status(404).json({error:'not_found'});
  if(lobby.started) return res.status(409).json({error:'started'});
  if(lobby.players.length>=lobby.maxPlayers) return res.status(409).json({error:'full'});
  const {playerId,name,avatar}=req.body;
  if(!playerId||!name) return res.status(400).json({error:'invalid'});
  if(!lobby.players.find(p=>p.playerId===playerId))
    lobby.players.push({playerId,name:name.substring(0,16),avatar:avatar||'🔥',isHost:false});
  res.json({ok:true,lobby});
});

// POST /custom-lobby/:code/leave
app.post("/custom-lobby/:code/leave",(req,res)=>{
  const code=req.params.code.toUpperCase();
  const lobby=_customLobbies.get(code);
  if(!lobby) return res.json({ok:true});
  const {playerId}=req.body;
  lobby.players=lobby.players.filter(p=>p.playerId!==playerId);
  if(lobby.players.length===0||lobby.hostId===playerId) _customLobbies.delete(code);
  res.json({ok:true});
});

// POST /custom-lobby/:code/kick  (host only)
app.post("/custom-lobby/:code/kick",(req,res)=>{
  const lobby=_customLobbies.get(req.params.code.toUpperCase());
  if(!lobby) return res.status(404).json({error:'not_found'});
  const {playerId,targetPlayerId,targetName}=req.body;
  if(playerId!==lobby.hostId) return res.status(403).json({error:'not_host'});
  lobby.players=lobby.players.filter(p=>
    p.playerId!==targetPlayerId && !(targetName && p.name===targetName && !p.isHost)
  );
  res.json({ok:true,lobby});
});

// POST /custom-lobby/:code/start  — host marks game as started; clients start simultaneously
app.post("/custom-lobby/:code/start",(req,res)=>{
  const code=req.params.code.toUpperCase();
  const lobby=_customLobbies.get(code);
  if(!lobby) return res.status(404).json({error:'not_found'});
  const {playerId}=req.body;
  if(playerId!==lobby.hostId) return res.status(403).json({error:'not_host'});
  lobby.started=true;
  // Keep lobby alive briefly so joiners' polls catch the started state, then clean up
  setTimeout(()=>_customLobbies.delete(code), 30*1000);
  res.json({ok:true,lobby});
});
// ── End Custom Lobby ──────────────────────────────────────────────────────────

// GET /player-counts — live player counts per mode for the main menu badges
app.get("/player-counts", async (req, res) => {
  try {
    const counts: Record<string, number> = { rush: 0, buckshot: 0, wild: 0, koth: 0 };
    const trRooms = await matchMaker.query({ name: "tile_royale" });
    for (const room of trRooms) {
      const mode: string = (room as any).mode || (room.metadata && (room.metadata as any).mode) || '';
      if (mode in counts) counts[mode] += room.clients;
    }
    // Custom lobby: count players waiting in active (non-started) lobbies
    let customCount = 0;
    for (const [, lobby] of _customLobbies) {
      if (!lobby.started) customCount += lobby.players.length;
    }
    counts.custom = customCount;
    res.json(counts);
  } catch(e) {
    res.json({ rush: 0, buckshot: 0, wild: 0, koth: 0, custom: 0 });
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

gameServer.define("gauntlet", GauntletRoom)
  .sortBy({ clients: -1 });

// ─── Patient Angler Anti-cheat ────────────────────────────────────────────────

const PA_MAX_BOBBER_TIER           = 100;                  // absolute max tier per bobber
const PA_ZONE_ORDER = [
  'pond','river','lake','bay','sea','ocean','trench','maelstrom','abyss',
  'forgotten_isle',
  'emerald_cavern','amber_cavern','amethyst_cavern','ruby_cavern',
  'aquamarine_cavern','opal_cavern','obsidian_cavern','topaz_cavern',
  'sapphire_cavern','blue_diamond_cavern',
];
const PA_BOBBER_IDS = ['basic_bobber','sensitive_bobber','heavy_bobber','electronic_bobber'];
const PA_PEARL_UPGRADE_MAXLEVEL: Record<string, number> = {
  masterangler:   4,
  ghostbusters:  50,
  ghostwhisperer: 15,
};

async function validatePASave(prev: any, next: any, uid: string): Promise<{ ok: boolean; reason?: string }> {
  // ── Absolute caps (apply to every save, including the first) ─────────────────

  // Zone must be a known value
  if (next.currentZone && !PA_ZONE_ORDER.includes(next.currentZone))
    return { ok: false, reason: `invalid_zone:${next.currentZone}` };

  // Bobber tiers can't exceed the game's physical maximum
  for (const bid of PA_BOBBER_IDS) {
    if (((next.bobberTiers || {})[bid] || 0) > PA_MAX_BOBBER_TIER)
      return { ok: false, reason: `bobber_cap:${bid}=${(next.bobberTiers || {})[bid]}` };
  }

  // Pearl upgrades with hard maxLevel in-game
  for (const [id, max] of Object.entries(PA_PEARL_UPGRADE_MAXLEVEL)) {
    if (((next.pearlUpgrades || {})[id] || 0) > max)
      return { ok: false, reason: `upgrade_cap:${id}=${(next.pearlUpgrades || {})[id]}>max${max}` };
  }

  // ── First save: no previous state to compare against — absolute caps above are sufficient ──
  if (!prev) return { ok: true };

  // ── Regression detection ──────────────────────────────────────────────────
  // Blocks a lower-progress state from overwriting a real save (reinstall / fresh-state exploit).
  const prevLife = (prev.stats?.lifeCoinsEarned || 0) + (prev.coins || 0);
  const nextLife = (next.stats?.lifeCoinsEarned || 0) + (next.coins || 0);
  const prevZone = PA_ZONE_ORDER.indexOf(prev.stats?.recHighestZone || prev.currentZone || 'pond');
  const nextZone = PA_ZONE_ORDER.indexOf(next.stats?.recHighestZone || next.currentZone || 'pond');
  const prevRods = (prev.ownedRods || []).length;
  const nextRods = (next.ownedRods || []).length;

  // Zone regression: had river+ and now back to pond with almost no coins
  if (prevZone > 0 && nextZone < prevZone && nextLife < prevLife / 20)
    return { ok: false, reason: `zone_regression:${prev.stats?.recHighestZone}->${next.stats?.recHighestZone}` };

  // Rod regression: had 3+ rods and now has 1 with almost no coins
  if (prevRods >= 3 && nextRods <= 1 && nextLife < 1000)
    return { ok: false, reason: `rod_regression:${prevRods}->${nextRods}` };

  // Coin regression: lifetime coins dropped by 99%+ (reinstall default state)
  if (prevLife > 10000 && nextLife < prevLife / 100)
    return { ok: false, reason: `coin_regression:${prevLife}->${nextLife}` };

  // ── Non-consumable fraud check ────────────────────────────────────────────
  // If a non-consumable flag flipped false→true without a verified purchase receipt, reject.
  const NC_FIELDS: Record<string, string> = {
    removeAds:         'remove_ads',
    autoSellPermanent: 'permanent_autoseller',
    devSupportOwned:   'dev_support_package',
    devSupportOwned2:  'dev_support_package_2',
  };
  for (const [field, productId] of Object.entries(NC_FIELDS)) {
    if (!prev[field] && next[field]) {
      const verified = await getPAVerifiedProductIds(uid);
      if (!verified.has(productId)) {
        console.warn(`[PA] NC fraud uid=${uid}: ${field} set true without receipt for ${productId}`);
        return { ok: false, reason: `nc_fraud:${field}` };
      }
    }
  }

  return { ok: true };
}

// ── Firebase token verification middleware for PA endpoints ──────────────────
// Reads Authorization: Bearer <token>, verifies with Firebase Admin, and sets
// res.locals.paUid to the authenticated uid. Rejects with 401/503 on failure.
// Supports two token formats:
//   "gcred:<google_oauth_id_token>" — fallback for devices where Firebase token delivery is broken
//   "<firebase_id_token>"           — standard Firebase auth token

// Cache for Google credential → Firebase UID mapping (avoids hitting tokeninfo on every request)
const _gcredCache = new Map<string, { uid: string; exp: number }>();

async function _verifyGoogleCred(googleToken: string): Promise<string> {
  const cacheKey = googleToken.slice(-32);
  const cached   = _gcredCache.get(cacheKey);
  if (cached && Date.now() < cached.exp) return cached.uid;

  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleToken)}`);
  const info  = await resp.json() as { sub?: string; email?: string; error_description?: string };
  if (!info.sub) throw new Error(`invalid_google_token: ${info.error_description}`);

  const auth = _paFirebaseAuth!;
  let uid: string;
  try {
    const fbUser = await auth.getUserByProviderUid('google.com', info.sub);
    uid = fbUser.uid;
  } catch {
    if (!info.email) throw new Error('no_email_fallback');
    const fbUser = await auth.getUserByEmail(info.email);
    uid = fbUser.uid;
  }

  _gcredCache.set(cacheKey, { uid, exp: Date.now() + 55 * 60 * 1000 });
  return uid;
}

async function verifyPAToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!_paFirebaseAuth) {
    return res.status(503).json({ ok: false, error: 'auth_unavailable' });
  }
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'missing_token' });
  }
  const rawToken = header.slice(7);
  try {
    if (rawToken.startsWith('gcred:')) {
      res.locals.paUid = await _verifyGoogleCred(rawToken.slice(6));
    } else {
      const decoded = await _paFirebaseAuth.verifyIdToken(rawToken);
      res.locals.paUid = decoded.uid;
    }
    next();
  } catch (err: any) {
    console.error('[PA] verifyPAToken failed:', err?.code || err?.message);
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
}

app.post("/pa/save", verifyPAToken, express.json({ limit: "500kb" }), async (req, res) => {
  const uid  = res.locals.paUid as string; // uid from verified token — never trust body
  const { save } = req.body;
  if (!save || typeof save !== "object")
    return res.status(400).json({ ok: false, error: "invalid_request" });
  const prev      = await loadPASave(uid);
  const prevData  = prev ? JSON.parse(prev.saveJson) : null;
  const check     = await validatePASave(prevData, save, uid);
  if (!check.ok) {
    console.warn(`[PA] Anti-cheat triggered uid=${uid}: ${check.reason}`);
    return res.status(400).json({ ok: false, error: "validation_failed", reason: check.reason });
  }
  const ok = await savePASave(uid, JSON.stringify(save));
  res.json({ ok });
});

app.get("/pa/load/:uid", verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string; // uid from token — ignores URL param
  const data = await loadPASave(uid);
  const corrections = await popPACorrections(uid); // one-shot admin override; null if none pending
  if (!data) return res.json({ ok: true, save: null, ...(corrections ? { corrections } : {}) });
  res.json({ ok: true, save: JSON.parse(data.saveJson), updatedAt: data.updatedAt, ...(corrections ? { corrections } : {}) });
});

// Bump PA_MIN_CLIENT_VERSION when a forced update is required
// Bump PA_LATEST_VERSION with every new release (shows soft "update available" banner)
// Public landing page — used for PixelPicked badge verification and general info
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Patient Angler — Idle Fishing</title><style>body{margin:0;background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:20px;text-align:center}h1{font-size:1.6rem;margin:0}p{color:#8b949e;margin:0;font-size:0.95rem}a{color:#58a6ff}</style></head><body><h1>🎣 Patient Angler — Idle Fishing</h1><p>Android idle fishing game — available on Google Play.</p><a href="https://play.google.com/store/apps/details?id=com.henlygames.patientangler" target="_blank" rel="noopener">View on Google Play</a><a href="https://pixelpicked.com/game/5kzrchCPja3/patient-angler-idle-fishing/" target="_blank" rel="noopener"><img src="https://api.pixelpicked.com/badges/5kzrchCPja3/live.png?theme=dark" width="250" height="54" alt="Approved on PixelPicked"></a></body></html>`);
});

const PA_MIN_CLIENT_VERSION = "v0.1.5";
const PA_LATEST_VERSION     = "v1.0.7.64";
// Set to null when there is no active announcement.
// track: 'internal' = only shown to vX.X.X.X.X builds; 'production' = only shown to vX.X.X.X builds; omit for both.
// minBuild: first versionCode that should show the popup.
// texts: localized announcement body keyed by locale code; 'en' is the required fallback.
const PA_ANNOUNCEMENT: { track?: 'internal' | 'production'; minBuild: number; texts: Record<string, string> } | null = {
  track: 'production',
  minBuild: 493,
  texts: {
    en: "• Fishdex: new \"Go to zone\" button\n• Kraken/Ancient Vault bonus attempt fixed\n• Fishing Festival: Grand Prize display, Rare Bobber, leaderboard rewards fixed\n• New Catch Streak system for manual fishing, with ad protection\n• New collectible: Message in a Bottle\n• Increased ACI Auto Income Token rewards\n• Bug fixes: Forgotten Isle popup, Momentum display, IAP Prestige Pack recovery, shop buttons",
    et: "• Kalaraamat: uus nupp \"Go to zone\"\n• Kraken/Ancient Vault'i lisakatse parandatud\n• Kalapüügifestival: Suurauhind, Haruldane Ujuk, edetabeli auhinnad parandatud\n• Uus Catch Streak süsteem käsitsi püügiks, koos reklaamikaitsega\n• Uus kogutav ese: Sõnumipudel\n• Suurendatud ACI Auto Income Tokeni auhinnad\n• Veaparandused: Unustatud Saare hüpik, Momentumi kuva, IAP Prestige Paketi taastamine, poe nupud",
  }
};
app.get("/pa/version", (_req, res) => {
  const payload: Record<string, unknown> = { minClientVersion: PA_MIN_CLIENT_VERSION, latestVersion: PA_LATEST_VERSION };
  if (PA_ANNOUNCEMENT) payload.announcement = PA_ANNOUNCEMENT;
  res.json(payload);
});

// ─── Patient Angler Remote Config ─────────────────────────────────────────────

const PA_CONFIG_DEFAULTS: Record<string, unknown> = {
  defaultFontScale:          100,   // applied to players who haven't customised font size
  defaultBobberScale:        100,   // applied to players who haven't customised bobber size
  fishSellMult:              1.0,   // global sell multiplier on top of all other bonuses
  specialEventIntervalMin:   15,    // minutes between special events (min)
  specialEventIntervalMax:   30,    // minutes between special events (max)
  competitionEnabled:        true,
  ghostShipEnabled:          true,
  motd:                      null,  // string shown as a banner, null = no banner
  motdType:                  'info', // 'info' | 'event' | 'warning'
  // Cost overrides — { itemId: cost } objects; absent keys keep their in-code defaults
  autoCostOverrides:         {},    // AUTOMATION base costs   e.g. { "reinforced_net": 1000 }
  storageCostOverrides:      {},    // STORAGE_ITEMS costs     e.g. { "bucket": 30 }
  rodCostOverrides:          {},    // RODS purchase costs     e.g. { "river_rod": 5000 }
  rodTierCostOverrides:      {},    // RODS baseTierCost       e.g. { "river_rod": 3000 }
  bobberCostOverrides:       {},    // BOBBERS baseCost        e.g. { "heavy_bobber": 1000 }
  seagullBaitBaseCost:       10000, // tier-0 seagull bait cost (scales * 5^tier)
  costScaleMult:             1.22,  // per-purchase cost scale factor (default 1.22 = +22% each buy)
  rodTierCostsOverrides:     {},    // fixed-tier rods: { "sea_rod": [t1,t2,t3], "ocean_rod": [t1,t2,t3] }
  communityEvent:            null,  // active community event config or null
  // Array of { productId, discountPct, until } — shown as badge in store; null = no sale
  saleConfig:                null,
};

// Public — clients poll this on every launch
app.get("/pa/config", async (_req, res) => {
  try {
    const stored = await getPARemoteConfig();
    const cfg = { ...PA_CONFIG_DEFAULTS, ...stored };
    // Hide communityEvent from clients until its startsAt has passed
    if (cfg.communityEvent) {
      const ev = cfg.communityEvent as Record<string,unknown>;
      if (ev.startsAt && Number(ev.startsAt) > Date.now()) {
        cfg.communityEvent = null;
      }
    }
    res.json(cfg);
  } catch {
    res.json(PA_CONFIG_DEFAULTS);
  }
});

// Admin — update config values (partial update: existing keys not in body are kept)
app.post("/admin/pa/config", requireAdmin, async (req, res) => {
  try {
    const current = await getPARemoteConfig();
    const merged  = { ...current, ...req.body };
    await setPARemoteConfig(merged);
    res.json({ ok: true, config: { ...PA_CONFIG_DEFAULTS, ...merged } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ─── Community Event admin endpoint ──────────────────────────────────────────

// POST /admin/pa/community/start
// Counts 7-day active PA players, computes target = count × 50 000,
// and stores the event in remote config.
// Body: { eventId, name, durationHours, milestones, target?, startsAt?, endsAt? }
// startsAt defaults to now; endsAt defaults to startsAt + durationHours.
// target overrides the auto-computed activePlayers × 75 000.
app.post('/admin/pa/community/start', requireAdmin, async (req, res) => {
  const { eventId, name, durationHours = 168, milestones = [], lbTiers, isAciGoalEvent,
          target: targetOverride, startsAt: startsAtOverride, endsAt: endsAtOverride } = req.body;
  if (!eventId || !name) return res.status(400).json({ ok: false, error: 'eventId and name required' });

  const activePlayers = await getCEActivePlayerCount(7);
  const target        = targetOverride   != null ? Number(targetOverride)   : activePlayers * 75000;
  const startsAt      = startsAtOverride != null ? Number(startsAtOverride) : Date.now();
  const endsAt        = endsAtOverride   != null ? Number(endsAtOverride)   : startsAt + Number(durationHours) * 3600 * 1000;

  const communityEvent: Record<string,unknown> = { eventId, name, startsAt, endsAt, target, activePlayers, milestones };
  if (lbTiers)         communityEvent.lbTiers        = lbTiers;
  if (isAciGoalEvent)  communityEvent.isAciGoalEvent = true;

  // Archive immutable event config before making it live — allows post-event reward claims
  await archiveCEEvent(eventId, communityEvent);

  const current = await getPARemoteConfig();
  await setPARemoteConfig({ ...current, communityEvent });

  console.log(`[CE] Scheduled event "${name}" id=${eventId} target=${target} (${activePlayers} × 75k) starts=${new Date(startsAt).toISOString()} ends=${new Date(endsAt).toISOString()}${isAciGoalEvent ? ' [ACI goal]' : ''}`);
  res.json({ ok: true, event: communityEvent });
});

// POST /admin/pa/community/repair-timestamps
// Admin-only: atomically correct startsAt/endsAt on both live config and archive.
// Preserves all other event fields (milestones, lbTiers, target, etc.).
// Body: { eventId, startsAt, endsAt }  (both as ms-since-epoch numbers)
app.post('/admin/pa/community/repair-timestamps', requireAdmin, async (req, res) => {
  const { eventId, startsAt, endsAt } = req.body;
  if (!eventId || typeof startsAt !== 'number' || typeof endsAt !== 'number') {
    return res.status(400).json({ ok: false, error: 'eventId, startsAt and endsAt (ms) required' });
  }
  // Patch live config
  const current = await getPARemoteConfig();
  const cfg = { ...PA_CONFIG_DEFAULTS, ...current };
  const liveEv = cfg.communityEvent as Record<string,unknown> | null;
  if (!liveEv || liveEv.eventId !== eventId) {
    return res.status(400).json({ ok: false, error: 'event not in live config' });
  }
  const patchedEv = { ...liveEv, startsAt, endsAt };
  await setPARemoteConfig({ ...current, communityEvent: patchedEv });
  // Patch archive (upsert with corrected timestamps)
  await upsertCEArchivedEvent(eventId, patchedEv);
  console.log(`[CE] Repaired timestamps for ${eventId}: starts=${new Date(startsAt).toISOString()} ends=${new Date(endsAt).toISOString()}`);
  res.json({ ok: true, event: patchedEv });
});

// DELETE /admin/pa/community/stop — clears the active event from config
app.delete('/admin/pa/community/stop', requireAdmin, async (_req, res) => {
  const current = await getPARemoteConfig();
  await setPARemoteConfig({ ...current, communityEvent: null });
  res.json({ ok: true });
});

// GET /admin/pa/community/player-count  — read-only, no side effects
app.get('/admin/pa/community/player-count', requireAdmin, async (_req, res) => {
  const activePlayers = await getCEActivePlayerCount(7);
  res.json({ ok: true, activePlayers, projectedTarget: activePlayers * 75000 });
});

// GET /admin/pa/community/leaderboard?eventId=...  — read-only, no side effects
app.get('/admin/pa/community/leaderboard', requireAdmin, async (req, res) => {
  const eventId = (req.query.eventId as string) || '';
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_eventId' });
  const [rows, communityTotal] = await Promise.all([
    getCELeaderboard(eventId, 500),
    getCECommunityTotal(eventId),
  ]);
  res.json({ ok: true, eventId, communityTotal, rows });
});

// POST /admin/pa/community/add-bot  { eventId, botId, displayName, contribution }
// Injects a single fixed-value contribution row (not tied to a real account) directly into the
// leaderboard and community total for the given event. botId must be unique per bot; re-calling with
// the same botId ADDS to its existing contribution (same upsert used for real players), so each bot
// should only be added once. Nothing ever updates the row again afterward — the value stays frozen.
app.post('/admin/pa/community/add-bot', requireAdmin, express.json(), async (req, res) => {
  const { eventId, botId, displayName, contribution } = req.body || {};
  if (!eventId || typeof eventId !== 'string') return res.status(400).json({ ok: false, error: 'missing_eventId' });
  if (!botId || typeof botId !== 'string') return res.status(400).json({ ok: false, error: 'missing_botId' });
  if (typeof contribution !== 'number' || !Number.isFinite(contribution) || contribution <= 0) {
    return res.status(400).json({ ok: false, error: 'invalid_contribution' });
  }
  const playerId = 'bot_' + botId;
  await upsertCEContribution(playerId, eventId, contribution, typeof displayName === 'string' ? displayName : 'Angler');
  const [newContribution, communityTotal] = await Promise.all([
    getCEContribution(playerId, eventId),
    getCECommunityTotal(eventId),
  ]);
  res.json({ ok: true, playerId, eventId, contribution: newContribution, communityTotal });
});

// ─── Community Event endpoints ────────────────────────────────────────────────

// Helper: get the active event config from remote config
async function _ceGetActiveCfg(): Promise<Record<string,unknown> | null> {
  try {
    const stored = await getPARemoteConfig();
    const cfg = { ...PA_CONFIG_DEFAULTS, ...stored };
    const ev = cfg.communityEvent as Record<string,unknown> | null;
    if (!ev || !ev.eventId) return null;
    const endsAt   = Number(ev.endsAt);
    const startsAt = Number(ev.startsAt);
    if (!endsAt   || endsAt   < Date.now()) return null;
    if ( startsAt && startsAt > Date.now()) return null;
    return ev;
  } catch { return null; }
}

// Helper: get event config by ID — tries active config first, then archive
// Used for post-event claim endpoints (milestone, bobber, lb) with a 30-day grace window
const CE_POST_EVENT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
async function _ceGetEventCfgById(eventId: string): Promise<Record<string,unknown> | null> {
  // Try active config first
  try {
    const stored = await getPARemoteConfig();
    const cfg = { ...PA_CONFIG_DEFAULTS, ...stored };
    const ev = cfg.communityEvent as Record<string,unknown> | null;
    if (ev && ev.eventId === eventId) return ev;
  } catch {}
  // Fall back to archive (post-event grace window)
  try {
    const archived = await getCEArchivedEvent(eventId);
    if (!archived) return null;
    const endsAt = Number(archived.endsAt);
    if (endsAt && Date.now() - endsAt > CE_POST_EVENT_GRACE_MS) return null;
    return archived;
  } catch { return null; }
}

// GET /pa/community/status?eventId=...
app.get('/pa/community/status', verifyPAToken, async (req, res) => {
  const uid     = res.locals.paUid as string;
  const eventId = (req.query.eventId as string) || '';
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });

  const ev = await _ceGetActiveCfg();
  if (!ev || ev.eventId !== eventId) return res.json({ ok: true, status: null, eventActive: false });

  const [playerTotal, communityTotal, milestonesClaimed] = await Promise.all([
    getCEContribution(uid, eventId),
    getCECommunityTotal(eventId),
    getCEClaimedMilestones(uid, eventId),
  ]);

  res.json({
    ok: true,
    status: { playerId: uid, playerTotal, communityTotal, milestonesClaimed },
  });
});

// POST /pa/community/contribute  { eventId, amount }
app.post('/pa/community/contribute', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { eventId, amount } = req.body;
  if (!eventId || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }

  const ev = await _ceGetActiveCfg();
  if (!ev || ev.eventId !== eventId) return res.json({ ok: false, error: 'event_not_active' });

  // Anti-cheat: max 10000 fish per flush (300/s buffed max × 30s interval + headroom)
  const safeAmount = Math.min(Math.floor(amount), 10000);

  // Get player display name from save data
  let displayName: string | null = null;
  try {
    const saveRows = await query(
      `SELECT save_json::jsonb->>'playerName' AS name FROM pa_save_data WHERE uid=$1`, [uid]
    );
    displayName = saveRows?.[0]?.name || null;
  } catch { /* ignore */ }

  await upsertCEContribution(uid, eventId, safeAmount, displayName || undefined);

  const [playerTotal, communityTotal, milestonesClaimed] = await Promise.all([
    getCEContribution(uid, eventId),
    getCECommunityTotal(eventId),
    getCEClaimedMilestones(uid, eventId),
  ]);

  // ACI goal: when the designated CE event hits its target, permanently record goal complete
  // and auto-create the first competition if none exists
  if (ev.isAciGoalEvent && ev.target && communityTotal >= Number(ev.target)) {
    const existing = await getAciGoalComplete();
    if (!existing) {
      await setAciGoalComplete(eventId);
      const activeComp = await getActiveAciCompetition();
      if (!activeComp) {
        const nameIndex = Math.floor(Math.random() * (ACI_COMPETITION_NAMES as string[]).length);
        const compId    = require('crypto').randomUUID() as string;
        await createAciCompetition(compId, nameIndex, null);
      }
    }
  }

  res.json({
    ok: true,
    status: { playerId: uid, playerTotal, communityTotal, milestonesClaimed },
  });
});

// GET /pa/community/leaderboard?eventId=...
app.get('/pa/community/leaderboard', verifyPAToken, async (req, res) => {
  const eventId = (req.query.eventId as string) || '';
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });
  // Player-facing leaderboard shows top 50 only (matches Event Island's top50 list).
  const rows = await getCELeaderboard(eventId, 50);
  res.json({ ok: true, rows });
});

// ── Anglers Competition Island ────────────────────────────────────────────────

const ACI_FISH_DATA: Array<{ fishId:string; zones:string[]; rarity:string; baseValue:number; weightMinG:number; weightMaxG:number; w1legendary:boolean }> = [
  { fishId:'crucian_carp',      zones:['pond'],               rarity:'common',   baseValue:2,   weightMinG:100,  weightMaxG:4500,  w1legendary:false },
  { fishId:'roach',             zones:['pond','river'],        rarity:'common',   baseValue:2,   weightMinG:50,   weightMaxG:1800,  w1legendary:false },
  { fishId:'tench',             zones:['pond','river','lake'], rarity:'uncommon', baseValue:7,   weightMinG:200,  weightMaxG:5000,  w1legendary:false },
  { fishId:'goldfish',          zones:['pond'],               rarity:'uncommon', baseValue:8,   weightMinG:50,   weightMaxG:2000,  w1legendary:false },
  { fishId:'small_perch',       zones:['pond','river'],        rarity:'common',   baseValue:2,   weightMinG:30,   weightMaxG:800,   w1legendary:false },
  { fishId:'stone_loach',       zones:['pond'],               rarity:'uncommon', baseValue:6,   weightMinG:5,    weightMaxG:50,    w1legendary:false },
  { fishId:'stickleback',       zones:['pond'],               rarity:'common',   baseValue:1,   weightMinG:2,    weightMaxG:10,    w1legendary:false },
  { fishId:'pumpkinseed',       zones:['pond'],               rarity:'rare',     baseValue:11,  weightMinG:20,   weightMaxG:300,   w1legendary:false },
  { fishId:'weatherfish',       zones:['pond'],               rarity:'rare',     baseValue:13,  weightMinG:10,   weightMaxG:150,   w1legendary:false },
  { fishId:'common_bream',      zones:['pond','river'],        rarity:'common',   baseValue:3,   weightMinG:200,  weightMaxG:8000,  w1legendary:false },
  { fishId:'giant_crucian_carp',zones:['pond'],               rarity:'epic',     baseValue:39,  weightMinG:500,  weightMaxG:6000,  w1legendary:false },
  { fishId:'brown_trout',       zones:['river','lake'],        rarity:'rare',     baseValue:40,  weightMinG:100,  weightMaxG:10000, w1legendary:false },
  { fishId:'grayling',          zones:['river'],              rarity:'uncommon', baseValue:16,  weightMinG:50,   weightMaxG:2500,  w1legendary:false },
  { fishId:'barbel',            zones:['river'],              rarity:'uncommon', baseValue:11,  weightMinG:200,  weightMaxG:10000, w1legendary:false },
  { fishId:'chub',              zones:['river'],              rarity:'common',   baseValue:5,   weightMinG:100,  weightMaxG:4000,  w1legendary:false },
  { fishId:'pike',              zones:['river','lake'],        rarity:'rare',     baseValue:44,  weightMinG:500,  weightMaxG:25000, w1legendary:false },
  { fishId:'burbot',            zones:['river'],              rarity:'epic',     baseValue:140, weightMinG:100,  weightMaxG:7000,  w1legendary:false },
  { fishId:'large_perch',       zones:['lake'],               rarity:'common',   baseValue:10,  weightMinG:100,  weightMaxG:3000,  w1legendary:false },
  { fishId:'zander',            zones:['lake'],               rarity:'uncommon', baseValue:31,  weightMinG:200,  weightMaxG:12000, w1legendary:false },
  { fishId:'whitefish',         zones:['lake','bay'],          rarity:'uncommon', baseValue:34,  weightMinG:100,  weightMaxG:3000,  w1legendary:false },
  { fishId:'vendace',           zones:['lake'],               rarity:'uncommon', baseValue:25,  weightMinG:20,   weightMaxG:400,   w1legendary:false },
  { fishId:'eel',               zones:['lake','bay'],          rarity:'rare',     baseValue:66,  weightMinG:100,  weightMaxG:3000,  w1legendary:false },
  { fishId:'carp',              zones:['lake'],               rarity:'common',   baseValue:13,  weightMinG:500,  weightMaxG:20000, w1legendary:false },
  { fishId:'catfish',           zones:['lake'],               rarity:'epic',     baseValue:175, weightMinG:2000, weightMaxG:80000, w1legendary:false },
  { fishId:'morning_perch',     zones:['pond'],               rarity:'uncommon', baseValue:4,   weightMinG:30,   weightMaxG:800,   w1legendary:false },
  { fishId:'afternoon_roach',   zones:['pond'],               rarity:'common',   baseValue:3,   weightMinG:50,   weightMaxG:1800,  w1legendary:false },
  { fishId:'dawn_trout',        zones:['river'],              rarity:'rare',     baseValue:44,  weightMinG:100,  weightMaxG:10000, w1legendary:false },
  { fishId:'midnight_eel',      zones:['river'],              rarity:'epic',     baseValue:140, weightMinG:100,  weightMaxG:3000,  w1legendary:false },
  { fishId:'evening_catfish',   zones:['lake'],               rarity:'uncommon', baseValue:31,  weightMinG:500,  weightMaxG:30000, w1legendary:false },
  { fishId:'night_pike',        zones:['lake'],               rarity:'rare',     baseValue:53,  weightMinG:500,  weightMaxG:25000, w1legendary:false },
  { fishId:'predawn_zander',      zones:['lake'],  rarity:'rare',      baseValue:35,  weightMinG:200, weightMaxG:12000, w1legendary:false },
  // W1 legendary fish — baseValue:0 and weight ranges match base species (canonical)
  { fishId:'crimson_crown_perch', zones:['pond'],  rarity:'legendary', baseValue:0, weightMinG:30,  weightMaxG:800,   w1legendary:true },  // → small_perch
  { fishId:'golden_veil_carp',    zones:['pond'],  rarity:'legendary', baseValue:0, weightMinG:500, weightMaxG:20000, w1legendary:true },  // → carp
  { fishId:'silver_ribbon_loach', zones:['pond'],  rarity:'legendary', baseValue:0, weightMinG:5,   weightMaxG:50,    w1legendary:true },  // → stone_loach
  { fishId:'emerald_grayling',    zones:['river'], rarity:'legendary', baseValue:0, weightMinG:50,  weightMaxG:2500,  w1legendary:true },  // → grayling
  { fishId:'marbleback_barbel',   zones:['river'], rarity:'legendary', baseValue:0, weightMinG:200, weightMaxG:10000, w1legendary:true },  // → barbel
  { fishId:'redfin_chub',         zones:['river'], rarity:'legendary', baseValue:0, weightMinG:100, weightMaxG:4000,  w1legendary:true },  // → chub
  { fishId:'blueglass_char',      zones:['lake'],  rarity:'legendary', baseValue:0, weightMinG:100, weightMaxG:10000, w1legendary:true },  // → brown_trout
  { fishId:'copperplate_bream',   zones:['lake'],  rarity:'legendary', baseValue:0, weightMinG:200, weightMaxG:8000,  w1legendary:true },  // → common_bream
  { fishId:'frostback_pike',      zones:['lake'],  rarity:'legendary', baseValue:0, weightMinG:500, weightMaxG:25000, w1legendary:true },  // → pike
];
const ACI_LOOT_TABLE = [
  { type:'common',   weight:37 },
  { type:'uncommon', weight:16 },
  { type:'rare',     weight: 9 },
  { type:'epic',     weight: 3 },
];
const ACI_SIZE_TABLE = [
  { size:1,  weight:70,  mult:0.30 },
  { size:2,  weight:100, mult:0.36 },
  { size:3,  weight:120, mult:0.43 },
  { size:4,  weight:135, mult:0.51 },
  { size:5,  weight:140, mult:0.60 },
  { size:6,  weight:135, mult:0.68 },
  { size:7,  weight:120, mult:0.76 },
  { size:8,  weight:100, mult:0.84 },
  { size:9,  weight:80,  mult:0.92 },
  { size:10, weight:62,  mult:1.00 },
  { size:11, weight:46,  mult:1.10 },
  { size:12, weight:33,  mult:1.22 },
  { size:13, weight:22,  mult:1.36 },
  { size:14, weight:14,  mult:1.52 },
  { size:15, weight:8,   mult:1.72 },
  { size:16, weight:4,   mult:1.96 },
  { size:17, weight:2,   mult:2.25 },
  { size:18, weight:6,   mult:2.60, trophy:true },
  { size:19, weight:4,   mult:3.00, trophy:true },
  { size:20, weight:2,   mult:3.50, trophy:true },
] as Array<{ size:number; weight:number; mult:number; trophy?:boolean }>;
const ACI_SIZE_TOTAL = ACI_SIZE_TABLE.reduce((s, e) => s + e.weight, 0); // 1203
const ACI_COMPETITION_NAMES = [
  "The Wobbly Bobber Cup","The Suspicious Splash-Off","The Great Bait Debate",
  "The Hook, Line & Panic Classic","The Slightly Damp Derby","The Rodfather Invitational",
  "The Battle of the Buckets","The Reel Deal Rumble","The Tiny Fish, Big Dreams Cup",
  "The Net Profit Challenge","The Midnight Minnow Madness","The Carp Diem Classic",
  "The Pike and Prejudice Cup","The Trout of Control Tournament","The Codfather Cup",
  "The Perch Perfect Challenge","The Bream Team Showdown","The Lure Loser Bracket",
  "The Fish Whispering Finals","The Bobber Bonanza","The Slippery Trophy Sprint",
  "The One That Got Away Open","The Accidental Angler Cup","The Wet Sock Invitational",
  "The Mystery Ripple Rumble","The No Refunds Fishing Derby","The Floating Boot Championship",
  "The Serious Fisher, Silly Hat Cup","The Bite Me Classic","The Cast Away Clash",
  "The Almost Professional Open","The Fin-tastic Finale Qualifier","The Gill Thrill Tournament",
  "The Reel Weird Cup","The Lake Mistake Challenge","The River Riddle Derby",
  "The Baywatch Bobber Cup","The Seaweed Strategy Open","The Anchor Trouble Tournament",
  "The Trophy or Trash Trials","The Hungry Hook Championship","The Fishy Business Open",
  "The Splash Tax Invitational","The Current Affairs Cup","The Bait Regret Rumble",
  "The Legendary Maybe League","The Plankton Problem Cup","The Overconfident Angler Open",
  "The Waders Full of Hope Derby","The Net Gains Classic","The Cast First, Think Later Cup",
  "The Bobber Anxiety Open","The Reel Estate Tournament","The Deep End Derby",
  "The Fish Forecast Finals","The Hooked on Trouble Cup","The Minnow Management Challenge",
  "The Rod Rage Rumble","The Slightly Illegal Worm Cup","The Professional Splashing Open",
];

const _aciNormalPools: Record<string, typeof ACI_FISH_DATA> = { common:[], uncommon:[], rare:[], epic:[] };
const _aciW1LegPool: typeof ACI_FISH_DATA = [];
for (const f of ACI_FISH_DATA) {
  if (f.w1legendary) _aciW1LegPool.push(f);
  else if (_aciNormalPools[f.rarity]) _aciNormalPools[f.rarity].push(f);
}

const _aciValidFishIds = new Set(ACI_FISH_DATA.map(f => f.fishId));

function _aciWtRand<T extends { weight:number }>(table: T[]): T {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = Math.floor(Math.random() * total);
  for (const e of table) { r -= e.weight; if (r < 0) return e; }
  return table[table.length - 1];
}

function _rollAciCatch() {
  let fishDef: typeof ACI_FISH_DATA[0];
  let rarity: string;
  if (Math.random() < 1 / 50_000_000 && _aciW1LegPool.length > 0) {
    fishDef = _aciW1LegPool[Math.floor(Math.random() * _aciW1LegPool.length)];
    rarity  = 'legendary';
  } else {
    const entry = _aciWtRand(ACI_LOOT_TABLE);
    rarity  = entry.type;
    const pool = _aciNormalPools[rarity] || _aciNormalPools.common;
    fishDef = pool[Math.floor(Math.random() * pool.length)];
  }
  // SIZE_TABLE weighted roll → sizeQ in [1..3000]
  const sizeRandPt = Math.floor(Math.random() * ACI_SIZE_TOTAL);
  let cumBefore = 0, cumAfter = 0;
  let sizeRow: typeof ACI_SIZE_TABLE[0] = ACI_SIZE_TABLE[ACI_SIZE_TABLE.length - 1];
  for (const e of ACI_SIZE_TABLE) {
    cumAfter = cumBefore + e.weight;
    if (sizeRandPt < cumAfter) { sizeRow = e; break; }
    cumBefore = cumAfter;
  }
  const bucketLow  = Math.floor(cumBefore  * 3000 / ACI_SIZE_TOTAL);
  const bucketHigh = Math.floor(cumAfter   * 3000 / ACI_SIZE_TOTAL);
  const sizeQ      = Math.max(1, bucketLow + Math.floor(Math.random() * Math.max(1, bucketHigh - bucketLow)) + 1);
  // Weight roll
  const weightRoll = Math.floor(Math.random() * 3000);
  const wRangeMg   = (fishDef.weightMaxG - fishDef.weightMinG) * 1000;
  const weightMg   = fishDef.weightMinG * 1000 + Math.floor(weightRoll * wRangeMg / 2999);
  const scoreRank       = BigInt(Math.min(3000, sizeQ)) * 3000n * BigInt(Math.max(1, weightMg));
  const value           = Math.max(1, Math.round((fishDef.baseValue || 1) * sizeRow.mult));
  const w1legendary     = !!fishDef.w1legendary;
  const aciMaxDisplaySize = fishDef.zones.includes('lake') ? 3000
    : fishDef.zones.some((z: string) => z === 'river') ? 2500 : 1500;
  return { fishId: fishDef.fishId, rarity, sizeRow, sizeQ, weightMg, scoreRank,
           value, w1legendary, aciMaxDisplaySize };
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { randomUUID: _aciUUID } = require('crypto') as { randomUUID: () => string };

// GET /pa/aci/comp
app.get('/pa/aci/comp', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const [aciGoalEventId, comp] = await Promise.all([
    getAciGoalComplete(),
    getActiveAciCompetition(),
  ]);
  if (!comp) {
    return res.json({
      ok: true, comp: null,
      aciGoalComplete: !!aciGoalEventId,
      serverTime: Date.now(),
    });
  }
  const participation = await getAciResult(comp.comp_id, uid);
  res.json({
    ok: true,
    comp: {
      compId:    comp.comp_id,
      nameIndex: comp.name_index,
      name:      ACI_COMPETITION_NAMES[comp.name_index] || 'Competition',
      startsAt:  comp.starts_at,
      endsAt:    comp.ends_at,
    },
    aciGoalComplete: !!aciGoalEventId,
    participated:    !!participation,
    bestScore:       participation ? participation.score_rank.toString() : null,
    serverTime:      Date.now(),
  });
});

// DELETE /admin/pa/aci/comp  — admin: end the active competition immediately
app.delete('/admin/pa/aci/comp', requireAdmin, async (_req, res) => {
  const dbPool = getPool();
  if (!dbPool) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const comp = await getActiveAciCompetition();
  if (!comp) return res.json({ ok: false, error: 'no_active_competition' });
  await dbPool.query(`UPDATE aci_competitions SET ends_at = now() WHERE comp_id = $1`, [comp.comp_id]);
  res.json({ ok: true, ended: comp.comp_id });
});

// POST /pa/aci/comp/create  — admin: start a new competition immediately
app.post('/pa/aci/comp/create', requireAdmin, async (req, res) => {
  const existing = await getActiveAciCompetition();
  if (existing) {
    return res.json({ ok: false, error: 'competition_already_active', compId: existing.comp_id });
  }
  const prevAll = await (getPool()!).query(
    `SELECT name_index FROM aci_competitions ORDER BY starts_at DESC LIMIT 1`
  ).catch(() => ({ rows: [] as any[] }));
  const prevIdx = prevAll.rows[0]?.name_index ?? null;
  let nameIdx: number;
  do { nameIdx = Math.floor(Math.random() * ACI_COMPETITION_NAMES.length); }
  while (nameIdx === prevIdx && ACI_COMPETITION_NAMES.length > 1);
  const compId = _aciUUID();
  await createAciCompetition(compId, nameIdx, null);
  res.json({ ok: true, compId, nameIndex: nameIdx, name: ACI_COMPETITION_NAMES[nameIdx] });
});

// POST /pa/aci/cast/start  { compId }
app.post('/pa/aci/cast/start', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { compId } = req.body;
  if (!compId) return res.status(400).json({ ok: false, error: 'missing_comp_id' });
  const comp = await getActiveAciCompetition();
  if (!comp || comp.comp_id !== compId) {
    return res.json({ ok: false, error: 'competition_not_active' });
  }
  const biteDelayMs = 2000 + Math.floor(Math.random() * 3001);
  const dbPool = getPool();
  if (!dbPool) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    // Cancel any prior unused token for this player in this comp
    await client.query(
      `UPDATE aci_cast_tokens SET used=true WHERE uid=$1 AND comp_id=$2 AND used=false`,
      [uid, compId]
    );
    const token      = _aciUUID();
    const biteReadyAt = new Date(Date.now() + biteDelayMs);
    await client.query(
      `INSERT INTO aci_cast_tokens (token, uid, comp_id, used, bite_ready_at, created_at)
       VALUES ($1,$2,$3,false,$4,now())`,
      [token, uid, compId, biteReadyAt]
    );
    await client.query('COMMIT');
    res.json({ ok: true, token, biteDelayMs });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ACI cast/start error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
});

// POST /pa/aci/cast/complete  { token }
app.post('/pa/aci/cast/complete', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { token } = req.body;
  if (!token) return res.status(400).json({ ok: false, error: 'missing_token' });
  const dbPool = getPool();
  if (!dbPool) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const tRow = (await client.query(
      `SELECT * FROM aci_cast_tokens WHERE token=$1 FOR UPDATE`, [token]
    )).rows[0];
    if (!tRow) {
      await client.query('ROLLBACK');
      return res.json({ ok: false, error: 'token_not_found' });
    }
    if (tRow.uid !== uid) {
      await client.query('ROLLBACK');
      return res.json({ ok: false, error: 'token_owner_mismatch' });
    }
    // Idempotent: return stored result if token was already completed
    if (tRow.used && tRow.result_json) {
      await client.query('ROLLBACK');
      return res.json({ ok: true, catch: JSON.parse(tRow.result_json), isNewBest: false, cached: true });
    }
    if (tRow.used) {
      await client.query('ROLLBACK');
      return res.json({ ok: false, error: 'token_already_used' });
    }
    // Verify comp still active
    const compRow = (await client.query(
      `SELECT comp_id FROM aci_competitions WHERE comp_id=$1 AND ends_at > now()`, [tRow.comp_id]
    )).rows[0];
    if (!compRow) {
      await client.query('ROLLBACK');
      return res.json({ ok: false, error: 'competition_expired' });
    }
    // Generate fish + score
    const cd = _rollAciCatch();
    const catchObj = {
      fishId:           cd.fishId,
      rarity:           cd.rarity,
      zone:             'anglers_competition_island',
      size:             cd.sizeRow.size,
      sizeMult:         cd.sizeRow.mult,
      isTrophy:         !!cd.sizeRow.trophy,
      sizeQ:            cd.sizeQ,
      weightMg:         cd.weightMg,
      weightG:          Math.round(cd.weightMg / 1000 * 100) / 100,
      scoreRank:        cd.scoreRank.toString(),
      playerScore:      Number(cd.scoreRank / 3_000_000n),
      caughtAt:         Date.now(),
      compId:           tRow.comp_id,
      value:            cd.value,
      w1legendary:      cd.w1legendary,
      aciMaxDisplaySize: cd.aciMaxDisplaySize,
    };
    const resultJson = JSON.stringify(catchObj);
    // Resolve display name
    let displayName = 'Anonymous Angler';
    try {
      const nr = (await client.query(
        `SELECT save_json::jsonb->>'playerName' AS name FROM pa_save_data WHERE uid=$1`, [uid]
      )).rows[0];
      if (nr?.name) displayName = nr.name;
    } catch { /* ignore */ }
    // Check existing best score
    const existing = (await client.query(
      `SELECT score_rank FROM aci_results WHERE comp_id=$1 AND uid=$2`, [tRow.comp_id, uid]
    )).rows[0];
    const existingScore = existing ? BigInt(existing.score_rank) : 0n;
    const isNewBest = !existing || cd.scoreRank > existingScore;
    if (!existing) {
      await client.query(
        `INSERT INTO aci_results (comp_id,uid,display_name,score_rank,fish_id,result_json,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())`,
        [tRow.comp_id, uid, displayName, cd.scoreRank.toString(), cd.fishId, resultJson]
      );
    } else if (isNewBest) {
      await client.query(
        `UPDATE aci_results SET score_rank=$1,fish_id=$2,result_json=$3,display_name=$4,recorded_at=now()
         WHERE comp_id=$5 AND uid=$6`,
        [cd.scoreRank.toString(), cd.fishId, resultJson, displayName, tRow.comp_id, uid]
      );
    }
    await client.query(
      `UPDATE aci_cast_tokens SET used=true,result_json=$1 WHERE token=$2`, [resultJson, token]
    );
    await client.query('COMMIT');
    res.json({ ok: true, catch: catchObj, isNewBest, cached: false });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ACI cast/complete error:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  } finally {
    client.release();
  }
});

// GET /pa/aci/leaderboard?compId=...
app.get('/pa/aci/leaderboard', verifyPAToken, async (req, res) => {
  const uid    = res.locals.paUid as string;
  const compId = (req.query.compId as string) || '';
  if (!compId) return res.status(400).json({ ok: false, error: 'missing_comp_id' });
  const [lb, participantCount] = await Promise.all([
    getAciLeaderboard(compId, uid),
    getAciParticipantCount(compId),
  ]);
  res.json({ ok: true, rows: lb.rows, selfRow: lb.selfRow, participantCount });
});

// POST /pa/aci/score/submit  — submit a locally-cast personal-best score
app.post('/pa/aci/score/submit', verifyPAToken, async (req, res) => {
  const uid    = res.locals.paUid as string;
  const { compId, scoreRank, fishId, sizeQ, maxDisplaySize, weightMg } = req.body as {
    compId?: string; scoreRank?: string; fishId?: unknown; sizeQ?: unknown; maxDisplaySize?: unknown; weightMg?: unknown;
  };
  if (!compId || !scoreRank) return res.status(400).json({ ok: false, error: 'missing_fields' });
  // Validate scoreRank is a non-negative integer string (BigInt-safe)
  if (!/^\d{1,30}$/.test(scoreRank)) return res.status(400).json({ ok: false, error: 'invalid_score' });

  // Fish/size/weight are optional (older clients may omit them) and only describe the catch behind this
  // score — never used for ranking. Bad/out-of-range values are silently dropped rather than rejected,
  // so a malformed value never blocks the score itself from being recorded.
  const safeFishId = (typeof fishId === 'string' && _aciValidFishIds.has(fishId)) ? fishId : '';
  const safeSizeQ  = (typeof sizeQ === 'number' && Number.isInteger(sizeQ) && sizeQ >= 1 && sizeQ <= 3000) ? sizeQ : 0;
  const safeMaxDisplaySize = (typeof maxDisplaySize === 'number' && Number.isInteger(maxDisplaySize) && maxDisplaySize > 0 && maxDisplaySize <= 100_000) ? maxDisplaySize : 3000;
  const safeWeightMg = (typeof weightMg === 'number' && Number.isFinite(weightMg) && weightMg >= 0 && weightMg <= 100_000_000) ? Math.round(weightMg) : 0;
  const resultJson = JSON.stringify({ sizeQ: safeSizeQ, maxDisplaySize: safeMaxDisplaySize, weightMg: safeWeightMg });

  const dbPool = getPool();
  if (!dbPool) return res.status(503).json({ ok: false, error: 'db_unavailable' });

  // Verify comp exists and hasn't ended
  const comp = await dbPool.query(
    `SELECT comp_id, ends_at FROM aci_competitions WHERE comp_id=$1`, [compId]
  );
  if (!comp.rows[0]) return res.status(404).json({ ok: false, error: 'comp_not_found' });
  if (new Date(comp.rows[0].ends_at) <= new Date()) return res.status(400).json({ ok: false, error: 'competition_expired' });

  const submitted = BigInt(scoreRank);
  const existing  = (await dbPool.query(
    `SELECT score_rank::text AS score_rank, display_name FROM aci_results WHERE comp_id=$1 AND uid=$2`, [compId, uid]
  )).rows[0];
  const existingScore = existing ? BigInt(existing.score_rank) : 0n;

  if (!existing) {
    // Best-effort display name from saved game state
    let displayName = 'Anonymous Angler';
    try {
      const save = await loadPASave(uid);
      if (save) {
        const parsed = JSON.parse(save.saveJson) as Record<string, unknown>;
        if (typeof parsed.displayName === 'string' && parsed.displayName) {
          displayName = parsed.displayName;
        }
      }
    } catch {}
    await dbPool.query(
      `INSERT INTO aci_results (comp_id,uid,display_name,score_rank,fish_id,result_json,recorded_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())`,
      [compId, uid, displayName, submitted.toString(), safeFishId, resultJson]
    );
  } else if (submitted > existingScore) {
    // The catch behind the new personal best replaces the previously recorded fish/size/weight too.
    await dbPool.query(
      `UPDATE aci_results SET score_rank=$1,fish_id=$2,result_json=$3,recorded_at=now()
       WHERE comp_id=$4 AND uid=$5`,
      [submitted.toString(), safeFishId, resultJson, compId, uid]
    );
  }

  const bestScore = submitted > existingScore ? submitted : existingScore;
  return res.json({ ok: true, bestScore: bestScore.toString() });
});

// ACI end-of-competition rewards. Diamonds stay fixed; Auto Income Tokens (1 h of income each) are the
// progression-scaling part of the reward. Keep in sync with the Rewards tab in aci_competition.js.
const ACI_REWARDS = {
  top1:        { diamonds: 50, tokens: 8 },
  top3:        { diamonds: 25, tokens: 5 },
  top5:        { diamonds: 10, tokens: 3 },
  participant: { diamonds: 0,  tokens: 2 },   // requires >= ACI_PARTICIPATION_MIN_CASTS casts
} as const;
const ACI_PARTICIPATION_MIN_CASTS = 25;

// POST /pa/aci/casts/report  { compId, casts }
// Casts are rolled on the client, so the server never sees them one by one. The client reports its running
// total per competition; it is what the "at least 25 casts" participation reward is checked against.
// Plausibility: at most 1 cast per second since the competition started; only for a running competition.
app.post('/pa/aci/casts/report', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { compId, casts } = (req.body || {}) as { compId?: unknown; casts?: unknown };
  if (typeof compId !== 'string' || !compId || compId.length > 80) return res.status(400).json({ ok: false, error: 'missing_comp_id' });
  if (typeof casts !== 'number' || !Number.isInteger(casts) || casts < 0 || casts > 1_000_000) {
    return res.status(400).json({ ok: false, error: 'invalid_casts' });
  }
  const dbPool = getPool();
  if (!dbPool) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const comp = (await dbPool.query(`SELECT starts_at, ends_at FROM aci_competitions WHERE comp_id = $1`, [compId])).rows[0];
  if (!comp) return res.status(404).json({ ok: false, error: 'comp_not_found' });
  const now = Date.now();
  if (new Date(comp.ends_at).getTime() <= now) return res.status(400).json({ ok: false, error: 'competition_expired' });
  const maxPlausible = Math.max(0, Math.floor((now - new Date(comp.starts_at).getTime()) / 1000));
  const stored = await reportAciCasts(compId, uid, Math.min(casts, maxPlausible));
  if (stored === null) return res.status(500).json({ ok: false, error: 'server_error' });
  return res.json({ ok: true, casts: stored });
});

// GET /pa/aci/reward/pending  — unclaimed reward from most recent finished comp
app.get('/pa/aci/reward/pending', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const dbPool = getPool();
  if (!dbPool) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const activeComp = await getActiveAciCompetition();
  const params: any[] = [uid];
  let excludeClause = '';
  if (activeComp) { params.push(activeComp.comp_id); excludeClause = `AND c.comp_id != $${params.length}`; }
  const row = (await dbPool.query(
    `SELECT c.comp_id, c.name_index
     FROM aci_competitions c
     JOIN aci_results r ON r.comp_id = c.comp_id AND r.uid = $1
     LEFT JOIN aci_reward_claims cl ON cl.comp_id = c.comp_id AND cl.uid = $1
     WHERE c.ends_at <= now() AND cl.comp_id IS NULL ${excludeClause}
     ORDER BY c.ends_at DESC LIMIT 1`,
    params
  )).rows[0];
  if (!row) return res.json({ ok: true, pending: null });
  const [rank, total] = await Promise.all([
    getAciPlayerRank(row.comp_id, uid),
    getAciParticipantCount(row.comp_id),
  ]);
  let bracket = 'participant'; let diamonds: number = ACI_REWARDS.participant.diamonds; let tokens: number = ACI_REWARDS.participant.tokens;
  if (rank !== null && total > 0) {
    const pct = rank / total * 100;
    if      (pct <= 1) { bracket = 'top1'; diamonds = ACI_REWARDS.top1.diamonds; tokens = ACI_REWARDS.top1.tokens; }
    else if (pct <= 3) { bracket = 'top3'; diamonds = ACI_REWARDS.top3.diamonds; tokens = ACI_REWARDS.top3.tokens; }
    else if (pct <= 5) { bracket = 'top5'; diamonds = ACI_REWARDS.top5.diamonds; tokens = ACI_REWARDS.top5.tokens; }
  }
  if (bracket === 'participant') {
    if ((await getAciCastCount(row.comp_id, uid)) < ACI_PARTICIPATION_MIN_CASTS) return res.json({ ok: true, pending: null });
  }
  res.json({ ok: true, pending: { compId: row.comp_id, nameIndex: row.name_index, rank, totalParticipants: total, bracket, diamonds, tokens } });
});

// POST /pa/aci/reward/claim  { compId }
app.post('/pa/aci/reward/claim', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { compId } = req.body;
  if (!compId) return res.status(400).json({ ok: false, error: 'missing_comp_id' });
  // Comp must be over
  const activeComp = await getActiveAciCompetition();
  if (activeComp && activeComp.comp_id === compId) {
    return res.json({ ok: false, error: 'competition_still_active' });
  }
  // Player must have participated
  const result = await getAciResult(compId, uid);
  if (!result) return res.json({ ok: false, error: 'no_participation' });
  // Idempotent
  if (await hasAciRewardClaim(compId, uid)) {
    return res.json({ ok: false, error: 'already_claimed' });
  }
  const [rank, total] = await Promise.all([
    getAciPlayerRank(compId, uid),
    getAciParticipantCount(compId),
  ]);
  let bracket = 'participant';
  let diamonds: number = ACI_REWARDS.participant.diamonds;
  let tokens: number   = ACI_REWARDS.participant.tokens;
  if (rank !== null && total > 0) {
    const pct = rank / total * 100;
    if      (pct <= 1) { bracket = 'top1'; diamonds = ACI_REWARDS.top1.diamonds; tokens = ACI_REWARDS.top1.tokens; }
    else if (pct <= 3) { bracket = 'top3'; diamonds = ACI_REWARDS.top3.diamonds; tokens = ACI_REWARDS.top3.tokens; }
    else if (pct <= 5) { bracket = 'top5'; diamonds = ACI_REWARDS.top5.diamonds; tokens = ACI_REWARDS.top5.tokens; }
  }
  if (bracket === 'participant') {
    if ((await getAciCastCount(compId, uid)) < ACI_PARTICIPATION_MIN_CASTS) tokens = 0;
  }
  await recordAciRewardClaim(compId, uid, bracket, diamonds, tokens);
  // Trophy room: permanent record of this placement, independent of the reward-claim payout above.
  if (bracket !== 'participant' && rank !== null) {
    const nameIndex = await getAciCompetitionNameIndex(compId);
    let fishSizeQ = 0, fishMaxDisplaySize = 3000, fishWeightMg = 0;
    try {
      const rj = JSON.parse(result.result_json || '{}') as { sizeQ?: number; maxDisplaySize?: number; weightMg?: number };
      if (typeof rj.sizeQ === 'number') fishSizeQ = rj.sizeQ;
      if (typeof rj.maxDisplaySize === 'number' && rj.maxDisplaySize > 0) fishMaxDisplaySize = rj.maxDisplaySize;
      if (typeof rj.weightMg === 'number') fishWeightMg = rj.weightMg;
    } catch {}
    await recordAciTrophy(uid, compId, nameIndex, bracket, rank, total, result.fish_id || '', fishSizeQ, fishMaxDisplaySize, fishWeightMg, String(result.score_rank ?? '0'));
  }
  if (diamonds > 0 || tokens > 0) {
    const existing = await peekPACorrections(uid);
    const prev = (existing?.corrections || {}) as Record<string, any>;
    const merged: Record<string, any> = { ...prev };
    if (diamonds > 0) merged._aciRewardDiamonds = (typeof prev._aciRewardDiamonds === 'number' ? prev._aciRewardDiamonds : 0) + diamonds;
    if (tokens   > 0) merged._aciRewardTokens   = (typeof prev._aciRewardTokens   === 'number' ? prev._aciRewardTokens   : 0) + tokens;
    await setPACorrections(uid, merged);
  }
  res.json({ ok: true, bracket, rank, totalParticipants: total });
});

// GET /pa/aci/trophies — the player's permanent Trophy Room (top1/top3/top5 placements ever claimed)
app.get('/pa/aci/trophies', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const dbPool = getPool();
  if (!dbPool) return res.status(503).json({ ok: false, error: 'db_unavailable' });
  const trophies = await getAciTrophies(uid);
  res.json({ ok: true, trophies });
});

// ── ACI: Message in a Bottle ──────────────────────────────────────────────────
// A bottle drops (1 in 5000 ACI casts) on the client. Opening it asks the server for a single-use gift
// code worth ACI_BOTTLE_REWARD. The code can be redeemed by the opener or given to anyone; once it is
// redeemed it is deleted from the server (see /pa/redeem).

const ACI_BOTTLE_REWARD = { diamonds: 25, autoIncomePackages: 5, treasureMapFragments: 25 } as const;
const ACI_BOTTLE_DAILY_CAP = 5;   // max bottles a player can open per rolling 24 h
const _BOTTLE_CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O/1/I — easy to read out and type
const ACI_BOTTLE_CODE_RE   = /^BTL[A-HJ-NP-Z2-9]{9}$/;              // 12 chars, letters+digits only (the client strips everything else)
const { randomInt: _bottleRandomInt } = require('crypto') as { randomInt: (min: number, max: number) => number };

function _genBottleCode(): string {
  let code = 'BTL';
  for (let i = 0; i < 9; i++) code += _BOTTLE_CODE_CHARSET[_bottleRandomInt(0, _BOTTLE_CODE_CHARSET.length)];
  return code;
}

// POST /pa/aci/bottle/open  { bottleId }  → { ok, code, reward }
app.post('/pa/aci/bottle/open', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { bottleId } = (req.body || {}) as { bottleId?: unknown };
  if (typeof bottleId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(bottleId)) {
    return res.status(400).json({ ok: false, error: 'invalid_bottle' });
  }
  // Bottles only exist on the island — it must have been unlocked
  if (!(await getAciGoalComplete())) return res.json({ ok: false, error: 'aci_locked' });

  const result = await openAciBottle(uid, bottleId, _genBottleCode(), ACI_BOTTLE_DAILY_CAP);
  if (result.status === 'ok') {
    console.log(`[ACI bottle] ${uid} opened bottle ${bottleId}`);
    return res.json({ ok: true, code: result.code, reward: ACI_BOTTLE_REWARD });
  }
  if (result.status === 'error') return res.status(500).json({ ok: false, error: 'server_error' });
  return res.json({ ok: false, error: result.status });   // cap_reached | already_redeemed | not_owner
});

// ── EI Catch-Rate Leaderboard ─────────────────────────────────────────────────

// POST /pa/ei/leaderboard/submit  { eventId, catchRate }
app.post('/pa/ei/leaderboard/submit', verifyPAToken, express.json(), async (req, res) => {
  const uid = res.locals.paUid as string;
  const { eventId, catchRate, displayName: clientName } = req.body;
  if (!eventId || typeof catchRate !== 'number' || catchRate <= 0) {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }
  let displayName = (typeof clientName === 'string' && clientName.trim()) ? clientName.trim() : '';
  if (!displayName) {
    try {
      const paRow = await loadPASave(uid);
      if (paRow?.saveJson) {
        const s = JSON.parse(paRow.saveJson);
        displayName = s.playerName || s.username || s.anglerName || '';
      }
    } catch {}
    if (!displayName) displayName = 'Angler';
  }
  await upsertEiLbScore(uid, eventId, displayName, catchRate);
  res.json({ ok: true });
});

// GET /pa/ei/leaderboard?eventId=...
app.get('/pa/ei/leaderboard', verifyPAToken, async (req, res) => {
  const uid     = res.locals.paUid as string;
  const eventId = (req.query.eventId as string) || '';
  if (!eventId) return res.status(400).json({ ok: false, error: 'missing_event_id' });

  const rows = await getEiLeaderboard(eventId);
  const total = rows.length;

  // Top 50 with rank
  const top50 = rows.slice(0, 50).map((r, i) => ({
    rank:        i + 1,
    displayName: r.display_name,
    catchRate:   r.catch_rate,
  }));

  // Own rank
  const ownIdx = rows.findIndex(r => r.uid === uid);
  let own: { rank: number; catchRate: number; pctile: number; displayName: string; claimed: boolean } | null = null;
  if (ownIdx >= 0) {
    const rank    = ownIdx + 1;
    const pctile  = total > 0 ? ((rank - 1) / total) * 100 : 100;
    const claimed = await hasEiLbClaim(uid, eventId);
    own = { rank, catchRate: rows[ownIdx].catch_rate, pctile, displayName: rows[ownIdx].display_name, claimed };
  }

  res.json({ ok: true, top50, own, total });
});

// GET /admin/pa/save/:uid  — read raw save fields for a player
app.get('/admin/pa/save/:uid', requireAdmin, async (req, res) => {
  const uid = req.params.uid;
  const paRow = await loadPASave(uid);
  if (!paRow?.saveJson) return res.status(404).json({ ok: false, error: 'not_found' });
  const save = JSON.parse(paRow.saveJson);
  res.json({
    ok: true,
    uid,
    updatedAt: paRow.updatedAt ?? null,
    bestPrestigePearls: save.stats?.bestPrestigePearls ?? null,
    blackPearls: save.blackPearls ?? null,
    prestigeCount: save.prestigeCount ?? null,
    lifePearlsEarned: save.stats?.lifePearlsEarned ?? null,
  });
});

// DELETE /admin/pa/ei/leaderboard/entries  { uids?: string[], displayNames?: string[] }  — remove specific players' scores
app.delete('/admin/pa/ei/leaderboard/entries', requireAdmin, express.json(), async (req, res) => {
  const { uids, displayNames } = req.body;
  let deleted = 0;
  if (Array.isArray(uids) && uids.length) deleted += await deleteEiLbEntries(uids);
  if (Array.isArray(displayNames) && displayNames.length) deleted += await deleteEiLbEntriesByName(displayNames);
  if (!deleted && !uids?.length && !displayNames?.length) return res.status(400).json({ ok: false, error: 'uids or displayNames required' });
  res.json({ ok: true, deleted });
});

// POST /pa/ei/leaderboard/claim  { eventId }
app.post('/pa/ei/leaderboard/claim', verifyPAToken, express.json(), async (req, res) => {
  const uid = res.locals.paUid as string;
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ ok: false, error: 'invalid_request' });

  if (await hasEiLbClaim(uid, eventId)) {
    return res.json({ ok: false, error: 'already_claimed' });
  }

  const rows   = await getEiLeaderboard(eventId);
  const total  = rows.length;
  const ownIdx = rows.findIndex(r => r.uid === uid);
  if (ownIdx < 0) return res.json({ ok: false, error: 'no_score' });

  const pctile = total > 0 ? (ownIdx / total) * 100 : 100;
  let tokens = 0;
  if (pctile <= 1)  tokens = 10;
  else if (pctile <= 5)  tokens = 5;
  else if (pctile <= 10) tokens = 3;
  else if (pctile <= 25) tokens = 1;

  if (tokens === 0) return res.json({ ok: false, error: 'not_qualified' });

  // Record claim first (idempotence)
  await recordEiLbClaim(uid, eventId, tokens);

  // Apply tokens to player save
  try {
    const paRow = await loadPASave(uid);
    if (paRow?.saveJson) {
      const save = JSON.parse(paRow.saveJson);
      save.autoIncomePackages = (save.autoIncomePackages || 0) + tokens;
      await savePASave(uid, JSON.stringify(save));
    }
  } catch {}

  res.json({ ok: true, tokens, pctile });
});

// POST /pa/community/claim  { eventId, milestonePct }
app.post('/pa/community/claim', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { eventId, milestonePct } = req.body;
  if (!eventId || typeof milestonePct !== 'number') {
    return res.status(400).json({ ok: false, error: 'invalid_request' });
  }

  const ev = await _ceGetEventCfgById(eventId);
  if (!ev) return res.json({ ok: false, error: 'event_not_found' });

  // Reject claims before event starts
  if (ev.startsAt && Number(ev.startsAt) > Date.now()) return res.json({ ok: false, error: 'event_not_started' });

  const milestones = ev.milestones as Array<Record<string,unknown>>;
  const ms = milestones.find(m => Number(m.pct) === milestonePct);
  if (!ms) return res.json({ ok: false, error: 'unknown_milestone' });

  // Check if already claimed
  if (await hasCEMilestoneClaim(uid, eventId, milestonePct)) {
    return res.json({ ok: false, error: 'already_claimed' });
  }

  const [playerTotal, communityTotal] = await Promise.all([
    getCEContribution(uid, eventId),
    getCECommunityTotal(eventId),
  ]);
  const communityPct = ev.target ? (communityTotal / Number(ev.target) * 100) : 0;
  const playerPct    = ev.target ? (playerTotal    / Number(ev.target) * 100) : 0;

  // Community milestone: community must have reached pct%
  if (communityPct < milestonePct) {
    return res.json({ ok: false, error: 'milestone_not_reached' });
  }

  await recordCEMilestoneClaim(uid, eventId, milestonePct);
  const milestonesClaimed = await getCEClaimedMilestones(uid, eventId);

  // Build reward — blackPearls with optional bonus diamonds and bobber
  const reward: Record<string,unknown> = {
    type:       ms.type,
    reward_pct: ms.reward_pct,
  };
  if (ms.bonusDiamonds) reward.bonusDiamonds = ms.bonusDiamonds;
  if (ms.bonusBobber) {
    const bb = ms.bonusBobber as Record<string,unknown>;
    if (playerPct >= Number(bb.minPlayerPct)) {
      reward.bonusBobber = bb.id;
      // Also record sentinel 101 so claim-bobber endpoint won't double-grant
      await recordCEMilestoneClaim(uid, eventId, 101);
    }
  }

  res.json({
    ok: true,
    reward,
    status: { playerId: uid, playerTotal, communityTotal, milestonesClaimed },
  });
});

// POST /pa/community/claim-bobber  { eventId }
// Separate bobber claim for players who qualified AFTER claiming the 100% milestone.
// Uses sentinel milestonePct=101 in pa_community_claims to track separately.
app.post('/pa/community/claim-bobber', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ ok: false, error: 'invalid_request' });

  const ev = await _ceGetEventCfgById(eventId);
  if (!ev) return res.json({ ok: false, error: 'event_not_found' });

  if (ev.startsAt && Number(ev.startsAt) > Date.now()) return res.json({ ok: false, error: 'event_not_started' });

  const ms100 = (ev.milestones as Array<Record<string,unknown>>).find(m => Number(m.pct) === 100 && m.bonusBobber);
  if (!ms100) return res.json({ ok: false, error: 'no_bobber_milestone' });

  if (await hasCEMilestoneClaim(uid, eventId, 101)) {
    return res.json({ ok: false, error: 'already_claimed' });
  }

  const [playerTotal, communityTotal] = await Promise.all([
    getCEContribution(uid, eventId),
    getCECommunityTotal(eventId),
  ]);
  const communityPct = ev.target ? (communityTotal / Number(ev.target) * 100) : 0;
  const playerPct    = ev.target ? (playerTotal    / Number(ev.target) * 100) : 0;

  if (communityPct < 100) return res.json({ ok: false, error: 'milestone_not_reached' });

  const bb = ms100.bonusBobber as Record<string,unknown>;
  if (playerPct < Number(bb.minPlayerPct)) return res.json({ ok: false, error: 'not_qualified' });

  await recordCEMilestoneClaim(uid, eventId, 101);
  const milestonesClaimed = await getCEClaimedMilestones(uid, eventId);

  res.json({
    ok: true,
    reward: { bonusBobber: bb.id },
    status: { playerId: uid, playerTotal, communityTotal, milestonesClaimed },
  });
});

// ─── CE LB two-phase grant ────────────────────────────────────────────────────

const CE_LB_TIERS_DEFAULT = [
  { key: 'top1',  maxPct:  1, reward_pct: 50, diamonds: 50, autoTokens: 5 },
  { key: 'top3',  maxPct:  3, reward_pct: 30, diamonds: 30, autoTokens: 3 },
  { key: 'top10', maxPct: 10, reward_pct: 15, diamonds: 20, autoTokens: 2 },
  { key: 'top25', maxPct: 25, reward_pct: 10, diamonds: 10, autoTokens: 1 },
];

function _ceTierForPercentile(evCfg: Record<string,unknown>, percentile: number) {
  const tiers = Array.isArray(evCfg.lbTiers)
    ? (evCfg.lbTiers as typeof CE_LB_TIERS_DEFAULT)
    : CE_LB_TIERS_DEFAULT;
  return tiers.find(t => percentile <= t.maxPct) ?? null;
}

function _ceGrantResponse(grant: any) {
  return {
    grantId:   grant.grant_id,
    eventId:   grant.event_id,
    reward:    grant.reward_json,
    rank:      grant.rank_num,
    total:     grant.total_num,
  };
}

// GET /pa/community/lb-pending
// Returns all unacknowledged LB grants for the player from ended archived events.
// No eventId required — covers all eligible events within the claim window.
app.get('/pa/community/lb-pending', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;

  // First: return any already-created unacked grants (covers lost-response retries)
  const existingGrants = await getCEUnackedGrants(uid, CE_POST_EVENT_GRACE_MS);

  // Second: scan archived events for events where the player qualifies but has no grant yet
  const archivedEvents = await getCEArchivedEventsInWindow(CE_POST_EVENT_GRACE_MS);
  const coveredEventIds = new Set(existingGrants.map(g => g.event_id));

  for (const ev of archivedEvents) {
    const eventId  = ev.eventId as string;
    const endsAtMs = Number(ev.endsAt);
    if (!eventId || !endsAtMs || Date.now() < endsAtMs) continue; // not ended yet
    if (coveredEventIds.has(eventId)) continue; // already have a grant

    const perc = await getCEPlayerPercentile(uid, eventId);
    if (!perc) continue;

    const tier = _ceTierForPercentile(ev, perc.percentile);
    if (!tier) continue;

    const reward = {
      type: 'lb', tierKey: tier.key,
      reward_pct: tier.reward_pct, diamonds: tier.diamonds, autoTokens: tier.autoTokens,
    };
    const grant = await createOrGetCELbGrant(uid, eventId, tier.key, reward, perc.rank, perc.total);
    existingGrants.push(grant);
  }

  res.json({ ok: true, grants: existingGrants.map(_ceGrantResponse) });
});

// POST /pa/community/lb-claim  { eventId }
// Idempotent: creates a grant on first call, returns the same grant on retry.
// Never returns already_claimed — a retry always gets the grant back.
app.post('/pa/community/lb-claim', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ ok: false, error: 'invalid_request' });

  const evCfg = await _ceGetEventCfgById(eventId);
  if (!evCfg) return res.json({ ok: false, error: 'event_not_found' });
  const endsAtMs = Number(evCfg.endsAt);
  if (!endsAtMs || Date.now() < endsAtMs) return res.json({ ok: false, error: 'event_not_ended' });

  // Idempotent: return existing grant if any
  const existing = await getCELbGrant(uid, eventId);
  if (existing && existing.grant_id) {
    return res.json({ ok: true, grant: _ceGrantResponse(existing) });
  }

  const perc = await getCEPlayerPercentile(uid, eventId);
  if (!perc) return res.json({ ok: false, error: 'no_contribution' });

  const tier = _ceTierForPercentile(evCfg, perc.percentile);
  if (!tier) return res.json({ ok: false, error: 'not_in_top_25' });

  const reward = {
    type: 'lb', tierKey: tier.key,
    reward_pct: tier.reward_pct, diamonds: tier.diamonds, autoTokens: tier.autoTokens,
  };
  const grant = await createOrGetCELbGrant(uid, eventId, tier.key, reward, perc.rank, perc.total);
  res.json({ ok: true, grant: _ceGrantResponse(grant) });
});

// POST /pa/community/lb-ack  { grantId }
// Client calls after applying reward to save and confirming the grant is delivered.
app.post('/pa/community/lb-ack', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  const { grantId } = req.body;
  if (!grantId) return res.status(400).json({ ok: false, error: 'missing_grant_id' });
  await ackCELbGrant(uid, grantId);
  res.json({ ok: true });
});

// ─── Patient Angler Redeem Codes ──────────────────────────────────────────────
// Codes are ONLY here on the server — never sent to the client.
// Add new codes here any time without a new app build.
// rewardType: 'coins' | 'diamonds' | 'autoIncome'
// For 'autoIncome': server marks as used, client computes 1h automation income locally.

const PA_REDEEM_CODES: Record<string, {
  // New flexible reward fields — use any combination
  diamonds?: number;
  blackPearls?: number;
  coins?: number;
  autoIncomePackages?: number;
  bobberCosmetics?: string[];
  treasureMaps?: number;
  treasureMapFragments?: number;
  krakenTest?: string;
  multiUse?: boolean;
  patchArrayAppend?: Record<string, string[]>;
  // Legacy fields — kept for backward compatibility with existing codes
  rewardType?: 'coins' | 'diamonds' | 'autoIncome' | 'blackPearls' | 'save_restore';
  amount?: number;
  bonusDiamonds?: number;
  patch?: Record<string, any>;
  desc: string;
  maxUses?: number;
  targetUid?: string;
  expires?: string;
}> = {
  'REVIEW':         { rewardType: 'autoIncome',                                desc: '1h automation income — thank you for the review!' },
  'LAUNCH':         { rewardType: 'coins',    amount: 500,                     desc: 'Launch celebration gift!' },
  'PEARLS5':        { rewardType: 'diamonds', amount: 5,                       desc: '5 Black Pearls gift!' },
  'THANKS4TESTING': { rewardType: 'diamonds', amount: 10,                      desc: 'Thank you for testing! Enjoy 10 Diamonds.' },
  '300':            { rewardType: 'autoIncome', bonusDiamonds: 10,             desc: '1h automation income + 10 Diamonds. Enjoy!' },
  'CLOUDFIX':       { rewardType: 'autoIncome', amount: 48, bonusDiamonds: 50, expires: '2026-07-23T18:05:00Z', desc: 'Sorry for the cloud save issues — 48h automation income + 50 Diamonds!' },
  'FIVE00':         { rewardType: 'diamonds', amount: 20, desc: 'Feel good gift — 20 Diamonds!' },
  'YAYLAUNCH':      { rewardType: 'diamonds', amount: 25, autoIncomePackages: 3, desc: 'Happy launch! 🎉 25 Diamonds + 3 Automation Income Packages!' },
  '1STEVENT':       { rewardType: 'diamonds', amount: 10, autoIncomePackages: 1, desc: 'First Event gift! 10 Diamonds + 1 Auto Income Pack.' },
  'AUTOSELLGRANT7X': { rewardType: 'save_restore', patch: { autoSellPermanent: true, autoSellEnabled: true }, maxUses: 1, targetUid: 'cpUSLr1VmEYsfhAolmNeuQh2QKx2', desc: 'Permanent Auto Seller unlocked!' },
  'STARTERPK8VQ2':   { rewardType: 'diamonds', amount: 200, maxUses: 1, desc: 'Starter Pack delivered — 200 Diamonds! Sorry for the delay.' },
  'EXPTEST24':       { rewardType: 'diamonds', amount: 24, maxUses: 1, targetUid: 'BdY5lhITlTVHiej376i4Iu6kHEm1', desc: 'Expedition test' },
  'GEM20BDY5K':      { diamonds: 20, maxUses: 1, targetUid: 'BdY5lhITlTVHiej376i4Iu6kHEm1', desc: '20 Diamonds gift!' },
  'YNOT':            { rewardType: 'diamonds', amount: 10, autoIncomePackages: 2, expires: '2026-08-15T23:59:59Z', desc: '10 Diamonds + 2 Auto Income Tokens!' },
  'CLOSE21K':        { diamonds: 10, autoIncomePackages: 2, desc: '10 Diamonds + 2 Auto Income Tokens!' },
  'GEM50SLT9X':      { rewardType: 'diamonds',      amount: 50,                                        maxUses: 1, targetUid: 'bEn4s0MPDQPa6Yr97RQjoFuCStf2', desc: 'Sorry for the trouble — 50 Diamonds gift!' },
  'EILOCK8SLT':      { rewardType: 'save_restore',  patch: { _eiAllTiersUnlocked: true },                                                maxUses: 1, targetUid: 'bEn4s0MPDQPa6Yr97RQjoFuCStf2', desc: 'Event Island tiers unlocked!' },
  'EIFIX2BEN':       { rewardType: 'save_restore',  patch: { _eiAllTiersUnlocked: true },                                                maxUses: 1, targetUid: 'bEn4s0MPDQPa6Yr97RQjoFuCStf2', desc: 'Event Island tiers unlocked!' },
  'BOBBER8BEN':      { rewardType: 'save_restore',  patchArrayAppend: { unlockedBobberCosmetics: ['bc_founders'] },                      maxUses: 1, targetUid: 'bEn4s0MPDQPa6Yr97RQjoFuCStf2', desc: 'Founders bobber unlocked!' },
  'FOUNDERS8BEN':    { diamonds: 55, blackPearls: 55, autoIncomePackages: 7, bobberCosmetics: ['bc_founders'], maxUses: 1, targetUid: 'bEn4s0MPDQPa6Yr97RQjoFuCStf2', desc: 'Founders Event — all tier rewards!' },
  'FOUNDERSBEN2':    { bobberCosmetics: ['bc_founders'], maxUses: 1, targetUid: 'bEn4s0MPDQPa6Yr97RQjoFuCStf2', desc: 'Founders Bobber — event reward!' },
  'MAPS3':           { treasureMaps: 2, desc: '2 Treasure Maps — happy exploring!' },
  'LOSTISLES':       { treasureMapFragments: 20, desc: '20 Treasure Map Fragments — go explore the Lost Isles!' },
  'GEM50Y4KW2':      { diamonds: 50, maxUses: 1, targetUid: '70bYhYFIXebyQvGWmYcQleEKuim2', desc: '50 Diamonds gift!' },
  'GEM48CP9RX':      { diamonds: 48, maxUses: 1, targetUid: 'cpUSLr1VmEYsfhAolmNeuQh2QKx2', desc: '48 Diamonds gift!' },
  'ANGLERS50':       { diamonds: 25, autoIncomePackages: 1, desc: '25 Diamonds + 1 Automation Income Token — thanks for being part of the community!' },
  'FESTIVAL21':      { diamonds: 25, blackPearls: 5, autoIncomePackages: 2, expires: '2026-09-23T23:59:59Z', desc: '25 Diamonds + 2 Auto Income Tokens + 5 Black Pearls — community event is coming!' },
  'KRAKENFIGHT':     { krakenTest: 'fight', multiUse: true, desc: 'Kraken test fight ready — test mode, no rewards.' },
  'CELEBRATE':       { diamonds: 100, autoIncomePackages: 4, expires: '2026-10-01T23:59:59Z', desc: 'Celebration gift! 🎉 100 Diamonds + 4 Auto Income Tokens!' },
};

app.post("/pa/redeem", express.json(), async (req, res) => {
  const { uid, code: rawCode } = req.body;

  if (!uid || typeof uid !== 'string' || uid.length < 4)
    return res.json({ ok: false, error: 'missing_uid' });
  if (!rawCode || typeof rawCode !== 'string')
    return res.json({ ok: false, error: 'missing_code' });

  const code  = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const entry = PA_REDEEM_CODES[code];

  // Message-in-a-Bottle gift codes live in the database, not in PA_REDEEM_CODES.
  // Single use: redeemAciBottleCode() deletes the row, so the code is gone from the server after this.
  if (!entry && ACI_BOTTLE_CODE_RE.test(code)) {
    if (!getDbStatus().available) return res.json({ ok: false, error: 'server_error' });
    const outcome = await redeemAciBottleCode(code);
    if (outcome === 'error')   return res.json({ ok: false, error: 'server_error' });
    if (outcome === 'invalid') return res.json({ ok: false, error: 'invalid_code' });
    console.log(`[ACI bottle] code ${code} redeemed by ${uid}`);
    return res.json({
      ok: true,
      desc: 'Message in a Bottle — 25 Diamonds + 5 Auto Income Tokens + 25 Treasure Map Fragments!',
      reward: { ...ACI_BOTTLE_REWARD },
    });
  }

  if (!entry)
    return res.json({ ok: false, error: 'invalid_code' });
  if (entry.expires && new Date() > new Date(entry.expires))
    return res.json({ ok: false, error: 'expired' });
  // targetUid: code is locked to a specific player — others see invalid_code
  if (entry.targetUid && entry.targetUid !== uid)
    return res.json({ ok: false, error: 'invalid_code' });
  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'server_error' });

  // maxUses: check total redemption count before allowing
  if (entry.maxUses != null) {
    const rows = await query(`SELECT COUNT(*)::INT AS n FROM pa_codes_used WHERE code = $1`, [code]);
    const used = rows?.[0]?.n ?? 0;
    if (used >= entry.maxUses) return res.json({ ok: false, error: 'invalid_code' });
  }

  if (!entry.multiUse) {
    const result = await checkAndRecordPARedeem(uid, code);
    if (result === 'already_redeemed') return res.json({ ok: false, error: 'already_redeemed' });
    if (result === 'error')            return res.json({ ok: false, error: 'server_error' });
  }

  if (entry.rewardType === 'save_restore') {
    // patchArrayAppend: read cloud save, append new items to specified arrays, return only those arrays as patch
    if (entry.patchArrayAppend) {
      const rows = await query('SELECT save_json FROM pa_save_data WHERE uid=$1', [uid]);
      const raw = rows?.[0]?.save_json;
      const saveObj: Record<string, any> = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      const resultPatch: Record<string, any[]> = {};
      for (const [key, items] of Object.entries(entry.patchArrayAppend)) {
        const existing: string[] = Array.isArray(saveObj[key]) ? saveObj[key] : [];
        const merged = [...existing];
        for (const item of items) { if (!merged.includes(item)) merged.push(item); }
        resultPatch[key] = merged;
      }
      return res.json({ ok: true, desc: entry.desc, reward: { rewardType: 'save_restore', save: resultPatch } });
    }
    // If the code entry has a patch, return just the patch fields (client does Object.assign(G, patch)).
    // Also apply any NC fields from the patch directly to the DB save so the next client upload
    // doesn't fail the nc_fraud check (prev[field]=false → next[field]=true without receipt).
    if (entry.patch) {
      const NC_PROMO_FIELDS = new Set(['autoSellPermanent', 'removeAds', 'devSupportOwned', 'devSupportOwned2']);
      const ncPatch = Object.fromEntries(Object.entries(entry.patch).filter(([k]) => NC_PROMO_FIELDS.has(k)));
      if (Object.keys(ncPatch).length > 0) {
        try {
          const ncRows = await query('SELECT save_json FROM pa_save_data WHERE uid=$1', [uid]);
          if (ncRows?.[0]?.save_json) {
            const ncSave = typeof ncRows[0].save_json === 'string' ? JSON.parse(ncRows[0].save_json) : ncRows[0].save_json;
            Object.assign(ncSave, ncPatch);
            await savePASave(uid, JSON.stringify(ncSave));
            console.log(`[PA promo] NC patch applied to DB for ${uid}:`, ncPatch);
          }
        } catch (e) { console.error('[PA promo] NC patch DB update failed:', e); }
      }
      return res.json({ ok: true, desc: entry.desc, reward: { rewardType: 'save_restore', save: entry.patch } });
    }
    const rows = await query('SELECT save_json FROM pa_save_data WHERE uid=$1', [uid]);
    if (!rows || rows.length === 0) return res.json({ ok: false, error: 'no_save_found' });
    const raw = rows[0].save_json;
    const saveObj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.json({ ok: true, desc: entry.desc, reward: { rewardType: 'save_restore', save: saveObj } });
  }

  const reward: Record<string, any> = {};
  if (entry.rewardType) {
    // Legacy mode
    reward.rewardType = entry.rewardType;
    if (entry.amount             != null) reward.amount             = entry.amount;
    if (entry.bonusDiamonds      != null) reward.bonusDiamonds      = entry.bonusDiamonds;
    if (entry.autoIncomePackages != null) reward.autoIncomePackages = entry.autoIncomePackages;
  } else {
    // New flexible mode — any combination of reward fields
    if (entry.diamonds           != null) reward.diamonds           = entry.diamonds;
    if (entry.blackPearls        != null) reward.blackPearls        = entry.blackPearls;
    if (entry.coins              != null) reward.coins              = entry.coins;
    if (entry.autoIncomePackages != null) reward.autoIncomePackages = entry.autoIncomePackages;
    if (entry.bobberCosmetics        != null) reward.bobberCosmetics        = entry.bobberCosmetics;
    if (entry.treasureMaps           != null) reward.treasureMaps           = entry.treasureMaps;
    if (entry.treasureMapFragments   != null) reward.treasureMapFragments   = entry.treasureMapFragments;
    if (entry.krakenTest             != null) reward.krakenTest             = entry.krakenTest;
  }

  res.json({ ok: true, desc: entry.desc, reward });
});

// ─── Patient Angler Referral System ──────────────────────────────────────────

const _REFERRAL_CHARSET   = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const _REFERRAL_REWARD    = 25;
const _REFERRAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const _REFERRAL_MAX_INVITES = 20;

function _genReferralCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++)
    code += _REFERRAL_CHARSET[Math.floor(Math.random() * _REFERRAL_CHARSET.length)];
  return code;
}

async function _ensureReferralCode(uid: string): Promise<string | null> {
  const existing = await query(`SELECT code FROM pa_referral_codes WHERE uid = $1`, [uid]);
  if (existing?.[0]?.code) return existing[0].code;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = _genReferralCode();
    try {
      await query(`INSERT INTO pa_referral_codes (uid, code) VALUES ($1, $2)`, [uid, code]);
      return code;
    } catch (e: any) {
      if (e?.code === '23505') continue; // unique violation — try another code
      throw e;
    }
  }
  return null;
}

// GET /pa/referral — returns the player's referral code and usage stats
app.get('/pa/referral', verifyPAToken, async (req, res) => {
  const uid = res.locals.paUid as string;
  if (!getDbStatus().available) return res.json({ ok: false, error: 'server_error' });

  const code = await _ensureReferralCode(uid).catch(() => null);
  if (!code) return res.json({ ok: false, error: 'server_error' });

  const [usedRow, countRow, fbUser] = await Promise.all([
    query(`SELECT referrer_uid, code AS used_code, used_at FROM pa_referral_uses WHERE uid = $1`, [uid]),
    query(`SELECT COUNT(*)::INT AS n FROM pa_referral_uses WHERE referrer_uid = $1`, [uid]),
    _paFirebaseAuth?.getUser(uid).catch(() => null),
  ]);

  const accountCreatedAt = fbUser?.metadata?.creationTime
    ? new Date(fbUser.metadata.creationTime).getTime()
    : null;

  res.json({
    ok: true,
    code,
    usedCode:      usedRow?.[0]?.used_code    || null,
    referrerUid:   usedRow?.[0]?.referrer_uid || null,
    usedAt:        usedRow?.[0]?.used_at       || null,
    referralCount: countRow?.[0]?.n            ?? 0,
    accountCreatedAt,
  });
});

// POST /pa/referral/use — validate and grant referral reward
app.post('/pa/referral/use', verifyPAToken, express.json(), async (req, res) => {
  const uid = res.locals.paUid as string;
  const { referralCode: rawCode } = req.body;

  if (!rawCode || typeof rawCode !== 'string')
    return res.json({ ok: false, error: 'invalid_code' });

  const referralCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (referralCode.length !== 6)
    return res.json({ ok: false, error: 'invalid_code' });

  if (!getDbStatus().available)
    return res.json({ ok: false, error: 'server_error' });

  // Find referrer
  const codeRows = await query(`SELECT uid FROM pa_referral_codes WHERE code = $1`, [referralCode]);
  if (!codeRows?.length)
    return res.json({ ok: false, error: 'invalid_code' });

  const referrerUid = codeRows[0].uid as string;

  if (referrerUid === uid)
    return res.json({ ok: false, error: 'own_code' });

  // Verify account age server-side via Firebase
  if (!_paFirebaseAuth)
    return res.json({ ok: false, error: 'server_error' });

  let fbUser: firebaseAdmin.auth.UserRecord;
  try { fbUser = await _paFirebaseAuth.getUser(uid); }
  catch { return res.json({ ok: false, error: 'server_error' }); }

  const createdAt   = new Date(fbUser.metadata.creationTime).getTime();
  const accountAgeMs = Date.now() - createdAt;
  if (accountAgeMs > _REFERRAL_MAX_AGE_MS)
    return res.json({ ok: false, error: 'too_old' });

  // Check current player hasn't already used a code
  const usedRows = await query(`SELECT uid FROM pa_referral_uses WHERE uid = $1`, [uid]);
  if (usedRows?.length)
    return res.json({ ok: false, error: 'already_used' });

  // Check referrer hasn't hit invite limit
  const countRows = await query(`SELECT COUNT(*)::INT AS n FROM pa_referral_uses WHERE referrer_uid = $1`, [referrerUid]);
  if ((countRows?.[0]?.n ?? 0) >= _REFERRAL_MAX_INVITES)
    return res.json({ ok: false, error: 'referrer_full' });

  // Atomic insert — ON CONFLICT prevents double-claiming from race conditions
  const insertResult = await query(
    `INSERT INTO pa_referral_uses (uid, referrer_uid, code) VALUES ($1, $2, $3)
     ON CONFLICT (uid) DO NOTHING RETURNING uid`,
    [uid, referrerUid, referralCode]
  );
  if (!insertResult?.length)
    return res.json({ ok: false, error: 'already_used' });

  // Grant diamonds to the new player (response already carries reward; server save is backup)
  const _grantNewPlayerDiamonds = async () => {
    try {
      const saveRow = await loadPASave(uid);
      if (saveRow) {
        const save: Record<string, any> = JSON.parse(saveRow.saveJson);
        save.diamonds = (save.diamonds || 0) + _REFERRAL_REWARD;
        await savePASave(uid, JSON.stringify(save));
      }
      await addTrustedDiamonds(uid, _REFERRAL_REWARD);
    } catch (e) {
      console.error(`[Referral] new-player diamond grant failed for ${uid}:`, e);
    }
  };

  // Grant diamonds to the referrer via corrections so their local game receives it
  // on the next cloud load (local save is authoritative and would otherwise overwrite the server save).
  const _grantReferrerDiamonds = async () => {
    try {
      const existing = await peekPACorrections(referrerUid);
      const prev = (existing?.corrections || {}) as Record<string, any>;
      const prevAdd = typeof prev._addDiamonds === 'number' ? prev._addDiamonds : 0;
      await setPACorrections(referrerUid, { ...prev, _addDiamonds: prevAdd + _REFERRAL_REWARD });
      await addTrustedDiamonds(referrerUid, _REFERRAL_REWARD);
    } catch (e) {
      console.error(`[Referral] referrer diamond grant failed for ${referrerUid}:`, e);
    }
  };

  await Promise.all([_grantNewPlayerDiamonds(), _grantReferrerDiamonds()]);

  console.log(`[Referral] ${uid} used code ${referralCode} (referrer: ${referrerUid}) — +${_REFERRAL_REWARD} each`);
  res.json({ ok: true, reward: _REFERRAL_REWARD, message: `+${_REFERRAL_REWARD} Diamonds! Referral successful.` });
});

// AdMob app-ads.txt verification
app.get("/app-ads.txt", (_req, res) => {
  res.type("text/plain").send("google.com, pub-1687381057809117, DIRECT, f08c47fec0942fa0\n");
});

// ─── Patient Angler Analytics ─────────────────────────────────────────────────
import {
  adminMiddleware       as paAdminMiddleware,
  adminBrowserMiddleware as paAdminBrowserMiddleware,
  serveAdminLogin,
  handleAdminLogin,
  handleAdminLogout,
  handleAnalyticsProgress,
  handleAdminSummary,
  handleAdminPlayers,
  handleAdminPlayerDetail,
  handleAdminFunnel,
  handleAdminZones,
  handleAdminVersions,
  handleAdminCohorts,
  handleAdminDataQuality,
  handleAdminExportCsv,
  handleAdminExportMilestonesCsv,
  serveAdminDashboard,
  createAnalyticsTables,
} from './paAnalytics';

const _urlForm = express.urlencoded({ extended: false, limit: '4kb' });

// Player-facing analytics endpoint (no admin auth — just uid validation inside handler)
app.post('/pa/analytics/progress', express.json({ limit: '64kb' }), handleAnalyticsProgress);

// ── Patient Angler IAP ────────────────────────────────────────────────────────

const PA_PACKAGE_NAME = "com.henlygames.patientangler";

// Server-authoritative PA product catalog — must match iap.js DIAMOND_PACK_MAP exactly.
const PA_PRODUCT_CATALOG: Record<string, { type: 'consumable' | 'non_consumable'; diamonds?: number; grant: Record<string, any> }> = {
  starter:               { type: 'consumable',     diamonds: 200,  grant: { diamonds: 200  } },
  pouch:                 { type: 'consumable',     diamonds: 400,  grant: { diamonds: 400  } },
  chest:                 { type: 'consumable',     diamonds: 1100, grant: { diamonds: 1100 } },
  vault:                 { type: 'consumable',     diamonds: 2500, grant: { diamonds: 2500 } },
  remove_ads:            { type: 'non_consumable',              grant: { removeAds: true } },
  permanent_autoseller:  { type: 'non_consumable',              grant: { permanentAutoSell: true } },
  dev_support_package:   { type: 'non_consumable',              grant: { devSupport: true } },
  dev_support_package_2: { type: 'non_consumable',              grant: { devSupport2: true } },
  dev_support_mini:      { type: 'consumable',                  grant: { devSupportMini: 2 } },
  dev_support_mini_2:    { type: 'consumable',                  grant: { devSupportMini2: 2 } },
  prestige_pack:         { type: 'consumable',     diamonds: 100, grant: { diamonds: 100 } },
  'ei_event_reward':     { type: 'consumable',                  grant: { eiAllTiersUnlocked: true } },
  time_skip_12:          { type: 'consumable',                  grant: { autoIncomePackages: 12 } },
  time_skip_24:          { type: 'consumable',                  grant: { autoIncomePackages: 24 } },
  cash_bobber:           { type: 'non_consumable',              grant: { cashBobber: true } },
};

async function verifyWithGooglePlayPA(productId: string, purchaseToken: string): Promise<boolean> {
  const keyJson = process.env.GOOGLE_PLAY_KEY_JSON;
  if (!keyJson) {
    console.error('[PA-IAP] Rejected — GOOGLE_PLAY_KEY_JSON not configured.');
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
      packageName: PA_PACKAGE_NAME,
      productId,
      token: purchaseToken,
    });
    const state = res.data.purchaseState;
    if (state !== 0) {
      console.warn(`[PA-IAP] Google Play rejected token — purchaseState=${state}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('[PA-IAP] Google Play API error:', err?.message || err);
    return false;
  }
}

// POST /pa/iap/verify  { productId, purchaseToken, orderId? }
// Verifies purchase with Google Play, records token (idempotent), returns grant payload.
// Client applies the grant only after receiving { ok: true }.
// uid is taken from the verified Firebase token — never trusted from body.
app.post("/pa/iap/verify", verifyPAToken, express.json(), async (req, res) => {
  const uid = res.locals.paUid as string;
  const { productId, purchaseToken, orderId = '' } = req.body;

  if (!productId || typeof productId !== 'string')
    return res.json({ ok: false, error: 'invalid_product' });
  if (!purchaseToken || typeof purchaseToken !== 'string' || purchaseToken.length < 10)
    return res.json({ ok: false, error: 'invalid_token' });

  const product = PA_PRODUCT_CATALOG[productId];
  if (!product) return res.json({ ok: false, error: 'unknown_product' });

  // Idempotent: return the original grant on duplicate token
  const existing = await getPAPurchaseReceipt(purchaseToken);
  if (existing !== null) {
    try {
      const grant = JSON.parse(existing);
      return res.json({ ok: true, grant, already_processed: true });
    } catch {
      return res.json({ ok: false, error: 'already_processed' });
    }
  }

  // Verify with Google Play Developer API
  const valid = await verifyWithGooglePlayPA(productId, purchaseToken);
  if (!valid) return res.json({ ok: false, error: 'google_play_rejected' });

  const grantedJson = JSON.stringify(product.grant);

  // Record in DB — UNIQUE on purchase_token is the double-delivery guard
  if (getDbStatus().available) {
    const result = await recordPAPurchaseReceipt(uid, productId, purchaseToken, String(orderId), grantedJson);
    if (result === 'error') return res.json({ ok: false, error: 'db_error' });
    if (result === 'already_processed') {
      return res.json({ ok: true, grant: product.grant, already_processed: true });
    }
  }

  console.log(`[PA-IAP] ✅ ${productId} verified for ${uid}`);
  res.json({ ok: true, grant: product.grant });
});

// ─── PA Voided Purchases — hourly poll & grant reversal ──────────────────────
// Polls Google Play Voided Purchases API once per hour and reverses any grants
// for refunded / charged-back purchases. Starts 48 h back on cold boot so
// refunds that occurred during downtime are not missed.

let _paVoidedLastCheckMs = Date.now() - 48 * 60 * 60 * 1000;

function _reverseGrant(save: any, grant: any): { modified: boolean; desc: string } {
  const parts: string[] = [];
  if (grant.diamonds && typeof grant.diamonds === 'number') {
    const before = save.diamonds || 0;
    save.diamonds = Math.max(0, before - grant.diamonds);
    parts.push(`diamonds ${before}→${save.diamonds}`);
  }
  if (grant.devSupport) {
    save.devSupportOwned = false;
    parts.push('revoked devSupportOwned');
  }
  if (grant.devSupport2) {
    save.devSupportOwned2 = false;
    parts.push('revoked devSupportOwned2');
  }
  if (grant.devSupportMini) {
    const before = Math.max(0, Math.floor(Number(save.devSupportMiniCount) || 0));
    save.devSupportMiniCount = Math.max(0, before - Math.max(0, Math.floor(Number(grant.devSupportMini) || 0)));
    parts.push(`devSupportMiniCount ${before}→${save.devSupportMiniCount}`);
  }
  if (grant.devSupportMini2) {
    const before = Math.max(0, Math.floor(Number(save.devSupportMini2Count) || 0));
    save.devSupportMini2Count = Math.max(0, before - Math.max(0, Math.floor(Number(grant.devSupportMini2) || 0)));
    parts.push(`devSupportMini2Count ${before}→${save.devSupportMini2Count}`);
  }
  if (grant.cashBobber) {
    if (Array.isArray(save.unlockedBobberCosmetics)) {
      save.unlockedBobberCosmetics = save.unlockedBobberCosmetics.filter((b: string) => b !== 'bc_cash');
      if (save.equippedBobberCosmetic === 'bc_cash') save.equippedBobberCosmetic = 'bc_basic';
    }
    parts.push('revoked bc_cash bobber');
  }
  // autoIncomePackages and one-time event items are consumed on grant — not reversible
  return { modified: parts.length > 0, desc: parts.join(', ') || 'nothing reversible' };
}

async function pollPAVoidedPurchases(): Promise<void> {
  const keyJson = process.env.GOOGLE_PLAY_KEY_JSON;
  if (!keyJson) return;
  if (!getDbStatus().available) return;

  const startMs = _paVoidedLastCheckMs;
  const nowMs   = Date.now();

  try {
    const credentials = JSON.parse(keyJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const publisher = google.androidpublisher({ version: 'v3', auth });

    let pageToken: string | undefined;
    let totalReversed = 0;

    do {
      const res = await publisher.purchases.voidedpurchases.list({
        packageName: PA_PACKAGE_NAME,
        startTime:   startMs.toString(),
        maxResults:  1000,
        ...(pageToken ? { token: pageToken } : {}),
      } as any);

      const voidedList: any[] = (res.data as any).voidedPurchases || [];
      pageToken = (res.data as any).tokenPagination?.nextPageToken ?? undefined;

      for (const vp of voidedList) {
        const token: string | undefined = vp.purchaseToken;
        if (!token) continue;

        if (await isPAVoidedPurchaseProcessed(token)) continue;

        const receipt = await getPAPurchaseReceiptFull(token);
        if (!receipt) {
          // Not a PA purchase or not in our DB — mark processed so we don't revisit
          await recordPAVoidedPurchase(token, '', '', new Date(Number(vp.voidedTimeMillis)));
          continue;
        }

        const { playerId, productId, grantedJson } = receipt;
        const voidedAt = new Date(Number(vp.voidedTimeMillis));

        let grant: any;
        try { grant = JSON.parse(grantedJson); } catch { grant = {}; }

        const saveRow = await loadPASave(playerId);
        if (!saveRow) {
          console.warn(`[PA-Voided] No save for uid=${playerId}, product=${productId} — marking processed`);
          await recordPAVoidedPurchase(token, playerId, productId, voidedAt);
          continue;
        }

        let save: any;
        try { save = JSON.parse(saveRow.saveJson); } catch { save = {}; }

        const { modified, desc } = _reverseGrant(save, grant);
        if (modified) {
          await savePASave(playerId, JSON.stringify(save));
          console.log(`[PA-Voided] ✅ Reversed ${productId} for uid=${playerId}: ${desc}`);
          totalReversed++;
        } else {
          console.log(`[PA-Voided] ℹ️  ${productId} for uid=${playerId}: ${desc} — no save change needed`);
        }

        await recordPAVoidedPurchase(token, playerId, productId, voidedAt);
      }
    } while (pageToken);

    _paVoidedLastCheckMs = nowMs;
    if (totalReversed > 0) console.log(`[PA-Voided] Poll done — ${totalReversed} grant(s) reversed`);

  } catch (err: any) {
    console.error('[PA-Voided] Poll error:', err?.message || err);
  }
}

// Run 30 s after startup (DB needs time to init), then every hour
setTimeout(() => pollPAVoidedPurchases().catch(e => console.error('[PA-Voided]', e)), 30_000);
setInterval(() => pollPAVoidedPurchases().catch(e => console.error('[PA-Voided]', e)), 60 * 60 * 1000);

// Admin login / logout (no session required)
app.get ('/admin/login',  serveAdminLogin);
app.post('/admin/login',  _urlForm, handleAdminLogin);
app.post('/admin/logout', handleAdminLogout);

// Admin dashboard UI — browser route: redirects to /admin/login if not authed
app.get('/admin/analytics',                       paAdminBrowserMiddleware, serveAdminDashboard);

// Admin API routes — API route: returns JSON 401 if not authed
app.get('/admin/analytics/api/summary',           paAdminMiddleware, handleAdminSummary);
app.get('/admin/analytics/api/players',           paAdminMiddleware, handleAdminPlayers);
app.get('/admin/analytics/api/player/:playerId',  paAdminMiddleware, handleAdminPlayerDetail);

// One-time recovery: look up a player by email, show analytics + current save
app.get('/admin/pa/recover-by-email', paAdminMiddleware, async (req, res) => {
  const email = req.query.email as string;
  if (!email) { res.status(400).json({ error: 'missing email' }); return; }
  try {
    const fbUser = await firebaseAdmin.auth().getUserByEmail(email);
    const uid = fbUser.uid;
    const [analyticsRows, saveRows] = await Promise.all([
      query('SELECT * FROM pa_player_progress WHERE player_id=$1', [uid]),
      query('SELECT save_json, updated_at FROM pa_save_data WHERE uid=$1', [uid]),
    ]);
    const milestones = await query('SELECT milestone_key, reached_at FROM pa_player_milestones WHERE player_id=$1 ORDER BY reached_at', [uid]);
    res.json({
      uid,
      email: fbUser.email,
      displayName: fbUser.displayName,
      analytics: analyticsRows?.[0] || null,
      currentSave: saveRows?.[0] ? { updatedAt: saveRows[0].updated_at, save: JSON.parse(saveRows[0].save_json) } : null,
      milestones: milestones || [],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /admin/pa/player/:uid — view player save + IAP purchases by UID
app.get('/admin/pa/player/:uid', paAdminMiddleware, async (req, res) => {
  const { uid } = req.params;
  if (!uid) { res.status(400).json({ error: 'missing uid' }); return; }
  try {
    const [saveRows, purchaseRows] = await Promise.all([
      query('SELECT save_json, updated_at FROM pa_save_data WHERE uid=$1', [uid]),
      query('SELECT product_id, order_id, granted_json, purchased_at FROM pa_purchase_receipts WHERE player_id=$1 ORDER BY purchased_at DESC', [uid]),
    ]);
    let fbUser: any = null;
    try { fbUser = await firebaseAdmin.auth().getUser(uid); } catch {}
    res.json({
      uid,
      email: fbUser?.email || null,
      displayName: fbUser?.displayName || null,
      currentSave: saveRows?.[0] ? { updatedAt: saveRows[0].updated_at, save: JSON.parse(saveRows[0].save_json) } : null,
      purchases: purchaseRows || [],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/pa/grant-ei-reward — manually set _eiAllTiersUnlocked on a player's save
app.post('/admin/pa/grant-ei-reward', paAdminMiddleware, express.json(), async (req, res) => {
  const { uid } = req.body;
  if (!uid) { res.status(400).json({ error: 'missing uid' }); return; }
  try {
    const rows = await query('SELECT save_json FROM pa_save_data WHERE uid=$1', [uid]);
    if (!rows?.[0]) { res.status(404).json({ error: 'save not found' }); return; }
    const save = JSON.parse(rows[0].save_json);
    if (save._eiAllTiersUnlocked) { res.json({ ok: true, note: 'already set' }); return; }
    save._eiAllTiersUnlocked = true;
    const ok = await savePASave(uid, JSON.stringify(save));
    res.json({ ok, note: '_eiAllTiersUnlocked patched' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/pa/patch-nc-fields — sets NC (non-consumable) fields in a player's DB save to true.
// Used to fix saves blocked by nc_fraud when the field was legitimately granted via promo code.
// Only allows setting NC fields to true; never removes/downgrades.
app.post('/admin/pa/patch-nc-fields', requireAdmin, express.json(), async (req, res) => {
  const { uid, patch } = req.body;
  if (!uid || !patch || typeof patch !== 'object') {
    res.status(400).json({ error: 'missing uid or patch' }); return;
  }
  const NC_ALLOWED = new Set(['autoSellPermanent', 'autoSellEnabled', 'removeAds', 'devSupportOwned', 'devSupportOwned2']);
  const safePatch: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (NC_ALLOWED.has(k) && v === true) safePatch[k] = true;
  }
  if (!Object.keys(safePatch).length) { res.status(400).json({ error: 'no valid NC fields in patch' }); return; }
  try {
    const rows = await query('SELECT save_json FROM pa_save_data WHERE uid=$1', [uid]);
    if (!rows?.[0]) { res.status(404).json({ error: 'save not found' }); return; }
    const save = typeof rows[0].save_json === 'string' ? JSON.parse(rows[0].save_json) : rows[0].save_json;
    const before: Record<string, any> = {};
    for (const k of Object.keys(safePatch)) before[k] = save[k];
    Object.assign(save, safePatch);
    const ok = await savePASave(uid, JSON.stringify(save));
    console.log(`[PA Admin] patch-nc-fields: uid=${uid} patch=${JSON.stringify(safePatch)}`);
    res.json({ ok, uid, patched: safePatch, before });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /admin/pa/grant-bobber — appends a bobber cosmetic id to a player's unlockedBobberCosmetics.
// Idempotent: does nothing if the player already has the bobber.
app.post('/admin/pa/grant-bobber', requireAdmin, express.json(), async (req, res) => {
  const { uid, bobberId } = req.body;
  if (!uid || !bobberId || typeof bobberId !== 'string') {
    res.status(400).json({ error: 'missing uid or bobberId' }); return;
  }
  try {
    const rows = await query('SELECT save_json FROM pa_save_data WHERE uid=$1', [uid]);
    if (!rows?.[0]) { res.status(404).json({ error: 'save not found' }); return; }
    const save = typeof rows[0].save_json === 'string' ? JSON.parse(rows[0].save_json) : rows[0].save_json;
    const cosmetics: string[] = Array.isArray(save.unlockedBobberCosmetics) ? save.unlockedBobberCosmetics : ['bc_basic'];
    if (cosmetics.includes(bobberId)) {
      res.json({ ok: true, uid, note: 'already_has_bobber', bobberId }); return;
    }
    cosmetics.push(bobberId);
    save.unlockedBobberCosmetics = cosmetics;
    const ok = await savePASave(uid, JSON.stringify(save));
    console.log(`[PA Admin] grant-bobber: uid=${uid} bobberId=${bobberId}`);
    res.json({ ok, uid, bobberId, totalCosmetics: cosmetics.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /admin/pa/export-saves — full export of all PA saves as JSON (for external backup)
app.get('/admin/pa/export-saves', requireAdmin, async (_req, res) => {
  if (!getDbStatus().available) return res.status(503).json({ error: 'db_unavailable' });
  const saves = await exportAllPASaves();
  if (!saves) return res.status(500).json({ error: 'export_failed' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="pa-saves-${ts}.json"`);
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), count: saves.length, saves }, null, 2));
});

// Manual save restore for a specific uid (admin only)
app.post('/admin/pa/restore-save', paAdminMiddleware, express.json({ limit: '500kb' }), async (req, res) => {
  const { uid, save } = req.body;
  if (!uid || !save) { res.status(400).json({ error: 'missing uid or save' }); return; }
  const ok = await savePASave(uid, JSON.stringify(save));
  res.json({ ok });
});

// Admin: set a one-time field correction for a player (applied on next cloud save load, then deleted).
// Body: { corrections: { fieldName: value, ... } }
app.post('/admin/pa/corrections/:uid', paAdminMiddleware, express.json(), async (req, res) => {
  const { uid } = req.params;
  const { corrections } = req.body;
  if (!corrections || typeof corrections !== 'object' || Array.isArray(corrections))
    return res.status(400).json({ ok: false, error: 'corrections must be a non-array object' });
  const ok = await setPACorrections(uid, corrections);
  res.json({ ok, uid, corrections });
});

// Admin: view pending corrections for a player (without consuming them).
app.get('/admin/pa/corrections/:uid', paAdminMiddleware, async (req, res) => {
  const { uid } = req.params;
  const row = await peekPACorrections(uid);
  if (!row) return res.json({ ok: true, pending: false });
  res.json({ ok: true, pending: true, corrections: row.corrections, createdAt: row.createdAt });
});

// Find all saves that contain a specific bobber cosmetic id (for player recovery by unique cosmetic)
// View last 3 save snapshots for a player (for manual recovery)
app.get('/admin/pa/save-history/:uid', paAdminMiddleware, async (req, res) => {
  const { uid } = req.params;
  const history = await loadPASaveHistory(uid);
  const summary = history.map(h => {
    try {
      const s = JSON.parse(h.saveJson);
      return {
        savedAt: h.savedAt,
        coins: s.coins,
        zone: s.currentZone,
        recHighestZone: s.stats?.recHighestZone,
        lifeCoinsEarned: s.stats?.lifeCoinsEarned,
        ownedRods: s.ownedRods,
        automationCount: (s.ownedAutomation || []).length,
        bobbers: s.unlockedBobberCosmetics,
      };
    } catch { return { savedAt: h.savedAt, parseError: true }; }
  });
  res.json({ uid, count: history.length, history: summary });
});

// POST /admin/pa/grant-diamonds  { uid, diamonds, reason }
// Manually adds diamonds to a player's save (for support cases where purchase
// was charged by Google Play but server verify failed due to network error).
app.post('/admin/pa/grant-diamonds', paAdminMiddleware, express.json(), async (req, res) => {
  const { uid, diamonds, reason = '' } = req.body;
  if (!uid || typeof uid !== 'string') { res.status(400).json({ error: 'missing uid' }); return; }
  const amount = parseInt(diamonds, 10);
  if (!amount || amount < 1 || amount > 100000) { res.status(400).json({ error: 'invalid diamonds (1–100000)' }); return; }

  const existing = await loadPASave(uid);
  if (!existing) { res.status(404).json({ error: 'player not found' }); return; }

  let save: any;
  try { save = JSON.parse(existing.saveJson); } catch { res.status(500).json({ error: 'save parse error' }); return; }

  const before = save.diamonds || 0;
  save.diamonds = before + amount;
  save._savedAt = Date.now();

  const ok = await savePASave(uid, JSON.stringify(save));
  if (!ok) { res.status(500).json({ error: 'db write failed' }); return; }

  console.log(`[PA Admin] grant-diamonds: +${amount} to ${uid} (${before}→${save.diamonds}) reason="${reason}"`);
  res.json({ ok: true, uid, before, after: save.diamonds, granted: amount });
});

// POST /admin/pa/grant-remove-ads  { uid }
// Manually activates remove-ads on a player's save (for support cases).
app.post('/admin/pa/grant-remove-ads', paAdminMiddleware, express.json(), async (req, res) => {
  const { uid } = req.body;
  if (!uid || typeof uid !== 'string') { res.status(400).json({ error: 'missing uid' }); return; }

  const existing = await loadPASave(uid);
  if (!existing) { res.status(404).json({ error: 'player not found' }); return; }

  let save: any;
  try { save = JSON.parse(existing.saveJson); } catch { res.status(500).json({ error: 'save parse error' }); return; }

  const before = !!save.removeAds;
  save.removeAds = true;
  save._savedAt = Date.now();

  const ok = await savePASave(uid, JSON.stringify(save));
  if (!ok) { res.status(500).json({ error: 'db write failed' }); return; }

  console.log(`[PA Admin] grant-remove-ads: ${uid} (${before}→true)`);
  res.json({ ok: true, uid, before, after: true });
});

// GET /admin/pa/code-status?codes=KW9F4T2M,KW3R8X5N
app.get('/admin/pa/code-status', paAdminMiddleware, async (req, res) => {
  const codes = ((req.query.codes as string) || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (!codes.length) { res.status(400).json({ error: 'missing codes param' }); return; }
  const rows = await query(
    `SELECT code, uid, redeemed_at FROM pa_codes_used WHERE code = ANY($1) ORDER BY redeemed_at`,
    [codes]
  );
  const used = new Set((rows || []).map((r: any) => r.code));
  const result = codes.map(code => ({
    code,
    used: used.has(code),
    ...(rows || []).find((r: any) => r.code === code) || {},
  }));
  res.json({ result });
});

// GET /admin/pa/db-schema?table=... — check column names for a table (bypasses dbAvailable)
app.get('/admin/pa/db-schema', paAdminMiddleware, async (req, res) => {
  const tableName = (req.query.table as string || 'pa_purchase_receipts').replace(/[^a-z_]/g, '');
  const url = process.env.DATABASE_URL;
  if (!url) { res.json({ error: 'no DATABASE_URL' }); return; }
  const { Pool: PgPool } = await import('pg');
  const tmpPool = new PgPool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const result = await tmpPool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [tableName]
    );
    res.json({ table: tableName, columns: result.rows });
  } catch (e: any) {
    res.json({ error: e.message });
  } finally {
    await tmpPool.end().catch(() => {});
  }
});

// GET /admin/pa/find-by-token?token=... — look up player by Google Play purchase token
app.get('/admin/pa/find-by-token', paAdminMiddleware, async (req, res) => {
  const token = (req.query.token as string || '').trim();
  if (!token) { res.status(400).json({ error: 'missing token' }); return; }
  const rows = await query(
    `SELECT player_id, product_id, purchased_at FROM pa_purchase_receipts WHERE purchase_token = $1`,
    [token]
  );
  res.json({ rows: rows || [] });
});


app.get('/admin/pa/find-by-bobber', paAdminMiddleware, async (req, res) => {
  const bobberId = (req.query.id as string) || 'bc_worm';
  const rows = await query(
    `SELECT uid, updated_at,
            (save_json::jsonb->>'coins')::bigint AS coins,
            save_json::jsonb->'unlockedBobberCosmetics' AS bobbers,
            save_json::jsonb->>'equippedBobberCosmetic' AS equipped,
            save_json::jsonb->>'currentZone' AS zone,
            (save_json::jsonb->>'_savedAt')::bigint AS saved_at
     FROM pa_save_data
     WHERE save_json::jsonb->'unlockedBobberCosmetics' ? $1
     ORDER BY updated_at DESC`,
    [bobberId]
  );
  res.json({ count: rows?.length ?? 0, rows: rows ?? [] });
});
app.get('/admin/analytics/api/funnel',            paAdminMiddleware, handleAdminFunnel);
app.get('/admin/analytics/api/zones',             paAdminMiddleware, handleAdminZones);
app.get('/admin/analytics/api/versions',          paAdminMiddleware, handleAdminVersions);
app.get('/admin/analytics/api/cohorts',           paAdminMiddleware, handleAdminCohorts);
app.get('/admin/analytics/api/quality',           paAdminMiddleware, handleAdminDataQuality);
app.get('/admin/analytics/export.csv',            paAdminMiddleware, handleAdminExportCsv);
app.get('/admin/analytics/milestones.csv',        paAdminMiddleware, handleAdminExportMilestonesCsv);

// ─────────────────────────────────────────────────────────────────────────────

initDb().then(async () => {
  await createAnalyticsTables();
  gameServer.listen(port).then(() => {
    console.log(`🔥 Tile Royale [${region}] running on port ${port}`);
    console.log(`📊 Monitor: http://localhost:${port}/colyseus`);
  });
});
