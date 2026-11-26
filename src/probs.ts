/**
 * Hand completion probabilities from 1M ghost-race simulations (Card2026).
 * complete_pct = share of finished deals where that hand reached leftover 0.
 */

export interface HandProb {
  hand_id: number;
  text: string;
  note: string;
  family: string;
  concealed: boolean;
  complete_pct: number;
  rank: number | null;
}

export class HandProbs {
  private byId = new Map<number, HandProb>();
  loaded = false;

  static async load(url = "/data/hand_probs_2026.json"): Promise<HandProbs> {
    const hp = new HandProbs();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load hand probs: ${res.status}`);
    const data = (await res.json()) as { hands: HandProb[] };
    for (const h of data.hands) {
      hp.byId.set(h.hand_id, h);
    }
    hp.loaded = true;
    return hp;
  }

  lookup(handId: number): HandProb | null {
    return this.byId.get(handId) ?? null;
  }

  pct(handId: number): number | null {
    const h = this.lookup(handId);
    return h ? h.complete_pct : null;
  }

  formatPct(handId: number): string {
    const p = this.pct(handId);
    if (p === null) return "—";
    if (p >= 10) return `${p.toFixed(1)}%`;
    if (p >= 1) return `${p.toFixed(2)}%`;
    return `${p.toFixed(2)}%`;
  }
}
