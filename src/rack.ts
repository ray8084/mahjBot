import { Hand } from "./hand";
import { Tile } from "./tile";

/** Port of Meld.java: a simple list of tiles (e.g. Pung, Kong, Quint). */
export class Meld {
  tiles: Tile[] = [];

  constructor(tiles?: Tile[]) {
    if (tiles) this.tiles = [...tiles];
  }
}

/** Port of Rack.java: exposed tiles plus the melds built from them. */
export class Rack extends Hand {
  /** List of melds (exposed sets) on the rack. */
  melds: Meld[] = [];

  /** True if player has exposed tiles on the rack during play. */
  hasExposedTiles = false;

  clearMelds(): void {
    this.melds = [];
    this.hasExposedTiles = false;
  }

  /**
   * Mark tiles as exposed. Called when East discards after having tiles on the
   * rack, indicating a commitment to exposing (not just arranging for mahjong).
   */
  markTilesExposed(): void {
    if (this.tiles.length > 0) {
      this.hasExposedTiles = true;
    }
  }

  /** Effective id for matching: tile.id for regular tiles, jokerId for jokers when > 0, else 0. */
  private getEffectiveId(tile: Tile): number {
    if (tile.isJoker() && tile.jokerId > 0) return tile.jokerId;
    if (tile.isJoker()) return 0;
    return tile.id;
  }

  /**
   * Pure validation: no side effects on melds or rack. Assigns jokerIds to the
   * first real tile's id found in the meld. If all jokers, leaves them unassigned.
   */
  private validateMeld(m: Meld): boolean {
    const list = m.tiles;
    if (list.length < 3) return false;

    // Clear any stale joker IDs before validation
    for (const tile of list) {
      if (tile.isJoker()) {
        tile.clearJokerSuit();
      }
    }

    // Find the first real (non-joker) tile id
    let realTileId = 0;
    for (const tile of list) {
      if (!tile.isJoker()) {
        realTileId = tile.id;
        break;
      }
    }

    // Assign jokerIds to all jokers (if we found a real tile)
    if (realTileId > 0) {
      for (const tile of list) {
        if (tile.isJoker()) {
          tile.jokerId = realTileId;
        }
      }
    }

    let first = -1;
    for (const tile of list) {
      const eid = this.getEffectiveId(tile);
      if (first === -1) first = eid;
      else if (eid !== first) return false;
    }
    return true;
  }

  /**
   * Tiles on the rack not already in any meld. Uses effective id only;
   * find-and-remove. If short on tiles when matching, ignore and continue.
   */
  getNewTiles(): Tile[] {
    const newTiles = [...this.tiles];
    for (const m of this.melds) {
      for (const t of m.tiles) {
        const eid = this.getEffectiveId(t);
        for (let i = 0; i < newTiles.length; i++) {
          if (this.getEffectiveId(newTiles[i]) === eid) {
            newTiles.splice(i, 1);
            break;
          }
        }
      }
    }
    return newTiles;
  }

  /**
   * Validate that the rack forms a valid meld (3+ identical tiles, including
   * jokers) and record it. Validates only newly melded tiles; existing melds
   * are ignored. New tiles that match an existing meld are added to that meld
   * (for expanding kongs to quints, etc.)
   *
   * @returns true if valid or nothing new to validate, false otherwise
   */
  validateAndRecordMeld(): boolean {
    const newTiles = this.getNewTiles();
    if (newTiles.length === 0) return true;

    // Check if new tiles can be added to an existing meld.
    // If new tiles form a complete meld (3+) and melds are locked, force a new
    // meld rather than expanding an existing one (e.g. second group of FFF
    // stays separate)
    const remainingNewTiles = [...newTiles];
    const forceNewMeld = this.hasExposedTiles && newTiles.length >= 3;

    if (!forceNewMeld) {
      for (const newTile of newTiles) {
        const newTileEid = this.getEffectiveId(newTile);
        for (const m of this.melds) {
          if (m.tiles.length > 0) {
            const meldEid = this.getEffectiveId(m.tiles[0]);
            if (newTileEid === meldEid || (newTile.isJoker() && newTileEid === 0)) {
              m.tiles.push(newTile);
              if (newTile.isJoker() && newTile.jokerId === 0) {
                for (const mt of m.tiles) {
                  if (!mt.isJoker()) {
                    newTile.jokerId = mt.id;
                    break;
                  }
                }
              }
              const idx = remainingNewTiles.indexOf(newTile);
              if (idx >= 0) remainingNewTiles.splice(idx, 1);
              break;
            }
          }
        }
      }
    }

    // If all new tiles were added to existing melds, we're done
    if (remainingNewTiles.length === 0) return true;

    // Otherwise, remaining tiles must form a new valid meld (3+ tiles)
    const candidate = new Meld(remainingNewTiles);
    if (!this.validateMeld(candidate)) return false;
    this.melds.push(candidate);
    return true;
  }

  /**
   * Remove and return all tiles that are not part of valid melds. Used to
   * auto-fix singles/pairs errors by moving invalid tiles back to hand.
   */
  removeInvalidTiles(): Tile[] {
    const invalidTiles = this.getNewTiles();
    for (const t of invalidTiles) {
      const idx = this.tiles.indexOf(t);
      if (idx >= 0) this.tiles.splice(idx, 1);
    }
    return invalidTiles;
  }

