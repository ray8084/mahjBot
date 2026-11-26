import { Card } from "./card";
import { Bot } from "./bot";
import type { Game } from "./game";
import type { Seat } from "./seat";
import { Tile } from "./tile";

function code(t: Tile): string {
  if (t.isJoker() && t.jokerId > 0) return `J(${Card.tileCode(t.jokerId)})`;
  return Card.tileCode(t.id);
}

function handStr(tiles: Tile[]): string {
  return tiles.map(code).join(" ");
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

export function renderTable(game: Game): string {
  const lines: string[] = [];
  const mode = game.humanEast ? "PLAY (you=East)" : "WATCH (4 bots)";
  const phase =
    game.phase === "charleston"
      ? `Charleston:${game.charlestonStep}`
      : game.phase === "play"
        ? `Turn:${game.turn}`
        : game.phase === "over"
          ? game.wallGame
            ? "WALL GAME"
            : `WINNER ${game.winner}`
          : game.phase;

  lines.push("╔══════════════════════════════════════════════════════════════════════╗");
  lines.push(
    `║  mahjBot  ${pad(mode, 18)}  ${pad(phase, 22)}  wall:${String(game.wall.tiles.length).padStart(3)}  ║`,
  );
  lines.push("╠══════════════════════════════════════════════════════════════════════╣");

  for (const seat of game.seats) {
    lines.push(renderSeat(game, seat));
  }

  lines.push("╠══════════════════════════════════════════════════════════════════════╣");
  lines.push(renderStats(game));
  if (game.lastDiscard) {
    lines.push(
      `║  Last discard: ${pad(game.lastDiscard.getDisplayName() + " (" + Card.tileCode(game.lastDiscard.id) + ") by " + game.lastDiscarder, 64)}║`,
    );
  }
  if (game.pendingHumanCall) {
    lines.push(`║  >>> Your call?  c=call  p=pass${" ".repeat(38)}║`);
  }
  if (game.phase === "over" && game.winner) {
    lines.push(`║  ${pad(game.winningHand, 68)}║`);
  }
  lines.push("╠══════════════════════════════════════════════════════════════════════╣");
  const recent = game.events.slice(-6);
  for (const e of recent) {
    lines.push(`║  ${pad(e, 68)}║`);
  }
  for (let i = recent.length; i < 3; i++) lines.push(`║${" ".repeat(70)}║`);
  lines.push("╚══════════════════════════════════════════════════════════════════════╝");
  return lines.join("\n");
}

function renderSeat(game: Game, seat: Seat): string {
  const st = game.stats[seat.name];
  const rate = st.games ? ((100 * st.wins) / st.games).toFixed(0) : "0";
  const label = `${seat.name}${seat.isHuman ? "*" : ""}`;
  const win = `W:${st.wins}/${st.games} (${rate}%)`;
  const best = seat.best();
  const exposed = seat.rack.tiles.length ? ` | exp:${handStr(seat.rack.tiles)}` : "";
  const hand = handStr(seat.hand.tiles);
  const chase = `${best.filled}/14 ${best.pattern.pattern}`;
  const line1 = `║ ${pad(label, 7)} ${pad(win, 16)} ${pad(chase, 44)}║`;
  const line2 = `║         ${pad(hand + exposed, 61)}║`;
  return `${line1}\n${line2}`;
}

function renderStats(game: Game): string {
  const parts = (["East", "South", "West", "North"] as const).map((n) => {
    const s = game.stats[n];
    const r = s.games ? ((100 * s.wins) / s.games).toFixed(0) : "0";
    return `${n} ${s.wins}/${s.games} ${r}%`;
  });
  return `║  Stats: ${pad(parts.join("  ·  "), 61)}║`;
}

export function renderHelp(): string {
  return `
Commands:
  n / new       New game (watch mode — 4 bots, tiles face up)
  p / play      New game as East (you play; bots are S/W/N)
  w / watch     New watch game
  enter / s     Step one charleston round or continue bots
  a / auto      Auto-play to end (or until your turn)
  a N           Auto-play N games in watch mode (updates stats)
  c             Call the discard
  pass / x      Pass on discard / skip call
  d N           Discard hand tile index N (0-based)  e.g. d 3
  d CODE        Discard by code  e.g. d 5B  d RD  d J
  ch N N N      Charleston: pass hand indices (or auto if omitted)
  hands         Show top card targets for each seat
  stats         Show win counts / rates
  h / help      This help
  q / quit      Quit

Tile codes: 1D-9D dots, 1B-9B bams, 1C-9C craks, 0D soap,
            GD green, RD red, N S W E winds, F flower, J joker

Rules (NMJL / eightbam.com): jokers only in pung+ (mask 1);
never in singles/pairs; no jokers in Charleston; call only for
pung/kong/quint or mahjong; concealed (C) only call for mahjong.
`.trim();
}

export function renderHands(game: Game): string {
  const lines: string[] = ["Card targets:"];
  for (const seat of game.seats) {
    lines.push(`  ${seat.name}:`);
    for (const h of Bot.topHands(seat, 4)) lines.push(`    ${h}`);
  }
  return lines.join("\n");
}
