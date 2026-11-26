/**
 * Port of Tile.java. Tile ids match the mobile apps exactly so the shared
 * card JSON data works unchanged:
 *   1-9 dots, 10 soap, 11-19 bams, 20 green dragon, 21-29 craks,
 *   30 red dragon, 31-34 N/S/W/E winds, 35 flower, 36 joker.
 */

export const TILE_STYLE = {
  CLASSIC: 0,
  LIGHT: 1,
  LARGE: 2,
  DARK: 3,
  SOLID: 4,
  VINTAGE: 5,
} as const;

export type TileStyle = (typeof TILE_STYLE)[keyof typeof TILE_STYLE];

export interface TileJson {
  name: string;
  number: number;
  suit: string;
  id: number;
  sortId: number;
  jokerSuit?: string;
  jokerNumber?: number;
  jokerId?: number;
  flowerIndex?: number;
}

export class Tile {
  name: string;
  number: number;
  suit: string;
  jokerSuit = "";
  jokerNumber = 0;
  jokerId = 0;
  id: number;
  sortId: number;
  flowerIndex = 0;

  static tileStyle: TileStyle = TILE_STYLE.CLASSIC;
  static alternateRedDragon = false;

  static initStyle(style: TileStyle, altRedDragon: boolean): void {
    Tile.tileStyle = style;
    Tile.alternateRedDragon = altRedDragon;
  }

  constructor(name: string, num: number, suit: string, id: number, sortId: number) {
    this.name = name;
    this.number = num;
    this.suit = suit;
    this.id = id;
    this.sortId = sortId;
  }

  static copy(tile: Tile): Tile {
    const t = new Tile(tile.name, tile.number, tile.suit, tile.id, tile.sortId);
    t.jokerSuit = tile.jokerSuit;
    t.jokerNumber = tile.jokerNumber;
    t.jokerId = tile.jokerId;
    t.flowerIndex = tile.flowerIndex;
    return t;
  }

  isJoker(): boolean {
    return this.suit === "jkr";
  }

  isFlower(): boolean {
    return this.suit === "flwr";
  }

  isWind(): boolean {
    return this.suit === "wnd";
  }

  isEqual(tile: Tile): boolean;
  isEqual(suit: string, number: number): boolean;
  isEqual(tileOrSuit: Tile | string, number?: number): boolean {
    if (typeof tileOrSuit === "string") {
      return tileOrSuit === this.suit && number === this.number;
    }
    return tileOrSuit.suit === this.suit && tileOrSuit.number === this.number;
  }

  setJokerSuit(suit: string, num: number, id: number): void {
    if (this.jokerSuit === "") {
      this.jokerSuit = suit;
      this.jokerNumber = num;
      this.jokerId = id;
    }
  }

  clearJokerSuit(): void {
    this.jokerSuit = "";
    this.jokerNumber = 0;
    this.jokerId = 0;
  }

  /** Base image name per tile id, matching the classic tile file names. */
  private static idName(id: number): string | null {
    if (id >= 1 && id <= 9) return `dot${id}`;
    if (id === 10) return "soap";
    if (id >= 11 && id <= 19) return `bam${id - 10}`;
    if (id === 20) return "green";
    if (id >= 21 && id <= 29) return `crak${id - 20}`;
    if (id === 30) return "red";
    switch (id) {
      case 31: return "north";
      case 32: return "south";
      case 33: return "west";
      case 34: return "east";
      case 35: return "flower";
      case 36: return "joker";
      default: return null;
    }
  }

  private static stylePrefix(): string | null {
    switch (Tile.tileStyle) {
      case TILE_STYLE.LIGHT: return "designer";
      case TILE_STYLE.LARGE: return "large";
      case TILE_STYLE.DARK: return "dark";
      case TILE_STYLE.SOLID: return "solid";
      case TILE_STYLE.VINTAGE: return "vintage";
      default: return null;
    }
  }

  /**
   * URL of this tile's image, honoring the current tile style and the
   * alternate red dragon preference. Port of Tile.getImage().
   */
  getImage(): string {
    if (this.id === 35 && this.flowerIndex > 0) {
      if (Tile.tileStyle === TILE_STYLE.VINTAGE) {
        return `/tiles-alt/vintage_flower${this.flowerIndex}.png`;
      }
      if (Tile.tileStyle !== TILE_STYLE.CLASSIC) {
        return `/tiles-alt/${Tile.stylePrefix()}_flower.png`;
      }
      switch (this.flowerIndex) {
        case 1: return "/tiles/f1.png";
        case 2: return "/tiles/f2.png";
        case 3: return "/tiles/f3.png";
        case 4: return "/tiles/f4.png";
        case 5: return "/tiles/sum.png";
        case 6: return "/tiles/aut.png";
        case 7: return "/tiles/win.png";
        case 8: return "/tiles/spr.png";
        default: return "/tiles/f1.png";
      }
    }
    return Tile.getImageForId(this.id);
  }

  static getImageForId(id: number): string {
    // Alternate red dragon overrides every style.
    if (id === 30 && Tile.alternateRedDragon) {
      return "/tiles-alt/redalt.png";
    }
    const prefix = Tile.stylePrefix();
    const name = Tile.idName(id);
    if (prefix !== null && name !== null) {
      if (Tile.tileStyle === TILE_STYLE.VINTAGE && id === 35) {
        return "/tiles-alt/vintage_flower1.png";
      }
      return `/tiles-alt/${prefix}_${name}.png`;
    }
    if (name === null) return "";
    // Classic flowers use the f1 image as the generic face.
    if (id === 35) return "/tiles/f1.png";
    return `/tiles/${name}.png`;
  }

