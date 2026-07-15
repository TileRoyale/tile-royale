import { Pool } from "pg";

// ─── Connection ────────────────────────────────────────────────────────────────
// DATABASE_URL is set as a Railway environment variable.
// If not set, the server runs without DB (stats are not persisted).

let pool: Pool | null = null;
let dbAvailable = false;
let dbError: string | null = null;
let dbUrlDetected = false;

export async function initDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  dbUrlDetected = !!url;

  console.log("[DB] DATABASE_URL detected:", dbUrlDetected ? "YES" : "NO");

  if (!url) {
    console.warn("[DB] Waiting for DATABASE_URL — add a PostgreSQL database in Railway dashboard");
    dbError = "DATABASE_URL not set";
    return;
  }

  // Log host only (never the password)
  try {
    const parsed = new URL(url);
    console.log(`[DB] Connecting to host: ${parsed.hostname}:${parsed.port || 5432}`);
  } catch {
    console.log("[DB] Connecting (URL parse failed — malformed?)");
  }

  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // required on Railway
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
    const result = await pool.query("SELECT version()");
    dbAvailable = true;
    dbError = null;
    console.log("[DB] ✅ Connected:", result.rows[0]?.version?.split(" ").slice(0,2).join(" ") || "PostgreSQL");
    await createTables();
    await migratePlayerTags();
  } catch (err: any) {
    dbAvailable = false;
    dbError = err?.message || String(err);
    console.error("[DB] ❌ Connection failed:", dbError);
    pool = null;
  }
}

export function isDbAvailable(): boolean {
  return dbAvailable;
}

export function getDbStatus(): { available: boolean; urlDetected: boolean; error: string | null } {
  return { available: dbAvailable, urlDetected: dbUrlDetected, error: dbError };
}

// Safe query wrapper — returns null if DB unavailable rather than throwing
export async function query(sql: string, params?: any[]): Promise<any[] | null> {
  if (!pool || !dbAvailable) return null;
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (err) {
    console.error("[DB] Query error:", err);
    return null;
  }
}

// ─── Schema ────────────────────────────────────────────────────────────────────

