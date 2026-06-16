# AI_CONTEXT.md — Project Notes for AI Assistants

> This file is the single source of truth for any AI working on this project.
> Read it fully before making any changes.

---

## Project Overview

**Louisiana Tekken 8 Rank Tracker** — a static site that tracks online ranked standings
for Louisiana FGC players. Two data sources: EWGF (online ranks) and Braacket (local tournament ranks).

- **Live site:** GitHub Pages (auto-deploys on push to `main`)
- **Repo:** https://github.com/Esmond-M/la-tekken-rank-tracker
- **Stack:** Vite + React (front-end), GitHub Actions (back-end automation), GitHub Pages (hosting)

---

## ⚠️ Rules — Read Before Doing Anything

1. **Never push to the remote without the user's explicit approval.** Commit locally, then stop and ask.
2. **Never trigger live API calls locally** without the user confirming. The EWGF API has a 100 calls/day limit.
3. **Never guess `main_character`** — always verify against `data/api-cache.json` first (see Rank Logic section).
4. **Never leave `main_character` as `null`** — causes the wrong character to display (see Rank Logic section).
5. **Commit files individually** with descriptive messages unless the user says otherwise.
6. **Always run `--from-cache` after changing `players.json` or rank logic** to regenerate `public/data/ranks.json` before committing.

---

## Architecture

```
data/players.json          ← hand-edited roster (source of truth for who we track)
data/api-cache.json        ← raw battle data from EWGF API, committed after each run
public/data/ranks.json     ← processed output served to the front-end
public/data/braacket-rankings.json  ← scraped Braacket tournament rankings
src/App.jsx                ← main UI (EWGF tab)
src/BraacketPage.jsx       ← tournament rankings tab
src/PlayerCard.jsx         ← modal shown when clicking a player name
src/index.css              ← all styles
scripts/update-ranks.js    ← EWGF data pipeline (API fetch + rank processing)
scripts/fetch-braacket.js  ← Braacket HTML scraper
.github/workflows/update-ranks.yml    ← daily cron at 8 AM UTC (3 AM Central)
.github/workflows/fetch-braacket.yml  ← weekly Monday 9 AM UTC
.github/workflows/deploy.yml          ← builds + deploys to Pages on push to main
```

**The "backend" is GitHub Actions.** The API key (`EWGF_API_KEY`) lives in GitHub Secrets and
never touches the public site. The Actions runner fetches data, commits `ranks.json` and
`api-cache.json` back to `main`, and the deploy workflow ignores those commits (`paths-ignore`)
so they don't waste build minutes.

---

## Data Pipeline (`scripts/update-ranks.js`)

### Modes
| Command | What it does | API calls |
|---|---|---|
| `node scripts/update-ranks.js` | Full run — fetches all ~48 players | ~48 |
| `node scripts/update-ranks.js --player <id1,id2>` | Targeted fetch — only listed IDs, merges into existing output | N |
| `node scripts/update-ranks.js --from-cache` | Reprocesses `api-cache.json` through current logic, rewrites `ranks.json` | 0 |

**Use `--from-cache` whenever possible.** Use it after any change to `players.json` or rank logic.

### Rate Limits
- 100 calls/day on free tier. ~48 players = ~2 full runs/day max.
- Resets midnight UTC (7 PM Central / 6 PM Central DST).
- Scheduled run: 8 AM UTC daily. Manual Actions runs count against the same limit.

---

## Rank Logic (important — read carefully)

### Primary character
- **Locked to `main_character` from `players.json`.** Never drifts based on recent play.
- If `main_character` appears in recent battles → use API rank for that character.
- If `main_character` is NOT in recent battles → show `peak_rank` from `players.json` with borrowed tekken_power (account-wide stat).
- If `main_character` is `null` → falls back to "highest-ranked character in recent battles." **This is unreliable** — tekken_power is account-wide so all characters tie, and the tiebreak is arbitrary insertion order. A player grinding alts will show the wrong character.

### ⚠️ Critical: setting main_character
**Always verify against the cache before setting `main_character`.** Run this to see what characters actually appear in a player's battles:
```js
node -e "
const d = require('./data/api-cache.json');
const p = d.players.find(p => p.tekken_id === 'TEKKEN_ID_HERE');
const counts = new Map();
for (const b of p.battles) {
  const isP1 = b.p1_tekken_id === p.tekken_id;
  const char = isP1 ? b.p1_char : b.p2_char;
  if (!char) continue;
  counts.set(char, (counts.get(char) || 0) + 1);
}
for (const [char, n] of [...counts.entries()].sort((a,b)=>b[1]-a[1]))
  console.log(char, n + ' battles');
"
```
If you set `main_character` to a character with 0 battles in the cache, the site will show that character frozen at `peak_rank` instead of the live rank. **Ask the user if unsure.**

### Secondary / Tertiary characters
- **Secondary** = best OTHER character within 2 tiers of primary AND at least God of Destruction (base).
- **Tertiary** = same rule, 3rd best. Only shown if player has `"show_tertiary": true` in `players.json`.
- Currently only Oishimari (tekken_id: `3Mtn7ghBHrdQ`) has `show_tertiary: true`.
- To enable for another player, add `"show_tertiary": true` to their `players.json` entry.

