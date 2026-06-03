# Louisiana Tekken 8 Rank Tracker

A community-maintained leaderboard for Louisiana Tekken 8 players ranked **God of Destruction** or higher. Ranks are pulled daily from the [EWGF.gg](https://ewgf.gg) API and sorted by current Tekken Power.

**Live site:** https://esmond-m.github.io/la-tekken-rank-tracker/

## How it works

1. The player roster lives in [`data/players.json`](data/players.json).
2. A scheduled GitHub Action runs `scripts/update-ranks.js` once a day. The script calls the EWGF battles endpoint for each player, scans the returned battles for the player's **highest achieved rank**, and writes the result to `public/data/ranks.json`.
3. The static React site (built with Vite) reads `ranks.json` at load time and renders the table.
4. GitHub Pages serves the built site.

Players whose Tekken ID is unknown fall back to their CSV peak rank and are flagged with a `manual` badge.

## Stack

| | |
|---|---|
| Frontend | React 18 + Vite |
| Data source | [EWGF.gg API](https://www.ewgf.gg/api-docs) (battles endpoint) |
| Hosting | GitHub Pages |
| Automation | GitHub Actions (daily cron + `workflow_dispatch`) |
| Secrets | GitHub Actions Secrets (`EWGF_API_KEY`) |

## Updating the leaderboard

### Automatic
Runs daily at 08:00 UTC (~3:00 AM Central).

### Manual
1. Go to **Actions → Update Ranks → Run workflow** ([direct link](https://github.com/Esmond-M/la-tekken-rank-tracker/actions/workflows/update-ranks.yml)).
2. Click **Run workflow** on the `main` branch.
3. The workflow fetches new data, commits `ranks.json`, and redeploys the site.

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

# Refresh ranks.json locally
$env:EWGF_API_KEY="your_key"   # PowerShell
npm run update-ranks
```

## API rate limits

The free EWGF tier allows **100 requests/day**. The roster currently uses ~45 requests per update, leaving headroom for one manual run per day. If the roster grows past 100 players or needs multiple daily updates, the [$10/mo Pro tier](https://ewgf.gg/support) raises the cap to 1,000 requests/day.

The daily limit **resets at midnight UTC** (7 PM Central during CDT / 6 PM Central during CST). The scheduled run fires at **8 AM UTC (3 AM Central)** — 8 hours after the reset, so there's always a full quota available.

When the rate limit is hit mid-run, remaining players keep their last known peak rank.

## Project structure

```
.github/workflows/
  update-ranks.yml    Daily cron + manual trigger; fetches ranks and deploys
  deploy.yml          Rebuilds the site on any code change
data/
  players.json        Roster (edit this to add/remove players)
  api-cache.json      Raw battle data from last API run (for offline analysis)
public/data/
  ranks.json          Generated leaderboard data (committed by the workflow)
scripts/
  update-ranks.js     Node script that calls the EWGF API
src/
  App.jsx             Leaderboard UI
  index.css           Styles
  main.jsx
```

## Credits

- Rank data from [ewgf.gg](https://ewgf.gg) — not affiliated with Bandai Namco.
- Roster originally maintained by the Louisiana Tekken community in [this spreadsheet](https://docs.google.com/spreadsheets/d/1zvIZUJR6Ieug-PGVtxEvgjcTNLjFlbXH8T5P3c0TX8E/).
