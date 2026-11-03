import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, repoData, router, type Spawned, url, workData } from './kit.ts'

const ZIP = 'https://github.com/user-attachments/files/3/visual-companion.zip'
const IDEA = 'https://github.com/user-attachments/files/8/idea.md'

const world = (o: { status?: 'Idea' | 'Designed'; body: string; tasks?: number[]; editFails?: boolean }) =>
  router({
    graphql: {
      Repo: () => repoData({}),
      Work: () => workData({ issue: { number: 10, status: o.status ?? 'Idea', body: o.body }, tasks: (o.tasks ?? []).map(number => ({ number })) }),
    },
    cli: (s: Spawned) => {
      if (s.argv[1] === 'extension') return { stdout: 'gh image\tdrogers0/gh-image\tv1.4.1\n' }
      if (s.argv[1] === 'image') return { stdout: `[idea.md](${IDEA})\n` }
      if (s.argv[1] === 'issue' && o.editFails) return { code: 1, stderr: 'HTTP 502' }
      if (s.argv[1] === 'issue' || s.argv[1] === 'project') return {}
      return undefined
    },
  })

test('design_write keeps the idea as idea.md and puts the design in its place', async ($, on) => {
  const body = `my idea\n\n## Attachments\n\n- [visual-companion.zip](${ZIP})\n`
  const w = await boot($, on, { reply: world({ body }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toBeUndefined()
  const paths = Object.keys(w.written)
  expect(paths).toHaveLength(1)
  expect(paths[0]).toMatch(/^\/tmp\/superpowers-github\/[^/]+\/idea\.md$/)
  expect(w.written[paths[0]!]).toBe('my idea')
  expect(w.spawned.find(s => s.argv[1] === 'image')!.argv[2]).toBe(paths[0])
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe(`THE DESIGN\n\n## Attachments\n\n- [visual-companion.zip](${ZIP})\n- [idea.md](${IDEA})\n`)
  expect(argvs(w)).toContain(`gh project item-edit 1 --owner trackness --url ${url(10)} --field Status --value Designed`)
})

test('design_write on an empty body writes the design without an idea.md', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: '' }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toBeUndefined()
  expect(w.spawned.some(s => s.argv[1] === 'image')).toBe(false)
  expect(w.written).toEqual({})
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe('THE DESIGN')
})

test('design_write refuses an issue that is not in Idea', async ($, on) => {
  const w = await boot($, on, { reply: world({ status: 'Designed', body: 'D' }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain('issue_edit')
  expect(w.spawned.some(s => s.argv[2] === 'edit')).toBe(false)
})

test('design_write refuses an Idea that has tasks', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: 'I', tasks: [11] }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain('issue_edit')
  expect(w.spawned.some(s => s.argv[2] === 'edit')).toBe(false)
})

test('design_write names the uploaded idea.md when the body edit fails', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: 'my idea', editFails: true }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain('unchanged')
  expect(r.deny).toContain(`[idea.md](${IDEA})`)
  expect(argvs(w).some(a => a.startsWith('gh project item-edit'))).toBe(false)
})

test('design_write checks the size before uploading anything', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: 'my idea' }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'x'.repeat(65_400) })
  expect(r.deny).toContain('65,536')
  expect(w.spawned.some(s => s.argv[1] === 'image')).toBe(false)
  expect(w.written).toEqual({})
})
