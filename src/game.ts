/**
 * American Mahjong game engine: deal, Charleston, play, calls, joker exchange.
 * Seats: East, South, West, North (counter-clockwise turn order after East).
 */
import { Bot } from "./bot";
import { Card } from "./card";
import { Deck } from "./deck";
import { GameRandom } from "./random";
import { Seat, type SeatName } from "./seat";
import { Tile } from "./tile";

export type Phase =
  | "deal"
  | "charleston"
  | "play"
  | "over";

export type CharlestonStep =
  | "right"
  | "across1"
  | "left1"
  | "left2"
  | "across2"
  | "right2"
  | "courtesy"
  | "done";

export interface SeatStats {
  wins: number;
  games: number;
}

export interface GameEvent {
  text: string;
}

const SEAT_ORDER: SeatName[] = ["East", "South", "West", "North"];

export class Game {
  masterCard: Card;
  seats: Seat[];
  wall: Deck;
  phase: Phase = "deal";
  charlestonStep: CharlestonStep = "right";
  /** Whose turn to discard (after draw/call). */
  turn: SeatName = "East";
  lastDiscard: Tile | null = null;
  /** Seat that discarded lastDiscard. */
  lastDiscarder: SeatName | null = null;
  events: string[] = [];
  winner: SeatName | null = null;
  winningHand = "";
  wallGame = false;
  /** Human controls East when true. */
  humanEast = false;
  /** Pending charleston tiles selected by human (East). */
  humanPass: Tile[] = [];
  /** When set, East may call this discard before the next draw. */
  pendingHumanCall: Tile | null = null;
  stats: Record<SeatName, SeatStats> = {
    East: { wins: 0, games: 0 },
    South: { wins: 0, games: 0 },
    West: { wins: 0, games: 0 },
    North: { wins: 0, games: 0 },
  };
  gamesPlayed = 0;
  wallGames = 0;
  /**
   * Mahjong wins by tiles-left decade (0=0–9, 1=10–19, …).
   * Pre-populated so the chart always shows every bucket.
   */
  tilesLeftBuckets: Record<number, number> = Game.emptyTileBuckets();
  /** Wall tiles remaining when the last mahjong was declared. */
  lastMahjongWallTiles = 0;

  /** Decades 0..9 cover 0–99 wall tiles (max after deal is 99). */
  static emptyTileBuckets(): Record<number, number> {
    const buckets: Record<number, number> = {};
    for (let d = 0; d <= 9; d++) buckets[d] = 0;
    return buckets;
  }

  static tilesLeftDecade(tilesLeft: number): number {
    return Math.min(9, Math.max(0, Math.floor(tilesLeft / 10)));
  }

  constructor(card: Card) {
    this.masterCard = card;
    this.seats = SEAT_ORDER.map((name) => new Seat(name, this.masterCard.clone()));
    this.wall = new Deck();
  }

  seat(name: SeatName): Seat {
    return this.seats.find((s) => s.name === name)!;
  }

  private log(msg: string): void {
    this.events.push(msg);
    if (this.events.length > 40) this.events.shift();
  }

  newGame(humanEast = this.humanEast): void {
    this.humanEast = humanEast;
    GameRandom.reseedForNewDeal();
    this.wall = new Deck();
    this.wall.shuffle();
    for (const s of this.seats) {
      s.reset();
      s.card = this.masterCard.clone();
      s.isHuman = humanEast && s.name === "East";
    }
    this.phase = "charleston";
    this.charlestonStep = "right";
    this.turn = "East";
    this.lastDiscard = null;
    this.lastDiscarder = null;
    this.events = [];
    this.winner = null;
    this.winningHand = "";
    this.wallGame = false;
    this.humanPass = [];
    this.pendingHumanCall = null;

    // Deal 13 each, East 14
    for (let i = 0; i < 13; i++) {
      for (const s of this.seats) {
        s.hand.tiles.push(this.wall.tiles.shift()!);
      }
    }
    this.seat("East").hand.tiles.push(this.wall.tiles.shift()!);
    for (const s of this.seats) s.sortHand();
    this.log("Dealt. Charleston begins (right).");
  }

