/**
 * Rules-based American Mahjong bot.
 *
 * - Pursues the closest legal card hand (all families, including Singles & Pairs)
 * - Never uses jokers on mask-0 positions (singles/pairs)
 * - Calls only for pung/kong/quint/sextet, or for mahjong
 * - Concealed hands: call only for mahjong
 * - Charleston: never passes jokers; keeps tiles that advance the closest hand
 * - Joker exchange: swaps natural tiles for exposed jokers when legal
 */
import type { Seat } from "./seat";
import { Tile } from "./tile";
import type { Game } from "./game";

export class Bot {
  /**
   * Choose up to `count` tiles to pass in Charleston / courtesy.
   * Never passes jokers. Prefers tiles that don't help the closest hand.
   */
  static charlestonPass(seat: Seat, count: number): Tile[] {
    if (count <= 0) return [];
    const best = seat.best();
    const needed = new Map<number, number>();
    for (const id of best.tileSet.tileIds) {
      needed.set(id, (needed.get(id) ?? 0) + 1);
    }
    // How many of each id we already hold toward the pattern
    const held = new Map<number, number>();
    for (const t of seat.hand.tiles) {
      if (!t.isJoker()) held.set(t.id, (held.get(t.id) ?? 0) + 1);
    }

    const scored = seat.hand.tiles
      .map((t, index) => {
        let score = 0;
        if (t.isJoker()) score = 10_000; // never pass if avoidable
        else if (t.isFlower()) {
          const need = needed.get(35) ?? 0;
          const have = held.get(35) ?? 0;
          score = have <= need ? 500 : -50;
        } else {
          const need = needed.get(t.id) ?? 0;
          const have = held.get(t.id) ?? 0;
          // Surplus tiles (beyond pattern need) are good to pass
          if (need === 0) score = -100;
          else if (have > need) score = -80;
          else score = 100 + need; // keep needed tiles
        }
        return { t, index, score };
      })
      .sort((a, b) => a.score - b.score || a.index - b.index);

    const pass: Tile[] = [];
    const used = new Set<number>();
    for (const row of scored) {
      if (pass.length >= count) break;
      if (row.t.isJoker()) continue;
      pass.push(row.t);
      used.add(row.index);
    }
    // Blind/short pass: if still short and rules allow fewer tiles, stop.
    // For mandatory 3-tile passes, last resort is flowers then (never jokers
    // unless literally nothing else — NMJL forbids jokers in Charleston).
    if (pass.length < count) {
      for (const row of scored) {
        if (pass.length >= count) break;
        if (used.has(row.index)) continue;
        if (row.t.isJoker()) continue;
        pass.push(row.t);
        used.add(row.index);
      }
    }
    return pass;
  }

  /** Remove chosen pass tiles from hand. */
  static takePass(seat: Seat, tiles: Tile[]): void {
    for (const t of tiles) {
      const idx = seat.hand.tiles.indexOf(t);
      if (idx >= 0) seat.hand.tiles.splice(idx, 1);
    }
  }

  /**
   * Discard the tile that hurts the closest hand the least.
   * Never discards a joker unless nothing else remains.
   * Uses the current best pattern (one card scan) plus a light surplus heuristic
   * instead of rescoring the whole card for every candidate.
   */
  static chooseDiscard(seat: Seat, preferFlowers: boolean): Tile {
    const tiles = seat.hand.tiles;
    if (tiles.length === 0) {
      throw new Error(`${seat.name} has nothing to discard`);
    }

    const best = seat.best();
    const need = new Map<number, number>();
    for (const id of best.tileSet.tileIds) {
      need.set(id, (need.get(id) ?? 0) + 1);
    }
    const held = new Map<number, number>();
    for (const t of seat.allTiles()) {
      if (!t.isJoker()) held.set(t.id, (held.get(t.id) ?? 0) + 1);
    }

    let bestTile: Tile | null = null;
    let bestScore = Infinity;

    for (const candidate of tiles) {
      if (candidate.isJoker()) continue;
      const n = need.get(candidate.id) ?? 0;
      const h = held.get(candidate.id) ?? 0;
      // Higher score = worse to discard. Prefer tossing surplus / orphans.
      let score: number;
      if (n === 0) score = -100; // orphan
      else if (h > n) score = -50; // surplus
      else score = 100 + n; // needed
      if (candidate.isFlower()) score += preferFlowers ? 5 : -15;
      if (score < bestScore) {
        bestScore = score;
        bestTile = candidate;
      }
    }

    return bestTile ?? tiles[0];
  }

  static discard(seat: Seat, preferFlowers: boolean): Tile {
    const tile = Bot.chooseDiscard(seat, preferFlowers);
    const idx = seat.hand.tiles.indexOf(tile);
    if (idx >= 0) seat.hand.tiles.splice(idx, 1);
    seat.lastEvent = `${seat.name} discarded ${tile.getDisplayName()}`;
    return tile;
  }

  /**
   * After drawing, exchange a natural tile for an exposed joker if possible.
   * Returns a log message or null.
   */
  static tryJokerExchange(seat: Seat, game: Game): string | null {
    for (const other of game.seats) {
      for (const handTile of [...seat.hand.tiles]) {
        if (handTile.isJoker()) continue;
        for (let ri = 0; ri < other.rack.tiles.length; ri++) {
          const rackTile = other.rack.tiles[ri];
          if (rackTile.isJoker() && rackTile.jokerId === handTile.id) {
            // Swap
            other.rack.tiles.splice(ri, 0, handTile);
            const jIdx = other.rack.tiles.indexOf(rackTile);
            if (jIdx >= 0) other.rack.tiles.splice(jIdx, 1);
            other.rack.updateMeldsAfterJokerExchange(rackTile, handTile);
            const hIdx = seat.hand.tiles.indexOf(handTile);
            if (hIdx >= 0) seat.hand.tiles.splice(hIdx, 1);
            seat.hand.tiles.push(rackTile);
            rackTile.clearJokerSuit();
            const msg = `${seat.name} exchanged ${handTile.getDisplayName()} for Joker on ${other.name}'s rack`;
            seat.lastEvent = msg;
            return msg;
          }
        }
      }
    }
    return null;
  }