### Rank tier order (highest → lowest)
```
God of Destruction VIII → VII → VI → V → IV → III → II → I → God of Destruction →
Tekken God Supreme → Tekken God → Tekken King → Tekken Emperor →
Bushin → Kishin → Raijin → Fujin
```

### display_name / known_name
- The EWGF battle data includes `p1_name` / `p2_name` — the player's actual in-game display name.
- The script auto-extracts this as `display_name` and stores it as `known_name` in `ranks.json`.
- If the normalized display name and player_tag are clearly different, the UI shows: `player_tag (known_name)` — e.g. **Oishimari (Mason Reigns)**.
- A `known_name` set manually in `players.json` takes priority over the auto-detected one.
- Do NOT manually add `known_name` to `players.json` unless the user tells you the exact name. It auto-populates from the API.

---

## `data/players.json` Schema

```json
{
  "tekken_id": "string",        // EWGF player ID — required for API fetches
  "player_tag": "string",       // Online gamertag — shown in UI
  "known_name": "string|null",  // Real/local name override — auto-populated from API, set manually only if user confirms
  "platform": "Steam|Playstation|Xbox|null",
  "main_character": "string",   // REQUIRED — never null if tekken_id is set
  "peak_rank": "string",        // Fallback rank if not in recent battles
  "show_tertiary": true         // Optional — only add if user requests 3-character display
}
```

---

## Adding a New Player

1. Add entry to `data/players.json`. Set `tekken_id`, `player_tag`, `main_character`, `peak_rank`. Check the cache to verify `main_character`.
2. Run `node scripts/update-ranks.js --from-cache` to regenerate `ranks.json` (will show stale peak_rank until API fetches).
3. Commit `players.json` and `ranks.json` separately.
4. To get live data immediately: trigger `Actions → Update Ranks → Run workflow` with the new Tekken ID in the `player_ids` field. Costs 1 API call.
5. After the fetch: run `--from-cache` again, commit both `ranks.json` and `api-cache.json`.

---

## UI Structure

### EWGF Tab (`src/App.jsx`)
- Table with columns: #, Player, Rank (icon), Power, Character (icon + name), Platform, Last Seen
- Sortable: Player (alpha), Rank (tier), Power, Last Seen
- Search filters by `player_tag` AND `known_name`
- Character filter dropdown
- Click player name → opens `PlayerCard` modal with EWGF + Braacket data side by side

### Braacket Tab (`src/BraacketPage.jsx`)
- Table: Rank, Player, Character (icon + secondary/tertiary text), Points, Gap to next, EWGF link
- Character column shows primary icon + "/ Secondary / Tertiary" text for players with secondaries
- Cross-links to ewgf.gg profile if player is on the EWGF roster (fuzzy tag match)

### PlayerCard Modal (`src/PlayerCard.jsx`)
- Opens on player name click from either tab
- Shows EWGF data (rank, power, character, last seen) and Braacket data (points, rank, games) side by side
- Shows secondary + tertiary characters if applicable

### UI Decisions (do NOT re-add)
- No "Trigger manual update" button — Actions is internal
- No "X of Y players live from API" counter
- No "Daily / Auto-update" stat line
- No `manual` source badge on rows
- Font is system stack — do not add Google Fonts without user request

---

## Braacket Integration

- **Scraper:** `scripts/fetch-braacket.js` — fetches 2 pages × 100 rows from braacket.com/league/LATK8
- **Schedule:** Weekly, Mondays 9 AM UTC
- **No API key needed** — public page
- **Scraping approved** by braacket.com (June 2026)
- Output: `public/data/braacket-rankings.json`

### Known bugs (not yet fixed)
1. Braacket tab unreachable if EWGF data fails to load (`App.jsx` early-returns before tab nav renders)
2. Header "Updated" timestamp always shows EWGF time even on Braacket tab
3. JSX cosmetic: character `<td>` runs onto same line as previous `</td>` — renders fine, fails linter

### Open decisions
- Show all 200+ league players or only the ~48 curated roster?
- Which season(s) to display?
- Player tag → Braacket profile deep-link (URL is in the JSON but not rendered yet)

---

## Deployment

- Push to `main` → `deploy.yml` builds → live on GitHub Pages in ~2–4 min
- `ranks.json` and `api-cache.json` changes are excluded from deploy trigger (won't burn build minutes)
- The Actions `Commit updated ranks.json` step must `git add` BOTH `public/data/ranks.json` AND `data/api-cache.json`

## Git Workflow

- Commits should be individual per file with clear messages
- When local and remote have diverged (Actions committed data while you were working): `git fetch origin` → `git rebase origin/main`
- On rebase conflict in `ranks.json`: `git checkout --theirs public/data/ranks.json` → `node scripts/update-ranks.js --from-cache` → `git add` → `git rebase --continue`
- **Never force push.** Never amend published commits.

## Common Gotchas

- `tekken_power` is **account-wide**, not per character — all characters for a player will show the same power value
- CSS variables `--god-7` and `--god-8` exist for future high-rank players
- `normalizeTag(s)` — lowercases and strips all non-alphanumeric chars — used for fuzzy cross-matching between EWGF and Braacket player tags
- `MANUAL_ALIASES` in both `App.jsx` and `BraacketPage.jsx` — keep in sync if adding tag aliases
- The `Inter` font was removed. Do not re-add without also loading it from Google Fonts.
