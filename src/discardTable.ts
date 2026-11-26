import { Tile } from "./tile";

/** Port of DiscardTable.java: running counts of every discarded tile type. */
export class DiscardTable {
  jokerCount = 0;
  flowerCount = 0;
  windCount = [0, 0, 0, 0];
  dotCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  bamCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  crakCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  private lastJokerCount = 0;
  private lastFlowerCount = 0;
  private lastWindCount = [0, 0, 0, 0];
  private lastDotCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private lastBamCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private lastCrakCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  saveState(): void {
    this.lastJokerCount = this.jokerCount;
    this.lastFlowerCount = this.flowerCount;
    this.lastWindCount = [...this.windCount];
    this.lastDotCount = [...this.dotCount];
    this.lastBamCount = [...this.bamCount];
    this.lastCrakCount = [...this.crakCount];
  }

  undo(): void {
    this.jokerCount = this.lastJokerCount;
    this.flowerCount = this.lastFlowerCount;
    this.windCount = [...this.lastWindCount];
    this.dotCount = [...this.lastDotCount];
    this.bamCount = [...this.lastBamCount];
    this.crakCount = [...this.lastCrakCount];
  }

  resetCounts(): void {
    this.jokerCount = 0;
    this.flowerCount = 0;
    this.windCount = [0, 0, 0, 0];
    this.dotCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.bamCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.crakCount = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  getCount(): number {
    let count = 0;
    for (let i = 0; i <= 9; i++) {
      count += this.dotCount[i] + this.bamCount[i] + this.crakCount[i];
    }
    for (let i = 0; i <= 3; i++) {
      count += this.windCount[i];
    }
    return count + this.jokerCount + this.flowerCount;
  }

  countTile(tile: Tile | null, increment: number): void {
    if (tile === null) {
      return;
    }

    switch (tile.suit) {
      case "dot": this.dotCount[tile.number - 1] += increment; break;
      case "bam": this.bamCount[tile.number - 1] += increment; break;
      case "crak": this.crakCount[tile.number - 1] += increment; break;
      case "wnd": {
        const windIndex = tile.id - 31; // 31->0, 32->1, 33->2, 34->3
        if (windIndex >= 0 && windIndex < this.windCount.length) {
          this.windCount[windIndex] += increment;
        }
        break;
      }
      case "jkr": this.jokerCount += increment; break;
      case "flwr": this.flowerCount += increment; break;
      default: break;
    }
  }
}