  private nextCharleston(): CharlestonStep {
    const order: CharlestonStep[] = [
      "right",
      "across1",
      "left1",
      "left2",
      "across2",
      "right2",
      "courtesy",
      "done",
    ];
    const i = order.indexOf(this.charlestonStep);
    this.charlestonStep = order[Math.min(i + 1, order.length - 1)];
    return this.charlestonStep;
  }

  /**
   * Partner for current charleston step, from the perspective of `from`.
   * Right = next in SEAT_ORDER, left = previous, across = +2.
   */
  charlestonPartner(from: SeatName): SeatName {
    const i = SEAT_ORDER.indexOf(from);
    switch (this.charlestonStep) {
      case "right":
      case "right2":
        return SEAT_ORDER[(i + 1) % 4];
      case "across1":
      case "across2":
      case "courtesy":
        return SEAT_ORDER[(i + 2) % 4];
      case "left1":
      case "left2":
        return SEAT_ORDER[(i + 3) % 4];
      default:
        return SEAT_ORDER[(i + 1) % 4];
    }
  }

  charlestonPassCount(): number {
    switch (this.charlestonStep) {
      case "right":
      case "across1":
      case "across2":
        return 3;
      case "left1":
      case "right2":
        return 3; // blind allowed — bots still pass 3 when possible
      case "left2":
        return 3; // or 0 to stop — bots continue
      case "courtesy":
        return 3; // optional up to 3 — bots pass 3
      default:
        return 0;
    }
  }

  /**
   * Execute one Charleston round for all seats (bots auto; East may use humanPass).
   */
  runCharlestonRound(): void {
    if (this.phase !== "charleston" || this.charlestonStep === "done") return;

    const count = this.charlestonPassCount();
    const passes = new Map<SeatName, Tile[]>();

    for (const s of this.seats) {
      if (s.isHuman && this.humanPass.length > 0) {
        // Validate no jokers
        const clean = this.humanPass.filter((t) => !t.isJoker() && s.hand.tiles.includes(t));
        const need = Math.min(count, clean.length);
        // Blind: allow fewer on left1/right2/courtesy
        const blindOk =
          this.charlestonStep === "left1" ||
          this.charlestonStep === "right2" ||
          this.charlestonStep === "courtesy" ||
          this.charlestonStep === "left2";
        let chosen = clean.slice(0, need);
        if (!blindOk && chosen.length < 3) {
          const auto = Bot.charlestonPass(s, 3 - chosen.length).filter((t) => !chosen.includes(t));
          chosen = [...chosen, ...auto].slice(0, 3);
        }
        passes.set(s.name, chosen);
        this.humanPass = [];
      } else if (s.isHuman) {
        passes.set(s.name, Bot.charlestonPass(s, count));
      } else {
        // Stop second charleston? Bots always continue for now.
        if (this.charlestonStep === "left2") {
          passes.set(s.name, Bot.charlestonPass(s, 3));
        } else if (this.charlestonStep === "courtesy") {
          passes.set(s.name, Bot.charlestonPass(s, 3));
        } else {
          passes.set(s.name, Bot.charlestonPass(s, count));
        }
      }
    }

    // Remove from hands first, then deliver (simultaneous)
    for (const s of this.seats) {
      Bot.takePass(s, passes.get(s.name)!);
    }
    for (const s of this.seats) {
      const partner = this.seat(this.charlestonPartner(s.name));
      partner.hand.tiles.push(...passes.get(s.name)!);
    }
    for (const s of this.seats) s.sortHand();

    this.log(`Charleston ${this.charlestonStep}: passed ${count} tiles.`);
    const next = this.nextCharleston();
    if (next === "done") {
      this.phase = "play";
      this.turn = "East";
      this.log("Charleston over. East discards.");
    }
  }

  /** Run all remaining charleston steps automatically. */
  finishCharleston(): void {
    while (this.phase === "charleston") {
      this.runCharlestonRound();
    }
  }

  private preferFlowers(): boolean {
    return this.wall.tiles.length < 50;
  }

  private seatAfter(name: SeatName): SeatName {
    const i = SEAT_ORDER.indexOf(name);
    return SEAT_ORDER[(i + 1) % 4];
  }

