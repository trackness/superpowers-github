import { expect, test } from 'claude-code/testing'
import { issueCreateTool } from '../../hooks/tools/issue-create'
import { argvs, boot, callTool, DEMO, type Reply, repoData, router, url, workData, type World } from '../kit'

const edit = (n: number, s: string, board = 1) => `gh project item-edit ${board} --owner trackness --url ${url(n)} --field Status --value ${s}`
const add = (n: number, board = 1) => `gh project item-add ${board} --owner trackness --url ${url(n)}`
const creates = (w: World) => w.spawned.filter(s => s.argv[2] === 'create')

// `adds`: the replies to the first `gh project item-add` calls, in order; every later one succeeds.
const world = (o: { repo?: unknown; work?: unknown; fail?: boolean; create?: Reply; list?: Reply; adds?: Reply[] } = {}) =>
  router({
    graphql: { Repo: () => o.repo ?? repoData({}), Work: () => o.work ?? workData({ issue: { number: 10, status: 'Designed' }, tasks: [{ number: 11 }, { number: 12 }] }) },
    cli: s =>
      s.argv[1] === 'issue' ? (s.argv[2] === 'list' ? (o.list ?? { stdout: '[]' }) : (o.create ?? { stdout: url(13) + '\n' }))
      : s.argv[1] === 'project' ? ((s.argv[2] === 'item-add' && o.adds?.shift()) || (o.fail && s.argv[2] === 'item-edit' ? { code: 1, stderr: 'HTTP 502' } : {}))
      : undefined,
  })

const createdThenFailed: Reply = { code: 1, stderr: 'GraphQL: could not add the blocked-by link' }
const listed = (...issues: { n: number; title: string; at: string; body?: string }[]): Reply => ({ stdout: JSON.stringify(issues.map(i => ({ number: i.n, title: i.title, body: i.body ?? 'b', url: url(i.n), createdAt: i.at }))) })
const LIST = 'gh issue list -R trackness/demo --author @me --state open --limit 20 --json number,title,body,url,createdAt'
const OLD = '2020-01-01T00:00:00Z'
const MAY_EXIST = 'gh creates the issue before applying --parent and --blocked-by, so it may already exist: check `gh issue list -R trackness/demo --author @me` before calling again.'

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
  expect(creates(w)[0]).toMatchObject({ argv: ['gh', 'issue', 'create', '-R', 'trackness/demo', '--parent', '10', '--blocked-by', '11,12', '--title', 'Task 3: Store', '--body-file', '-'], input: 'TASK BODY' })
  expect(argvs(w)).toContain(add(13))
  expect(argvs(w)).toContain(edit(13, 'Todo'))
  expect(argvs(w)).toContain(edit(10, 'Todo'))
})

test('issue_create refuses a task title that is not "Task <n>: "', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', { parent: url(10), title: 'Store', body: 'b' })
  expect(r.deny).toContain('Task <n>: ')
  expect(creates(w)).toEqual([])
})

test('issue_create refuses a task given as the parent, and names the parent', async ($, on) => {
  const work = workData({ issue: { number: 11 }, parent: { number: 10, status: 'Todo' }, tasks: [{ number: 11 }, { number: 12 }] })
  const w = await boot($, on, { reply: world({ work }) })
  const r = await callTool($, 'issue_create', { parent: url(11), title: 'Task 3: Store', body: 'b' })
  expect(r.deny).toContain(`is a task of [#10 Task 10: T10](${url(10)}): give the parent issue, ${url(10)}`)
  expect(creates(w)).toEqual([])
})

test("issue_create refuses blockedBy numbers that are not the parent's tasks, before creating anything", async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', { parent: url(10), title: 'Task 3: Store', body: 'b', blockedBy: [11, 2, 0] })
  expect(r.deny).toContain('not task numbers')
  expect(r.deny).toContain(': #2, #0.')
  expect(r.deny).toContain(`[#11 Task 11: T11](${url(11)})`)
  expect(creates(w)).toEqual([])
})

test('blockedBy and addBlockedBy say they take issue numbers, not task numbers', () => {
  const said = 'the issue numbers (the `#n` from `issue_create` or the status listing), not the task numbers'
  expect((issueCreateTool.spec.inputSchema as any).properties.blockedBy.description).toContain(said)
})

test('issue_create puts the new issue on its board by number, never by a title gh matches ignoring case', async ($, on) => {
  const w = await boot($, on, { reply: world({ repo: repoData({ boards: ['Demo', 'demo'] }) }) })
  const r = await callTool($, 'issue_create', idea('b'))
  expect(r.deny).toBeUndefined()
  expect(creates(w)[0]!.argv).not.toContain('--project')
  expect(argvs(w).filter(a => a.startsWith('gh project'))).toEqual([add(13, 2), edit(13, 'Idea', 2)])
})

