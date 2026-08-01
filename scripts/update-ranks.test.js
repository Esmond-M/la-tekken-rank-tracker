import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSecondaryCharacters } from './update-ranks.js'

test('uses a configured secondary character override when present', () => {
  const primary = {
    current_character: 'Jin',
    rank_name: 'God of Destruction V',
  }
  const bestPerChar = new Map([
    ['Jin', { current_character: 'Jin', rank_name: 'God of Destruction V' }],
    ['Paul', { current_character: 'Paul', rank_name: 'God of Destruction IV' }],
  ])

  const result = resolveSecondaryCharacters({ secondary_character: 'Paul' }, bestPerChar, primary)

  assert.equal(result.secondary_character, 'Paul')
  assert.equal(result.tertiary_character, null)
})

test('falls back to the ranked auto-secondary list when no override is configured', () => {
  const primary = {
    current_character: 'Jin',
    rank_name: 'God of Destruction V',
  }
  const bestPerChar = new Map([
    ['Jin', { current_character: 'Jin', rank_name: 'God of Destruction V' }],
    ['Paul', { current_character: 'Paul', rank_name: 'God of Destruction IV' }],
    ['Yoshimitsu', { current_character: 'Yoshimitsu', rank_name: 'God of Destruction III' }],
  ])

  const result = resolveSecondaryCharacters({}, bestPerChar, primary)

  assert.equal(result.secondary_character, 'Paul')
  assert.equal(result.tertiary_character, 'Yoshimitsu')
})
