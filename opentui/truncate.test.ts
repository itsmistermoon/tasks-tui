import { expect, test } from 'bun:test'
import { truncateText } from './truncate'

test('limits titles to two terminal-width lines with ellipsis', () => {
  expect(truncateText('uno dos tres cuatro cinco seis siete', 12, 2)).toBe('uno dos tres\ncuatro cinc…')
  expect(truncateText('corto', 12, 2)).toBe('corto')
})

test('truncates paths to one line and respects wide characters', () => {
  expect(truncateText('ab界界cd', 6, 1)).toBe('ab界…')
  expect(truncateText('a long backlog path', 8, 1)).toBe('a long…')
})
