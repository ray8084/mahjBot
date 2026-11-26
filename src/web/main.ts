import "./styles.css";
import { Bot } from "../bot";
import { Card } from "../card";
import { Game } from "../game";
import { HandProbs } from "../probs";
import type { SeatName } from "../seat";
import { Tile } from "../tile";

let game: Game;
let probs: HandProbs;
const selected = new Set<number>(); // hand indices for East

interface GameResultRow {
  gameNumber: number;
  wall: boolean;
  winner: SeatName | null;
  hand: string;
}

const resultFeed: GameResultRow[] = [];
const FEED_MAX = 200;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function tileImg(tile: Tile, opts: { sm?: boolean; selectable?: boolean; selected?: boolean } = {}): HTMLImageElement {
  const img = document.createElement("img");
  img.className = "tile";
  if (opts.sm) img.classList.add("sm");
  if (opts.selectable) img.classList.add("selectable");
  if (opts.selected) img.classList.add("selected");
  if (tile.isJoker()) img.classList.add("joker-standin");
  img.src = tile.getImage();
  img.alt = tile.getDisplayName();
  img.title = tile.isJoker() && tile.jokerId
    ? `Joker as ${Card.tileCode(tile.jokerId)}`
    : tile.getDisplayName();
  img.draggable = false;
  return img;
}

function clear(el: HTMLElement): void {
  el.replaceChildren();
}

function renderSeat(name: SeatName): void {
  const section = document.querySelector(`.seat[data-seat="${name}"]`) as HTMLElement;
  const seat = game.seat(name);
  const st = game.stats[name];
  const rate = st.games ? ((100 * st.wins) / st.games).toFixed(0) : "0";

  const isWinner = game.phase === "over" && game.winner === name;
  section.classList.toggle("active", game.phase === "play" && game.turn === name);
  section.classList.toggle("winner", isWinner);
  section.classList.toggle("not-winner", game.phase === "over" && !isWinner && !game.wallGame);

  const youTag = section.querySelector(".you-tag") as HTMLElement | null;
  if (youTag) youTag.hidden = !(seat.isHuman);

  const winnerTag = section.querySelector(".winner-tag") as HTMLElement | null;
  if (winnerTag) winnerTag.hidden = !isWinner;

  (section.querySelector(".seat-stats") as HTMLElement).textContent =
    `W ${st.wins}/${st.games} (${rate}%)`;

  const handsEl = section.querySelector(".seat-hands") as HTMLElement;
  clear(handsEl);
  const top = Bot.topHandMatches(seat, 10, (id) => probs.pct(id));
  let bestProbIdx = -1;
  let bestProb = -1;
  top.forEach((m, i) => {
    const p = probs.pct(m.index);
    if (p !== null && p > bestProb) {
      bestProb = p;
      bestProbIdx = i;
    }
  });
  top.forEach((m, i) => {
    const li = document.createElement("li");
    const pct = probs.formatPct(m.index);
    const label = m.concealed ? `${m.pattern} (C)` : m.pattern;
    if (i === bestProbIdx) li.classList.add("best-prob");
    const isWinningHand =
      game.phase === "over" &&
      game.winner === name &&
      game.winningPatternIndex === m.index;
    if (isWinningHand) li.classList.add("winning-hand");
    li.innerHTML =
      `<span class="match">${m.filled}/14</span>` +
      `<span class="prob" title="1M-deal completion rate">${pct}</span>` +
      `<span class="pat" title="${m.note || label}">${m.coloredHtml}</span>` +
      (isWinningHand ? `<span class="win-mark">★</span>` : "");
    handsEl.appendChild(li);
  });

  const exposed = section.querySelector(".rack.exposed") as HTMLElement;
  const hand = section.querySelector(".rack.hand") as HTMLElement;
  clear(exposed);
  clear(hand);

  const useSm = name !== "East";
  for (const t of seat.rack.tiles) {
    exposed.appendChild(tileImg(t, { sm: useSm }));
  }

  const interactive =
    seat.isHuman &&
    name === "East" &&
    ((game.phase === "charleston") ||
      (game.phase === "play" && game.turn === "East" && !game.pendingHumanCall && seat.allTiles().length === 14));

  seat.hand.tiles.forEach((t, i) => {
    const img = tileImg(t, {
      sm: useSm,
      selectable: interactive,
      selected: interactive && selected.has(i),
    });
    if (interactive) {
      img.addEventListener("click", () => onTileClick(i));
    }
    hand.appendChild(img);
  });
}

