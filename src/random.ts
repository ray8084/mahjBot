/**
 * Faithful TypeScript port of java.util.Random (48-bit LCG), so that a given
 * seed deals exactly the same game as the Android/iOS apps. State is kept in
 * a BigInt because the multiply overflows the JS safe-integer range.
 */
export class JavaRandom {
  private static readonly MULTIPLIER = 0x5deece66dn;
  private static readonly ADDEND = 0xbn;
  private static readonly MASK = (1n << 48n) - 1n;

  private seed = 0n;

  constructor(seed?: bigint | number) {
    if (seed === undefined) {
      seed = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) ^
        BigInt(Date.now());
    }
    this.setSeed(BigInt(seed));
  }

  setSeed(seed: bigint): void {
    this.seed = (seed ^ JavaRandom.MULTIPLIER) & JavaRandom.MASK;
  }

  /** Returns the next pseudorandom value as a signed 32-bit int of `bits` bits. */
  private next(bits: number): number {
    this.seed = (this.seed * JavaRandom.MULTIPLIER + JavaRandom.ADDEND) & JavaRandom.MASK;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }

  nextInt(bound: number): number {
    if (bound <= 0) {
      throw new Error("bound must be positive");
    }
    if ((bound & -bound) === bound) {
      // power of two
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits: number;
    let val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (((bits - val + (bound - 1)) | 0) < 0);
    return val;
  }

  nextDouble(): number {
    const high = BigInt(this.next(26)) << 27n;
    const low = BigInt(this.next(27));
    return Number(high + low) * 2 ** -53;
  }

  nextLong(): bigint {
    const high = BigInt(this.next(32)) << 32n;
    const low = BigInt(this.next(32));
    return BigInt.asIntN(64, high + low);
  }
}

/**
 * Centralized random source for all gameplay randomness (wall shuffle, bot
 * choices, etc.). When seeding is enabled a fixed seed is applied at the start
 * of every new deal so a session can reproduce identical games. When disabled
 * it behaves like a normal unseeded random. Port of GameRandom.java.
 */
export const GameRandom = {
  _random: new JavaRandom(),
  _seedEnabled: false,
  _seedValue: 0n,

  configure(enabled: boolean, seed: bigint): void {
    this._seedEnabled = enabled;
    this._seedValue = seed;
    if (enabled) {
      this._random.setSeed(seed);
    }
  },

  isSeedEnabled(): boolean {
    return this._seedEnabled;
  },

  getSeed(): bigint {
    return this._seedValue;
  },

  /**
   * Re-applies the fixed seed when seeding is enabled; otherwise reseeds from
   * fresh entropy so each deal is independent (rather than resuming from the
   * deterministic position left behind by a previous fixed-seed game).
   */
  reseedForNewDeal(): void {
    if (this._seedEnabled) {
      this._random.setSeed(this._seedValue);
    } else {
      this._random.setSeed(
        new JavaRandom().nextLong() ^ BigInt(Math.floor(performance.now() * 1e6)),
      );
    }
  },

  /**
   * Converts a user-entered seed (number or arbitrary text) into the numeric
   * seed. Pure numbers are used directly; any other text is hashed
   * deterministically (same hash as the Android app).
   */
  seedFromText(text: string | null): bigint {
    if (text === null) return 0n;
    const trimmed = text.trim();
    if (trimmed.length === 0) return 0n;
    if (/^-?\d+$/.test(trimmed)) {
      return BigInt.asIntN(64, BigInt(trimmed));
    }
    let hash = 1125899906842597n; // prime
    for (let i = 0; i < trimmed.length; i++) {
      hash = BigInt.asIntN(64, 31n * hash + BigInt(trimmed.charCodeAt(i)));
    }
    return hash;
  },

  nextDouble(): number {
    return this._random.nextDouble();
  },

  nextInt(bound: number): number {
    if (bound <= 0) return 0;
    return this._random.nextInt(bound);
  },
};