  /**
   * Call priority: mahjong first (any seat), then nearest in turn order
   * after the discarder.
   */
  private resolveCalls(discard: Tile, discarder: SeatName): Seat | null {
    const others = this.seats.filter((s) => s.name !== discarder);

    // Mahjong takes priority — nearest in turn order among mahjong callers
    let cursor = this.seatAfter(discarder);
    for (let n = 0; n < 3; n++) {
      const s = this.seat(cursor);
      const call = Bot.tryCall(s, discard, false);
      if (call?.winning) return s;
      cursor = this.seatAfter(cursor);
    }

    // Non-mahjong calls: nearest in turn order
    cursor = this.seatAfter(discarder);
    for (let n = 0; n < 3; n++) {
      const s = this.seat(cursor);
      if (s.isHuman) {
        // Human must explicitly call — skip auto
        cursor = this.seatAfter(cursor);
        continue;
      }
      const call = Bot.tryCall(s, discard, false);
      if (call && !call.winning) return s;
      cursor = this.seatAfter(cursor);
    }
    return null;
  }

  declareWin(seat: Seat): void {
    const win = seat.isWinning() ?? seat.best();
    this.phase = "over";
    this.winner = seat.name;
    this.winningHand = win.pattern.display();
    this.log(`MAHJONG! ${seat.name}: ${this.winningHand}`);
    this.revealWinningHand(seat, win.tileSet.tileIds);
    this.gamesPlayed++;
    this.lastMahjongWallTiles = this.wall.tiles.length;
    const decade = Game.tilesLeftDecade(this.wall.tiles.length);
    this.tilesLeftBuckets[decade] = (this.tilesLeftBuckets[decade] ?? 0) + 1;
    for (const s of this.seats) {
      this.stats[s.name].games++;
      if (s.name === seat.name) this.stats[s.name].wins++;
    }
  }

  /**
   * Move the winner's full 14 tiles onto the exposed rack, ordered by the
   * winning pattern, so the completed hand is easy to read above an empty hand.
   */
  private revealWinningHand(seat: Seat, patternIds: number[]): void {
    const pool = [...seat.hand.tiles, ...seat.rack.tiles];
    seat.hand.tiles = [];
    seat.rack.tiles = [];
    const ordered: Tile[] = [];
    for (const id of patternIds) {
      let idx = pool.findIndex((t) => !t.isJoker() && t.id === id);
      if (idx < 0) idx = pool.findIndex((t) => t.isJoker());
      if (idx >= 0) {
        const t = pool.splice(idx, 1)[0];
        if (t.isJoker()) t.jokerId = id;
        ordered.push(t);
      }
    }
    // Any leftovers (shouldn't happen on a true win)
    ordered.push(...pool);
    seat.rack.tiles = ordered;
    seat.rack.hasExposedTiles = true;
  }

  private declareWall(): void {
    this.phase = "over";
    this.wallGame = true;
    this.winner = null;
    this.log("Wall game — no winner.");
    this.gamesPlayed++;
    this.wallGames++;
    for (const s of this.seats) this.stats[s.name].games++;
  }

  /**
   * Process a discard that is now on the table: calls or next player draws.
   */
  private afterDiscard(discard: Tile, discarder: SeatName): void {
    this.lastDiscard = discard;
    this.lastDiscarder = discarder;
    this.pendingHumanCall = null;

    // Pause for human call opportunity (mahjong or pung+) before bots claim,
    // unless a bot has mahjong (mahjong beats a slower human pung).
    if (this.humanEast && discarder !== "East") {
      const east = this.seat("East");
      const eastCall = Bot.tryCall(east, discard, false);
      const botMahjong = this.seats.some((s) => {
        if (s.name === "East" || s.name === discarder) return false;
        return Bot.tryCall(s, discard, false)?.winning === true;
      });
      if (eastCall && !botMahjong) {
        this.pendingHumanCall = discard;
        this.turn = "East";
        this.log(`Discard ${discard.getDisplayName()} — call (c) or pass (p)?`);
        return;
      }
    }

    this.continueAfterDiscard(discard, discarder);
  }

