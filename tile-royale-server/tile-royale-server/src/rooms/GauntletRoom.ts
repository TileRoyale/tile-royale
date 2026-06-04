import { Room, Client, Delayed } from "@colyseus/core";
import { GauntletRoomState, GauntletPlayer } from "../schema/GauntletState";
import { upsertPlayer, upsertGauntletMMR, recordGauntletResult, getGauntletMMR } from "../db";

// ── Constants (must match client) ─────────────────────────────────────────────
const MAX_PLAYERS       = 30;
const LOBBY_WAIT_MS     = 15_000;
const COUNTDOWN_SECS    = 5;
const ROUND_SECS        = 35;
const PING_INTERVAL_MS  = 3_000;

// Per-second tap-rate limit: 3 taps/s max
const MAX_TAPS_PER_SEC  = 3;
// Absolute max score with full legendary gear (~77 tiles × 20 pts + void)
const MAX_POSSIBLE_SCORE = 1650;

const GM_MMR_TABLE = [
  { from: 1,  to: 1,  delta: 50  },
  { from: 2,  to: 5,  delta: 30  },
  { from: 6,  to: 10, delta: 15  },
  { from: 11, to: 15, delta: 0   },
  { from: 16, to: 20, delta: -10 },
  { from: 21, to: 30, delta: -30 },
];

const BOT_NAMES = [
  "VoidSlayer","CrimsonAce","PhantomX","DarkMatter","NeonRift",
  "Spectral","AbyssWalker","VoidHunter","NullByte","GhostAce",
  "StarKiller","DuskBlade","ChaosEdge","VoidEcho","NightFall",
  "TapBot","QuickFire","Zapper","FlashFinger","TileHunter",
  "NitroNail","SpeedTap","TapStorm","QuickDraw","PixelPop",
  "NeonTap","SwiftClick","BoltFinger","TapStrike","NeonFist",
];
const BOT_AVATARS = [
  "🤖","👾","🔥","⚡","💥","🎯","🌀","🦾","🌟","💫",
  "🎮","🕹️","🏆","⚔️","🛸","🦊","🐺","🦁","🐯","🦅",
  "🐉","🦄","🌙","☄️","🔮","💎","🗡️","🛡️","⚙️","🎭",
];

// Max ring effect caps (5 slots × max-per-slot at secret rarity)
const EFFECT_CAPS = {
  bonusMmr:     0.05,   // 5 × 0.01
  voidTimer:    1.00,   // 5 × 0.20
  tileSpawn:    0.25,   // 5 × 0.05
  plusPoints:   1.00,   // 5 × 0.20
  minusPenalty: 1.00,   // 5 × 0.20
};

function mmrDelta(placement: number): number {
  for (const row of GM_MMR_TABLE) {
    if (placement >= row.from && placement <= row.to) return row.delta;
  }
  return -30;
}

// ── Room ──────────────────────────────────────────────────────────────────────

export class GauntletRoom extends Room<GauntletRoomState> {
  maxClients = MAX_PLAYERS;

  // sessionId → stable UUID
  private playerIds    = new Map<string, string>();
  // sessionId → computed ring effects
  private playerEffects = new Map<string, Record<string, number>>();
  // sessionId → tap timestamps for rate limiting
  private tapHistory   = new Map<string, number[]>();
  // sessionId → MMR at the time of joining (for delta calculation)
  private playerMmrs   = new Map<string, number>();

  private lobbyStarted = false;
  private joinedSet    = new Set<string>();

  private lobbyTimer!:    Delayed;
  private countdownTimer!: Delayed;
  private gameTimer!:     Delayed;
  private pingInterval!:  Delayed;
  private scoreBroadcast!: Delayed;
  private pingTimestamps = new Map<string, number>();
  private clientPings    = new Map<string, number>();

  onCreate() {
    this.setState(new GauntletRoomState());
    this.state.phase = "lobby";

    this.onMessage("tap",  (client, data: { pos: number; correct: boolean; isVoid: boolean }) =>
      this.handleTap(client, data));
    this.onMessage("pong", (client, data: { id: number }) =>
      this.handlePong(client, data.id));

    this.startPingLoop();
    console.log(`[Gauntlet ${this.roomId}] created`);
  }

