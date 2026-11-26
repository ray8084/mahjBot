import "./styles.css";
import { Card } from "../card";
import { Game } from "../game";
import type { SeatName } from "../seat";
import { Tile } from "../tile";

let game: Game;
const selected = new Set<number>(); // hand indices for East

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
  const best = seat.best();

  section.classList.toggle("active", game.phase === "play" && game.turn === name);

  const youTag = section.querySelector(".you-tag") as HTMLElement | null;
  if (youTag) youTag.hidden = !(seat.isHuman);

  (section.querySelector(".seat-stats") as HTMLElement).textContent =
    `W ${st.wins}/${st.games} (${rate}%)`;
  (section.querySelector(".seat-chase") as HTMLElement).textContent =
    `${best.filled}/14 · ${best.pattern.pattern}`;

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
  renderStats();
  for (const name of ["East", "South", "West", "North"] as SeatName[]) {
    renderSeat(name);
  }
  renderCenter();
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
    game.newGame(game.humanEast);
    selected.clear();
    render();
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

async function boot(): Promise<void> {
  const card = await Card.load2026Fetch();
  game = new Game(card);
  game.newGame(false);

  $("btn-watch").addEventListener("click", newWatch);
  $("btn-play").addEventListener("click", newPlay);
  $("btn-step").addEventListener("click", step);
  $("btn-auto").addEventListener("click", auto);
  $("btn-sim").addEventListener("click", () => {
    $("status").textContent = "Simulating 20 games…";
    // Yield so UI updates
    requestAnimationFrame(() => {
      setTimeout(() => {
        game.simulate(20);
        game.newGame(false);
        selected.clear();
        render();
      }, 30);
    });
  });

  render();
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f88;padding:2rem">Failed to start: ${err}</pre>`;
});
