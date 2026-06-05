# Louisiana Tekken 8 Rank Tracker

A community-maintained leaderboard for Louisiana Tekken 8 players. Tracks both **online ranked** performance (God of Destruction+) and **tournament** standings from the LATK8 Braacket league.

**Live site:** https://esmond-m.github.io/la-tekken-rank-tracker/

## How it works

### Online Ranks tab
1. The player roster lives in [`data/players.json`](data/players.json).
2. A scheduled GitHub Action runs `scripts/update-ranks.js` once a day. The script calls the EWGF battles endpoint for each player, scans the returned battles for the player's **highest achieved rank**, and writes the result to `public/data/ranks.json`.
3. The static React site (built with Vite) reads `ranks.json` at load time and renders the table.
4. GitHub Pages serves the built site.

### Tournament Rankings tab
Tournament standings are sourced from the [LATK8 Braacket league](https://braacket.com/league/LATK8). The data in `public/data/braacket-rankings.json` is updated manually by exporting from braacket.com after each tournament.

### Player cards
Click any player name on either tab to open a **player card** showing that player's data from both sources side-by-side — online rank + Tekken Power from EWGF, and tournament rank + points from Braacket.

## Stack

| | |
|---|---|
| Frontend | React 18 + Vite |
| EWGF data | [EWGF.gg API](https://www.ewgf.gg/api-docs) (battles endpoint) |
| Tournament data | [braacket.com/league/LATK8](https://braacket.com/league/LATK8) (manual CSV export) |
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
1. Export the current standings from [braacket.com/league/LATK8](https://braacket.com/league/LATK8) (the Export CSV button on the rankings page).
2. Update `public/data/braacket-rankings.json` with the new data.
3. Commit and push — the deploy workflow will pick it up.

## Adding or editing players

Edit [`data/players.json`](data/players.json) and open a PR (or push directly if you have access). Each entry:

```json
{
  "tekken_id": "aBcDeFgHiJkL",
  "player_tag": "PlayerTag",
  "platform": "Steam",
  "main_character": "Jin",
  "peak_rank": "God of Destruction II"
}
```

- `tekken_id` — Polaris ID from the player's Tekken profile. Use `null` if unknown (will fall back to `peak_rank`).
- `platform` — `Steam`, `Playstation`, or `Xbox`.
- `peak_rank` — Fallback rank shown when no API data is available.

## Local development

```bash
npm install
npm run dev               # Run the dev server
npm run build             # Production build
npm run lint              # ESLint
npm run format            # Prettier

# Refresh ranks.json locally (uses EWGF API — counts against rate limit)
$env:EWGF_API_KEY="your_key"   # PowerShell
npm run update-ranks

# Reprocess ranks.json from cached battle data (zero API calls)
node scripts/update-ranks.js --from-cache
```

## API rate limits

The free EWGF tier allows **100 requests/day**. The roster currently uses ~46 requests per update, leaving headroom for one manual run per day.

The daily limit **resets at midnight UTC** (7 PM Central during CDT / 6 PM Central during CST). The scheduled run fires at **8 AM UTC (3 AM Central)**.

When the rate limit is hit mid-run, remaining players keep their last known peak rank.

## Project structure

```
.github/workflows/
  update-ranks.yml        Daily cron + manual trigger; fetches ranks and deploys
  deploy.yml              Rebuilds the site on any code change
data/
  players.json            Roster (edit this to add/remove players)
  api-cache.json          Raw battle data from last API run (for offline analysis)
public/data/
  ranks.json              Generated EWGF leaderboard data (committed by workflow)
  braacket-rankings.json  Tournament standings (updated manually)
scripts/
  update-ranks.js         Node script that calls the EWGF API
  fetch-braacket.js       HTML scraper for Braacket (manual use only — see ToS note)
  fetch-braacket-player-ids.js  One-time UUID map builder for Braacket profile links
src/
  App.jsx                 Main app shell, tab routing, PlayerCard state
  BraacketPage.jsx        Tournament Rankings tab
  PlayerCard.jsx          Cross-tab player detail modal
  index.css               Styles
  main.jsx
```

## Credits

- Online rank data from [ewgf.gg](https://ewgf.gg) — not affiliated with Bandai Namco.
- Tournament data from [braacket.com](https://braacket.com) — not affiliated with braacket.
- Roster originally maintained by the Louisiana Tekken community in [this spreadsheet](https://docs.google.com/spreadsheets/d/1zvIZUJR6Ieug-PGVtxEvgjcTNLjFlbXH8T5P3c0TX8E/).