function onTileClick(index: number): void {
  if (game.phase === "charleston" && game.humanEast) {
    if (selected.has(index)) selected.delete(index);
    else {
      if (selected.size >= 3) return;
      const tile = game.seat("East").hand.tiles[index];
      if (tile.isJoker()) return; // cannot pass jokers
      selected.add(index);
    }
    render();
    return;
  }

  if (game.phase === "play" && game.humanEast && game.turn === "East") {
    // Single-select discard
    selected.clear();
    selected.add(index);
    render();
  }
}

function renderStats(): void {
  const el = $("stats");
  clear(el);
  for (const name of ["East", "South", "West", "North"] as SeatName[]) {
    const s = game.stats[name];
    const rate = s.games ? ((100 * s.wins) / s.games).toFixed(0) : "0";
    const span = document.createElement("span");
    span.className = "seat-stat";
    span.innerHTML = `<strong>${name}</strong> ${s.wins}/${s.games} <em>${rate}%</em>`;
    el.appendChild(span);
  }
  const wall = document.createElement("span");
  wall.className = "seat-stat wall-stat";
  const wallRate = game.gamesPlayed ? game.wallRate().toFixed(0) : "0";
  wall.innerHTML = `<strong>Wall</strong> ${game.wallGames}/${game.gamesPlayed} <em>${wallRate}%</em>`;
  el.appendChild(wall);
  renderChart();
  renderFeed();
}

function appendBarRow(
  parent: HTMLElement,
  label: string,
  count: number,
  total: number,
  opts: { wall?: boolean; rounds?: boolean; hidePct?: boolean } = {},
): void {
  const pct = total > 0 ? (100 * count) / total : 0;
  const row = document.createElement("div");
  row.className = `chart-row${opts.wall ? " wall" : ""}${opts.rounds ? " rounds" : ""}`;

  const lab = document.createElement("span");
  lab.className = "label";
  lab.textContent = label;

  const track = document.createElement("span");
  track.className = "track";
  const fill = document.createElement("span");
  fill.className = "fill";
  fill.style.width = `${Math.max(pct > 0 ? 2 : 0, pct).toFixed(1)}%`;
  track.appendChild(fill);

  const value = document.createElement("span");
  value.className = "value";
  value.textContent = opts.hidePct ? String(count) : `${count} · ${pct.toFixed(0)}%`;

  row.append(lab, track, value);
  parent.appendChild(row);
}

function renderChart(): void {
  const el = $("chart");
  clear(el);
  const total = Math.max(1, game.gamesPlayed);
  appendBarRow(el, "East", game.stats.East.wins, total);
  appendBarRow(el, "South", game.stats.South.wins, total);
  appendBarRow(el, "West", game.stats.West.wins, total);
  appendBarRow(el, "North", game.stats.North.wins, total);
  appendBarRow(el, "Wall", game.wallGames, total, { wall: true });
  renderRoundsChart();
}

function renderRoundsChart(): void {
  const el = $("chart-rounds");
  clear(el);
  // Scale bars to the largest bucket so the biggest fills the track.
  let maxCount = 1;
  for (let decade = 0; decade <= 9; decade++) {
    maxCount = Math.max(maxCount, game.tilesLeftBuckets[decade] ?? 0);
  }
  // High tiles left on top, lowest (0–9) on bottom; always show all decades.
  for (let decade = 9; decade >= 0; decade--) {
    const lo = decade * 10;
    const hi = lo + 9;
    const count = game.tilesLeftBuckets[decade] ?? 0;
    appendBarRow(el, `${lo}-${hi}`, count, maxCount, { rounds: true, hidePct: true });
  }
}

