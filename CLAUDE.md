# CLAUDE.md — Project Notes for AI Assistants

## ⚠️ API Calls — Be Careful
- The EWGF API (`api.ewgf.gg`) requires `EWGF_API_KEY` (stored as a GitHub Actions secret).
- **Do NOT trigger or simulate API calls locally** without confirming with the user first.
- **Rate limit: 100 calls per day** on the free tier. The roster is ~52 players = 52 calls per run. That means roughly **1 full run per day** with ~48 calls to spare for targeted `--player` runs.
- **Rate limit resets at midnight UTC** (7 PM Central / 6 PM Central during DST). So if you burn the limit, it's available again the next UTC day.
- The scheduled run fires daily at 8 AM UTC (3 AM Central). Manual runs via the Actions tab count against the same daily limit.
- The update script is `scripts/update-ranks.js` and runs via GitHub Actions only (`update-ranks.yml`). Never run it locally unless the user explicitly asks.

## ⚠️ EWGF API Tier Limitations (confirmed 2026-07-11)
| Feature | Free | Pro ($10/mo) |
|---|---|---|
| Rate limit | 100 req/day | 1,000 req/day |
| Battle history | Last **50**, **24h delay** | Last **100**, no delay |
| Profile Metadata endpoint | ❌ **NOT available** | ✅ |

- **`/external/profile/{tekkenId}` returns HTTP 500 on the free tier** — it is a Pro-only endpoint. Do NOT attempt to call it or suggest it as a solution unless the user has upgraded.
- **Battle data has a 24-hour delay on free tier.** Ranks fetched today reflect battles up to ~24h ago.
- **Only the `/external/battles/{tekkenId}` endpoint is usable on the free tier.**
- If the user upgrades to Pro: profile endpoint unlocks (gives current rank + most-played character), battle window doubles to 100, and delay is eliminated — all three significantly improve peak rank accuracy.

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
  - If `main_character` appears in recent battles, use that entry and never demote it below `peak_rank`.
  - If `main_character` doesn't appear in recent battles, keep it as the displayed character with the stored `peak_rank` and borrow the best available account-wide power; do not switch the primary to another currently-active character.
  - If another character is currently higher than the main character, show that character as secondary/tertiary but leave the primary character locked to `main_character`.
  - The goal is peak-rank tracking first, not current-character ranking. Do not downgrade `main_character` because an alt is temporarily higher.
  - If `main_character` is missing in players.json (shouldn't happen), fall back to the old "highest-ranked character" pick.
- **Peak rank is the authoritative rank metric for this project.** Always preserve or improve it; never allow the primary display to show a lower tier than the stored `peak_rank` for `main_character`.
- `data/players.json` is the source of truth for `main_character`, `peak_rank`, and `show_tertiary` flags. Updates to those values should be made manually in `players.json` and then reprocessed via the workflow or `--from-cache`.
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
- **Character name spelling must match exactly what the API returns.** The API uses `"Jack-8"` (hyphen), not `"Jack 8"` (space). If `main_character` in `players.json` doesn't match the API spelling, `bestPerChar.get(main_character)` returns undefined and the character can appear as both primary AND secondary. Always verify against `data/api-cache.json` before setting `main_character`.

---

## Open Items / Future Improvements

### Auto-updating `peak_rank` in `players.json`
Currently `peak_rank` is static — hand-maintained in `players.json`. The display is correct because the script already does `max(api_rank, peak_rank)`, so a player will never show *lower* than their stored peak. But `players.json` itself doesn't auto-update when a player climbs higher.

**The gap this creates:** If a player's main character stops appearing in recent battles (e.g. they switched to an alt), the fallback is the stored `peak_rank`. If that stored value is stale/too low, the displayed rank will be too low — exactly the bug we audited and fixed manually on 2026-07-05.

**Potential fix:** At the end of each `update-ranks.js` run, write back updated `peak_rank` values to `players.json` whenever `api_rank > stored_peak_rank`. This would keep `players.json` in sync automatically after every daily run. Not yet implemented — would need care around the git commit step (currently only commits `ranks.json` and `api-cache.json`).

---

## Braacket Integration — Status & Open Items

See `BRAACKET.md` for the full integration writeup. Summary of current state:

### What exists
- `data/braacket-rankings.csv` — manual CSV export from the LATK8 rankings page; replace it after each tournament.
- `scripts/import-braacket-rankings.js` — validates the CSV and generates tournament rankings without contacting Braacket.
- `.github/workflows/import-braacket.yml` — runs on CSV uploads, commits `public/data/braacket-rankings.json`, and deploys the result. No secrets required.
- `public/data/braacket-rankings.json` — generated tournament rankings served to the front-end.
- `public/data/braacket_league-ranking_*.csv` — legacy reference CSV export (page 1 only, kept for reference).
- `src/BraacketPage.jsx` + Tournament Rankings tab in `App.jsx`.

### Manual CSV updates
Braacket now presents a Cloudflare challenge to unattended requests, so the integration uses the
CSV export uploaded to `data/braacket-rankings.csv`. The importer preserves existing manual fields
for matching player tags and uses `data/braacket-player-ids.json` to fill missing direct profile links.

### Braacket data preferences (do not change without user approval)
- Do not restore HTML scraping, add Cloudflare-challenge workarounds, or make Braacket requests from
  scheduled automation. Use only the manually exported CSV.
- Treat `data/braacket-rankings.csv` as the source of current standings. It may update `rank`,
  `player_tag`, `points`, `country`, and `characters` only.
- Preserve every other field already attached to a matching player in
  `public/data/braacket-rankings.json`; these can be hand-maintained metadata.
- Never guess, replace, or delete a `braacket_url`. Preserve an existing direct URL first; otherwise
  derive one only from the explicit name-to-UUID mapping in `data/braacket-player-ids.json`.
- If a player has no saved UUID, leave `braacket_url` absent. The UI's Braacket name-search fallback
  is intentional and safer than inventing an ID.
- Keep every player present in the uploaded CSV, not only people in the curated EWGF roster. EWGF
  cross-links are resolved separately and must not filter tournament standings.
- Keep the CSV-import workflow self-contained: it validates, generates committed site data, then
  deploys. It must not call EWGF or require an API key.

### Known bugs (not yet fixed)
1. **Braacket tab unreachable on EWGF failure.** `App.jsx` early-returns on EWGF `loading`/`error` before tab nav renders. Move tab nav above the early-return guards, OR render `BraacketPage` directly when `view === 'braacket'` before EWGF state checks.
2. **Header "Updated" timestamp is misleading on Braacket tab.** Always shows EWGF `data.updated_at`. Should swap to the active tab's timestamp.
3. **JSX cosmetic glitch in `BraacketPage.jsx`** — character `<td>` is on same line as previous `</td>`. Renders fine, fails prettier.

### Open decisions
- All 200+ league players, or only the curated ~46 roster from `players.json`?
- Replace EWGF view, or keep both tabs side-by-side?
- Which season — current S3 only, or include All-Time / S2?

### Not yet built
- Player tag → Braacket profile linking is retained through existing `braacket_url` values and
  `data/braacket-player-ids.json`; the CSV itself does not contain profile URLs.
- Cross-reference braacket player tags with `players.json` `tekken_id` to deep-link to ewgf.gg profiles from the Braacket tab.
