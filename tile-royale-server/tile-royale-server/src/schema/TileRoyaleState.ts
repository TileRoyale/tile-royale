import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string")  sessionId: string = "";
  @type("string")  name: string = "Player";
  @type("string")  avatar: string = "🔥";
  @type("boolean") eliminated: boolean = false;
  @type("number")  place: number = 0;
  @type("boolean") isReady: boolean = false;
  @type("boolean") isLocked: boolean = false;
  @type("number")  lockUntil: number = 0;
  @type("boolean") immune: boolean = false;
  @type("number")  ping: number = 0;
}

export class TileRoyaleState extends Schema {
  @type("string")  phase: string = "waiting";
  @type("number")  playerCount: number = 0;
  @type("number")  playersLeft: number = 0;
  @type("number")  countdownValue: number = 5;
  @type("number")  burningTile: number = -1;
  @type("boolean") isGoldenTile: boolean = false;
  @type("number")  roundStartTime: number = 0;
  @type("string")  lastEliminated: string = "";
  @type("number")  roundNumber: number = 0;
  @type("string")  winnerId: string = "";
  @type({ map: Player }) players = new MapSchema<Player>();
}
