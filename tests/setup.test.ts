import { expect, test } from 'claude-code/testing'
import { STATUSES } from '../hooks/config.ts'
import { OPTION_STYLE, workflowDiffs } from '../hooks/setup.ts'
import { argvs, boot, callTool, DEMO, fieldsData, projectJson, type Reply, repoData, router, type Spawned, viewsData, workflowsData } from './kit.ts'

// A fresh board from `gh project create` has all six workflows on.
const FRESH = { 'Item closed': true, 'Auto-close issue': true, 'Item added to project': true, 'Pull request linked to issue': true, 'Pull request merged': true, 'Auto-add sub-issues to project': true }
const KEPT = { 'Item closed': true, 'Auto-close issue': true }
const merge = (repo: string) => `gh repo edit ${repo} --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge --squash-merge-commit-message pr-title`

type BoardState = { options: string[]; workflows: Record<string, boolean>; views: string[] }
const fresh = (): BoardState => ({ options: ['Todo', 'In Progress', 'Done'], workflows: { ...FRESH }, views: ['TABLE_LAYOUT'] })
const built = (workflows: Record<string, boolean> = KEPT): BoardState => ({ options: [...STATUSES], workflows: { ...workflows }, views: ['BOARD_LAYOUT'] })

const head = (s: Spawned, n: number) => s.argv.slice(0, n).join(' ')

// Answers `Repo`, and the board's ops from `b`, which each mutation changes, so a later read sees what it left.
// `gh project create` answers board `number` (default 7), and once `gh project link` succeeds `Repo` lists the
// repo's own board (board 1, so pass `number: 1` for a test that calls again). Any other `gh project` or `gh repo`
// call succeeds. `failOnce` names a command (its first three words) or a GraphQL op that fails the first time.
function world(b: BoardState, o: { repo?: string; boards?: string[]; number?: number; afterDelete?: (b: BoardState) => void; failOnce?: string } = {}) {
  let [linked, failed] = [false, false]
  const r = router({
    graphql: {
      Repo: () => repoData({ repo: o.repo, boards: linked ? undefined : o.boards }),
      Fields: () => fieldsData(b.options),
      SetOptions: v => {
        b.options = v.options.map((x: { name: string }) => x.name)
        return { updateProjectV2Field: { projectV2Field: { id: v.fieldId } } }
      },
      Workflows: () => workflowsData(b.workflows),
      DeleteWorkflow: v => {
        delete b.workflows[v.workflowId.replace(/^wf-/, '')]
        o.afterDelete?.(b)
        return { deleteProjectV2Workflow: { deletedWorkflowId: v.workflowId } }
      },
      Views: () => viewsData(b.views),
      CreateView: v => {
        b.views.push(v.layout)
        return { createProjectV2View: { projectV2View: { id: 'V1' } } }
      },
    },
    cli: s => {
      if (head(s, 3) === 'gh project create') return projectJson(o.number ?? 7)
      return head(s, 2) === 'gh project' || head(s, 2) === 'gh repo' ? {} : undefined
    },
  })
  const reply = (s: Spawned): Reply => {
    const name = head(s, 3) === 'gh api graphql' ? JSON.parse(s.input ?? '{}').operationName : head(s, 3)
    if (!failed && name === o.failOnce) {
      failed = true
      return { code: 1, stderr: `${name} refused` }
    }
    if (name === 'gh project link') linked = true
    return r(s)
  }
  return Object.assign(reply, { seen: r.seen })
}

