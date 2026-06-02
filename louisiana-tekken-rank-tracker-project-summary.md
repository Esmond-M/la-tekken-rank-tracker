# Louisiana Tekken Rank Tracker — Project Summary

## Purpose

Build a low-cost or free tool/web app to track Tekken 8 ranks for Louisiana/local FGC players.

Right now, ranks are being tracked manually in a Google Sheet. The goal is to automate rank updates using a Tekken-related API, while still allowing manual updates when needed.

## Current Manual Spreadsheet

Google Sheet shared in Discord:

https://docs.google.com/spreadsheets/d/1zvIZUJR6Ieug-PGVtxEvgjcTNLjFlbXH8T5P3c0TX8E/edit?usp=sharing

Sheet name mentioned:

**Louisiana Tekken Ranks**

Current manual approach:

- Only tracking **GoD and above** for now.
- Manual sorting has issues because text ranks do not sort correctly.
- Need numeric rank values for proper highest-to-lowest ordering.
- No known **GoD V** players in Louisiana at the time of the chat.

---

## Main Goal

Create a tracker that can show local players and their current Tekken 8 rank.

Minimum features:

- Store player name / Discord name
- Store Tekken ID
- Fetch current rank from API
- Store main character if available
- Sort ranks from highest to lowest
- Auto-update daily
- Manual “Update Now” button
- Keep cost free or very low
- Make it easy to share publicly

Optional future features:

- Character-specific ranks
- Rank history over time
- Rank movement indicators
- Weekly leaderboard changes
- Player search/filtering
- Player submission form
- Discord bot integration
- Public website using an existing domain

---

## Important Notes From Discord Chat

### API / Rate Limit Notes

Relevant chat excerpts:

```text
B.I.A. | Sneak47 [RVLS] — 5/24/2026 12:20 PM
They rate limit per id lookup. Do we even have close to 100 players
```

```text
B.I.A. | Zandak [FELL] — 5/24/2026 12:20 PM
i doubt it
though they have a bulk profile metadata request
so that may count as one?
```

```text
B.I.A. | Sneak47 [RVLS] — 5/24/2026 12:21 PM
I can take a look at api when i get back
```

Key takeaway:

- API may rate limit per Tekken ID lookup.
- There may be a bulk profile metadata endpoint that could reduce API calls.
- The group probably has fewer than 100 players, so daily updates may be manageable if the API allows it.

### Rank / Character Notes

Relevant chat excerpt:

```text
B.I.A. | Zandak [FELL] — 5/24/2026 12:22 PM
interestingly, the rank is tied to main character
so may need to get like the most recent player battle for each person to get non-main ranks
```

Key takeaway:

- The API may tie rank to a player’s main character.
- If the app needs non-main character ranks, it may need another endpoint, possibly recent battle data.
- Need to inspect the API before deciding final data model.

### Manual Spreadsheet Notes

Relevant chat excerpt:

```text
B.I.A | 84DaysWithout [LAIN] — 5/24/2026 3:05 PM
well theres some way to make an automated spreadsheet and i'll leave that to you all who are good at that
but i made a manual one for now
I am only doing GoD and above
In part b/c I was too lazy and impatient to find a solution
to sorting the ranks by highest to low, without "Tekken God" showing up on top
easy way to fix that but who cares really
get GoD
i have no idea what sams id is
or his username
```

Relevant chat excerpt:

```text
B.I.A. | Zandak [FELL] — 5/24/2026 3:09 PM
Might want to change the link to “anyone can view”
So you don’t get 100 emails heh
```

Relevant chat excerpt:

```text
B.I.A | 84DaysWithout [LAIN] — 5/24/2026 3:10 PM
welp
i made it with my work email
which is heavily restricted
so that cant even work
i'll have to transfer it
https://docs.google.com/spreadsheets/d/1zvIZUJR6Ieug-PGVtxEvgjcTNLjFlbXH8T5P3c0TX8E/edit?usp=sharing
Google Docs
Louisiana Tekken Ranks
ok there
there are no GoD Vs in Louisiana
that we know of
```

Key takeaway:

- Existing manual sheet may need ownership/permission cleanup.
- Public access should be “anyone can view.”
- Sorting needs rank-to-number mapping.

---

## Known People Mentioned

These are Discord/community names mentioned in the chat. Actual Tekken IDs still need to be collected.

