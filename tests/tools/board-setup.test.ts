import { expect, test } from 'claude-code/testing'
import { STATUSES } from '../../hooks/config'
import { OPTION_STYLE } from '../../hooks/github/setup'
import { argvs, boot, callTool, DEMO, fieldsData, projectCreateOutput, type Reply, repoData, router, type Spawned, viewsData, workflowsData } from '../kit'

// A fresh board from `gh project create` has all six workflows on.
const FRESH = { 'Item closed': true, 'Auto-close issue': true, 'Item added to project': true, 'Pull request linked to issue': true, 'Pull request merged': true, 'Auto-add sub-issues to project': true }
const KEPT = { 'Item closed': true, 'Auto-close issue': true }
const merge = (repo: string) => `gh repo edit ${repo} --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge --squash-merge-commit-message pr-title`

// The six merge fields as GraphQL reads them: a new repo's defaults, and what `merge(repo)` leaves (gh's pr-title is PR_TITLE and BLANK).
const MERGE_DEFAULT = { squashMergeAllowed: true, mergeCommitAllowed: true, rebaseMergeAllowed: true, deleteBranchOnMerge: false, squashMergeCommitTitle: 'COMMIT_OR_PR_TITLE', squashMergeCommitMessage: 'COMMIT_MESSAGES' }
const MERGE_SET = { squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: false, deleteBranchOnMerge: true, squashMergeCommitTitle: 'PR_TITLE', squashMergeCommitMessage: 'BLANK' }

type BoardState = { options: string[]; workflows: Record<string, boolean>; views: string[]; mergeSettingsSet: boolean }
const fresh = (): BoardState => ({ options: ['Todo', 'In Progress', 'Done'], workflows: { ...FRESH }, views: ['TABLE_LAYOUT'], mergeSettingsSet: false })
const built = (workflows: Record<string, boolean> = KEPT): BoardState => ({ options: [...STATUSES], workflows: { ...workflows }, views: ['BOARD_LAYOUT'], mergeSettingsSet: true })

const head = (s: Spawned, n: number) => s.argv.slice(0, n).join(' ')

// Once `gh project link` succeeds, `Repo` lists the repo's own board as board 1, so a test that calls again passes `number: 1`.
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
      Merge: () => ({ repository: b.mergeSettingsSet ? MERGE_SET : MERGE_DEFAULT }),
    },
    cli: s => {
      if (head(s, 3) === 'gh project create') return projectCreateOutput(o.number ?? 7)
      if (head(s, 3) === 'gh repo edit') b.mergeSettingsSet = true
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
  expect(r.seen.CreateView).toBeUndefined()
  expect(argvs(w)).not.toContain(merge(DEMO))
  const again = await callTool($, 'board_setup', { repo: DEMO, repair: true })
  expect(r.seen.DeleteWorkflow).toContainEqual({ workflowId: 'wf-Pull request merged' })
  // Views is read by the first check, by repair's ensureBoardView and by the check after repair.
  expect(r.seen.Views).toHaveLength(3)
  expect(r.seen.CreateView).toBeUndefined()
  expect(argvs(w)).toContain(merge(DEMO))
  expect(again.text).toContain('is set up')
})

test('board_setup reports wrong Status options, and repair resets them keeping their IDs only once the user agrees to drop the others', async ($, on) => {
  const r = world({ ...built(), options: ['Backlog', 'Todo', 'In Progress', 'Done'] })
  await boot($, on, { reply: r })
  const first = await callTool($, 'board_setup', { repo: DEMO })
  expect(first.deny).toContain('Status options: Backlog, Todo, In Progress, Done')
  expect(first.deny).toContain('repair: true')
  expect(first.deny).toContain('Ask your human partner before repairing: repair removes these options, and their items lose their Status: Backlog. Only once they agree, add dropOptions: true.')
  expect(r.seen.SetOptions).toBeUndefined()
  const refused = await callTool($, 'board_setup', { repo: DEMO, repair: true })
  expect(refused.deny).toContain('Repair removes these Status options, and their items lose their Status: Backlog.')
  expect(refused.deny).toContain('Ask your human partner first; only once they agree, call board_setup again with repair: true and dropOptions: true.')
  expect(r.seen.SetOptions).toBeUndefined()
  const again = await callTool($, 'board_setup', { repo: DEMO, repair: true, dropOptions: true })
  expect(r.seen.SetOptions?.[0].options.map((o: any) => o.id)).toEqual([undefined, undefined, 'id-Todo', 'id-In Progress', undefined, 'id-Done'])
  expect(again.text).toContain('is set up')
})

