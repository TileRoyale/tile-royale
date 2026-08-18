// ─────────────────────────────────────────────────────────────────────────────
// Patient Angler Analytics — private developer dashboard
// Never exposed to players. All routes require PA_ADMIN_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

import { query, getDbStatus } from './db';
import * as firebaseAdmin from 'firebase-admin';
import { Request, Response } from 'express';
import crypto from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────
const STATS_VERSION = 1;
const ADMIN_SECRET  = process.env.PA_ADMIN_SECRET || '';
const MAX_PAYLOAD   = 32_768; // 32 KB safety limit
const _IS_PROD      = !!(process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production');

if (!ADMIN_SECRET) console.warn('[PA Admin] PA_ADMIN_SECRET not set — admin login disabled');

// ─── Rate Limiter (analytics uploads) ────────────────────────────────────────
const _rl = new Map<string, number>();
function _rateLimit(key: string, windowMs = 15_000): boolean {
  const now = Date.now();
  const last = _rl.get(key) || 0;
  if (now - last < windowMs) return true;
  _rl.set(key, now);
  if (_rl.size > 20_000) { for (const [k,t] of _rl) { if (now - t > 300_000) _rl.delete(k); } }
  return false;
}

// ─── Login Brute-Force Protection ─────────────────────────────────────────────
interface _LoginEntry { count: number; resetAt: number }
const _loginFailures = new Map<string, _LoginEntry>();
const _LOGIN_MAX     = 5;
const _LOGIN_WINDOW  = 15 * 60 * 1000;

function _clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return (Array.isArray(xff) ? xff[0] : xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function _isLoginLocked(ip: string): boolean {
  const e = _loginFailures.get(ip);
  if (!e) return false;
  if (Date.now() > e.resetAt) { _loginFailures.delete(ip); return false; }
  return e.count >= _LOGIN_MAX;
}

function _recordLoginFail(ip: string): void {
  const now = Date.now();
  const e   = _loginFailures.get(ip);
  if (!e || now > e.resetAt) _loginFailures.set(ip, { count: 1, resetAt: now + _LOGIN_WINDOW });
  else e.count++;
  if (_loginFailures.size > 5000) { for (const [k,v] of _loginFailures) { if (Date.now() > v.resetAt) _loginFailures.delete(k); } }
}

// ─── Admin Session Management ─────────────────────────────────────────────────
const _adminSessions = new Map<string, number>();

function _parseCookie(req: Request, name: string): string | null {
  const header = (req.headers['cookie'] as string) || '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function _makeAdminSession(res: Response): void {
  const now    = Date.now();
  if (_adminSessions.size > 1000) { for (const [t, exp] of _adminSessions) { if (exp < now) _adminSessions.delete(t); } }
  const token  = crypto.randomBytes(32).toString('hex');
  _adminSessions.set(token, now + 3_600_000);
  const secure = _IS_PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `pa_admin=${token}; HttpOnly; Path=/${secure}; SameSite=Lax; Max-Age=3600`);
}

function _invalidateAdminSession(req: Request, res: Response): void {
  const token = _parseCookie(req, 'pa_admin');
  if (token) _adminSessions.delete(token);
  const secure = _IS_PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `pa_admin=; HttpOnly; Path=/${secure}; SameSite=Lax; Max-Age=0`);
}

function _validAdminSession(req: Request): boolean {
  const token = _parseCookie(req, 'pa_admin');
  if (!token) return false;
  const exp = _adminSessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { _adminSessions.delete(token); return false; }
  return true;
}

function _timingSafeCompare(provided: string): boolean {
  if (!ADMIN_SECRET || !provided) return false;
  const expected = Buffer.from(ADMIN_SECRET);
  const actual   = Buffer.alloc(expected.length);
  Buffer.from(provided).copy(actual, 0, 0, expected.length);
  return crypto.timingSafeEqual(expected, actual) && provided.length === ADMIN_SECRET.length;
}

// ─── Login Page HTML ──────────────────────────────────────────────────────────
function _loginPageHtml(errorMsg?: string): string {
  const err = errorMsg
    ? `<div class="error">${errorMsg}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patient Angler Analytics — Admin Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f4f5f7;--card:#fff;--bd:#d0d7de;--tx:#1a1a2e;--sub:#6e7781;--btn:#1f6feb;--bt:#fff;--ib:#fff;--ibd:#d0d7de;--eb:#fff0f0;--ec:#cf222e;--ebd:#fca5a5}
@media(prefers-color-scheme:dark){:root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--tx:#e6edf3;--sub:#8b949e;--btn:#1f6feb;--bt:#fff;--ib:#21262d;--ibd:#30363d;--eb:#2d0f0f;--ec:#f85149;--ebd:#6e2020}}
body{background:var(--bg);color:var(--tx);font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:32px;width:100%;max-width:360px}
h1{font-size:17px;font-weight:700;margin-bottom:4px}
.sub{font-size:12px;color:var(--sub);margin-bottom:24px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}
input{display:block;width:100%;background:var(--ib);border:1px solid var(--ibd);color:var(--tx);padding:8px 12px;border-radius:6px;font-size:14px;outline:none}
input:focus{border-color:var(--btn)}
button{display:block;width:100%;background:var(--btn);color:var(--bt);border:none;padding:9px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;margin-top:16px}
button:hover{opacity:.88}
.error{background:var(--eb);border:1px solid var(--ebd);color:var(--ec);border-radius:6px;padding:10px 14px;font-size:13px;margin-bottom:20px}
</style>
</head>
<body>
<div class="card">
  <h1>Patient Angler Analytics</h1>
  <div class="sub">Admin Access</div>
  ${err}
  <form method="POST" action="/admin/login">
    <label for="secret">Admin Secret</label>
    <input type="password" id="secret" name="secret" autocomplete="current-password" required autofocus>
    <button type="submit">Log In</button>
  </form>
</div>
</body>
</html>`;
}

// ─── Admin Login / Logout Handlers ────────────────────────────────────────────
export function serveAdminLogin(req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (!ADMIN_SECRET) {
    res.status(503).type('text/html').send(_loginPageHtml('Admin access is not configured on this server.'));
    return;
  }
  if (_validAdminSession(req)) { res.redirect(302, '/admin/analytics'); return; }
  res.type('text/html').send(_loginPageHtml());
}

export function handleAdminLogin(req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (!ADMIN_SECRET) {
    res.status(503).type('text/html').send(_loginPageHtml('Admin access is not configured on this server.'));
    return;
  }

  const ip = _clientIp(req);
  if (_isLoginLocked(ip)) {
    res.status(429).type('text/html').send(_loginPageHtml('Too many failed attempts. Try again later.'));
    return;
  }

  const body    = req.body as Record<string, unknown>;
  const provided = typeof body?.secret === 'string' ? body.secret.slice(0, 256) : '';

  if (!_timingSafeCompare(provided)) {
    _recordLoginFail(ip);
    res.status(401).type('text/html').send(_loginPageHtml('Invalid admin credentials.'));
    return;
  }

  _loginFailures.delete(ip);
  _makeAdminSession(res);
  res.redirect(303, '/admin/analytics');
}

export function handleAdminLogout(req: Request, res: Response): void {
  _invalidateAdminSession(req, res);
  res.redirect(303, '/admin/login');
}

// ─── Admin Auth Middleware ─────────────────────────────────────────────────────

// For browser routes — redirects to /admin/login instead of returning 403
export function adminBrowserMiddleware(req: Request, res: Response, next: Function): void {
  if (!ADMIN_SECRET) { res.redirect(302, '/admin/login'); return; }
  if (_validAdminSession(req)) { next(); return; }
  // Retain backward-compat: Authorization: Bearer header still works (e.g. curl)
  const header   = (req.headers['authorization'] as string || '');
  const provided = header.replace(/^Bearer\s+/i, '').trim();
  if (provided && _timingSafeCompare(provided)) { _makeAdminSession(res); next(); return; }
  res.redirect(302, '/admin/login');
}

// For API routes — returns JSON 401 (used by fetch() calls inside the dashboard)
export function adminMiddleware(req: Request, res: Response, next: Function): void {
  if (!ADMIN_SECRET) { res.status(503).json({ error: 'Admin not configured' }); return; }
  if (_validAdminSession(req)) { next(); return; }
  const header   = (req.headers['authorization'] as string || '');
  const provided = header.replace(/^Bearer\s+/i, '').trim();
  if (provided && _timingSafeCompare(provided)) { _makeAdminSession(res); next(); return; }
  res.status(401).json({ error: 'Unauthorized' });
}

// ─── Firebase Token Verification ──────────────────────────────────────────────
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function verifyUid(req: Request): Promise<string | null> {
  const authHeader = (req.headers['authorization'] as string) || '';
  if (authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      // Must use the Patient Angler named app — default app is Tile Royale (different Firebase project)
      const auth = firebaseAdmin.app('patient-angler').auth();
      const decoded = await auth.verifyIdToken(token);
      return decoded.uid;
    } catch { return null; }
  }
  // No Firebase token — accept anonymous device UUID from body
  const anonUid = req.body?.anonUid;
  if (typeof anonUid === 'string' && _UUID_RE.test(anonUid)) return 'anon_' + anonUid;
  return null;
}

