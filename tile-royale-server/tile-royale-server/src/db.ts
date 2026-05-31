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

    -- Player tag: permanent 4-digit identifier (1000–9999), unique per player
    ALTER TABLE players ADD COLUMN IF NOT EXISTS player_tag INTEGER;

    -- Trophy Road + Achievement summary (synced from client, used in public profiles)
    ALTER TABLE players ADD COLUMN IF NOT EXISTS trophy_points     INTEGER DEFAULT 0;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS achievement_count INTEGER DEFAULT 0;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS achievement_total INTEGER DEFAULT 108;

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
      player_id   UUID         PRIMARY KEY,
      save_json   TEXT         NOT NULL,
      updated_at  TIMESTAMPTZ  DEFAULT now()
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
  `);
  // Indexes created separately so IF NOT EXISTS works (constraints don't support it)
  await pool!.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_player_tag ON players(player_tag);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair       ON friends(requester_player_id, target_player_id);
    CREATE        INDEX IF NOT EXISTS idx_friends_requester  ON friends(requester_player_id);
    CREATE        INDEX IF NOT EXISTS idx_friends_target     ON friends(target_player_id);
    CREATE        INDEX IF NOT EXISTS idx_player_notifs      ON player_notifications(player_id, created_at DESC);
    CREATE        INDEX IF NOT EXISTS idx_player_save_data   ON player_save_data(player_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_token       ON push_tokens(token);
    CREATE        INDEX IF NOT EXISTS idx_push_tokens_player      ON push_tokens(player_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_pair  ON promo_redemptions(code, player_id);
    CREATE        INDEX IF NOT EXISTS idx_promo_redemptions_code  ON promo_redemptions(code);
  `);
  console.log("[DB] Tables ready");
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
  tapStats?: { tilesTapped: number; avgReactionMs: number; bestReactionMs: number }
): Promise<void> {
  await query(`
    INSERT INTO game_results
      (player_id, placement, total_players, mode, tiles_tapped, avg_reaction_ms, best_reaction_ms)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    playerId, placement, totalPlayers, mode,
    tapStats?.tilesTapped  ?? 0,
    tapStats?.avgReactionMs  ?? 0,
    tapStats?.bestReactionMs ?? 0,
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
      WHERE TRUE ${periodFilter}
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
    ),
    weekly_stats AS (
      SELECT
        COUNT(*)                                            AS weekly_games,
        COUNT(*) FILTER (WHERE placement = 1)              AS weekly_wins
      FROM game_results
      WHERE player_id = $1
        AND played_at >= date_trunc('week', now())
    ),
    -- Compute best win streak from ordered game history
    streaks AS (
      SELECT
        placement,
        played_at,
        SUM(CASE WHEN placement != 1 THEN 1 ELSE 0 END)
          OVER (ORDER BY played_at ROWS UNBOUNDED PRECEDING) AS streak_group
      FROM game_results
      WHERE player_id = $1
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
      COALESCE(p.achievement_total, 108)                       AS achievement_total
    FROM players p
    CROSS JOIN player_stats ps
    CROSS JOIN weekly_stats ws
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
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY wins             ASC NULLS LAST)) * 100)::NUMERIC)::INT AS wins_pct,
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY win_rate         ASC NULLS LAST)) * 100)::NUMERIC)::INT AS win_rate_pct,
        ROUND((      PERCENT_RANK() OVER (ORDER BY fastest_reaction ASC NULLS LAST) * 100 )::NUMERIC)::INT AS reaction_pct,
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY tiles_tapped     ASC NULLS LAST)) * 100)::NUMERIC)::INT AS tiles_pct,
        ROUND(((1 - PERCENT_RANK() OVER (ORDER BY diamonds         ASC NULLS LAST)) * 100)::NUMERIC)::INT AS diamonds_pct
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
export async function updatePlayerProgress(
  playerId: string,
  trophyPoints: number,
  achievementCount: number,
  achievementTotal: number,
  diamonds: number
): Promise<void> {
  await query(`
    UPDATE players
    SET trophy_points     = $2,
        achievement_count = $3,
        achievement_total = $4,
        diamonds          = $5
    WHERE player_id = $1
  `, [playerId, trophyPoints, achievementCount, achievementTotal, diamonds]);
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

export async function savePlayerData(playerId: string, saveJson: string): Promise<boolean> {
  const rows = await query(
    `INSERT INTO player_save_data (player_id, save_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (player_id) DO UPDATE
       SET save_json  = EXCLUDED.save_json,
           updated_at = now()
     RETURNING player_id`,
    [playerId, saveJson]
  );
  return (rows?.length ?? 0) > 0;
}

export async function loadPlayerData(playerId: string): Promise<{ saveJson: string; updatedAt: string } | null> {
  const rows = await query(
    `SELECT save_json, updated_at FROM player_save_data WHERE player_id = $1`,
    [playerId]
  );
  if (!rows?.length) return null;
  return { saveJson: rows[0].save_json, updatedAt: rows[0].updated_at };
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

// ─── Promo Codes ───────────────────────────────────────────────────────────────

// Returns 'ok' | 'already_redeemed' | 'error'
export async function checkAndRecordPromoRedemption(
  playerId: string,
  code: string
): Promise<'ok' | 'already_redeemed' | 'error'> {
  if (!pool || !dbAvailable) return 'error';
  try {
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
