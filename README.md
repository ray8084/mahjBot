# mahjBot

Rules-based American Mahjong bot with an interactive console table.

Uses the 2026 NMJL card (`data/card2026.json` from the Eight Bam Android app) and rules from [eightbam.com/rules](https://eightbam.com/rules/).

## Features

- 4 seats (East, South, West, North) with tiles face up
- Watch 4 bots play, or play as East against 3 bots
- Full Charleston (right / across / left, second Charleston, courtesy)
- Joker exchanges from exposed melds
- Correct joker usage via each hand’s `jokerMask` (no jokers on singles/pairs or Singles & Pairs hands)
- Calls only for pung/kong/quint/sextet, or for mahjong
- Concealed `(C)` hands: call only for mahjong
- Win counts and rates per seat

## Quick start (web)

```bash
npm install
npm start
```

Opens a felt table with classic tile images at http://localhost:5173

- **Watch** — 4 bots, all tiles face up  
- **Play as East** — click tiles to Charleston / discard; Call / Pass when prompted  
- **Step** / **Auto** — advance the game  
- **Sim 20** — batch watch games to update win rates  

### Console (optional)

```bash
npm run console
```

### Console commands

| Command | Action |
|--------|--------|
| `w` / `n` | New watch game (4 bots) |
| `p` | New game as East |
| Enter / `s` | Step (one Charleston round, or advance bots) |
| `a` | Auto to end (or until your turn) |
| `a 50` | Simulate 50 watch games (stats) |
| `d 3` / `d 5B` | Discard by index or tile code |
| `c` / `pass` | Call or pass on a discard |
| `ch 0 1 2` | Charleston pass by hand indices |
| `hands` | Top card targets per seat |
| `stats` | Win rates |
| `h` | Help |
| `q` | Quit |

### Headless sim

```bash
npm run sim -- 100
```

## Tile codes

`1D`–`9D` dots · `1B`–`9B` bams · `1C`–`9C` craks · `0D` soap · `GD` / `RD` dragons · `N S W E` · `F` flower · `J` joker

## Card data

Each hand in `card2026.json` includes:

- `text` / `mask` — pattern and suit colors
- `jokerMask` — `1` = joker allowed at that position, `0` = natural only
- `tileSets` — concrete 14-tile realizations (tile ids)
- `concealed` / `points` / `family`

Tile ids match the mobile apps: 1–9 dots, 10 soap, 11–19 bams, 20 green, 21–29 craks, 30 red, 31–34 winds, 35 flower, 36 joker.
