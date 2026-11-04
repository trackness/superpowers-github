import { expect, test } from 'claude-code/testing'
import { boot, callTool, itemsPage, repoData, router, url, workflowsData } from './kit.ts'

const repoView = (s: { argv: string[] }) => s.argv.slice(0, 3).join(' ') === 'gh repo view'

// A board whose workflows are as board_setup leaves them.
const SET_UP = { 'Item closed': true, 'Auto-close issue': true }

test('work_list lists open issues in the column across every page', async ($, on) => {
  const r = router({
    graphql: {
      Repo: () => repoData({}),
      Items: v => (v.after === 'c1'
        ? itemsPage([{ number: 3, status: 'Idea' }, { number: 4, status: 'Idea', closed: true }])
        : itemsPage([{ number: 1, status: 'Idea' }, { number: 2, status: 'Designed' }], 'c1')),
      Workflows: () => workflowsData(SET_UP),
    },
    cli: s => (repoView(s) ? { stdout: 'trackness/demo\n' } : undefined),
  })
  await boot($, on, { reply: r })
  const res = await callTool($, 'work_list', { status: 'Idea' })
  expect(res.text).toBe(`- [#1 Task 1: T1](${url(1)})\n- [#3 Task 3: T3](${url(3)})`)
  expect(res.text).not.toContain('#2 ')
  expect(res.text).not.toContain('#4 ')
  expect(r.seen.Repo).toEqual([{ owner: 'trackness', name: 'demo' }])
  // GitHub filters the board, so the Done pile is never paged through.
  const filter = 'is:open is:issue status:Idea'
  expect(r.seen.Items).toEqual([{ owner: 'trackness', number: 1, filter, after: null }, { owner: 'trackness', number: 1, filter, after: 'c1' }])
})

test('work_list warns when the board has a workflow that also moves cards', async ($, on) => {
  const r = router({ graphql: { Repo: () => repoData({}), Items: () => itemsPage([]), Workflows: () => workflowsData({ ...SET_UP, 'Item added to project': true }) } })
  await boot($, on, { reply: r })
  const res = await callTool($, 'work_list', { status: 'Idea', repo: 'trackness/demo' })
  expect(res.text).toBe([
    "No issues in Idea on trackness/demo's board.",
    'Board "demo" (https://github.com/users/trackness/projects/1) differs: Item added to project: on, must be off. Call mcp__superpowers-github__board_setup with repair: true for trackness/demo before using it.',
  ].join('\n'))
  expect(r.seen.Workflows).toEqual([{ owner: 'trackness', number: 1 }])
})

test("work_list reads an organization's board through its owner, and refuses one GitHub can't find", async ($, on) => {
  const org = { number: 4, title: 'app', url: 'https://github.com/orgs/acme/projects/4', owner: { login: 'acme' } }
  const r = router({ graphql: { Repo: () => ({ repository: { nameWithOwner: 'acme/app', isPrivate: true, projectsV2: { nodes: [org] } } }), Items: () => ({ repositoryOwner: null }) } })
  await boot($, on, { reply: r })
  const res = await callTool($, 'work_list', { status: 'Idea', repo: 'acme/app' })
  expect(r.seen.Items).toEqual([{ owner: 'acme', number: 4, filter: 'is:open is:issue status:Idea', after: null }])
  expect(res.deny).toContain(org.url)
  expect(res.deny).not.toContain('work_list failed')
})

test('work_list falls back to the ideas repo outside a GitHub repo', async ($, on) => {
  const r = router({
    graphql: { Repo: () => repoData({ repo: 'trackness/ideas' }), Items: () => itemsPage([]), Workflows: () => workflowsData(SET_UP) },
    cli: s => (repoView(s) ? { code: 1, stderr: 'failed to run git: fatal: not a git repository' } : undefined),
  })
  await boot($, on, { reply: r })
  const res = await callTool($, 'work_list', { status: 'Designed' })
  expect(r.seen.Repo?.[0]).toEqual({ owner: 'trackness', name: 'ideas' })
  expect(res.text).toBe("No issues in Designed on trackness/ideas's board.")
})

test('work_list reports a repo with no board without failing', async ($, on) => {
  const r = router({ graphql: { Repo: () => repoData({ boards: [] }) } })
  await boot($, on, { reply: r })
  const res = await callTool($, 'work_list', { status: 'Idea', repo: 'trackness/demo' })
  expect(res.text).toBe('trackness/demo has no board yet.')
  expect(r.seen.Items).toBeUndefined()
})
