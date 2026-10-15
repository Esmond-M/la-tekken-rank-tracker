# Braacket.com Integration Notes

## What is Braacket.com?

[Braacket.com](https://braacket.com) is a league and tournament management platform that generates
power rankings using Elo, Glicko, TrueSkill, or Points systems. The Louisiana Tekken 8 community
uses it at:

> https://braacket.com/league/LATK8/ranking/7D81E3FE-6B24-4332-B660-9E5FB9F9F421

The LATK8 league has **409 players** across **94 tournaments** and is currently on **Season 3**
(17 March 2026 – 16 March 2027) using Glicko scoring.

---

## Data Updates

Braacket does not offer a publicly documented rankings API. Its Cloudflare challenge blocks
unattended requests, so rankings are updated from Braacket's manual CSV export.

1. On the LATK8 ranking page, select **Export** and download the CSV.
2. Replace `data/braacket-rankings.csv` through GitHub's web uploader.
3. The **Import Braacket Rankings** workflow validates the CSV, regenerates
   `public/data/braacket-rankings.json`, and deploys the site.

The importer requires `Rank`, `Player`, and `Points` columns. It preserves all manually maintained
fields for matching player tags, including existing `braacket_url` values. When a player is present
in `data/braacket-player-ids.json` but has no existing direct URL, the importer creates a profile
link from that saved UUID. The CSV has no profile-URL column, so players without a saved UUID keep
the normal Braacket name-search fallback.

### Data preservation rules

- The CSV is authoritative only for `rank`, `player_tag`, `points`, `country`, and `characters`.
- Other fields already stored for the same player tag are manual metadata and are preserved.
- Never guess or fabricate a profile UUID. Keep a saved `braacket_url`; otherwise, create one only
  from `data/braacket-player-ids.json`.
- If no UUID is saved, keep `braacket_url` absent and allow the UI to use its name-search fallback.
- The export is the complete tournament table. Do not remove players because they do not appear in
  the curated EWGF roster; matching to EWGF is only for cross-linking.

Script: `scripts/import-braacket-rankings.js`
Input: `data/braacket-rankings.csv`
Output: `public/data/braacket-rankings.json`

---

## Data Source Comparison

| | EWGF (current) | Braacket |
|---|---|---|
| **What it measures** | Online ranked ladder performance | Local tournament performance |
| **Ranking unit** | Tekken Power + Rank tier (God of Destruction, etc.) | Glicko points |
| **Updated** | Daily (GitHub Actions cron) | After each local tournament |
| **Players** | ~46 tracked roster | 409 registered players |
| **API type** | Official REST API (100 calls/day limit) | Manual CSV export |
| **Auth required** | Yes — EWGF_API_KEY secret | No |

---

## Key Decisions Needed

Before fully wiring this in, figure out the intent:

1. **Replace vs. Supplement** — Do you want to replace the EWGF view with braacket data,
   show both side by side, or add a separate tab?

2. **Whose roster?** — Braacket has 409 players (everyone who has entered a local);
   the current tracker follows a curated ~46-player roster. Show all 409, or just the
   tracked players who also appear on braacket?

3. **Automation** — The import runs automatically after an exported CSV is uploaded to the repository.

4. **Season** — There are multiple rankings (S1/S2/S3, Overall). Which one(s) to display?
   Currently targeting S3 (active season).

---

## Current Status (Demo)

A working example tab is included in the site using pre-seeded S3 data (26 players as of 2026-06-03).
Run the importer locally after replacing the CSV:
```
node scripts/import-braacket-rankings.js
```