  /**
   * Decide whether to call the discard.
   * Returns exposure tiles taken from hand (not including discard), or null.
   */
  static tryCall(
    seat: Seat,
    discard: Tile,
    forMahjongOnly: boolean,
  ): { fromHand: Tile[]; winning: boolean } | null {
    if (discard.isJoker()) return null; // cannot call a discarded joker

    const concealed = seat.hand.tiles;
    const exposed = seat.rack.tiles;

    // Mahjong call: would 14 tiles with discard be a win?
    const withDiscard = [...concealed, ...exposed, discard];
    if (withDiscard.length === 14) {
      const win = seat.card.isMahjong(withDiscard);
      if (win) {
        // Move everything needed — for mahjong we expose/claim the discard
        // and keep the rest in hand; game will rack all on win.
        return { fromHand: [], winning: true };
      }
    }

    if (forMahjongOnly) return null;

    const need = seat.card.callNeed(concealed, exposed, discard.id);
    if (!need) return null;

    // Concealed hands may not expose mid-game
    if (need.pattern.concealed) return null;

    const groupSize = need.groupSize;
    // Only call for pung (3+). Singles/pairs only via mahjong above.
    if (groupSize < 3) return null;
    if (!need.jokersAllowed && groupSize >= 3) {
      // Melds always allow jokers on NMJL except S&P — if mask says no for
      // this group, treat as non-callable (shouldn't happen for 3+).
    }

    const matching = concealed.filter((t) => t.id === discard.id);
    const jokers = concealed.filter((t) => t.isJoker());
    const slotsToFill = groupSize - 1; // discard fills one
    if (matching.length >= slotsToFill) {
      return { fromHand: matching.slice(0, slotsToFill), winning: false };
    }
    const jokersNeeded = slotsToFill - matching.length;
    if (jokersNeeded > jokers.length) return null;
    if (jokersNeeded > 2) return null; // don't dump too many jokers on a call
    // Jokers only legal if this group allows them
    if (jokersNeeded > 0 && !need.jokersAllowed) return null;

    const fromHand = [
      ...matching,
      ...jokers.slice(0, jokersNeeded).map((j) => {
        j.jokerId = discard.id;
        return j;
      }),
    ];
    return { fromHand, winning: false };
  }

  /** Apply a successful call: move tiles to rack as an exposed meld. */
  static applyCall(seat: Seat, discard: Tile, fromHand: Tile[]): void {
    for (const t of fromHand) {
      const idx = seat.hand.tiles.indexOf(t);
      if (idx >= 0) seat.hand.tiles.splice(idx, 1);
    }
    const meldTiles = [discard, ...fromHand];
    seat.rack.tiles.push(...meldTiles);
    seat.rack.melds.push({ tiles: [...meldTiles] });
    seat.rack.hasExposedTiles = true;
    seat.lastEvent = `${seat.name} called ${discard.getDisplayName()} (${meldTiles.length})`;
  }

  /**
   * Top matching card hands (unique patterns).
   * Sort: most tiles filled, then more naturals.
   * Optional `probOf` breaks remaining ties toward higher completion %.
   */
  static topHandMatches(
    seat: Seat,
    n = 5,
    probOf?: (handIndex: number) => number | null,
  ): Array<{
    index: number;
    filled: number;
    naturals: number;
    pattern: string;
    note: string;
    concealed: boolean;
    coloredHtml: string;
  }> {
    const tiles = seat.allTiles();
    const scored = seat.card.tileSets
      .map((ts) => seat.card.scoreTileSet(ts, tiles))
      .sort((a, b) => {
        if (b.filled !== a.filled) return b.filled - a.filled;
        if (b.naturals !== a.naturals) return b.naturals - a.naturals;
        if (probOf) {
          const pa = probOf(a.pattern.index) ?? -1;
          const pb = probOf(b.pattern.index) ?? -1;
          if (pb !== pa) return pb - pa;
        }
        return 0;
      });
    const seen = new Set<number>();
    const out: Array<{
      index: number;
      filled: number;
      naturals: number;
      pattern: string;
      note: string;
      concealed: boolean;
      coloredHtml: string;
    }> = [];
    for (const s of scored) {
      if (seen.has(s.pattern.index)) continue;
      seen.add(s.pattern.index);
      out.push({
        index: s.pattern.index,
        filled: s.filled,
        naturals: s.naturals,
        pattern: s.pattern.pattern.replace(/\s*\(C\)\s*/g, "").trim(),
        note: s.pattern.note,
        concealed: s.pattern.concealed,
        coloredHtml: s.pattern.coloredHtml(true),
      });
      if (out.length >= n) break;
    }
    return out;
  }

  /** Top hands for display / debugging. */
  static topHands(seat: Seat, n = 3): string[] {
    return Bot.topHandMatches(seat, n).map(
      (s) => `${s.filled}/14  ${s.pattern}${s.concealed ? " (C)" : ""}`,
    );
  }
}
