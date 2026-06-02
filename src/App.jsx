import { useState, useEffect } from 'react'

const RANK_COLORS = {
  'God of Destruction VI':    'var(--god-6)',
  'God of Destruction V':     'var(--god-5)',
  'God of Destruction IV':    'var(--god-4)',
  'God of Destruction III':   'var(--god-3)',
  'God of Destruction II':    'var(--god-2)',
  'God of Destruction I':     'var(--god-1)',
  'God of Destruction':       'var(--god-base)',
  'Tekken God Supreme':       'var(--tekken-god-supreme)',
  'Tekken God':               'var(--tekken-god)',
}

function getRankColor(rankName) {
  return RANK_COLORS[rankName] ?? 'var(--default-rank)'
}

function formatUpdated(isoString) {
  if (!isoString) return null
  const date = new Date(isoString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPower(power) {
  if (!power) return '—'
  return power.toLocaleString()
}

function PlatformBadge({ platform }) {
  if (!platform) return null
  const key = platform.toLowerCase()
  return <span className={`platform-badge ${key}`}>{platform}</span>
}

export default function App() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/ranks.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load ranks data (${r.status})`)
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return <div className="state-message">Loading ranks...</div>
  }

  if (error) {
    return <div className="state-message">Error: {error}</div>
  }

  const players = data.players ?? []
  const apiCount = players.filter(p => p.source === 'api').length
  const lastUpdated = data.updated_at
    ? new Date(data.updated_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      })
    : 'Unknown'

  return (
    <>
      <header className="header">
        <h1>Louisiana <span>Tekken 8</span> Rank Tracker</h1>
        <div className="header-meta">
          <span>Updated {lastUpdated}</span>
          <span>{apiCount} of {players.length} players live from API</span>
          <a
            href="https://github.com/Esmond-M/la-tekken-rank-tracker/actions/workflows/update-ranks.yml"
            target="_blank"
            rel="noopener noreferrer"
          >
            Trigger manual update ↗
          </a>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{players.length}</span>
          Players tracked
        </div>
        <div className="stat">
          <span className="stat-value">GoD+</span>
          Minimum rank
        </div>
        <div className="stat">
          <span className="stat-value">Daily</span>
          Auto-update
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Rank</th>
              <th>Power</th>
              <th>Character</th>
              <th>Platform</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <tr key={player.tekken_id ?? player.player_tag}>
                <td className={`rank-position ${index < 3 ? 'top-3' : ''}`}>
                  {index + 1}
                </td>
                <td className="player-tag">
                  {player.player_tag}
                  {player.source === 'manual' && (
                    <span className="source-badge" title="Rank from roster, not yet fetched from API">
                      manual
                    </span>
                  )}
                </td>
                <td
                  className="rank-name"
                  style={{ color: getRankColor(player.rank_name) }}
                >
                  {player.rank_name ?? '—'}
                </td>
                <td className="tekken-power">
                  {formatPower(player.tekken_power)}
                </td>
                <td className="character">
                  {player.current_character ?? player.main_character ?? '—'}
                </td>
                <td>
                  <PlatformBadge platform={player.platform} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="footer">
        <p>
          Data sourced from <a href="https://ewgf.gg" target="_blank" rel="noopener noreferrer">ewgf.gg</a>
          {' · '}
          <a href="https://github.com/Esmond-M/la-tekken-rank-tracker" target="_blank" rel="noopener noreferrer">GitHub</a>
          {' · '}
          Not affiliated with Bandai Namco
        </p>
      </footer>
    </>
  )
}
