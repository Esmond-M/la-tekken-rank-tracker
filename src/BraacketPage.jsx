import { useState, useEffect } from 'react'

function formatPoints(pts) {
  if (pts == null) return '—'
  return pts.toLocaleString()
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
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr>
                <td colSpan={4} className="no-results">No players match your search.</td>
              </tr>
            )}
            {players.map(player => (
              <tr key={player.player_tag}>
                <td className={`rank-position ${player.rank <= 3 ? 'top-3' : ''}`}>
                  {player.rank}
                </td>
                <td className="player-tag">
                  {player.braacket_url ? (
                    <a
                      href={player.braacket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="player-link"
                    >
                      {player.player_tag}
                    </a>
                  ) : (
                    player.player_tag
                  )}
                </td>                <td className="character">
                  {player.character ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>                <td className="braacket-points">
                  {formatPoints(player.points)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
