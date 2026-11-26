/**
 * Headless simulation: run N bot-vs-bot games and print seat win rates.
 * Usage: npm run sim -- 200
 */
import { loadCard2026 } from "./cardNode";
import { Game } from "./game";

const n = Math.max(1, Number(process.argv[2] ?? 50));
const game = new Game(loadCard2026());
console.log(`Simulating ${n} games with ${game.masterCard.letterPatterns.length} card hands...`);
const t0 = Date.now();
game.simulate(n);
const ms = Date.now() - t0;

console.log(`\nDone in ${ms}ms (${(ms / n).toFixed(1)} ms/game)\n`);
console.log("Seat      Wins   Games   Rate");
console.log("--------------------------------");
for (const name of ["East", "South", "West", "North"] as const) {
  const s = game.stats[name];
  const rate = s.games ? ((100 * s.wins) / s.games).toFixed(1) : "0.0";
  console.log(
    `${name.padEnd(9)}${String(s.wins).padStart(4)}   ${String(s.games).padStart(5)}   ${rate.padStart(5)}%`,
  );
}
const walls = n - ["East", "South", "West", "North"].reduce((a, name) => a + game.stats[name as "East"].wins, 0);
console.log(`\nWall games: ${walls} (${((100 * walls) / n).toFixed(1)}%)`);
