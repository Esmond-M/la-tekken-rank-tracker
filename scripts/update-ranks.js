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

  // Scan ALL returned battles and track the best rank per character.
  // One API call returns the full page of battles; we scan in memory — no extra calls.
  const bestPerChar = new Map() // character -> best entry for that character
  let mostRecentBattleAt = null // timestamp of the most recent battle (true "last seen")
  let displayName = null // in-game display name from battle data

  for (const battle of battles) {
    if (battle.battle_at) {
      if (!mostRecentBattleAt || battle.battle_at > mostRecentBattleAt) {
        mostRecentBattleAt = battle.battle_at
      }
    }
    const isP1 = battle.p1_tekken_id === player.tekken_id
    if (!displayName) displayName = isP1 ? battle.p1_name : battle.p2_name
    const entry = {
      rank_name: isP1 ? battle.p1_dan_rank : battle.p2_dan_rank,
      tekken_power: isP1 ? battle.p1_tekken_power : battle.p2_tekken_power,
      current_character: isP1 ? battle.p1_char : battle.p2_char,
      last_updated: battle.battle_at,
    }
    const char = entry.current_character
    if (!char) continue
    const existing = bestPerChar.get(char)
    if (
      !existing ||
      rankSortValue(entry.rank_name) < rankSortValue(existing.rank_name) ||
      (rankSortValue(entry.rank_name) === rankSortValue(existing.rank_name) &&
        (entry.tekken_power ?? 0) > (existing.tekken_power ?? 0))
    ) {
      bestPerChar.set(char, entry)
    }
  }

  // Find the single best entry overall (primary character)
  let best = null
  for (const entry of bestPerChar.values()) {
    if (
      !best ||
      rankSortValue(entry.rank_name) < rankSortValue(best.rank_name) ||
      (rankSortValue(entry.rank_name) === rankSortValue(best.rank_name) &&
        (entry.tekken_power ?? 0) > (best.tekken_power ?? 0))
    ) {
      best = entry
    }
  }

  // Lock the primary slot to the player's main_character from players.json.
  // The API only refreshes tekken_power / rank for that character; the displayed
  // character itself never gets overridden by whoever they've been grinding lately.
  // If main_character appears in recent battles, use that entry. Otherwise fall back
  // to a minimal entry built from players.json (peak_rank, no power, no timestamp).
  let primary = null
  if (player.main_character) {
    const mainEntry = bestPerChar.get(player.main_character)
    if (mainEntry) {
      // Trust the API — show current rank on main, even if it's below peak.
      primary = { ...mainEntry }
    } else {
      // main_character not in recent battles — use peak_rank but borrow the best
      // tekken_power from any character (power is account-wide, not character-specific).
      let bestPower = null
      for (const entry of bestPerChar.values()) {
        if ((entry.tekken_power ?? 0) > (bestPower ?? 0)) bestPower = entry.tekken_power
      }
      primary = {
        rank_name: player.peak_rank,
        tekken_power: bestPower,
        current_character: player.main_character,
        last_updated: null,
      }
    }
  } else {
    // No main_character set — fall back to the old "highest-ranked character" pick.
    primary = best
  }

  // Find secondary + tertiary: best-ranked OTHER characters (not the primary) within
  // 2 tiers of primary AND at least God of Destruction (base, index 8).
  const secondaries = []
  if (primary) {
    const primaryTier = rankSortValue(primary.rank_name)
    const godBaseTier = rankSortValue('God of Destruction')
    for (const [char, entry] of bestPerChar.entries()) {
      if (char === primary.current_character) continue
      const tier = rankSortValue(entry.rank_name)
      if (tier <= primaryTier + 2 && tier <= godBaseTier) {
        secondaries.push(entry)
      }
    }
    secondaries.sort((a, b) =>
      rankSortValue(a.rank_name) - rankSortValue(b.rank_name) ||
      (b.tekken_power ?? 0) - (a.tekken_power ?? 0)
    )
  }

  return {
    rankData: primary ? {
      ...primary,
      display_name: displayName !== player.player_tag ? displayName : null,
      secondary_character: secondaries[0]?.current_character ?? null,
      tertiary_character: secondaries[1]?.current_character ?? null,
      last_seen: mostRecentBattleAt,
    } : null,
    rawBattles: battles,
  }
}

