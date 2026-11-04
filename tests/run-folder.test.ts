import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, router, url, type Reply } from './kit.ts'

const DIR = '/work/repo/.superpowers/sdd/12'
const IGNORE = '/work/repo/.superpowers/sdd/.gitignore'
const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

// git as review_package meets it for BASE abc, HEAD HEAD; `over` changes one answer.
const review = (over: Record<string, Reply> = {}) => {
  const git: Record<string, Reply> = {
    'git rev-parse --show-toplevel': { stdout: '/work/repo\n' },
    [`mkdir -p ${DIR}`]: {},
    'git rev-parse --verify --quiet abc^{commit}': { stdout: `${A}\n` },
    'git rev-parse --verify --quiet HEAD^{commit}': { stdout: `${B}\n` },
    [`git merge-base --is-ancestor ${A} ${B}`]: { code: 0 },
    [`git rev-list --count ${A}..${B}`]: { stdout: '1\n' },
    [`git log --oneline ${A}..${B}`]: { stdout: 'bbbbbbb feat: x\n' },
    [`git diff --stat ${A}..${B}`]: { stdout: ' x.ts | 1 +\n' },
    [`git diff -U10 ${A}..${B}`]: { stdout: 'diff --git a/x.ts b/x.ts\n' },
    ...over,
  }
  return router({ cli: s => git[s.argv.join(' ')] })
}
const RANGE = { parent: url(12), base: 'abc', head: 'HEAD' }

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

test('review_package writes the commit list, stat and diff for the range', async ($, on) => {
  const w = await boot($, on, { reply: review() })
  const r = await callTool($, 'review_package', RANGE)
  expect(w.written['/work/repo/.superpowers/sdd/12/review-aaaaaaa..bbbbbbb.diff']).toBe('# Review package: abc..HEAD\n\n## Commits\nbbbbbbb feat: x\n\n## Files changed\n x.ts | 1 +\n\n## Diff\ndiff --git a/x.ts b/x.ts\n')
  expect(r.text).toMatch(/^wrote \/work\/repo\/\.superpowers\/sdd\/12\/review-aaaaaaa\.\.bbbbbbb\.diff: 1 commit\(s\), \d+ bytes$/)
})

test('review_package refuses a HEAD that does not descend from BASE', async ($, on) => {
  const w = await boot($, on, { reply: review({ [`git merge-base --is-ancestor ${A} ${B}`]: { code: 1 } }) })
  expect((await callTool($, 'review_package', RANGE)).deny).toBe('HEAD is not a descendant of BASE: abc..HEAD')
  expect(Object.keys(w.written)).toEqual([IGNORE])
})

test('review_package refuses an empty range', async ($, on) => {
  const w = await boot($, on, { reply: review({ [`git rev-list --count ${A}..${B}`]: { stdout: '0\n' } }) })
  expect((await callTool($, 'review_package', RANGE)).deny).toBe('empty commit range: abc..HEAD')
  expect(Object.keys(w.written)).toEqual([IGNORE])
})

test('review_package refuses a ref that names no commit', async ($, on) => {
  await boot($, on, { reply: review({ 'git rev-parse --verify --quiet abc^{commit}': { code: 1 } }) })
  expect((await callTool($, 'review_package', RANGE)).deny).toBe('bad BASE: abc')
})

test('a review package over 4 MiB is refused by the write, and the refusal reaches the model', async ($, on) => {
  const w = await boot($, on, { reply: review({ [`git diff -U10 ${A}..${B}`]: { stdout: 'x'.repeat(4 * 1024 * 1024) } }) })
  const r = await callTool($, 'review_package', RANGE)
  expect(r.deny).toContain('review-aaaaaaa..bbbbbbb.diff refused')
  expect(r.deny).toContain('over the 4194304-byte limit')
  expect(Object.keys(w.written)).toEqual([IGNORE])
})