test('board_setup builds a fresh board: option IDs kept, four workflows deleted, a board view, linked', async ($, on) => {
  const r = world(fresh(), { boards: [] })
  const w = await boot($, on, { reply: r })
  const res = await callTool($, 'board_setup', { repo: DEMO })
  expect(res.deny).toBeUndefined()
  expect(argvs(w)).toContain('gh project create --owner trackness --title demo --format json')
  expect(r.seen.Fields?.[0]).toEqual({ owner: 'trackness', number: 7 })
  expect(r.seen.SetOptions?.[0].fieldId).toBe('F1')
  expect(r.seen.SetOptions?.[0].options.map((o: any) => [o.name, o.id])).toEqual([['Idea', undefined], ['Designed', undefined], ['Todo', 'id-Todo'], ['In Progress', 'id-In Progress'], ['In Review', undefined], ['Done', 'id-Done']])
  expect(r.seen.SetOptions?.[0].options[0]).toEqual({ name: 'Idea', color: 'GRAY', description: 'Its body is only the idea' })
  expect(r.seen.SetOptions?.[0].options[5]).toEqual({ id: 'id-Done', name: 'Done', ...OPTION_STYLE.Done })
  expect(r.seen.DeleteWorkflow?.map((v: any) => v.workflowId).sort()).toEqual(['wf-Auto-add sub-issues to project', 'wf-Item added to project', 'wf-Pull request linked to issue', 'wf-Pull request merged'])
  expect(r.seen.CreateView?.[0]).toMatchObject({ layout: 'BOARD_LAYOUT' })
  expect(argvs(w)).toContain('gh project link 7 --owner trackness --repo trackness/demo')
  // Linked straight after the create, before anything else touches the board.
  const create = argvs(w).indexOf('gh project create --owner trackness --title demo --format json')
  expect(argvs(w).indexOf('gh project link 7 --owner trackness --repo trackness/demo')).toBe(create + 1)
  expect(argvs(w)).toContain(merge(DEMO))
  expect(res.text).toContain('is set up for trackness/demo')
  expect(res.text).toBe('board "demo" (https://github.com/users/trackness/projects/7) is set up for trackness/demo')
})

test('board_setup refuses when a must-be-on workflow is missing', async ($, on) => {
  const r = world(fresh(), { boards: [], afterDelete: b => void delete b.workflows['Item closed'] })
  await boot($, on, { reply: r })
  const res = await callTool($, 'board_setup', { repo: DEMO })
  expect(res.deny).toContain('Item closed: missing, must be on')
  expect(res.deny).toContain('Save and turn on workflow')
  expect(res.deny).toContain('Open https://github.com/users/trackness/projects/7.')
  expect(res.deny).not.toContain('repair: true')
})

test('board_setup only checks a repo that already has its board', async ($, on) => {
  const r = world(built())
  const w = await boot($, on, { reply: r })
  const res = await callTool($, 'board_setup', { repo: DEMO })
  expect(res.text).toContain('is set up')
  expect(res.text).toBe('board "demo" (https://github.com/users/trackness/projects/1) is set up for trackness/demo')
  expect(argvs(w)).not.toContain('gh project create --owner trackness --title demo --format json')
  expect(argvs(w).filter(a => a !== 'gh api graphql --input -')).toEqual([])
  expect(r.seen.SetOptions).toBeUndefined()
  expect(r.seen.DeleteWorkflow).toBeUndefined()
  expect(r.seen.CreateView).toBeUndefined()
})

test('board_setup reports a board that differs, and repairs it on request', async ($, on) => {
  const r = world(built({ ...KEPT, 'Pull request merged': true }))
  const w = await boot($, on, { reply: r })
  const first = await callTool($, 'board_setup', { repo: DEMO })
  expect(first.deny).toContain('Pull request merged: on, must be off')
  expect(first.deny).toContain('repair: true')
  expect(first.deny).not.toContain('Save and turn on workflow')
  expect(r.seen.DeleteWorkflow).toBeUndefined()
  expect(r.seen.Views).toBeUndefined()
  expect(argvs(w)).not.toContain(merge(DEMO))
  const again = await callTool($, 'board_setup', { repo: DEMO, repair: true })
  expect(r.seen.DeleteWorkflow).toContainEqual({ workflowId: 'wf-Pull request merged' })
  // Repair also checks for a board view (this board has one) and sets the merge settings.
  expect(r.seen.Views).toHaveLength(1)
  expect(r.seen.CreateView).toBeUndefined()
  expect(argvs(w)).toContain(merge(DEMO))
  expect(again.text).toContain('is set up')
})

test('board_setup reports wrong Status options, and repair resets them keeping their IDs', async ($, on) => {
  const r = world({ ...built(), options: ['Backlog', 'Todo', 'In Progress', 'Done'] })
  await boot($, on, { reply: r })
  const first = await callTool($, 'board_setup', { repo: DEMO })
  expect(first.deny).toContain('Status options: Backlog, Todo, In Progress, Done')
  expect(first.deny).toContain('repair: true')
  expect(first.deny).toContain('Repair removes these options, and their items lose their Status: Backlog.')
  expect(r.seen.SetOptions).toBeUndefined()
  const again = await callTool($, 'board_setup', { repo: DEMO, repair: true })
  expect(r.seen.SetOptions?.[0].options.map((o: any) => o.id)).toEqual([undefined, undefined, 'id-Todo', 'id-In Progress', undefined, 'id-Done'])
  expect(again.text).toContain('is set up')
})

