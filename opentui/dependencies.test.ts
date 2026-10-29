import { expect, test } from 'bun:test'
import { matchesDependency } from './dependencies'

test('a link points only to the exact dependency id', () => {
  expect(matchesDependency('blocked-by:api-service,parent:other', 'api-service')).toBe(true)
  expect(matchesDependency('blocked-by:api-service,parent:other', 'api')).toBe(false)
})
