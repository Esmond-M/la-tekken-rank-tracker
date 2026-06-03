# CLAUDE.md — Project Notes for AI Assistants

## ⚠️ API Calls — Be Careful
- The EWGF API (`api.ewgf.gg`) requires `EWGF_API_KEY` (stored as a GitHub Actions secret).
- **Do NOT trigger or simulate API calls locally** without confirming with the user first.
- **Rate limit: 100 calls per day** on the free tier. The roster is ~46 players = 46 calls per run. That means roughly **2 runs per day max**.
- **Rate limit resets at midnight UTC** (7 PM Central / 6 PM Central during DST). So if you burn the limit, it's available again the next UTC day.
- The scheduled run fires daily at 8 AM UTC (3 AM Central). Manual runs via the Actions tab count against the same daily limit.
- The update script is `scripts/update-ranks.js` and runs via GitHub Actions only (`update-ranks.yml`). Never run it locally unless the user explicitly asks.

## Architecture (there IS a backend — it's GitHub Actions)
- **Front-end:** Vite + React static site, served by **GitHub Pages**.
- **Backend:** **GitHub Actions** runner (Linux VM) that wakes on a cron schedule, executes `update-ranks.js`, and commits results back to the repo.
- The API key never touches the public site — it lives in GitHub Secrets and only the Actions runner can see it.

## Deployment
- Push to `main` → `deploy.yml` runs `npm run build` → deploys `dist/` to Pages. Live in ~2–4 min.
- Changes to `public/data/ranks.json` and `data/api-cache.json` are excluded from the deploy trigger (`paths-ignore`) so data refreshes don't burn build minutes.

## Data Flow
- `data/players.json` — source roster (player tag, Tekken ID, platform, main character, peak rank). Hand-edited; non-coder edits via GitHub web UI.
- `data/api-cache.json` — raw battle data from the API, committed for offline re-processing / AI analysis. Generated each run.
- `public/data/ranks.json` — processed output served to the front-end. Generated each run.
- `src/App.jsx` fetches `ranks.json` at runtime.

## Rank Logic
- For each player, `fetchPlayerRank` calls the API **once** and scans the entire returned page of battles, tracking the best rank per character.
- **Primary slot is LOCKED to `main_character` from `players.json`.** The displayed character never drifts based on who they've been grinding lately. Rank shown for the primary = max(`peak_rank` from players.json, API-found rank on that character).
  - If `main_character` doesn't appear in recent battles, fall back to a minimal entry from players.json (peak_rank, null power/timestamp).
  - If `main_character` is missing in players.json (shouldn't happen), fall back to the old "highest-ranked character" pick.
- **Secondary character** = best-ranked OTHER character within 2 tiers of primary AND at least God of Destruction base. Excluded if same as primary.
- `last_seen` = most recent `battle_at` across all returned battles (true "last played"). `last_updated` = timestamp of the best-rank battle for the displayed character.
- Falls back to peak_rank from `players.json` if API didn't return battles or player has no Tekken ID.

## Reprocessing Without API Calls (`--from-cache`)
- `node scripts/update-ranks.js --from-cache` reprocesses `data/api-cache.json` through the current rank logic and rewrites `public/data/ranks.json`. **Zero API calls used.**
- Use this when changing rank-picking logic and you want to test the result without waiting for the next daily run (and without burning the 100/day quota).
- Only works if `data/api-cache.json` exists locally (it does — committed to repo each run).

## Rank Tier Order (highest → lowest)
God of Destruction VIII → VII → VI → V → IV → III → II → I → God of Destruction (base) → Tekken God Supreme → Tekken God → Tekken King → Tekken Emperor → Bushin → Kishin → Raijin → Fujin

Sorting: rank tier first, then `tekken_power` desc as tiebreaker within the same tier.

## UI Features (current)
- Sortable columns: Player (alpha), Rank (tier), Power (numeric). Click header to toggle asc/desc.
- Search box filters by player tag (case-insensitive substring).
- Character filter dropdown — lists every character in the roster.
- Player tag links out to `https://ewgf.gg/player/{tekken_id}` (verify URL format if broken).
- Last Seen column shows relative time from `last_updated`.

## UI Decisions (do NOT re-add)
- No "Trigger manual update" link — Actions is internal, not for end users.
- No "X of Y players live from API" count — not meaningful to visitors.
- No "Daily / Auto-update" stat — timestamp in header already communicates this.
- No `manual` source badge on player rows — internal detail.

## Common gotchas
- The Actions `Commit updated ranks.json` step must `git add` BOTH `public/data/ranks.json` AND `data/api-cache.json`. Easy to forget.
- `--god-7` and `--god-8` CSS variables exist in `:root` for future high-rank players.
- The `Inter` font reference was removed — uses a system font stack now. Don't add Inter back without also loading it from Google Fonts.
