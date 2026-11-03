import { expect, test } from 'claude-code/testing'
import { boot, callTool, itemsPage, repoData, router, url } from './kit.ts'

const repoView = (s: { argv: string[] }) => s.argv.slice(0, 3).join(' ') === 'gh repo view'

test('work_list lists open issues in the column across every page', async ($, on) => {
  const r = router({
    graphql: {
      Repo: () => repoData({}),
      Items: v => (v.after === 'c1'
        ? itemsPage([{ number: 3, status: 'Idea' }, { number: 4, status: 'Idea', closed: true }])
        : itemsPage([{ number: 1, status: 'Idea' }, { number: 2, status: 'Designed' }], 'c1')),
    },
    cli: s => (repoView(s) ? { stdout: 'trackness/demo\n' } : undefined),
  })
  await boot($, on, { reply: r })
  const res = await callTool($, 'work_list', { status: 'Idea' })
  expect(res.text).toBe(`- [#1 Task 1: T1](${url(1)})\n- [#3 Task 3: T3](${url(3)})`)
  expect(res.text).not.toContain('#2 ')
  expect(res.text).not.toContain('#4 ')
  expect(r.seen.Repo).toEqual([{ owner: 'trackness', name: 'demo' }])
  expect(r.seen.Items).toEqual([{ number: 1, after: null }, { number: 1, after: 'c1' }])
})

test('work_list falls back to the ideas repo outside a GitHub repo', async ($, on) => {
  const r = router({
    graphql: { Repo: () => repoData({ repo: 'trackness/ideas' }), Items: () => itemsPage([]) },
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
