import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, type ItemSpec, repoData, router, url, workData, type World } from '../kit'

const edit = (n: number, s: string, board = 1) => `gh project item-edit ${board} --owner trackness --url ${url(n)} --field Status --value ${s}`
const add = (n: number, board = 1) => `gh project item-add ${board} --owner trackness --url ${url(n)}`
const projectCalls = (w: World) => argvs(w).filter(a => a.startsWith('gh project'))

const world = (work: unknown, repo = repoData({})) =>
  router({ graphql: { Repo: () => repo, Work: typeof work === 'function' ? () => work() : () => work }, cli: s => (s.argv[1] === 'project' ? {} : undefined) })

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

test('status derives the parent from a read made after its own move', async ($, on) => {
  // Another session moves #12 to In Review between this call's first read and its write.
  const before = task11({ number: 10, status: 'In Progress' }, [{ number: 11, status: 'In Progress' }, { number: 12, status: 'In Progress' }])
  const after = task11({ number: 10, status: 'In Progress' }, [{ number: 11, status: 'In Review' }, { number: 12, status: 'In Review' }])
  let reads = 0
  const w = await boot($, on, { reply: world(() => (reads++ ? after : before)) })
  const r = await callTool($, 'status', { issue: url(11), status: 'In Review' })
  expect(r.deny).toBeUndefined()
  expect(projectCalls(w)).toEqual([edit(11, 'In Review'), edit(10, 'In Review')])
})

test('status refuses to move a task to Idea or Designed', async ($, on) => {
  const w = await boot($, on, { reply: world(task11({ number: 10, status: 'Todo' }, [{ number: 11, status: 'Todo' }, { number: 12, status: 'Todo' }])) })
  for (const status of ['Idea', 'Designed']) expect((await callTool($, 'status', { issue: url(11), status })).deny).toContain('never in Idea or Designed')
  expect(projectCalls(w)).toEqual([])
})

test('status brings an archived card back before setting it', async ($, on) => {
  const w = await boot($, on, { reply: world(workData({ issue: { number: 10, status: 'Idea', archived: true } })) })
  const r = await callTool($, 'status', { issue: url(10), status: 'Designed' })
  expect(r.deny).toBeUndefined()
  expect(projectCalls(w)).toEqual(['gh project item-archive 1 --owner trackness --id item-10 --undo', edit(10, 'Designed')])
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

test('status does not blame "Item closed" for a closed issue that is not on the board', async ($, on) => {
  await boot($, on, { reply: world(task11({ number: 10, status: 'In Review' }, [{ number: 11, status: 'In Review' }, { number: 12, closed: true, onBoard: false }])) })
  const r = await callTool($, 'status', { issue: url(11) })
  expect(r.text).toContain(`[#12 Task 12: T12](${url(12)}) — not on the board`)
  expect(r.text).not.toContain('"Item closed"')
})

test('status refuses a repo with no board', async ($, on) => {
  await boot($, on, { reply: world(workData({ issue: { number: 10, status: 'Idea' } }), repoData({ boards: [] })) })
  expect((await callTool($, 'status', { issue: url(10) })).deny).toContain('board_setup')
})

test("a URL that names no issue is refused with GitHub's own words", async ($, on) => {
  // What gh gives for a missing issue or a PR number (checked live): NOT_FOUND beside a null issue, exit 1.
  const missing = { code: 1, stdout: JSON.stringify({ data: { repository: { issue: null } }, errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to an Issue with the number of 10.' }] }) }
  const rest = world(null)
  await boot($, on, { reply: s => (s.input?.includes('"operationName":"Work"') ? missing : rest(s)) })
  expect((await callTool($, 'status', { issue: url(10) })).deny).toContain('Could not resolve to an Issue with the number of 10.')
})

test('status with no status reports the work as links', async ($, on) => {
  const w = await boot($, on, { reply: world(task11({ number: 10, status: 'Todo' }, [{ number: 11, status: 'Todo' }, { number: 12, status: 'Todo' }])) })
  const r = await callTool($, 'status', { issue: url(11) })
  expect(r.text).toContain(`[#11 Task 11: T11](${url(11)}) — Todo`)
  expect(projectCalls(w)).toEqual([])
})
