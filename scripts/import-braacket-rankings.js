import { existsSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const INPUT_PATH = join(ROOT, 'data/braacket-rankings.csv')
const OUTPUT_PATH = join(ROOT, 'public/data/braacket-rankings.json')
const PLAYER_IDS_PATH = join(ROOT, 'data/braacket-player-ids.json')
const DEFAULT_LEAGUE = 'LATK8'
const DEFAULT_RANKING_ID = '7D81E3FE-6B24-4332-B660-9E5FB9F9F421'
const REQUIRED_COLUMNS = ['Rank', 'Player', 'Points']

function parseCsv(csv) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  for (let index = 0; index < csv.length; index++) {
    const char = csv[index]

    if (inQuotes) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          value += '"'
          index++
        } else {
          inQuotes = false
        }
      } else {
        value += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }

  if (inQuotes) throw new Error('Invalid CSV: unterminated quoted field.')
  if (value || row.length > 0) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }

  return rows.filter(fields => fields.some(field => field.trim() !== ''))
}

function parseInteger(value, column, rowNumber) {
  const trimmed = value.trim()
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${column} value on CSV row ${rowNumber}: "${value}".`)
  }
  return Number.parseInt(trimmed, 10)
}

export function parseBraacketCsv(csv) {
  const [header, ...records] = parseCsv(csv.replace(/^\uFEFF/, ''))
  if (!header) throw new Error('Invalid CSV: missing header row.')

  const columns = new Map(header.map((column, index) => [column.trim(), index]))
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.has(column)) {
      throw new Error(`Invalid CSV: missing required "${column}" column.`)
    }
  }

  const players = records.map((record, index) => {
    const rowNumber = index + 2
    const get = column => (record[columns.get(column)] ?? '').trim()
    const rank = parseInteger(get('Rank'), 'Rank', rowNumber)
    const points = parseInteger(get('Points'), 'Points', rowNumber)
    const playerTag = get('Player')

    if (rank < 1) throw new Error(`Invalid Rank on CSV row ${rowNumber}: must be at least 1.`)
    if (!playerTag) throw new Error(`Invalid Player value on CSV row ${rowNumber}: cannot be empty.`)

    return {
      rank,
      player_tag: playerTag,
      points,
      country: columns.has('Country') ? get('Country') : undefined,
      characters: columns.has('Characters') ? get('Characters') : undefined,
    }
  })

  const ranks = new Set()
  const tags = new Set()
  for (const player of players) {
    if (ranks.has(player.rank)) throw new Error(`Invalid CSV: duplicate Rank ${player.rank}.`)
    if (tags.has(player.player_tag)) throw new Error(`Invalid CSV: duplicate Player "${player.player_tag}".`)
    ranks.add(player.rank)
    tags.add(player.player_tag)
  }

  return players
}

function directProfileUrl(league, rankingId, playerTag, playerIds) {
  const playerId = playerIds.players?.[playerTag]
  if (!playerId) return null
  const rankingQuery = rankingId ? `?ranking=${encodeURIComponent(rankingId)}` : ''
  return `https://braacket.com/league/${league}/player/${playerId}${rankingQuery}`
}

export function mergeRankings({ players, existing, playerIds, importedAt }) {
  const league = existing.league ?? playerIds.league ?? DEFAULT_LEAGUE
  const rankingId = existing.ranking_id ?? DEFAULT_RANKING_ID
  const existingByTag = new Map((existing.players ?? []).map(player => [player.player_tag, player]))
  const manualMetadata = { ...existing }
  delete manualMetadata.players
  delete manualMetadata.pages_fetched
  delete manualMetadata.source
  delete manualMetadata.updated_at
  delete manualMetadata.imported_at

  return {
    ...manualMetadata,
    source: 'braacket-csv-export',
    league,
    ranking_id: rankingId,
    updated_at: importedAt,
    imported_at: importedAt,
    players: players.map(player => {
      const existingPlayer = existingByTag.get(player.player_tag) ?? {}
      const directUrl = existingPlayer.braacket_url
        ?? directProfileUrl(league, rankingId, player.player_tag, playerIds)

      return {
        ...existingPlayer,
        rank: player.rank,
        player_tag: player.player_tag,
        points: player.points,
        ...(player.country ? { country: player.country } : {}),
        ...(player.characters ? { characters: player.characters } : {}),
        ...(directUrl ? { braacket_url: directUrl } : {}),
      }
    }),
  }
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
}

export function importBraacketRankings({ csv, existing, playerIds, importedAt = new Date().toISOString() }) {
  return mergeRankings({
    players: parseBraacketCsv(csv),
    existing,
    playerIds,
    importedAt,
  })
}

function main() {
  if (!existsSync(INPUT_PATH)) {
    throw new Error(`Braacket CSV export not found: ${INPUT_PATH}`)
  }

  const output = importBraacketRankings({
    csv: readFileSync(INPUT_PATH, 'utf8'),
    existing: readJson(OUTPUT_PATH, {}),
    playerIds: readJson(PLAYER_IDS_PATH, { league: DEFAULT_LEAGUE, players: {} }),
  })

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`Imported ${output.players.length} Braacket rankings from data/braacket-rankings.csv.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
