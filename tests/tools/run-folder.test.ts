import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, DIR, IGNORE, router, url } from '../kit'

test('run_folder creates the self-ignoring run folder keyed by the parent number', async ($, on) => {
  const w = await boot($, on, { reply: router({ cli: s => s.argv[1] === 'rev-parse' ? { stdout: '/work/repo\n' } : s.argv[0] === 'mkdir' ? {} : undefined }) })
  const r = await callTool($, 'run_folder', { parent: url(12) })
  expect(r.text).toBe('/work/repo/.superpowers/sdd/12')
  expect(argvs(w)).toContain('mkdir -p /work/repo/.superpowers/sdd/12')
  expect(w.written['/work/repo/.superpowers/sdd/.gitignore']).toBe('*\n')
})

test('run_folder leaves an existing .gitignore alone', async ($, on) => {
  const w = await boot($, on, {
    reply: router({ cli: s => s.argv[1] === 'rev-parse' ? { stdout: '/work/repo\n' } : s.argv[0] === 'mkdir' ? {} : undefined }),
    files: { [IGNORE]: 'custom\n' },
  })
  const r = await callTool($, 'run_folder', { parent: url(12) })
  expect(r.text).toBe(DIR)
  expect(w.written).toEqual({})
})

test('run_folder refuses a parent from another repo than the checkout, ignoring case', async ($, on) => {
  let here = 'trackness/site'
  const w = await boot($, on, {
    reply: router({ cli: s => (s.argv.join(' ') === 'gh repo view --json nameWithOwner --jq .nameWithOwner' ? { stdout: `${here}\n` } : s.argv[1] === 'rev-parse' ? { stdout: '/work/repo\n' } : s.argv[0] === 'mkdir' ? {} : undefined) }),
  })
  const r = await callTool($, 'run_folder', { parent: url(12) })
  expect(r.deny).toBe(`The parent ${url(12)} is in trackness/demo, but this checkout is trackness/site: its run folder and commits would land in trackness/site. Work from a checkout of trackness/demo.`)
  expect(argvs(w).filter(a => a.startsWith('mkdir'))).toEqual([])
  expect(w.written).toEqual({})
  here = 'Trackness/Demo'
  expect((await callTool($, 'run_folder', { parent: url(12) })).text).toBe(DIR)
})
