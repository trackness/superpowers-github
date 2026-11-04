import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, repoData, router, type Spawned, url, workData, type World } from '../kit'

const ZIP = 'https://github.com/user-attachments/files/3/visual-companion.zip'
const IDEA = 'https://github.com/user-attachments/files/8/idea.md'

const world = (o: { status?: 'Idea' | 'Designed'; body: string; bodyAfterUpload?: string; tasks?: number[]; editFails?: boolean; statusFails?: boolean }) =>
  router({
    graphql: {
      Repo: () => repoData({}),
      Work: () => workData({ issue: { number: 10, status: o.status ?? 'Idea', body: o.body }, tasks: (o.tasks ?? []).map(number => ({ number })) }),
    },
    cli: (s: Spawned) => {
      if (s.argv[1] === 'extension') return { stdout: 'gh image\tdrogers0/gh-image\tv1.4.1\n' }
      if (s.argv[1] === 'image') return { stdout: `[idea.md](${IDEA})\n` }
      if (s.argv.slice(1, 3).join(' ') === 'issue view') return { stdout: JSON.stringify({ body: o.bodyAfterUpload ?? o.body }) }
      if ((s.argv[2] === 'edit' && o.editFails) || (s.argv[2] === 'item-edit' && o.statusFails)) return { code: 1, stderr: 'HTTP 502' }
      if (s.argv[1] === 'issue' || s.argv[1] === 'project') return {}
      return undefined
    },
  })

const uploads = (w: World) => w.spawned.filter(s => s.argv[1] === 'image')
const nothingWritten = (w: World) => {
  expect(uploads(w)).toEqual([])
  expect(w.written).toEqual({})
  expect(w.spawned.some(s => s.argv[2] === 'edit')).toBe(false)
}

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

test('design_write with no idea and no attachments counts only the design', async ($, on) => {
  const design = 'x'.repeat(65_400)
  const w = await boot($, on, { reply: world({ body: '' }) })
  const r = await callTool($, 'design_write', { issue: url(10), design })
  expect(r.deny).toBeUndefined()
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe(design)
})

test('design_write refuses text after the ## Attachments list, before uploading anything', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: `Idea\n\n## Attachments\n\n- [a.zip](${ZIP})\n\nAlso: support dark mode.` }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain('Also: support dark mode.')
  expect(r.deny).toContain('issue_edit')
  nothingWritten(w)
})

test('design_write refuses a "* " item under ## Attachments, before uploading anything', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: `Idea\n\n## Attachments\n\n* [a.zip](${ZIP})\n` }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain(`* [a.zip](${ZIP})`)
  nothingWritten(w)
})

test("design_write keeps the idea's own attachment links in the body", async ($, on) => {
  const PNG = 'https://github.com/user-attachments/assets/sss'
  const w = await boot($, on, { reply: world({ body: `Sketch: ![s.png](${PNG})` }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toBeUndefined()
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe(`THE DESIGN\n\n## Attachments\n\n- ![s.png](${PNG})\n- [idea.md](${IDEA})\n`)
})

test('design_write refuses an attachment the idea holds other than as a link, before uploading anything', async ($, on) => {
  const IMG = 'https://github.com/user-attachments/assets/ttt'
  const w = await boot($, on, { reply: world({ body: `Sketch: <img src="${IMG}">` }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain(IMG)
  nothingWritten(w)
})

test('design_write builds the new body on the one read after the upload', async ($, on) => {
  const bodyAfterUpload = `my idea\n\n## Attachments\n\n- [visual-companion.zip](${ZIP})\n`
  const w = await boot($, on, { reply: world({ body: 'my idea', bodyAfterUpload }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toBeUndefined()
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe(`THE DESIGN\n\n## Attachments\n\n- [visual-companion.zip](${ZIP})\n- [idea.md](${IDEA})\n`)
})

test('design_write refuses when the idea changed during the upload, and names the upload', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: 'my idea', bodyAfterUpload: 'my idea, changed' }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain('changed')
  expect(r.deny).toContain('unchanged')
  expect(r.deny).toContain(`[idea.md](${IDEA})`)
  expect(w.spawned.some(s => s.argv[2] === 'edit')).toBe(false)
  expect(argvs(w).some(a => a.startsWith('gh project item-edit'))).toBe(false)
})

test('design_write names the written design when moving it to Designed fails', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: 'my idea', statusFails: true }) })
  const r = await callTool($, 'design_write', { issue: url(10), design: 'THE DESIGN' })
  expect(r.deny).toContain(`wrote the design to [#10 Task 10: T10](${url(10)}), then moving it to Designed failed`)
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain("don't call design_write again")
  expect(uploads(w)).toHaveLength(1)
  expect(w.spawned.filter(s => s.argv[2] === 'edit')).toHaveLength(1)
})