async function createTables(): Promise<void> {
  await pool!.query(`
    CREATE TABLE IF NOT EXISTS players (
      id            BIGSERIAL    PRIMARY KEY,
      player_id     UUID         UNIQUE NOT NULL,
      player_name   TEXT         NOT NULL,
      avatar        TEXT         NOT NULL DEFAULT '🔥',
      created_at    TIMESTAMPTZ  DEFAULT now(),
      last_seen_at  TIMESTAMPTZ  DEFAULT now(),
      mmr           REAL         DEFAULT 1000,
      peak_mmr      REAL         DEFAULT 1000
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id               BIGSERIAL    PRIMARY KEY,
      player_id        UUID         NOT NULL REFERENCES players(player_id),
      placement        INTEGER      NOT NULL,
      total_players    INTEGER      NOT NULL,
      mode             TEXT         NOT NULL DEFAULT 'rush',
      played_at        TIMESTAMPTZ  DEFAULT now(),
      tiles_tapped     INTEGER      DEFAULT 0,
      avg_reaction_ms  INTEGER      DEFAULT 0,
      best_reaction_ms INTEGER      DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_game_results_player_id     ON game_results(player_id);
    CREATE INDEX IF NOT EXISTS idx_game_results_played_at     ON game_results(played_at);
    CREATE INDEX IF NOT EXISTS idx_game_results_player_played ON game_results(player_id, played_at);

    -- Idempotent: add new columns to existing tables if they were created without them
    ALTER TABLE game_results ADD COLUMN IF NOT EXISTS tiles_tapped     INTEGER DEFAULT 0;
    ALTER TABLE game_results ADD COLUMN IF NOT EXISTS avg_reaction_ms  INTEGER DEFAULT 0;
    ALTER TABLE game_results ADD COLUMN IF NOT EXISTS best_reaction_ms INTEGER DEFAULT 0;
    ALTER TABLE game_results ADD COLUMN IF NOT EXISTS is_bot_match     BOOLEAN DEFAULT false;

    -- Player tag: permanent 4-digit identifier (1000–9999), unique per player
    ALTER TABLE players ADD COLUMN IF NOT EXISTS player_tag INTEGER;

    -- Trophy Road + Achievement summary (synced from client, used in public profiles)
    ALTER TABLE players ADD COLUMN IF NOT EXISTS trophy_points          INTEGER  DEFAULT 0;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS achievement_count      INTEGER  DEFAULT 0;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS achievement_total      INTEGER  DEFAULT 108;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS unlocked_achievements  TEXT[]   DEFAULT '{}';

    -- Diamond balance (synced from client for percentile ranking)
    ALTER TABLE players ADD COLUMN IF NOT EXISTS diamonds INTEGER DEFAULT 0;

    -- News & Announcements feed
    CREATE TABLE IF NOT EXISTS news_posts (
      id          BIGSERIAL    PRIMARY KEY,
      title       TEXT         NOT NULL,
      body        TEXT         NOT NULL,
      type        TEXT         NOT NULL DEFAULT 'news',
      image_url   TEXT,
      created_at  TIMESTAMPTZ  DEFAULT now(),
      expires_at  TIMESTAMPTZ,
      pinned      BOOLEAN      DEFAULT false
    );

    -- Friends: bi-directional friend requests with status tracking
    CREATE TABLE IF NOT EXISTS friends (
      id                   BIGSERIAL PRIMARY KEY,
      requester_player_id  UUID NOT NULL REFERENCES players(player_id),
      target_player_id     UUID NOT NULL REFERENCES players(player_id),
      status               TEXT NOT NULL DEFAULT 'pending',
      created_at           TIMESTAMPTZ DEFAULT now()
    );

    -- Player Inbox: personal notifications (rewards, friend accepts, admin messages)
    CREATE TABLE IF NOT EXISTS player_notifications (
      id            BIGSERIAL    PRIMARY KEY,
      player_id     TEXT         NOT NULL,
      title         TEXT         NOT NULL,
      body          TEXT         NOT NULL,
      type          TEXT         NOT NULL DEFAULT 'message',
      reward_type   TEXT,
      reward_amount INTEGER,
      read_at       TIMESTAMPTZ,
      claimed_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ  DEFAULT now()
    );

    -- Cloud Save: one row per player, UPSERT on every save
    CREATE TABLE IF NOT EXISTS player_save_data (
      player_id    UUID         PRIMARY KEY,
      save_json    TEXT         NOT NULL,
      save_version INTEGER      NOT NULL DEFAULT 1,
      updated_at   TIMESTAMPTZ  DEFAULT now()
    );
    ALTER TABLE player_save_data ADD COLUMN IF NOT EXISTS save_version INTEGER NOT NULL DEFAULT 1;

    -- Patient Angler save data (keyed by Firebase UID)
    CREATE TABLE IF NOT EXISTS pa_save_data (
      uid          TEXT         PRIMARY KEY,
      save_json    TEXT         NOT NULL,
      updated_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Patient Angler redeem code uses: one row per (code, uid) pair
    CREATE TABLE IF NOT EXISTS pa_codes_used (
      code        TEXT         NOT NULL,
      uid         TEXT         NOT NULL,
      redeemed_at TIMESTAMPTZ  DEFAULT now(),
      PRIMARY KEY (code, uid)
    );

    -- Push tokens: one row per FCM token (UNIQUE on token, indexed by player)
    CREATE TABLE IF NOT EXISTS push_tokens (
      id          SERIAL       PRIMARY KEY,
      player_id   UUID         NOT NULL,
      token       TEXT         NOT NULL,
      platform    TEXT         NOT NULL DEFAULT 'android',
      created_at  TIMESTAMPTZ  DEFAULT now(),
      updated_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Promo code redemptions: one row per (code, player) pair
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id          SERIAL       PRIMARY KEY,
      code        TEXT         NOT NULL,
      player_id   UUID         NOT NULL,
      redeemed_at TIMESTAMPTZ  DEFAULT now()
    );

    -- Economy integrity: server-side diamond ceiling per player
    -- NULL = not yet bootstrapped (first save through validation system sets it)
    ALTER TABLE players ADD COLUMN IF NOT EXISTS trusted_diamonds INTEGER;

    -- KOTH daily reward claims: one per player per UTC day (server-side anti-replay)
    CREATE TABLE IF NOT EXISTS koth_daily_claims (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      claim_date  DATE         NOT NULL,
      tier        TEXT         NOT NULL,
      diamonds    INTEGER      NOT NULL,
      claimed_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- KOTH weekly prize claims: one per player per week start date (server-side anti-replay)
    CREATE TABLE IF NOT EXISTS koth_prize_claims (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      week_start  DATE         NOT NULL,
      rank        INTEGER      NOT NULL,
      prize       INTEGER      NOT NULL DEFAULT 0,
      claimed_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Ring grants: one row per ring issued from the wheel.
    -- status: 'held' | 'in_trade' | 'traded'
    CREATE TABLE IF NOT EXISTS ring_grants (
      grant_id    TEXT         PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      ring_id     TEXT         NOT NULL,
      rarity_id   TEXT         NOT NULL,
      spin_type   TEXT         NOT NULL DEFAULT 'free',
      status      TEXT         NOT NULL DEFAULT 'held',
      granted_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Ring trades: active trade codes linking grants to potential claimers.
    -- status: 'active' | 'completed' | 'cancelled'
    CREATE TABLE IF NOT EXISTS ring_trades (
      trade_code  TEXT         PRIMARY KEY,
      grant_id    TEXT         NOT NULL REFERENCES ring_grants(grant_id),
      seller_id   UUID         NOT NULL REFERENCES players(player_id),
      ring_id     TEXT         NOT NULL,
      status      TEXT         NOT NULL DEFAULT 'active',
      created_at  TIMESTAMPTZ  DEFAULT now(),
      expires_at  TIMESTAMPTZ  DEFAULT (now() + interval '4 hours')
    );

    -- Practice mode scores: one row per player, UPSERT keeps personal bests only.
    CREATE TABLE IF NOT EXISTS practice_scores (
      player_id        UUID         PRIMARY KEY REFERENCES players(player_id),
      player_name      TEXT         NOT NULL,
      avatar           TEXT         NOT NULL DEFAULT '🔥',
      best_taps_30s    INTEGER      DEFAULT 0,
      best_reaction_ms INTEGER      DEFAULT 0,
      updated_at       TIMESTAMPTZ  DEFAULT now()
    );

    -- IAP purchase receipts: one row per purchase token (UNIQUE prevents double-delivery)
    -- granted_json stores the reward payload so restore can re-deliver the exact same items.
    CREATE TABLE IF NOT EXISTS purchase_receipts (
      id             BIGSERIAL    PRIMARY KEY,
      player_id      UUID         NOT NULL,
      product_id     TEXT         NOT NULL,
      purchase_token TEXT         UNIQUE NOT NULL,
      order_id       TEXT,
      granted_json   TEXT,
      verified_at    TIMESTAMPTZ  DEFAULT now()
    );

    -- Solo mode scores: personal best, one row per player (UPSERT on submit)
    CREATE TABLE IF NOT EXISTS solo_scores (
      player_id        UUID         PRIMARY KEY REFERENCES players(player_id),
      player_name      TEXT         NOT NULL,
      avatar           TEXT         NOT NULL DEFAULT '🔥',
      total_stars      INTEGER      NOT NULL DEFAULT 0,
      levels_completed INTEGER      NOT NULL DEFAULT 0,
      perfect_levels   INTEGER      NOT NULL DEFAULT 0,
      score            INTEGER      NOT NULL DEFAULT 0,
      updated_at       TIMESTAMPTZ  DEFAULT now()
    );

    -- Gauntlet MMR: one row per player, updated after each match
    CREATE TABLE IF NOT EXISTS gauntlet_mmr (
      player_id   UUID         PRIMARY KEY REFERENCES players(player_id),
      player_name TEXT         NOT NULL DEFAULT '',
      avatar      TEXT         NOT NULL DEFAULT '🔥',
      mmr         INTEGER      NOT NULL DEFAULT 0,
      peak_mmr    INTEGER      NOT NULL DEFAULT 0,
      total_games INTEGER      NOT NULL DEFAULT 0,
      total_wins  INTEGER      NOT NULL DEFAULT 0,
      updated_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Gauntlet results: one row per player per session
    CREATE TABLE IF NOT EXISTS gauntlet_results (
      id          BIGSERIAL    PRIMARY KEY,
      session_id  TEXT         NOT NULL,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      placement   INTEGER      NOT NULL,
      score       INTEGER      NOT NULL DEFAULT 0,
      taps        INTEGER      NOT NULL DEFAULT 0,
      mmr_before  INTEGER      NOT NULL DEFAULT 0,
      mmr_delta   INTEGER      NOT NULL DEFAULT 0,
      played_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Daily login claims: one per player per calendar date (prevents re-claiming after localStorage wipe)
    CREATE TABLE IF NOT EXISTS daily_login_claims (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      claim_date  DATE         NOT NULL,
      day_num     INTEGER      NOT NULL,
      claimed_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Mission reward claims: one per player per (mission_id, period_key)
    CREATE TABLE IF NOT EXISTS mission_claims (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      mission_id  TEXT         NOT NULL,
      period_key  TEXT         NOT NULL,
      claimed_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Mode reward claims: one per player per (mode, period, period_key)
    CREATE TABLE IF NOT EXISTS mode_reward_claims (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      mode        TEXT         NOT NULL,
      period      TEXT         NOT NULL,
      period_key  TEXT         NOT NULL,
      tier        TEXT         NOT NULL,
      tickets     INTEGER      NOT NULL DEFAULT 0,
      claimed_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Gauntlet weekly prize claims: one per player per ISO week-start (Monday)
    CREATE TABLE IF NOT EXISTS gauntlet_weekly_claims (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      week_start  DATE         NOT NULL,
      rank        INTEGER      NOT NULL,
      total       INTEGER      NOT NULL,
      spins       INTEGER      NOT NULL DEFAULT 0,
      diamonds    INTEGER      NOT NULL DEFAULT 0,
      claimed_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Trophy Road milestone claims: one per player per milestone threshold
    CREATE TABLE IF NOT EXISTS trophy_milestone_claims (
      id            BIGSERIAL    PRIMARY KEY,
      player_id     UUID         NOT NULL REFERENCES players(player_id),
      milestone_pts INTEGER      NOT NULL,
      claimed_at    TIMESTAMPTZ  DEFAULT now()
    );

    -- Achievement unlocks (server-side idempotency — prevents re-unlock after save wipe)
    CREATE TABLE IF NOT EXISTS achievement_unlocks (
      id             BIGSERIAL    PRIMARY KEY,
      player_id      UUID         NOT NULL REFERENCES players(player_id),
      achievement_id TEXT         NOT NULL,
      unlocked_at    TIMESTAMPTZ  DEFAULT now()
    );

    -- Ad reward claims (1-hour server-enforced cooldown)
    CREATE TABLE IF NOT EXISTS ad_reward_claims (
      id           BIGSERIAL    PRIMARY KEY,
      player_id    UUID         NOT NULL REFERENCES players(player_id),
      reward_type  TEXT         NOT NULL DEFAULT 'tickets',
      claimed_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Offline reward claims: one per player per UTC calendar day
    CREATE TABLE IF NOT EXISTS offline_reward_claims (
      id           BIGSERIAL    PRIMARY KEY,
      player_id    UUID         NOT NULL REFERENCES players(player_id),
      claim_date   DATE         NOT NULL,
      amount       INTEGER      NOT NULL DEFAULT 0,
      claimed_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Daily Challenge claims: one per player per calendar date
    CREATE TABLE IF NOT EXISTS dc_claims (
      id             BIGSERIAL    PRIMARY KEY,
      player_id      UUID         NOT NULL REFERENCES players(player_id),
      challenge_date DATE         NOT NULL,
      challenge_id   TEXT         NOT NULL,
      claimed_at     TIMESTAMPTZ  DEFAULT now()
    );

    -- Anti-cheat reports: client-submitted suspicious-behaviour flags
    CREATE TABLE IF NOT EXISTS suspicious_reports (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL,
      reason      TEXT         NOT NULL,
      reported_at TIMESTAMPTZ  DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_suspicious_reports_player ON suspicious_reports(player_id);

    -- Diamond spend audit log
    CREATE TABLE IF NOT EXISTS diamond_spends (
      id         BIGSERIAL    PRIMARY KEY,
      player_id  UUID         NOT NULL REFERENCES players(player_id),
      item_id    TEXT         NOT NULL,
      amount     INTEGER      NOT NULL,
      spent_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Surprise bonus grants: one per player per UTC calendar day
    CREATE TABLE IF NOT EXISTS surprise_grants (
      id           BIGSERIAL    PRIMARY KEY,
      player_id    UUID         NOT NULL REFERENCES players(player_id),
      grant_date   DATE         NOT NULL,
      granted_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Ticket events: audit log of every ticket spend (source = 'match') and earn
    CREATE TABLE IF NOT EXISTS ticket_events (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      delta       INTEGER      NOT NULL,
      source      TEXT         NOT NULL,
      balance     INTEGER,
      created_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- KOTH fastest-clicker claims: one per player per claim_date per type ('daily'|'weekly')
    CREATE TABLE IF NOT EXISTS koth_fastest_claims (
      id          BIGSERIAL    PRIMARY KEY,
      player_id   UUID         NOT NULL REFERENCES players(player_id),
      claim_date  DATE         NOT NULL,
      claim_type  TEXT         NOT NULL,
      reaction_ms INTEGER      NOT NULL DEFAULT 0,
      diamonds    INTEGER      NOT NULL DEFAULT 0,
      claimed_at  TIMESTAMPTZ  DEFAULT now()
    );

    -- Solo milestone claims: one per player per milestone star threshold
    CREATE TABLE IF NOT EXISTS solo_milestone_claims (
      id           BIGSERIAL    PRIMARY KEY,
      player_id    UUID         NOT NULL REFERENCES players(player_id),
      milestone_pts INTEGER     NOT NULL,
      gems         INTEGER      NOT NULL DEFAULT 0,
      claimed_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Daily challenge swap records: one swap allowed per player per calendar date
    CREATE TABLE IF NOT EXISTS dc_swap_records (
      id           BIGSERIAL    PRIMARY KEY,
      player_id    UUID         NOT NULL REFERENCES players(player_id),
      swap_date    DATE         NOT NULL,
      swapped_at   TIMESTAMPTZ  DEFAULT now()
    );

    -- Level-up reward claims: one per player per level (prevents re-claiming after save wipe)
    CREATE TABLE IF NOT EXISTS level_up_claims (
      id         BIGSERIAL    PRIMARY KEY,
      player_id  UUID         NOT NULL REFERENCES players(player_id),
      level      INTEGER      NOT NULL,
      claimed_at TIMESTAMPTZ  DEFAULT now()
    );

    -- Solo level completion rewards: one per player per level number
    CREATE TABLE IF NOT EXISTS solo_level_claims (
      id         BIGSERIAL    PRIMARY KEY,
      player_id  UUID         NOT NULL REFERENCES players(player_id),
      level_num  INTEGER      NOT NULL,
      gem_reward INTEGER      NOT NULL DEFAULT 0,
      claimed_at TIMESTAMPTZ  DEFAULT now()
    );
  `);
  // Indexes created separately so IF NOT EXISTS works (constraints don't support it)
  await pool!.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_player_tag ON players(player_tag);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair       ON friends(requester_player_id, target_player_id);
    CREATE        INDEX IF NOT EXISTS idx_purchase_receipts_player ON purchase_receipts(player_id);
    CREATE        INDEX IF NOT EXISTS idx_ring_grants_player       ON ring_grants(player_id);
    CREATE        INDEX IF NOT EXISTS idx_ring_trades_seller       ON ring_trades(seller_id);
    CREATE        INDEX IF NOT EXISTS idx_friends_requester  ON friends(requester_player_id);
    CREATE        INDEX IF NOT EXISTS idx_friends_target     ON friends(target_player_id);
    CREATE        INDEX IF NOT EXISTS idx_player_notifs      ON player_notifications(player_id, created_at DESC);
    CREATE        INDEX IF NOT EXISTS idx_player_save_data   ON player_save_data(player_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_token       ON push_tokens(token);
    CREATE        INDEX IF NOT EXISTS idx_push_tokens_player      ON push_tokens(player_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_pair  ON promo_redemptions(code, player_id);
    CREATE        INDEX IF NOT EXISTS idx_promo_redemptions_code  ON promo_redemptions(code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_koth_daily_claims       ON koth_daily_claims(player_id, claim_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_koth_prize_claims       ON koth_prize_claims(player_id, week_start);
    CREATE        INDEX IF NOT EXISTS idx_solo_scores_score       ON solo_scores(score DESC);
    CREATE        INDEX IF NOT EXISTS idx_gauntlet_mmr_mmr        ON gauntlet_mmr(mmr DESC);
    CREATE        INDEX IF NOT EXISTS idx_gauntlet_results_player ON gauntlet_results(player_id, played_at DESC);
    CREATE        INDEX IF NOT EXISTS idx_gauntlet_results_sess   ON gauntlet_results(session_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_gauntlet_weekly_claims  ON gauntlet_weekly_claims(player_id, week_start);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_login_claims       ON daily_login_claims(player_id, claim_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_claims           ON mission_claims(player_id, mission_id, period_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mode_reward_claims       ON mode_reward_claims(player_id, mode, period, period_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trophy_milestone_claims  ON trophy_milestone_claims(player_id, milestone_pts);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_achievement_unlocks      ON achievement_unlocks(player_id, achievement_id);
    CREATE        INDEX IF NOT EXISTS idx_ad_reward_claims_player  ON ad_reward_claims(player_id, claimed_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_offline_reward_claims    ON offline_reward_claims(player_id, claim_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dc_claims                ON dc_claims(player_id, challenge_date);
    CREATE        INDEX IF NOT EXISTS idx_diamond_spends_player    ON diamond_spends(player_id, spent_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_surprise_grants           ON surprise_grants(player_id, grant_date);
    CREATE        INDEX IF NOT EXISTS idx_ticket_events_player      ON ticket_events(player_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_koth_fastest_claims       ON koth_fastest_claims(player_id, claim_date, claim_type);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_solo_milestone_claims     ON solo_milestone_claims(player_id, milestone_pts);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dc_swap_records           ON dc_swap_records(player_id, swap_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_level_up_claims           ON level_up_claims(player_id, level);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_solo_level_claims         ON solo_level_claims(player_id, level_num);
  `);
  console.log("[DB] Tables ready");
}

// ─── Solo Scores ──────────────────────────────────────────────────────────────

export async function upsertSoloScore(
  playerId: string, playerName: string, avatar: string,
  totalStars: number, levelsCompleted: number, perfectLevels: number
): Promise<boolean> {
  if (!pool) return false;
  try {
    const score = totalStars * 10 + perfectLevels * 50 + levelsCompleted * 5;
    await pool.query(`
      INSERT INTO solo_scores (player_id, player_name, avatar, total_stars, levels_completed, perfect_levels, score, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())
      ON CONFLICT (player_id) DO UPDATE SET
        player_name      = EXCLUDED.player_name,
        avatar           = EXCLUDED.avatar,
        total_stars      = GREATEST(solo_scores.total_stars, EXCLUDED.total_stars),
        levels_completed = GREATEST(solo_scores.levels_completed, EXCLUDED.levels_completed),
        perfect_levels   = GREATEST(solo_scores.perfect_levels, EXCLUDED.perfect_levels),
        score            = GREATEST(solo_scores.score, EXCLUDED.score),
        updated_at       = now()
    `, [playerId, playerName, avatar, totalStars, levelsCompleted, perfectLevels, score]);
    return true;
  } catch (e: any) {
    console.error('[DB] upsertSoloScore error:', e?.message);
    return false;
  }
}

export async function getSoloLeaderboard(playerId?: string): Promise<any[] | null> {
  if (!pool) return null;
  try {
    const rows = await pool.query(`
      SELECT
        player_name, avatar, total_stars, levels_completed, perfect_levels, score,
        RANK() OVER (ORDER BY score DESC, total_stars DESC) AS rank,
        player_id = $1 AS is_me
      FROM solo_scores
      ORDER BY score DESC, total_stars DESC
      LIMIT 50
    `, [playerId || '']);
    return rows.rows;
  } catch (e: any) {
    console.error('[DB] getSoloLeaderboard error:', e?.message);
    return null;
  }
}

// Backfill tags for any existing players that joined before this feature shipped.
async function migratePlayerTags(): Promise<void> {
  if (!pool) return;
  try {
    const untagged = await pool.query(
      `SELECT player_id FROM players WHERE player_tag IS NULL ORDER BY created_at`
    );
    let count = 0;
    for (const row of untagged.rows) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const tag = Math.floor(1000 + Math.random() * 9000);
        try {
          const result = await pool.query(
            `UPDATE players SET player_tag = $1 WHERE player_id = $2 AND player_tag IS NULL`,
            [tag, row.player_id]
          );
          if (result.rowCount && result.rowCount > 0) { count++; break; }
          break; // rowCount === 0 → player already tagged by concurrent call
        } catch (err: any) {
          if (err.code === '23505') continue; // unique collision, try another tag
          break;
        }
      }
    }
    if (count > 0) console.log(`[DB] Tagged ${count} existing player(s)`);
  } catch (err) {
    console.error('[DB] Tag migration error:', err);
  }
}

// ─── Player Operations ─────────────────────────────────────────────────────────

// Upsert player on every join — keeps name/avatar current; assigns permanent tag on first join
export async function upsertPlayer(
  playerId: string,
  playerName: string,
  avatar: string
): Promise<void> {
  await query(`
    INSERT INTO players (player_id, player_name, avatar)
    VALUES ($1, $2, $3)
    ON CONFLICT (player_id) DO UPDATE
      SET player_name  = $2,
          avatar       = $3,
          last_seen_at = now()
  `, [playerId, playerName, avatar]);

  // Assign a unique 4-digit tag if not already set; bypass query() wrapper to catch 23505
  if (!pool || !dbAvailable) return;
  for (let attempt = 0; attempt < 50; attempt++) {
    const tag = Math.floor(1000 + Math.random() * 9000);
    try {
      const result = await pool.query(
        `UPDATE players SET player_tag = $1 WHERE player_id = $2 AND player_tag IS NULL`,
        [tag, playerId]
      );
      if (!result.rowCount || result.rowCount === 0) return; // already tagged
      return; // success
    } catch (err: any) {
      if (err.code === '23505') continue; // unique collision, try another tag
      console.error('[DB] Tag assignment error:', err);
      return;
    }
  }
  console.error('[DB] Could not assign unique player tag after 50 attempts');
}

// Write one result row per human player at game end
export async function writeGameResult(
  playerId: string,
  placement: number,
  totalPlayers: number,
  mode: string,
  tapStats?: { tilesTapped: number; avgReactionMs: number; bestReactionMs: number },
  isBotMatch?: boolean
): Promise<void> {
  await query(`
    INSERT INTO game_results
      (player_id, placement, total_players, mode, tiles_tapped, avg_reaction_ms, best_reaction_ms, is_bot_match)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    playerId, placement, totalPlayers, mode,
    tapStats?.tilesTapped   ?? 0,
    tapStats?.avgReactionMs ?? 0,
    tapStats?.bestReactionMs ?? 0,
    isBotMatch ?? false,
  ]);
}

// ─── Ranking Queries ───────────────────────────────────────────────────────────

// Shared CTE — computes aggregate stats for all players in a given time window.
// periodFilter: e.g. "AND gr.played_at >= date_trunc('week', now())" or ""
async function queryRankings(periodFilter: string): Promise<any[] | null> {
  return query(`
    WITH stats AS (
      SELECT
        p.player_id,
        p.player_name,
        p.avatar,
        p.player_tag,
        COUNT(*)                                            AS games,
        COUNT(*) FILTER (WHERE gr.placement = 1)           AS wins,
        COUNT(*) FILTER (WHERE gr.placement <= 3)          AS top3,
        COUNT(*) FILTER (WHERE gr.placement <= 5)          AS top5,
        ROUND(AVG(gr.placement)::NUMERIC, 2)               AS avg_placement
      FROM game_results gr
      JOIN players p ON gr.player_id = p.player_id
      WHERE (gr.is_bot_match IS NULL OR gr.is_bot_match = false) ${periodFilter}
      GROUP BY p.player_id, p.player_name, p.avatar, p.player_tag
    )
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY wins DESC, top3 DESC, avg_placement ASC
      )                                                     AS rank,
      player_id,
      player_name,
      player_tag,
      avatar,
      games::INT,
      wins::INT,
      top3::INT,
      top5::INT,
      avg_placement,
      ROUND(
        wins::NUMERIC / NULLIF(games, 0) * 100, 1
      )                                                     AS win_rate
    FROM stats
    ORDER BY rank
    LIMIT 50
  `);
}

export async function getRankingsWeekly(): Promise<any[] | null> {
  return queryRankings("AND gr.played_at >= date_trunc('week', now())");
}

export async function getRankingsAllTime(): Promise<any[] | null> {
  return queryRankings("");
}

// Single player stats + their global rank (all-time)
export async function getPlayerStats(playerId: string): Promise<any | null> {
  const rows = await query(`
    WITH player_stats AS (
      SELECT
        COUNT(*)                                             AS games,
        COUNT(*) FILTER (WHERE placement = 1)               AS wins,
        COUNT(*) FILTER (WHERE placement <= 3)              AS top3,
        COUNT(*) FILTER (WHERE placement <= 5)              AS top5,
        ROUND(AVG(placement)::NUMERIC, 2)                   AS avg_placement,
        SUM(tiles_tapped)                                   AS total_tiles_tapped,
        MIN(NULLIF(best_reaction_ms, 0))                    AS fastest_reaction_ms,
        ROUND(AVG(NULLIF(avg_reaction_ms, 0))::NUMERIC, 0)  AS overall_avg_reaction_ms
      FROM game_results
      WHERE player_id = $1
        AND (is_bot_match IS NULL OR is_bot_match = false)
    ),
    weekly_stats AS (
      SELECT
        COUNT(*)                                            AS weekly_games,
        COUNT(*) FILTER (WHERE placement = 1)              AS weekly_wins
      FROM game_results
      WHERE player_id = $1
        AND played_at >= date_trunc('week', now())
        AND (is_bot_match IS NULL OR is_bot_match = false)
    ),
    mode_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE mode = 'rush')                        AS rush_games,
        COUNT(*) FILTER (WHERE mode = 'rush'    AND placement = 1)   AS rush_wins,
        COUNT(*) FILTER (WHERE mode = 'buckshot')                    AS buckshot_games,
        COUNT(*) FILTER (WHERE mode = 'buckshot' AND placement = 1)  AS buckshot_wins,
        COUNT(*) FILTER (WHERE mode = 'wild')                        AS wild_games,
        COUNT(*) FILTER (WHERE mode = 'wild'    AND placement = 1)   AS wild_wins
      FROM game_results
      WHERE player_id = $1
        AND (is_bot_match IS NULL OR is_bot_match = false)
    ),
    -- Compute best win streak from ordered real-player game history
    streaks AS (
      SELECT
        placement,
        played_at,
        SUM(CASE WHEN placement != 1 THEN 1 ELSE 0 END)
          OVER (ORDER BY played_at ROWS UNBOUNDED PRECEDING) AS streak_group
      FROM game_results
      WHERE player_id = $1
        AND (is_bot_match IS NULL OR is_bot_match = false)
    ),
    win_streaks AS (
      SELECT streak_group, COUNT(*) AS streak_len
      FROM streaks
      WHERE placement = 1
      GROUP BY streak_group
    ),
    all_ranks AS (
      SELECT
        p2.player_id,
        ROW_NUMBER() OVER (
          ORDER BY COUNT(*) FILTER (WHERE gr2.placement = 1) DESC,
                   COUNT(*) FILTER (WHERE gr2.placement <= 3) DESC
        ) AS rank
      FROM game_results gr2
      JOIN players p2 ON gr2.player_id = p2.player_id
      WHERE (gr2.is_bot_match IS NULL OR gr2.is_bot_match = false)
      GROUP BY p2.player_id
    ),
    weekly_ranks AS (
      SELECT
        p2.player_id,
        ROW_NUMBER() OVER (
          ORDER BY COUNT(*) FILTER (WHERE gr2.placement = 1) DESC
        ) AS weekly_rank
      FROM game_results gr2
      JOIN players p2 ON gr2.player_id = p2.player_id
      WHERE gr2.played_at >= date_trunc('week', now())
        AND (gr2.is_bot_match IS NULL OR gr2.is_bot_match = false)
      GROUP BY p2.player_id
    )
    SELECT
      p.player_id,
      p.player_name,
      p.player_tag,
      p.avatar,
      p.created_at,
      p.last_seen_at,
      p.mmr,
      p.peak_mmr,
      ps.games::INT,
      ps.wins::INT,
      ps.top3::INT,
      ps.top5::INT,
      ps.avg_placement,
      ROUND(ps.wins::NUMERIC / NULLIF(ps.games, 0) * 100, 1)  AS win_rate,
      COALESCE(ps.total_tiles_tapped, 0)::INT                  AS total_tiles_tapped,
      ps.fastest_reaction_ms::INT                              AS fastest_reaction_ms,
      ps.overall_avg_reaction_ms::INT                          AS overall_avg_reaction_ms,
      COALESCE((SELECT MAX(streak_len) FROM win_streaks), 0)::INT AS best_win_streak,
      ws.weekly_games::INT,
      ws.weekly_wins::INT,
      COALESCE(ar.rank, 9999)                                  AS rank,
      COALESCE(wr.weekly_rank, 9999)                           AS weekly_rank,
      COALESCE(p.trophy_points, 0)                             AS trophy_points,
      COALESCE(p.achievement_count, 0)                         AS achievement_count,
      COALESCE(p.achievement_total, 108)                       AS achievement_total,
      COALESCE(ms.rush_games,     0)::INT                      AS rush_games,
      COALESCE(ms.rush_wins,      0)::INT                      AS rush_wins,
      COALESCE(ms.buckshot_games, 0)::INT                      AS buckshot_games,
      COALESCE(ms.buckshot_wins,  0)::INT                      AS buckshot_wins,
      COALESCE(ms.wild_games,     0)::INT                      AS wild_games,
      COALESCE(ms.wild_wins,      0)::INT                      AS wild_wins
    FROM players p
    CROSS JOIN player_stats ps
    CROSS JOIN weekly_stats ws
    CROSS JOIN mode_stats ms
    LEFT JOIN all_ranks    ar ON ar.player_id = p.player_id
    LEFT JOIN weekly_ranks wr ON wr.player_id = p.player_id
    WHERE p.player_id = $1
  `, [playerId]);

  return rows && rows.length > 0 ? rows[0] : null;
}

// ─── Global Averages ───────────────────────────────────────────────────────────
// Averages computed per-player first to avoid heavy-game-count bias.
// win_streak omitted here — complex window function not needed for display.
export async function getGlobalStats(): Promise<any | null> {
  const rows = await query(`
    WITH per_player AS (
      SELECT
        player_id,
        COUNT(*)                                            AS games,
        COUNT(*) FILTER (WHERE placement = 1)              AS wins,
        ROUND(AVG(placement)::NUMERIC, 2)                  AS avg_placement,
        MIN(NULLIF(best_reaction_ms, 0))                   AS fastest_reaction_ms,
        SUM(tiles_tapped)                                  AS total_tiles_tapped
      FROM game_results
      GROUP BY player_id
    )
    SELECT
      COUNT(*)::INT                                                       AS total_players,
      SUM(games)::INT                                                     AS total_games,
      ROUND(AVG(wins::NUMERIC / NULLIF(games, 0) * 100), 1)              AS avg_win_rate,
      ROUND(AVG(avg_placement)::NUMERIC, 2)                              AS avg_placement,
      ROUND(AVG(fastest_reaction_ms)::NUMERIC, 0)                        AS avg_fastest_reaction_ms,
      ROUND(AVG(total_tiles_tapped)::NUMERIC, 0)                         AS avg_total_tiles_tapped
    FROM per_player
  `);
  return rows && rows.length > 0 ? rows[0] : null;
}

// ─── World Records ─────────────────────────────────────────────────────────────
// Five separate queries run in parallel — each gracefully returns null on no data.
export async function getWorldRecords(): Promise<any> {
  const [reaction, streak, wins, weeklyWins, tiles] = await Promise.all([
    query(`
      SELECT p.player_id, p.player_name, p.player_tag, p.avatar, MIN(gr.best_reaction_ms) AS best_reaction
      FROM game_results gr
      JOIN players p ON p.player_id = gr.player_id
      WHERE gr.best_reaction_ms > 0
      GROUP BY p.player_id, p.player_name, p.player_tag, p.avatar
      ORDER BY best_reaction ASC LIMIT 1
    `),
    query(`
      WITH streaks AS (
        SELECT player_id, placement, played_at,
          SUM(CASE WHEN placement != 1 THEN 1 ELSE 0 END)
            OVER (PARTITION BY player_id ORDER BY played_at ROWS UNBOUNDED PRECEDING) AS streak_group
        FROM game_results
      ),
      groups AS (
        SELECT player_id, streak_group, COUNT(*) AS streak_len
        FROM streaks WHERE placement = 1
        GROUP BY player_id, streak_group
      ),
      best AS (
        SELECT player_id, MAX(streak_len) AS best_streak
        FROM groups GROUP BY player_id
      )
      SELECT p.player_id, p.player_name, p.player_tag, p.avatar, b.best_streak
      FROM best b JOIN players p ON p.player_id = b.player_id
      ORDER BY b.best_streak DESC LIMIT 1
    `),
    query(`
      SELECT p.player_id, p.player_name, p.player_tag, p.avatar, COUNT(*) FILTER (WHERE gr.placement = 1)::INT AS wins
      FROM game_results gr
      JOIN players p ON p.player_id = gr.player_id
      GROUP BY p.player_id, p.player_name, p.player_tag, p.avatar
      ORDER BY wins DESC LIMIT 1
    `),
    query(`
      SELECT p.player_id, p.player_name, p.player_tag, p.avatar, COUNT(*) FILTER (WHERE gr.placement = 1)::INT AS weekly_wins
      FROM game_results gr
      JOIN players p ON p.player_id = gr.player_id
      WHERE gr.played_at >= date_trunc('week', now())
      GROUP BY p.player_id, p.player_name, p.player_tag, p.avatar
      ORDER BY weekly_wins DESC LIMIT 1
    `),
    query(`
      SELECT p.player_id, p.player_name, p.player_tag, p.avatar, SUM(gr.tiles_tapped)::BIGINT AS total_tiles
      FROM game_results gr
      JOIN players p ON p.player_id = gr.player_id
      GROUP BY p.player_id, p.player_name, p.player_tag, p.avatar
      ORDER BY total_tiles DESC LIMIT 1
    `),
  ]);

  return {
    fastest_reaction_ms:              reaction?.[0]?.best_reaction     ?? null,
    fastest_reaction_player:          reaction?.[0]?.player_name       ?? null,
    fastest_reaction_player_tag:      reaction?.[0]?.player_tag        ?? null,
    fastest_reaction_avatar:          reaction?.[0]?.avatar            ?? null,
    fastest_reaction_player_id:       reaction?.[0]?.player_id         ?? null,
    longest_win_streak:               streak?.[0]?.best_streak         ?? null,
    longest_win_streak_player:        streak?.[0]?.player_name         ?? null,
    longest_win_streak_player_tag:    streak?.[0]?.player_tag          ?? null,
    longest_win_streak_avatar:        streak?.[0]?.avatar              ?? null,
    longest_win_streak_player_id:     streak?.[0]?.player_id           ?? null,
    most_wins:                        wins?.[0]?.wins                  ?? null,
    most_wins_player:                 wins?.[0]?.player_name           ?? null,
    most_wins_player_tag:             wins?.[0]?.player_tag            ?? null,
    most_wins_avatar:                 wins?.[0]?.avatar                ?? null,
    most_wins_player_id:              wins?.[0]?.player_id             ?? null,
    most_weekly_wins:                 weeklyWins?.[0]?.weekly_wins     ?? null,
    most_weekly_wins_player:          weeklyWins?.[0]?.player_name     ?? null,
    most_weekly_wins_player_tag:      weeklyWins?.[0]?.player_tag      ?? null,
    most_weekly_wins_avatar:          weeklyWins?.[0]?.avatar          ?? null,
    most_weekly_wins_player_id:       weeklyWins?.[0]?.player_id       ?? null,
    most_tiles_tapped:                tiles?.[0]?.total_tiles          ?? null,
    most_tiles_tapped_player:         tiles?.[0]?.player_name          ?? null,
    most_tiles_tapped_player_tag:     tiles?.[0]?.player_tag           ?? null,
    most_tiles_tapped_avatar:         tiles?.[0]?.avatar               ?? null,
    most_tiles_tapped_player_id:      tiles?.[0]?.player_id            ?? null,
  };
}

// ─── Player Percentiles ────────────────────────────────────────────────────────
// Returns how each stat ranks vs all players.
// Wins/win_rate/tiles: 0 = best (higher is better).
// Reaction: 0 = best (lower ms is better).
export async function getPlayerPercentiles(playerId: string): Promise<any | null> {
  const rows = await query(`
    WITH per_player AS (
      SELECT
        p.player_id,
        COUNT(gr.id) FILTER (WHERE gr.placement = 1)::NUMERIC             AS wins,
        ROUND(
          COUNT(gr.id) FILTER (WHERE gr.placement = 1)::NUMERIC
          / NULLIF(COUNT(gr.id), 0) * 100, 1
        )                                                                   AS win_rate,
        MIN(NULLIF(gr.best_reaction_ms, 0))                                AS fastest_reaction,
        COALESCE(SUM(gr.tiles_tapped), 0)::NUMERIC                        AS tiles_tapped,
        COALESCE(p.diamonds, 0)::NUMERIC                                   AS diamonds
      FROM players p
      LEFT JOIN game_results gr ON gr.player_id = p.player_id
      GROUP BY p.player_id, p.diamonds
    ),
    pcts AS (
      SELECT
        player_id,
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY wins             ASC NULLS LAST )) * 100)::NUMERIC)::INT AS wins_pct,
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY win_rate         ASC NULLS FIRST)) * 100)::NUMERIC)::INT AS win_rate_pct,
        ROUND((      PERCENT_RANK() OVER (ORDER BY fastest_reaction ASC NULLS LAST ) * 100 )::NUMERIC)::INT AS reaction_pct,
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY tiles_tapped     ASC NULLS LAST )) * 100)::NUMERIC)::INT AS tiles_pct,
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY diamonds         ASC NULLS LAST )) * 100)::NUMERIC)::INT AS diamonds_pct
      FROM per_player
    )
    SELECT wins_pct, win_rate_pct, reaction_pct, tiles_pct, diamonds_pct
    FROM pcts
    WHERE player_id = $1
  `, [playerId]);
  return rows && rows.length > 0 ? rows[0] : null;
}

// ─── Friends System ────────────────────────────────────────────────────────────

export async function findPlayerByTag(tag: number): Promise<any | null> {
  const rows = await query(
    `SELECT player_id, player_name, player_tag, avatar FROM players WHERE player_tag = $1`,
    [tag]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

// Returns: 'sent' | 'already_sent' | 'already_friends' | 'self' | 'not_found'
export async function sendFriendRequest(requesterId: string, targetId: string): Promise<string> {
  if (requesterId === targetId) return 'self';

  const existing = await query(`
    SELECT status FROM friends
    WHERE (requester_player_id = $1 AND target_player_id = $2)
       OR (requester_player_id = $2 AND target_player_id = $1)
  `, [requesterId, targetId]);

  if (existing && existing.length > 0) {
    return existing[0].status === 'accepted' ? 'already_friends' : 'already_sent';
  }

  try {
    await query(`
      INSERT INTO friends (requester_player_id, target_player_id, status)
      VALUES ($1, $2, 'pending')
      ON CONFLICT (requester_player_id, target_player_id) DO NOTHING
    `, [requesterId, targetId]);
    return 'sent';
  } catch (err: any) {
    console.error('[DB] sendFriendRequest error:', err);
    return 'sent'; // ON CONFLICT handles duplicates
  }
}

export async function respondFriendRequest(
  targetId: string,
  requesterId: string,
  action: 'accept' | 'decline'
): Promise<boolean> {
  const newStatus = action === 'accept' ? 'accepted' : 'declined';
  const rows = await query(`
    UPDATE friends SET status = $1
    WHERE requester_player_id = $2 AND target_player_id = $3 AND status = 'pending'
    RETURNING id
  `, [newStatus, requesterId, targetId]);
  return !!(rows && rows.length > 0);
}

export async function getFriends(playerId: string): Promise<any[]> {
  const rows = await query(`
    SELECT
      p.player_id, p.player_name, p.player_tag, p.avatar,
      (now() - p.last_seen_at < interval '15 minutes') AS is_online,
      COALESCE(
        (SELECT COUNT(*) FILTER (WHERE placement = 1) FROM game_results WHERE player_id = p.player_id),
        0
      )::INT AS wins
    FROM friends f
    JOIN players p ON p.player_id = (
      CASE WHEN f.requester_player_id = $1 THEN f.target_player_id
           ELSE f.requester_player_id END
    )
    WHERE (f.requester_player_id = $1 OR f.target_player_id = $1)
      AND f.status = 'accepted'
    ORDER BY is_online DESC, p.player_name
  `, [playerId]);
  return rows || [];
}

export async function getFriendRequests(playerId: string): Promise<any[]> {
  const rows = await query(`
    SELECT p.player_id, p.player_name, p.player_tag, p.avatar, f.created_at
    FROM friends f
    JOIN players p ON p.player_id = f.requester_player_id
    WHERE f.target_player_id = $1 AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `, [playerId]);
  return rows || [];
}

export async function getFriendsLeaderboard(playerId: string, period: string): Promise<any[]> {
  const periodFilter = period === 'weekly'
    ? "AND gr.played_at >= date_trunc('week', now())"
    : "";

  const rows = await query(`
    WITH friend_ids AS (
      SELECT CASE WHEN requester_player_id = $1 THEN target_player_id ELSE requester_player_id END AS pid
      FROM friends
      WHERE (requester_player_id = $1 OR target_player_id = $1) AND status = 'accepted'
      UNION ALL SELECT $1::UUID
    ),
    stats AS (
      SELECT
        p.player_id, p.player_name, p.player_tag, p.avatar,
        COALESCE(COUNT(gr.id) FILTER (WHERE gr.placement = 1), 0)::INT AS wins,
        COALESCE(COUNT(gr.id), 0)::INT                                  AS games,
        ROUND(
          COALESCE(COUNT(gr.id) FILTER (WHERE gr.placement = 1), 0)::NUMERIC
          / NULLIF(COUNT(gr.id), 0) * 100, 1
        ) AS win_rate
      FROM friend_ids fi
      JOIN players p ON p.player_id = fi.pid
      LEFT JOIN game_results gr ON gr.player_id = p.player_id ${periodFilter}
      GROUP BY p.player_id, p.player_name, p.player_tag, p.avatar
    )
    SELECT ROW_NUMBER() OVER (ORDER BY wins DESC, games DESC) AS rank,
           player_id, player_name, player_tag, avatar, wins, games, win_rate
    FROM stats ORDER BY rank
  `, [playerId]);
  return rows || [];
}

// ─── Public Profile Helpers ────────────────────────────────────────────────────

// Returns: 'self' | 'friends' | 'request_sent' | 'request_received' | 'none'
export async function getFriendshipStatus(viewerId: string, targetId: string): Promise<string> {
  if (viewerId === targetId) return 'self';
  const rows = await query(`
    SELECT status, requester_player_id
    FROM friends
    WHERE (requester_player_id = $1 AND target_player_id = $2)
       OR (requester_player_id = $2 AND target_player_id = $1)
  `, [viewerId, targetId]);
  if (!rows || rows.length === 0) return 'none';
  const row = rows[0];
  if (row.status === 'accepted') return 'friends';
  if (row.status === 'pending') {
    return row.requester_player_id === viewerId ? 'request_sent' : 'request_received';
  }
  return 'none';
}

// Upsert trophy points + achievement summary + diamond balance (called on client events).
// achievement_ids is merged with existing server set (union — never removes).
export async function updatePlayerProgress(
  playerId: string,
  trophyPoints: number,
  achievementCount: number,
  achievementTotal: number,
  diamonds: number,
  achievementIds?: string[]
): Promise<void> {
  if (achievementIds && achievementIds.length > 0) {
    await query(`
      UPDATE players
      SET trophy_points          = $2,
          achievement_count      = $3,
          achievement_total      = $4,
          diamonds               = $5,
          unlocked_achievements  = (
            SELECT ARRAY(
              SELECT DISTINCT unnest(
                unlocked_achievements || $6::TEXT[]
              )
            )
          )
      WHERE player_id = $1
    `, [playerId, trophyPoints, achievementCount, achievementTotal, diamonds, achievementIds]);
  } else {
    await query(`
      UPDATE players
      SET trophy_points     = $2,
          achievement_count = $3,
          achievement_total = $4,
          diamonds          = $5
      WHERE player_id = $1
    `, [playerId, trophyPoints, achievementCount, achievementTotal, diamonds]);
  }
}

export async function getPlayerAchievements(playerId: string): Promise<string[]> {
  const rows = await query(
    `SELECT unlocked_achievements FROM players WHERE player_id = $1`,
    [playerId]
  );
  return rows?.[0]?.unlocked_achievements ?? [];
}

// ─── Reward Validation ────────────────────────────────────────────────────────

export async function recordDailyLoginClaim(
  playerId: string, claimDate: string, dayNum: number
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO daily_login_claims (player_id, claim_date, day_num) VALUES ($1, $2, $3)`,
      [playerId, claimDate, dayNum]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] daily_login_claims error:', err?.message);
    return 'error';
  }
}

export async function recordMissionClaim(
  playerId: string, missionId: string, periodKey: string
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO mission_claims (player_id, mission_id, period_key) VALUES ($1, $2, $3)`,
      [playerId, missionId, periodKey]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] mission_claims error:', err?.message);
    return 'error';
  }
}

// Tier thresholds shared by daily/weekly mode rewards — keyed by real percentile, not win count.
const MODE_REWARD_TIERS = [
  { tier: 'TOP 1%', maxPct: 1 },
  { tier: 'TOP 3%', maxPct: 3 },
  { tier: 'TOP 5%', maxPct: 5 },
];
const MODE_REWARD_TICKETS: Record<'daily' | 'weekly', Record<string, number>> = {
  daily:  { 'TOP 1%': 10, 'TOP 3%': 5,  'TOP 5%': 3  },
  weekly: { 'TOP 1%': 30, 'TOP 3%': 20, 'TOP 5%': 10 },
};

// Real percentile rank among players who won at least once in this mode/period.
// rank=1 (best) always maps to percentile 0, so a lone top player always qualifies
// for the best tier instead of being penalized by a tiny population (the old bug).
export async function getModeRewardPercentile(
  playerId: string, mode: string, periodStart: string, periodEnd: string
): Promise<{ wins: number; rank: number | null; totalWinners: number; percentile: number | null } | null> {
  if (!pool || !dbAvailable) return null;
  try {
    const rows = await pool.query(
      `WITH wins_cte AS (
         SELECT player_id, COUNT(*)::INT AS wins
         FROM game_results
         WHERE mode = $1 AND placement = 1
           AND played_at >= $2 AND played_at < $3
           AND (is_bot_match IS NULL OR is_bot_match = false)
         GROUP BY player_id
       ),
       ranked AS (
         SELECT *, RANK() OVER (ORDER BY wins DESC)::INT AS rank, COUNT(*) OVER ()::INT AS total
         FROM wins_cte
       )
       SELECT wins, rank, total FROM ranked WHERE player_id = $4`,
      [mode, periodStart, periodEnd, playerId]
    );
    const row = rows.rows[0];
    if (!row) return { wins: 0, rank: null, totalWinners: 0, percentile: null };
    const percentile = Math.ceil(((row.rank - 1) / row.total) * 100);
    return { wins: row.wins, rank: row.rank, totalWinners: row.total, percentile };
  } catch (err: any) {
    console.error('[DB] getModeRewardPercentile error:', err?.message);
    return null;
  }
}

function tierForPercentile(pct: number | null): { tier: string } | null {
  if (pct === null) return null;
  return MODE_REWARD_TIERS.find(t => pct <= t.maxPct) || null;
}

// Validates mode reward claim against actual game_results and records idempotently.
// Returns the earned tier, or null if already claimed.
export async function getAndValidateModeRewardClaim(
  playerId: string, mode: string, period: 'daily' | 'weekly', periodKey: string,
  periodStart: string, periodEnd: string
): Promise<{ tier: string; tickets: number } | 'already_claimed' | 'no_reward' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    const stats = await getModeRewardPercentile(playerId, mode, periodStart, periodEnd);
    if (!stats || !stats.wins) return 'no_reward';

    const earned = tierForPercentile(stats.percentile);
    if (!earned) return 'no_reward';
    const tickets = MODE_REWARD_TICKETS[period][earned.tier];

    // Record claim — idempotent
    await pool.query(
      `INSERT INTO mode_reward_claims (player_id, mode, period, period_key, tier, tickets)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [playerId, mode, period, periodKey, earned.tier, tickets]
    );
    return { tier: earned.tier, tickets };
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] mode_reward_claims error:', err?.message);
    return 'error';
  }
}

// Hard-delete all data for a player across every table. Returns true on success.
export async function deletePlayerData(playerId: string): Promise<boolean> {
  if (!pool || !dbAvailable) return false;
  try {
    // Delete in FK-safe order (children before parents)
    await pool.query(`DELETE FROM push_tokens            WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM daily_login_claims     WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM mission_claims         WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM mode_reward_claims     WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM gauntlet_weekly_claims WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM gauntlet_results       WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM gauntlet_mmr           WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM koth_daily_claims      WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM koth_prize_claims      WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM solo_scores            WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM practice_scores        WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM purchase_receipts      WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM promo_redemptions      WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM ring_trades            WHERE seller_id = $1`, [playerId]);
    await pool.query(`DELETE FROM ring_grants            WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM player_notifications   WHERE player_id = $1::TEXT`, [playerId]);
    await pool.query(`DELETE FROM player_save_data       WHERE player_id = $1`, [playerId]);
    await pool.query(
      `DELETE FROM friends
       WHERE requester_player_id = $1 OR target_player_id = $1`, [playerId]
    );
    await pool.query(`DELETE FROM game_results           WHERE player_id = $1`, [playerId]);
    await pool.query(`DELETE FROM players                WHERE player_id = $1`, [playerId]);
    return true;
  } catch (err: any) {
    console.error('[DB] deletePlayerData error:', err?.message);
    return false;
  }
}

// Wipe ALL player data except identity (name, avatar, tag) and push tokens.
// Used for major version resets (e.g. v1.0.0 launch).
export async function resetAllPlayerData(): Promise<{ ok: boolean; error?: string }> {
  if (!pool || !dbAvailable) return { ok: false, error: 'db_unavailable' };
  try {
    // FK-safe order: children before parents; ring_trades → ring_grants → players
    await pool.query(`DELETE FROM ring_trades`);
    await pool.query(`DELETE FROM ring_grants`);
    await pool.query(`DELETE FROM friends`);
    await pool.query(`DELETE FROM game_results`);
    await pool.query(`DELETE FROM gauntlet_results`);
    await pool.query(`DELETE FROM gauntlet_mmr`);
    await pool.query(`DELETE FROM gauntlet_weekly_claims`);
    await pool.query(`DELETE FROM solo_scores`);
    await pool.query(`DELETE FROM solo_level_claims`);
    await pool.query(`DELETE FROM solo_milestone_claims`);
    await pool.query(`DELETE FROM practice_scores`);
    await pool.query(`DELETE FROM purchase_receipts`);
    await pool.query(`DELETE FROM promo_redemptions`);
    await pool.query(`DELETE FROM suspicious_reports`);
    await pool.query(`DELETE FROM player_notifications`);
    await pool.query(`DELETE FROM player_save_data`);
    await pool.query(`DELETE FROM daily_login_claims`);
    await pool.query(`DELETE FROM mission_claims`);
    await pool.query(`DELETE FROM mode_reward_claims`);
    await pool.query(`DELETE FROM koth_daily_claims`);
    await pool.query(`DELETE FROM koth_prize_claims`);
    await pool.query(`DELETE FROM koth_fastest_claims`);
    await pool.query(`DELETE FROM trophy_milestone_claims`);
    await pool.query(`DELETE FROM achievement_unlocks`);
    await pool.query(`DELETE FROM level_up_claims`);
    await pool.query(`DELETE FROM ad_reward_claims`);
    await pool.query(`DELETE FROM offline_reward_claims`);
    await pool.query(`DELETE FROM dc_claims`);
    await pool.query(`DELETE FROM dc_swap_records`);
    await pool.query(`DELETE FROM surprise_grants`);
    await pool.query(`DELETE FROM ticket_events`);
    await pool.query(`DELETE FROM diamond_spends`);
    // Reset stats on players but keep identity (name, avatar, player_tag, player_id)
    await pool.query(`
      UPDATE players SET
        mmr                  = 1000,
        peak_mmr             = 1000,
        trophy_points        = 0,
        achievement_count    = 0,
        achievement_total    = 108,
        unlocked_achievements = '{}',
        diamonds             = 0,
        trusted_diamonds     = NULL
    `);
    return { ok: true };
  } catch (err: any) {
    console.error('[DB] resetAllPlayerData error:', err?.message);
    return { ok: false, error: err?.message };
  }
}

// Returns the most-played mode string for a player, or null.
export async function getFavoriteMode(playerId: string): Promise<string | null> {
  const rows = await query(`
    SELECT mode, COUNT(*) AS cnt
    FROM game_results
    WHERE player_id = $1
    GROUP BY mode
    ORDER BY cnt DESC
    LIMIT 1
  `, [playerId]);
  return rows && rows.length > 0 ? rows[0].mode : null;
}

// ─── News & Announcements ──────────────────────────────────────────────────────

const NEWS_COLS = 'id, title, body, type, image_url, created_at, expires_at, pinned';
const NEWS_ACTIVE = `(expires_at IS NULL OR expires_at > now())`;

export async function getNews(): Promise<any[]> {
  const rows = await query(`
    SELECT ${NEWS_COLS} FROM news_posts
    WHERE ${NEWS_ACTIVE}
    ORDER BY pinned DESC, created_at DESC
    LIMIT 20
  `);
  return rows || [];
}

export async function getLatestNews(): Promise<any | null> {
  const rows = await query(`
    SELECT ${NEWS_COLS} FROM news_posts
    WHERE ${NEWS_ACTIVE}
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function createNewsPost(
  title: string,
  body: string,
  type: string,
  imageUrl: string | null,
  expiresAt: string | null,
  pinned: boolean
): Promise<any | null> {
  const validTypes = ['news', 'event', 'update', 'maintenance'];
  const safeType = validTypes.includes(type) ? type : 'news';
  const rows = await query(`
    INSERT INTO news_posts (title, body, type, image_url, expires_at, pinned)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING ${NEWS_COLS}
  `, [title, body, safeType, imageUrl || null, expiresAt || null, !!pinned]);
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function deleteNewsPost(id: number): Promise<boolean> {
  const rows = await query(`DELETE FROM news_posts WHERE id = $1 RETURNING id`, [id]);
  return !!(rows && rows.length > 0);
}

// ─── Player Notifications (Inbox) ─────────────────────────────────────────────

export async function getPlayerNotifications(playerId: string): Promise<any[]> {
  const rows = await query(`
    SELECT id, player_id, title, body, type, reward_type, reward_amount,
           read_at, claimed_at, created_at
    FROM player_notifications
    WHERE player_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `, [playerId]);
  return rows || [];
}

export async function markNotificationRead(notificationId: number, playerId: string): Promise<boolean> {
  const rows = await query(`
    UPDATE player_notifications
    SET read_at = now()
    WHERE id = $1 AND player_id = $2 AND read_at IS NULL
    RETURNING id
  `, [notificationId, playerId]);
  return (rows?.length ?? 0) > 0;
}

export async function claimNotificationReward(notificationId: number, playerId: string): Promise<any | null> {
  const rows = await query(`
    UPDATE player_notifications
    SET claimed_at = now(), read_at = COALESCE(read_at, now())
    WHERE id = $1 AND player_id = $2 AND claimed_at IS NULL AND reward_type IS NOT NULL
    RETURNING id, reward_type, reward_amount
  `, [notificationId, playerId]);
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function createPlayerNotification(
  playerId: string,
  title: string,
  body: string,
  type: string = 'message',
  rewardType: string | null = null,
  rewardAmount: number | null = null
): Promise<any | null> {
  const validTypes = ['message', 'friend', 'reward', 'season', 'admin'];
  const safeType = validTypes.includes(type) ? type : 'message';
  const rows = await query(`
    INSERT INTO player_notifications (player_id, title, body, type, reward_type, reward_amount)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [playerId, title, body, safeType, rewardType ?? null, rewardAmount ?? null]);
  return rows && rows.length > 0 ? rows[0] : null;
}

// ─── Cloud Save ────────────────────────────────────────────────────────────────

// Returns { ok: true, newVersion } | { ok: false, conflict: true, serverVersion }
export async function savePlayerData(
  playerId: string,
  saveJson: string,
  clientVersion?: number
): Promise<{ ok: boolean; newVersion?: number; conflict?: boolean; serverVersion?: number }> {
  if (!pool || !dbAvailable) return { ok: false };
  try {
    if (clientVersion !== undefined) {
      // Optimistic-lock: only update if DB version matches client version
      const result = await pool.query(
        `INSERT INTO player_save_data (player_id, save_json, save_version, updated_at)
         VALUES ($1, $2, 1, now())
         ON CONFLICT (player_id) DO UPDATE
           SET save_json    = EXCLUDED.save_json,
               save_version = player_save_data.save_version + 1,
               updated_at   = now()
         WHERE player_save_data.save_version = $3
         RETURNING save_version`,
        [playerId, saveJson, clientVersion]
      );
      if (result.rows.length === 0) {
        // Conflict — another device saved a newer version
        const cur = await pool.query(
          `SELECT save_version FROM player_save_data WHERE player_id = $1`, [playerId]
        );
        return { ok: false, conflict: true, serverVersion: cur.rows[0]?.save_version ?? 0 };
      }
      return { ok: true, newVersion: result.rows[0].save_version };
    } else {
      // No version supplied (legacy / first save) — unconditional upsert
      const result = await pool.query(
        `INSERT INTO player_save_data (player_id, save_json, save_version, updated_at)
         VALUES ($1, $2, 1, now())
         ON CONFLICT (player_id) DO UPDATE
           SET save_json    = EXCLUDED.save_json,
               save_version = player_save_data.save_version + 1,
               updated_at   = now()
         RETURNING save_version`,
        [playerId, saveJson]
      );
      return { ok: true, newVersion: result.rows[0]?.save_version };
    }
  } catch (err) {
    console.error('[DB] savePlayerData error:', err);
    return { ok: false };
  }
}

export async function loadPlayerData(playerId: string): Promise<{ saveJson: string; updatedAt: string; saveVersion: number } | null> {
  const rows = await query(
    `SELECT save_json, updated_at, save_version FROM player_save_data WHERE player_id = $1`,
    [playerId]
  );
  if (!rows?.length) return null;
  return { saveJson: rows[0].save_json, updatedAt: rows[0].updated_at, saveVersion: rows[0].save_version ?? 1 };
}

// ─── Patient Angler Save ──────────────────────────────────────────────────────

export async function savePASave(uid: string, saveJson: string): Promise<boolean> {
  if (!pool || !dbAvailable) return false;
  try {
    await query(
      `INSERT INTO pa_save_data (uid, save_json, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (uid) DO UPDATE SET
         save_json  = EXCLUDED.save_json,
         updated_at = now()`,
      [uid, saveJson]
    );
    return true;
  } catch (err) {
    console.error('[DB] savePASave error:', err);
    return false;
  }
}

export async function loadPASave(uid: string): Promise<{ saveJson: string; updatedAt: string } | null> {
  const rows = await query(
    `SELECT save_json, updated_at FROM pa_save_data WHERE uid = $1`,
    [uid]
  );
  if (!rows?.length) return null;
  return { saveJson: rows[0].save_json, updatedAt: rows[0].updated_at };
}

// ─── Patient Angler Redeem Codes ──────────────────────────────────────────────

export async function checkAndRecordPARedeem(
  uid: string,
  code: string
): Promise<'ok' | 'already_redeemed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO pa_codes_used (code, uid) VALUES ($1, $2)`,
      [code, uid]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_redeemed'; // unique violation = already used
    console.error('[DB] pa redeem error:', err);
    return 'error';
  }
}

// ─── Push Tokens ───────────────────────────────────────────────────────────────

export async function upsertPushToken(playerId: string, token: string, platform: string): Promise<boolean> {
  const rows = await query(`
    INSERT INTO push_tokens (player_id, token, platform, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (token) DO UPDATE
      SET player_id  = EXCLUDED.player_id,
          platform   = EXCLUDED.platform,
          updated_at = now()
    RETURNING id
  `, [playerId, token, platform]);
  return (rows?.length ?? 0) > 0;
}

export async function getPushTokenCount(): Promise<number> {
  const rows = await query(`SELECT COUNT(*)::INT AS total FROM push_tokens`);
  return rows?.[0]?.total ?? 0;
}

export async function getPlayerPushToken(playerId: string): Promise<string | null> {
  const rows = await query(
    `SELECT token FROM push_tokens WHERE player_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [playerId]
  );
  return rows?.[0]?.token ?? null;
}

// ─── Promo Codes ───────────────────────────────────────────────────────────────

// Returns 'ok' | 'already_redeemed' | 'max_uses_reached' | 'error'
export async function checkAndRecordPromoRedemption(
  playerId: string,
  code: string,
  maxUses: number = 999999
): Promise<'ok' | 'already_redeemed' | 'max_uses_reached' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    if (maxUses < 999999) {
      const countRow = await pool.query(
        `SELECT COUNT(*)::INT AS n FROM promo_redemptions WHERE code = $1`,
        [code]
      );
      if ((countRow.rows[0]?.n ?? 0) >= maxUses) return 'max_uses_reached';
    }
    await pool.query(
      `INSERT INTO promo_redemptions (code, player_id) VALUES ($1, $2)`,
      [code, playerId]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_redeemed';
    console.error('[DB] promo redemption error:', err);
    return 'error';
  }
}

export async function getPromoStats(): Promise<any[]> {
  const rows = await query(`
    SELECT code, COUNT(*)::INT AS redemptions, MAX(redeemed_at) AS last_redeemed_at
    FROM promo_redemptions
    GROUP BY code
    ORDER BY redemptions DESC
  `);
  return rows || [];
}

// ─── Economy Integrity ─────────────────────────────────────────────────────────

// Returns null when player has never been through the validation system yet
export async function getTrustedDiamonds(playerId: string): Promise<number | null> {
  const rows = await query(
    `SELECT trusted_diamonds FROM players WHERE player_id = $1`,
    [playerId]
  );
  if (!rows?.length) return null;
  return rows[0].trusted_diamonds ?? null;
}

export async function setTrustedDiamonds(playerId: string, diamonds: number): Promise<void> {
  await query(
    `UPDATE players SET trusted_diamonds = $1 WHERE player_id = $2`,
    [diamonds, playerId]
  );
}

// Atomic increment — used when server issues a reward (promo code, inbox claim)
// COALESCE handles the NULL bootstrap case: first server-issued reward sets the ceiling
export async function addTrustedDiamonds(playerId: string, amount: number): Promise<void> {
  await query(
    `UPDATE players SET trusted_diamonds = COALESCE(trusted_diamonds, 0) + $1 WHERE player_id = $2`,
    [amount, playerId]
  );
}

// ─── KOTH Leaderboards ────────────────────────────────────────────────────────

// Weekly KOTH leaderboard — top 20 players by 1st-place finishes in KOTH mode.
// period 'current' = this calendar week (Mon 00:00 UTC onward)
// period 'prev'    = the week that just ended (useful for prize distribution)
export async function getKothWeeklyLeaderboard(
  playerId: string,
  period: 'current' | 'prev' = 'current'
): Promise<{ weekly: any[]; playerRank: number | null; playerWins: number } | null> {
  const timeFilter = period === 'prev'
    ? `AND played_at >= date_trunc('week', now() - interval '7 days')
       AND played_at <  date_trunc('week', now())`
    : `AND played_at >= date_trunc('week', now())`;

  const rows = await query(`
    WITH wins_cte AS (
      SELECT
        p.player_id,
        p.player_name,
        p.avatar,
        COUNT(*)::INT AS wins
      FROM game_results gr
      JOIN players p ON p.player_id = gr.player_id
      WHERE gr.mode = 'koth'
        AND gr.placement = 1
        ${timeFilter}
      GROUP BY p.player_id, p.player_name, p.avatar
    ),
    ranked AS (
      SELECT *, RANK() OVER (ORDER BY wins DESC)::INT AS rank
      FROM wins_cte
    )
    SELECT * FROM ranked ORDER BY rank ASC LIMIT 20
  `);

  if (!rows) return null;

  const playerRow = rows.find((r: any) => r.player_id === playerId);
  let playerRank: number | null = playerRow ? playerRow.rank : null;
  let playerWins: number        = playerRow ? playerRow.wins : 0;

  // Player is outside top 20 — do a targeted rank lookup
  if (!playerRow) {
    const fallbackRows = await query(`
      WITH wins_cte AS (
        SELECT player_id, COUNT(*)::INT AS wins
        FROM game_results
        WHERE mode = 'koth' AND placement = 1
          ${timeFilter}
        GROUP BY player_id
      )
      SELECT wins, RANK() OVER (ORDER BY wins DESC)::INT AS rank
      FROM wins_cte
      WHERE player_id = $1
    `, [playerId]);
    if (fallbackRows?.length) {
      playerRank = fallbackRows[0].rank;
      playerWins = fallbackRows[0].wins;
    }
  }

  return {
    weekly: rows.map((r: any) => ({
      rank:        r.rank,
      player_id:   r.player_id,
      player_name: r.player_name,
      avatar:      r.avatar,
      wins:        r.wins,
    })),
    playerRank,
    playerWins,
  };
}

// Daily KOTH stats — player's percentile among all KOTH players today.
// Percentile is rank/totalPlayers * 100 (lower = better: rank 1 of 100 = 1%).
export async function getKothDailyStats(
  playerId: string
): Promise<{
  leaderboard:      any[];
  playerRank:       number | null;
  playerPercentile: number | null;
  playerWins:       number;
  totalPlayers:     number;
} | null> {
  // Total distinct players who entered a KOTH game today (denominator for percentile)
  const countRows = await query(`
    SELECT COUNT(DISTINCT player_id)::INT AS total
    FROM game_results
    WHERE mode = 'koth'
      AND played_at >= date_trunc('day', now())
  `);
  if (!countRows) return null;
  const totalPlayers: number = countRows[0]?.total ?? 0;

  // Top 50 KOTH winners today ranked by win count
  const rows = await query(`
    WITH wins_cte AS (
      SELECT
        p.player_id,
        p.player_name,
        p.avatar,
        COUNT(*)::INT AS wins
      FROM game_results gr
      JOIN players p ON p.player_id = gr.player_id
      WHERE gr.mode = 'koth'
        AND gr.placement = 1
        AND gr.played_at >= date_trunc('day', now())
      GROUP BY p.player_id, p.player_name, p.avatar
    ),
    ranked AS (
      SELECT *, RANK() OVER (ORDER BY wins DESC)::INT AS rank
      FROM wins_cte
    )
    SELECT * FROM ranked ORDER BY rank ASC LIMIT 50
  `);
  if (!rows) return null;

  const playerRow = rows.find((r: any) => r.player_id === playerId);
  let playerRank:       number | null = null;
  let playerPercentile: number | null = null;
  let playerWins = 0;

  if (playerRow && totalPlayers > 0) {
    playerRank       = playerRow.rank;
    playerWins       = playerRow.wins;
    playerPercentile = Math.ceil((playerRank / totalPlayers) * 100);
  }

  return {
    leaderboard: rows.slice(0, 20).map((r: any) => ({
      rank:        r.rank,
      player_id:   r.player_id,
      player_name: r.player_name,
      avatar:      r.avatar,
      wins:        r.wins,
    })),
    playerRank,
    playerPercentile,
    playerWins,
    totalPlayers,
  };
}

// ─── KOTH Claim Functions ─────────────────────────────────────────────────────

// Server-side KOTH daily reward claim. Uses server's current UTC date.
// Returns null on DB error, otherwise an ok/reason object.
export async function claimKothDailyReward(
  playerId: string
): Promise<{ ok: boolean; reason?: string; tier?: string; diamonds?: number } | null> {
  if (!pool || !dbAvailable) return null;

  const dailyStats = await getKothDailyStats(playerId);
  if (!dailyStats) return null;

  const { playerPercentile } = dailyStats;
  if (playerPercentile === null) return { ok: false, reason: 'not_ranked' };

  const TIERS = [
    { tier: 'TOP 1%', maxPct: 1,  diamonds: 125 },
    { tier: 'TOP 3%', maxPct: 3,  diamonds: 75  },
    { tier: 'TOP 5%', maxPct: 5,  diamonds: 25  },
  ];
  const eligible = TIERS.find(t => playerPercentile <= t.maxPct);
  if (!eligible) return { ok: false, reason: 'not_eligible' };

  const todayUtc = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC

  try {
    await pool.query(
      `INSERT INTO koth_daily_claims (player_id, claim_date, tier, diamonds)
       VALUES ($1, $2::date, $3, $4)`,
      [playerId, todayUtc, eligible.tier, eligible.diamonds]
    );
  } catch (err: any) {
    if (err.code === '23505') return { ok: false, reason: 'already_claimed' };
    console.error('[DB] koth_daily_claims insert error:', err);
    return null;
  }

  await addTrustedDiamonds(playerId, eligible.diamonds);
  return { ok: true, tier: eligible.tier, diamonds: eligible.diamonds };
}

// Server-side KOTH weekly prize claim. weekStart: ISO Monday date "YYYY-MM-DD".
// Uses ROW_NUMBER (not RANK) for deterministic tiebreaking so prizes are never over-distributed.
// Returns null on DB error, otherwise an ok/reason object.
export async function claimKothWeeklyPrize(
  playerId: string,
  weekStart: string
): Promise<{ ok: boolean; reason?: string; rank?: number; prize?: number } | null> {
  if (!pool || !dbAvailable) return null;

  // Deterministic tiebreaker: player_id ASC so ties always resolve the same way
  const rankRows = await query(`
    WITH wins_cte AS (
      SELECT player_id, COUNT(*)::INT AS wins
      FROM game_results
      WHERE mode = 'koth'
        AND placement = 1
        AND played_at >= $1::date
        AND played_at <  $1::date + INTERVAL '7 days'
      GROUP BY player_id
    )
    SELECT
      player_id,
      wins,
      ROW_NUMBER() OVER (ORDER BY wins DESC, player_id ASC)::INT AS prize_rank
    FROM wins_cte
    WHERE player_id = $2
  `, [weekStart, playerId]);

  if (!rankRows || rankRows.length === 0) return { ok: false, reason: 'not_ranked' };
  const prizeRank: number = rankRows[0].prize_rank;
  if (prizeRank > 3) return { ok: false, reason: 'not_top3' };

  // Server-authoritative pool: every game_results row for KOTH = one paid entry fee
  const poolRows = await query(`
    SELECT COUNT(*)::INT AS game_count
    FROM game_results
    WHERE mode = 'koth'
      AND played_at >= $1::date
      AND played_at <  $1::date + INTERVAL '7 days'
  `, [weekStart]);
  const gameCount: number = poolRows?.[0]?.game_count ?? 0;
  const PRIZES = [0.60, 0.25, 0.15];
  const prize = Math.floor(gameCount * 50 * 0.5 * PRIZES[prizeRank - 1]);

  try {
    await pool.query(
      `INSERT INTO koth_prize_claims (player_id, week_start, rank, prize)
       VALUES ($1, $2::date, $3, $4)`,
      [playerId, weekStart, prizeRank, prize]
    );
  } catch (err: any) {
    if (err.code === '23505') {
      // Already claimed — return the stored result so the client can apply it
      const existing = await query(
        `SELECT rank, prize FROM koth_prize_claims WHERE player_id = $1 AND week_start = $2::date`,
        [playerId, weekStart]
      );
      if (existing?.length) {
        return { ok: false, reason: 'already_claimed', rank: existing[0].rank, prize: existing[0].prize };
      }
      return { ok: false, reason: 'already_claimed' };
    }
    console.error('[DB] koth_prize_claims insert error:', err);
    return null;
  }

  if (prize > 0) await addTrustedDiamonds(playerId, prize);

  const placeLabels = ['1st', '2nd', '3rd'];
  await createPlayerNotification(
    playerId,
    `👑 KOTH ${placeLabels[prizeRank - 1]} Place Prize!`,
    `You finished #${prizeRank} in King of the Hill this week and earned 💎 ${prize.toLocaleString()} diamonds!`,
    'reward',
    'diamonds',
    prize
  );

  return { ok: true, rank: prizeRank, prize };
}

// ─── IAP Purchase Receipts ────────────────────────────────────────────────────

// Returns 'ok' | 'already_processed' | 'error'
export async function recordPurchaseReceipt(
  playerId: string,
  productId: string,
  purchaseToken: string,
  orderId: string,
  grantedJson: string
): Promise<'ok' | 'already_processed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO purchase_receipts (player_id, product_id, purchase_token, order_id, granted_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [playerId, productId, purchaseToken, orderId || '', grantedJson]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_processed';
    console.error('[DB] recordPurchaseReceipt error:', err);
    return 'error';
  }
}

// Returns the granted_json for an already-processed token, or null if not found.
export async function getPurchaseReceipt(purchaseToken: string): Promise<string | null> {
  const rows = await query(
    `SELECT granted_json FROM purchase_receipts WHERE purchase_token = $1`,
    [purchaseToken]
  );
  return rows && rows.length > 0 ? rows[0].granted_json : null;
}

// Returns all processed purchase tokens for a player (used by restore to skip already-granted items).
export async function getProcessedTokens(playerId: string): Promise<Set<string>> {
  const rows = await query(
    `SELECT purchase_token FROM purchase_receipts WHERE player_id = $1`,
    [playerId]
  );
  return new Set((rows || []).map((r: any) => r.purchase_token));
}

// Returns aggregated spend stats derived from purchase_receipts — used to re-hydrate
// whale achievement progress (totalSpentCents etc.) after a localStorage wipe.
export async function getPurchaseSpendStats(playerId: string): Promise<{
  totalSpentCents: number;
  singlePurchaseMax: number;
  bundlesBought: number;
  purchaseCount: number;
} | null> {
  const rows = await query(
    `SELECT
       COUNT(*)::int                                                                    AS purchase_count,
       COALESCE(SUM(ROUND((granted_json::jsonb->>'priceVal')::numeric * 100)), 0)::int AS total_spent_cents,
       COALESCE(MAX(ROUND((granted_json::jsonb->>'priceVal')::numeric * 100)), 0)::int AS single_purchase_max,
       COUNT(CASE WHEN granted_json::jsonb ? 'bundleId' THEN 1 END)::int              AS bundles_bought
     FROM purchase_receipts
     WHERE player_id = $1`,
    [playerId]
  );
  if (!rows || rows.length === 0) return null;
  return {
    totalSpentCents:   Number(rows[0].total_spent_cents),
    singlePurchaseMax: Number(rows[0].single_purchase_max),
    bundlesBought:     Number(rows[0].bundles_bought),
    purchaseCount:     Number(rows[0].purchase_count),
  };
}

// ─── Ring Grants & Trades ─────────────────────────────────────────────────────

function _uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Issue a new ring grant — called by the server's spin endpoint.
export async function createRingGrant(
  playerId: string, ringId: string, rarityId: string, spinType: string
): Promise<string | null> {
  const grantId = _uuid();
  const rows = await query(
    `INSERT INTO ring_grants (grant_id, player_id, ring_id, rarity_id, spin_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING grant_id`,
    [grantId, playerId, ringId, rarityId, spinType]
  );
  return rows && rows.length > 0 ? rows[0].grant_id : null;
}

// Validate a grant belongs to the correct player and ring, and is not already in trade.
// Returns: 'ok' | 'not_found' | 'wrong_player' | 'wrong_ring' | 'already_in_trade' | 'traded'
export async function validateRingGrant(
  grantId: string, playerId: string, ringId: string
): Promise<string> {
  const rows = await query(
    `SELECT player_id, ring_id, status FROM ring_grants WHERE grant_id = $1`,
    [grantId]
  );
  if (!rows || rows.length === 0) return 'not_found';
  const g = rows[0];
  if (g.player_id !== playerId)  return 'wrong_player';
  if (g.ring_id   !== ringId)    return 'wrong_ring';
  if (g.status === 'in_trade')   return 'already_in_trade';
  if (g.status === 'traded')     return 'traded';
  return 'ok';
}

// Create a trade code — marks the grant as 'in_trade' and inserts into ring_trades.
export async function createRingTrade(
  playerId: string, grantId: string, ringId: string
): Promise<string | null> {
  if (!pool || !dbAvailable) return null;
  // Generate a human-readable 8-char code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'R-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];

  try {
    await pool.query('BEGIN');
    await pool.query(
      `UPDATE ring_grants SET status = 'in_trade' WHERE grant_id = $1 AND status = 'held'`,
      [grantId]
    );
    await pool.query(
      `INSERT INTO ring_trades (trade_code, grant_id, seller_id, ring_id)
       VALUES ($1, $2, $3, $4)`,
      [code, grantId, playerId, ringId]
    );
    await pool.query('COMMIT');
    return code;
  } catch (err: any) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[DB] createRingTrade error:', err);
    return null;
  }
}

// Accept a trade — transfers the ring to the claimer.
// Returns { ringId, rarityId, newGrantId } on success, or null on failure.
export async function acceptRingTrade(
  claimerPlayerId: string, tradeCode: string
): Promise<{ ringId: string; rarityId: string; newGrantId: string } | null | 'not_found' | 'expired' | 'self'> {
  if (!pool || !dbAvailable) return null;

  const rows = await query(
    `SELECT t.grant_id, t.seller_id, t.ring_id, t.status, t.expires_at,
            g.rarity_id, g.spin_type
     FROM ring_trades t
     JOIN ring_grants g ON g.grant_id = t.grant_id
     WHERE t.trade_code = $1`,
    [tradeCode]
  );
  if (!rows || rows.length === 0) return 'not_found';
  const trade = rows[0];
  if (trade.status !== 'active') return 'not_found';
  if (new Date(trade.expires_at) < new Date()) return 'expired';
  if (trade.seller_id === claimerPlayerId) return 'self';

  const newGrantId = _uuid();
  try {
    await pool.query('BEGIN');
    // Mark old grant as traded
    await pool.query(
      `UPDATE ring_grants SET status = 'traded' WHERE grant_id = $1`,
      [trade.grant_id]
    );
    // Mark trade as completed
    await pool.query(
      `UPDATE ring_trades SET status = 'completed' WHERE trade_code = $1`,
      [tradeCode]
    );
    // Issue new grant to claimer
    await pool.query(
      `INSERT INTO ring_grants (grant_id, player_id, ring_id, rarity_id, spin_type)
       VALUES ($1, $2, $3, $4, $5)`,
      [newGrantId, claimerPlayerId, trade.ring_id, trade.rarity_id, 'trade']
    );
    await pool.query('COMMIT');
    return { ringId: trade.ring_id, rarityId: trade.rarity_id, newGrantId };
  } catch (err: any) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('[DB] acceptRingTrade error:', err);
    return null;
  }
}

// Cancel a trade — returns the grant to 'held' status.
export async function cancelRingTrade(
  playerId: string, tradeCode: string
): Promise<boolean> {
  if (!pool || !dbAvailable) return false;
  const rows = await query(
    `SELECT grant_id, seller_id FROM ring_trades WHERE trade_code = $1 AND status = 'active'`,
    [tradeCode]
  );
  if (!rows || rows.length === 0) return false;
  if (rows[0].seller_id !== playerId) return false;

  try {
    await pool.query('BEGIN');
    await pool.query(
      `UPDATE ring_grants SET status = 'held' WHERE grant_id = $1`,
      [rows[0].grant_id]
    );
    await pool.query(
      `UPDATE ring_trades SET status = 'cancelled' WHERE trade_code = $1`,
      [tradeCode]
    );
    await pool.query('COMMIT');
    return true;
  } catch (err: any) {
    await pool.query('ROLLBACK').catch(() => {});
    return false;
  }
}

// ─── Practice Scores ──────────────────────────────────────────────────────────

// UPSERT a player's practice score — only advances the columns that improved.
export async function upsertPracticeScore(
  playerId: string,
  playerName: string,
  avatar: string,
  taps30s: number,
  reactionMs: number
): Promise<void> {
  await query(`
    INSERT INTO practice_scores (player_id, player_name, avatar, best_taps_30s, best_reaction_ms, updated_at)
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (player_id) DO UPDATE
      SET player_name      = EXCLUDED.player_name,
          avatar           = EXCLUDED.avatar,
          best_taps_30s    = GREATEST(practice_scores.best_taps_30s,    EXCLUDED.best_taps_30s),
          best_reaction_ms = CASE
            WHEN EXCLUDED.best_reaction_ms > 0
             AND (practice_scores.best_reaction_ms = 0
                  OR EXCLUDED.best_reaction_ms < practice_scores.best_reaction_ms)
            THEN EXCLUDED.best_reaction_ms
            ELSE practice_scores.best_reaction_ms
          END,
          updated_at       = now()
  `, [playerId, playerName, avatar, taps30s, reactionMs]);
}

// Top 10 by taps (descending) and top 10 by reaction (ascending, 0s excluded).
export async function getPracticeLeaderboard(): Promise<{
  taps: any[];
  reaction: any[];
} | null> {
  const [taps, reaction] = await Promise.all([
    query(`
      SELECT player_id, player_name, avatar, best_taps_30s AS value
      FROM practice_scores
      WHERE best_taps_30s > 0
      ORDER BY best_taps_30s DESC
      LIMIT 10
    `),
    query(`
      SELECT player_id, player_name, avatar, best_reaction_ms AS value
      FROM practice_scores
      WHERE best_reaction_ms > 0
      ORDER BY best_reaction_ms ASC
      LIMIT 10
    `),
  ]);
  if (taps === null && reaction === null) return null;
  return { taps: taps || [], reaction: reaction || [] };
}

// ─── Gauntlet MMR ─────────────────────────────────────────────────────────────

export async function upsertGauntletMMR(
  playerId: string, newMmr: number, isWin: boolean
): Promise<void> {
  if (!pool) return;
  try {
    // Fetch current name/avatar from players table for the leaderboard
    const pRows = await pool.query(
      `SELECT player_name, avatar FROM players WHERE player_id = $1`, [playerId]
    );
    const name   = pRows.rows[0]?.player_name || '';
    const avatar = pRows.rows[0]?.avatar || '🔥';

    await pool.query(`
      INSERT INTO gauntlet_mmr (player_id, player_name, avatar, mmr, peak_mmr, total_games, total_wins, updated_at)
      VALUES ($1, $2, $3, $4, $4, 1, $5, now())
      ON CONFLICT (player_id) DO UPDATE SET
        player_name = EXCLUDED.player_name,
        avatar      = EXCLUDED.avatar,
        mmr         = EXCLUDED.mmr,
        peak_mmr    = GREATEST(gauntlet_mmr.peak_mmr, EXCLUDED.mmr),
        total_games = gauntlet_mmr.total_games + 1,
        total_wins  = gauntlet_mmr.total_wins + $5,
        updated_at  = now()
    `, [playerId, name, avatar, newMmr, isWin ? 1 : 0]);
  } catch (e: any) {
    console.error('[DB] upsertGauntletMMR error:', e?.message);
  }
}

export async function recordGauntletResult(
  sessionId: string, playerId: string,
  placement: number, score: number, taps: number,
  mmrBefore: number, mmrDelta: number
): Promise<void> {
  await query(`
    INSERT INTO gauntlet_results (session_id, player_id, placement, score, taps, mmr_before, mmr_delta)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [sessionId, playerId, placement, score, taps, mmrBefore, mmrDelta]);
}

export async function getGauntletMMR(playerId: string): Promise<{
  mmr: number; peak_mmr: number; total_games: number; total_wins: number;
} | null> {
  const rows = await query(
    `SELECT mmr, peak_mmr, total_games, total_wins FROM gauntlet_mmr WHERE player_id = $1`,
    [playerId]
  );
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

export async function getGauntletLeaderboard(playerId?: string): Promise<any[] | null> {
  if (!pool) return null;
  try {
    const rows = await pool.query(`
      SELECT
        player_name, avatar, mmr, peak_mmr, total_games, total_wins,
        RANK() OVER (ORDER BY mmr DESC) AS rank,
        player_id = $1 AS is_me
      FROM gauntlet_mmr
      ORDER BY mmr DESC
      LIMIT 50
    `, [playerId || '']);
    return rows.rows;
  } catch (e: any) {
    console.error('[DB] getGauntletLeaderboard error:', e?.message);
    return null;
  }
}

// Returns 'ok' | 'already_claimed' | 'not_eligible' | 'error'
export async function claimGauntletWeeklyReward(
  playerId: string,
  weekStart: string,
  rank: number,
  total: number,
  spins: number,
  diamonds: number
): Promise<'ok' | 'already_claimed' | 'not_eligible' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO gauntlet_weekly_claims (player_id, week_start, rank, total, spins, diamonds)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [playerId, weekStart, rank, total, spins, diamonds]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] gauntlet weekly claim error:', err?.message);
    return 'error';
  }
}

// ─── Trophy Road Milestone Claims ─────────────────────────────────────────────

export async function recordTrophyMilestoneClaim(
  playerId: string, milestonePts: number
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO trophy_milestone_claims (player_id, milestone_pts) VALUES ($1, $2)`,
      [playerId, milestonePts]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] trophy milestone claim error:', err?.message);
    return 'error';
  }
}

// ─── Achievement Unlocks ───────────────────────────────────────────────────────

export async function recordAchievementUnlock(
  playerId: string, achievementId: string
): Promise<'ok' | 'already_unlocked' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO achievement_unlocks (player_id, achievement_id) VALUES ($1, $2)`,
      [playerId, achievementId]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_unlocked';
    console.error('[DB] achievement unlock error:', err?.message);
    return 'error';
  }
}

// Returns true if the player has already unlocked this achievement
export async function hasAchievementUnlock(playerId: string, achievementId: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM achievement_unlocks WHERE player_id = $1 AND achievement_id = $2`,
    [playerId, achievementId]
  );
  return (rows?.length ?? 0) > 0;
}

// ─── Ad Reward Claims ──────────────────────────────────────────────────────────

const AD_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Returns true if the player may claim an ad reward right now (server-side check)
export async function checkAdRewardCooldown(playerId: string): Promise<boolean> {
  const rows = await query(
    `SELECT claimed_at FROM ad_reward_claims
     WHERE player_id = $1
     ORDER BY claimed_at DESC LIMIT 1`,
    [playerId]
  );
  if (!rows || rows.length === 0) return true;
  const last = new Date(rows[0].claimed_at).getTime();
  return (Date.now() - last) >= AD_COOLDOWN_MS;
}

export async function recordAdRewardClaim(
  playerId: string, rewardType: string
): Promise<void> {
  await query(
    `INSERT INTO ad_reward_claims (player_id, reward_type) VALUES ($1, $2)`,
    [playerId, rewardType]
  );
}

// ─── Offline Reward Claims ─────────────────────────────────────────────────────

export async function recordOfflineRewardClaim(
  playerId: string, claimDate: string, amount: number
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO offline_reward_claims (player_id, claim_date, amount) VALUES ($1, $2::date, $3)`,
      [playerId, claimDate, amount]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] offline reward claim error:', err?.message);
    return 'error';
  }
}

// Returns the server's last_seen_at for a player (used to compute offline time server-side)
export async function getPlayerLastSeen(playerId: string): Promise<Date | null> {
  const rows = await query(
    `SELECT last_seen_at FROM players WHERE player_id = $1`,
    [playerId]
  );
  return rows && rows.length > 0 ? new Date(rows[0].last_seen_at) : null;
}

// ─── Daily Challenge Claims ────────────────────────────────────────────────────

export async function recordDcClaim(
  playerId: string, challengeDate: string, challengeId: string
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO dc_claims (player_id, challenge_date, challenge_id) VALUES ($1, $2::date, $3)`,
      [playerId, challengeDate, challengeId]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] dc claim error:', err?.message);
    return 'error';
  }
}

// ─── Surprise Grants ──────────────────────────────────────────────────────────

export async function recordSurpriseGrant(
  playerId: string, grantDate: string
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
    await pool.query(
      `INSERT INTO surprise_grants (player_id, grant_date) VALUES ($1, $2::date)`,
      [playerId, grantDate]
    );
    return 'ok';
  } catch (err: any) {
    if (err.code === '23505') return 'already_claimed';
    console.error('[DB] surprise grant error:', err?.message);
    return 'error';
  }
}

// ─── Diamond Spend Validation ──────────────────────────────────────────────────

// Records a diamond spend in the audit log. Returns 'ok' | 'error'.
export async function recordDiamondSpend(
  playerId: string, itemId: string, amount: number
): Promise<'ok' | 'error'> {
  try {
    await query(
      `INSERT INTO diamond_spends (player_id, item_id, amount) VALUES ($1, $2, $3)`,
      [playerId, itemId, amount]
    );
    return 'ok';
  } catch (err: any) {
    console.error('[DB] diamond spend error:', err?.message);
    return 'error';
  }
}

// ─── Mission Progress Validation ──────────────────────────────────────────────
// Re-counts game_results for the period to validate game-based missions server-side.

export async function getMissionServerCount(
  playerId: string,
  missionType: string,
  periodStart: string,
  periodEnd: string
): Promise<number> {
  let sql: string;
  switch (missionType) {
    case 'matches':
      sql = `SELECT COUNT(*)::int AS cnt FROM game_results
             WHERE player_id = $1 AND played_at BETWEEN $2::timestamptz AND $3::timestamptz`;
      break;
    case 'wins':
      sql = `SELECT COUNT(*)::int AS cnt FROM game_results
             WHERE player_id = $1 AND placement = 1 AND played_at BETWEEN $2::timestamptz AND $3::timestamptz`;
      break;
    case 'top3':
      sql = `SELECT COUNT(*)::int AS cnt FROM game_results
             WHERE player_id = $1 AND placement <= 3 AND played_at BETWEEN $2::timestamptz AND $3::timestamptz`;
      break;
    case 'taps':
      sql = `SELECT COALESCE(SUM(tiles_tapped),0)::int AS cnt FROM game_results
             WHERE player_id = $1 AND played_at BETWEEN $2::timestamptz AND $3::timestamptz`;
      break;
    case 'mode_wild':
      sql = `SELECT COUNT(*)::int AS cnt FROM game_results
             WHERE player_id = $1 AND mode = 'wild' AND played_at BETWEEN $2::timestamptz AND $3::timestamptz`;
      break;
    case 'mode_buckshot':
      sql = `SELECT COUNT(*)::int AS cnt FROM game_results
             WHERE player_id = $1 AND mode = 'buckshot' AND played_at BETWEEN $2::timestamptz AND $3::timestamptz`;
      break;
    case 'all_modes':
      sql = `SELECT COUNT(DISTINCT mode)::int AS cnt FROM game_results
             WHERE player_id = $1 AND mode IN ('rush','buckshot','wild')
             AND played_at BETWEEN $2::timestamptz AND $3::timestamptz`;
      break;
    default:
      return -1; // type not server-validatable (xp, tickets)
  }
  const rows = await query(sql, [playerId, periodStart, periodEnd]);
  return rows && rows.length > 0 ? (rows[0].cnt ?? 0) : 0;
}

// ─── KOTH Fastest Claims ──────────────────────────────────────────────────────

export async function recordKothFastestClaim(
  playerId: string, claimDate: string, claimType: string, reactionMs: number, diamonds: number
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool) return 'error';
  try {
    await pool.query(
      `INSERT INTO koth_fastest_claims (player_id, claim_date, claim_type, reaction_ms, diamonds)
       VALUES ($1, $2, $3, $4, $5)`,
      [playerId, claimDate, claimType, reactionMs, diamonds]
    );
    return 'ok';
  } catch (err: any) {
    if (err?.code === '23505') return 'already_claimed';
    console.error('[DB] recordKothFastestClaim error:', err);
    return 'error';
  }
}

// ─── Solo Milestone Claims ────────────────────────────────────────────────────

export async function recordSoloMilestoneClaim(
  playerId: string, milestonePts: number, gems: number
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool) return 'error';
  try {
    await pool.query(
      `INSERT INTO solo_milestone_claims (player_id, milestone_pts, gems) VALUES ($1, $2, $3)`,
      [playerId, milestonePts, gems]
    );
    return 'ok';
  } catch (err: any) {
    if (err?.code === '23505') return 'already_claimed';
    console.error('[DB] recordSoloMilestoneClaim error:', err);
    return 'error';
  }
}

// ─── Ticket Events ────────────────────────────────────────────────────────────

export async function recordTicketEvent(
  playerId: string, delta: number, source: string, balance?: number
): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query(
      `INSERT INTO ticket_events (player_id, delta, source, balance) VALUES ($1, $2, $3, $4)`,
      [playerId, delta, source, balance ?? null]
    );
    return true;
  } catch (err) {
    console.error('[DB] recordTicketEvent error:', err);
    return false;
  }
}

// ─── DC Swap Records ─────────────────────────────────────────────────────────

export async function recordDcSwap(
  playerId: string, swapDate: string
): Promise<'ok' | 'already_swapped' | 'error'> {
  if (!pool) return 'error';
  try {
    await pool.query(
      `INSERT INTO dc_swap_records (player_id, swap_date) VALUES ($1, $2)`,
      [playerId, swapDate]
    );
    return 'ok';
  } catch (err: any) {
    if (err?.code === '23505') return 'already_swapped';
    console.error('[DB] recordDcSwap error:', err);
    return 'error';
  }
}

// ─── Level-up Claims ──────────────────────────────────────────────────────────

export async function recordLevelUpClaim(
  playerId: string, level: number
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool) return 'error';
  try {
    await pool.query(
      `INSERT INTO level_up_claims (player_id, level) VALUES ($1, $2)`,
      [playerId, level]
    );
    return 'ok';
  } catch (err: any) {
    if (err?.code === '23505') return 'already_claimed';
    console.error('[DB] recordLevelUpClaim error:', err);
    return 'error';
  }
}

