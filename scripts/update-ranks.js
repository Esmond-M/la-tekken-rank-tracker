import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const API_KEY = process.env.EWGF_API_KEY
const BASE_URL = 'https://api.ewgf.gg'

// Rank order for sorting players without API data (highest first = index 0)
const RANK_ORDER = [
  'God of Destruction VI',
  'God of Destruction V',
  'God of Destruction IV',
  'God of Destruction III',
  'God of Destruction II',
  'God of Destruction I',
  'God of Destruction',
  'Tekken God Supreme',
  'Tekken God',
  'Tekken King',
  'Tekken Emperor',
  'Bushin',
  'Kishin',
  'Raijin',
  'Fujin',
]

function rankSortValue(rankName) {
  const idx = RANK_ORDER.indexOf(rankName)
  return idx === -1 ? RANK_ORDER.length : idx
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchPlayerRank(player) {
  const res = await fetch(`${BASE_URL}/external/battles/${player.tekken_id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  })

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') ?? '60'
    throw new Error(`RATE_LIMIT:${retryAfter}`)
  }

  if (res.status === 404) {
    console.warn(`  [404] ${player.player_tag} — not found in EWGF database`)
    return null
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  const body = await res.json()
  const battles = body.data

  if (!battles || battles.length === 0) {
    console.warn(`  [empty] ${player.player_tag} — no battles found`)
    return null
  }

  const latest = battles[0]
  const isP1 = latest.p1_tekken_id === player.tekken_id

  return {
    rank_name: isP1 ? latest.p1_dan_rank : latest.p2_dan_rank,
    tekken_power: isP1 ? latest.p1_tekken_power : latest.p2_tekken_power,
    current_character: isP1 ? latest.p1_char : latest.p2_char,
    last_updated: latest.battle_at,
  }
}

async function main() {
  if (!API_KEY) {
    console.error('EWGF_API_KEY environment variable is required')
    process.exit(1)
  }

  const players = JSON.parse(readFileSync(join(ROOT, 'data/players.json'), 'utf8'))
  const results = []
  let successful = 0
  let failed = 0
  let skipped = 0
  let rateLimitHit = false

  console.log(`Fetching ranks for ${players.length} players...`)

  for (const player of players) {
    if (!player.tekken_id) {
      results.push({
        tekken_id: null,
        player_tag: player.player_tag,
        platform: player.platform,
        main_character: player.main_character,
        rank_name: player.peak_rank,
        tekken_power: null,
        current_character: null,
        last_updated: null,
        source: 'manual',
      })
      console.log(`  [skip] ${player.player_tag} — no Tekken ID`)
      skipped++
      continue
    }

    if (rateLimitHit) {
      results.push({
        tekken_id: player.tekken_id,
        player_tag: player.player_tag,
        platform: player.platform,
        main_character: player.main_character,
        rank_name: player.peak_rank,
        tekken_power: null,
        current_character: null,
        last_updated: null,
        source: 'manual',
      })
      skipped++
      continue
    }

    try {
      const rankData = await fetchPlayerRank(player)

      if (rankData) {
        results.push({
          tekken_id: player.tekken_id,
          player_tag: player.player_tag,
          platform: player.platform,
          main_character: player.main_character,
          ...rankData,
          source: 'api',
        })
        console.log(`  [ok] ${player.player_tag} — ${rankData.rank_name} (${rankData.tekken_power?.toLocaleString()})`)
        successful++
      } else {
        results.push({
          tekken_id: player.tekken_id,
          player_tag: player.player_tag,
          platform: player.platform,
          main_character: player.main_character,
          rank_name: player.peak_rank,
          tekken_power: null,
          current_character: null,
          last_updated: null,
          source: 'manual',
        })
        failed++
      }

      // Small delay to be respectful of the API
      await sleep(300)
    } catch (err) {
      if (err.message.startsWith('RATE_LIMIT:')) {
        const wait = err.message.split(':')[1]
        console.warn(`  [rate limit] Hit rate limit at ${player.player_tag}. Retry-After: ${wait}s`)
        rateLimitHit = true
        results.push({
          tekken_id: player.tekken_id,
          player_tag: player.player_tag,
          platform: player.platform,
          main_character: player.main_character,
          rank_name: player.peak_rank,
          tekken_power: null,
          current_character: null,
          last_updated: null,
          source: 'manual',
        })
        skipped++
      } else {
        console.error(`  [error] ${player.player_tag}: ${err.message}`)
        results.push({
          tekken_id: player.tekken_id,
          player_tag: player.player_tag,
          platform: player.platform,
          main_character: player.main_character,
          rank_name: player.peak_rank,
          tekken_power: null,
          current_character: null,
          last_updated: null,
          source: 'manual',
        })
        failed++
      }
    }
  }

  // Sort: API results by tekken_power desc, then manual by rank order
  results.sort((a, b) => {
    if (a.tekken_power && b.tekken_power) return b.tekken_power - a.tekken_power
    if (a.tekken_power) return -1
    if (b.tekken_power) return 1
    return rankSortValue(a.rank_name) - rankSortValue(b.rank_name)
  })

  const output = {
    updated_at: new Date().toISOString(),
    stats: { successful, failed, skipped },
    players: results,
  }

  mkdirSync(join(ROOT, 'public/data'), { recursive: true })
  writeFileSync(join(ROOT, 'public/data/ranks.json'), JSON.stringify(output, null, 2))

  console.log(`\nDone. Updated: ${successful}, Failed: ${failed}, Skipped: ${skipped}`)
  if (rateLimitHit) {
    console.warn('Rate limit was hit — some players used manual data. Consider Pro tier if this is frequent.')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
