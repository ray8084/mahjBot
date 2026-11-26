import { Tile } from "./tile";

/** Port of Hand.java: an ordered list of tiles with save/undo support. */
export class Hand {
  name = "";
  tiles: Tile[] = [];
  lastTiles: Tile[] = [];
  maxTiles = 14;

  constructor(name = "", maxTiles = 14) {
    this.name = name;
    this.maxTiles = maxTiles;
  }

  saveState(): void {
    // Deep copy tiles to avoid duplicate references after undo
    this.lastTiles = this.tiles.map((tile) => Tile.copy(tile));
  }

  undo(): void {
    // Deep copy from saved state
    this.tiles = this.lastTiles.map((tile) => Tile.copy(tile));
  }

  getJokerCount(): number {
    let count = 0;
    for (const tile of this.tiles) {
      if (tile.isJoker()) count++;
    }
    return count;
  }

  getTileCount(tile: Tile): number {
    let count = 0;
    for (const t of this.tiles) {
      if (t.id === tile.id) count++;
    }
    return count;
  }

  moveTo(hand: Hand): void {
    hand.tiles.push(...this.tiles);
    this.tiles = [];
  }

  charlestonTo(destination: Hand, count: number): void {
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < this.tiles.length; j++) {
        const tile = this.tiles[j];
        if (!tile.isJoker() && !tile.isFlower()) {
          destination.tiles.push(...this.tiles.splice(j, 1));
          break;
        }
      }
    }
  }

  getDiscard(withFlowers: boolean): Tile | null {
    let tile: Tile | null = null;
    for (let i = 0; i < this.tiles.length; i++) {
      const checkTile = this.tiles[i];
      if (!checkTile.isJoker()) {
        if (withFlowers || !checkTile.isFlower()) {
          tile = this.tiles.splice(i, 1)[0];
          break;
        }
      }
    }
    if (tile === null && this.tiles.length > 0) {
      tile = this.tiles.splice(0, 1)[0];
    }
    return tile;
  }

  add(index: number, tile: Tile): boolean {
    let added = false;

    if (this.tiles.length < this.maxTiles) {
      if (index < this.tiles.length) {
        this.tiles.splice(index, 0, tile);
        if (tile.isJoker() && index > 0) {
          tile.jokerId = this.tiles[index - 1].id; // joker id from the previous tile
          if (tile.jokerId === tile.id) {
            tile.jokerId = this.tiles[index - 1].jokerId; // the previous tile was a joker
          }
        }
        added = true;
      } else {
        this.tiles.push(tile);
        if (tile.isJoker() && this.tiles.length >= 2) {
          index = this.tiles.length - 1;
          tile.jokerId = this.tiles[index - 1].id; // joker id from the previous tile
        }
        added = true;
      }
    }

    return added;
  }

  sort(): void {
    // Match Java's Collections.sort (stable sort by sortId).
    this.tiles.sort((a, b) => a.compareTo(b));
  }
}
