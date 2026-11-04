import { expect, test } from 'claude-code/testing'
import { assertWritable, deriveParentStatus } from '../hooks/board.ts'
import { boot, callTool, repoData, router, type Spawned, url, workData } from './kit.ts'

test('deriveParentStatus follows the spec table', () => {
  expect(deriveParentStatus(['Todo', 'Todo'])).toBe('Todo')
  expect(deriveParentStatus(['In Progress', 'Todo'])).toBe('In Progress')
  expect(deriveParentStatus(['In Review', 'Todo'])).toBe('In Progress')
  expect(deriveParentStatus(['In Review', 'Done'])).toBe('In Review')
  expect(deriveParentStatus(['Done', 'Done'])).toBe('Done')
  expect(deriveParentStatus([undefined, 'In Review'])).toBe('In Progress')
})

test('assertWritable refuses only a public ideas repo', () => {
  expect(() => assertWritable({ repo: 'trackness/ideas', isPrivate: false })).toThrow('must stay private')
  expect(() => assertWritable({ repo: 'trackness/ideas', isPrivate: true })).not.toThrow()
  expect(() => assertWritable({ repo: 'trackness/demo', isPrivate: false })).not.toThrow()
})

test('every tool that writes refuses a public ideas repo, by GitHub\'s spelling of its name, before writing anything', async ($, on) => {
  const IDEAS = 'trackness/ideas'
  const reply = router({ graphql: { Repo: () => repoData({ repo: IDEAS, isPrivate: false }), Work: () => workData({ issue: { number: 5, status: 'Idea' }, repo: IDEAS }) } })
  const w = await boot($, on, { reply })
  const issue = url(5, IDEAS)
  const calls: [string, Record<string, unknown>][] = [
    ['issue_edit', { issue, title: 'T' }],
    ['issue_edit', { issue, body: 'B' }],
    ['issue_edit', { issue, appendBody: 'B' }],
    ['issue_create', { parent: issue, title: 'Task 1: T', body: 'B' }],
    ['issue_create', { repo: 'Trackness/Ideas', title: 'T', body: 'B' }],
    ['attach', { issue, path: '/tmp/x/a.md' }],
    ['design_write', { issue, design: 'D' }],
    ['idea_move', { issue, to: 'trackness/app' }],
    ['board_setup', { repo: IDEAS }],
  ]
  const refused: [string, boolean][] = []
  for (const [name, input] of calls) refused.push([name, !!(await callTool($, name, input)).deny?.includes('must stay private')])
  expect(refused).toEqual(calls.map(([name]) => [name, true]))
  // Only the reads that find the repo and the issue ran.
  const read = (s: Spawned) => s.argv.join(' ') === 'gh api graphql --input -' && /"operationName":"(Repo|Work)"/.test(s.input ?? '')
  expect(w.spawned.filter(s => !read(s)).map(s => s.argv.join(' '))).toEqual([])
})