// ─── DB Table Creation (called from index.ts after initDb) ───────────────────
export async function createAnalyticsTables(): Promise<void> {
  if (!getDbStatus().available) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS pa_player_progress (
        player_id                    TEXT        PRIMARY KEY,
        created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen                    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_snapshot_at             TIMESTAMPTZ,
        first_install_version        TEXT,
        previous_version             TEXT,
        app_version                  TEXT,
        build_number                 TEXT,
        platform                     TEXT,
        statistics_version           INTEGER     DEFAULT 1,
        days_since_first_play        INTEGER,
        total_play_time_seconds      BIGINT      DEFAULT 0,
        session_count                INTEGER     DEFAULT 0,
        last_session_duration_seconds INTEGER,
        current_zone                 TEXT,
        highest_zone                 TEXT,
        game_completion_percent      REAL,
        overall_fishdex_found        INTEGER     DEFAULT 0,
        overall_fishdex_total        INTEGER     DEFAULT 140,
        overall_fishdex_percent      REAL,
        automation_fishdex_found     INTEGER     DEFAULT 0,
        automation_fishdex_total     INTEGER     DEFAULT 130,
        automation_fishdex_percent   REAL,
        manual_fishdex_found         INTEGER     DEFAULT 0,
        manual_fishdex_total         INTEGER     DEFAULT 10,
        manual_fishdex_percent       REAL,
        mastery_points               INTEGER     DEFAULT 0,
        mastery_max_points           INTEGER     DEFAULT 0,
        mastery_percent              REAL,
        prestige_count               INTEGER     DEFAULT 0,
        current_black_pearls         INTEGER     DEFAULT 0,
        lifetime_black_pearls_earned INTEGER     DEFAULT 0,
        black_pearls_spent           INTEGER     DEFAULT 0,
        current_diamonds             INTEGER     DEFAULT 0,
        highest_diamonds_held        INTEGER     DEFAULT 0,
        current_coins                BIGINT      DEFAULT 0,
        lifetime_coins_earned        BIGINT      DEFAULT 0,
        lifetime_coins_spent         BIGINT      DEFAULT 0,
        highest_coin_balance         BIGINT      DEFAULT 0,
        estimated_hourly_income      BIGINT      DEFAULT 0,
        current_fish_rate            REAL        DEFAULT 0,
        current_rod                  TEXT,
        current_rod_tier             INTEGER     DEFAULT 0,
        highest_rod                  TEXT,
        highest_rod_tier             INTEGER     DEFAULT 0,
        targeted_lure_level          INTEGER     DEFAULT 0,
        targeted_lure_active_targets INTEGER     DEFAULT 0,
        competition_wins             INTEGER     DEFAULT 0,
        first_place_finishes         INTEGER     DEFAULT 0,
        grand_competition_titles     INTEGER     DEFAULT 0,
        competition_series_completed INTEGER     DEFAULT 0,
        daily_quests_completed       INTEGER     DEFAULT 0,
        weekly_quests_completed      INTEGER     DEFAULT 0,
        achievements_completed       INTEGER     DEFAULT 0,
        hidden_achievements_completed INTEGER    DEFAULT 0,
        achievements_total           INTEGER     DEFAULT 0,
        trophy_fish_caught           INTEGER     DEFAULT 0,
        largest_fish_weight_grams    BIGINT,
        largest_fish_name            TEXT,
        most_valuable_catch          BIGINT,
        most_valuable_catch_name     TEXT,
        offline_hours_claimed_total  REAL        DEFAULT 0,
        seagulls_clicked             INTEGER     DEFAULT 0,
        special_events_claimed       INTEGER     DEFAULT 0,
        last_prestige_at             TIMESTAMPTZ,
        last_zone_unlock_at          TIMESTAMPTZ,
        client_updated_at            TIMESTAMPTZ,
        server_updated_at            TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_pa_pp_last_seen   ON pa_player_progress(last_seen);
      CREATE INDEX IF NOT EXISTS idx_pa_pp_highest_zone ON pa_player_progress(highest_zone);
      CREATE INDEX IF NOT EXISTS idx_pa_pp_completion  ON pa_player_progress(game_completion_percent);
      CREATE INDEX IF NOT EXISTS idx_pa_pp_version     ON pa_player_progress(app_version);
      CREATE INDEX IF NOT EXISTS idx_pa_pp_prestige    ON pa_player_progress(prestige_count);

      CREATE TABLE IF NOT EXISTS pa_player_milestones (
        player_id              TEXT        NOT NULL,
        milestone_key          TEXT        NOT NULL,
        reached_at             TIMESTAMPTZ NOT NULL,
        play_time_seconds_at_reach BIGINT,
        app_version_at_reach   TEXT,
        snapshot_data          JSONB,
        PRIMARY KEY (player_id, milestone_key)
      );

      CREATE INDEX IF NOT EXISTS idx_pa_pm_player      ON pa_player_milestones(player_id);
      CREATE INDEX IF NOT EXISTS idx_pa_pm_key         ON pa_player_milestones(milestone_key);

      CREATE TABLE IF NOT EXISTS pa_player_daily_progress (
        player_id              TEXT        NOT NULL,
        progress_date          DATE        NOT NULL,
        app_version            TEXT,
        play_time_seconds      INTEGER     DEFAULT 0,
        sessions               INTEGER     DEFAULT 0,
        highest_zone           TEXT,
        game_completion_percent REAL,
        overall_fishdex_percent REAL,
        mastery_percent        REAL,
        prestige_count         INTEGER     DEFAULT 0,
        estimated_hourly_income BIGINT     DEFAULT 0,
        current_fish_rate      REAL        DEFAULT 0,
        PRIMARY KEY (player_id, progress_date)
      );
    `);
    console.log('[PA Analytics] Tables ready');
  } catch(err: any) {
    console.error('[PA Analytics] Table creation failed:', err?.message);
  }
}

// ─── Delete Player Analytics (GDPR support) ───────────────────────────────────
export async function deletePlayerAnalytics(playerId: string): Promise<void> {
  await query('BEGIN');
  try {
    await query('DELETE FROM pa_player_progress WHERE player_id=$1', [playerId]);
    await query('DELETE FROM pa_player_milestones WHERE player_id=$1', [playerId]);
    await query('DELETE FROM pa_player_daily_progress WHERE player_id=$1', [playerId]);
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }
}

// ─── Payload Validation ───────────────────────────────────────────────────────
function clamp(v: any, min: number, max: number, def: number): number {
  const n = Number(v);
  return isNaN(n) ? def : Math.min(max, Math.max(min, n));
}
function str(v: any, maxLen = 64): string | null {
  if (typeof v !== 'string') return null;
  return v.slice(0, maxLen);
}
function pct(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}

function sanitize(p: any) {
  return {
    app_version:                  str(p.appVersion, 16),
    build_number:                 str(p.buildNumber, 16),
    platform:                     str(p.platform, 16),
    first_install_version:        str(p.firstInstallVersion, 16),
    previous_version:             str(p.previousVersion, 16),
    days_since_first_play:        clamp(p.daysSinceFirstPlay,       0, 99999,  0),
    total_play_time_seconds:      clamp(p.totalPlayTimeSeconds,     0, 1e10,   0),
    session_count:                clamp(p.sessionCount,             0, 999999, 0),
    last_session_duration_seconds:clamp(p.lastSessionDurationSeconds, 0, 86400, 0),
    current_zone:                 str(p.currentZone, 32),
    highest_zone:                 str(p.highestZone, 32),
    game_completion_percent:      pct(p.gameCompletionPercent),
    overall_fishdex_found:        clamp(p.overallFishdexFound,     0, 9999, 0),
    overall_fishdex_total:        clamp(p.overallFishdexTotal,     0, 9999, 0),
    overall_fishdex_percent:      pct(p.overallFishdexPercent),
    automation_fishdex_found:     clamp(p.automationFishdexFound,  0, 9999, 0),
    automation_fishdex_total:     clamp(p.automationFishdexTotal,  0, 9999, 0),
    automation_fishdex_percent:   pct(p.automationFishdexPercent),
    manual_fishdex_found:         clamp(p.manualFishdexFound,      0, 9999, 0),
    manual_fishdex_total:         clamp(p.manualFishdexTotal,      0, 9999, 0),
    manual_fishdex_percent:       pct(p.manualFishdexPercent),
    mastery_points:               clamp(p.masteryPoints,           0, 999999, 0),
    mastery_max_points:           clamp(p.masteryMaxPoints,        0, 999999, 0),
    mastery_percent:              pct(p.masteryPercent),
    prestige_count:               clamp(p.prestigeCount,           0, 9999,  0),
    current_black_pearls:         clamp(p.currentBlackPearls,      0, 1e9,   0),
    lifetime_black_pearls_earned: clamp(p.lifetimeBlackPearlsEarned, 0, 1e9, 0),
    black_pearls_spent:           clamp(p.blackPearlsSpent,        0, 1e9,   0),
    current_diamonds:             clamp(p.currentDiamonds,         0, 1e9,   0),
    highest_diamonds_held:        clamp(p.highestDiamondsHeld,     0, 1e9,   0),
    current_coins:                clamp(p.currentCoins,            0, 1e15,  0),
    lifetime_coins_earned:        clamp(p.lifetimeCoinsEarned,     0, 1e18,  0),
    lifetime_coins_spent:         clamp(p.lifetimeCoinsSpent,      0, 1e18,  0),
    highest_coin_balance:         clamp(p.highestCoinBalance,      0, 1e15,  0),
    estimated_hourly_income:      clamp(p.estimatedHourlyIncome,   0, 1e15,  0),
    current_fish_rate:            clamp(p.currentFishRate,         0, 1e6,   0),
    current_rod:                  str(p.currentRod, 32),
    current_rod_tier:             clamp(p.currentRodTier,          0, 99,    0),
    highest_rod:                  str(p.highestRod, 32),
    highest_rod_tier:             clamp(p.highestRodTier,          0, 99,    0),
    targeted_lure_level:          clamp(p.targetedLureLevel,       0, 99,    0),
    targeted_lure_active_targets: clamp(p.targetedLureActiveTargets, 0, 99,  0),
    competition_wins:             clamp(p.competitionWins,         0, 99999, 0),
    first_place_finishes:         clamp(p.firstPlaceFinishes,      0, 99999, 0),
    grand_competition_titles:     clamp(p.grandCompetitionTitles,  0, 9999,  0),
    competition_series_completed: clamp(p.competitionSeriesCompleted, 0, 9999, 0),
    daily_quests_completed:       clamp(p.dailyQuestsCompleted,    0, 999999, 0),
    weekly_quests_completed:      clamp(p.weeklyQuestsCompleted,   0, 99999,  0),
    achievements_completed:       clamp(p.achievementsCompleted,   0, 9999,  0),
    hidden_achievements_completed:clamp(p.hiddenAchievementsCompleted, 0, 99, 0),
    achievements_total:           clamp(p.achievementsTotal,       0, 9999,  0),
    trophy_fish_caught:           clamp(p.trophyFishCaught,        0, 999999, 0),
    largest_fish_weight_grams:    clamp(p.largestFishWeightGrams,  0, 1e12,  0),
    largest_fish_name:            str(p.largestFishName, 64),
    most_valuable_catch:          clamp(p.mostValuableCatch,       0, 1e15,  0),
    most_valuable_catch_name:     str(p.mostValuableCatchName, 64),
    offline_hours_claimed_total:  clamp(p.offlineHoursClaimedTotal, 0, 999999, 0),
    seagulls_clicked:             clamp(p.seagullsClicked,         0, 999999, 0),
    special_events_claimed:       clamp(p.specialEventsClaimed,    0, 999999, 0),
    client_updated_at:            str(p.clientUpdatedAt, 32),
  };
}

// ─── Milestone Definitions ────────────────────────────────────────────────────
const MILESTONE_KEYS = new Set([
  'game_started',
  'river_unlocked','lake_unlocked','bay_unlocked','sea_unlocked','ocean_unlocked','abyss_unlocked',
  'first_prestige','prestige_5','prestige_10','prestige_25','prestige_50',
  'overall_fishdex_25','overall_fishdex_50','overall_fishdex_75','overall_fishdex_100',
  'automation_fishdex_25','automation_fishdex_50','automation_fishdex_75','automation_fishdex_100',
  'manual_fishdex_25','manual_fishdex_50','manual_fishdex_75','manual_fishdex_100',
  'mastery_25','mastery_50','mastery_75','mastery_100',
  'first_competition','first_competition_win','first_grand_competition_title','grand_titles_5','grand_titles_10',
  'targeted_lure_unlocked','targeted_lure_max_level',
  'first_legendary_fish','first_trophy_fish',
  'first_rod_tier_5','first_rod_tier_10','first_rod_tier_15',
  'first_black_pearl','black_pearls_10','black_pearls_50','black_pearls_100','black_pearls_500',
  'first_achievement','achievements_25_percent','achievements_50_percent','achievements_75_percent','achievements_100_percent',
  'first_guild_order_completed','guild_orders_10','first_golden_contract',
]);

// ─── DB Upsert: Player Progress ───────────────────────────────────────────────
async function upsertProgress(playerId: string, d: any): Promise<void> {
  await query(`
    INSERT INTO pa_player_progress (
      player_id, created_at, last_seen, last_snapshot_at,
      first_install_version, previous_version, app_version, build_number, platform,
      statistics_version,
      days_since_first_play, total_play_time_seconds, session_count, last_session_duration_seconds,
      current_zone, highest_zone, game_completion_percent,
      overall_fishdex_found, overall_fishdex_total, overall_fishdex_percent,
      automation_fishdex_found, automation_fishdex_total, automation_fishdex_percent,
      manual_fishdex_found, manual_fishdex_total, manual_fishdex_percent,
      mastery_points, mastery_max_points, mastery_percent,
      prestige_count, current_black_pearls, lifetime_black_pearls_earned, black_pearls_spent,
      current_diamonds, highest_diamonds_held,
      current_coins, lifetime_coins_earned, lifetime_coins_spent, highest_coin_balance,
      estimated_hourly_income, current_fish_rate,
      current_rod, current_rod_tier, highest_rod, highest_rod_tier,
      targeted_lure_level, targeted_lure_active_targets,
      competition_wins, first_place_finishes, grand_competition_titles, competition_series_completed,
      daily_quests_completed, weekly_quests_completed, achievements_completed, hidden_achievements_completed, achievements_total,
      trophy_fish_caught, largest_fish_weight_grams, largest_fish_name, most_valuable_catch, most_valuable_catch_name,
      offline_hours_claimed_total, seagulls_clicked, special_events_claimed,
      client_updated_at, server_updated_at
    ) VALUES (
      $1, now(), now(), now(),
      $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
      $28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,$51,
      $52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,now()
    )
    ON CONFLICT (player_id) DO UPDATE SET
      last_seen                    = now(),
      last_snapshot_at             = now(),
      previous_version             = CASE WHEN EXCLUDED.app_version IS DISTINCT FROM pa_player_progress.app_version
                                       THEN pa_player_progress.app_version
                                       ELSE pa_player_progress.previous_version END,
      first_install_version        = COALESCE(pa_player_progress.first_install_version, EXCLUDED.first_install_version),
      app_version                  = EXCLUDED.app_version,
      build_number                 = EXCLUDED.build_number,
      platform                     = EXCLUDED.platform,
      statistics_version           = EXCLUDED.statistics_version,
      days_since_first_play        = EXCLUDED.days_since_first_play,
      total_play_time_seconds      = EXCLUDED.total_play_time_seconds,
      session_count                = EXCLUDED.session_count,
      last_session_duration_seconds= EXCLUDED.last_session_duration_seconds,
      current_zone                 = EXCLUDED.current_zone,
      highest_zone                 = EXCLUDED.highest_zone,
      game_completion_percent      = EXCLUDED.game_completion_percent,
      overall_fishdex_found        = EXCLUDED.overall_fishdex_found,
      overall_fishdex_total        = EXCLUDED.overall_fishdex_total,
      overall_fishdex_percent      = EXCLUDED.overall_fishdex_percent,
      automation_fishdex_found     = EXCLUDED.automation_fishdex_found,
      automation_fishdex_total     = EXCLUDED.automation_fishdex_total,
      automation_fishdex_percent   = EXCLUDED.automation_fishdex_percent,
      manual_fishdex_found         = EXCLUDED.manual_fishdex_found,
      manual_fishdex_total         = EXCLUDED.manual_fishdex_total,
      manual_fishdex_percent       = EXCLUDED.manual_fishdex_percent,
      mastery_points               = EXCLUDED.mastery_points,
      mastery_max_points           = EXCLUDED.mastery_max_points,
      mastery_percent              = EXCLUDED.mastery_percent,
      prestige_count               = EXCLUDED.prestige_count,
      current_black_pearls         = EXCLUDED.current_black_pearls,
      lifetime_black_pearls_earned = EXCLUDED.lifetime_black_pearls_earned,
      black_pearls_spent           = EXCLUDED.black_pearls_spent,
      current_diamonds             = EXCLUDED.current_diamonds,
      highest_diamonds_held        = EXCLUDED.highest_diamonds_held,
      current_coins                = EXCLUDED.current_coins,
      lifetime_coins_earned        = EXCLUDED.lifetime_coins_earned,
      lifetime_coins_spent         = EXCLUDED.lifetime_coins_spent,
      highest_coin_balance         = EXCLUDED.highest_coin_balance,
      estimated_hourly_income      = EXCLUDED.estimated_hourly_income,
      current_fish_rate            = EXCLUDED.current_fish_rate,
      current_rod                  = EXCLUDED.current_rod,
      current_rod_tier             = EXCLUDED.current_rod_tier,
      highest_rod                  = EXCLUDED.highest_rod,
      highest_rod_tier             = EXCLUDED.highest_rod_tier,
      targeted_lure_level          = EXCLUDED.targeted_lure_level,
      targeted_lure_active_targets = EXCLUDED.targeted_lure_active_targets,
      competition_wins             = EXCLUDED.competition_wins,
      first_place_finishes         = EXCLUDED.first_place_finishes,
      grand_competition_titles     = EXCLUDED.grand_competition_titles,
      competition_series_completed = EXCLUDED.competition_series_completed,
      daily_quests_completed       = EXCLUDED.daily_quests_completed,
      weekly_quests_completed      = EXCLUDED.weekly_quests_completed,
      achievements_completed       = EXCLUDED.achievements_completed,
      hidden_achievements_completed= EXCLUDED.hidden_achievements_completed,
      achievements_total           = EXCLUDED.achievements_total,
      trophy_fish_caught           = EXCLUDED.trophy_fish_caught,
      largest_fish_weight_grams    = EXCLUDED.largest_fish_weight_grams,
      largest_fish_name            = EXCLUDED.largest_fish_name,
      most_valuable_catch          = EXCLUDED.most_valuable_catch,
      most_valuable_catch_name     = EXCLUDED.most_valuable_catch_name,
      offline_hours_claimed_total  = EXCLUDED.offline_hours_claimed_total,
      seagulls_clicked             = EXCLUDED.seagulls_clicked,
      special_events_claimed       = EXCLUDED.special_events_claimed,
      client_updated_at            = EXCLUDED.client_updated_at,
      server_updated_at            = now()
  `, [
    playerId,
    d.first_install_version, d.previous_version, d.app_version, d.build_number, d.platform,
    STATS_VERSION,
    d.days_since_first_play, d.total_play_time_seconds, d.session_count, d.last_session_duration_seconds,
    d.current_zone, d.highest_zone, d.game_completion_percent,
    d.overall_fishdex_found, d.overall_fishdex_total, d.overall_fishdex_percent,
    d.automation_fishdex_found, d.automation_fishdex_total, d.automation_fishdex_percent,
    d.manual_fishdex_found, d.manual_fishdex_total, d.manual_fishdex_percent,
    d.mastery_points, d.mastery_max_points, d.mastery_percent,
    d.prestige_count, d.current_black_pearls, d.lifetime_black_pearls_earned, d.black_pearls_spent,
    d.current_diamonds, d.highest_diamonds_held,
    d.current_coins, d.lifetime_coins_earned, d.lifetime_coins_spent, d.highest_coin_balance,
    d.estimated_hourly_income, d.current_fish_rate,
    d.current_rod, d.current_rod_tier, d.highest_rod, d.highest_rod_tier,
    d.targeted_lure_level, d.targeted_lure_active_targets,
    d.competition_wins, d.first_place_finishes, d.grand_competition_titles, d.competition_series_completed,
    d.daily_quests_completed, d.weekly_quests_completed, d.achievements_completed, d.hidden_achievements_completed, d.achievements_total,
    d.trophy_fish_caught, d.largest_fish_weight_grams, d.largest_fish_name, d.most_valuable_catch, d.most_valuable_catch_name,
    d.offline_hours_claimed_total, d.seagulls_clicked, d.special_events_claimed,
    d.client_updated_at,
  ]);
}

// ─── DB Upsert: Milestones ────────────────────────────────────────────────────
async function insertMilestones(
  playerId: string,
  milestones: Array<{ key: string; reachedAt: string; playTimeSecs?: number; appVersion?: string; snapshotData?: any }>
): Promise<string[]> {
  const created: string[] = [];
  for (const m of milestones) {
    if (!MILESTONE_KEYS.has(m.key)) continue;
    const rows = await query(`
      INSERT INTO pa_player_milestones (player_id, milestone_key, reached_at, play_time_seconds_at_reach, app_version_at_reach, snapshot_data)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (player_id, milestone_key) DO NOTHING
      RETURNING milestone_key
    `, [playerId, m.key, m.reachedAt, m.playTimeSecs ?? null, m.appVersion ?? null, (() => {
      if (!m.snapshotData) return null;
      const s = JSON.stringify(m.snapshotData);
      return s.length > 65_536 ? null : s; // drop oversized snapshot blobs
    })()]);
    if (rows && rows.length > 0) created.push(m.key);
  }
  return created;
}

// ─── DB Upsert: Daily Progress ────────────────────────────────────────────────
async function upsertDailyProgress(playerId: string, d: any): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await query(`
    INSERT INTO pa_player_daily_progress
      (player_id, progress_date, app_version, play_time_seconds, sessions,
       highest_zone, game_completion_percent, overall_fishdex_percent,
       mastery_percent, prestige_count, estimated_hourly_income, current_fish_rate)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (player_id, progress_date) DO UPDATE SET
      app_version             = EXCLUDED.app_version,
      play_time_seconds       = EXCLUDED.play_time_seconds,
      sessions                = EXCLUDED.sessions,
      highest_zone            = EXCLUDED.highest_zone,
      game_completion_percent = EXCLUDED.game_completion_percent,
      overall_fishdex_percent = EXCLUDED.overall_fishdex_percent,
      mastery_percent         = EXCLUDED.mastery_percent,
      prestige_count          = EXCLUDED.prestige_count,
      estimated_hourly_income = EXCLUDED.estimated_hourly_income,
      current_fish_rate       = EXCLUDED.current_fish_rate
  `, [
    playerId, today, d.app_version,
    d.total_play_time_seconds, d.session_count,
    d.highest_zone, d.game_completion_percent, d.overall_fishdex_percent,
    d.mastery_percent, d.prestige_count, d.estimated_hourly_income, d.current_fish_rate,
  ]);
}

// ─── Player Analytics Route Handler ───────────────────────────────────────────
export async function handleAnalyticsProgress(req: Request, res: Response): Promise<void> {
  try {
    if (!getDbStatus().available) { res.json({ ok: false, error: 'db_unavailable' }); return; }

    const playerId = await verifyUid(req);
    if (!playerId) { res.status(401).json({ ok: false, error: 'unauthenticated' }); return; }

    const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
    if (_rateLimit(playerId) || _rateLimit(ip)) { res.json({ ok: true, rateLimited: true }); return; }

    const raw = req.body;
    if (!raw || typeof raw !== 'object') { res.status(400).json({ ok: false, error: 'invalid' }); return; }
    if (JSON.stringify(raw).length > MAX_PAYLOAD) { res.status(413).json({ ok: false, error: 'too_large' }); return; }

    const payload  = raw.payload;
    if (!payload || typeof payload !== 'object') { res.status(400).json({ ok: false, error: 'missing_payload' }); return; }

    const data = sanitize(payload);
    await upsertProgress(playerId, data);
    await upsertDailyProgress(playerId, data);

    const rawMilestones = Array.isArray(raw.milestones) ? raw.milestones : [];
    const validMilestones = rawMilestones
      .filter((m: any) => m && typeof m.key === 'string' && MILESTONE_KEYS.has(m.key))
      .map((m: any) => ({
        key: m.key,
        reachedAt: typeof m.reachedAt === 'string' ? m.reachedAt : new Date().toISOString(),
        playTimeSecs: typeof m.playTimeSecs === 'number' ? Math.max(0, m.playTimeSecs) : undefined,
        appVersion: typeof m.appVersion === 'string' ? m.appVersion.slice(0, 16) : undefined,
        snapshotData: m.snapshotData && typeof m.snapshotData === 'object' ? m.snapshotData : undefined,
      }));

    const milestonesCreated = validMilestones.length > 0
      ? await insertMilestones(playerId, validMilestones)
      : [];

    res.json({ ok: true, updated: true, milestonesCreated });
  } catch(err: any) {
    console.warn('[PA Analytics] progress error:', err?.message);
    res.json({ ok: false, error: 'server_error' });
  }
}

// ─── Admin API Handlers ───────────────────────────────────────────────────────
export async function handleAdminSummary(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const d7  = new Date(now.getTime() - 7  * 86400000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const d1  = new Date(now.getTime() - 86400000).toISOString();
  const today = now.toISOString().slice(0, 10);

  const [[totals], [activity], [conv]] = await Promise.all([
    query(`
      SELECT
        -- Real players: played >2 min OR returned for a second session.
        -- Filters out Google Play Pre-Launch Report test installs (fresh install,
        -- opens once for <10s, never returns) which would otherwise inflate the count.
        COUNT(*) FILTER (WHERE total_play_time_seconds >= 120 OR session_count >= 2) AS total_players,
        COUNT(*)                                             AS total_players_raw,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY game_completion_percent) AS median_completion,
        AVG(game_completion_percent)                         AS avg_completion,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY overall_fishdex_percent) AS median_fishdex,
        AVG(overall_fishdex_percent)                         AS avg_fishdex,
        AVG(mastery_percent)                                 AS avg_mastery,
        AVG(prestige_count)                                  AS avg_prestige,
        MAX(game_completion_percent)                         AS highest_completion,
        MAX(estimated_hourly_income)                         AS highest_income,
        MAX(current_fish_rate)                               AS highest_fish_rate,
        (SELECT app_version FROM pa_player_progress WHERE build_number ~ '^[0-9]+$' ORDER BY build_number::integer DESC LIMIT 1) AS latest_version,
        COUNT(*) FILTER (WHERE prestige_count > 0)           AS prestige_players,
        COUNT(*) FILTER (WHERE highest_zone = 'ocean' OR highest_zone LIKE '%_cavern') AS ocean_plus_players,
        COUNT(*) FILTER (WHERE automation_fishdex_percent >= 100) AS auto_dex_complete,
        COUNT(*) FILTER (WHERE manual_fishdex_percent >= 100)    AS manual_dex_complete
      FROM pa_player_progress
    `) || [{}],
    query(`
      SELECT
        COUNT(*) FILTER (WHERE last_seen >= $1::timestamptz) AS today,
        COUNT(*) FILTER (WHERE last_seen >= $2::timestamptz) AS last7,
        COUNT(*) FILTER (WHERE last_seen >= $3::timestamptz) AS last30,
        COUNT(*) FILTER (WHERE DATE(created_at) >= $4::date - INTERVAL '7 days')  AS new7,
        COUNT(*) FILTER (WHERE DATE(created_at) >= $4::date - INTERVAL '30 days') AS new30
      FROM pa_player_progress
    `, [d1, d7, d30, today]) || [{}],
    query(`
      SELECT app_version, COUNT(*) AS cnt
      FROM pa_player_progress
      WHERE app_version IS NOT NULL
      GROUP BY app_version
      ORDER BY cnt DESC
      LIMIT 10
    `) || [],
  ]);

  const t = totals || {};
  const a = activity || {};
  const totalRaw = Number(t.total_players_raw) || 0;
  const totalVerified = Number(t.total_players) || 0;
  res.json({
    totalPlayers: totalRaw,
    totalPlayersVerified: totalVerified,
    totalPlayersRaw: totalRaw,
    activeToday: Number(a.today) || 0,
    activeLast7: Number(a.last7) || 0,
    activeLast30: Number(a.last30) || 0,
    newLast7: Number(a.new7) || 0,
    newLast30: Number(a.new30) || 0,
    avgCompletion: Number(t.avg_completion)?.toFixed(1),
    medianCompletion: Number(t.median_completion)?.toFixed(1),
    avgFishdex: Number(t.avg_fishdex)?.toFixed(1),
    medianFishdex: Number(t.median_fishdex)?.toFixed(1),
    avgMastery: Number(t.avg_mastery)?.toFixed(1),
    avgPrestige: Number(t.avg_prestige)?.toFixed(2),
    prestigePercent: totalVerified ? ((Number(t.prestige_players)/totalVerified)*100).toFixed(1) : '0',
    oceanPercent: totalVerified ? ((Number(t.ocean_plus_players)/totalVerified)*100).toFixed(1) : '0',
    autoDexCompletePercent: totalVerified ? ((Number(t.auto_dex_complete)/totalVerified)*100).toFixed(1) : '0',
    manualDexCompletePercent: totalVerified ? ((Number(t.manual_dex_complete)/totalVerified)*100).toFixed(1) : '0',
    highestCompletion: Number(t.highest_completion)?.toFixed(1),
    highestIncome: Number(t.highest_income),
    highestFishRate: Number(t.highest_fish_rate)?.toFixed(2),
    latestVersion: t.latest_version || '—',
    versionBreakdown: conv || [],
  });
}

export async function handleAdminPlayers(req: Request, res: Response): Promise<void> {
  const page     = Math.max(1, Number(req.query.page) || 1);
  const limit    = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset   = (page - 1) * limit;
  const search   = typeof req.query.search === 'string' ? req.query.search.slice(0, 64) : '';
  const zone     = typeof req.query.zone === 'string'   ? req.query.zone   : '';
  const version  = typeof req.query.version === 'string'? req.query.version: '';
  const sort     = ['last_seen','created_at','game_completion_percent','overall_fishdex_percent',
                    'prestige_count','highest_zone','estimated_hourly_income','current_fish_rate',
                    'session_count','total_play_time_seconds','grand_competition_titles'].includes(req.query.sort as string)
                    ? req.query.sort as string : 'last_seen';
  const dir      = req.query.dir === 'asc' ? 'ASC' : 'DESC';
  const days     = Number(req.query.days) || 0;

  const conditions: string[] = [];
  const params: any[] = [];
  let pi = 1;

  if (search)  { conditions.push(`player_id ILIKE $${pi++}`); params.push('%'+search+'%'); }
  if (zone)    { conditions.push(`highest_zone = $${pi++}`);  params.push(zone); }
  if (version) { conditions.push(`app_version = $${pi++}`);   params.push(version); }
  if (days > 0){ conditions.push(`last_seen >= now() - ($${pi++}::text || ' days')::INTERVAL`); params.push(String(days)); }
  if (req.query.minCompletion) { conditions.push(`game_completion_percent >= $${pi++}`); params.push(Number(req.query.minCompletion)); }
  if (req.query.maxCompletion) { conditions.push(`game_completion_percent <= $${pi++}`); params.push(Number(req.query.maxCompletion)); }
  if (req.query.minPrestige)   { conditions.push(`prestige_count >= $${pi++}`); params.push(Number(req.query.minPrestige)); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [rows, countRows] = await Promise.all([
    query(`SELECT * FROM pa_player_progress ${where} ORDER BY ${sort} ${dir} LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*) AS total FROM pa_player_progress ${where}`, params),
  ]);

  res.json({ rows: rows || [], total: Number(countRows?.[0]?.total || 0), page, limit });
}

export async function handleAdminPlayerDetail(req: Request, res: Response): Promise<void> {
  const playerId = req.params.playerId;
  if (!playerId) { res.status(400).json({ error: 'missing player_id' }); return; }

  const [progress, milestones, daily] = await Promise.all([
    query('SELECT * FROM pa_player_progress WHERE player_id=$1', [playerId]),
    query('SELECT * FROM pa_player_milestones WHERE player_id=$1 ORDER BY reached_at ASC', [playerId]),
    query('SELECT * FROM pa_player_daily_progress WHERE player_id=$1 ORDER BY progress_date ASC', [playerId]),
  ]);

  if (!progress || progress.length === 0) { res.status(404).json({ error: 'not_found' }); return; }

  // Compute milestone-based durations
  const mMap: Record<string, any> = {};
  (milestones || []).forEach((m: any) => { mMap[m.milestone_key] = m; });
  const start = mMap['game_started'];
  const durStr = (target: any): string => {
    if (!start || !target) return 'Not reached';
    const secs = Math.floor((new Date(target.reached_at).getTime() - new Date(start.reached_at).getTime()) / 1000);
    if (secs < 0) return 'Error';
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400)/3600), m2 = Math.floor((secs % 3600)/60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m2}m`;
    return `${m2}m`;
  };

  res.json({
    progress: progress[0],
    milestones: milestones || [],
    daily: daily || [],
    durations: {
      toRiver:    durStr(mMap['river_unlocked']),
      toLake:     durStr(mMap['lake_unlocked']),
      toBay:      durStr(mMap['bay_unlocked']),
      toSea:      durStr(mMap['sea_unlocked']),
      toOcean:    durStr(mMap['ocean_unlocked']),
      toFirstPrestige: durStr(mMap['first_prestige']),
      toFishdex25: durStr(mMap['overall_fishdex_25']),
      toFishdex50: durStr(mMap['overall_fishdex_50']),
      toFishdex75: durStr(mMap['overall_fishdex_75']),
      toFishdex100:durStr(mMap['overall_fishdex_100']),
      toFirstGrandTitle: durStr(mMap['first_grand_competition_title']),
    },
  });
}

