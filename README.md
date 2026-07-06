# Louisiana Tekken 8 Rank Tracker

Community leaderboard for Louisiana Tekken 8 players. Tracks **online ranked** performance (God of Destruction+) and **tournament** standings from the LATK8 Braacket league.

**Live site:** https://esmond-m.github.io/la-tekken-rank-tracker/

## How it works

### Online Ranks tab
1. The player roster lives in [`data/players.json`](data/players.json).
2. A GitHub Action runs `scripts/update-ranks.js` once a day. It hits the EWGF battles endpoint for each player, finds their highest rank, and writes everything to `public/data/ranks.json`.
3. The React site reads `ranks.json` on load and renders the table.
4. GitHub Pages serves the built site.

### Tournament Rankings tab
Tournament standings come from the [LATK8 Braacket league](https://braacket.com/league/LATK8). The data in `public/data/braacket-rankings.json` gets updated after each tournament.

### Player cards
Click any player name to open a card showing their data from both sources — online rank + Tekken Power from EWGF, and tournament rank + points from Braacket.

## Stack

| | |
|---|---|
| Frontend | React 18 + Vite |
| EWGF data | [EWGF.gg API](https://www.ewgf.gg/api-docs) (battles endpoint) |
| Tournament data | [braacket.com/league/LATK8](https://braacket.com/league/LATK8) |
| Hosting | GitHub Pages |
| Automation | GitHub Actions (daily cron + `workflow_dispatch`) |
| Secrets | GitHub Actions Secrets (`EWGF_API_KEY`) |

## URL params

| Param | Effect |
|---|---|
| _(none)_ | Opens Online Ranks tab |
| `?tab=tournament` | Opens Tournament Rankings tab directly |

## Updating the leaderboard

### Automatic (EWGF ranks)
Runs daily at 08:00 UTC (~3:00 AM Central).

### Manual (EWGF ranks)
1. Go to **Actions → Update Ranks → Run workflow** ([direct link](https://github.com/Esmond-M/la-tekken-rank-tracker/actions/workflows/update-ranks.yml)).
2. Click **Run workflow** on the `main` branch.

### Updating tournament data (Braacket)
1. Export standings from [braacket.com/league/LATK8](https://braacket.com/league/LATK8) (Export CSV on the rankings page).
2. Update `public/data/braacket-rankings.json`.
3. Commit and push.

### Enriching player platform data from wavu.wank

> **⚠️ NOT AUTOMATIC — manual only.** The `enrich-from-wavu.js` script scrapes [wank.wavu.wiki](https://wank.wavu.wiki) to fill in missing `platform` values in `data/players.json`. Run it locally when needed.

```bash
node scripts/enrich-from-wavu.js              # fill platform=null players
node scripts/enrich-from-wavu.js --all         # re-check ALL players
node scripts/enrich-from-wavu.js --dry-run     # show what would change
node scripts/enrich-from-wavu.js --player <ids> # specific players
```

After running, it updates both `data/players.json` and `public/data/ranks.json` automatically.

## Adding or editing players

Edit [`data/players.json`](data/players.json) and push (or open a PR). Each entry:

```json
{
  "tekken_id": "aBcDeFgHiJkL",
  "player_tag": "PlayerTag",
  "platform": "Steam",
  "main_character": "Jin",
  "peak_rank": "God of Destruction II"
}
```

- `tekken_id` — Polaris ID from the player's Tekken profile. Use `null` if unknown (falls back to `peak_rank`).
- `platform` — `Steam`, `Playstation`, or `Xbox`.
- `peak_rank` — Fallback rank shown when no API data is available.

After editing `players.json`, run `node scripts/update-ranks.js --from-cache` to regenerate `ranks.json` without burning API calls.

## Local development

```bash
npm install
npm run dev               # dev server
npm run build             # production build
npm run lint              # ESLint
npm run format            # Prettier

# Refresh ranks.json locally (uses EWGF API — counts against rate limit)
$env:EWGF_API_KEY="your_key"   # PowerShell
npm run update-ranks

# Reprocess ranks.json from cached battle data (zero API calls)
node scripts/update-ranks.js --from-cache
```

## API rate limits

The free EWGF tier allows **100 requests/day**. The roster uses ~51 requests per update, leaving room for one manual run per day.

The daily limit **resets at midnight UTC** (7 PM Central during CDT / 6 PM during CST). The scheduled run fires at **8 AM UTC (3 AM Central)**.

When the rate limit is hit mid-run, remaining players keep their last known peak rank.

## Project structure

```
.github/workflows/
  update-ranks.yml        Daily cron + manual trigger
  deploy.yml              Rebuilds the site on code changes
data/
  players.json            Roster (edit this to add/remove players)
  api-cache.json          Raw battle data from last API run
public/data/
  ranks.json              Generated EWGF leaderboard data
  braacket-rankings.json  Tournament standings
scripts/
  update-ranks.js              Calls the EWGF API and writes ranks.json
  enrich-from-wavu.js          Fills missing platform data from wavu.wank (manual)
  fetch-braacket.js            Scrapes Braacket standings (manual)
  fetch-braacket-player-ids.js Builds UUID map for Braacket profile links
src/
  App.jsx                 Main app, tab routing, PlayerCard state
  BraacketPage.jsx        Tournament Rankings tab
  PlayerCard.jsx          Player detail modal
  index.css               Styles
  main.jsx
```

## Credits

- Online rank data from [ewgf.gg](https://ewgf.gg) — not affiliated with Bandai Namco.
- Tournament data from [braacket.com](https://braacket.com).
- Roster originally maintained by the Louisiana Tekken community in [this spreadsheet](https://docs.google.com/spreadsheets/d/1zvIZUJR6Ieug-PGVtxEvgjcTNLjFlbXH8T5P3c0TX8E/).