test('board_setup creates a private repo first', async ($, on) => {
  const r = world(fresh(), { repo: 'trackness/new', boards: [] })
  const w = await boot($, on, { reply: r })
  const res = await callTool($, 'board_setup', { repo: 'trackness/new', create: 'private' })
  expect(argvs(w)).toContain('gh repo create trackness/new --private')
  expect(argvs(w)[0]).toBe('gh repo create trackness/new --private')
  expect(argvs(w)).toContain(merge('trackness/new'))
  expect(res.text).toContain('is set up for trackness/new')
})

test('board_setup will not make the ideas repo public', async ($, on) => {
  const w = await boot($, on, { reply: router({}) })
  for (const repo of ['trackness/ideas', 'Trackness/Ideas']) {
    const res = await callTool($, 'board_setup', { repo, create: 'public' })
    expect(res.deny).toContain('must stay private')
  }
  expect(w.spawned).toEqual([])
})

test('board_setup refuses a repo without its owner before creating anything', async ($, on) => {
  const w = await boot($, on, { reply: router({}) })
  const res = await callTool($, 'board_setup', { repo: 'ideas', create: 'public' })
  expect(res.deny).toContain('<owner>/<name>')
  expect(w.spawned).toEqual([])
})

test('board_setup warns of a second board only when linking the new board fails', async ($, on) => {
  const r = world(fresh(), { boards: [], failOnce: 'gh project link' })
  const w = await boot($, on, { reply: r })
  const res = await callTool($, 'board_setup', { repo: DEMO })
  expect(res.deny).toContain('Created board "demo" (https://github.com/users/trackness/projects/7)')
  expect(res.deny).toContain('gh project link refused')
  expect(res.deny).toContain('second board')
  expect(res.deny).toContain('first run `gh project link 7 --owner trackness --repo trackness/demo`')
  expect(res.deny).toContain('call board_setup again without create, with repair: true')
  expect(r.seen.Fields).toBeUndefined()
  expect(argvs(w)).not.toContain(merge(DEMO))
})

test('board_setup finishes a half-built board when called again with repair', async ($, on) => {
  const r = world(fresh(), { boards: [], number: 1, failOnce: 'SetOptions' })
  const w = await boot($, on, { reply: r })
  const first = await callTool($, 'board_setup', { repo: DEMO, create: 'private' })
  expect(first.deny).toContain('Created board "demo" (https://github.com/users/trackness/projects/1)')
  expect(first.deny).toContain('GraphQL SetOptions failed')
  expect(first.deny).toContain('To finish it, call board_setup again without create, with repair: true.')
  expect(first.deny).not.toContain('second board')
  expect(r.seen.CreateView).toBeUndefined()
  expect(argvs(w)).not.toContain(merge(DEMO))
  const again = await callTool($, 'board_setup', { repo: DEMO, repair: true })
  expect(again.text).toBe('board "demo" (https://github.com/users/trackness/projects/1) is set up for trackness/demo')
  expect(argvs(w).filter(a => a.startsWith('gh project create'))).toHaveLength(1)
  expect(argvs(w).filter(a => a.startsWith('gh repo create'))).toHaveLength(1)
  expect(r.seen.SetOptions).toHaveLength(1)
  expect(r.seen.CreateView?.[0]).toMatchObject({ layout: 'BOARD_LAYOUT' })
  expect(argvs(w)).toContain(merge(DEMO))
})

test('workflowDiffs: must-be-on missing or off, must-be-off on; a must-be-off one deleted or disabled is fine', () => {
  const wf = (name: string, enabled: boolean) => ({ id: `wf-${name}`, name, enabled })
  expect(workflowDiffs([wf('Item closed', true), wf('Auto-close issue', true), wf('Pull request merged', false)])).toEqual([])
  expect(workflowDiffs([wf('Item closed', false), wf('Item added to project', true), wf('Pull request merged', false)])).toEqual([
    'Item closed: off, must be on',
    'Auto-close issue: missing, must be on',
    'Item added to project: on, must be off',
  ])
})
