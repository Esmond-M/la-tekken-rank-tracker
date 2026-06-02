import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const API_KEY = process.env.EWGF_API_KEY
const BASE_URL = 'https://api.ewgf.gg'

// Tracks API usage. Updated after every call so we always know the latest
// rate-limit info, even if the script is interrupted.
let lastRateLimitMeta = null
let apiCallsThisRun = 0

// Rank order for sorting players (highest first = index 0)
const RANK_ORDER = [
  'God of Destruction VIII',
  'God of Destruction VII',
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

  apiCallsThisRun++

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') ?? '60'
    throw new Error(`RATE_LIMIT:${retryAfter}`)
  }

  if (res.status === 404) {
    console.warn(`  [404] ${player.player_tag} — not found in EWGF database`)
    return { rankData: null, rawBattles: [] }
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  const body = await res.json()
  if (body._metadata) lastRateLimitMeta = body._metadata
  const battles = body.data

  if (!battles || battles.length === 0) {
    console.warn(`  [empty] ${player.player_tag} — no battles found`)
    return { rankData: null, rawBattles: [] }
  }

  // Scan ALL returned battles and pick the highest rank seen.
  // One API call returns the full page of battles; we scan in memory — no extra calls.
  // We only care about rank/power here; character comes from players.json (main_character).
  let best = null
  for (const battle of battles) {
    const isP1 = battle.p1_tekken_id === player.tekken_id
    const entry = {
      rank_name: isP1 ? battle.p1_dan_rank : battle.p2_dan_rank,
      tekken_power: isP1 ? battle.p1_tekken_power : battle.p2_tekken_power,
      last_updated: battle.battle_at,
    }
    if (
      !best ||
      rankSortValue(entry.rank_name) < rankSortValue(best.rank_name) ||
      (rankSortValue(entry.rank_name) === rankSortValue(best.rank_name) &&
        (entry.tekken_power ?? 0) > (best.tekken_power ?? 0))
    ) {
      best = entry
    }
  }

  return { rankData: best, rawBattles: battles }
}

async function main() {
  if (!API_KEY) {
    console.error('EWGF_API_KEY environment variable is required')
    process.exit(1)
  }

  const players = JSON.parse(readFileSync(join(ROOT, 'data/players.json'), 'utf8'))
  const results = []
  const apiCache = []   // raw battle data saved for offline reuse
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
      const { rankData, rawBattles } = await fetchPlayerRank(player)

      if (rawBattles.length > 0) {
        apiCache.push({
          tekken_id: player.tekken_id,
          player_tag: player.player_tag,
          fetched_at: new Date().toISOString(),
          battles: rawBattles,
        })
      }

      if (rankData) {
        results.push({
          tekken_id: player.tekken_id,
          player_tag: player.player_tag,
          platform: player.platform,
          main_character: player.main_character,
          rank_name: rankData.rank_name,
          tekken_power: rankData.tekken_power,
          last_updated: rankData.last_updated,
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

  // Sort: by rank tier first, then by tekken_power desc within the same tier
  results.sort((a, b) => {
    const tierDiff = rankSortValue(a.rank_name) - rankSortValue(b.rank_name)
    if (tierDiff !== 0) return tierDiff
    return (b.tekken_power ?? 0) - (a.tekken_power ?? 0)
  })

  const output = {
    updated_at: new Date().toISOString(),
    stats: { successful, failed, skipped },
    players: results,
  }

  mkdirSync(join(ROOT, 'public/data'), { recursive: true })
  writeFileSync(join(ROOT, 'public/data/ranks.json'), JSON.stringify(output, null, 2))

  // Save raw API battle data so ranks can be reprocessed later without new API calls.
  // Useful for debugging, re-sorting, or AI analysis offline.
  const cachePath = join(ROOT, 'data/api-cache.json')
  const cacheOutput = {
    generated_at: new Date().toISOString(),
    note: 'Raw battle data from EWGF API. Do not commit sensitive info. Re-run update-ranks.js to refresh.',
    players: apiCache,
  }
  writeFileSync(cachePath, JSON.stringify(cacheOutput, null, 2))
  console.log(`API cache written to data/api-cache.json (${apiCache.length} players)`)

  // Write a private rate-limit log (gitignored) so you can keep an eye on usage.
  const logPath = join(ROOT, '.rate-limit-log.json')
  let logEntries = []
  try {
    logEntries = JSON.parse(readFileSync(logPath, 'utf8'))
  } catch {
    // first run — empty log
  }
  logEntries.push({
    ran_at: new Date().toISOString(),
    api_calls_this_run: apiCallsThisRun,
    rate_limit_remaining: lastRateLimitMeta?.rate_limit_remaining ?? null,
    rate_limit_reset: lastRateLimitMeta?.rate_limit_reset ?? null,
    tier: lastRateLimitMeta?.tier ?? null,
    successful, failed, skipped,
  })
  // Keep only the last 30 entries
  logEntries = logEntries.slice(-30)
  writeFileSync(logPath, JSON.stringify(logEntries, null, 2))

  console.log(`\nDone. Updated: ${successful}, Failed: ${failed}, Skipped: ${skipped}`)
  console.log(`API calls this run: ${apiCallsThisRun}`)
  if (lastRateLimitMeta) {
    console.log(`Rate limit remaining: ${lastRateLimitMeta.rate_limit_remaining} (resets ${lastRateLimitMeta.rate_limit_reset})`)
  }
  if (rateLimitHit) {
    console.warn('Rate limit was hit — some players used manual data. Consider Pro tier if this is frequent.')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