| Name / Discord Handle | Tag / Group | Notes |
|---|---|---|
| 84DaysWithout | LAIN | Created the manual spreadsheet |
| Zandak | FELL | Mentioned bulk profile metadata and character rank concern |
| Sneak47 | RVLS | Said they could review the API |
| DJSymphix | BES | Community member, interested in improving |
| Todaro | BIA | Community member |
| Noremak42 | N/A | Community member |
| NicoFasho | N/A | Offered to help with nerd/dev stuff |
| kevvbmm | N/A | Community member |
| udg_tye | N/A | Mentioned as King player, GoD1 |
| Sam | N/A | Tekken ID/username unknown |

---

## Data Needed Per Player

Minimum fields:

```text
display_name
discord_name
tekken_id
region_or_state
rank_name
rank_numeric_value
main_character
last_updated
```

Optional fields:

```text
clan_tag
secondary_characters
character_ranks
highest_rank_achieved
recent_battle_rank
profile_url
notes
is_active
```

---

## Rank Sorting Issue

Do not sort ranks alphabetically.

The current manual sheet had a problem where **Tekken God** could appear above higher ranks because the rank names are text.

Instead, each rank should be mapped to a numeric value.

Example placeholder mapping:

```js
const rankOrder = {
  "Tekken God": 1,
  "Tekken God Supreme": 2,
  "God of Destruction": 3,
  "God of Destruction I": 4,
  "God of Destruction II": 5,
  "God of Destruction III": 6,
  "God of Destruction IV": 7,
  "God of Destruction V": 8
};
```

Important:

- Verify the exact Tekken 8 rank order from the API or an official/current rank list.
- Store both `rank_name` and `rank_numeric_value`.
- Sort by `rank_numeric_value` descending or ascending depending on how the values are defined.

---

## API Questions To Review

Need to inspect the Tekken API and answer these before building the final version:

1. Can the API look up a player by Tekken ID?
2. What is the rate limit per Tekken ID lookup?
3. Is there a bulk profile metadata endpoint?
4. Does the bulk endpoint return rank?
5. Is rank tied only to the main character?
6. Can character-specific ranks be retrieved directly?
7. If character ranks are not direct, can recent battle data reveal them?
8. Does the API require an API key or authentication?
9. Can the API be called from Google Apps Script?
10. Can the API be called from GitHub Actions?
11. Can the API be called from a Next.js/Vercel serverless function?
12. Is daily updating around 50-100 players safe under the rate limits?
13. What fields are returned for profile/rank data?
14. Does the API return timestamps or last played data?

---

## Possible Build Options

### Option 1: Google Sheets + Google Apps Script

Best for the fastest useful version.

Stack:

```text
Google Sheets
Google Apps Script
Tekken API
Daily trigger
Manual update button
```

Pros:

- Free
- Uses the existing spreadsheet workflow
- Easy for the community to view
- Easy to manually edit player list
- Daily update trigger is built into Apps Script
- Manual update button can be added inside the sheet

Cons:

- Less polished than a website
- Apps Script can be annoying with API limits and permissions
- Not ideal if the API needs secure server-side handling
- Harder to add advanced UI features

Best use case:

> Keep the Google Sheet as the database and automate the rank updates directly inside it.

---

### Option 2: GitHub Pages + JSON + GitHub Actions

Best for a free public leaderboard.

Stack:

```text
Static HTML / React
GitHub Pages
JSON file for players/ranks
GitHub Actions daily cron job
Manual workflow_dispatch update button
```

Pros:

- Free hosting
- Can use an existing domain
- GitHub Actions can run daily
- GitHub Actions has a manual “Run workflow” button
- Public website can look cleaner than a spreadsheet
- No database needed for MVP

Cons:

- Updating player list means editing JSON/CSV unless another admin tool is built
- Secrets/API keys must be handled through GitHub Secrets
- No real backend database
- More developer workflow than spreadsheet workflow

Best use case:

> Public leaderboard with daily automated updates, using JSON as the lightweight data source.

---

### Option 3: Next.js + TypeScript + Supabase + Vercel

Best long-term full app option.

Stack:

```text
Next.js
TypeScript
Tailwind CSS
Supabase / Postgres
Vercel
Scheduled serverless function or GitHub Action
```

Pros:

- Real database
- Clean public leaderboard
- Admin dashboard possible
- Manual update button is easy
- Player submission form can be added later
- Can use an existing custom domain
- Good fit for future portfolio/project value

Cons:

- More setup than Sheets or GitHub Pages
- More moving parts
- Need to manage API calls/rate limits carefully
- Supabase/Vercel are free to start but can eventually have limits

Best use case:

> A polished rank tracker app with admin tools, public leaderboard, and future expansion.

---

## Recommended Build Plan

### Recommended MVP Direction

Start with:

