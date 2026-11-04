import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, repoData, router, url } from './kit.ts'

const FILES = 'https://github.com/user-attachments/files/1/idea.md'
const ZIP = 'https://github.com/user-attachments/files/2/z.zip'
const current = `Body\n\n## Attachments\n- [idea.md](${FILES})\n- [z.zip](${ZIP})\n`

const world = (boards?: string[]) =>
  router({
    graphql: { Repo: () => repoData({ boards }) },
    cli: s => (s.argv[2] === 'view' ? { stdout: JSON.stringify({ body: current }) } : s.argv[1] === 'issue' ? {} : undefined),
  })

test('issue_edit refuses a body that drops an attachment', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_edit', { issue: url(11), body: `New\n\n## Attachments\n- [idea.md](${FILES})\n` })
  expect(r.deny).toContain(ZIP)
  expect(r.deny).not.toContain(FILES)
  expect(argvs(w).some(a => a.startsWith('gh issue edit'))).toBe(false)
})

test('issue_edit sets the body and the blocked-by links', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const body = `New\n- ${FILES}\n- ${ZIP}\n`
  const r = await callTool($, 'issue_edit', { issue: url(11), body, addBlockedBy: [4], removeBlockedBy: [5] })
  expect(r.deny).toBeUndefined()
  expect(w.spawned.find(s => s.argv[2] === 'edit')).toMatchObject({ argv: ['gh', 'issue', 'edit', url(11), '--body-file', '-', '--add-blocked-by', '4', '--remove-blocked-by', '5'], input: body })
})

test("issue_edit sets a body without a board: it reads the repo and the issue's body", async ($, on) => {
  const w = await boot($, on, { reply: world(['Demo Backlog']) })
  const body = `New\n- ${FILES}\n- ${ZIP}\n`
  const r = await callTool($, 'issue_edit', { issue: url(11), body })
  expect(r.deny).toBeUndefined()
  expect(argvs(w)).toContain(`gh issue view ${url(11)} --json body`)
  expect(w.spawned.find(s => s.argv[2] === 'edit')).toMatchObject({ argv: ['gh', 'issue', 'edit', url(11), '--body-file', '-'], input: body })
})

test('issue_edit sets a title alone without reading the body', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_edit', { issue: url(11), title: 'Task 3: New' })
  expect(r.deny).toBeUndefined()
  expect(argvs(w)).toContain(`gh issue edit ${url(11)} --title Task 3: New`)
})

test('issue_edit refuses an oversized body', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'issue_edit', { issue: url(11), body: 'x'.repeat(65_537) })
  expect(r.deny).toContain('65,536')
  expect(w.spawned).toEqual([])
})

test('issue_edit needs at least one change', async ($, on) => {
  await boot($, on, { reply: world() })
  expect((await callTool($, 'issue_edit', { issue: url(11) })).deny).toContain('Nothing to change')
})