// Reprocess existing data/api-cache.json through the current rank logic.
// Zero API calls — useful for testing logic changes without burning daily quota.
function buildRankDataFromBattles(player, battles) {
  const bestPerChar = new Map()
  let mostRecentBattleAt = null
  let displayName = null
  for (const battle of battles) {
    if (battle.battle_at) {
      if (!mostRecentBattleAt || battle.battle_at > mostRecentBattleAt) {
        mostRecentBattleAt = battle.battle_at
      }
    }
    const isP1 = battle.p1_tekken_id === player.tekken_id
    if (!displayName) displayName = isP1 ? battle.p1_name : battle.p2_name
    const entry = {
      rank_name: isP1 ? battle.p1_dan_rank : battle.p2_dan_rank,
      tekken_power: isP1 ? battle.p1_tekken_power : battle.p2_tekken_power,
      current_character: isP1 ? battle.p1_char : battle.p2_char,
      last_updated: battle.battle_at,
    }
    const char = entry.current_character
    if (!char) continue
    const existing = bestPerChar.get(char)
    if (
      !existing ||
      rankSortValue(entry.rank_name) < rankSortValue(existing.rank_name) ||
      (rankSortValue(entry.rank_name) === rankSortValue(existing.rank_name) &&
        (entry.tekken_power ?? 0) > (existing.tekken_power ?? 0))
    ) {
      bestPerChar.set(char, entry)
    }
  }

  let best = null
  for (const entry of bestPerChar.values()) {
    if (
      !best ||
      rankSortValue(entry.rank_name) < rankSortValue(best.rank_name) ||
      (rankSortValue(entry.rank_name) === rankSortValue(best.rank_name) &&
        (entry.tekken_power ?? 0) > (best.tekken_power ?? 0))
    ) {
      best = entry
    }
  }

  let primary = null
  if (player.main_character) {
    const mainEntry = bestPerChar.get(player.main_character)
    if (mainEntry) {
      primary = { ...mainEntry }
    } else {
      let bestPower = null
      for (const entry of bestPerChar.values()) {
        if ((entry.tekken_power ?? 0) > (bestPower ?? 0)) bestPower = entry.tekken_power
      }
      primary = {
        rank_name: player.peak_rank,
        tekken_power: bestPower,
        current_character: player.main_character,
        last_updated: null,
      }
    }
  } else {
    primary = best
  }

  const secondaries = []
  if (primary) {
    const primaryTier = rankSortValue(primary.rank_name)
    const godBaseTier = rankSortValue('God of Destruction')
    for (const [char, entry] of bestPerChar.entries()) {
      if (char === primary.current_character) continue
      const tier = rankSortValue(entry.rank_name)
      if (tier <= primaryTier + 2 && tier <= godBaseTier) {
        secondaries.push(entry)
      }
    }
    secondaries.sort((a, b) =>
      rankSortValue(a.rank_name) - rankSortValue(b.rank_name) ||
      (b.tekken_power ?? 0) - (a.tekken_power ?? 0)
    )
  }

  return primary
    ? {
        ...primary,
        display_name: displayName !== player.player_tag ? displayName : null,
        secondary_character: secondaries[0]?.current_character ?? null,
        tertiary_character: secondaries[1]?.current_character ?? null,
        last_seen: mostRecentBattleAt,
      }
    : null
}