```text
Google Sheets + Google Apps Script
```

Reason:

- The player data is already in a spreadsheet.
- The API behavior is still unknown.
- It is the fastest and cheapest way to test whether automated updates work.
- Easy for non-developers/community members to review.

Then later upgrade to:

```text
Next.js + TypeScript + Supabase + Vercel
```

Reason:

- Better public website.
- Better portfolio project.
- Better structure for history, admin tools, and submissions.

---

## MVP Spreadsheet Structure

### Sheet 1: Players

| Column | Example |
|---|---|
| display_name | 84DaysWithout |
| discord_name | B.I.A \| 84DaysWithout |
| clan_tag | LAIN |
| tekken_id | TBD |
| state | Louisiana |
| active | TRUE |
| notes | Created original sheet |

### Sheet 2: Current Ranks

| Column | Example |
|---|---|
| tekken_id | TBD |
| display_name | 84DaysWithout |
| rank_name | God of Destruction I |
| rank_value | 4 |
| main_character | King |
| last_updated | 2026-05-24 |
| source | API |

### Sheet 3: Rank Map

| rank_name | rank_value |
|---|---:|
| Tekken God | 1 |
| Tekken God Supreme | 2 |
| God of Destruction | 3 |
| God of Destruction I | 4 |
| God of Destruction II | 5 |
| God of Destruction III | 6 |
| God of Destruction IV | 7 |
| God of Destruction V | 8 |

### Sheet 4: Update Logs

| Column | Example |
|---|---|
| updated_at | 2026-05-24 3:00 PM |
| players_checked | 50 |
| successful_updates | 48 |
| failed_updates | 2 |
| notes | Rate limit hit on 2 players |

---

## Possible Database Structure For Later App

### players

```sql
id uuid primary key
display_name text
discord_name text
clan_tag text
tekken_id text unique
state text
active boolean
notes text
created_at timestamp
updated_at timestamp
```

### rank_snapshots

```sql
id uuid primary key
player_id uuid references players(id)
rank_name text
rank_value integer
main_character text
source text
fetched_at timestamp
```

### character_ranks

```sql
id uuid primary key
player_id uuid references players(id)
character_name text
rank_name text
rank_value integer
last_seen timestamp
```

---

## Manual Update Button Concept

For Google Sheets:

- Add a custom menu: `Tekken Tracker > Update Ranks`
- The menu triggers Apps Script
- Script loops through active players
- Script calls API by Tekken ID or bulk endpoint
- Script writes updated ranks back to `Current Ranks`
- Script logs results in `Update Logs`

For GitHub Actions:

- Add `workflow_dispatch`
- Add scheduled cron once per day
- Workflow fetches API data
- Updates `ranks.json`
- Commits updated data back to repo

For Next.js:

- Admin page with “Update Now” button
- Button calls protected API route
- API route fetches player ranks
- Updates Supabase
- Vercel cron or GitHub Action runs daily

---

## Final Recommendation

Do not overbuild until the API is reviewed.

Best first step:

```text
1. Collect Tekken IDs for all players.
2. Review API endpoints and rate limits.
3. Keep Google Sheet as source of truth for now.
4. Add rank numeric mapping.
5. Add Google Apps Script automation.
6. Add daily trigger.
7. Add manual update button.
8. Later build a Next.js/Supabase/Vercel public leaderboard if the data flow works.
```

Best starting stack:

```text
Google Sheets + Google Apps Script
```

Best long-term stack:

```text
Next.js + TypeScript + Tailwind CSS + Supabase + Vercel
```

Best completely free public-site option:

```text
GitHub Pages + JSON + GitHub Actions
```

---

## Claude/Copilot Prompt

Use this prompt after pasting the summary above:

```text
I want help reviewing the API and deciding the best implementation plan for this Louisiana Tekken Rank Tracker.

Please help me:

1. Identify the best stack for a free/low-cost MVP.
2. Determine whether Google Sheets + Apps Script, GitHub Pages + GitHub Actions, or Next.js + Supabase + Vercel is best.
3. Design the data model for player ranks.
4. Plan how to handle API rate limits.
5. Plan daily automatic updates.
6. Plan a manual update button.
7. Create starter code once I provide the API docs/endpoints.

Important constraints:

- I already have a Google Sheet.
- I have access to web domains I already paid for.
- I want daily auto updates.
- I want a manual update button.
- The API may rate limit per Tekken ID lookup.
- There may be a bulk profile metadata endpoint.
- Rank may be tied to main character.
- Character-specific ranks may require recent battle lookup.
- Keep it free or low cost if possible.
```
