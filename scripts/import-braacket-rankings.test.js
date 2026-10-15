import test from 'node:test'
import assert from 'node:assert/strict'
import { importBraacketRankings, parseBraacketCsv } from './import-braacket-rankings.js'

test('parses quoted CSV fields and preserves existing manual player fields', () => {
  const output = importBraacketRankings({
    csv: [
      'Rank,Player,Points,Country,Characters',
      '1,"B.I.A | Dohma",1488,"",""',
      '2,"OC | Slump",1735,"US","Paul"',
      '3,"No Saved UUID",1600,"",""',
    ].join('\n'),
    existing: {
      league: 'LATK8',
      ranking_id: 'ranking-id',
      ranking_name: 'Manual Season Name',
      players: [{
        rank: 9,
        player_tag: 'B.I.A | Dohma',
        points: 1305,
        braacket_url: 'https://braacket.com/manual-profile',
        notes: 'Keep this manual field',
      }],
    },
    playerIds: {
      league: 'LATK8',
      players: {
        'OC | Slump': 'player-uuid',
      },
    },
    importedAt: '2026-10-15T00:00:00.000Z',
  })

  assert.equal(output.ranking_name, 'Manual Season Name')
  assert.deepEqual(output.players[0], {
    rank: 1,
    player_tag: 'B.I.A | Dohma',
    points: 1488,
    braacket_url: 'https://braacket.com/manual-profile',
    notes: 'Keep this manual field',
  })
  assert.equal(
    output.players[1].braacket_url,
    'https://braacket.com/league/LATK8/player/player-uuid?ranking=ranking-id'
  )
  assert.equal(output.players[1].country, 'US')
  assert.equal(output.players[1].characters, 'Paul')
  assert.equal(output.players[2].braacket_url, undefined)
})

test('rejects a CSV missing required columns', () => {
  assert.throws(
    () => parseBraacketCsv('Rank,Player\n1,Allocution'),
    /missing required "Points" column/
  )
})