test('issue_create makes a new piece of work in Designed, and refuses a status other than Idea or Designed', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  expect((await callTool($, 'issue_create', { ...idea('b'), status: 'Designed' })).text).toBe(`Created [#13 Idea](${url(13)}) in Designed.`)
  expect(argvs(w)).toContain(edit(13, 'Designed'))
  expect(argvs(w)).not.toContain(edit(13, 'Idea'))
  expect((await callTool($, 'issue_create', { ...idea('b'), status: 'Todo' })).deny).toContain('status must be Idea or Designed')
  expect(creates(w)).toHaveLength(1)
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

// gh's stderr when GitHub refused the e2e run's first item-add on a board created moments before.
const CONFLICT: Reply = { code: 1, stderr: 'GraphQL: Your attempt to move this item created a temporary conflict. Please try again. (addProjectV2ItemById)' }
const projectCalls = (w: World) => argvs(w).filter(a => a.startsWith('gh project'))

test('issue_create adds the new issue to the board once more when GitHub answers with a temporary conflict', async ($, on) => {
  const w = await boot($, on, { reply: world({ adds: [CONFLICT] }) })
  const r = await callTool($, 'issue_create', idea('b'))
  expect(r.text).toBe(`Created [#13 Idea](${url(13)}) in Idea.`)
  expect(projectCalls(w)).toEqual([add(13), add(13), edit(13, 'Idea')])
})

test('issue_create retries a temporary conflict only once, and then names the created issue', async ($, on) => {
  const w = await boot($, on, { reply: world({ adds: [CONFLICT, CONFLICT] }) })
  const r = await callTool($, 'issue_create', idea('b'))
  expect(r.deny).toContain(`created ${url(13)}, then setting its Status failed`)
  expect(r.deny).toContain('temporary conflict')
  expect(projectCalls(w)).toEqual([add(13), add(13)])
})

test('issue_create does not retry any other failure to add the new issue to the board', async ($, on) => {
  const w = await boot($, on, { reply: world({ adds: [{ code: 1, stderr: 'HTTP 502' }] }) })
  const r = await callTool($, 'issue_create', idea('b'))
  expect(r.deny).toContain(`created ${url(13)}, then setting its Status failed`)
  expect(r.deny).toContain('HTTP 502')
  expect(projectCalls(w)).toEqual([add(13)])
})

test('issue_create names the issue gh created before its own later step failed', async ($, on) => {
  const list = listed({ n: 13, title: 'Task 3: Store', at: new Date().toISOString() }, { n: 12, title: 'Task 3: Store', at: OLD })
  const w = await boot($, on, { reply: world({ create: createdThenFailed, list }) })
  const r = await callTool($, 'issue_create', { parent: url(10), title: 'Task 3: Store', body: 'b', blockedBy: [11] })
  expect(r.deny).toContain(`created ${url(13)}, then gh's own --parent/--blocked-by step failed`)
  expect(r.deny).toContain('could not add the blocked-by link')
  expect(r.deny).toContain('Not retried')
  expect(r.deny).not.toContain(url(12))
  expect(argvs(w)).toContain(LIST)
  expect(creates(w)).toHaveLength(1)
  expect(argvs(w).some(a => a.startsWith('gh project'))).toBe(false)
})

test("issue_create does not name another session's issue with the same title as its own", async ($, on) => {
  const list = listed({ n: 14, title: 'Task 3: Store', at: new Date().toISOString(), body: "another session's task" })
  const w = await boot($, on, { reply: world({ create: createdThenFailed, list }) })
  const r = await callTool($, 'issue_create', { parent: url(10), title: 'Task 3: Store', body: 'b' })
  expect(r.deny).toContain(MAY_EXIST)
  expect(r.deny).not.toContain(url(14))
  expect(creates(w)).toHaveLength(1)
})

test('issue_create warns that a failed create may have made the issue when none matches', async ($, on) => {
  const list = listed({ n: 13, title: 'Other', at: new Date().toISOString() }, { n: 12, title: 'Idea', at: OLD })
  const w = await boot($, on, { reply: world({ create: createdThenFailed, list }) })
  const r = await callTool($, 'issue_create', idea('b'))
  expect(r.deny).toContain('could not add the blocked-by link')
  expect(r.deny).toContain(MAY_EXIST)
  expect(r.deny).not.toContain(url(12))
  expect(r.deny).not.toContain(url(13))
  expect(creates(w)).toHaveLength(1)
})

test('issue_create warns that a failed create may have made the issue when the lookup fails', async ($, on) => {
  const w = await boot($, on, { reply: world({ create: createdThenFailed, list: { code: 1, stderr: 'HTTP 502' } }) })
  const r = await callTool($, 'issue_create', idea('b'))
  expect(r.deny).toContain('could not add the blocked-by link')
  expect(r.deny).toContain(MAY_EXIST)
  expect(argvs(w)).toContain(LIST)
  expect(creates(w)).toHaveLength(1)
})

test('issue_create makes a parent in Idea on the repo board', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_create', { repo: DEMO, title: 'Idea', body: 'b' })
  expect(r.deny).toBeUndefined()
  expect(creates(w)[0]!.argv).toEqual(['gh', 'issue', 'create', '-R', 'trackness/demo', '--title', 'Idea', '--body-file', '-'])
  expect(argvs(w)).toContain(add(13))
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