test('board_setup repair refuses a Status field with no Done, so "Item closed" keeps the option it sets', async ($, on) => {
  const r = world({ ...built(), options: ['Backlog', 'Shipped'] })
  await boot($, on, { reply: r })
  // Checked before the opt-in: renaming Shipped to Done changes what repair would drop.
  for (const input of [{ repair: true }, { repair: true, dropOptions: true }]) {
    const res = await callTool($, 'board_setup', { repo: DEMO, ...input })
    expect(res.deny).toContain('no option named exactly "Done" (it has: Backlog, Shipped)')
    expect(res.deny).toContain('rename the option "Item closed" sets to Done')
  }
  expect(r.seen.SetOptions).toBeUndefined()
  expect(r.seen.DeleteWorkflow).toBeUndefined()
})

test('board_setup reports a board with no board view and wrong merge settings, and repair fixes both', async ($, on) => {
  const r = world({ ...built(), views: ['TABLE_LAYOUT'], mergeSettingsSet: false })
  const w = await boot($, on, { reply: r })
  const first = await callTool($, 'board_setup', { repo: DEMO })
  expect(first.deny).toContain('- board view: none, must have one')
  expect(first.deny).toContain('- mergeCommitAllowed: true, must be false')
  expect(first.deny).toContain('- rebaseMergeAllowed: true, must be false')
  expect(first.deny).toContain('- deleteBranchOnMerge: false, must be true')
  expect(first.deny).toContain('- squashMergeCommitTitle: COMMIT_OR_PR_TITLE, must be PR_TITLE')
  expect(first.deny).toContain('- squashMergeCommitMessage: COMMIT_MESSAGES, must be BLANK')
  expect(first.deny).not.toContain('squashMergeAllowed')
  expect(first.deny).toContain('To fix these, call board_setup again with repair: true.')
  expect(r.seen.Merge?.[0]).toEqual({ owner: 'trackness', name: 'demo' })
  expect(r.seen.CreateView).toBeUndefined()
  expect(argvs(w)).not.toContain(merge(DEMO))
  const again = await callTool($, 'board_setup', { repo: DEMO, repair: true })
  expect(r.seen.CreateView?.[0]).toMatchObject({ layout: 'BOARD_LAYOUT' })
  expect(argvs(w)).toContain(merge(DEMO))
  expect(again.text).toBe('board "demo" (https://github.com/users/trackness/projects/1) is set up for trackness/demo')
})

test('board_setup does not call a board set up when its build failed at the merge settings', async ($, on) => {
  const r = world(fresh(), { boards: [], number: 1, failOnce: 'gh repo edit' })
  await boot($, on, { reply: r })
  const first = await callTool($, 'board_setup', { repo: DEMO })
  expect(first.deny).toContain('`gh repo edit trackness/demo')
  expect(first.deny).toContain('To finish it, call board_setup again without create, with repair: true.')
  const again = await callTool($, 'board_setup', { repo: DEMO })
  expect(again.deny).toContain('- mergeCommitAllowed: true, must be false')
  expect(again.deny).toContain('repair: true')
})

test('board_setup says the repo now exists when the board fails after create', async ($, on) => {
  const r = world(fresh(), { repo: 'trackness/new', boards: [], failOnce: 'gh project create' })
  const w = await boot($, on, { reply: r })
  const res = await callTool($, 'board_setup', { repo: 'trackness/new', create: 'private' })
  expect(res.deny).toContain('created trackness/new, then the board setup failed: `gh project create --owner trackness --title new --format json` failed (exit 1): gh project create refused')
  expect(res.deny).toContain("don't pass create again")
  expect(argvs(w).filter(a => a.startsWith('gh project link'))).toEqual([])
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
