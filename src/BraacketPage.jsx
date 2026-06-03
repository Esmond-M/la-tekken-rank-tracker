import { useState, useEffect } from 'react'

function formatPoints(pts) {
  if (pts == null) return '—'
  return pts.toLocaleString()
}

/**
 * If we don't have an explicit braacket_url (i.e. UUID), fall back to the
 * league search URL. Less direct than a profile link, but works for every
 * player without needing to scrape UUIDs.
 */
function profileUrlFor(player, league) {
  if (player.braacket_url) return player.braacket_url
  if (!league) return null
  return `https://braacket.com/league/${league}/player?name=${encodeURIComponent(player.player_tag)}`
}

/**
 * Normalize a player tag for fuzzy matching across the two data sources.
 * Lowercases, strips ALL non-alphanumeric characters. So:
 *   "DJSymphix" === "DJ Symphix" === "dj_symphix"
 *   "UDG_Tye"   === "UDG_TYE"
 */
function normalizeTag(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Many braacket tags include a team prefix separated by "|", e.g.
 *   "LND| | NK30"  -> last segment is "NK30"
 *   "Dojo337 | Drago" -> last segment is "Drago"
 * Returns an array of normalized candidates to try matching against the
 * roster (in order of preference): full string, then each |-segment.
 */
function matchCandidates(tag) {
  const out = [normalizeTag(tag)]
  if (tag.includes('|')) {
    for (const part of tag.split('|')) {
      const n = normalizeTag(part)
      if (n && !out.includes(n)) out.push(n)
    }
  }
  return out
}

/**
 * Build a lookup table from normalized roster tag -> tekken_id.
 */
function buildRosterIndex(rosterPlayers) {
  const idx = {}
  for (const p of rosterPlayers) {
    if (!p.tekken_id) continue
    const key = normalizeTag(p.player_tag)
    if (!idx[key]) idx[key] = { tekken_id: p.tekken_id, player_tag: p.player_tag }
  }
  return idx
}

function SortIndicator({ active, dir }) {
  if (!active) return <span className="sort-arrow sort-arrow--inactive">↕</span>
  return <span className="sort-arrow">{dir === 'asc' ? '↑' : '↓'}</span>
}

function findEwgfMatch(braacketTag, rosterIndex) {
  // One-off manual aliases for tags that differ too much to fuzzy-match.
  // braacket name (lowercased/stripped) -> ewgf roster name (as-is)
  const MANUAL_ALIASES = {
    drago: 'Dragosiege',
  }
  const aliased = MANUAL_ALIASES[normalizeTag(braacketTag.split('|').pop() || braacketTag)]
  if (aliased && rosterIndex[normalizeTag(aliased)]) {
    return rosterIndex[normalizeTag(aliased)]
  }
  for (const cand of matchCandidates(braacketTag)) {
    if (rosterIndex[cand]) return rosterIndex[cand]
  }
  return null
}

export default function BraacketPage() {
  const [data, setData]       = useState(null)
  const [roster, setRoster]   = useState([]) // ranks.json players (for EWGF cross-linking)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState('rank')
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'points' ? 'desc' : 'asc')
    }
  }

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}data/braacket-rankings.json`).then(r => {
        if (!r.ok) throw new Error(`Failed to load braacket data (${r.status})`)
        return r.json()
      }),
      // ranks.json failure shouldn't block the tab — just means no EWGF links.
      fetch(`${base}data/ranks.json`).then(r => r.ok ? r.json() : { players: [] }).catch(() => ({ players: [] })),
    ])
      .then(([braacket, ranks]) => {
        setData(braacket)
        setRoster(ranks.players ?? [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="state-message">Loading tournament rankings…</div>
  if (error)   return <div className="state-message">Error: {error}</div>

  const allPlayers = data.players ?? []
  const rosterIndex = buildRosterIndex(roster)

  // Compute the point gap to the next-higher-ranked player (rank N-1).
  // Always computed against the FULL list so the gap reflects true ladder
  // position, not whatever the search filter is currently showing.
  const sortedByRank = [...allPlayers].sort((a, b) => a.rank - b.rank)
  const gapByTag = {}
  sortedByRank.forEach((p, i) => {
    if (i === 0) { gapByTag[p.player_tag] = null; return }
    const above = sortedByRank[i - 1]
    gapByTag[p.player_tag] = p.points - above.points // negative number
  })

  const filtered = search.trim()
    ? allPlayers.filter(p =>
        p.player_tag.toLowerCase().includes(search.trim().toLowerCase())
      )
    : allPlayers

  const players = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'points') {
      cmp = (a.points ?? 0) - (b.points ?? 0)
    } else {
      cmp = a.rank - b.rank
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const updatedAt = data.updated_at
    ? new Date(data.updated_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : 'Unknown'

  return (
    <>
      <div className="braacket-meta">
        <div>
          <strong>{data.ranking_name}</strong>
          {data.ranking_period && (
            <span className="braacket-period"> · {data.ranking_period}</span>
          )}
          {data.last_tournament && (
            <div className="braacket-last-tournament">
              Last updated after:{' '}
              <span className="braacket-tournament-name">{data.last_tournament.name}</span>
              {data.last_tournament.date && (
                <span className="braacket-tournament-date">
                  {' '}({new Date(data.last_tournament.date + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })})
                </span>
              )}
            </div>
          )}
        </div>
        <div className="braacket-source">
          Source:{' '}
          <a
            href={`https://braacket.com/league/${data.league}/ranking/${data.ranking_id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            braacket.com/league/LATK8
          </a>
          {' · '}Updated {updatedAt}
        </div>
      </div>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">
            {players.length < allPlayers.length
              ? `${players.length} of ${allPlayers.length}`
              : allPlayers.length}
          </span>
          Players ranked
        </div>
        <div className="stat">
          <span className="stat-value">Glicko</span>
          Rating system
        </div>
        {roster.length > 0 && (
          <div className="stat">
            <span className="stat-value">
              {allPlayers.filter(p => findEwgfMatch(p.player_tag, rosterIndex)).length}
            </span>
            On EWGF tracker
          </div>
        )}
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search player name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" className="clear-btn" onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th
                className={`sortable${sortKey === 'rank' ? ' sort-active' : ''}`}
                onClick={() => handleSort('rank')}
              >
                # <SortIndicator active={sortKey === 'rank'} dir={sortDir} />
              </th>
              <th>Player</th>
              <th>Character</th>
              <th
                className={`sortable${sortKey === 'points' ? ' sort-active' : ''}`}
                onClick={() => handleSort('points')}
              >
                Points <SortIndicator active={sortKey === 'points'} dir={sortDir} />
              </th>
              <th>Gap</th>
              <th>EWGF</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr>
                <td colSpan={6} className="no-results">No players match your search.</td>
              </tr>
            )}
            {players.map(player => {
              const url = profileUrlFor(player, data.league)
              const gap = gapByTag[player.player_tag]
              const ewgf = findEwgfMatch(player.player_tag, rosterIndex)
              return (
                <tr key={player.player_tag}>
                  <td className={`rank-position ${player.rank <= 3 ? 'top-3' : ''}`}>
                    {player.rank}
                  </td>
                  <td className="player-tag">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="player-link"
                        title={player.braacket_url ? 'View profile on braacket.com' : 'Search this player on braacket.com'}
                      >
                        {player.player_tag}
                      </a>
                    ) : (
                      player.player_tag
                    )}
                  </td>
                  <td className="character">
                    {player.character ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="braacket-points">
                    {formatPoints(player.points)}
                  </td>
                  <td className="point-gap">
                    {gap == null ? <span className="point-gap--leader">—</span> : gap}
                  </td>
                  <td className="ewgf-cell">
                    {ewgf ? (
                      <a
                        href={`https://ewgf.gg/player/${ewgf.tekken_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ewgf-link"
                        title={`View ${ewgf.player_tag} on ewgf.gg`}
                      >
                        ↗ ewgf.gg
                      </a>
                    ) : (
                      <span className="ewgf-missing">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