  getDisplayName(): string {
    const id = this.id;
    if (id >= 1 && id <= 9) return `${id} Dot`;
    if (id === 10) return "Soap";
    if (id >= 11 && id <= 19) return `${id - 10} Bam`;
    if (id === 20) return "Green Dragon";
    if (id >= 21 && id <= 29) return `${id - 20} Crak`;
    if (id === 30) return "Red Dragon";
    switch (id) {
      case 31: return "North";
      case 32: return "South";
      case 33: return "West";
      case 34: return "East";
      case 35: return "Flower";
      case 36: return "Joker";
      default: return "";
    }
  }

  compareTo(other: Tile): number {
    return this.sortId - other.sortId;
  }

  /** Creates a Tile from a tile id. Port of Tile.createFromId(). */
  static createFromId(tileId: number): Tile {
    let name = "";
    let number = 0;
    let suit = "";
    let sortId = 0;

    if (tileId >= 1 && tileId <= 9) {
      name = `${tileId}dot`;
      number = tileId;
      suit = "dot";
      sortId = tileId + 1;
    } else if (tileId === 10) {
      name = "soap";
      number = 10;
      suit = "dot";
      sortId = 41;
    } else if (tileId >= 11 && tileId <= 19) {
      name = `${tileId - 10}bam`;
      number = tileId - 10;
      suit = "bam";
      sortId = tileId + 10;
    } else if (tileId >= 21 && tileId <= 29) {
      name = `${tileId - 20}crak`;
      number = tileId - 20;
      suit = "crak";
      sortId = tileId + 20;
    } else if (tileId === 20) {
      name = "green";
      number = 11;
      suit = "drg";
      sortId = 51;
    } else if (tileId === 30) {
      name = "red";
      number = 11;
      suit = "drg";
      sortId = 52;
    } else if (tileId === 31) {
      name = "north";
      number = 11;
      suit = "wnd";
      sortId = 53;
    } else if (tileId === 32) {
      name = "south";
      number = 11;
      suit = "wnd";
      sortId = 54;
    } else if (tileId === 33) {
      name = "west";
      number = 11;
      suit = "wnd";
      sortId = 55;
    } else if (tileId === 34) {
      name = "east";
      number = 11;
      suit = "wnd";
      sortId = 56;
    } else if (tileId === 35) {
      name = "flower";
      number = 11;
      suit = "flwr";
      sortId = 57;
    } else if (tileId === 36) {
      name = "joker";
      number = 11;
      suit = "jkr";
      sortId = 55;
    } else {
      name = "unknown";
      number = 0;
      suit = "unknown";
      sortId = 99;
    }

    return new Tile(name, number, suit, tileId, sortId);
  }

  toJson(): TileJson {
    return {
      name: this.name,
      number: this.number,
      suit: this.suit,
      id: this.id,
      sortId: this.sortId,
      jokerSuit: this.jokerSuit,
      jokerNumber: this.jokerNumber,
      jokerId: this.jokerId,
      flowerIndex: this.flowerIndex,
    };
  }

  static fromJson(json: TileJson): Tile {
    const tile = new Tile(json.name, json.number, json.suit, json.id, json.sortId);
    tile.jokerSuit = json.jokerSuit ?? "";
    tile.jokerNumber = json.jokerNumber ?? 0;
    tile.jokerId = json.jokerId ?? 0;
    tile.flowerIndex = json.flowerIndex ?? 0;
    return tile;
  }
}

/** Port of TileLocation.java. */
export type TileLocationType = "RACK" | "HAND" | "DISCARD" | "BOT";

export class TileLocation {
  type: TileLocationType;
  index: number; // zero based

  constructor(type: TileLocationType, index: number) {
    this.type = type;
    this.index = index;
  }

  isDiscard(): boolean {
    return this.type === "DISCARD";
  }

  isDiscard1(): boolean {
    return this.type === "DISCARD" && this.index === 0;
  }

  isDiscard3(): boolean {
    return this.type === "DISCARD" && this.index === 2;
  }

  isRack(): boolean {
    return this.type === "RACK";
  }

  isHand(): boolean {
    return this.type === "HAND";
  }

  isBot(): boolean {
    return this.type === "BOT";
  }
}

/** Port of TileSet.java: one concrete 14-tile realization of a card pattern. */
export class TileSet {
  tileIds: number[];
  letterPatternIndex: number;
  matchCount = 0;

  constructor(ids: number[], letterPatternIndex: number) {
    this.tileIds = ids;
    this.letterPatternIndex = letterPatternIndex;
  }

  countMatches(hand: Tile[], rack: Tile[]): void {
    this.matchCount = 0;

    const tileCounts = new Map<number, number>();
    for (const id of this.tileIds) {
      tileCounts.set(id, (tileCounts.get(id) ?? 0) + 1);
    }

    for (const tile of hand) {
      const count = tileCounts.get(tile.id);
      if (count !== undefined && count > 0) {
        tileCounts.set(tile.id, count - 1);
        this.matchCount++;
      }
    }

    for (const tile of rack) {
      const count = tileCounts.get(tile.id);
      if (count !== undefined && count > 0) {
        tileCounts.set(tile.id, count - 1);
        this.matchCount++;
      }
    }
  }
}