export async function handleAdminFunnel(_req: Request, res: Response): Promise<void> {
  const total = Number((await query('SELECT COUNT(*) AS c FROM pa_player_progress'))?.[0]?.c || 0);

  const FUNNEL_MILESTONES = [
    'game_started','river_unlocked','lake_unlocked','bay_unlocked','sea_unlocked','ocean_unlocked',
    'first_prestige','automation_fishdex_50','overall_fishdex_50','manual_fishdex_100',
    'overall_fishdex_100','abyss_unlocked',
  ];

  const rows = await query(`
    SELECT milestone_key,
           COUNT(DISTINCT player_id)                                                   AS reached,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY play_time_seconds_at_reach)     AS median_secs
    FROM pa_player_milestones
    WHERE milestone_key = ANY($1)
    GROUP BY milestone_key
  `, [FUNNEL_MILESTONES]) || [];

  const map: Record<string, any> = {};
  rows.forEach((r: any) => { map[r.milestone_key] = r; });

  let prevCount = total;
  const funnel = FUNNEL_MILESTONES.map(key => {
    const r   = map[key];
    const cnt = Number(r?.reached || 0);
    const pct = total ? ((cnt/total)*100).toFixed(1) : '0';
    const ret = total ? ((cnt/prevCount)*100).toFixed(1) : '0';
    const medSecs = Number(r?.median_secs || 0);
    const d = Math.floor(medSecs/86400), h = Math.floor((medSecs%86400)/3600);
    const medStr = medSecs ? `${d > 0 ? d+'d ' : ''}${h}h` : '—';
    prevCount = cnt || prevCount;
    return { key, reached: cnt, pctOfTotal: pct, pctFromPrev: ret, medianPlayTime: medStr };
  });

  res.json({ total, funnel });
}