async function reprocessFromCache() {
  console.log('Reprocessing from data/api-cache.json (no API calls)...')
  const players = JSON.parse(readFileSync(join(ROOT, 'data/players.json'), 'utf8'))
  const cache = JSON.parse(readFileSync(join(ROOT, 'data/api-cache.json'), 'utf8'))
  const battlesByPlayer = new Map(cache.players.map(p => [p.tekken_id, p.battles]))

  const results = []
  let successful = 0
  let skipped = 0

  for (const player of players) {
    if (!player.tekken_id || !battlesByPlayer.has(player.tekken_id)) {
      results.push({
        tekken_id: player.tekken_id ?? null,
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

    const battles = battlesByPlayer.get(player.tekken_id)
    const rankData = buildRankDataFromBattles(player, battles)
    if (rankData) {
      results.push({
        tekken_id: player.tekken_id,
        player_tag: player.player_tag,
        ...(rankData.display_name ? { display_name: rankData.display_name } : {}),
        platform: player.platform,
        main_character: player.main_character,
        rank_name: rankData.rank_name,
        tekken_power: rankData.tekken_power,
        current_character: rankData.current_character,
        secondary_character: rankData.secondary_character,
        tertiary_character: rankData.tertiary_character,        ...(player.show_tertiary ? { show_tertiary: true } : {}),        ...(player.show_tertiary ? { show_tertiary: true } : {}),
        last_updated: rankData.last_updated,
        last_seen: rankData.last_seen ?? null,
        source: 'api',
      })
      console.log(`  [ok] ${player.player_tag} — ${rankData.rank_name} on ${rankData.current_character}`)
      successful++
    } else {
      skipped++
    }
  }

  // Merge known_name from players.json into each result.
  // known_name (hand-entered) takes priority; otherwise display_name from battle data is used.
  const knownNameMap = new Map(players.map(p => [p.tekken_id, p.known_name]))
  for (const r of results) {
    const kn = r.tekken_id && knownNameMap.get(r.tekken_id)
    if (kn) r.known_name = kn
    else if (r.display_name) r.known_name = r.display_name
    delete r.display_name
  }

  results.sort((a, b) => {
    const tierDiff = rankSortValue(a.rank_name) - rankSortValue(b.rank_name)
    if (tierDiff !== 0) return tierDiff
    return (b.tekken_power ?? 0) - (a.tekken_power ?? 0)
  })

  const output = {
    updated_at: new Date().toISOString(),
    stats: { successful, failed: 0, skipped },
    players: results,
  }
  writeFileSync(join(ROOT, 'public/data/ranks.json'), JSON.stringify(output, null, 2))
  console.log(`\nWrote public/data/ranks.json — ${successful} from cache, ${skipped} fallback to manual.`)
}

async function main() {
  if (process.argv.includes('--from-cache')) {
    await reprocessFromCache()
    return
  }

  if (!API_KEY) {
    console.error('EWGF_API_KEY environment variable is required')
    process.exit(1)
  }

  // --player <id1,id2,...>
  // Fetch only the specified tekken IDs and merge results into existing ranks.json
  // and api-cache.json, leaving all other players untouched.
  // Useful for adding new players without burning the full 46-call daily quota.
  // Example: node scripts/update-ranks.js --player 2T7Ay7t77iha,2bhAGQRT2tBQ
  const playerFlagIdx = process.argv.indexOf('--player')
  const targetIds = playerFlagIdx !== -1
    ? new Set(process.argv[playerFlagIdx + 1]?.split(',').map(s => s.trim()).filter(Boolean))
    : null

  let players
  try {
    players = JSON.parse(readFileSync(join(ROOT, 'data/players.json'), 'utf8'))
  } catch (err) {
    console.error('Failed to load data/players.json:', err.message)
    console.error('Make sure the file exists and contains valid JSON.')
    process.exit(1)
  }

  // If --player flag was given, filter to only those players
  const playersToFetch = targetIds
    ? players.filter(p => p.tekken_id && targetIds.has(p.tekken_id))
    : players

  if (targetIds) {
    if (playersToFetch.length === 0) {
      console.error('No matching players found for the given IDs:', [...targetIds].join(', '))
      process.exit(1)
    }
    console.log(`--player mode: fetching ${playersToFetch.length} of ${players.length} player(s): ${playersToFetch.map(p => p.player_tag ?? p.tekken_id).join(', ')}`)
  }

  const results = []
  const apiCache = []   // raw battle data saved for offline reuse
  let successful = 0
  let failed = 0
  let skipped = 0
  let rateLimitHit = false
  const log = { skipped_no_id: [], skipped_rate_limit: [], failed: [], successful: [] }

  console.log(`Fetching ranks for ${playersToFetch.length} players...`)

  for (const player of playersToFetch) {
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
      log.skipped_no_id.push(player.player_tag)
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
      log.skipped_rate_limit.push(player.player_tag)
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
          ...(rankData.display_name ? { display_name: rankData.display_name } : {}),
          platform: player.platform,
          main_character: player.main_character,
          rank_name: rankData.rank_name,
          tekken_power: rankData.tekken_power,
          current_character: rankData.current_character,
          secondary_character: rankData.secondary_character,
          tertiary_character: rankData.tertiary_character,
          last_updated: rankData.last_updated,
          last_seen: rankData.last_seen ?? null,
          source: 'api',
        })
        console.log(`  [ok] ${player.player_tag} — ${rankData.rank_name} (${rankData.tekken_power?.toLocaleString()})`)
        log.successful.push(player.player_tag)
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
        console.warn(`  [no data] ${player.player_tag} — API returned no battles`)
        log.failed.push({ player: player.player_tag, reason: 'no_battles' })
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
        log.skipped_rate_limit.push(player.player_tag)
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
        log.failed.push({ player: player.player_tag, reason: err.message })
        failed++
      }
    }
  }

  // Merge known_name from players.json into each result.
  // known_name (hand-entered) takes priority; otherwise display_name from battle data is used.
  const knownNameMapMain = new Map(players.map(p => [p.tekken_id, p.known_name]))
  for (const r of results) {
    const kn = r.tekken_id && knownNameMapMain.get(r.tekken_id)
    if (kn) r.known_name = kn
    else if (r.display_name) r.known_name = r.display_name
    delete r.display_name
  }

  // Sort: by rank tier first, then by tekken_power desc within the same tier
  results.sort((a, b) => {
    const tierDiff = rankSortValue(a.rank_name) - rankSortValue(b.rank_name)
    if (tierDiff !== 0) return tierDiff
    return (b.tekken_power ?? 0) - (a.tekken_power ?? 0)
  })

  // In --player mode, merge the freshly-fetched results into the existing
  // ranks.json (replace matching entries, keep all others intact), then re-sort.
  let finalResults = results
  if (targetIds) {
    const ranksPath = join(ROOT, 'public/data/ranks.json')
    let existing = []
    try {
      existing = JSON.parse(readFileSync(ranksPath, 'utf8')).players ?? []
    } catch { /* first run or file missing — start fresh */ }

    // Remove stale entries for the players we just fetched, then append fresh ones
    const freshIds = new Set(results.map(r => r.tekken_id))
    finalResults = [
      ...existing.filter(r => !freshIds.has(r.tekken_id)),
      ...results,
    ]
    finalResults.sort((a, b) => {
      const tierDiff = rankSortValue(a.rank_name) - rankSortValue(b.rank_name)
      if (tierDiff !== 0) return tierDiff
      return (b.tekken_power ?? 0) - (a.tekken_power ?? 0)
    })

    // Merge api-cache entries too
    const cachePath2 = join(ROOT, 'data/api-cache.json')
    try {
      const existingCache = JSON.parse(readFileSync(cachePath2, 'utf8'))
      const freshCacheIds = new Set(apiCache.map(c => c.tekken_id))
      const mergedCache = [
        ...(existingCache.players ?? []).filter(c => !freshCacheIds.has(c.tekken_id)),
        ...apiCache,
      ]
      writeFileSync(cachePath2, JSON.stringify({ ...existingCache, players: mergedCache }, null, 2))
      console.log(`API cache merged into data/api-cache.json`)
    } catch { /* no existing cache — will be written fresh below */ }
  }

  const output = {
    updated_at: new Date().toISOString(),
    stats: {
      successful,
      failed,
      skipped,
      rate_limit_hit: rateLimitHit,
      skipped_rate_limit_count: log.skipped_rate_limit.length,
    },
    players: finalResults,
  }

  mkdirSync(join(ROOT, 'public/data'), { recursive: true })
  writeFileSync(join(ROOT, 'public/data/ranks.json'), JSON.stringify(output, null, 2))

  // Save raw API battle data so ranks can be reprocessed later without new API calls.
  // Useful for debugging, re-sorting, or AI analysis offline.
  // In --player mode the cache was already merged above; skip the full overwrite.
  const cachePath = join(ROOT, 'data/api-cache.json')
  if (!targetIds) {
    const cacheOutput = {
      generated_at: new Date().toISOString(),
      note: 'Raw battle data from EWGF API. Do not commit sensitive info. Re-run update-ranks.js to refresh.',
      players: apiCache,
    }
    mkdirSync(join(ROOT, 'data'), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(cacheOutput, null, 2))
    console.log(`API cache written to data/api-cache.json (${apiCache.length} players)`)
  }

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

  // Write run log (gitignored) — keeps last 10 runs with per-player detail
  const runLogPath = join(ROOT, 'data/run-log.json')
  let runLogEntries = []
  try { runLogEntries = JSON.parse(readFileSync(runLogPath, 'utf8')) } catch { /* first run */ }
  runLogEntries.push({
    ran_at: new Date().toISOString(),
    api_calls: apiCallsThisRun,
    successful: log.successful,
    failed: log.failed,
    skipped_no_id: log.skipped_no_id,
    skipped_rate_limit: log.skipped_rate_limit,
  })
  runLogEntries = runLogEntries.slice(-10)
  writeFileSync(runLogPath, JSON.stringify(runLogEntries, null, 2))

  // GitHub Actions annotations — show up as callouts on the workflow run page
  if (process.env.GITHUB_ACTIONS) {
    if (rateLimitHit) {
      const count = log.skipped_rate_limit.length
      console.log(`::error title=API Rate Limit Hit::Daily quota reached — ${count} player${count !== 1 ? 's' : ''} skipped and showing stale data. Quota resets midnight UTC.`)
    }
    if (log.failed.length > 0) {
      const names = log.failed.map(f => f.player).join(', ')
      console.log(`::warning title=API Fetch Failures::${log.failed.length} player(s) failed to fetch: ${names}`)
    }
    if (log.skipped_no_id.length > 0) {
      console.log(`::notice title=No Tekken ID::${log.skipped_no_id.length} player(s) have no Tekken ID and show peak_rank only: ${log.skipped_no_id.join(', ')}`)
    }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Run complete — ${new Date().toISOString()}`)
  console.log(`  ✓ Updated:  ${successful} players`)
  if (failed > 0)     console.log(`  ✗ Failed:   ${failed} — ${log.failed.map(f => `${f.player} (${f.reason})`).join(', ')}`)
  if (log.skipped_no_id.length)      console.log(`  - No ID:    ${log.skipped_no_id.join(', ')}`)
  if (log.skipped_rate_limit.length) console.log(`  - RateSkip: ${log.skipped_rate_limit.join(', ')}`)
  console.log(`  API calls: ${apiCallsThisRun}`)
  if (lastRateLimitMeta) {
    console.log(`  Remaining: ${lastRateLimitMeta.rate_limit_remaining} calls (resets ${lastRateLimitMeta.rate_limit_reset})`)
  }
  if (rateLimitHit) {
    console.warn('  ⚠ Rate limit was hit — some players used manual data.')
  }
  console.log('─'.repeat(50))
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
