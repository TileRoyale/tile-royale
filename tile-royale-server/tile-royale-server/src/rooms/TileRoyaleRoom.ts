import { Room, Client, Delayed } from "@colyseus/core";
import { TileRoyaleState, Player } from "../schema/TileRoyaleState";
import { upsertPlayer, writeGameResult } from "../db";

const GRID_SIZE           = 25;
const MAX_PLAYERS         = 30;
const LOBBY_WAIT_MS       = 15000; // wait 15s from first join, then fill with bots
const COUNTDOWN           = 5;
const REACTION_FLOOR_MS   = 0;    // disabled — lag compensation handles fairness
const ROUND_TIMEOUT_MS    = 8000;
const ANTI_CHEAT_STDDEV   = 15;
const PING_INTERVAL_MS    = 3000;
const MAX_ACCEPTED_PING   = 400;

const BOT_NAMES   = ["TapBot","QuickFire","Zapper","FingerSnap","TileHunter",
                      "NitroNail","SpeedTap","FlashFinger","TapStorm","QuickDraw",
                      "PixelPop","TileMaster","NeonTap","SwiftClick","BoltFinger",
                      "TapStrike","NeonFist","QuickTap","LaserFinger","VoidTapper",
                      "TapNinja","SnapClick","TurboTap","MegaFinger","UltraTap",
                      "TapStorm2","ZapFinger","FireTap","CyberTap","GhostTap"];
const BOT_AVATARS = ["🤖","👾","🔥","⚡","💥","🎯","🌀","🦾","🌟","💫",
                     "🎮","🕹️","🏆","⚔️","🛸","🦊","🐺","🦁","🐯","🦅",
                     "🐉","🦄","🌙","☄️","🔮","💎","🗡️","🛡️","⚙️","🎭"];

export class TileRoyaleRoom extends Room<TileRoyaleState> {
  maxClients = MAX_PLAYERS;

  // Lag compensation: store half-RTT per client
  private clientPings   = new Map<string, number>();   // sessionId → half-RTT ms
  private pingTimestamps = new Map<string, number>();  // sessionId → ping sent time

  private roundTaps:      Array<{ sessionId: string; compensatedTime: number }> = [];
  private roundTimeout!:  Delayed;
  private burnTimeout!:   Delayed;
  private countdownClock!: Delayed;
  private pingInterval!:  Delayed;
  private lobbyTimer!:    Delayed;
  private lobbyStarted  = false;
  private playerReactions = new Map<string, number[]>();
  private playerTapStats  = new Map<string, { tapCount: number; totalReactionMs: number; bestReactionMs: number }>();

  private roomMode: string = 'rush';
  private joinedPlayers = new Set<string>(); // sessionIds that have ever joined — no rejoins
  private nextWildTile: number = -1; // pre-picked tile for Crystal Ball hint
  // Maps sessionId → stable player UUID (sent from client on join)
  private playerIds = new Map<string, string>();

  // Buckshot state
  private buckshotPlayerTaps    = new Map<string, Set<number>>();
  private buckshotTileSet        = new Set<number>();
  private buckshotWaveStart      = 0;
  private buckshotTileCount      = 0;
  private buckshotCompletions    = new Map<string, number>(); // sessionId → completionMs
  private buckshotAlivePlayers   = 0;

  onCreate(options: any) {
    this.setState(new TileRoyaleState());
    this.state.phase = "waiting";
    this.roomMode = options?.mode || 'rush';

    this.onMessage("tap",  (client, data: { tileIndex: number }) =>
      this.handleTap(client, data.tileIndex));

    this.onMessage("pong", (client, data: { id: number }) =>
      this.handlePong(client, data.id));

    this.onMessage("ready", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.isReady = true;
    });