export async function handleAdminZones(_req: Request, res: Response): Promise<void> {
  const rows = await query(`
    SELECT
      highest_zone                                                      AS zone,
      COUNT(*)                                                          AS players,
      ROUND(COUNT(*)*100.0 / NULLIF(SUM(COUNT(*)) OVER(),0), 1)        AS pct,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_since_first_play) AS median_age_days,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_play_time_seconds) AS median_secs,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY game_completion_percent)  AS median_completion,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY estimated_hourly_income)  AS median_income
    FROM pa_player_progress
    WHERE highest_zone IS NOT NULL
    GROUP BY highest_zone
    ORDER BY ARRAY_POSITION(ARRAY['pond','river','lake','bay','sea','ocean',
      'emerald_cavern','amber_cavern','amethyst_cavern','ruby_cavern',
      'aquamarine_cavern','opal_cavern','obsidian_cavern','topaz_cavern',
      'sapphire_cavern','blue_diamond_cavern'], highest_zone) DESC NULLS LAST
  `) || [];
  res.json(rows);
}

export async function handleAdminVersions(_req: Request, res: Response): Promise<void> {
  const rows = await query(`
    SELECT
      app_version,
      COUNT(*)                                                           AS players,
      COUNT(*) FILTER (WHERE last_seen >= now()-INTERVAL '7 days')      AS active7,
      ROUND(AVG(game_completion_percent)::NUMERIC,1)                    AS avg_completion,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY game_completion_percent) AS median_completion,
      ROUND(AVG(prestige_count)::NUMERIC,2)                             AS avg_prestige,
      COUNT(*) FILTER (WHERE prestige_count > 0) * 100.0 / NULLIF(COUNT(*),0) AS prestige_rate,
      COUNT(*) FILTER (WHERE overall_fishdex_percent >= 50) * 100.0 / NULLIF(COUNT(*),0) AS fishdex50_rate,
      ROUND(AVG(session_count)::NUMERIC,1)                              AS avg_sessions,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_play_time_seconds)  AS median_playtime
    FROM pa_player_progress
    WHERE app_version IS NOT NULL
    GROUP BY app_version
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `) || [];
  res.json(rows);
}

export async function handleAdminCohorts(_req: Request, res: Response): Promise<void> {
  const rows = await query(`
    SELECT
      DATE_TRUNC('week', created_at)::DATE                                             AS cohort_week,
      COUNT(*)                                                                          AS new_players,
      COUNT(*) FILTER (WHERE last_seen >= created_at + INTERVAL '1 day')               AS active_day1,
      COUNT(*) FILTER (WHERE last_seen >= created_at + INTERVAL '7 days')              AS active_day7,
      COUNT(*) FILTER (WHERE last_seen >= created_at + INTERVAL '30 days')             AS active_day30,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY game_completion_percent)             AS median_completion,
      COUNT(*) FILTER (WHERE prestige_count > 0) * 100.0 / NULLIF(COUNT(*),0)         AS prestige_rate,
      COUNT(*) FILTER (WHERE highest_zone = 'ocean' OR highest_zone LIKE '%_cavern') * 100.0 / NULLIF(COUNT(*),0) AS ocean_rate
    FROM pa_player_progress
    GROUP BY DATE_TRUNC('week', created_at)
    ORDER BY cohort_week DESC
    LIMIT 26
  `) || [];
  res.json(rows);
}

export async function handleAdminDataQuality(_req: Request, res: Response): Promise<void> {
  const rows = await query(`
    SELECT player_id,
           CASE WHEN overall_fishdex_found > overall_fishdex_total THEN 'fishdex_overflow' END       AS fishdex_overflow,
           CASE WHEN game_completion_percent NOT BETWEEN 0 AND 100 THEN 'completion_range' END        AS completion_range,
           CASE WHEN current_coins < 0 THEN 'negative_coins' END                                      AS negative_coins,
           CASE WHEN current_diamonds < 0 THEN 'negative_diamonds' END                                AS negative_diamonds,
           CASE WHEN current_black_pearls < 0 THEN 'negative_pearls' END                             AS negative_pearls,
           CASE WHEN app_version IS NULL THEN 'missing_version' END                                   AS missing_version,
           CASE WHEN lifetime_coins_earned < current_coins THEN 'impossible_coins' END                AS impossible_coins,
           CASE WHEN current_rod_tier > 50 THEN 'impossible_rod_tier' END                             AS impossible_rod_tier
    FROM pa_player_progress
    WHERE
      overall_fishdex_found > overall_fishdex_total OR
      game_completion_percent NOT BETWEEN 0 AND 100 OR
      current_coins < 0 OR current_diamonds < 0 OR current_black_pearls < 0 OR
      app_version IS NULL OR
      (lifetime_coins_earned < current_coins AND lifetime_coins_earned > 0) OR
      current_rod_tier > 50
    LIMIT 200
  `) || [];
  res.json(rows);
}

