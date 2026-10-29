import { test, expect } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openLink, resolveLink } from './links'

test('missing local report is reported without launching an opener', async () => {
  const dir=await mkdtemp(join(tmpdir(),'tasks-link-'))
  const source=join(dir,'data','backlog.md')
  expect(resolveLink('data/report.md',source)).toBe(join(dir,'data','report.md'))
  expect(resolveLink('data/report.md',join(dir,'backlog.md'))).toBe(join(dir,'data','report.md'))
  expect(await openLink('data/missing.md',source, '/this/opener/must/not/run')).toContain('File not found:')
})

test('opener errors are captured and returned', async () => {
  const dir=await mkdtemp(join(tmpdir(),'tasks-link-'))
  const report=join(dir,'report.md'); await writeFile(report,'report')
  const opener=join(dir,'opener');await writeFile(opener,'#!/bin/sh\necho opener-failed >&2\nexit 7\n',{mode:0o755})
  expect(await openLink(report,join(dir,'backlog.md'),opener)).toBe('Unable to open: opener-failed')
})
