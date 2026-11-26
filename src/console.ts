#!/usr/bin/env node
/**
 * Interactive American Mahjong table — 4 face-up seats, Charleston,
 * joker exchange, call rules, and win stats.
 */
import * as readline from "node:readline";
import { Card } from "./card";
import { loadCard2026 } from "./cardNode";
import { Game } from "./game";
import { renderHelp, renderHands, renderTable } from "./display";

const game = new Game(loadCard2026());

function show(): void {
  console.clear();
  console.log(renderTable(game));
  if (game.phase === "charleston" && game.humanEast) {
    const east = game.seat("East");
    console.log(
      "Hand indices: " +
        east.hand.tiles.map((t, i) => `${i}:${Card.tileCode(t.id)}`).join(" "),
    );
    console.log(`Charleston ${game.charlestonStep} — ch 0 1 2  (or Enter to auto-pass)`);
  } else if (game.phase === "play" && game.humanEast && game.turn === "East" && !game.pendingHumanCall) {
    const east = game.seat("East");
    console.log(
      "Hand indices: " +
        east.hand.tiles.map((t, i) => `${i}:${Card.tileCode(t.id)}`).join(" "),
    );
    console.log("Discard with: d <index>   or   d <CODE>");
  } else if (game.phase === "over") {
    console.log("Game over.  n=new watch  p=play  a 20=sim 20 games  q=quit");
  } else {
    console.log("Enter=step  a=auto  hands  stats  h=help  q=quit");
  }
}

function handle(line: string): boolean {
  const raw = line.trim();
  const lower = raw.toLowerCase();
  const parts = raw.split(/\s+/);

  if (lower === "q" || lower === "quit" || lower === "exit") return false;

  if (lower === "h" || lower === "help") {
    console.log(renderHelp());
    return true;
  }

  if (lower === "n" || lower === "new" || lower === "w" || lower === "watch") {
    game.newGame(false);
    show();
    return true;
  }

  if (lower === "p" || lower === "play") {
    game.newGame(true);
    show();
    return true;
  }

  if (lower === "stats") {
    for (const name of ["East", "South", "West", "North"] as const) {
      const s = game.stats[name];
      const rate = s.games ? ((100 * s.wins) / s.games).toFixed(1) : "0.0";
      console.log(`  ${name}: ${s.wins} wins / ${s.games} games = ${rate}%`);
    }
    console.log(`  Wall games included in game count; wins only on mahjong.`);
    return true;
  }

  if (lower === "hands") {
    console.log(renderHands(game));
    return true;
  }

  if (lower === "a" || lower === "auto") {
    game.auto();
    show();
    return true;
  }

  if (/^a\s+\d+$/i.test(raw)) {
    const n = Number(parts[1]);
    console.log(`Simulating ${n} watch games...`);
    game.simulate(n);
    show();
    console.log(`Done. ${n} games simulated.`);
    return true;
  }

  if (lower === "c" || lower === "call") {
    const err = game.humanCall();
    if (err) console.log(err);
    show();
    return true;
  }

  if (lower === "pass" || lower === "x") {
    if (game.pendingHumanCall) game.humanPassDiscard();
    show();
    return true;
  }

  if (parts[0]?.toLowerCase() === "ch") {
    const east = game.seat("East");
    if (game.phase !== "charleston") {
      console.log("Not in Charleston.");
      return true;
    }
    if (parts.length === 1) {
      game.runCharlestonRound();
    } else {
      const idxs = parts.slice(1).map((p) => Number(p));
      game.humanPass = idxs
        .filter((i) => i >= 0 && i < east.hand.tiles.length)
        .map((i) => east.hand.tiles[i]);
      // Deduplicate by object identity
      game.humanPass = [...new Set(game.humanPass)];
      if (game.humanPass.some((t) => t.isJoker())) {
        console.log("Cannot pass jokers in Charleston.");
        game.humanPass = [];
        return true;
      }
      game.runCharlestonRound();
    }
    show();
    return true;
  }

  if (parts[0]?.toLowerCase() === "d") {
    const east = game.seat("East");
    if (!game.humanEast || game.turn !== "East") {
      console.log("Not your discard.");
      return true;
    }
    if (east.allTiles().length === 13) game.humanDraw();
    if (game.phase === "over") {
      show();
      return true;
    }
    const arg = parts[1];
    if (arg === undefined) {
      console.log("Usage: d <index> | d <CODE>");
      return true;
    }
    let err: string | null;
    if (/^\d+$/.test(arg)) {
      err = game.humanDiscard(Number(arg));
    } else {
      const id = Card.parseTileCode(arg);
      if (id === null) {
        console.log("Unknown tile code.");
        return true;
      }
      const idx = east.hand.tiles.findIndex((t) => t.id === id);
      if (idx < 0) {
        console.log("You don't have that tile in hand.");
        return true;
      }
      err = game.humanDiscard(idx);
    }
    if (err) console.log(err);
    show();
    return true;
  }

  // bare enter / s = step
  if (raw === "" || lower === "s" || lower === "step") {
    if (game.phase === "over") {
      game.newGame(game.humanEast);
    } else if (game.phase === "charleston" && game.humanEast) {
      game.runCharlestonRound();
    } else {
      game.step();
    }
    show();
    return true;
  }

  console.log("Unknown command. Type h for help.");
  return true;
}

async function main(): Promise<void> {
  console.log("mahjBot — American Mahjong rules bot");
  console.log("Loaded card2026.json (" + game.masterCard.letterPatterns.length + " hands)");
  console.log(renderHelp());
  game.newGame(false);
  show();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (): void => {
    rl.question("> ", (answer) => {
      const cont = handle(answer);
      if (!cont) {
        rl.close();
        return;
      }
      prompt();
    });
  };
  prompt();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
