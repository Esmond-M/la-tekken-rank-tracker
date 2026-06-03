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

export default function BraacketPage() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/braacket-rankings.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load braacket data (${r.status})`)
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div className="state-message">Loading tournament rankings…</div>
  if (error)   return <div className="state-message">Error: {error}</div>

  const allPlayers = data.players ?? []

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

  const players = search.trim()
    ? allPlayers.filter(p =>
        p.player_tag.toLowerCase().includes(search.trim().toLowerCase())
      )
    : allPlayers

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
              <th>#</th>
              <th>Player</th>
              <th>Character</th>
              <th>Points</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr>
                <td colSpan={5} className="no-results">No players match your search.</td>
              </tr>
            )}
            {players.map(player => {
              const url = profileUrlFor(player, data.league)
              const gap = gapByTag[player.player_tag]
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
