/**
 * enrich-from-wavu.js
 *
 * Fills missing platform data in data/players.json by scraping wavu.wank player pages.
 * Also grabs display names for potential known_name fallback.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  THIS SCRIPT DOES NOT RUN AUTOMATICALLY.                    ║
 * ║  Run it manually from the terminal when you need to update  ║
 * ║  player platform info from wavu.wank.                       ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * wavu.wank platform info is embedded in the HTML:
 *   <svg class="platform-icon"><title>steam</title>...</svg>
 *   <svg class="platform-icon"><title>psn</title>...</svg>
 *   <svg class="platform-icon"><title>xbox</title>...</svg>
 *
 * The /api page confirms scraping is acceptable with rate limits (blocking requests
 * are fine). This script runs sequentially with a delay between requests.
 *
 * Platform values are normalized to match players.json convention:
 *   steam → Steam, psn → Playstation, xbox → Xbox
 *
 * Usage:
 *   node scripts/enrich-from-wavu.js              # fill platform=null players
 *   node scripts/enrich-from-wavu.js --all         # re-check ALL players
 *   node scripts/enrich-from-wavu.js --dry-run     # show what would change
 *   node scripts/enrich-from-wavu.js --player 2T7Ay7t77iha,2bhAGQRT2tBQ  # specific IDs
 */

import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PLAYERS_PATH = join(ROOT, 'data/players.json')

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE_ALL = process.argv.includes('--all')

// Parse --player flag
const playerFlagIdx = process.argv.indexOf('--player')
const TARGET_IDS = playerFlagIdx !== -1
  ? new Set(process.argv[playerFlagIdx + 1]?.split(',').map(s => s.trim()).filter(Boolean))
  : null

const DELAY_MS = 800 // between requests, be respectful
const PLATFORM_MAP = {
  steam: 'Steam',
  psn: 'Playstation',
  xbox: 'Xbox',
}

/**
 * Fetch and parse a wavu.wank player page. Returns { platform, displayName } or null.
 */
async function fetchPlayerInfo(tekkenId) {
  const url = `https://wank.wavu.wiki/player/${tekkenId}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LA-TK-Tracker/1.0)',
        'Accept': 'text/html',
        'Accept-Encoding': 'gzip, deflate',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error(`  [${res.status}] ${url}`)
      return null
    }
    const html = await res.text()

    // Extract platform from SVG title
    // <svg class="platform-icon" ...><title>steam</title>...</svg>
    const platformMatch = html.match(/<svg[^>]+class="[^"]*platform-icon[^"]*"[^>]*>[\s\S]*?<title>([a-z]+)<\/title>/i)
    let platform = null
    if (platformMatch) {
      const raw = platformMatch[1].toLowerCase()
      platform = PLATFORM_MAP[raw] ?? raw
    }

    // Extract display name from <div class="name">
    const nameMatch = html.match(/<div class="name">\s*([^<]+)\s*<\/div>/)
    const displayName = nameMatch ? nameMatch[1].trim() : null

    return { platform, displayName }
  } catch (err) {
    console.error(`  [error] ${tekkenId}: ${err.message}`)
    return null
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const players = JSON.parse(readFileSync(PLAYERS_PATH, 'utf8'))
  console.log(`Loaded ${players.length} players from data/players.json\n`)

  let toCheck
  if (TARGET_IDS) {
    toCheck = players.filter(p => p.tekken_id && TARGET_IDS.has(p.tekken_id))
    console.log(`--player mode: checking ${toCheck.length} specified player(s)`)
  } else if (FORCE_ALL) {
    toCheck = players.filter(p => p.tekken_id)
    console.log(`--all mode: checking all ${toCheck.length} players with tekken_id`)
  } else {
    toCheck = players.filter(p => p.platform === null && p.tekken_id)
    console.log(`Checking ${toCheck.length} players with platform=null`)
  }

  if (toCheck.length === 0) {
    console.log('No players to check.')
    return
  }

  let changed = 0
  let checked = 0
  let failed = 0

  for (const player of toCheck) {
    checked++
    console.log(`[${checked}/${toCheck.length}] ${player.player_tag} (${player.tekken_id})`)

    const info = await fetchPlayerInfo(player.tekken_id)
    if (!info) {
      failed++
      await sleep(DELAY_MS)
      continue
    }

    const changes = []

    if (info.platform && player.platform !== info.platform) {
      changes.push(`platform: ${player.platform ?? 'null'} → ${info.platform}`)
      if (!DRY_RUN) player.platform = info.platform
    }

    // Only set known_name from wavu display name if no known_name exists yet
    if (info.displayName && !player.known_name && player.player_tag !== info.displayName) {
      changes.push(`known_name: (set) → "${info.displayName}"`)
      if (!DRY_RUN) player.known_name = info.displayName
    }

    if (changes.length > 0) {
      console.log(`  ${changes.join(', ')}`)
      changed++
    } else {
      console.log(`  (no changes)`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Checked: ${checked} | Changed: ${changed} | Failed: ${failed}`)

  if (!DRY_RUN && changed > 0) {
    writeFileSync(PLAYERS_PATH, JSON.stringify(players, null, 2) + '\n')
    console.log(`\n✓ Wrote changes to data/players.json`)

    // Big reminder — the site only reads ranks.json, NOT players.json.
    // Until the user regenerates ranks.json, their changes are invisible.
    console.log('\n' + '═'.repeat(62))
    console.log('  ⚠  YOUR CHANGES WON\'T SHOW UP YET!')
    console.log('  ═'.repeat(62))
    console.log('  The site reads public/data/ranks.json — NOT players.json.')
    console.log('  Run the command below (zero API calls) to regenerate it now:')
    console.log('')
    console.log('    node scripts/update-ranks.js --from-cache')
    console.log('')
    console.log('═'.repeat(62))
  } else if (DRY_RUN && changed > 0) {
    console.log(`\n[DRY RUN] No files were modified. Remove --dry-run to apply.`)
  } else {
    console.log(`\nNo changes needed.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})