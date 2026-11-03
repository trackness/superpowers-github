import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, DEMO, repoData, router, url, workData, type World } from './kit.ts'

const edit = (n: number, s: string) => `gh project item-edit 1 --owner trackness --url ${url(n)} --field Status --value ${s}`
const creates = (w: World) => w.spawned.filter(s => s.argv[2] === 'create')

// Answers `Repo` and `Work` (#10, Designed, no tasks); `gh issue create` answers #13; other `gh project` calls answer `{}`.
const world = (o: { repo?: unknown; fail?: boolean } = {}) =>
  router({
    graphql: { Repo: () => o.repo ?? repoData({}), Work: () => workData({ issue: { number: 10, status: 'Designed' } }) },
    cli: s =>
      s.argv[1] === 'issue' ? { stdout: url(13) + '\n' }
      : s.argv[1] === 'project' ? (o.fail && s.argv[2] === 'item-edit' ? { code: 1, stderr: 'HTTP 502' } : {})
      : undefined,
  })

const idea = (body: string) => ({ repo: DEMO, title: 'Idea', body })

test('issue_create refuses a body over 65,536 characters before touching GitHub', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', idea('x'.repeat(65_537)))
  expect(r.deny).toContain('65537')
  expect(r.deny).toContain('65,536')
  expect(argvs(w).some(a => a.startsWith('gh issue create'))).toBe(false)
  expect(w.spawned).toEqual([])
})

test('issue_create takes a body of exactly 65,536 characters', async ($, on) => {
  await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', idea('x'.repeat(65_536)))
  expect(r.deny).toBeUndefined()
  expect(r.text).toContain(url(13))
})

test('issue_create counts characters, not UTF-16 units', async ($, on) => {
  await boot($, on, { reply: world() })
  const ok = await callTool($, 'issue_create', idea('😀'.repeat(65_536)))
  expect(ok.deny).toBeUndefined()
  expect(ok.text).toContain(url(13))
  expect((await callTool($, 'issue_create', idea('😀'.repeat(65_537)))).deny).toContain('65537')
})

test('issue_create makes a task sub-issue with its blockers, on the board, in Todo', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', { parent: url(10), title: 'Task 3: Store', body: 'TASK BODY', blockedBy: [11, 12] })
  expect(r.deny).toBeUndefined()
  expect(creates(w)[0]).toMatchObject({ argv: ['gh', 'issue', 'create', '-R', 'trackness/demo', '--parent', '10', '--blocked-by', '11,12', '--project', 'demo', '--title', 'Task 3: Store', '--body-file', '-'], input: 'TASK BODY' })
  expect(argvs(w)).toContain(edit(13, 'Todo'))
  expect(argvs(w)).toContain(edit(10, 'Todo'))
})

test('issue_create refuses a task title that is not "Task <n>: "', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', { parent: url(10), title: 'Store', body: 'b' })
  expect(r.deny).toContain('Task <n>: ')
  expect(creates(w)).toEqual([])
})

test('issue_create reports the created issue when a later step fails', async ($, on) => {
  const w = await boot($, on, { reply: world({ fail: true }) })
  const r = await callTool($, 'issue_create', { parent: url(10), title: 'Task 3: Store', body: 'b' })
  expect(r.deny).toContain(url(13))
  expect(r.deny).toContain('item-edit')
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain('Not retried')
  expect(creates(w)).toHaveLength(1)
})

test('issue_create makes a parent in Idea on the repo board', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', { repo: DEMO, title: 'Idea', body: 'b' })
  expect(r.deny).toBeUndefined()
  expect(creates(w)[0]!.argv).toEqual(['gh', 'issue', 'create', '-R', 'trackness/demo', '--project', 'demo', '--title', 'Idea', '--body-file', '-'])
  expect(argvs(w)).toContain(edit(13, 'Idea'))
})

test('issue_create refuses to write to the ideas repo when it is public', async ($, on) => {
  const w = await boot($, on, { reply: world({ repo: repoData({ repo: 'trackness/ideas', isPrivate: false }) }) })
  const r = await callTool($, 'issue_create', { repo: 'trackness/ideas', title: 'Idea', body: 'b' })
  expect(r.deny).toContain('must stay private')
  expect(creates(w)).toEqual([])
})

test('issue_create refuses a repo with no board', async ($, on) => {
  const w = await boot($, on, { reply: world({ repo: repoData({ boards: [] }) }) })
  const r = await callTool($, 'issue_create', idea('b'))
  expect(r.deny).toContain('board_setup')
  expect(creates(w)).toEqual([])
})