  /** Resume after human passes on a call, or immediately when no human pause. */
  continueAfterDiscard(discard: Tile, discarder: SeatName): void {
    const caller = this.resolveCalls(discard, discarder);
    if (caller) {
      const call = Bot.tryCall(caller, discard, false)!;
      if (call.winning) {
        caller.hand.tiles.push(discard);
        this.declareWin(caller);
        return;
      }
      Bot.applyCall(caller, discard, call.fromHand);
      this.log(caller.lastEvent);
      this.lastDiscard = null;
      this.pendingHumanCall = null;
      if (caller.isHuman) {
        this.turn = caller.name;
        return;
      }
      const ex = Bot.tryJokerExchange(caller, this);
      if (ex) this.log(ex);
      if (caller.isWinning()) {
        this.declareWin(caller);
        return;
      }
      const d = Bot.discard(caller, true);
      this.log(caller.lastEvent);
      this.afterDiscard(d, caller.name);
      return;
    }

    const next = this.seatAfter(discarder);
    this.lastDiscard = null;
    this.pendingHumanCall = null;
    if (this.wall.tiles.length === 0) {
      this.declareWall();
      return;
    }
    this.turn = next;
    if (this.seat(next).isHuman) return;
    this.botTakeTurn(next);
  }

  /** Bot draws (if needed), exchanges jokers, checks win, discards. */
  botTakeTurn(name: SeatName): void {
    const seat = this.seat(name);
    if (this.phase !== "play") return;

    // Draw if hand+rack == 13
    if (seat.allTiles().length === 13) {
      if (this.wall.tiles.length === 0) {
        this.declareWall();
        return;
      }
      const drawn = this.wall.tiles.shift()!;
      seat.hand.tiles.push(drawn);
      this.log(`${name} drew ${drawn.getDisplayName()}`);
    }

    const ex = Bot.tryJokerExchange(seat, this);
    if (ex) this.log(ex);

    if (seat.isWinning()) {
      this.declareWin(seat);
      return;
    }

    const d = Bot.discard(seat, this.preferFlowers());
    this.log(seat.lastEvent);
    this.afterDiscard(d, name);
  }

  /** East's opening discard (bots) or after charleston. */
  startPlayIfNeeded(): void {
    if (this.phase !== "play") return;
    if (this.lastDiscarder !== null) return;
    const east = this.seat("East");
    if (east.isHuman) return;
    if (east.allTiles().length === 14) {
      if (east.isWinning()) {
        this.declareWin(east);
        return;
      }
      const d = Bot.discard(east, this.preferFlowers());
      this.log(east.lastEvent);
      this.afterDiscard(d, "East");
    }
  }

  /** Human: draw at start of turn if at 13 tiles. */
  humanDraw(): Tile | null {
    const east = this.seat("East");
    if (!east.isHuman || this.phase !== "play" || this.turn !== "East") return null;
    if (east.allTiles().length !== 13) return null;
    if (this.wall.tiles.length === 0) {
      this.declareWall();
      return null;
    }
    const drawn = this.wall.tiles.shift()!;
    east.hand.tiles.push(drawn);
    this.log(`You drew ${drawn.getDisplayName()}`);
    const ex = Bot.tryJokerExchange(east, this);
    if (ex) this.log(ex);
    if (east.isWinning()) this.declareWin(east);
    return drawn;
  }

  /** Human discard by hand index (0-based in current hand). */
  humanDiscard(index: number): string | null {
    const east = this.seat("East");
    if (!east.isHuman || this.phase !== "play" || this.turn !== "East") {
      return "Not your turn to discard.";
    }
    if (east.allTiles().length !== 14) return "Need 14 tiles to discard (draw first).";
    if (index < 0 || index >= east.hand.tiles.length) return "Invalid tile index.";
    const tile = east.hand.tiles.splice(index, 1)[0];
    this.log(`You discarded ${tile.getDisplayName()}`);
    if (east.isWinning()) {
      // shouldn't have discarded while winning
    }
    this.afterDiscard(tile, "East");
    return null;
  }

