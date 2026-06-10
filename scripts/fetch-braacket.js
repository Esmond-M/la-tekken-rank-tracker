/**
 * fetch-braacket.js
 *
 * Scrapes the Louisiana Tekken 8 Braacket league rankings and writes the
 * result to public/data/braacket-rankings.json.
 *
 * Scraping has been approved by braacket.com (permission obtained June 2026).
 * This script is run on a weekly schedule via .github/workflows/fetch-braacket.yml.
 *
 * No API key required — the rankings page is publicly accessible HTML.
 * Uses only Node.js built-ins (native fetch, fs, path). No npm dependencies.
 *
 * Pages fetched: controlled by PAGES_TO_FETCH (currently 2 × 100 rows = up to 200 players).
 * Increment PAGES_TO_FETCH if the league grows beyond 200 active players.
 *
 * Run locally:   node scripts/fetch-braacket.js
 * From cache:    (no cache equivalent — this IS the source, no API quota)
 */

import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const LEAGUE_SLUG  = 'LATK8'
const RANKING_ID   = '7D81E3FE-6B24-4332-B660-9E5FB9F9F421'
const PAGES_TO_FETCH = 2
const BASE_URL     = `https://braacket.com/league/${LEAGUE_SLUG}/ranking/${RANKING_ID}?rows=100`

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

/** Strip all HTML tags and collapse whitespace. */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Extract ranking rows from the braacket page HTML.
 *
 * Braacket table cell order per row:
 *   [0] rank position  (number)
 *   [1] movement icon  (▲ / ▼ / — or empty)
 *   [2] player name    (contains an <a href="/league/LATK8/player/...">)
 *   [3] country flag   (usually empty text)
 *   [4] (empty)
 *   [5] Glicko points  (number)
 *   [6] chart icon     (empty text after stripping)
 *
 * NOTE: If braacket redesigns their table, this parser will need updating.
 */
function parseRankings(html) {
  const players = []

  // Match every <tr>…</tr> block
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1]

    // Extract each <td> cell's inner HTML
    const cellsHtml = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map(([, inner]) => inner)

    if (cellsHtml.length < 4) continue // skip header / empty rows

    // Cell [0]: must be a rank integer
    const rankNum = parseInt(stripTags(cellsHtml[0]), 10)
    if (isNaN(rankNum) || rankNum < 1) continue

    // Cell [2]: player name — prefer the anchor tag text for cleanliness.
    // Braacket uses single-quoted href attributes, so allow either.
    const nameLinkMatch = cellsHtml[2]?.match(/<a[^>]+href=["']([^"']*\/player\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/)
    const playerTag  = nameLinkMatch ? stripTags(nameLinkMatch[2]) : stripTags(cellsHtml[2] ?? '')
    const profilePath = nameLinkMatch ? nameLinkMatch[1] : null

    if (!playerTag) continue

    // Cell [5]: Glicko points (last numeric-looking cell as fallback)
    let points = parseInt(stripTags(cellsHtml[5] ?? ''), 10)
    if (isNaN(points)) {
      // Fallback: scan cells from the end for the first integer
      for (let i = cellsHtml.length - 1; i >= 0; i--) {
        const val = parseInt(stripTags(cellsHtml[i]), 10)
        if (!isNaN(val) && val !== rankNum) { points = val; break }
      }
    }
    if (isNaN(points)) continue

    players.push({
      rank:        rankNum,
      player_tag:  playerTag,
      points,
      braacket_url: profilePath ? `https://braacket.com${profilePath}` : null,
    })
  }

  return players
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function fetchPage(pageNum) {
  const url = pageNum === 1 ? BASE_URL : `${BASE_URL}&page=${pageNum}`
  console.log(`Fetching page ${pageNum}…\n  ${url}\n`)

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LA-TK-Tracker/1.0)',
      'Accept':     'text/html,application/xhtml+xml',
    },
  })

  if (!res.ok) {
    console.error(`HTTP ${res.status} — failed to fetch braacket page ${pageNum}`)
    process.exit(1)
  }

  return res.text()
}

async function main() {
  const htmlPages = []
  for (let p = 1; p <= PAGES_TO_FETCH; p++) {
    htmlPages.push(await fetchPage(p))
  }

  // Use first page HTML for metadata extraction
  const firstHtml = htmlPages[0]

  // Parse each page and merge, using rank from the page as-is (already correct)
  const allPlayers = htmlPages.flatMap(html => parseRankings(html))

  if (allPlayers.length === 0) {
    console.error('No players parsed — the page structure may have changed.')
    console.error('Check the HTML and update the parseRankings() cell indices.')
    process.exit(1)
  }

  // Deduplicate by player_tag in case a player appears on multiple pages
  const seen = new Set()
  const players = allPlayers.filter(p => {
    if (seen.has(p.player_tag)) return false
    seen.add(p.player_tag)
    return true
  })

  // Pull ranking name and period from the first page's HTML
  const nameMatch   = firstHtml.match(/LA Tekken 8 Rankings \(S\d+\)/)
  const periodMatch = firstHtml.match(/(\d{1,2} \w+ \d{4})\s*[-–]\s*(\d{1,2} \w+ \d{4})/)

  const output = {
    source:          'braacket',
    league:          LEAGUE_SLUG,
    ranking_name:    nameMatch   ? nameMatch[0]                          : 'LA Tekken 8 Rankings',
    ranking_id:      RANKING_ID,
    ranking_period:  periodMatch ? `${periodMatch[1]} – ${periodMatch[2]}` : null,
    pages_fetched:   PAGES_TO_FETCH,
    updated_at:      new Date().toISOString(),
    players,
  }

  mkdirSync(join(ROOT, 'public/data'), { recursive: true })
  writeFileSync(
    join(ROOT, 'public/data/braacket-rankings.json'),
    JSON.stringify(output, null, 2)
  )

  console.log(`✓ Wrote ${players.length} players (${PAGES_TO_FETCH} pages) → public/data/braacket-rankings.json`)
  console.log(`  Ranking: ${output.ranking_name}`)
  if (output.ranking_period) console.log(`  Period:  ${output.ranking_period}`)
  console.log(`  Top 3:   ${players.slice(0, 3).map(p => `${p.player_tag} (${p.points})`).join(', ')}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
