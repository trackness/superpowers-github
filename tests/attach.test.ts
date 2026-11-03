import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, repoData, router, type Reply, type Spawned, url, workData } from './kit.ts'

const IDEA = 'https://github.com/user-attachments/files/7/idea.md'
const UPLOADED = `[idea.md](${IDEA})\n`

const world = (o: { body?: string; ext?: string; upload?: Reply } = {}) =>
  router({
    graphql: { Repo: () => repoData({}), Work: () => workData({ issue: { number: 10, body: o.body ?? 'B' } }) },
    cli: (s: Spawned) => {
      if (s.argv[1] === 'extension') return { stdout: o.ext ?? 'gh image\tdrogers0/gh-image\tv1.4.1\n' }
      if (s.argv[1] === 'image') return o.upload ?? { stdout: `fast upload unavailable (HTTP 422); using browser session\n${UPLOADED}` }
      if (s.argv[1] === 'issue' || s.argv[0] === 'mkdir' || s.argv[0] === 'zip') return {}
      return undefined
    },
  })

const files = { '/tmp/x/idea.md': 'the idea' }

test('attach refuses when gh-image is not the pinned version', async ($, on) => {
  const w = await boot($, on, { reply: world({ ext: 'gh image\tdrogers0/gh-image\tv1.3.0\n' }), files })
  const r = await callTool($, 'attach', { issue: url(10), path: '/tmp/x/idea.md' })
  expect(r.deny).toContain('gh extension install drogers0/gh-image --pin v1.4.1')
  expect(w.spawned.some(s => s.argv[1] === 'image')).toBe(false)
})

test('attach uploads a file and lists it under Attachments', async ($, on) => {
  const w = await boot($, on, { reply: world(), files })
  const r = await callTool($, 'attach', { issue: url(10), path: '/tmp/x/idea.md' })
  expect(r.deny).toBeUndefined()
  expect(w.spawned.find(s => s.argv[1] === 'image')!.argv).toEqual(['gh', 'image', '/tmp/x/idea.md', '--repo', 'trackness/demo'])
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe(`B\n\n## Attachments\n\n- [idea.md](${IDEA})\n`)
})

test('attach adds to an existing list that a later section follows', async ($, on) => {
  const A = 'https://github.com/user-attachments/files/1/a'
  const body = `B\n\n## Attachments\n\n- [a](${A})\n\n## Plan\n\nP`
  const w = await boot($, on, { reply: world({ body }), files })
  await callTool($, 'attach', { issue: url(10), path: '/tmp/x/idea.md' })
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe(`B\n\n## Attachments\n\n- [a](${A})\n- [idea.md](${IDEA})\n\n## Plan\n\nP`)
})

test('attach zips a directory before uploading it', async ($, on) => {
  const w = await boot($, on, { reply: world(), dirs: ['/tmp/brainstorm-1/content'] })
  const r = await callTool($, 'attach', { issue: url(10), path: '/tmp/brainstorm-1/content', name: 'visual-companion.zip' })
  expect(r.deny).toBeUndefined()
  const zip = w.spawned.find(s => s.argv[0] === 'zip')!
  const Z = zip.argv[3]!
  expect(zip.argv).toEqual(['zip', '-r', '-q', Z, '.'])
  expect(zip.cwd).toBe('/tmp/brainstorm-1/content')
  expect(Z).toMatch(/^\/tmp\/superpowers-github\/[^/]+\/visual-companion\.zip$/)
  expect(w.spawned.find(s => s.argv[1] === 'image')!.argv[2]).toBe(Z)
  // the output folder exists before zip writes into it
  expect(argvs(w)).toContain(`mkdir -p ${Z.replace('/visual-companion.zip', '')}`)
})

test("attach stops with gh-image's own output when the upload fails", async ($, on) => {
  const w = await boot($, on, { reply: world({ upload: { code: 1, stderr: 'session token expired' } }), files })
  const r = await callTool($, 'attach', { issue: url(10), path: '/tmp/x/idea.md' })
  expect(r.deny).toContain('session token expired')
  expect(r.deny).toContain('/tmp/x/idea.md')
  expect(w.spawned.some(s => s.argv[2] === 'edit')).toBe(false)
})

test('attach stops when gh-image prints no reference', async ($, on) => {
  const w = await boot($, on, { reply: world({ upload: { stdout: 'ok\n' } }), files })
  const r = await callTool($, 'attach', { issue: url(10), path: '/tmp/x/idea.md' })
  expect(r.deny).toContain('no reference')
  expect(w.spawned.some(s => s.argv[2] === 'edit')).toBe(false)
})

test('attach keeps the uploaded reference when the new body is too long', async ($, on) => {
  const w = await boot($, on, { reply: world({ body: 'x'.repeat(65_530) }), files })
  const r = await callTool($, 'attach', { issue: url(10), path: '/tmp/x/idea.md' })
  expect(r.deny).toContain('65,536')
  expect(r.deny).toContain(IDEA)
  expect(w.spawned.some(s => s.argv[2] === 'edit')).toBe(false)
})
