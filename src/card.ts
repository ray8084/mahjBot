/**
 * NMJL score card: patterns, tile sets, and joker-aware matching.
 * jokerMask: '1' = joker allowed at that position, '0' = natural only
 * (singles, pairs, and entire Singles & Pairs hands).
 */
import { Tile, TileSet } from "./tile";

export type Family =
  | "YEAR"
  | "F2468"
  | "LIKE_NUMBERS"
  | "QUINTS"
  | "RUN"
  | "F13579"
  | "WINDS"
  | "F369"
  | "PAIRS";

export interface CardPatternJson {
  id?: number;
  text: string;
  mask: string;
  jokerMask: string;
  note?: string;
  family: string;
  concealed?: boolean;
  points?: number;
  tileSets?: number[][];
}

export class LetterPattern {
  pattern: string;
  mask: string;
  jokerMask: string;
  /** Compact joker mask with spaces removed (length 14). */
  jokerBits: string;
  note: string;
  index: number;
  family: Family;
  concealed: boolean;
  points: number;
  matchCount = 0;

  constructor(
    text: string,
    mask: string,
    jokerMask: string,
    note: string,
    index: number,
    family: Family,
    concealed: boolean,
    points: number,
  ) {
    this.pattern = text;
    this.mask = mask;
    this.jokerMask = jokerMask;
    this.jokerBits = jokerMask.replace(/\s+/g, "");
    this.note = note;
    this.index = index;
    this.family = family;
    this.concealed = concealed;
    this.points = points;
  }

  /** True if no position on this hand accepts a joker (Singles & Pairs). */
  get noJokersAllowed(): boolean {
    return !this.jokerBits.includes("1");
  }

  display(): string {
    let s = this.pattern;
    if (this.concealed && !s.includes("(C)")) s += " (C)";
    if (this.note) s += ` — ${this.note}`;
    return s;
  }
}

export interface ScoredSet {
  tileSet: TileSet;
  pattern: LetterPattern;
  /** Positions filled by natural tiles + legal jokers. */
  filled: number;
  naturals: number;
  jokersUsed: number;
}

export class Card {
  letterPatterns: LetterPattern[] = [];
  tileSets: TileSet[] = [];

  static fromPatterns(patterns: CardPatternJson[]): Card {
    const card = new Card();
    card.importFromJson(patterns);
    return card;
  }

