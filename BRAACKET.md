# Braacket.com Integration Notes

## What is Braacket.com?

[Braacket.com](https://braacket.com) is a league and tournament management platform that generates
power rankings using Elo, Glicko, TrueSkill, or Points systems. The Louisiana Tekken 8 community
uses it at:

> https://braacket.com/league/LATK8/ranking/7D81E3FE-6B24-4332-B660-9E5FB9F9F421

The LATK8 league has **409 players** across **94 tournaments** and is currently on **Season 3**
(17 March 2026 – 16 March 2027) using Glicko scoring.

---

## Is There a Public API?

**No official REST/JSON API is documented on braacket.com.** There is no developer portal,
API key system, or JSON endpoints. The site has:

- A manual **Export** button on ranking pages (downloads CSV — not automated)
- No `?format=json` or similar query parameter

**The only programmatic option is HTML scraping.** The ranking page is publicly accessible
with no login wall, and the URL supports `?rows=100` to return all players in one request.

---

## How the Scraping Works

1. Fetch `https://braacket.com/league/LATK8/ranking/{RANKING_ID}?rows=100` as plain HTML
2. Parse the `<table>` rows with regex to extract: rank position, player name, Glicko points
3. Player profile URLs (`/league/LATK8/player/{id}`) are also extractable from the anchor tags
4. Write results to `public/data/braacket-rankings.json`
5. No API key needed — entirely public data

Script: `scripts/fetch-braacket.js`
Output: `public/data/braacket-rankings.json`

---

## Data Source Comparison

| | EWGF (current) | Braacket |
|---|---|---|
| **What it measures** | Online ranked ladder performance | Local tournament performance |
| **Ranking unit** | Tekken Power + Rank tier (God of Destruction, etc.) | Glicko points |
| **Updated** | Daily (GitHub Actions cron) | After each local tournament |
| **Players** | ~46 tracked roster | 409 registered players |
| **API type** | Official REST API (100 calls/day limit) | HTML scrape (no limit) |
| **Auth required** | Yes — EWGF_API_KEY secret | No |

---

## Key Decisions Needed

Before fully wiring this in, figure out the intent:

1. **Replace vs. Supplement** — Do you want to replace the EWGF view with braacket data,
   show both side by side, or add a separate tab?

2. **Whose roster?** — Braacket has 409 players (everyone who has entered a local);
   the current tracker follows a curated ~46-player roster. Show all 409, or just the
   tracked players who also appear on braacket?

3. **Automation** — Braacket doesn't need an API key, so `fetch-braacket.js` could run
   on the same daily cron schedule, or on a different schedule (e.g., weekly, or only after
   a tournament is reported).

4. **Season** — There are multiple rankings (S1/S2/S3, Overall). Which one(s) to display?
   Currently targeting S3 (active season).

---

## Current Status (Demo)

A working example tab is included in the site using pre-seeded S3 data (26 players as of 2026-06-03).
The scraper script is ready — it just needs to be wired into the GitHub Actions workflow
once the above decisions are made.

To run the scraper locally (zero API calls):
```
node scripts/fetch-braacket.js
```
