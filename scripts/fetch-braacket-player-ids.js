/**
 * fetch-braacket-player-ids.js
 *
 * ONE-TIME (or rare) scrape of the LATK8 player list page to extract
 * each player's name → UUID mapping. Used to build direct profile links
 * in the Tournament Rankings tab.
 *
 * Output: data/braacket-player-ids.json   (name → UUID map)
 *
 * IMPORTANT: Run this manually, not on a cron. Braacket ToS prohibits
 * systematic/automated data collection without consent. A one-shot map
 * build is far different from ongoing scraping.
 *
 * Usage:   node scripts/fetch-braacket-player-ids.js
 *          node scripts/fetch-braacket-player-ids.js --merge
 *            (also rewrites public/data/braacket-rankings.json with
 *             braacket_url filled in for any player we can resolve)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const LEAGUE_SLUG = 'LATK8'
const URL = `https://braacket.com/league/${LEAGUE_SLUG}/player?rows=500`

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Match anchor tags of the shape:
 *   <a href="/league/LATK8/player/UUID">Player Name</a>
 *   <a href='/league/LATK8/player/UUID'>Player Name</a>
 * UUID = 8-4-4-4-12 hex characters.
 */
function parsePlayerIds(html) {
  const map = {}
  const uuidRe = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i
  // [\"'] matches either single or double quotes
  const anchorRe = new RegExp(
    `<a[^>]+href=["']([^"']*\\/league\\/${LEAGUE_SLUG}\\/player\\/(${uuidRe.source})[^"']*)["'][^>]*>([\\s\\S]*?)<\\/a>`,
    'gi'
  )
  let m
  while ((m = anchorRe.exec(html)) !== null) {
    const uuid = m[2].toUpperCase()
    const name = decodeEntities(stripTags(m[3]))
    if (!name) continue
    // First occurrence wins (avoids duplicates from breadcrumbs, etc.)
    if (!map[name]) map[name] = uuid
  }
  return map
}

async function main() {
  console.log(`Fetching LATK8 player list…\n  ${URL}\n`)
  const res = await fetch(URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; LA-TK-Tracker/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!res.ok) {
    console.error(`HTTP ${res.status}`)
    process.exit(1)
  }
  const html = await res.text()
  const map = parsePlayerIds(html)
  const total = Object.keys(map).length
  if (total === 0) {
    console.error('No player IDs parsed — page structure may have changed.')
    process.exit(1)
  }

  mkdirSync(join(ROOT, 'data'), { recursive: true })
  const outPath = join(ROOT, 'data/braacket-player-ids.json')
  writeFileSync(outPath, JSON.stringify(
    { league: LEAGUE_SLUG, fetched_at: new Date().toISOString(), count: total, players: map },
    null,
    2
  ))
  console.log(`✓ Wrote ${total} player IDs → data/braacket-player-ids.json`)

  if (process.argv.includes('--merge')) {
    const rankingsPath = join(ROOT, 'public/data/braacket-rankings.json')
    const rankings = JSON.parse(readFileSync(rankingsPath, 'utf8'))
    const rankingId = rankings.ranking_id
    let matched = 0
    rankings.players = rankings.players.map(p => {
      const uuid = map[p.player_tag]
      if (!uuid) return p
      matched++
      return {
        ...p,
        braacket_url: `https://braacket.com/league/${LEAGUE_SLUG}/player/${uuid}` +
          (rankingId ? `?ranking=${rankingId}` : ''),
      }
    })
    writeFileSync(rankingsPath, JSON.stringify(rankings, null, 2) + '\n')
    console.log(`✓ Merged into braacket-rankings.json (${matched}/${rankings.players.length} matched)`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