  /** Browser / universal loader (fetches card JSON). */
  static async load2026Fetch(url = "/data/card2026.json"): Promise<Card> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load card: ${res.status}`);
    const patterns = (await res.json()) as CardPatternJson[];
    return Card.fromPatterns(patterns);
  }

  /** Fresh card instance (bots mutate match state). */
  clone(): Card {
    const c = new Card();
    c.letterPatterns = this.letterPatterns;
    c.tileSets = this.tileSets.map((ts) => new TileSet([...ts.tileIds], ts.letterPatternIndex));
    return c;
  }

  importFromJson(patterns: CardPatternJson[]): void {
    for (const patternObj of patterns) {
      let text = patternObj.text;
      let mask = patternObj.mask;
      while (mask.includes("   ")) mask = mask.replace("   ", " ");
      let jokerMask = patternObj.jokerMask;
      const note = patternObj.note ?? "";
      const concealed = patternObj.concealed ?? false;
      const points = patternObj.points ?? 25;
      if (concealed && !text.includes("(C)")) {
        text = `${text} (C)`;
        mask = `${mask} 000`;
        jokerMask = `${jokerMask} 000`;
      }
      const family = Card.mapJsonFamily(patternObj.family);
      const lp = new LetterPattern(
        text,
        mask,
        jokerMask,
        note,
        this.letterPatterns.length,
        family,
        concealed,
        points,
      );
      this.letterPatterns.push(lp);
      if (patternObj.tileSets) {
        for (const ids of patternObj.tileSets) {
          this.tileSets.push(new TileSet([...ids], lp.index));
        }
      }
    }
  }

  private static mapJsonFamily(jsonFamily: string): Family {
    switch (jsonFamily) {
      case "Year":
      case "2026":
        return "YEAR";
      case "2468":
        return "F2468";
      case "Like Numbers":
      case "Any Like Numbers":
        return "LIKE_NUMBERS";
      case "Quints":
        return "QUINTS";
      case "Runs":
        return "RUN";
      case "13579":
        return "F13579";
      case "Winds":
        return "WINDS";
      case "369":
        return "F369";
      case "Singles & Pairs":
        return "PAIRS";
      default:
        if (/^\d{4}$/.test(jsonFamily)) return "YEAR";
        return "YEAR";
    }
  }

  patternByIndex(index: number): LetterPattern {
    return this.letterPatterns[index];
  }

  /**
   * Score how well `tiles` fill a concrete 14-tile realization, respecting
   * jokerMask. Jokers only fill positions marked '1'.
   */
  scoreTileSet(tileSet: TileSet, tiles: Tile[]): ScoredSet {
    const pattern = this.letterPatterns[tileSet.letterPatternIndex];
    const bits = pattern.jokerBits;
    const available = new Map<number, number>();
    let jokers = 0;
    for (const t of tiles) {
      if (t.isJoker()) jokers++;
      else available.set(t.id, (available.get(t.id) ?? 0) + 1);
    }

    let naturals = 0;
    let jokersUsed = 0;
    for (let i = 0; i < tileSet.tileIds.length; i++) {
      const id = tileSet.tileIds[i];
      const have = available.get(id) ?? 0;
      if (have > 0) {
        available.set(id, have - 1);
        naturals++;
      } else if (bits[i] === "1" && jokersUsed < jokers) {
        jokersUsed++;
      }
    }
    return {
      tileSet,
      pattern,
      filled: naturals + jokersUsed,
      naturals,
      jokersUsed,
    };
  }

  /** Best scoring realization across the whole card. */
  bestMatch(tiles: Tile[]): ScoredSet {
    let best: ScoredSet | null = null;
    for (const ts of this.tileSets) {
      const scored = this.scoreTileSet(ts, tiles);
      if (
        !best ||
        scored.filled > best.filled ||
        (scored.filled === best.filled && scored.naturals > best.naturals)
      ) {
        best = scored;
        if (best.filled === 14) break; // perfect win — stop searching
      }
    }
    if (!best) {
      throw new Error("card has no tile sets");
    }
    return best;
  }

  /** True if tiles form a complete legal mahjong (14 filled under joker rules). */
  isMahjong(tiles: Tile[]): ScoredSet | null {
    if (tiles.length !== 14) return null;
    const best = this.bestMatch(tiles);
    return best.filled === 14 ? best : null;
  }

  /**
   * Group sizes for a pattern realization, in order of appearance.
   * Used to know pung/kong/quint sizes and which groups allow jokers.
   */
  static groupInfo(tileIds: number[], jokerBits: string): Array<{
    id: number;
    size: number;
    start: number;
    jokersAllowed: boolean;
  }> {
    const groups: Array<{ id: number; size: number; start: number; jokersAllowed: boolean }> = [];
    let i = 0;
    while (i < tileIds.length) {
      const id = tileIds[i];
      let size = 1;
      let jokersAllowed = jokerBits[i] === "1";
      while (i + size < tileIds.length && tileIds[i + size] === id) {
        jokersAllowed = jokersAllowed || jokerBits[i + size] === "1";
        size++;
      }
      // For consecutive same-id runs that are actually year/singles with mask 0,
      // each position is a group of 1 when jokers aren't allowed as a block.
      // Card tileSets already expand identical tiles into contiguous blocks that
      // correspond to pung/kong/etc when jokersAllowed; when not, size 1 or 2.
      groups.push({ id, size, start: i, jokersAllowed });
      i += size;
    }
    return groups;
  }

  /**
   * Remaining need for `discardId` in the best pattern after removing exposed
   * rack tiles from the pattern. Returns group size needed for that tile
   * (0 if not needed).
   */
  callNeed(
    concealed: Tile[],
    exposed: Tile[],
    discardId: number,
  ): { groupSize: number; jokersAllowed: boolean; pattern: LetterPattern; tileIds: number[] } | null {
    const all = [...concealed, ...exposed];
    const best = this.bestMatch(all);
    const remaining = [...best.tileSet.tileIds];
    for (const t of exposed) {
      const id = t.isJoker() && t.jokerId > 0 ? t.jokerId : t.id;
      const idx = remaining.indexOf(id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    const bits = best.pattern.jokerBits;
    // Rebuild bits for remaining by tracking which pattern indices remain —
    // simpler: count how many of discardId still needed in remaining.
    let need = 0;
    let jokersAllowed = false;
    const fullIds = best.tileSet.tileIds;
    const used = new Array(fullIds.length).fill(false);
    for (const t of exposed) {
      const id = t.isJoker() && t.jokerId > 0 ? t.jokerId : t.id;
      for (let i = 0; i < fullIds.length; i++) {
        if (!used[i] && fullIds[i] === id) {
          used[i] = true;
          break;
        }
      }
    }
    for (let i = 0; i < fullIds.length; i++) {
      if (used[i]) continue;
      if (fullIds[i] === discardId) {
        need++;
        if (bits[i] === "1") jokersAllowed = true;
      }
    }
    if (need === 0) return null;
    return {
      groupSize: need,
      jokersAllowed,
      pattern: best.pattern,
      tileIds: best.tileSet.tileIds,
    };
  }

  static tileCode(id: number): string {
    if (id >= 1 && id <= 9) return `${id}D`;
    if (id === 10) return "0D";
    if (id >= 11 && id <= 19) return `${id - 10}B`;
    if (id === 20) return "GD";
    if (id >= 21 && id <= 29) return `${id - 20}C`;
    if (id === 30) return "RD";
    if (id === 31) return "N";
    if (id === 32) return "S";
    if (id === 33) return "W";
    if (id === 34) return "E";
    if (id === 35) return "F";
    if (id === 36) return "J";
    return `?${id}`;
  }

  static parseTileCode(code: string): number | null {
    const c = code.trim().toUpperCase();
    if (c === "J" || c === "JKR" || c === "JOKER") return 36;
    if (c === "F" || c === "FL" || c === "FLOWER") return 35;
    if (c === "N" || c === "NORTH") return 31;
    if (c === "S" || c === "SOUTH") return 32;
    if (c === "W" || c === "WEST") return 33;
    if (c === "E" || c === "EAST") return 34;
    if (c === "GD" || c === "G" || c === "GREEN") return 20;
    if (c === "RD" || c === "R" || c === "RED") return 30;
    if (c === "0D" || c === "SOAP" || c === "0") return 10;
    const m = /^([1-9])([DBC])$/.exec(c);
    if (!m) return null;
    const n = Number(m[1]);
    if (m[2] === "D") return n;
    if (m[2] === "B") return n + 10;
    return n + 20;
  }
}
