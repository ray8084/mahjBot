import { Tile } from "./tile";
import { GameRandom } from "./random";

/**
 * Port of Deck.java: the 152-tile American mahjong set. Build order and the
 * shuffle algorithm match the mobile apps exactly so a given seed deals the
 * same wall.
 */
export class Deck {
  tiles: Tile[] = [];
  lastTiles: Tile[] = [];

  constructor() {
    for (let loop = 1; loop <= 4; loop++) {
      for (let index = 1; index <= 9; index++) {
        this.tiles.push(new Tile(`${index}dot`, index, "dot", index, index + 10));
      }
      for (let index = 1; index <= 9; index++) {
        this.tiles.push(new Tile(`${index}bam`, index, "bam", index + 10, index + 20));
      }
      for (let index = 1; index <= 9; index++) {
        this.tiles.push(new Tile(`${index}crak`, index, "crak", index + 20, index + 30));
      }
      this.tiles.push(new Tile("joker", 11, "jkr", 36, 55));
      this.tiles.push(new Tile("joker", 11, "jkr", 36, 55));
      this.tiles.push(new Tile("red", 10, "crak", 30, 43));
      this.tiles.push(new Tile("green", 10, "bam", 20, 42));
      this.tiles.push(new Tile("soap", 10, "dot", 10, 41));
      this.tiles.push(new Tile("north", 1, "wnd", 31, 51));
      this.tiles.push(new Tile("south", 2, "wnd", 32, 52));
      this.tiles.push(new Tile("west", 3, "wnd", 33, 53));
      this.tiles.push(new Tile("east", 4, "wnd", 34, 54));
      const flower = new Tile(`f${loop}`, 12, "flwr", 35, 1);
      flower.flowerIndex = loop;
      this.tiles.push(flower);
    }
    const sum = new Tile("sum", 12, "flwr", 35, 2);
    sum.flowerIndex = 5;
    this.tiles.push(sum);
    const aut = new Tile("aut", 12, "flwr", 35, 3);
    aut.flowerIndex = 6;
    this.tiles.push(aut);
    const win = new Tile("win", 12, "flwr", 35, 4);
    win.flowerIndex = 7;
    this.tiles.push(win);
    const spr = new Tile("spr", 12, "flwr", 35, 5);
    spr.flowerIndex = 8;
    this.tiles.push(spr);
    this.shuffle();
  }

  saveState(): void {
    // Deep copy tiles to avoid duplicate references after undo
    this.lastTiles = this.tiles.map((tile) => Tile.copy(tile));
  }

  undo(): void {
    // Deep copy from saved state
    this.tiles = this.lastTiles.map((tile) => Tile.copy(tile));
  }

  shuffle(): void {
    for (let i = 0; i < 3000; i++) {
      const tile = this.tiles.splice(GameRandom.nextInt(this.tiles.length), 1)[0];
      this.replace(tile);
    }
  }

  replace(tile: Tile): void {
    this.tiles.splice(GameRandom.nextInt(this.tiles.length), 0, tile);
  }
}