  /**
   * Update melds after a joker exchange. Replaces the old joker tile reference
   * with the new tile in the melds list.
   */
  updateMeldsAfterJokerExchange(oldJoker: Tile, newTile: Tile): void {
    for (const m of this.melds) {
      for (let i = 0; i < m.tiles.length; i++) {
        if (m.tiles[i] === oldJoker) {
          m.tiles[i] = newTile;
          return;
        }
      }
    }
  }

  /**
   * Remove a tile from melds when it's taken from the rack (e.g., for joker
   * exchange). If removing the tile makes a meld invalid (< 3 tiles), the
   * entire meld is removed.
   */
  removeTileFromMelds(tile: Tile): void {
    const meldsToRemove: Meld[] = [];
    for (const m of this.melds) {
      const idx = m.tiles.indexOf(tile);
      if (idx >= 0) {
        m.tiles.splice(idx, 1);
        // Tile was in this meld - check if meld is still valid
        if (m.tiles.length < 3) {
          meldsToRemove.push(m);
        }
        break; // Tile can only be in one meld
      }
    }
    this.melds = this.melds.filter((m) => !meldsToRemove.includes(m));
  }

  /**
   * Check if adding a tile to the rack should trigger an automatic joker
   * exchange. If the tile matches a meld containing a joker, the joker is
   * removed and returned.
   *
   * @returns the joker that was exchanged out, or null if no exchange occurred
   */
  autoJokerExchange(newTile: Tile): Tile | null {
    if (newTile.isJoker()) return null; // Can't exchange joker for joker

    const newTileId = newTile.id;

    for (const m of this.melds) {
      // Check if this meld matches the new tile
      let meldMatches = false;
      let jokerInMeld: Tile | null = null;

      for (const t of m.tiles) {
        if (t.isJoker() && t.jokerId === newTileId) {
          jokerInMeld = t;
        } else if (!t.isJoker() && t.id === newTileId) {
          meldMatches = true;
        }
      }

      // If meld matches and has a joker, do the exchange
      if (meldMatches && jokerInMeld !== null) {
        // Add new tile to meld, remove joker
        m.tiles.push(newTile);
        m.tiles.splice(m.tiles.indexOf(jokerInMeld), 1);
        // Clear joker's ID since it's going back to hand
        jokerInMeld.jokerId = 0;
        // Remove joker from rack tiles and add new tile
        const idx = this.tiles.indexOf(jokerInMeld);
        if (idx >= 0) this.tiles.splice(idx, 1);
        this.tiles.push(newTile);
        return jokerInMeld;
      }
    }
    return null;
  }

  private meldContainsTileId(meld: Meld, tileId: number): boolean {
    for (const tile of meld.tiles) {
      if (!tile.isJoker() && tile.id === tileId) return true;
      if (tile.isJoker() && tile.jokerId === tileId) return true;
    }
    return false;
  }

  private countUnmeldedTilesById(tileId: number): number {
    let count = 0;
    for (const tile of this.getNewTiles()) {
      if (!tile.isJoker() && tile.id === tileId) count++;
    }
    return count;
  }

  private countUnmeldedJokers(): number {
    let count = 0;
    for (const tile of this.getNewTiles()) {
      if (tile.isJoker()) count++;
    }
    return count;
  }

  /**
   * Detect whether a tile could be part of a second matching meld candidate.
   * This allows building a parallel meld (e.g. second FFF) while locked.
   */
  hasSecondMatchingSetCandidate(
    tile: Tile | null,
    matchingTilesInHand: number,
    jokersInHand: number,
  ): boolean {
    if (tile === null || tile.isJoker()) return false;
    const tileId = tile.id;

    let hasExistingMatchingMeld = false;
    for (const meld of this.melds) {
      if (this.meldContainsTileId(meld, tileId)) {
        hasExistingMatchingMeld = true;
        break;
      }
    }
    if (!hasExistingMatchingMeld) return false;

    const availableMatchingTiles = 1 + matchingTilesInHand + this.countUnmeldedTilesById(tileId);
    const availableJokers = jokersInHand + this.countUnmeldedJokers();
    return availableMatchingTiles + availableJokers >= 3;
  }

  /**
   * Check if a tile would be added to an existing locked meld. After a player
   * has discarded (hasExposedTiles=true), melds are locked and can't be
   * expanded. Only joker exchange is allowed on locked melds. Starting a NEW
   * meld (with tiles that don't match existing melds) is always allowed.
   *
   * @returns true if this would illegally expand a locked meld
   */
  wouldExpandLockedMeld(tile: Tile, matchingTilesInHand = 0, jokersInHand = 0): boolean {
    if (!this.hasExposedTiles) return false; // Melds not locked yet

    // Jokers don't have an ID until placed, so we can't know which meld they'd
    // join. Allow jokers - they'll be validated when the meld is completed.
    if (tile.isJoker()) {
      return false;
    }

    const tileId = tile.id;

    for (const m of this.melds) {
      // Check if this meld matches the tile
      let meldMatches = false;
      let hasJokerToExchange = false;

      for (const t of m.tiles) {
        if (t.isJoker() && t.jokerId === tileId) {
          hasJokerToExchange = true;
        } else if (!t.isJoker() && t.id === tileId) {
          meldMatches = true;
        }
      }

      // If meld matches but has no joker to exchange, this would be illegal expansion
      if (meldMatches && !hasJokerToExchange) {
        if (this.hasSecondMatchingSetCandidate(tile, matchingTilesInHand, jokersInHand)) {
          return false;
        }
        return true;
      }
    }
    return false;
  }
}