// ─── Solo Level Claims ────────────────────────────────────────────────────────

export async function recordSoloLevelClaim(
  playerId: string, levelNum: number, gemReward: number
): Promise<'ok' | 'already_claimed' | 'error'> {
  if (!pool) return 'error';
  try {
    await pool.query(
      `INSERT INTO solo_level_claims (player_id, level_num, gem_reward) VALUES ($1, $2, $3)`,
      [playerId, levelNum, gemReward]
    );
    return 'ok';
  } catch (err: any) {
    if (err?.code === '23505') return 'already_claimed';
    console.error('[DB] recordSoloLevelClaim error:', err);
    return 'error';
  }
}

// ─── Player Game Stats (for achievement precondition validation) ──────────────

export async function getPlayerGameStats(playerId: string): Promise<{
  games: number; wins: number; top3: number; top5: number;
  buckshotWins: number; buckshotGames: number;
  rushWins: number; wildWins: number; wildGames: number;
} | null> {
  if (!pool) return null;
  try {
    const rows = await pool.query(`
      SELECT
        COUNT(*)::int                                                    AS games,
        COUNT(*) FILTER (WHERE placement = 1)::int                      AS wins,
        COUNT(*) FILTER (WHERE placement <= 3)::int                     AS top3,
        COUNT(*) FILTER (WHERE placement <= 5)::int                     AS top5,
        COUNT(*) FILTER (WHERE mode = 'buckshot' AND placement = 1)::int AS buckshot_wins,
        COUNT(*) FILTER (WHERE mode = 'buckshot')::int                  AS buckshot_games,
        COUNT(*) FILTER (WHERE mode = 'rush'     AND placement = 1)::int AS rush_wins,
        COUNT(*) FILTER (WHERE mode = 'wild'     AND placement = 1)::int AS wild_wins,
        COUNT(*) FILTER (WHERE mode = 'wild')::int                      AS wild_games
      FROM game_results
      WHERE player_id = $1
    `, [playerId]);
    const r = rows.rows[0];
    return {
      games: r.games, wins: r.wins, top3: r.top3, top5: r.top5,
      buckshotWins: r.buckshot_wins, buckshotGames: r.buckshot_games,
      rushWins: r.rush_wins, wildWins: r.wild_wins, wildGames: r.wild_games,
    };
  } catch (err) {
    console.error('[DB] getPlayerGameStats error:', err);
    return null;
  }
}