    // Start pinging all clients immediately
    this.startPingLoop();
    console.log(`[Room ${this.roomId}] created`);
  }

  onJoin(client: Client, options: any) {
    // One join per session — no reconnects or rejoins ever
    if (this.joinedPlayers.has(client.sessionId)) {
      console.log(`[Room ${this.roomId}] Rejoin attempt by ${client.sessionId} — rejected`);
      client.leave(4002);
      return;
    }
    this.joinedPlayers.add(client.sessionId);

    const player = new Player();
    player.sessionId = client.sessionId;
    player.name      = (options?.name   || "Player").substring(0, 16);
    player.avatar    = options?.avatar  || "🔥";
    player.ping      = 0;
    (player as any).isWhale = options?.isWhale || false;
    (player as any).victorySkin = options?.victorySkin || "vic_classic";
    this.state.players.set(client.sessionId, player);
    this.state.playerCount = this.state.players.size;
    this.clientPings.set(client.sessionId, 0);

    // Store stable player UUID and upsert into DB (fire-and-forget, non-blocking)
    const playerId: string = options?.playerId || "";
    if (playerId) {
      this.playerIds.set(client.sessionId, playerId);
      upsertPlayer(playerId, player.name, player.avatar).catch(e =>
        console.error("[DB] upsertPlayer failed:", e)
      );
    }

    console.log(`[Room ${this.roomId}] ${player.name} joined (${this.state.playerCount}/${MAX_PLAYERS})`);

    // Start 15s timer ONCE on first join — never restarts
    if (this.state.playerCount === 1 && !this.lobbyStarted) {
      console.log(`[Room ${this.roomId}] Lobby created — 15s to fill before bots join`);
      this.lobbyTimer = this.clock.setTimeout(() => {
        if (this.lobbyStarted) return;

        // Count only real (non-bot) players still connected
        const realPlayers: string[] = [];
        this.state.players.forEach((p, key) => {
          if (!(p as any).isBot) realPlayers.push(key);
        });
        const realCount = realPlayers.length;

        console.log(`[Room ${this.roomId}] 15s expired — ${realCount} real player(s), filling rest with bots`);

        const botsNeeded = MAX_PLAYERS - realCount;
        for (let i = 0; i < botsNeeded; i++) {
          const bot = new Player();
          const botId = `bot_${i}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          bot.sessionId = botId;
          bot.name      = BOT_NAMES[i % BOT_NAMES.length];
          bot.avatar    = BOT_AVATARS[i % BOT_AVATARS.length];
          bot.ping      = 0;
          (bot as any).isBot = true;
          this.state.players.set(botId, bot);
        }
        this.state.playerCount = this.state.players.size;
        this.startCountdown();
      }, LOBBY_WAIT_MS);
    }

    // Start immediately when full of real players
    if (this.state.playerCount >= MAX_PLAYERS && !this.lobbyStarted) {
      if (this.lobbyTimer) this.lobbyTimer.clear();
      this.startCountdown();
    }
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p && !(p as any).isBot) {
      if (!p.eliminated) {
        p.eliminated = true;
        this.state.playersLeft = this.activePlayers().length;
        if (this.state.phase === "playing") this.checkWinCondition();
      }
    }
    this.clientPings.delete(client.sessionId);
    this.pingTimestamps.delete(client.sessionId);
    this.playerReactions.delete(client.sessionId);
  }

  onDispose() {
    console.log(`[Room ${this.roomId}] disposed`);
  }

  // ─── PING / LAG MEASUREMENT ────────────────────────────────────────────────

  private startPingLoop() {
    let pingId = 0;
    this.pingInterval = this.clock.setInterval(() => {
      const now = Date.now();
      pingId++;
      this.clients.forEach(client => {
        this.pingTimestamps.set(`${client.sessionId}_${pingId}`, now);
        client.send("ping", { id: pingId, t: now });
      });
    }, PING_INTERVAL_MS);
  }

  private handlePong(client: Client, pingId: number) {
    const key = `${client.sessionId}_${pingId}`;
    const sent = this.pingTimestamps.get(key);
    if (!sent) return;
    this.pingTimestamps.delete(key);

    const rtt      = Date.now() - sent;
    const halfRtt  = Math.round(rtt / 2);
    this.clientPings.set(client.sessionId, halfRtt);

    // Update visible ping on state
    const player = this.state.players.get(client.sessionId);
    if (player) player.ping = halfRtt;

    // Kick extremely high-ping players (only during waiting phase)
    if (this.state.phase === "waiting" && halfRtt > MAX_ACCEPTED_PING) {
      client.send("kicked", { reason: "ping_too_high", ping: halfRtt * 2 });
      client.leave();
    }
  }

  // Get lag-compensated timestamp for a tap
  private compensatedNow(sessionId: string): number {
    const halfRtt = this.clientPings.get(sessionId) || 0;
    return Date.now() - halfRtt; // when the player actually tapped
  }

  // ─── GAME FLOW ─────────────────────────────────────────────────────────────

  private startCountdown() {
    if (this.lobbyStarted) return;
    this.lobbyStarted = true;
    this.lock();
    this.state.phase = "countdown";
    this.state.countdownValue = COUNTDOWN;
    this.state.playersLeft    = this.state.playerCount;

    // Send each player their ping stats before game starts
    this.clients.forEach(c => {
      const ping = (this.clientPings.get(c.sessionId) || 0) * 2;
      c.send("your_ping", { ping, region: process.env.REGION || "EU" });
    });

    this.countdownClock = this.clock.setInterval(() => {
      this.state.countdownValue--;
      if (this.state.countdownValue <= 0) {
        this.countdownClock.clear();
        this.startGame();
      }
    }, 1000);
  }

  private startGame() {
    this.state.phase       = "playing";
    this.state.playersLeft = this.activePlayers().length;
    this.clock.setTimeout(() => {
      this.scheduleNextBurn();
    }, 1000);
    if (this.roomMode === 'wild') this.setupBotWildItems();
  }

  private setupBotWildItems() {
    const BOT_ITEMS = ['caltrops', 'shadow_tile', 'pepper_spray', 'muscle_relaxant'];
    const bots: any[] = [];
    this.state.players.forEach(p => { if ((p as any).isBot) bots.push(p); });
    if (!bots.length) return;

    const itemBotCount = Math.min(bots.length, 3 + Math.floor(Math.random() * 3));
    const itemBots = [...bots].sort(() => Math.random() - 0.5).slice(0, itemBotCount);

    itemBots.forEach((bot, botIndex) => {
      const uses = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < uses; i++) {
        const itemId = BOT_ITEMS[Math.floor(Math.random() * BOT_ITEMS.length)];
        const delay  = 6000 + botIndex * 4000 + i * (4000 + Math.random() * 6000);
        this.clock.setTimeout(() => {
          if (this.state.phase !== 'playing') return;
          if (bot.eliminated) return;
          if (this.activePlayers().length <= 5) return;
          this.activateBotItem(bot, itemId);
        }, delay);
      }
    });
  }

  private activateBotItem(bot: any, itemId: string) {
    if (this.state.phase !== 'playing') return;
    if (this.activePlayers().length <= 5) return;

    this.clients.forEach(client => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.eliminated) return;
      client.send("item_hit", {
        attackerAvatar: bot.avatar,
        attackerName:   bot.name,
        itemId,
      });
      if (itemId === 'caltrops') {
        player.isLocked  = true;
        player.lockUntil = Date.now() + 700;
        this.clock.setTimeout(() => { if (player) player.isLocked = false; }, 700);
      }
    });
  }

  private scheduleNextBurn() {
    if (this.state.phase !== "playing") return;
    const alive = this.activePlayers().length;
    if (alive <= 1) { this.endGame(); return; }

    const dangerMode = alive <= 3;
    const speedMult  = dangerMode ? 0.4 : 1;
    const remaining  = alive / MAX_PLAYERS;
    const minDelay   = Math.max(200,  800 * remaining * speedMult);
    const maxDelay   = Math.max(500, 2500 * remaining * speedMult);

    this.burnTimeout = this.clock.setTimeout(() => {
      if (this.roomMode === 'buckshot') this.igniteBuckshotWave();
      else this.igniteTile();
    }, minDelay + Math.random() * (maxDelay - minDelay));
  }

  private igniteTile() {
    if (this.state.phase !== "playing") return;

    const isWild = this.roomMode === 'wild';

    // Use pre-picked tile for wild mode (Crystal Ball hint), else random
    const tileIndex = (isWild && this.nextWildTile >= 0) ? this.nextWildTile : Math.floor(Math.random() * GRID_SIZE);
    this.nextWildTile = -1;

    const isGolden  = isWild && Math.random() < 0.05 && this.activePlayers().length > 3;

    this.state.burningTile    = tileIndex;
    this.state.isGoldenTile   = isGolden;
    this.state.roundStartTime = Date.now();
    this.state.roundNumber++;
    this.roundTaps = [];

    // Wild mode: pre-pick NEXT tile and send Crystal Ball hint to all clients
    if (isWild) {
      const next = Math.floor(Math.random() * GRID_SIZE);
      this.nextWildTile = next;
      const decoys: number[] = [];
      while (decoys.length < 2) {
        const d = Math.floor(Math.random() * GRID_SIZE);
        if (d !== next && !decoys.includes(d)) decoys.push(d);
      }
      const candidates = [next, ...decoys].sort(() => Math.random() - 0.5);
      this.broadcast("crystal_hint", { candidates });
    }

    // Unlock expired locks
    this.state.players.forEach(p => {
      if (p.isLocked && Date.now() >= p.lockUntil) p.isLocked = false;
    });

    // Schedule bot auto-taps so round completes without waiting for timeout
    this.state.players.forEach((p) => {
      if ((p as any).isBot && !p.eliminated) {
        const botDelay = 1000 + Math.random() * 250; // bots tap 1000-1250ms
        this.clock.setTimeout(() => {
          if (this.state.phase !== "playing" || this.state.burningTile < 0) return;
          if (p.eliminated) return;
          // compensatedTime must be relative to roundStartTime, same as real players
          const compensatedTime = this.state.roundStartTime + botDelay;
          this.roundTaps.push({ sessionId: p.sessionId, compensatedTime });
          this._recordTapStat(p.sessionId, botDelay);
          this.checkRoundComplete();
        }, botDelay);
      }
    });

    this.roundTimeout = this.clock.setTimeout(() => {
      this.finalizeRound();
    }, ROUND_TIMEOUT_MS);
  }

  // ─── BUCKSHOT MODE ────────────────────────────────────────────────────────

  private igniteBuckshotWave() {
    if (this.state.phase !== "playing") return;
    const alive = this.activePlayers();
    if (alive.length <= 1) { this.endGame(); return; }

    const n = Math.floor(Math.random() * 10) + 1; // 1–10 tiles
    const allTiles = Array.from({ length: GRID_SIZE }, (_, i) => i)
      .sort(() => Math.random() - 0.5)
      .slice(0, n);

    this.buckshotTileSet      = new Set(allTiles);
    this.buckshotWaveStart    = Date.now();
    this.buckshotTileCount    = n;
    this.buckshotAlivePlayers = alive.length;
    this.buckshotCompletions.clear();
    this.buckshotPlayerTaps.clear();
    this.state.roundNumber++;
    this.state.roundStartTime = this.buckshotWaveStart;
    this.state.burningTile    = -1;

    alive.forEach(p => this.buckshotPlayerTaps.set(p.sessionId, new Set()));

    this.broadcast("buckshot_wave", { tiles: allTiles, waveStart: this.buckshotWaveStart });

    // Schedule bot completions
    alive.forEach(p => {
      if (!(p as any).isBot) return;
      let delay = 0;
      allTiles.forEach((tileIdx) => {
        delay += 700 + Math.random() * 200;
        const d = delay;
        this.clock.setTimeout(() => {
          if (this.state.phase !== "playing" || p.eliminated) return;
          const taps = this.buckshotPlayerTaps.get(p.sessionId);
          if (!taps || taps.has(tileIdx)) return;
          taps.add(tileIdx);
          this._recordTapStat(p.sessionId, d);
          if (taps.size >= n) {
            this.buckshotCompletions.set(p.sessionId, Date.now() - this.buckshotWaveStart);
            this.checkBuckshotWaveComplete();
          }
        }, d);
      });
    });

    const maxWait = n * 1000 + 3000;
    this.roundTimeout = this.clock.setTimeout(() => this.finalizeBuckshotWave(), maxWait);
  }

  private handleBuckshotTap(client: Client, tileIndex: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated) return;
    if (this.state.phase !== "playing") return;

    if (player.isLocked && Date.now() < player.lockUntil) {
      client.send("tap_rejected", { reason: "locked" });
      return;
    }

    if (!this.buckshotTileSet.has(tileIndex)) {
      client.send("wrong_tile", { tileIndex });
      player.isLocked  = true;
      player.lockUntil = Date.now() + 700;
      this.clock.setTimeout(() => { if (player) player.isLocked = false; }, 700);
      return;
    }

    const taps = this.buckshotPlayerTaps.get(client.sessionId);
    if (!taps || taps.has(tileIndex)) return; // already tapped

    taps.add(tileIndex);
    const reactionMs = Date.now() - this.buckshotWaveStart;
    this._recordTapStat(client.sessionId, reactionMs);
    client.send("tap_ok", { reactionMs, halfRtt: this.clientPings.get(client.sessionId) || 0 });
    this.broadcast("player_tapped", {
      sessionId: client.sessionId, name: player.name, avatar: player.avatar,
      reactionMs, isWhale: (player as any).isWhale || false, tileIndex,
    });

    if (taps.size >= this.buckshotTileCount) {
      const ms = Date.now() - this.buckshotWaveStart;
      this.buckshotCompletions.set(client.sessionId, ms);
      client.send("buckshot_cleared", { completionMs: ms });
      this.checkBuckshotWaveComplete();
    }
  }

  private checkBuckshotWaveComplete() {
    if (this.buckshotCompletions.size >= this.buckshotAlivePlayers) {
      this.roundTimeout?.clear();
      this.clock.setTimeout(() => this.finalizeBuckshotWave(), 250);
    }
  }

  private finalizeBuckshotWave() {
    if (this.state.phase !== "playing") return;
    this.roundTimeout?.clear();

    const alive = this.activePlayers();
    if (alive.length <= 1) { this.endGame(); return; }

    const worstMs = Date.now() - this.buckshotWaveStart + 99999;
    alive.forEach(p => {
      if (!this.buckshotCompletions.has(p.sessionId))
        this.buckshotCompletions.set(p.sessionId, worstMs);
    });

    let loserSid = "";
    let worstTime = 0;
    this.buckshotCompletions.forEach((ms, sid) => {
      if (ms > worstTime) { worstTime = ms; loserSid = sid; }
    });

    const loser = this.state.players.get(loserSid);
    if (!loser) { this.scheduleNextBurn(); return; }

    if (loser.immune) {
      loser.immune = false;
      this.broadcast("immunity_used", { sessionId: loserSid, name: loser.name });
      this.buckshotTileSet.clear();
      this.buckshotPlayerTaps.clear();
      this.scheduleNextBurn();
      return;
    }

    loser.eliminated        = true;
    loser.place             = alive.length;
    this.state.lastEliminated = loserSid;
    this.state.playersLeft  = this.activePlayers().length;
    this.broadcast("player_eliminated", {
      sessionId: loserSid, name: loser.name, avatar: loser.avatar,
      place: loser.place, playersLeft: this.state.playersLeft,
    });

    this.buckshotTileSet.clear();
    this.buckshotPlayerTaps.clear();

    if (this.activePlayers().length <= 1) this.endGame();
    else this.scheduleNextBurn();
  }

  // ─── TAP HANDLING WITH LAG COMPENSATION ───────────────────────────────────

  private handleTap(client: Client, tileIndex: number) {
    if (this.roomMode === 'buckshot') {
      this.handleBuckshotTap(client, tileIndex);
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (!player || player.eliminated) {
      console.log(`[Tap] ${client.sessionId} rejected: eliminated=${player?.eliminated}`);
      return;
    }
    if (this.state.phase !== "playing") {
      console.log(`[Tap] ${client.sessionId} rejected: phase=${this.state.phase}`);
      return;
    }
    if (this.state.burningTile < 0) {
      console.log(`[Tap] ${client.sessionId} rejected: burningTile=${this.state.burningTile}`);
      client.send("tap_rejected", { reason: "no_burning_tile" });
      return;
    }
    if (this.roundTaps.find(t => t.sessionId === client.sessionId)) {
      console.log(`[Tap] ${client.sessionId} rejected: already tapped`);
      return;
    }

    // LAG COMPENSATION: subtract half-RTT from server receive time
    const halfRtt          = this.clientPings.get(client.sessionId) || 0;
    const serverReceiveTime = Date.now();
    const compensatedTime   = serverReceiveTime - halfRtt; // when player actually tapped

    // Reaction time = compensated tap time − when tile ignited
    const reactionMs = compensatedTime - this.state.roundStartTime;

    // Anti-cheat: reaction floor (applied AFTER lag compensation — fair for all regions)
    if (reactionMs < REACTION_FLOOR_MS) {
      console.warn(`[AntiCheat] ${player.name} reaction ${reactionMs}ms (ping:${halfRtt*2}ms) — rejected`);
      client.send("cheat_detected", { reason: "reaction_too_fast", reactionMs });
      return;
    }

    // Anti-cheat: pattern detection
    this.recordReaction(client.sessionId, reactionMs);

    // Screen locked
    if (player.isLocked && Date.now() < player.lockUntil) {
      client.send("tap_rejected", { reason: "locked" });
      return;
    }

    // Wrong tile
    if (tileIndex !== this.state.burningTile) {
      client.send("wrong_tile", { tileIndex });
      player.isLocked  = true;
      player.lockUntil = Date.now() + 1000;
      this.clock.setTimeout(() => { if (player) player.isLocked = false; }, 1000);
      return;
    }

    // Golden tile
    if (this.state.isGoldenTile) {
      player.immune = true;
      client.send("golden_tap", { reactionMs, halfRtt });
      this.clock.setTimeout(() => { if (player) player.immune = false; }, 8000);
      this.roundTaps.push({ sessionId: client.sessionId, compensatedTime });
      this._recordTapStat(client.sessionId, reactionMs);
      client.send("tap_ok", { reactionMs, halfRtt, compensated: true });
      this.checkRoundComplete();
      return;
    }

    // Valid tap — store COMPENSATED time for fair comparison
    this.roundTaps.push({ sessionId: client.sessionId, compensatedTime });
    this._recordTapStat(client.sessionId, reactionMs);
    client.send("tap_ok", { reactionMs, halfRtt, compensated: halfRtt > 0 });
    this.broadcast("player_tapped", {
      sessionId: client.sessionId,
      name: player.name,
      avatar: player.avatar,
      reactionMs,
      isWhale: (player as any).isWhale || false,
      tileIndex,
    });

    this.checkRoundComplete();
  }

  private checkRoundComplete() {
    const alive = this.activePlayers();
    if (this.roundTaps.length >= alive.length) this.finalizeRound();
  }

  private finalizeRound() {
    if (this.state.burningTile < 0) return;
    this.roundTimeout?.clear();

    const alive = this.activePlayers();
    if (alive.length <= 1) { this.endGame(); return; }

    const tappedIds = new Set(this.roundTaps.map(t => t.sessionId));
    const notTapped = alive.filter(p => !tappedIds.has(p.sessionId));

    let loser: Player | null = null;

    if (notTapped.length > 0) {
      // Didn't tap — random among them (inactivity)
      loser = notTapped[Math.floor(Math.random() * notTapped.length)];
    } else {
      // Find LAST compensated tap — fair across all regions
      const lastTap = this.roundTaps.reduce((a, b) =>
        a.compensatedTime > b.compensatedTime ? a : b);
      loser = this.state.players.get(lastTap.sessionId) || null;
    }

    if (!loser) { this.scheduleNextBurn(); return; }

    // Immunity check
    if (loser.immune) {
      loser.immune = false;
      this.broadcast("immunity_used", { sessionId: loser.sessionId, name: loser.name });
      this.state.burningTile = -1;
      this.scheduleNextBurn();
      return;
    }

    // Eliminate
    loser.eliminated       = true;
    loser.place            = alive.length;
    this.state.lastEliminated = loser.sessionId;
    this.state.playersLeft = this.activePlayers().length;

    this.broadcast("player_eliminated", {
      sessionId:   loser.sessionId,
      name:        loser.name,
      avatar:      loser.avatar,
      place:       loser.place,
      playersLeft: this.state.playersLeft,
    });

    this.state.burningTile = -1;

    if (this.activePlayers().length <= 1) this.endGame();
    else this.scheduleNextBurn();
  }

  // ─── GAME OVER ─────────────────────────────────────────────────────────────

  private endGame() {
    this.state.phase = "gameOver";
    this.burnTimeout?.clear();
    this.roundTimeout?.clear();
    this.pingInterval?.clear();

    const remaining = this.activePlayers();
    let winner: Player | null = null;

    if (remaining.length >= 1) {
      winner = remaining[0];
      winner.place       = 1;
      this.state.winnerId = winner.sessionId;
    }
    remaining.filter(p => p.place === 0).forEach((p, i) => { p.place = i + 2; });

    // Build game summary (tap counts + avg reaction time per player)
    const summary: Array<{
      sessionId: string; name: string; avatar: string;
      isBot: boolean; place: number; tapCount: number; avgReactionMs: number;
    }> = [];
    this.state.players.forEach((p, sid) => {
      const st = this.playerTapStats.get(sid) || { tapCount: 0, totalReactionMs: 0 };
      summary.push({
        sessionId: sid, name: p.name, avatar: p.avatar,
        isBot: (p as any).isBot || false,
        place: p.place || 1,
        tapCount: st.tapCount,
        avgReactionMs: st.tapCount > 0 ? Math.round(st.totalReactionMs / st.tapCount) : 0,
      });
    });
    summary.sort((a, b) => a.place - b.place);

    this.state.players.forEach((player, sessionId) => {
      const client = this.clients.find(c => c.sessionId === sessionId);
      if (!client) return;
      // Check if opponent in final was a whale (for Moby Dick achievement)
      const opponents = Array.from(this.state.players.values())
        .filter(p => p.sessionId !== sessionId);
      const opponentWasWhale = opponents.length === 1 &&
        (opponents[0] as any).isWhale === true;

      // Broadcast victor's victory screen skin to spectators via game_over
      client.send("game_over", {
        place:            player.place || this.state.playerCount,
        won:              player.sessionId === this.state.winnerId,
        winnerId:         this.state.winnerId,
        winnerName:       winner?.name   || "",
        winnerAvatar:     winner?.avatar || "🔥",
        winnerVictorySkin: (winner as any).victorySkin || "vic_classic",
        totalPlayers:     this.state.playerCount,
        yourPing:         (this.clientPings.get(sessionId) || 0) * 2,
        opponentWasWhale: opponentWasWhale,
        summary,
        mySessionId:      sessionId,
      });
    });

    // Persist game results for every human player (fire-and-forget)
    this.state.players.forEach((p, sessionId) => {
      if ((p as any).isBot) return;
      const playerId = this.playerIds.get(sessionId);
      if (!playerId) return;
      const st = this.playerTapStats.get(sessionId);
      const tapStats = st && st.tapCount > 0 ? {
        tilesTapped:    st.tapCount,
        avgReactionMs:  Math.round(st.totalReactionMs / st.tapCount),
        bestReactionMs: st.bestReactionMs,
      } : undefined;
      writeGameResult(
        playerId,
        p.place || this.state.playerCount,
        this.state.playerCount,
        this.roomMode,
        tapStats
      ).catch(e => console.error("[DB] writeGameResult failed:", e));
    });

    this.clock.setTimeout(() => this.disconnect(), 10000);
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  private activePlayers(): Player[] {
    const r: Player[] = [];
    this.state.players.forEach(p => { if (!p.eliminated) r.push(p); });
    return r;
  }

  private checkWinCondition() {
    if (this.activePlayers().length <= 1) this.endGame();
  }

  private _recordTapStat(sessionId: string, reactionMs: number) {
    const s = this.playerTapStats.get(sessionId) || { tapCount: 0, totalReactionMs: 0, bestReactionMs: 0 };
    const clamped = Math.max(0, reactionMs);
    s.tapCount++;
    s.totalReactionMs += clamped;
    if (clamped > 0 && (s.bestReactionMs === 0 || clamped < s.bestReactionMs)) {
      s.bestReactionMs = clamped;
    }
    this.playerTapStats.set(sessionId, s);
  }

  private recordReaction(sessionId: string, ms: number) {
    if (!this.playerReactions.has(sessionId))
      this.playerReactions.set(sessionId, []);
    const reactions = this.playerReactions.get(sessionId)!;
    reactions.push(ms);
    if (reactions.length > 20) reactions.shift();

    if (reactions.length >= 10) {
      const avg = reactions.reduce((a, b) => a + b, 0) / reactions.length;
      const variance = reactions.reduce((a, b) =>
        a + Math.pow(b - avg, 2), 0) / reactions.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev < ANTI_CHEAT_STDDEV && avg < 200) {
        console.warn(`[AntiCheat] ${sessionId} stdDev=${stdDev.toFixed(1)}ms avg=${avg.toFixed(0)}ms — possible bot`);
        const client = this.clients.find(c => c.sessionId === sessionId);
        client?.send("cheat_warning", { stdDev, avg });
      }
    }
  }
}

