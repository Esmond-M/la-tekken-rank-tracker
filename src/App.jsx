import { useState, useEffect, useCallback } from 'react'
import BraacketPage from './BraacketPage.jsx'
import PlayerCard from './PlayerCard.jsx'

// Shared tag normalizer (matches BraacketPage's logic): lowercase, strip
// everything that isn't a-z0-9. Used to cross-link an EWGF player to a
// braacket entry when the user clicks a player name.
function normalizeTag(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Manual aliases for tags that don't fuzzy-match across the two sources.
// Keep in sync with BraacketPage.jsx.
const MANUAL_ALIASES = {
  drago: 'Dragosiege',
}

function findBraacketMatch(ewgfTag, braacketPlayers) {
  if (!braacketPlayers || braacketPlayers.length === 0) return null
  const target = normalizeTag(ewgfTag)
  for (const b of braacketPlayers) {
    if (normalizeTag(b.player_tag) === target) return b
    // Match against |-segments of the braacket tag too ("Dojo337 | Drago").
    if (b.player_tag.includes('|')) {
      for (const part of b.player_tag.split('|')) {
        if (normalizeTag(part) === target) return b
      }
    }
  }
  // Reverse-alias: ewgf "Dragosiege" -> braacket "Drago"
  for (const [aliasKey, ewgfName] of Object.entries(MANUAL_ALIASES)) {
    if (normalizeTag(ewgfName) === target) {
      const match = braacketPlayers.find(b => {
        const last = b.player_tag.split('|').pop() || b.player_tag
        return normalizeTag(last) === aliasKey
      })
      if (match) return match
    }
  }
  return null
}


const RANK_COLORS = {
  'God of Destruction VIII':  'var(--god-8)',
  'God of Destruction VII':   'var(--god-7)',
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

const RANK_TIER_ORDER = [
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

function rankTierValue(rankName) {
  const idx = RANK_TIER_ORDER.indexOf(rankName)
  return idx === -1 ? RANK_TIER_ORDER.length : idx
}

function getRankColor(rankName) {
  return RANK_COLORS[rankName] ?? 'var(--default-rank)'
}

// Rank name → ewgf.gg rank icon slug
const RANK_ICON_SLUG = {
  'God of Destruction VIII': 'GodOfDestruction8',
  'God of Destruction VII':  'GodOfDestruction7',
  'God of Destruction VI':   'GodOfDestruction6',
  'God of Destruction V':    'GodOfDestruction5',
  'God of Destruction IV':   'GodOfDestruction4',
  'God of Destruction III':  'GodOfDestruction3',
  'God of Destruction II':   'GodOfDestruction2',
  'God of Destruction I':    'GodOfDestruction1',
  'God of Destruction':      'GodOfDestruction',
  'Tekken God Supreme':      'TekkenGodSupreme',
  'Tekken God':              'TekkenGod',
  'Tekken King':             'TekkenKing',
  'Tekken Emperor':          'TekkenEmperor',
  'Bushin':                  'Bushin',
  'Kishin':                  'Kishin',
  'Raijin':                  'Raijin',
  'Fujin':                   'Fujin',
}

function rankIconURL(rankName) {
  const slug = RANK_ICON_SLUG[rankName]
  if (!slug) return null
  return `https://ewgf.gg/static/rank-icons/${slug}T8.webp`
}

function formatPower(power) {
  if (!power) return '—'
  return power.toLocaleString()
}

function formatRelativeTime(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMs = Date.now() - then
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

// Character name → ewgf.gg icon slug
const CHAR_SLUG_OVERRIDES = {
  'Jack 8':    'Jack-8',
  'Armor King': 'ArmorKing',
  'Fahkumram': 'Fahkumram',
}

function charImageURL(name) {
  if (!name) return null
  const slug = CHAR_SLUG_OVERRIDES[name]
    ?? name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return `https://ewgf.gg/static/character-icons/${slug}T8.webp`
}

function PlatformBadge({ platform }) {
  if (!platform) return null
  const key = platform.toLowerCase()
  return <span className={`platform-badge ${key}`}>{platform}</span>
}

function SortIndicator({ active, dir }) {
  if (!active) return <span className="sort-arrow sort-arrow--inactive">↕</span>
  return <span className="sort-arrow">{dir === 'asc' ? '↑' : '↓'}</span>
}

// URL <-> view sync. Uses ?tab=tournament for the Braacket tab; default tab
// has no query param so the canonical URL stays clean.
function viewFromUrl() {
  if (typeof window === 'undefined') return 'ranked'
  const tab = new URLSearchParams(window.location.search).get('tab')
  return tab === 'tournament' ? 'braacket' : 'ranked'
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollUp = useCallback(() => window.scrollTo({ top: 0, behavior: 'smooth' }), [])

  if (!visible) return null
  return (
    <button type="button" className="scroll-to-top" onClick={scrollUp} aria-label="Back to top">
      ↑
    </button>
  )
}

export default function App() {
  const [view, setView] = useState(viewFromUrl) // 'ranked' | 'braacket'

  // Keep URL in sync with view (and respond to back/forward navigation).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (view === 'braacket') params.set('tab', 'tournament')
    else params.delete('tab')
    const qs = params.toString()
    const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
    if (newUrl !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, '', newUrl)
    }
  }, [view])

  useEffect(() => {
    const onPop = () => setView(viewFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sortKey, setSortKey] = useState('rank')
  const [sortDir, setSortDir] = useState('asc')
  const [search, setSearch] = useState('')
  const [characterFilter, setCharacterFilter] = useState('all')
  // Tick every minute so the relative "Updated X ago" string stays fresh.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  // Tournament data — fetched once at the App level so both tabs and the
  // shared PlayerCard modal can use it without re-fetching.
  const [braacketPlayers, setBraacketPlayers] = useState([])
  // Currently-open player card: { tag, ewgf, braacket } or null.
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  function openPlayerByEwgf(ewgfPlayer) {
    setSelectedPlayer({
      tag: ewgfPlayer.player_tag,
      ewgf: ewgfPlayer,
      braacket: findBraacketMatch(ewgfPlayer.player_tag, braacketPlayers),
    })
  }

  function openPlayerByBraacket(braacketPlayer, ewgfRosterPlayer) {
    // ewgfRosterPlayer is the matched ranks.json entry (from BraacketPage's
    // own roster lookup). May be null if the player isn't on EWGF.
    setSelectedPlayer({
      tag: braacketPlayer.player_tag,
      ewgf: ewgfRosterPlayer ?? null,
      braacket: braacketPlayer,
    })
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'power' || key === 'lastseen' ? 'desc' : 'asc')
    }
  }

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/ranks.json`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load ranks data (${r.status})`)
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Load tournament data once. Failure is non-fatal — the Online Ranks tab
  // still works, and player cards just won't have a tournament side.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/braacket-rankings.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.players) setBraacketPlayers(d.players) })
      .catch(() => { /* ignore */ })
  }, [])

  if (loading) {
    return <div className="state-message">Loading ranks...</div>
  }

  if (error) {
    return <div className="state-message">Error: {error}</div>
  }

  const allPlayers = data.players ?? []

  // Unique character list for the filter dropdown (sorted alphabetically)
  const characters = [...new Set(
    allPlayers
      .map(p => p.current_character ?? p.main_character)
      .filter(Boolean)
  )].sort()

  const filtered = allPlayers.filter(p => {
    if (characterFilter !== 'all') {
      const char = p.current_character ?? p.main_character
      if (char !== characterFilter) return false
    }
    if (search.trim()) {
      return p.player_tag.toLowerCase().includes(search.trim().toLowerCase())
    }
    return true
  })

  const players = [...filtered].sort((a, b) => {
    if (sortKey === 'player') {
      const cmp = a.player_tag.localeCompare(b.player_tag)
      return sortDir === 'asc' ? cmp : -cmp
    }
    if (sortKey === 'rank') {
      const tierDiff = rankTierValue(a.rank_name) - rankTierValue(b.rank_name)
      if (tierDiff !== 0) return sortDir === 'asc' ? tierDiff : -tierDiff
      return (b.tekken_power ?? 0) - (a.tekken_power ?? 0)
    }
    if (sortKey === 'power') {
      const cmp = (a.tekken_power ?? 0) - (b.tekken_power ?? 0)
      return sortDir === 'asc' ? cmp : -cmp
    }
    if (sortKey === 'lastseen') {
      const aT = new Date(a.last_seen ?? a.last_updated ?? 0).getTime()
      const bT = new Date(b.last_seen ?? b.last_updated ?? 0).getTime()
      const cmp = aT - bT
      return sortDir === 'asc' ? cmp : -cmp
    }
    return 0
  })
  const lastUpdated = data.updated_at
    ? new Date(data.updated_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      })
    : null
  const lastUpdatedRelative = data.updated_at ? formatRelativeTime(data.updated_at) : 'Unknown'

  return (
    <>
      <header className="header">
        <h1>Louisiana <span>Tekken 8</span> Rank Tracker</h1>
        <p className="header-sub">
          Updated <span title={lastUpdated ?? undefined}>{lastUpdatedRelative}</span> &bull; {allPlayers.length} players tracked
        </p>
        <div className="header-social">
          <a href="http://twitch.tv/LAFGCTV" target="_blank" rel="noopener noreferrer" className="header-social-link" aria-label="LAFGC Twitch"><i className="bi bi-twitch"></i></a>
          <a href="https://www.youtube.com/channel/UCf9AM0hj8NhyBEYTOYWoWsg/featured" target="_blank" rel="noopener noreferrer" className="header-social-link" aria-label="LAFGC YouTube"><i className="bi bi-youtube"></i></a>
          <a href="https://twitter.com/LAFGCTV" target="_blank" rel="noopener noreferrer" className="header-social-link" aria-label="LAFGC Twitter"><i className="bi bi-twitter-x"></i></a>
          <a href="https://discord.gg/mkn9WJaGhu" target="_blank" rel="noopener noreferrer" className="header-social-link" aria-label="LAFGC Discord"><i className="bi bi-discord"></i></a>
          <a href="https://www.facebook.com/groups/LouisianaFGC/" target="_blank" rel="noopener noreferrer" className="header-social-link" aria-label="LAFGC Facebook"><i className="bi bi-facebook"></i></a>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          type="button"
          className={`tab-btn${view === 'ranked' ? ' active' : ''}`}
          onClick={() => setView('ranked')}
        >
          Online Ranks
        </button>
        <button
          type="button"
          className={`tab-btn${view === 'braacket' ? ' active' : ''}`}
          onClick={() => setView('braacket')}
        >
          Tournament Rankings
        </button>
      </nav>

      {view === 'braacket' ? <BraacketPage onOpenPlayer={openPlayerByBraacket} /> : (<>
      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">
            {filtered.length < allPlayers.length
              ? `${filtered.length} of ${allPlayers.length}`
              : allPlayers.length}
          </span>
          {filtered.length < allPlayers.length ? 'Players showing' : 'Players tracked'}
        </div>
      </div>

      <div className="filters">
        <div className="search-wrap">
          <i className="bi bi-search search-icon" aria-hidden="true"></i>
          <input
            type="text"
            placeholder="Search player name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={characterFilter}
          onChange={e => setCharacterFilter(e.target.value)}
        >
          <option value="all">All characters</option>
          {characters.map(char => (
            <option key={char} value={char}>{char}</option>
          ))}
        </select>
        {(search || characterFilter !== 'all') && (
          <button
            type="button"
            className="clear-btn"
            onClick={() => { setSearch(''); setCharacterFilter('all') }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table data-sort={sortKey}>
          <thead>
            <tr>
              <th>#</th>
              <th
                className={`sortable${sortKey === 'player' ? ' sort-active' : ''}`}
                onClick={() => handleSort('player')}
              >
                Player <SortIndicator active={sortKey === 'player'} dir={sortDir} />
              </th>
              <th
                className={`sortable${sortKey === 'rank' ? ' sort-active' : ''}`}
                onClick={() => handleSort('rank')}
              >
                Rank <SortIndicator active={sortKey === 'rank'} dir={sortDir} />
              </th>
              <th
                className={`sortable${sortKey === 'power' ? ' sort-active' : ''}`}
                onClick={() => handleSort('power')}
              >
                Power <SortIndicator active={sortKey === 'power'} dir={sortDir} />
              </th>
              <th>Character</th>
              <th>Platform</th>
              <th
                className={`sortable${sortKey === 'lastseen' ? ' sort-active' : ''}`}
                onClick={() => handleSort('lastseen')}
              >
                Last Seen <SortIndicator active={sortKey === 'lastseen'} dir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr>
                <td colSpan={7} className="no-results">
                  <i className="bi bi-search" aria-hidden="true" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem', opacity: 0.4 }}></i>
                  No players match your filters.
                  <button
                    type="button"
                    className="no-results-clear"
                    onClick={() => { setSearch(''); setCharacterFilter('all') }}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            )}
            {players.map((player, index) => (
              <tr key={player.tekken_id ?? player.player_tag}>
                <td className={`rank-position${index === 0 ? ' top-3 pos-1' : index === 1 ? ' top-3 pos-2' : index === 2 ? ' top-3 pos-3' : ''}`}>
                  {index + 1}
                </td>
                <td className="player-tag">
                  <button
                    type="button"
                    className="player-link player-link--button"
                    onClick={() => openPlayerByEwgf(player)}
                  >
                    {player.player_tag}
                  </button>
                  {player.tekken_id && (
                    <a
                      href={`https://ewgf.gg/player/${player.tekken_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="player-ext-link"
                      aria-label={`${player.player_tag} on ewgf.gg`}
                      onClick={e => e.stopPropagation()}
                    >
                      <i className="bi bi-box-arrow-up-right" aria-hidden="true"></i>
                    </a>
                  )}
                </td>
                <td
                  className="rank-name"
                  style={{ color: getRankColor(player.rank_name) }}
                >
                  {(() => {
                    const icon = rankIconURL(player.rank_name)
                    return icon
                      ? <img className="rank-icon" src={icon} alt={player.rank_name ?? ''} title={player.rank_name ?? ''} onError={e => { e.target.style.display = 'none' }} />
                      : (player.rank_name ?? '—')
                  })()}
                </td>
                <td className="tekken-power">
                  {formatPower(player.tekken_power)}
                </td>
                <td className="character">
                  {(() => {
                    const char = player.current_character ?? player.main_character
                    const imgUrl = charImageURL(char)
                    return (
                      <button
                        type="button"
                        className={`char-filter-btn${char === characterFilter ? ' char-filter-btn--active' : ''}`}
                        onClick={() => setCharacterFilter(char === characterFilter ? 'all' : char)}
                        title={char ? (char === characterFilter ? `Clear ${char} filter` : `Filter by ${char}`) : undefined}
                      >
                        {imgUrl && (
                          <img
                            className="char-img"
                            src={imgUrl}
                            alt={char}
                            onError={e => { e.target.style.display = 'none' }}
                          />
                        )}
                        {char ?? '—'}
                      </button>
                    )
                  })()}
                  {player.secondary_character && (
                    <span className="secondary-char"> / {player.secondary_character}</span>
                  )}
                </td>
                <td className="platform-cell">
                  <PlatformBadge platform={player.platform} />
                </td>
                <td className="last-seen">
                  {formatRelativeTime(player.last_seen ?? player.last_updated)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="footer">
        <p className="footer-community-name">Louisiana FGC Community</p>
        <div className="footer-links">
          <a href="http://twitch.tv/LAFGCTV" target="_blank" rel="noopener noreferrer" className="footer-link" aria-label="LAFGC Twitch"><i className="bi bi-twitch"></i></a>
          <a href="https://www.youtube.com/channel/UCf9AM0hj8NhyBEYTOYWoWsg/featured" target="_blank" rel="noopener noreferrer" className="footer-link" aria-label="LAFGC YouTube"><i className="bi bi-youtube"></i></a>
          <a href="https://twitter.com/LAFGCTV" target="_blank" rel="noopener noreferrer" className="footer-link" aria-label="LAFGC Twitter"><i className="bi bi-twitter-x"></i></a>
          <a href="https://discord.gg/mkn9WJaGhu" target="_blank" rel="noopener noreferrer" className="footer-link" aria-label="LAFGC Discord"><i className="bi bi-discord"></i></a>
          <a href="https://www.facebook.com/groups/LouisianaFGC/" target="_blank" rel="noopener noreferrer" className="footer-link" aria-label="LAFGC Facebook"><i className="bi bi-facebook"></i></a>
        </div>
        <div className="footer-divider"></div>
        <p className="footer-contact">Issues? Contact <span className="footer-handle">@Sneak47</span></p>
        <div className="footer-links">
          <a href="https://discord.com/users/SolidSneak47" target="_blank" rel="noopener noreferrer" className="footer-link" aria-label="Sneak47 Discord"><i className="bi bi-discord"></i></a>
          <a href="https://twitter.com/SolidSneak47" target="_blank" rel="noopener noreferrer" className="footer-link" aria-label="Sneak47 Twitter"><i className="bi bi-twitter-x"></i></a>
        </div>
      </footer>
      </>)}

      {selectedPlayer && (
        <PlayerCard
          tag={selectedPlayer.tag}
          ewgf={selectedPlayer.ewgf}
          braacket={selectedPlayer.braacket}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <ScrollToTop />
    </>
  )
}
