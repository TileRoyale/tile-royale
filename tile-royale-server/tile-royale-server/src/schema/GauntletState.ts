import { Schema, type, MapSchema } from "@colyseus/schema";

export class GauntletPlayer extends Schema {
  @type("string")  sessionId: string = "";
  @type("string")  name: string = "";
  @type("string")  avatar: string = "🔥";
  @type("number")  score: number = 0;
  @type("number")  taps: number = 0;
  @type("boolean") isBot: boolean = false;
  @type("number")  placement: number = 0;
  @type("number")  ping: number = 0;
  @type("number")  mmr: number = 0;
}

export class GauntletRoomState extends Schema {
  @type("string")  phase: string = "lobby";     // lobby | countdown | playing | results
  @type("number")  playerCount: number = 0;
  @type("number")  countdownValue: number = 5;
  @type("number")  timeLeft: number = 35;
  @type("number")  seed: number = 0;
  @type({ map: GauntletPlayer }) players = new MapSchema<GauntletPlayer>();
}
