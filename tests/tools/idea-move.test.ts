import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, commentsPage, type ItemSpec, type Reply, repoData, router, type Spawned, url, workData, type World } from '../kit'

const [IDEAS, APP, SITE] = ['trackness/ideas', 'trackness/app', 'trackness/site']
const OLD = url(5, IDEAS)
const OLD_MD = 'https://github.com/user-attachments/files/1/idea.md'
const OLD_PNG = 'https://github.com/user-attachments/assets/aaa'
const NEW_MD = 'https://github.com/user-attachments/files/91/idea.md'
const NEW_PNG = 'https://github.com/user-attachments/assets/bbb'
const BODY = `Idea\n\n## Attachments\n\n- [idea.md](${OLD_MD})\n`

// Each destination links an unrelated board first, so its own board is #2 and never the ideas board's #1.
const REPOS: Record<string, unknown> = {
  ideas: repoData({ repo: IDEAS }),
  app: repoData({ repo: APP, boards: ['notes', 'app'] }),
  site: repoData({ repo: SITE, isPrivate: false, boards: ['notes', 'site'] }),
  bare: repoData({ repo: 'trackness/bare', boards: [] }),
  demo: repoData({}),
}

const add = (n: number, repo: string) => `gh project item-add 2 --owner trackness --url ${url(n, repo)}`
const edit = (n: number, repo: string, s: string) => `gh project item-edit 2 --owner trackness --url ${url(n, repo)} --field Status --value ${s}`
const issueCalls = (w: World, verb: string) => w.spawned.filter(s => s.argv[1] === 'issue' && s.argv[2] === verb)
const uploads = (w: World) => w.spawned.filter(s => s.argv[1] === 'image' && s.argv[2] !== 'download')
const nothingMoved = (w: World) => {
  expect(w.spawned.some(s => s.argv[1] === 'image')).toBe(false)
  expect(issueCalls(w, 'transfer')).toEqual([])
  expect(issueCalls(w, 'create')).toEqual([])
}

// A download names its file as gh-image does (an /assets/ URL as <uuid>.png) and stores `md` in `files`, which a test must hand to boot so the mod can read it.
const world = (o: { idea?: Partial<ItemSpec>; parent?: ItemSpec; own?: ItemSpec[]; tasks?: ItemSpec[]; moved?: Partial<ItemSpec>; fail?: string; list?: Reply; comments?: string[]; md?: string } = {}) => {
  const files: Record<string, string> = {}
  const reply = router({
    graphql: {
      Repo: v => REPOS[v.name],
      Work: v =>
        v.name === 'ideas'
          ? workData({ issue: { number: 5, status: 'Designed', title: 'My idea', body: BODY, ...o.idea }, parent: o.parent, own: o.own, tasks: o.tasks, repo: IDEAS })
          : workData({ issue: { number: 3, title: 'My idea', body: BODY, onBoard: false, ...o.moved }, repo: APP, board: 2 }),
      Comments: v => (o.comments ? commentsPage(o.comments) : v.after === 'c1' ? commentsPage([`second ![s.png](${OLD_PNG})`]) : commentsPage(['first'], 'c1')),
    },
    cli: (s: Spawned) => {
      const [cmd, sub, verb, flag, dir, from] = s.argv
      if (o.fail && verb === o.fail) return { code: 1, stderr: 'HTTP 502' }
      if (cmd === 'mkdir') return {}
      if (sub === 'extension') return { stdout: 'gh image\tdrogers0/gh-image\tv1.4.1\n' }
      if (sub === 'image' && verb === 'download') {
        if (flag !== '--output-dir') return {}
        const path = `${dir}/${from!.split('/').pop()}${from!.includes('/assets/') ? '.png' : ''}`
        files[path] = o.md ?? 'Idea'
        return { stdout: `${path}\n` }
      }
      if (sub === 'image') return { stdout: verb!.endsWith('/idea.md') ? `[idea.md](${NEW_MD})\n` : `![s.png](${NEW_PNG})\n` }
      if (sub === 'project') return {}
      if (sub === 'issue') return verb === 'transfer' ? { stdout: url(3, APP) + '\n' } : verb === 'create' ? { stdout: url(4, SITE) + '\n' } : verb === 'list' ? (o.list ?? { stdout: '[]' }) : {}
      return undefined
    },
  })
  return Object.assign(reply, { files })
}

test('a move to a private repo transfers the issue and keeps its column', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.deny).toBeUndefined()
  const a = argvs(w)
  expect(a).toContain(`gh issue transfer ${OLD} ${APP}`)
  expect(a).toContain(add(3, APP))
  expect(a).toContain(edit(3, APP, 'Designed'))
  expect(a.indexOf(add(3, APP))).toBeLessThan(a.indexOf(edit(3, APP, 'Designed')))
  expect(r.text).toContain(url(3, APP))
  expect(r.text).not.toContain('Lost in the transfer:')
  expect(issueCalls(w, 'create')).toEqual([])
})

