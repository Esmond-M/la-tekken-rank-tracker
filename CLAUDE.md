# CLAUDE.md — Project Notes for AI Assistants

## ⚠️ API Calls — Be Careful
- The EWGF API (`api.ewgf.gg`) requires `EWGF_API_KEY` (stored as a GitHub Actions secret).
- **Do NOT trigger or simulate API calls locally** without confirming with the user first.
- **Rate limit: 100 calls per day** on the free tier. The roster is ~48 players = 48 calls per run. That means roughly **2 runs per day max**.
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
- **⚠️ Never leave `main_character` as `null`.** Without it, the script falls back to "highest-ranked character in recent battles" — which is unreliable because: (1) tekken_power is account-wide so all characters tie on power, (2) the tie-break is arbitrary insertion order, (3) the player may not have played their main recently. Always fill in `main_character` and `peak_rank` when adding a new player, even if you have to ask the user.
- **⚠️ Always verify `main_character` against the API cache before setting it.** Run `node -e "..."` against `data/api-cache.json` to see which characters actually appear in that player's battles. Never guess — if you set a character that has NO battles in the cache, the script falls back to showing that character at the stale `peak_rank`, which is wrong. When in doubt, check the cache or ask the user.
- **Secondary character** = best-ranked OTHER character within 2 tiers of primary AND at least God of Destruction base. Excluded if same as primary.
- `last_seen` = most recent `battle_at` across all returned battles (true "last played"). `last_updated` = timestamp of the best-rank battle for the displayed character.
- Falls back to peak_rank from `players.json` if API didn't return battles or player has no Tekken ID.

## Adding a New Player (step-by-step)
1. Add the entry to `data/players.json`. At minimum set `tekken_id` and `player_tag`. Fill `main_character` and `peak_rank` if known; set `null` if not.
2. Commit and push `players.json`.
3. Trigger a targeted API fetch via **Actions → Update Ranks → Run workflow**, paste the new Tekken ID(s) into the `player_ids` field. This costs N calls instead of 48.
4. **Important:** If you set or corrected `player_tag` / `main_character` in `players.json` AFTER the API run already committed, the name won't appear in `ranks.json` until you run `node scripts/update-ranks.js --from-cache` locally and commit `public/data/ranks.json`. (Zero API calls.)
5. If `main_character` is `null`, the rank logic falls back to showing whatever character had the highest rank in recent battles. That's fine short-term, but the primary slot won't be locked until `main_character` is set.

## Reprocessing Without API Calls (`--from-cache`)
- `node scripts/update-ranks.js --from-cache` reprocesses `data/api-cache.json` through the current rank logic and rewrites `public/data/ranks.json`. **Zero API calls used.**
- Use this when changing rank-picking logic and you want to test the result without waiting for the next daily run (and without burning the 100/day quota).
- Only works if `data/api-cache.json` exists locally (it does — committed to repo each run).

## Fetching Only Specific Players (`--player`)
- `node scripts/update-ranks.js --player <id1,id2>` fetches the API for **only the listed Tekken IDs** and merges results into the existing `ranks.json` and `api-cache.json`. All other players are left untouched.
- Use this when adding new players to the roster and you want to see them on the live site without burning a full 46-call run.
- Example: `node scripts/update-ranks.js --player 2T7Ay7t77iha,2bhAGQRT2tBQ`
- Also available as a manual GitHub Actions trigger — go to Actions → Update Ranks → Run workflow, and paste the IDs in the **"player_ids"** input field.
- Costs **N calls** (one per ID) instead of 46. Safe to use mid-day.

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

---

## Braacket Integration — Status & Open Items

See `BRAACKET.md` for the full integration writeup. Summary of current state:

### What exists
- `scripts/fetch-braacket.js` — HTML scraper for the LATK8 rankings page. Fetches **2 pages × 100 rows = up to 200 players**. Increase `PAGES_TO_FETCH` if the league grows beyond that.
- `.github/workflows/fetch-braacket.yml` — runs the scraper **weekly on Mondays at 9 AM UTC**. Commits result to `public/data/braacket-rankings.json`. No secrets required (public page).
- `public/data/braacket-rankings.json` — scraped output, committed each weekly run.
- `public/data/braacket_league-ranking_*.csv` — legacy reference CSV export (page 1 only, kept for reference).
- `src/BraacketPage.jsx` + Tournament Rankings tab in `App.jsx`.

### ✅ Scraping approval
Scraping permission was obtained from braacket.com in **June 2026**. The weekly cron is intentionally light (2 requests/week). No further ToS concerns.

### Known bugs (not yet fixed)
1. **Braacket tab unreachable on EWGF failure.** `App.jsx` early-returns on EWGF `loading`/`error` before tab nav renders. Move tab nav above the early-return guards, OR render `BraacketPage` directly when `view === 'braacket'` before EWGF state checks.
2. **Header "Updated" timestamp is misleading on Braacket tab.** Always shows EWGF `data.updated_at`. Should swap to the active tab's timestamp.
3. **JSX cosmetic glitch in `BraacketPage.jsx`** — character `<td>` is on same line as previous `</td>`. Renders fine, fails prettier.

### Open decisions
- All 200+ league players, or only the curated ~46 roster from `players.json`?
- Replace EWGF view, or keep both tabs side-by-side?
- Which season — current S3 only, or include All-Time / S2?

### Not yet built
- Player tag → braacket profile linking. The `braacket_url` field is now populated in the scraped JSON (from the `<a href>` on each row), but `BraacketPage.jsx` doesn't yet render it as a link.
- Cross-reference braacket player tags with `players.json` `tekken_id` to deep-link to ewgf.gg profiles from the Braacket tab.