function renderFeed(): void {
  const el = $("results-feed");
  clear(el);
  if (resultFeed.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Run or Auto a game to see results.";
    el.appendChild(empty);
    return;
  }
  for (const row of resultFeed) {
    const item = document.createElement("div");
    item.className = `result-item ${row.wall ? "wall" : "win"}`;
    const who = row.wall ? "Wall" : (row.winner ?? "?");
    item.innerHTML =
      `<div class="who">#${row.gameNumber} · ${who}</div>` +
      (row.wall ? "" : `<div class="hand" title="${row.hand}">${row.hand || "Mahjong"}</div>`);
    el.appendChild(item);
  }
}

function recordResult(row: GameResultRow): void {
  resultFeed.unshift(row);
  if (resultFeed.length > FEED_MAX) resultFeed.length = FEED_MAX;
}

function captureCurrentResult(): void {
  if (game.phase !== "over") return;
  // Avoid duplicate if already recorded for this gameNumber
  if (resultFeed[0]?.gameNumber === game.gamesPlayed) return;
  recordResult({
    gameNumber: game.gamesPlayed,
    wall: game.wallGame,
    winner: game.winner,
    hand: game.winningHand,
  });
}

function renderCenter(): void {
  const status = $("status");
  const wall = $("wall");
  const discard = $("discard");
  const actions = $("actions");
  const log = $("log");

  clear(discard);
  clear(actions);
  clear(log);

  if (game.phase === "over") {
    if (game.wallGame) {
      status.innerHTML = `<span class="winner-banner">Wall game</span>`;
    } else {
      status.innerHTML = `<span class="winner-banner">Mahjong — ${game.winner}</span><div style="font-size:0.85rem;opacity:0.85;margin-top:0.25rem">${game.winningHand}</div>`;
    }
  } else if (game.phase === "charleston") {
    status.textContent = `Charleston · ${game.charlestonStep}`;
  } else if (game.pendingHumanCall) {
    status.textContent = `Call ${game.pendingHumanCall.getDisplayName()}?`;
  } else {
    status.textContent = `Turn · ${game.turn}`;
  }

  wall.textContent = `Wall · ${game.wall.tiles.length} tiles`;

  if (game.lastDiscard && (game.pendingHumanCall || game.phase === "play")) {
    discard.appendChild(tileImg(game.lastDiscard));
  } else if (game.pendingHumanCall) {
    discard.appendChild(tileImg(game.pendingHumanCall));
  }

  // Action buttons
  if (game.phase === "charleston" && game.humanEast) {
    const pass = document.createElement("button");
    pass.className = "btn btn-primary";
    pass.textContent = selected.size ? `Pass ${selected.size}` : "Auto-pass 3";
    pass.addEventListener("click", () => {
      const east = game.seat("East");
      if (selected.size > 0) {
        game.humanPass = [...selected]
          .sort((a, b) => a - b)
          .map((i) => east.hand.tiles[i])
          .filter((t) => t && !t.isJoker());
      }
      selected.clear();
      game.runCharlestonRound();
      render();
    });
    actions.appendChild(pass);
  }

  if (game.pendingHumanCall) {
    const callBtn = document.createElement("button");
    callBtn.className = "btn btn-primary";
    callBtn.textContent = "Call";
    callBtn.addEventListener("click", () => {
      const err = game.humanCall();
      if (err) status.textContent = err;
      selected.clear();
      render();
    });
    const passBtn = document.createElement("button");
    passBtn.className = "btn";
    passBtn.textContent = "Pass";
    passBtn.addEventListener("click", () => {
      game.humanPassDiscard();
      selected.clear();
      render();
    });
    actions.appendChild(callBtn);
    actions.appendChild(passBtn);
  }

  if (
    game.phase === "play" &&
    game.humanEast &&
    game.turn === "East" &&
    !game.pendingHumanCall
  ) {
    const east = game.seat("East");
    if (east.allTiles().length === 13) {
      game.humanDraw();
    }
    if (game.phase !== "play") {
      // Draw may have ended the game
      for (const line of game.events.slice(-4).reverse()) {
        const div = document.createElement("div");
        div.textContent = line;
        log.appendChild(div);
      }
      return;
    }
    if (east.allTiles().length === 14) {
      const disc = document.createElement("button");
      disc.className = "btn btn-primary";
      disc.textContent = selected.size === 1 ? "Discard" : "Select a tile, then Discard";
      disc.disabled = selected.size !== 1;
      disc.addEventListener("click", () => {
        if (selected.size !== 1) return;
        const idx = [...selected][0];
        selected.clear();
        const err = game.humanDiscard(idx);
        if (err) status.textContent = err;
        render();
      });
      actions.appendChild(disc);

      // Show if winning
      if (east.isWinning()) {
        const winBtn = document.createElement("button");
        winBtn.className = "btn btn-primary";
        winBtn.textContent = "Mahjong!";
        winBtn.addEventListener("click", () => {
          game.declareWin(east);
          selected.clear();
          render();
        });
        actions.appendChild(winBtn);
      }
    }
  }

  for (const line of game.events.slice(-4).reverse()) {
    const div = document.createElement("div");
    div.textContent = line;
    log.appendChild(div);
  }
}