  /** Human calls the current discard. */
  humanCall(): string | null {
    const east = this.seat("East");
    const discard = this.pendingHumanCall ?? this.lastDiscard;
    if (!east.isHuman || !discard || this.lastDiscarder === "East") {
      return "Nothing to call.";
    }
    const call = Bot.tryCall(east, discard, false);
    if (!call) return "Cannot call that tile under NMJL rules (need pung+ or mahjong; no jokers on singles/pairs).";
    if (call.winning) {
      east.hand.tiles.push(discard);
      this.lastDiscard = null;
      this.pendingHumanCall = null;
      this.declareWin(east);
      return null;
    }
    Bot.applyCall(east, discard, call.fromHand);
    this.log(east.lastEvent);
    this.lastDiscard = null;
    this.pendingHumanCall = null;
    this.turn = "East";
    return null;
  }

  /** Human declines call — bots may still call, else next seat draws. */
  humanPassDiscard(): void {
    if (!this.lastDiscard || !this.lastDiscarder) return;
    const discard = this.lastDiscard;
    const discarder = this.lastDiscarder;
    this.pendingHumanCall = null;
    this.continueAfterDiscard(discard, discarder);
  }

  /**
   * One visible step: a Charleston round, or kick off / continue play until
   * the game needs input (human) or ends. Bot play chains through calls
   * recursively inside afterDiscard.
   */
  step(): void {
    if (this.phase === "charleston") {
      this.runCharlestonRound();
      return;
    }
    if (this.phase === "play") {
      if (this.pendingHumanCall) return;
      if (this.humanEast && this.turn === "East") {
        if (this.seat("East").allTiles().length === 13) this.humanDraw();
        return;
      }
      // Opening discard or resume bot turn
      if (this.lastDiscarder === null && this.turn === "East") {
        this.startPlayIfNeeded();
      } else {
        this.botTakeTurn(this.turn);
      }
    }
  }

  /** Finish Charleston + play to end (watch) or until human must act. */
  auto(): void {
    while (this.phase === "charleston") {
      this.runCharlestonRound();
    }
    if (this.phase !== "play") return;
    if (this.humanEast) {
      if (this.turn === "East") {
        if (this.seat("East").allTiles().length === 13) this.humanDraw();
        return;
      }
      // Bots act until East's turn / call / over
      if (this.pendingHumanCall) return;
      this.botTakeTurn(this.turn);
      return;
    }
    // Full bot game from East's first discard
    this.startPlayIfNeeded();
  }

  /**
   * Run one complete watch-mode game. Returns a result summary.
   * Does not change humanEast permanently.
   */
  playOneWatchGame(): { wall: boolean; winner: SeatName | null; hand: string; gameNumber: number } {
    const wasHuman = this.humanEast;
    this.newGame(false);
    this.auto();
    if (this.phase !== "over") {
      this.declareWall();
    }
    const result = {
      wall: this.wallGame,
      winner: this.winner,
      hand: this.winningHand,
      gameNumber: this.gamesPlayed,
    };
    this.humanEast = wasHuman;
    return result;
  }

  /** Run N complete watch-mode games for stats. */
  simulate(n: number, onGame?: (result: ReturnType<Game["playOneWatchGame"]>) => void): void {
    for (let i = 0; i < n; i++) {
      const result = this.playOneWatchGame();
      onGame?.(result);
    }
  }

  /** Reset seat win / game counters. */
  clearStats(): void {
    for (const name of SEAT_ORDER) {
      this.stats[name] = { wins: 0, games: 0 };
    }
    this.gamesPlayed = 0;
    this.wallGames = 0;
    this.tilesLeftBuckets = Game.emptyTileBuckets();
    this.lastMahjongWallTiles = 0;
  }

  mahjongWins(): number {
    return SEAT_ORDER.reduce((n, name) => n + this.stats[name].wins, 0);
  }

  wallRate(): number {
    if (this.gamesPlayed === 0) return 0;
    return (100 * this.wallGames) / this.gamesPlayed;
  }

  winRate(name: SeatName): number {
    const s = this.stats[name];
    if (s.games === 0) return 0;
    return (100 * s.wins) / s.games;
  }
}