export async function handleAdminExportCsv(req: Request, res: Response): Promise<void> {
  const zone    = typeof req.query.zone === 'string'    ? req.query.zone    : '';
  const version = typeof req.query.version === 'string' ? req.query.version : '';
  const search  = typeof req.query.search === 'string'  ? req.query.search.slice(0, 64) : '';

  const conditions: string[] = [];
  const params: any[] = [];
  let pi = 1;
  if (search)  { conditions.push(`player_id ILIKE $${pi++}`);   params.push('%'+search+'%'); }
  if (zone)    { conditions.push(`highest_zone = $${pi++}`);    params.push(zone); }
  if (version) { conditions.push(`app_version = $${pi++}`);     params.push(version); }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const rows = await query(`SELECT * FROM pa_player_progress ${where} ORDER BY last_seen DESC`, params) || [];

  if (rows.length === 0) { res.type('text/csv').send('No data'); return; }

  const cols = Object.keys(rows[0]);
  const escape = (v: any): string => {
    if (v === null || v === undefined) return '';
    const raw = String(v);
    const s = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  const date = new Date().toISOString().slice(0,10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="patient_angler_analytics_${date}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.write('﻿' + cols.join(',') + '\r\n'); // BOM for Excel
  for (const row of rows) {
    res.write(cols.map(c => escape(row[c])).join(',') + '\r\n');
  }
  res.end();
}

export async function handleAdminExportMilestonesCsv(_req: Request, res: Response): Promise<void> {
  const rows = await query('SELECT * FROM pa_player_milestones ORDER BY reached_at DESC') || [];
  const date = new Date().toISOString().slice(0,10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="pa_milestones_${date}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  if (rows.length === 0) { res.send('No data'); return; }
  const cols = Object.keys(rows[0]);
  res.write('﻿' + cols.join(',') + '\r\n');
  for (const row of rows) {
    const escape = (v: any) => { if(v===null||v===undefined) return ''; const raw=String(v); const s=/^[=+\-@]/.test(raw)?"'"+raw:raw; return (s.includes(',')||s.includes('"')||s.includes('\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; };
    res.write(cols.map(c => escape(row[c])).join(',') + '\r\n');
  }
  res.end();
}

// ─── Admin Dashboard HTML ─────────────────────────────────────────────────────
export function serveAdminDashboard(_req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'");
  res.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Patient Angler Analytics</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#c9d1d9;font-family:ui-monospace,monospace;font-size:13px;line-height:1.5}
a{color:#58a6ff;text-decoration:none}
h2{font-size:15px;color:#e6edf3;margin-bottom:12px}
h3{font-size:13px;color:#8b949e;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.05em}
.header{background:#161b22;border-bottom:1px solid #30363d;padding:12px 20px;display:flex;align-items:center;gap:16px}
.header h1{font-size:16px;color:#e6edf3;font-weight:700}
.header .badge{background:#21262d;border:1px solid #30363d;border-radius:4px;padding:2px 8px;font-size:11px;color:#8b949e}
.main{padding:20px;max-width:1600px}
.cards{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:14px 18px;min-width:140px}
.card .val{font-size:22px;font-weight:700;color:#e6edf3}
.card .lbl{font-size:11px;color:#8b949e;margin-top:2px}
.card.warn .val{color:#f0883e}
.card.good .val{color:#3fb950}
.tabs{display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid #30363d;padding-bottom:0}
.tab{padding:8px 16px;cursor:pointer;border-radius:6px 6px 0 0;color:#8b949e;border:1px solid transparent;border-bottom:none;margin-bottom:-1px}
.tab:hover{color:#c9d1d9;background:#21262d}
.tab.active{color:#e6edf3;background:#161b22;border-color:#30363d;border-bottom:1px solid #161b22}
.tab-content{display:none}.tab-content.active{display:block}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#21262d;color:#8b949e;padding:6px 10px;text-align:left;cursor:pointer;white-space:nowrap;border:1px solid #30363d;user-select:none}
th:hover{background:#2d333b;color:#e6edf3}
td{padding:5px 10px;border:1px solid #21262d;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis}
tr:hover td{background:#161b22;cursor:pointer}
.zone-pond{color:#68d391}.zone-river{color:#4299e1}.zone-lake{color:#9f7aea}
.zone-bay{color:#f6ad55}.zone-sea{color:#fc8181}.zone-ocean{color:#76e4f7}
input[type=text],select{background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:6px 10px;border-radius:6px;font-size:12px;font-family:inherit}
input[type=text]:focus,select:focus{outline:none;border-color:#58a6ff}
button{background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit}
button:hover{background:#2d333b;border-color:#58a6ff}
.btn-primary{background:#1f6feb;border-color:#1f6feb;color:#fff}
.btn-primary:hover{background:#388bfd}
.btn-danger{background:#da3633;border-color:#da3633;color:#fff}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}
.pagination{display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12px}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:100;overflow-y:auto}
.overlay.open{display:block}
.detail-panel{background:#161b22;border:1px solid #30363d;border-radius:8px;max-width:900px;margin:40px auto;padding:24px}
.detail-panel .close{float:right;cursor:pointer;color:#8b949e;font-size:18px;line-height:1}
.detail-panel .close:hover{color:#e6edf3}
.section-block{background:#21262d;border:1px solid #30363d;border-radius:6px;padding:14px;margin-bottom:12px}
.section-block table td:first-child{color:#8b949e;width:220px;padding-right:16px}
.section-block table td:last-child{color:#e6edf3;font-weight:600}
.milestone-item{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid #30363d;font-size:12px}
.milestone-item .key{color:#58a6ff;min-width:240px}.milestone-item .time{color:#8b949e}
.chart-wrap{background:#21262d;border:1px solid #30363d;border-radius:6px;padding:12px;margin-bottom:12px}
canvas{width:100%!important;height:120px!important}
.warn-badge{background:#f0883e22;color:#f0883e;border:1px solid #f0883e55;border-radius:4px;padding:2px 8px;font-size:11px}
.funnel-bar{background:#1f6feb22;border-left:3px solid #1f6feb;padding:6px 10px;margin:4px 0;display:flex;justify-content:space-between;align-items:center}
.funnel-bar .drop{color:#fc8181;font-size:11px}
.cohort-table .pct{color:#3fb950}
.section-title{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#58a6ff;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #30363d}
</style>
</head>
<body>
<div class="header">
  <h1>Patient Angler Analytics</h1>
  <span class="badge" id="player-count">Loading…</span>
  <span class="badge" id="last-refresh"></span>
  <button onclick="loadAll()" style="margin-left:auto">Refresh</button>
  <a href="/admin/analytics/export.csv" class="btn-primary" style="padding:6px 14px;border-radius:6px;font-size:12px;text-decoration:none">Export CSV</a>
  <form method="POST" action="/admin/logout" style="margin:0"><button type="submit" class="btn-danger" style="padding:6px 14px;font-size:12px">Log Out</button></form>
</div>
<div class="main">
  <div class="cards" id="summary-cards">
    <div class="card"><div class="val" id="s-verified">—</div><div class="lbl">Total Players</div></div>
    <div class="card good"><div class="val" id="s-today">—</div><div class="lbl">Active Today</div></div>
    <div class="card"><div class="val" id="s-7d">—</div><div class="lbl">Active 7d</div></div>
    <div class="card"><div class="val" id="s-30d">—</div><div class="lbl">Active 30d</div></div>
    <div class="card"><div class="val" id="s-new7">—</div><div class="lbl">New 7d</div></div>
    <div class="card"><div class="val" id="s-new30">—</div><div class="lbl">New 30d</div></div>
    <div class="card"><div class="val" id="s-avg-comp">—</div><div class="lbl">Avg Completion</div></div>
    <div class="card"><div class="val" id="s-med-comp">—</div><div class="lbl">Median Completion</div></div>
    <div class="card"><div class="val" id="s-avg-dex">—</div><div class="lbl">Avg Fishdex</div></div>
    <div class="card"><div class="val" id="s-med-dex">—</div><div class="lbl">Median Fishdex</div></div>
    <div class="card"><div class="val" id="s-avg-mastery">—</div><div class="lbl">Avg Mastery</div></div>
    <div class="card"><div class="val" id="s-prestige-pct">—</div><div class="lbl">Prestiged %</div></div>
    <div class="card"><div class="val" id="s-ocean-pct">—</div><div class="lbl">Ocean+ %</div></div>
    <div class="card"><div class="val" id="s-auto-dex">—</div><div class="lbl">Auto Dex 100%</div></div>
    <div class="card"><div class="val" id="s-version">—</div><div class="lbl">Latest Version</div></div>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="switchTab('players')">Players</div>
    <div class="tab" onclick="switchTab('funnel')">Funnel</div>
    <div class="tab" onclick="switchTab('zones')">Zones</div>
    <div class="tab" onclick="switchTab('versions')">Versions</div>
    <div class="tab" onclick="switchTab('cohorts')">Cohorts</div>
    <div class="tab" onclick="switchTab('quality')">Data Quality</div>
    <div class="tab" onclick="switchTab('config')">⚙ Config</div>
  </div>

  <!-- Players Tab -->
  <div class="tab-content active" id="tab-players">
    <div class="filters">
      <input type="text" id="f-search" placeholder="Search Player ID…" oninput="debounceLoad()" style="min-width:220px">
      <select id="f-zone" onchange="loadPlayers()">
        <option value="">All Zones</option>
        <option value="pond">Pond</option><option value="river">River</option>
        <option value="lake">Lake</option><option value="bay">Bay</option>
        <option value="sea">Sea</option><option value="ocean">Ocean</option>
      </select>
      <select id="f-days" onchange="loadPlayers()">
        <option value="0">All time</option><option value="1">Active today</option>
        <option value="7">Active 7d</option><option value="30">Active 30d</option>
      </select>
      <input type="text" id="f-version" placeholder="Version…" oninput="debounceLoad()" style="width:100px">
      <button onclick="clearFilters()">Clear</button>
      <span id="player-count-label" style="color:#8b949e;margin-left:8px"></span>
    </div>
    <div style="overflow-x:auto">
      <table id="player-table">
        <thead>
          <tr>
            <th onclick="sortBy('player_id')">Player ID</th>
            <th onclick="sortBy('last_seen')">Last Seen</th>
            <th onclick="sortBy('days_since_first_play')">Age</th>
            <th onclick="sortBy('total_play_time_seconds')">Play Time</th>
            <th onclick="sortBy('session_count')">Sessions</th>
            <th onclick="sortBy('current_zone')">Zone</th>
            <th onclick="sortBy('highest_zone')">Highest</th>
            <th onclick="sortBy('game_completion_percent')">Complete%</th>
            <th onclick="sortBy('overall_fishdex_percent')">Fishdex%</th>
            <th onclick="sortBy('automation_fishdex_percent')">Auto%</th>
            <th onclick="sortBy('manual_fishdex_percent')">Manual%</th>
            <th onclick="sortBy('mastery_percent')">Mastery%</th>
            <th onclick="sortBy('prestige_count')">Prestige</th>
            <th onclick="sortBy('current_black_pearls')">Pearls</th>
            <th onclick="sortBy('current_diamonds')">Diamonds</th>
            <th onclick="sortBy('estimated_hourly_income')">Income/h</th>
            <th onclick="sortBy('current_fish_rate')">Fish/s</th>
            <th onclick="sortBy('highest_rod')">Rod</th>
            <th onclick="sortBy('grand_competition_titles')">Titles</th>
            <th onclick="sortBy('achievements_completed')">Ach</th>
            <th onclick="sortBy('app_version')">Version</th>
          </tr>
        </thead>
        <tbody id="player-tbody"></tbody>
      </table>
    </div>
    <div class="pagination">
      <button onclick="prevPage()">Prev</button>
      <span id="page-info">—</span>
      <button onclick="nextPage()">Next</button>
      <select id="page-size" onchange="loadPlayers()">
        <option value="25">25</option><option value="50" selected>50</option><option value="100">100</option>
      </select>
      rows/page
    </div>
  </div>

  <!-- Funnel Tab -->
  <div class="tab-content" id="tab-funnel">
    <h2>Progression Funnel</h2>
    <div id="funnel-content">Loading…</div>
  </div>

  <!-- Zones Tab -->
  <div class="tab-content" id="tab-zones">
    <h2>Zone Distribution</h2>
    <div style="overflow-x:auto"><table id="zones-table">
      <thead><tr><th>Zone</th><th>Players</th><th>%</th><th>Median Age (days)</th><th>Median Play (h)</th><th>Median Completion%</th><th>Median Income/h</th></tr></thead>
      <tbody id="zones-tbody"></tbody>
    </table></div>
  </div>

  <!-- Versions Tab -->
  <div class="tab-content" id="tab-versions">
    <h2>Version Comparison</h2>
    <div style="overflow-x:auto"><table id="versions-table">
      <thead><tr><th>Version</th><th>Players</th><th>Active 7d</th><th>Avg Complete%</th><th>Median Complete%</th><th>Avg Prestige</th><th>Prestige Rate</th><th>Fishdex50%</th><th>Avg Sessions</th><th>Median Play</th></tr></thead>
      <tbody id="versions-tbody"></tbody>
    </table></div>
  </div>

  <!-- Cohorts Tab -->
  <div class="tab-content" id="tab-cohorts">
    <h2>Weekly Cohorts <span style="font-size:11px;color:#8b949e">(retention is approximate — based on last_seen vs created_at)</span></h2>
    <div style="overflow-x:auto"><table id="cohorts-table" class="cohort-table">
      <thead><tr><th>Cohort Week</th><th>New Players</th><th>D+1</th><th>D+7</th><th>D+30</th><th>Median Complete%</th><th>Prestige%</th><th>Ocean+%</th></tr></thead>
      <tbody id="cohorts-tbody"></tbody>
    </table></div>
  </div>

  <!-- Data Quality Tab -->
  <div class="tab-content" id="tab-quality">
    <h2>Data Quality Warnings</h2>
    <div id="quality-content">Loading…</div>
  </div>

  <div class="tab-content" id="tab-config">
    <div style="max-width:800px">
      <div id="cfg-status" style="margin-bottom:12px;display:none;padding:8px 12px;border-radius:6px;font-size:12px"></div>

      <!-- General -->
      <div class="section-block">
        <div class="section-title">General</div>
        <table style="width:100%"><tbody>
          <tr><td style="color:#8b949e;width:240px;padding:6px 10px">Fish Sell Multiplier</td>
              <td><input type="number" id="cfg-fishSellMult" step="0.1" min="0.1" style="width:100px"></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">Event Interval Min (min)</td>
              <td><input type="number" id="cfg-eventMin" step="1" min="1" style="width:100px"></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">Event Interval Max (min)</td>
              <td><input type="number" id="cfg-eventMax" step="1" min="1" style="width:100px"></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">Competition Enabled</td>
              <td><input type="checkbox" id="cfg-compEnabled" style="width:16px;height:16px;cursor:pointer"></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">Ghost Ship Enabled</td>
              <td><input type="checkbox" id="cfg-gsEnabled" style="width:16px;height:16px;cursor:pointer"></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">MOTD Text (blank = hidden)</td>
              <td><input type="text" id="cfg-motd" style="width:400px" placeholder="Leave blank for no banner"></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">MOTD Type</td>
              <td><select id="cfg-motdType"><option value="info">info</option><option value="event">event</option><option value="warning">warning</option></select></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">Seagull Bait Base Cost (tier 0)</td>
              <td><input type="number" id="cfg-seagullBase" step="1" min="1" style="width:120px"></td></tr>
          <tr><td style="color:#8b949e;padding:6px 10px">Upgrade Cost Multiplier (per buy)</td>
              <td><input type="number" id="cfg-costScale" step="0.01" min="1.0" max="5.0" style="width:100px" placeholder="default: 1.22"></td></tr>
        </tbody></table>
      </div>

      <!-- Automation -->
      <div class="section-block">
        <div class="section-title">Automation Costs (blank = use code default)</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Unit</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Catches/h</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Default cost</th>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Override cost</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">c/h per 1k¢ (default)</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">c/h per 1k¢ (override)</th>
          </tr></thead>
          <tbody id="cfg-auto-rows"></tbody>
        </table>
      </div>

      <!-- Storage -->
      <div class="section-block">
        <div class="section-title">Storage Costs (blank = use code default)</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Item</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Slots</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Default cost</th>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Override cost</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Slots/1k¢ (default)</th>
            <th style="text-align:right;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Slots/1k¢ (override)</th>
          </tr></thead>
          <tbody id="cfg-storage-rows"></tbody>
        </table>
      </div>

      <!-- Rod purchase costs -->
      <div class="section-block">
        <div class="section-title">Rod Purchase Costs (blank = use code default)</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none;width:220px">Rod</th>
            <th style="text-align:left;padding:5px 4px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Default</th>
            <th style="text-align:left;padding:5px 8px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Override</th>
          </tr></thead>
          <tbody id="cfg-rod-rows"></tbody>
        </table>
      </div>

      <!-- Rod tier costs (formula-based: basic/river/lake/bay) -->
      <div class="section-block">
        <div class="section-title">Rod Tier Upgrade Base Costs — Formula rods (blank = use code default)</div>
        <div style="color:#8b949e;font-size:11px;margin-bottom:6px">Cost = baseTierCost × 10^tier. Only applies to Basic/River/Lake/Bay rods.</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none;width:220px">Rod</th>
            <th style="text-align:left;padding:5px 4px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Default</th>
            <th style="text-align:left;padding:5px 8px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Override</th>
          </tr></thead>
          <tbody id="cfg-rodtier-rows"></tbody>
        </table>
      </div>

      <!-- Rod tier costs (fixed arrays: sea/ocean/carbon/mythic/abyss) -->
      <div class="section-block">
        <div class="section-title">Rod Tier Upgrade Fixed Costs — Sea+ rods (blank = use code default)</div>
        <div style="color:#8b949e;font-size:11px;margin-bottom:6px">These rods have fixed costs per tier. Tier 1 / Tier 2 / Tier 3 listed left to right.</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none;width:140px">Rod</th>
            <th style="text-align:center;padding:5px 4px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none" colspan="2">Tier 1</th>
            <th style="text-align:center;padding:5px 4px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none" colspan="2">Tier 2</th>
            <th style="text-align:center;padding:5px 4px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none" colspan="2">Tier 3</th>
          </tr></thead>
          <tbody id="cfg-rodfixed-rows"></tbody>
        </table>
      </div>

      <!-- Bobber costs -->
      <div class="section-block">
        <div class="section-title">Bobber Upgrade Costs (blank = use code default)</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="text-align:left;padding:5px 10px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none;width:220px">Bobber</th>
            <th style="text-align:left;padding:5px 4px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Default</th>
            <th style="text-align:left;padding:5px 8px;color:#58a6ff;font-size:11px;font-weight:600;border-bottom:1px solid #30363d;background:none">Override</th>
          </tr></thead>
          <tbody id="cfg-bobber-rows"></tbody>
        </table>
      </div>

      <button class="btn-primary" onclick="saveConfig()" style="margin-top:4px;padding:10px 28px;font-size:13px">Save Config</button>
      <button onclick="loadConfig()" style="margin-top:4px;margin-left:8px;padding:10px 18px;font-size:13px">Reload</button>
    </div>
  </div>
</div>

<!-- Player Detail Overlay -->
<div class="overlay" id="detail-overlay" onclick="if(event.target===this)closeDetail()">
  <div class="detail-panel">
    <span class="close" onclick="closeDetail()">×</span>
    <h2 id="detail-title">Player Detail</h2>
    <div id="detail-body"></div>
  </div>
</div>

<script>
const API = (path) => \`/admin/analytics/api/\${path}\`;

let _sortCol = 'last_seen', _sortDir = 'desc', _page = 1;
let _debounceT = null;
const H = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const n1 = (v) => isNaN(v)||v===null?'—':Number(v).toFixed(1);
const fmtSecs = (s) => { s=Number(s)||0; if(!s) return '—'; const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60); return d>0?\`\${d}d \${h}h\`:h>0?\`\${h}h \${m}m\`:\`\${m}m\`; };
const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';
const fmtNum = (n) => n===null||n===undefined?'—':Number(n).toLocaleString();
const zoneClass = (z) => z?'zone-'+z:'';

async function apiGet(path) {
  const r = await fetch('/admin/analytics/api/' + path, {credentials:'include'});
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

async function loadSummary() {
  try {
    const d = await apiGet('summary');
    document.getElementById('s-verified').textContent = d.totalPlayersVerified;
    document.getElementById('s-today').textContent = d.activeToday;
    document.getElementById('s-7d').textContent = d.activeLast7;
    document.getElementById('s-30d').textContent = d.activeLast30;
    document.getElementById('s-new7').textContent = d.newLast7;
    document.getElementById('s-new30').textContent = d.newLast30;
    document.getElementById('s-avg-comp').textContent = (d.avgCompletion||'0')+'%';
    document.getElementById('s-med-comp').textContent = (d.medianCompletion||'0')+'%';
    document.getElementById('s-avg-dex').textContent = (d.avgFishdex||'0')+'%';
    document.getElementById('s-med-dex').textContent = (d.medianFishdex||'0')+'%';
    document.getElementById('s-avg-mastery').textContent = (d.avgMastery||'0')+'%';
    document.getElementById('s-prestige-pct').textContent = (d.prestigePercent||'0')+'%';
    document.getElementById('s-ocean-pct').textContent = (d.oceanPercent||'0')+'%';
    document.getElementById('s-auto-dex').textContent = (d.autoDexCompletePercent||'0')+'%';
    document.getElementById('s-version').textContent = d.latestVersion||'—';
    document.getElementById('player-count').textContent = d.totalPlayersVerified + ' players';
    document.getElementById('last-refresh').textContent = 'Refreshed ' + new Date().toLocaleTimeString();
  } catch(e) { console.warn('Summary load failed', e); }
}

async function loadPlayers() {
  const search  = document.getElementById('f-search').value;
  const zone    = document.getElementById('f-zone').value;
  const days    = document.getElementById('f-days').value;
  const version = document.getElementById('f-version').value;
  const limit   = document.getElementById('page-size').value;
  const params  = new URLSearchParams({ search, zone, days, version, sort:_sortCol, dir:_sortDir, page:_page, limit });
  try {
    const d = await apiGet('players?' + params);
    document.getElementById('player-count-label').textContent = d.total + ' players';
    document.getElementById('page-info').textContent = \`Page \${_page} of \${Math.ceil(d.total/limit)||1}\`;
    const tbody = document.getElementById('player-tbody');
    tbody.innerHTML = (d.rows||[]).map(r => \`<tr onclick="openDetail('\${H(r.player_id)}')">
      <td title="\${H(r.player_id)}">\${H((r.player_id||'').slice(0,16))}…</td>
      <td>\${fmtDate(r.last_seen)}</td>
      <td>\${r.days_since_first_play!=null?r.days_since_first_play+'d':'—'}</td>
      <td>\${fmtSecs(r.total_play_time_seconds)}</td>
      <td>\${fmtNum(r.session_count)}</td>
      <td class="\${zoneClass(r.current_zone)}">\${H(r.current_zone||'—')}</td>
      <td class="\${zoneClass(r.highest_zone)}">\${H(r.highest_zone||'—')}</td>
      <td>\${n1(r.game_completion_percent)}%</td>
      <td>\${n1(r.overall_fishdex_percent)}%</td>
      <td>\${n1(r.automation_fishdex_percent)}%</td>
      <td>\${n1(r.manual_fishdex_percent)}%</td>
      <td>\${n1(r.mastery_percent)}%</td>
      <td>\${fmtNum(r.prestige_count)}</td>
      <td>\${fmtNum(r.current_black_pearls)}</td>
      <td>\${fmtNum(r.current_diamonds)}</td>
      <td>\${fmtNum(r.estimated_hourly_income)}</td>
      <td>\${n1(r.current_fish_rate)}</td>
      <td>\${H(r.highest_rod||'—')}</td>
      <td>\${fmtNum(r.grand_competition_titles)}</td>
      <td>\${fmtNum(r.achievements_completed)}</td>
      <td>\${H(r.app_version||'—')}</td>
    </tr>\`).join('');
  } catch(e) { console.warn('Players load failed', e); }
}

async function loadFunnel() {
  try {
    const d = await apiGet('funnel');
    const el = document.getElementById('funnel-content');
    let prev = d.total;
    el.innerHTML = d.funnel.map(f => {
      const pct = Number(f.pctOfTotal||0);
      const w = Math.max(10,Math.round(pct));
      return \`<div style="margin-bottom:6px">
        <div style="font-size:11px;color:#8b949e;margin-bottom:2px">\${H(f.key)}</div>
        <div class="funnel-bar" style="width:\${w}%">
          <span style="color:#e6edf3">\${fmtNum(f.reached)} players</span>
          <span>\${H(f.pctOfTotal)}% total &nbsp;<span class="drop">\${H(f.pctFromPrev)}% ret.</span>&nbsp; \${H(f.medianPlayTime)}</span>
        </div>
      </div>\`;
    }).join('');
  } catch(e) { document.getElementById('funnel-content').textContent = 'Load failed'; }
}

async function loadZones() {
  try {
    const rows = await apiGet('zones');
    document.getElementById('zones-tbody').innerHTML = rows.map(r => \`<tr>
      <td class="\${zoneClass(r.zone)}">\${H(r.zone)}</td>
      <td>\${fmtNum(r.players)}</td>
      <td>\${n1(r.pct)}%</td>
      <td>\${r.median_age_days!=null?Number(r.median_age_days).toFixed(0):'—'}</td>
      <td>\${r.median_secs!=null?n1(Number(r.median_secs)/3600):'—'}</td>
      <td>\${n1(r.median_completion)}%</td>
      <td>\${fmtNum(Math.round(r.median_income||0))}</td>
    </tr>\`).join('');
  } catch(e) { console.warn('Zones failed', e); }
}

async function loadVersions() {
  try {
    const rows = await apiGet('versions');
    document.getElementById('versions-tbody').innerHTML = rows.map(r => \`<tr>
      <td>\${H(r.app_version)}</td><td>\${fmtNum(r.players)}</td>
      <td>\${fmtNum(r.active7)}</td>
      <td>\${n1(r.avg_completion)}%</td><td>\${n1(r.median_completion)}%</td>
      <td>\${n1(r.avg_prestige)}</td>
      <td>\${n1(r.prestige_rate)}%</td><td>\${n1(r.fishdex50_rate)}%</td>
      <td>\${n1(r.avg_sessions)}</td>
      <td>\${fmtSecs(r.median_playtime)}</td>
    </tr>\`).join('');
  } catch(e) { console.warn('Versions failed', e); }
}

async function loadCohorts() {
  try {
    const rows = await apiGet('cohorts');
    document.getElementById('cohorts-tbody').innerHTML = rows.map(r => {
      const pct = (n,tot) => tot>0?(Number(n)*100/Number(tot)).toFixed(0)+'%':'—';
      return \`<tr>
        <td>\${H(r.cohort_week)}</td><td>\${fmtNum(r.new_players)}</td>
        <td class="pct">\${pct(r.active_day1,r.new_players)}</td>
        <td class="pct">\${pct(r.active_day7,r.new_players)}</td>
        <td class="pct">\${pct(r.active_day30,r.new_players)}</td>
        <td>\${n1(r.median_completion)}%</td>
        <td class="pct">\${n1(r.prestige_rate)}%</td>
        <td class="pct">\${n1(r.ocean_rate)}%</td>
      </tr>\`;
    }).join('');
  } catch(e) { console.warn('Cohorts failed', e); }
}

async function loadQuality() {
  try {
    const rows = await apiGet('quality');
    if (!rows.length) { document.getElementById('quality-content').innerHTML = '<span style="color:#3fb950">No issues found</span>'; return; }
    const issues = rows.map(r => {
      const flags = Object.entries(r).filter(([k,v]) => k!=='player_id'&&v).map(([k,v]) => \`<span class="warn-badge">\${H(k)}</span>\`).join(' ');
      return \`<div style="padding:6px 0;border-bottom:1px solid #30363d;display:flex;gap:12px;align-items:center">
        <span style="color:#8b949e;min-width:200px;font-size:11px">\${H((r.player_id||'').slice(0,20))}…</span>
        \${flags}
      </div>\`;
    }).join('');
    document.getElementById('quality-content').innerHTML = \`<div>\${fmtNum(rows.length)} rows with issues</div>\${issues}\`;
  } catch(e) { document.getElementById('quality-content').textContent = 'Load failed'; }
}

async function openDetail(playerId) {
  document.getElementById('detail-overlay').classList.add('open');
  document.getElementById('detail-title').textContent = 'Player: ' + playerId.slice(0,20) + '…';
  document.getElementById('detail-body').innerHTML = 'Loading…';
  try {
    const d = await apiGet('player/' + encodeURIComponent(playerId));
    const p = d.progress;
    const dur = d.durations;
    const pairs = (obj) => Object.entries(obj).map(([k,v]) => \`<tr><td>\${H(k)}</td><td>\${H(String(v!=null?v:'—'))}</td></tr>\`).join('');
    const section = (title, rows) => \`<div class="section-block"><div class="section-title">\${H(title)}</div><table>\${pairs(rows)}</table></div>\`;
    const milestoneHtml = (d.milestones||[]).map(m => \`<div class="milestone-item"><span class="key">\${H(m.milestone_key)}</span><span class="time">\${fmtDate(m.reached_at)} &nbsp; \${fmtSecs(m.play_time_seconds_at_reach)}</span><span style="color:#8b949e">\${H(m.app_version_at_reach||'')}</span></div>\`).join('');
    document.getElementById('detail-body').innerHTML = [
      section('Identity & Activity', {
        'Player ID': p.player_id, 'Created': fmtDate(p.created_at), 'Last Seen': fmtDate(p.last_seen),
        'Days Since First Play': p.days_since_first_play, 'Total Play Time': fmtSecs(p.total_play_time_seconds),
        'Sessions': p.session_count, 'Last Session': fmtSecs(p.last_session_duration_seconds),
        'Platform': p.platform, 'App Version': p.app_version, 'Build': p.build_number,
        'First Install Version': p.first_install_version,
      }),
      section('Progression', {
        'Current Zone': p.current_zone, 'Highest Zone': p.highest_zone,
        'Prestige Count': p.prestige_count, 'Last Prestige': fmtDate(p.last_prestige_at),
        'Current Rod': p.current_rod, 'Rod Tier': p.current_rod_tier,
        'Highest Rod': p.highest_rod, 'Highest Rod Tier': p.highest_rod_tier,
      }),
      section('Progression Milestones', {
        'To River': dur.toRiver, 'To Lake': dur.toLake, 'To Bay': dur.toBay,
        'To Sea': dur.toSea, 'To Ocean': dur.toOcean, 'To First Prestige': dur.toFirstPrestige,
        'To Fishdex 25%': dur.toFishdex25, 'To Fishdex 50%': dur.toFishdex50,
        'To Fishdex 75%': dur.toFishdex75, 'To Fishdex 100%': dur.toFishdex100,
        'To First Grand Title': dur.toFirstGrandTitle,
      }),
      section('Fishdex', {
        'Overall Found/Total': (p.overall_fishdex_found||0)+'/'+(p.overall_fishdex_total||0),
        'Overall %': n1(p.overall_fishdex_percent)+'%',
        'Automation Found/Total': (p.automation_fishdex_found||0)+'/'+(p.automation_fishdex_total||0),
        'Automation %': n1(p.automation_fishdex_percent)+'%',
        'Manual Found/Total': (p.manual_fishdex_found||0)+'/'+(p.manual_fishdex_total||0),
        'Manual %': n1(p.manual_fishdex_percent)+'%',
      }),
      section('Mastery', {
        'Points': (p.mastery_points||0)+'/'+(p.mastery_max_points||0),
        'Mastery %': n1(p.mastery_percent)+'%',
        'Targeted Lure Level': p.targeted_lure_level, 'Active Targets': p.targeted_lure_active_targets,
      }),
      section('Economy', {
        'Current Coins': fmtNum(p.current_coins), 'Lifetime Earned': fmtNum(p.lifetime_coins_earned),
        'Lifetime Spent': fmtNum(p.lifetime_coins_spent), 'Highest Balance': fmtNum(p.highest_coin_balance),
        'Est. Hourly Income': fmtNum(p.estimated_hourly_income), 'Fish/s': n1(p.current_fish_rate),
      }),
      section('Prestige & Pearls', {
        'Current Pearls': p.current_black_pearls, 'Lifetime Earned': p.lifetime_black_pearls_earned,
        'Pearls Spent': p.black_pearls_spent, 'Current Diamonds': p.current_diamonds,
        'Highest Diamonds': p.highest_diamonds_held,
      }),
      section('Competitions', {
        'Wins': p.competition_wins, '1st Place': p.first_place_finishes,
        'Grand Titles': p.grand_competition_titles, 'Series Completed': p.competition_series_completed,
      }),
      section('Achievements', {
        'Completed': (p.achievements_completed||0)+'/'+(p.achievements_total||0),
        'Hidden Completed': p.hidden_achievements_completed,
        'Daily Completed': p.daily_quests_completed, 'Weekly Completed': p.weekly_quests_completed,
      }),
      section('Fishing Records', {
        'Trophy Caught': p.trophy_fish_caught,
        'Largest Fish': (p.largest_fish_name||'—') + (p.largest_fish_weight_grams ? ' ('+fmtNum(p.largest_fish_weight_grams)+'g)' : ''),
        'Most Valuable Sale': fmtNum(p.most_valuable_catch) + (p.most_valuable_catch_name ? ' ('+p.most_valuable_catch_name+')' : ''),
        'Offline Hours Claimed': n1(p.offline_hours_claimed_total),
        'Seagulls Clicked': p.seagulls_clicked, 'Events Claimed': p.special_events_claimed,
      }),
      '<div class="section-block"><div class="section-title">Milestone Timeline</div>' +
        (milestoneHtml || '<span style="color:#8b949e">No milestones yet</span>') + '</div>',
    ].join('');

    // Simple chart for daily completion (SVG sparkline)
    const daily = d.daily || [];
    if (daily.length > 1) {
      const vals = daily.map(r => Number(r.game_completion_percent)||0);
      const max = Math.max(...vals, 1), w = 600, h = 80;
      const pts = vals.map((v,i) => \`\${Math.round(i*(w-1)/(vals.length-1))},\${Math.round(h - v/max*h)}\`).join(' ');
      document.getElementById('detail-body').innerHTML += \`<div class="chart-wrap"><div class="section-title">Daily Game Completion %</div>
        <svg viewBox="0 0 \${w} \${h}" width="100%" style="overflow:visible">
          <polyline points="\${pts}" fill="none" stroke="#1f6feb" stroke-width="2"/>
        </svg></div>\`;
    }
  } catch(e) {
    document.getElementById('detail-body').innerHTML = '<span style="color:#fc8181">Load failed: '+H(String(e))+'</span>';
  }
}

function closeDetail() { document.getElementById('detail-overlay').classList.remove('open'); }

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t,i) => {
    const tabs = ['players','funnel','zones','versions','cohorts','quality','config'];
    t.classList.toggle('active', tabs[i] === name);
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-'+name));
  if (name === 'funnel')   loadFunnel();
  if (name === 'zones')    loadZones();
  if (name === 'versions') loadVersions();
  if (name === 'cohorts')  loadCohorts();
  if (name === 'quality')  loadQuality();
  if (name === 'config')   loadConfig();
}

// ── Config Tab ────────────────────────────────────────────────────────────────
const CFG_AUTO = [
  {id:'fishing_net',    label:'Fishing Net',         def:100,         rate:60  },
  {id:'reinforced_net', label:'Reinforced Net',       def:3000,        rate:45  },
  {id:'river_net',      label:'River Net',            def:15000,       rate:30  },
  {id:'local_fisher',   label:'Local Fisher',         def:3000,        rate:30  },
  {id:'skilled_fisher', label:'Skilled Fisher',       def:30000,       rate:15  },
  {id:'veteran_fisher', label:'Veteran Fisher',       def:300000,      rate:8   },
  {id:'row_boat',       label:'Row Boat',             def:350000,      rate:8   },
  {id:'motor_boat',     label:'Motor Boat',           def:1200000,     rate:3   },
  {id:'fishing_boat',   label:'Fishing Boat',         def:4000000,     rate:1.5 },
  {id:'small_fleet',    label:'Small Fleet',          def:125000000,   rate:0.5 },
  {id:'large_fleet',    label:'Large Fleet',          def:500000000,   rate:0.25},
  {id:'deep_sea_fleet', label:'Deep Sea Fleet',       def:2500000000,  rate:0.1 },
];
const CFG_STORAGE = [
  {id:'bucket',      label:'Bucket',               def:50,        cap:5    },
  {id:'icebox',      label:'Ice Box',              def:200,       cap:20   },
  {id:'coolerbox',   label:'Cooler Box',           def:600,       cap:50   },
  {id:'fridge',      label:'Portable Fridge',      def:2000,      cap:150  },
  {id:'chest',       label:'Chest',                def:10000,     cap:500  },
  {id:'large_chest', label:'Large Chest',          def:40000,     cap:2000 },
  {id:'freezer',     label:'Freezer',              def:250000,    cap:8000 },
  {id:'walkinfreezer',label:'Walk-in Freezer',     def:50000000,  cap:2000 },
  {id:'harborcs',    label:'Harbor Cold Storage',  def:250000000, cap:10000},
];
const CFG_RODS = [
  {id:'basic_rod',label:'Basic Rod',def:0},{id:'river_rod',label:'River Rod',def:9000},
  {id:'lake_rod',label:'Lake Rod',def:90000},{id:'bay_rod',label:'Bay Rod',def:900000},
  {id:'sea_rod',label:'Sea Rod',def:625000000},{id:'ocean_rod',label:'Ocean Rod',def:62500000000},
];
const CFG_RODTIER = [
  {id:'basic_rod',label:'Basic Rod',def:1000},{id:'river_rod',label:'River Rod',def:5000},
  {id:'lake_rod',label:'Lake Rod',def:25000},{id:'bay_rod',label:'Bay Rod',def:100000},
];
const CFG_RODTIER_FIXED = [
  {id:'sea_rod',    label:'Sea Rod',    def:[1250000000,     12500000000,      125000000000     ]},
  {id:'ocean_rod',  label:'Ocean Rod',  def:[125000000000,   1250000000000,    12500000000000   ]},
  {id:'carbon_rod', label:'Carbon Rod', def:[20000000000000, 200000000000000,  2000000000000000 ]},
  {id:'mythic_rod', label:'Mythic Rod', def:[20000000000000, 200000000000000,  2000000000000000 ]},
  {id:'abyss_rod',  label:'Abyss Rod',  def:[20000000000000, 200000000000000,  2000000000000000 ]},
];
const CFG_BOBBERS = [
  {id:'basic_bobber',label:'Basic Bobber',def:800},{id:'sensitive_bobber',label:'Sensitive Bobber',def:1200},
  {id:'heavy_bobber',label:'Heavy Bobber',def:2000},{id:'electronic_bobber',label:'Electronic Bobber',def:5000},
];

const _fmtN = n => n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(Math.round(n));
const _inpStyle = 'width:130px;background:#161b22;border:1px solid #30363d;color:#c9d1d9;padding:4px 8px;border-radius:4px;font-size:12px;font-family:inherit';
const _tdR = s => \`<td style="text-align:right;padding:5px 10px;color:#e6edf3">\${s}</td>\`;
const _tdG = (id,s) => \`<td style="text-align:right;padding:5px 10px;color:#3fb950;font-weight:600" id="\${id}">\${s}</td>\`;

function _autoEff(catchesH, cost) {
  if (!cost || cost <= 0) return '—';
  return (catchesH / cost * 1000).toFixed(2);
}

function _cfgAutoRows(overrides) {
  const tb = document.getElementById('cfg-auto-rows');
  if (!tb) return;
  tb.innerHTML = CFG_AUTO.map(it => {
    const catchH = Math.round(3600 / it.rate);
    const defEff = _autoEff(catchH, it.def);
    const ovVal  = overrides && overrides[it.id] != null ? overrides[it.id] : '';
    const ovEff  = ovVal !== '' ? _autoEff(catchH, Number(ovVal)) : '—';
    return \`<tr>
      <td style="padding:5px 10px;color:#c9d1d9">\${it.label}</td>
      \${_tdR(catchH + '/h')}
      \${_tdR(_fmtN(it.def) + '¢')}
      <td style="padding:5px 8px"><input type="number" id="auto-\${it.id}" value="\${ovVal}" placeholder="\${_fmtN(it.def)}" step="1" min="0" style="\${_inpStyle}" oninput="_updateAutoEff('\${it.id}',\${catchH})"></td>
      \${_tdR(defEff)}
      \${_tdG('auto-eff-\${it.id}', ovEff)}
    </tr>\`;
  }).join('');
}

function _updateAutoEff(id, catchH) {
  const el  = document.getElementById(\`auto-\${id}\`);
  const out = document.getElementById(\`auto-eff-\${id}\`);
  if (!el || !out) return;
  const v = el.value.trim();
  out.textContent = v !== '' && Number(v) > 0 ? _autoEff(catchH, Number(v)) : '—';
}

function _cfgStorageRows(overrides) {
  const tb = document.getElementById('cfg-storage-rows');
  if (!tb) return;
  tb.innerHTML = CFG_STORAGE.map(it => {
    const defEff = it.def > 0 ? (it.cap / it.def * 1000).toFixed(3) : '—';
    const ovVal  = overrides && overrides[it.id] != null ? overrides[it.id] : '';
    const ovEff  = ovVal !== '' && Number(ovVal) > 0 ? (it.cap / Number(ovVal) * 1000).toFixed(3) : '—';
    return \`<tr>
      <td style="padding:5px 10px;color:#c9d1d9">\${it.label}</td>
      \${_tdR(it.cap.toLocaleString())}
      \${_tdR(_fmtN(it.def) + '¢')}
      <td style="padding:5px 8px"><input type="number" id="sto-\${it.id}" value="\${ovVal}" placeholder="\${_fmtN(it.def)}" step="1" min="0" style="\${_inpStyle}" oninput="_updateStoEff('\${it.id}',\${it.cap})"></td>
      \${_tdR(defEff)}
      \${_tdG('sto-eff-\${it.id}', ovEff)}
    </tr>\`;
  }).join('');
}

function _updateStoEff(id, cap) {
  const el  = document.getElementById(\`sto-\${id}\`);
  const out = document.getElementById(\`sto-eff-\${id}\`);
  if (!el || !out) return;
  const v = el.value.trim();
  out.textContent = v !== '' && Number(v) > 0 ? (cap / Number(v) * 1000).toFixed(3) : '—';
}

function _cfgRows(tbodyId, items, prefix) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  tb.innerHTML = items.map(it => \`<tr>
    <td style="color:#8b949e;width:220px;padding:5px 10px">\${it.label}</td>
    <td style="color:#555;font-size:11px;padding:5px 4px;white-space:nowrap">\${_fmtN(it.def)}</td>
    <td style="padding:5px 8px"><input type="number" id="\${prefix}-\${it.id}" placeholder="override…" step="1" min="0" style="\${_inpStyle}"></td>
  </tr>\`).join('');
}

function _cfgReadOverrides(items, prefix) {
  const out = {};
  items.forEach(it => {
    const el = document.getElementById(\`\${prefix}-\${it.id}\`);
    const v = el && el.value.trim();
    if (v !== '' && v !== null && !isNaN(Number(v))) out[it.id] = Number(v);
  });
  return out;
}

function _cfgFillOverrides(items, prefix, overrides) {
  items.forEach(it => {
    const el = document.getElementById(\`\${prefix}-\${it.id}\`);
    if (!el) return;
    el.value = (overrides && overrides[it.id] != null) ? overrides[it.id] : '';
  });
}

function _cfgFixedTierRows(tbodyId, items, overrides) {
  const tb = document.getElementById(tbodyId);
  if (!tb) return;
  tb.innerHTML = items.map(it => {
    const cols = it.def.map((d, i) => {
      const rodOv = overrides && overrides[it.id];
      const ovVal = (rodOv && rodOv[i] != null) ? rodOv[i] : '';
      return \`<td style="padding:5px 4px;color:#555;font-size:11px;white-space:nowrap">\${_fmtN(d)}</td>
              <td style="padding:5px 6px"><input type="number" id="rdf-\${it.id}-\${i}" value="\${ovVal}" placeholder="override…" step="1" min="0" style="\${_inpStyle}"></td>\`;
    }).join('');
    return \`<tr><td style="color:#8b949e;width:140px;padding:5px 10px">\${it.label}</td>\${cols}</tr>\`;
  }).join('');
}

function _cfgReadFixedTierOverrides(items) {
  const out = {};
  items.forEach(it => {
    const vals = it.def.map((_, i) => {
      const el = document.getElementById(\`rdf-\${it.id}-\${i}\`);
      const v = el && el.value.trim();
      return (v !== '' && !isNaN(Number(v))) ? Number(v) : null;
    });
    if (vals.some(v => v !== null)) out[it.id] = vals;
  });
  return out;
}

function _cfgFillFixedTierOverrides(items, overrides) {
  items.forEach(it => {
    const rodOv = overrides && overrides[it.id];
    it.def.forEach((_, i) => {
      const el = document.getElementById(\`rdf-\${it.id}-\${i}\`);
      if (el) el.value = (rodOv && rodOv[i] != null) ? rodOv[i] : '';
    });
  });
}

function _cfgStatus(msg, ok) {
  const el = document.getElementById('cfg-status');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = ok ? '#1a3a1a' : '#3a1a1a';
  el.style.color = ok ? '#3fb950' : '#fc8181';
  el.style.border = \`1px solid \${ok ? '#3fb950' : '#fc8181'}\`;
}

async function loadConfig() {
  // Render skeleton rows first (empty overrides), then fill after fetch
  _cfgAutoRows({});
  _cfgStorageRows({});
  _cfgRows('cfg-rod-rows',     CFG_RODS,    'rod');
  _cfgRows('cfg-rodtier-rows',  CFG_RODTIER,       'rdt');
  _cfgFixedTierRows('cfg-rodfixed-rows', CFG_RODTIER_FIXED, {});
  _cfgRows('cfg-bobber-rows',  CFG_BOBBERS, 'bob');
  try {
    const res = await fetch('/pa/config', {cache:'no-store'});
    const cfg = await res.json();
    document.getElementById('cfg-fishSellMult').value  = cfg.fishSellMult ?? 1.0;
    document.getElementById('cfg-eventMin').value      = cfg.specialEventIntervalMin ?? 15;
    document.getElementById('cfg-eventMax').value      = cfg.specialEventIntervalMax ?? 30;
    document.getElementById('cfg-compEnabled').checked = cfg.competitionEnabled !== false;
    document.getElementById('cfg-gsEnabled').checked   = cfg.ghostShipEnabled   !== false;
    document.getElementById('cfg-motd').value          = cfg.motd || '';
    document.getElementById('cfg-motdType').value      = cfg.motdType || 'info';
    document.getElementById('cfg-seagullBase').value   = cfg.seagullBaitBaseCost ?? 10000;
    document.getElementById('cfg-costScale').value     = cfg.costScaleMult ?? 1.22;
    // Re-render efficiency tables with loaded overrides
    _cfgAutoRows(cfg.autoCostOverrides);
    _cfgStorageRows(cfg.storageCostOverrides);
    _cfgFillOverrides(CFG_RODS,    'rod', cfg.rodCostOverrides);
    _cfgFillOverrides(CFG_RODTIER, 'rdt', cfg.rodTierCostOverrides);
    _cfgFixedTierRows('cfg-rodfixed-rows', CFG_RODTIER_FIXED, cfg.rodTierCostsOverrides || {});
    _cfgFillOverrides(CFG_BOBBERS, 'bob', cfg.bobberCostOverrides);
    _cfgStatus('Config loaded.', true);
    setTimeout(() => { const e=document.getElementById('cfg-status'); if(e) e.style.display='none'; }, 2000);
  } catch(e) { _cfgStatus('Failed to load config: ' + e.message, false); }
}

async function saveConfig() {
  const motdVal = document.getElementById('cfg-motd').value.trim();
  const body = {
    fishSellMult:              parseFloat(document.getElementById('cfg-fishSellMult').value) || 1.0,
    specialEventIntervalMin:   parseInt(document.getElementById('cfg-eventMin').value)  || 15,
    specialEventIntervalMax:   parseInt(document.getElementById('cfg-eventMax').value)  || 30,
    competitionEnabled:        document.getElementById('cfg-compEnabled').checked,
    ghostShipEnabled:          document.getElementById('cfg-gsEnabled').checked,
    motd:                      motdVal || null,
    motdType:                  document.getElementById('cfg-motdType').value,
    seagullBaitBaseCost:       parseInt(document.getElementById('cfg-seagullBase').value) || 10000,
    costScaleMult:             parseFloat(document.getElementById('cfg-costScale').value) || 1.22,
    autoCostOverrides:         _cfgReadOverrides(CFG_AUTO,    'auto'),
    storageCostOverrides:      _cfgReadOverrides(CFG_STORAGE, 'sto'),
    rodCostOverrides:          _cfgReadOverrides(CFG_RODS,    'rod'),
    rodTierCostOverrides:      _cfgReadOverrides(CFG_RODTIER, 'rdt'),
    rodTierCostsOverrides:     _cfgReadFixedTierOverrides(CFG_RODTIER_FIXED),
    bobberCostOverrides:       _cfgReadOverrides(CFG_BOBBERS, 'bob'),
  };
  try {
    const res = await fetch('/admin/pa/config', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _cfgStatus('✓ Config saved! Players will see new prices on next app launch.', true);
  } catch(e) { _cfgStatus('Save failed: ' + e.message, false); }
}

function sortBy(col) { _sortDir = _sortCol===col&&_sortDir==='desc'?'asc':'desc'; _sortCol = col; _page=1; loadPlayers(); }
function prevPage()  { if(_page>1){_page--;loadPlayers();} }
function nextPage()  { _page++;loadPlayers(); }
function clearFilters() { document.getElementById('f-search').value='';document.getElementById('f-zone').value='';document.getElementById('f-days').value='0';document.getElementById('f-version').value='';_page=1;loadPlayers(); }
function debounceLoad() { clearTimeout(_debounceT); _debounceT=setTimeout(()=>{_page=1;loadPlayers();},400); }
function loadAll() { loadSummary(); loadPlayers(); }

loadAll();
</script>
</body>
</html>`);
}
