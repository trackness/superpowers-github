import { expect, test } from 'claude-code/testing'
import { boot, callTool, closingData, type ItemSpec, repoData, router, url, workData } from './kit.ts'

const HEADING = '## Plan changes made during the run'

// The parent is #10 with tasks #11 and #12 unless `tasks` says otherwise.
const world = (parent: ItemSpec, tasks: ItemSpec[], closing?: unknown) =>
  router({ graphql: { Repo: () => repoData({}), Work: () => workData({ issue: parent, tasks }), ClosingRefs: () => closing } })

const both = (a: ItemSpec['status'], b: ItemSpec['status']) => [{ number: 11, status: a }, { number: 12, status: b }]

test('the gate names every task that is not In Review', async ($, on) => {
  await boot($, on, { reply: world({ number: 10, status: 'In Progress' }, both('In Review', 'In Progress')) })
  const r = await callTool($, 'pr_check', { parent: url(10) })
  expect(r.deny).toContain('No PR: these tasks are not In Review:')
  expect(r.deny).toContain('[#12 ')
  expect(r.deny).toContain('In Progress')
  expect(r.deny).not.toContain(`(${url(11)})`)
})

test('the gate passes with the Closes lines for the parent and every task', async ($, on) => {
  await boot($, on, { reply: world({ number: 10, status: 'In Review' }, both('In Review', 'In Review')) })
  const r = await callTool($, 'pr_check', { parent: url(10) })
  expect(r.text).toContain('Gate passed. Put these lines in the PR description:')
  expect(r.text).toContain('Closes #10\nCloses #11\nCloses #12')
  expect(r.text).toContain(`and a "${HEADING}" section.`)
})

test('a small change passes the gate from In Review', async ($, on) => {
  await boot($, on, { reply: world({ number: 10, status: 'In Review' }, []) })
  expect((await callTool($, 'pr_check', { parent: url(10) })).text).toBe('Closes #10')
})

test('a small change is refused the gate before In Review', async ($, on) => {
  await boot($, on, { reply: world({ number: 10, status: 'In Progress' }, []) })
  expect((await callTool($, 'pr_check', { parent: url(10) })).deny).toContain('In Progress')
})

test('a PR that closes exactly the parent and its tasks is ready to hand over', async ($, on) => {
  const w = world({ number: 10, status: 'In Review' }, both('In Review', 'In Review'), closingData({ body: `x\n${HEADING}\n\nNone.`, closes: [10, 11, 12] }))
  await boot($, on, { reply: w })
  const r = await callTool($, 'pr_check', { parent: url(10), pr: 7 })
  expect(r.text).toContain('hand it over')
  expect(w.seen.ClosingRefs).toEqual([{ owner: 'trackness', name: 'demo', number: 7 }])
})

test('a PR URL names the PR to check', async ($, on) => {
  const w = world({ number: 10, status: 'In Review' }, [], closingData({ body: 'x', closes: [10] }))
  await boot($, on, { reply: w })
  const r = await callTool($, 'pr_check', { parent: url(10), pr: 'https://github.com/trackness/demo/pull/9' })
  expect(r.text).toContain('PR #9 closes exactly')
  expect(w.seen.ClosingRefs).toEqual([{ owner: 'trackness', name: 'demo', number: 9 }])
})

test('a PR missing a task names it', async ($, on) => {
  await boot($, on, { reply: world({ number: 10, status: 'In Review' }, both('In Review', 'In Review'), closingData({ body: HEADING, closes: [10, 11] })) })
  const r = await callTool($, 'pr_check', { parent: url(10), pr: 7 })
  expect(r.deny).toContain('Missing: #12')
  expect(r.deny).not.toContain('Extra:')
})

test('a PR closing an extra issue names it', async ($, on) => {
  await boot($, on, { reply: world({ number: 10, status: 'In Review' }, both('In Review', 'In Review'), closingData({ body: HEADING, closes: [10, 11, 12, 99] })) })
  const r = await callTool($, 'pr_check', { parent: url(10), pr: 7 })
  expect(r.deny).toContain('Extra: #99')
  expect(r.deny).not.toContain('Missing:')
})

test('a PR for a planned run must carry the plan-changes section', async ($, on) => {
  await boot($, on, { reply: world({ number: 10, status: 'In Review' }, both('In Review', 'In Review'), closingData({ body: 'no heading', closes: [10, 11, 12] })) })
  const r = await callTool($, 'pr_check', { parent: url(10), pr: 7 })
  expect(r.deny).toContain(HEADING)
})
