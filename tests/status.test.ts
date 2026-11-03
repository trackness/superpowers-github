import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, type ItemSpec, repoData, router, url, workData, type World } from './kit.ts'

const edit = (n: number, s: string, board = 1) => `gh project item-edit ${board} --owner trackness --url ${url(n)} --field Status --value ${s}`
const add = (n: number, board = 1) => `gh project item-add ${board} --owner trackness --url ${url(n)}`
const projectCalls = (w: World) => argvs(w).filter(a => a.startsWith('gh project'))

// Answers `Repo` and `Work`; every `gh project` call answers `{}`.
const world = (work: unknown, repo = repoData({})) =>
  router({ graphql: { Repo: () => repo, Work: () => work }, cli: s => (s.argv[1] === 'project' ? {} : undefined) })

// #11 as a task of #10, beside #12.
const task11 = (parent: ItemSpec, tasks: ItemSpec[]) => workData({ issue: tasks.find(t => t.number === 11)!, parent, tasks })

test('the board is the one titled exactly the repo name', async ($, on) => {
  const w = await boot($, on, { reply: world(workData({ issue: { number: 10, status: 'Idea' }, board: 3 }), repoData({ boards: ['demo-old', 'Demo', 'demo'] })) })
  const r = await callTool($, 'status', { issue: url(10), status: 'Designed' })
  expect(r.deny).toBeUndefined()
  expect(argvs(w)).toContain(edit(10, 'Designed', 3))
})

test('status moves a task and recomputes its parent', async ($, on) => {
  const w = await boot($, on, { reply: world(task11({ number: 10, status: 'Todo' }, [{ number: 11, status: 'Todo' }, { number: 12, status: 'Todo' }])) })
  const r = await callTool($, 'status', { issue: url(11), status: 'In Progress' })
  expect(r.deny).toBeUndefined()
  expect(argvs(w)).toContain(edit(11, 'In Progress'))
  expect(argvs(w)).toContain(edit(10, 'In Progress'))
})

test('status leaves the parent alone when its column does not change', async ($, on) => {
  const w = await boot($, on, { reply: world(task11({ number: 10, status: 'In Progress' }, [{ number: 11, status: 'In Progress' }, { number: 12, status: 'Todo' }])) })
  const r = await callTool($, 'status', { issue: url(11), status: 'In Review' })
  expect(r.deny).toBeUndefined()
  expect(projectCalls(w)).toEqual([edit(11, 'In Review')])
})

test('status never writes Done', async ($, on) => {
  const w = await boot($, on, { reply: world(task11({ number: 10, status: 'In Review' }, [{ number: 11, status: 'In Review' }, { number: 12, status: 'In Review' }])) })
  const r = await callTool($, 'status', { issue: url(11), status: 'Done' })
  expect(r.deny).toContain('"Item closed"')
  expect(argvs(w).some(a => a.startsWith('gh project item-edit'))).toBe(false)
})

test('status refuses a direct move of a parent that has tasks', async ($, on) => {
  const w = await boot($, on, { reply: world(workData({ issue: { number: 10, status: 'Todo' }, tasks: [{ number: 11, status: 'Todo' }, { number: 12, status: 'Todo' }] })) })
  const r = await callTool($, 'status', { issue: url(10), status: 'In Progress' })
  expect(r.deny).toContain('derived from its tasks')
  expect(projectCalls(w)).toEqual([])
})

test('status moves a parent with no tasks directly', async ($, on) => {
  const w = await boot($, on, { reply: world(workData({ issue: { number: 10, status: 'Designed' } })) })
  const r = await callTool($, 'status', { issue: url(10), status: 'In Progress' })
  expect(r.deny).toBeUndefined()
  expect(projectCalls(w)).toEqual([edit(10, 'In Progress')])
})

test('status adds an issue that is not on the board before setting it', async ($, on) => {
  const w = await boot($, on, { reply: world(workData({ issue: { number: 10, onBoard: false } })) })
  const r = await callTool($, 'status', { issue: url(10), status: 'Designed' })
  expect(r.deny).toBeUndefined()
  expect(argvs(w)).toContain(add(10))
  expect(argvs(w).indexOf(add(10))).toBeLessThan(argvs(w).indexOf(edit(10, 'Designed')))
})

test('status flags a closed issue that is not in Done', async ($, on) => {
  await boot($, on, { reply: world(task11({ number: 10, status: 'In Review' }, [{ number: 11, status: 'In Review' }, { number: 12, status: 'In Review', closed: true }])) })
  const r = await callTool($, 'status', { issue: url(11) })
  expect(r.text).toContain('#12 is closed but not in Done')
  expect(r.text).toContain('"Item closed"')
})

test('status refuses a repo with no board', async ($, on) => {
  await boot($, on, { reply: world(workData({ issue: { number: 10, status: 'Idea' } }), repoData({ boards: [] })) })
  expect((await callTool($, 'status', { issue: url(10) })).deny).toContain('board_setup')
})

test('status with no status reports the work as links', async ($, on) => {
  const w = await boot($, on, { reply: world(task11({ number: 10, status: 'Todo' }, [{ number: 11, status: 'Todo' }, { number: 12, status: 'Todo' }])) })
  const r = await callTool($, 'status', { issue: url(11) })
  expect(r.text).toContain(`[#11 Task 11: T11](${url(11)}) — Todo`)
  expect(projectCalls(w)).toEqual([])
})
