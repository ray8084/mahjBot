import { Card, type ScoredSet } from "./card";
import { Hand } from "./hand";
import { Rack } from "./rack";
import { Tile } from "./tile";

export type SeatName = "East" | "South" | "West" | "North";

export class Seat {
  name: SeatName;
  hand: Hand;
  rack: Rack;
  card: Card;
  isHuman = false;
  lastEvent = "";

  constructor(name: SeatName, card: Card) {
    this.name = name;
    this.hand = new Hand(name);
    this.rack = new Rack();
    this.card = card;
  }

  allTiles(): Tile[] {
    return [...this.hand.tiles, ...this.rack.tiles];
  }

  jokerCount(): number {
    return this.hand.getJokerCount() + this.rack.getJokerCount();
  }

  best(): ScoredSet {
    return this.card.bestMatch(this.allTiles());
  }

  isWinning(): ScoredSet | null {
    const tiles = this.allTiles();
    if (tiles.length !== 14) return null;
    return this.card.isMahjong(tiles);
  }

  reset(): void {
    this.hand.tiles = [];
    this.rack.tiles = [];
    this.rack.clearMelds();
    this.lastEvent = "";
  }

  sortHand(): void {
    this.hand.sort();
  }
}