test('a private move removes the idea\'s card from the ideas board after the transfer', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.deny).toBeUndefined()
  const a = argvs(w)
  const remove = 'gh project item-delete 1 --owner trackness --id item-5'
  expect(a).toContain(remove)
  expect(a.indexOf(`gh issue transfer ${OLD} ${APP}`)).toBeLessThan(a.indexOf(remove))
})

test('a private move whose transfer fails leaves the idea\'s card on the ideas board', async ($, on) => {
  const w = await boot($, on, { reply: world({ fail: 'transfer' }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.deny).toContain('HTTP 502')
  expect(argvs(w).some(a => a.startsWith('gh project item-delete'))).toBe(false)
})

test('a private move whose card removal fails names the moved issue and transfers nothing twice', async ($, on) => {
  const w = await boot($, on, { reply: world({ fail: 'item-delete' }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.deny).toContain(`transferred ${OLD} to ${url(3, APP)}, then removing its card from board "ideas" failed`)
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain("don't transfer it again")
  expect(issueCalls(w, 'transfer')).toHaveLength(1)
})

test('a transfer that lost something says what', async ($, on) => {
  await boot($, on, { reply: world({ moved: { body: 'Idea\n' } }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.text).toContain('Lost in the transfer:')
  expect(r.text).toContain(OLD_MD)
  expect(r.text!.split('\n').find(l => l.includes(OLD_MD))).toMatch(/^Lost in the transfer:/)
})

test('a transfer names a lost sub-issue of an idea that also has a parent', async ($, on) => {
  await boot($, on, { reply: world({ parent: { number: 2 }, own: [{ number: 7 }] }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.text).toContain('Lost in the transfer: parent #2')
  expect(r.text).toContain('Lost in the transfer: sub-issue #7')
})

test('a private move that fails after the transfer names the moved issue and transfers nothing twice', async ($, on) => {
  const w = await boot($, on, { reply: world({ fail: 'item-edit' }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.deny).toContain(`transferred ${OLD} to ${url(3, APP)}, then setting its Status failed`)
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain("don't transfer it again")
  expect(issueCalls(w, 'transfer')).toHaveLength(1)
  expect(issueCalls(w, 'create')).toEqual([])
})

test('a move to a public repo recreates the issue with fresh attachments and no link back', async ($, on) => {
  const reply = world()
  const w = await boot($, on, { reply, files: reply.files })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toBeUndefined()
  expect(reply.seen.Comments).toEqual([{ owner: 'trackness', name: 'ideas', number: 5, after: null }, { owner: 'trackness', name: 'ideas', number: 5, after: 'c1' }])
  const created = issueCalls(w, 'create')
  expect(created).toHaveLength(1)
  expect(created[0]!.argv).toEqual(['gh', 'issue', 'create', '-R', SITE, '--title', 'My idea', '--body-file', '-'])
  expect(created[0]!.input).toContain(NEW_MD)
  expect(created[0]!.input).not.toContain('files/1/idea.md')
  const comments = issueCalls(w, 'comment')
  expect(comments.map(s => s.input)).toEqual(['first', `second ![s.png](${NEW_PNG})`])
  expect(comments.every(s => s.argv[3] === url(4, SITE))).toBe(true)
  const postedToPublic = [created[0]!, ...comments]
  expect(postedToPublic.some(s => s.input!.includes(IDEAS))).toBe(false)
  const a = argvs(w)
  expect(a.some(x => /^gh image download --output-dir \/tmp\/superpowers-github\/\S+ https:\/\/github\.com\/user-attachments\/files\/1\/idea\.md$/.test(x))).toBe(true)
  // gh-image makes the download folder itself
  expect(a.some(x => x.startsWith('mkdir'))).toBe(false)
  expect(a.indexOf('gh extension list')).toBeLessThan(a.findIndex(x => x.startsWith('gh image download')))
  expect(a.indexOf('gh extension list')).not.toBe(-1)
  expect(a).toContain(add(4, SITE))
  expect(a).toContain(edit(4, SITE, 'Designed'))
  expect(a.indexOf(add(4, SITE))).toBeLessThan(a.indexOf(edit(4, SITE, 'Designed')))
  const close = `gh issue close ${OLD} --comment Moved to ${url(4, SITE)}`
  expect(a).toContain(close)
  expect(a.indexOf(close)).toBe(a.length - 1)
})

test('a public move uploads each attachment under the name gh-image gives it, not its link text', async ($, on) => {
  const reply = world({ comments: [`![login screen](${OLD_PNG})`] })
  const w = await boot($, on, { reply, files: reply.files })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toBeUndefined()
  expect(uploads(w).map(s => s.argv[2]!.split('/').pop())).toEqual(['aaa.png', 'idea.md'])
})

test('a public move swaps the links inside idea.md for the new uploads, and uploads it last', async ($, on) => {
  const reply = world({ md: `Sketch: ![s.png](${OLD_PNG})` })
  const w = await boot($, on, { reply, files: reply.files })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toBeUndefined()
  const [png, md] = uploads(w).map(s => s.argv[2]!)
  expect(png).toMatch(/\/aaa\.png$/)
  expect(md).toMatch(/\/idea\.md$/)
  expect(w.written[md!]).toBe(`Sketch: ![s.png](${NEW_PNG})`)
})

test('a public move refuses an idea.md that links an attachment the issue does not, before uploading anything', async ($, on) => {
  const stray = 'https://github.com/user-attachments/assets/zzz'
  const reply = world({ md: `see ![x](${stray})` })
  const w = await boot($, on, { reply, files: reply.files })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain(stray)
  expect(uploads(w)).toEqual([])
  expect(issueCalls(w, 'create')).toEqual([])
})

test('a public move whose create fails names the uploads it made', async ($, on) => {
  const reply = world({ fail: 'create' })
  const w = await boot($, on, { reply, files: reply.files })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain(`Already uploaded to ${SITE}, linked from nowhere:`)
  expect(r.deny).toContain(NEW_MD)
  expect(r.deny).toContain(NEW_PNG)
  expect(issueCalls(w, 'create')).toHaveLength(1)
})

test('a public move that fails after the create names the new issue and creates nothing twice', async ($, on) => {
  const reply = world({ fail: 'item-edit' })
  const w = await boot($, on, { reply, files: reply.files })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain(`created ${url(4, SITE)}, then`)
  expect(r.deny).toContain('item-edit')
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain('Not retried')
  expect(issueCalls(w, 'create')).toHaveLength(1)
  expect(issueCalls(w, 'comment')).toEqual([])
  expect(issueCalls(w, 'close')).toEqual([])
})

test('a public move whose create made the issue before failing names it and goes no further', async ($, on) => {
  const list = { stdout: JSON.stringify([{ number: 4, title: 'My idea', body: BODY.replace(OLD_MD, NEW_MD), url: url(4, SITE), createdAt: new Date().toISOString() }]) }
  const reply = world({ fail: 'create', list })
  const w = await boot($, on, { reply, files: reply.files })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain(`created ${url(4, SITE)}, then gh failed`)
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain('Not retried')
  // the uploads are linked from the issue it names
  expect(r.deny).not.toContain('linked from nowhere')
  expect(argvs(w)).toContain(`gh issue list -R ${SITE} --author @me --state open --limit 20 --json number,title,body,url,createdAt`)
  expect(issueCalls(w, 'create')).toHaveLength(1)
  expect(argvs(w).some(a => a.startsWith('gh project item-edit'))).toBe(false)
  expect(issueCalls(w, 'comment')).toEqual([])
  expect(issueCalls(w, 'close')).toEqual([])
})

test('a public move refuses an oversized comment before uploading anything', async ($, on) => {
  const w = await boot($, on, { reply: world({ comments: ['first', 'x'.repeat(65_537)] }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain('comment 2 of 2')
  expect(r.deny).toContain('65,536')
  nothingMoved(w)
})

test('a public move refuses an attachment that is not a link before uploading anything', async ($, on) => {
  const bare = 'https://github.com/user-attachments/assets/ccc'
  const w = await boot($, on, { reply: world({ comments: [`see ${bare}`] }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain(bare)
  expect(r.deny).not.toContain(OLD_MD)
  nothingMoved(w)
})

test('idea_move refuses an idea in Done before moving anything', async ($, on) => {
  const w = await boot($, on, { reply: world({ idea: { status: 'Done' } }) })
  for (const to of [APP, SITE]) expect((await callTool($, 'idea_move', { issue: OLD, to })).deny).toContain('is in Done')
  nothingMoved(w)
})

test('a public move refuses an idea with sub-issues or dependency links', async ($, on) => {
  const w = await boot($, on, { reply: world({ tasks: [{ number: 6 }] }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain('#6')
  expect(argvs(w).some(a => a.startsWith('gh issue create'))).toBe(false)
  expect(w.spawned.some(s => s.argv[1] === 'image')).toBe(false)
})

test('idea_move only moves issues from the ideas repo', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'idea_move', { issue: url(5), to: APP })
  expect(r.deny).toContain('trackness/ideas')
  expect(w.spawned.some(s => s.argv[1] === 'issue')).toBe(false)
})

test('idea_move needs the destination board', async ($, on) => {
  const w = await boot($, on, { reply: world() })
  const r = await callTool($, 'idea_move', { issue: OLD, to: 'trackness/bare' })
  expect(r.deny).toContain('board_setup')
  expect(w.spawned.some(s => s.argv[1] === 'issue')).toBe(false)
})
