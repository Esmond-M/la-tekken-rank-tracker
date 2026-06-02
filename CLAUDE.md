# CLAUDE.md — Project Notes for AI Assistants

## ⚠️ API Calls — Be Careful
- The EWGF API (`api.ewgf.gg`) requires `EWGF_API_KEY` (stored as a GitHub Actions secret).
- **Do NOT trigger or simulate API calls locally** without confirming with the user first.
- Rate limits apply. The free tier is limited; hitting rate limit mid-run falls back to manual/peak_rank data.
- The update script is `scripts/update-ranks.js` and is intended to run via GitHub Actions only (`update-ranks.yml`), not manually unless the user explicitly asks.

## Deployment
- Site is a Vite + React app deployed to **GitHub Pages**.
- Push to `main` → `deploy.yml` runs `npm run build` → deploys `dist/` to Pages.
- Changes are live ~2–4 minutes after push (check Actions tab).
- `public/data/ranks.json` changes do **not** trigger a redeploy (excluded via `paths-ignore`).

## Data Flow
- `data/players.json` — source roster (player names, Tekken IDs, platform, main char, peak rank)
- `public/data/ranks.json` — generated output from `update-ranks.js`; committed and served statically
- The app (`src/App.jsx`) fetches `ranks.json` at runtime from the static host

## Rank Tier Order (highest → lowest)
God of Destruction VIII → VII → VI → V → IV → III → II → I → God of Destruction (base) → Tekken God Supreme → Tekken God → Tekken King → Tekken Emperor → Bushin → Kishin → Raijin → Fujin

Sorting: rank tier first, then `tekken_power` desc as tiebreaker within the same tier.

## UI Decisions
- No "Trigger manual update" link — GitHub Actions, not for end users
- No "X of Y players live from API" count — not meaningful to visitors
- No "Daily / Auto-update" stat — timestamp in header already communicates this
- No `manual` source badge on player rows — internal detail, not for display