  onJoin(client: Client, options: any) {
    if (this.joinedSet.has(client.sessionId)) {
      client.leave(4002);
      return;
    }
    if (this.lobbyStarted) {
      client.leave(4003);
      return;
    }
    this.joinedSet.add(client.sessionId);

    const player    = new GauntletPlayer();
    player.sessionId = client.sessionId;
    player.name     = (options?.name   || "Player").substring(0, 16);
    player.avatar   = options?.avatar  || "🔥";
    player.mmr      = Math.max(0, Math.min(99999, parseInt(options?.mmr) || 0));
    player.score    = 0;
    player.taps     = 0;
    player.isBot    = false;
    this.state.players.set(client.sessionId, player);
    this.state.playerCount = this.state.players.size;

    const playerId: string = options?.playerId || "";
    if (playerId) {
      this.playerIds.set(client.sessionId, playerId);
      this.playerMmrs.set(client.sessionId, player.mmr);
      upsertPlayer(playerId, player.name, player.avatar).catch(() => {});
    }

    // Clamp and store ring effects
    const rawEffects = options?.effects || {};
    const effects: Record<string, number> = {};
    for (const key of Object.keys(EFFECT_CAPS)) {
      const cap = EFFECT_CAPS[key as keyof typeof EFFECT_CAPS];
      effects[key] = Math.max(0, Math.min(cap, parseFloat(rawEffects[key]) || 0));
    }
    this.playerEffects.set(client.sessionId, effects);
    this.tapHistory.set(client.sessionId, []);

    console.log(`[Gauntlet ${this.roomId}] ${player.name} joined (${this.state.playerCount}/${MAX_PLAYERS})`);

    // Start 15s lobby on first real join
    if (this.state.playerCount === 1) {
      this.lobbyTimer = this.clock.setTimeout(() => this.fillAndStart(), LOBBY_WAIT_MS);
    }

    // Start immediately when full
    if (this.state.playerCount >= MAX_PLAYERS) {
      this.lobbyTimer?.clear();
      this.fillAndStart();
    }
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p && this.state.phase === "playing") {
      // Player disconnected mid-game — score stays, they get a bad placement
    }
    this.clientPings.delete(client.sessionId);
    this.pingTimestamps.delete(client.sessionId);
  }

  onDispose() {
    console.log(`[Gauntlet ${this.roomId}] disposed`);
  }

  // ── Ping ──────────────────────────────────────────────────────────────────

  private startPingLoop() {
    let id = 0;
    this.pingInterval = this.clock.setInterval(() => {
      id++;
      const now = Date.now();
      this.clients.forEach(c => {
        this.pingTimestamps.set(`${c.sessionId}_${id}`, now);
        c.send("ping", { id, t: now });
      });
    }, PING_INTERVAL_MS);
  }

  private handlePong(client: Client, pingId: number) {
    const key  = `${client.sessionId}_${pingId}`;
    const sent = this.pingTimestamps.get(key);
    if (!sent) return;
    this.pingTimestamps.delete(key);
    const halfRtt = Math.round((Date.now() - sent) / 2);
    this.clientPings.set(client.sessionId, halfRtt);
    const p = this.state.players.get(client.sessionId);
    if (p) p.ping = halfRtt;
  }

  private halfRtt(sessionId: string): number {
    return this.clientPings.get(sessionId) || 0;
  }

  // ── Lobby / start ─────────────────────────────────────────────────────────

  private fillAndStart() {
    if (this.lobbyStarted) return;
    this.lobbyStarted = true;
    this.lock();

    const realCount = this.state.playerCount;
    const botsNeeded = MAX_PLAYERS - realCount;

    for (let i = 0; i < botsNeeded; i++) {
      const bot = new GauntletPlayer();
      const botId = `bot_${i}_${this.roomId}`;
      bot.sessionId = botId;
      bot.name      = BOT_NAMES[i % BOT_NAMES.length];
      bot.avatar    = BOT_AVATARS[i % BOT_AVATARS.length];
      bot.isBot     = true;
      bot.mmr       = Math.floor(Math.random() * 600);
      this.state.players.set(botId, bot);
    }
    this.state.playerCount = MAX_PLAYERS;

    // Pre-generate bot scores now (bots "play" offline)
    this.state.players.forEach((p) => {
      if (!p.isBot) return;
      const taps = Math.floor(Math.random() * 25 + 10);
      const acc  = 0.5 + Math.random() * 0.45;
      p.score = Math.round(taps * acc * 10 - taps * (1 - acc) * 10);
      p.taps  = taps;
    });

    this.startCountdown();
  }

  private startCountdown() {
    this.state.phase          = "countdown";
    this.state.countdownValue = COUNTDOWN_SECS;

    // Broadcast ping info to real clients
    this.clients.forEach(c => {
      const ping = this.halfRtt(c.sessionId) * 2;
      c.send("your_ping", { ping, region: process.env.REGION || "EU" });
    });

    // Generate seed before countdown ends so clients can receive it early
    this.state.seed = Math.floor(Math.random() * 0xFFFFFFFF);

    this.countdownTimer = this.clock.setInterval(() => {
      this.state.countdownValue--;
      if (this.state.countdownValue <= 0) {
        this.countdownTimer.clear();
        this.startGame();
      }
    }, 1000);
  }

  private startGame() {
    this.state.phase    = "playing";
    this.state.timeLeft = ROUND_SECS;

    // Broadcast game_start with seed so clients begin rendering tiles
    const colours = ["common","uncommon","rare","epic","legendary","secret"];
    const targetColour = colours[Math.floor(Math.random() * colours.length)];
    this.broadcast("game_start", {
      seed:         this.state.seed,
      targetColour,
      totalPlayers: MAX_PLAYERS,
    });

    // Game timer — tick every second
    this.gameTimer = this.clock.setInterval(() => {
      this.state.timeLeft--;

      // Broadcast live scores every second
      const scores: Record<string, number> = {};
      this.state.players.forEach((p, sid) => { scores[sid] = p.score; });
      this.broadcast("score_update", { scores, timeLeft: this.state.timeLeft });

      if (this.state.timeLeft <= 0) {
        this.gameTimer.clear();
        this.endGame();
      }
    }, 1000);
  }

  // ── Tap handling ──────────────────────────────────────────────────────────

  private handleTap(client: Client, data: { pos: number; correct: boolean; isVoid: boolean }) {
    if (this.state.phase !== "playing") return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.isBot) return;

    // Rate limit: sliding window of last second
    const now = Date.now() - this.halfRtt(client.sessionId);
    const hist = this.tapHistory.get(client.sessionId) || [];
    const recent = hist.filter(t => now - t < 1000);
    if (recent.length >= MAX_TAPS_PER_SEC) return; // silently drop
    recent.push(now);
    this.tapHistory.set(client.sessionId, recent);

    const effects = this.playerEffects.get(client.sessionId) || {};

    let delta = 0;
    if (data.isVoid) {
      delta = 20;
    } else if (data.correct) {
      delta = Math.round(10 * (1 + (effects.plusPoints || 0)));
    } else {
      delta = Math.round(-10 * (1 - (effects.minusPenalty || 0)));
    }

    p.score = Math.min(MAX_POSSIBLE_SCORE, p.score + delta);
    p.taps++;
  }

  // ── End game ──────────────────────────────────────────────────────────────

  private async endGame() {
    this.state.phase = "results";

    // Sort all players by score descending
    const entries: Array<{ sessionId: string; score: number; isBot: boolean }> = [];
    this.state.players.forEach((p, sid) => {
      entries.push({ sessionId: sid, score: p.score, isBot: p.isBot });
    });
    entries.sort((a, b) => b.score - a.score || (a.isBot ? 1 : -1));

    // Assign placements
    entries.forEach((e, i) => {
      const p = this.state.players.get(e.sessionId);
      if (p) p.placement = i + 1;
    });

    // Compute results per real player and persist
    const resultPromises: Promise<void>[] = [];

    for (const [sessionId, playerId] of this.playerIds) {
      const p = this.state.players.get(sessionId);
      if (!p) continue;

      const mmrBefore  = this.playerMmrs.get(sessionId) || 0;
      const effects    = this.playerEffects.get(sessionId) || {};
      const baseDelta  = mmrDelta(p.placement);
      const bonusMult  = 1 + (effects.bonusMmr || 0);
      const delta      = Math.round(baseDelta * bonusMult);
      const newMmr     = Math.max(0, mmrBefore + delta);
      const isWin      = p.placement === 1;

      resultPromises.push(
        upsertGauntletMMR(playerId, newMmr, isWin)
          .then(() => recordGauntletResult(
            this.roomId, playerId, p.placement, p.score, p.taps, mmrBefore, delta
          ))
          .catch(e => console.error("[Gauntlet] DB error:", e?.message))
      );

      // Build leaderboard snapshot for this player's results screen
      const leaderboard = entries.map(e2 => {
        const p2 = this.state.players.get(e2.sessionId)!;
        return {
          name:      p2.name,
          avatar:    p2.avatar,
          score:     p2.score,
          placement: p2.placement,
          isYou:     e2.sessionId === sessionId,
          isBot:     e2.isBot,
        };
      });

      const client = this.clients.find(c => c.sessionId === sessionId);
      client?.send("results", {
        placement:  p.placement,
        score:      p.score,
        taps:       p.taps,
        mmrBefore,
        mmrDelta:   delta,
        newMmr,
        leaderboard,
      });
    }

    await Promise.allSettled(resultPromises);

    // Dispose room after a short delay so clients can read results
    this.clock.setTimeout(() => this.disconnect(), 30_000);
  }
}
