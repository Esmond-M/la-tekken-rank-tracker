import { useEffect } from 'react'

function formatPower(p) {
  if (p == null) return '—'
  return p.toLocaleString()
}

function formatPoints(p) {
  if (p == null) return '—'
  return p.toLocaleString()
}

function formatDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

/**
 * Modal showing a player's data across both data sources side-by-side.
 * Props:
 *   - tag (display tag, usually the one the user clicked)
 *   - ewgf  (player object from ranks.json, or null)
 *   - braacket (player object from braacket-rankings.json, or null)
 *   - onClose
 */
export default function PlayerCard({ tag, ewgf, braacket, onClose }) {
  // Close on Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lock background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="player-card-backdrop" onClick={onClose}>
      <div
        className="player-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Player details for ${tag}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className="player-card-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <h2 className="player-card-title">{tag}</h2>

        <div className="player-card-grid">
          <section className="player-card-section">
            <header>
              <h3>Online Rank</h3>
              <span className="player-card-source">ewgf.gg</span>
            </header>
            {ewgf ? (
              <dl>
                <div><dt>Rank</dt><dd>{ewgf.rank_name ?? '—'}</dd></div>
                <div><dt>Power</dt><dd>{formatPower(ewgf.tekken_power)}</dd></div>
                <div><dt>Character</dt><dd>
                  {ewgf.current_character ?? ewgf.main_character ?? '—'}
                  {ewgf.secondary_character && (
                    <span className="secondary-char"> / {ewgf.secondary_character}</span>
                  )}
                </dd></div>
                <div><dt>Platform</dt><dd>{ewgf.platform ?? '—'}</dd></div>
                <div><dt>Last Seen</dt><dd>{formatDate(ewgf.last_seen ?? ewgf.last_updated)}</dd></div>
                {ewgf.tekken_id && (
                  <div><dt></dt><dd>
                    <a
                      href={`https://ewgf.gg/player/${ewgf.tekken_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="player-link"
                    >
                      View on ewgf.gg ↗
                    </a>
                  </dd></div>
                )}
              </dl>
            ) : (
              <p className="player-card-empty">Not tracked on EWGF.</p>
            )}
          </section>

          <section className="player-card-section">
            <header>
              <h3>Tournament</h3>
              <span className="player-card-source">braacket.com / LATK8</span>
            </header>
            {braacket ? (
              <dl>
                <div><dt>Rank</dt><dd>#{braacket.rank}</dd></div>
                <div><dt>Points</dt><dd>{formatPoints(braacket.points)}</dd></div>
                <div><dt>Character</dt><dd>{braacket.character ?? '—'}</dd></div>
                {braacket.braacket_url && (
                  <div><dt></dt><dd>
                    <a
                      href={braacket.braacket_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="player-link"
                    >
                      View on braacket.com ↗
                    </a>
                  </dd></div>
                )}
              </dl>
            ) : (
              <p className="player-card-empty">No tournament data.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