function render(): void {
  if (game.phase === "over") captureCurrentResult();
  renderStats();
  for (const name of ["East", "South", "West", "North"] as SeatName[]) {
    renderSeat(name);
  }
  renderCenter();
}

function newGame(): void {
  selected.clear();
  game.newGame(game.humanEast);
  render();
}

function newWatch(): void {
  selected.clear();
  game.newGame(false);
  render();
}

function newPlay(): void {
  selected.clear();
  game.newGame(true);
  render();
}

function step(): void {
  if (game.phase === "over") {
    newGame();
    return;
  }
  if (game.pendingHumanCall) return;
  if (game.humanEast && game.turn === "East" && game.phase === "play") return;
  game.step();
  // After charleston ends in watch mode, kick play
  if (game.phase === "play" && !game.humanEast && game.lastDiscarder === null) {
    game.startPlayIfNeeded();
  }
  render();
}

function auto(): void {
  if (game.phase === "over") {
    game.newGame(game.humanEast);
  }
  game.auto();
  // Watch mode: auto() starts play via startPlayIfNeeded which runs to completion
  if (game.phase === "play" && !game.humanEast && game.lastDiscarder === null) {
    game.startPlayIfNeeded();
  }
  selected.clear();
  render();
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

async function runMany(n: number): Promise<void> {
  const runBtn = $("btn-run") as HTMLButtonElement;
  runBtn.disabled = true;
  $("status").textContent = `Running 0 / ${n}…`;

  for (let i = 0; i < n; i++) {
    const result = game.playOneWatchGame();
    recordResult({
      gameNumber: result.gameNumber,
      wall: result.wall,
      winner: result.winner,
      hand: result.hand,
    });
    renderStats();
    $("status").textContent = `Running ${i + 1} / ${n}…`;
    // Keep UI responsive; refresh table tiles every 10 games
    if (i === n - 1 || i % 10 === 9) {
      for (const name of ["East", "South", "West", "North"] as SeatName[]) {
        renderSeat(name);
      }
      await yieldToUi();
    } else if (i % 3 === 2) {
      await yieldToUi();
    }
  }

  game.newGame(false);
  selected.clear();
  runBtn.disabled = false;
  render();
  $("status").textContent = `Done · ${n} games`;
}

async function boot(): Promise<void> {
  const [card, handProbs] = await Promise.all([
    Card.load2026Fetch(),
    HandProbs.load(),
  ]);
  probs = handProbs;
  game = new Game(card);
  game.newGame(false);

  $("btn-new").addEventListener("click", newGame);
  $("btn-watch").addEventListener("click", newWatch);
  $("btn-play").addEventListener("click", newPlay);
  $("btn-step").addEventListener("click", step);
  $("btn-auto").addEventListener("click", auto);

  $("btn-run").addEventListener("click", () => {
    const input = document.getElementById("run-count") as HTMLInputElement;
    const n = Math.max(1, Math.min(10_000, Math.floor(Number(input.value) || 1)));
    input.value = String(n);
    void runMany(n);
  });

  $("btn-clear").addEventListener("click", () => {
    game.clearStats();
    resultFeed.length = 0;
    render();
  });

  render();
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f88;padding:2rem">Failed to start: ${err}</pre>`;
});
