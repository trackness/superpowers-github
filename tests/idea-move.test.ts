import { expect, test } from 'claude-code/testing'
import { argvs, boot, callTool, commentsPage, type ItemSpec, repoData, router, type Spawned, url, workData, type World } from './kit.ts'

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

// The idea is #5 in Designed on the ideas board, with two pages of comments. A transfer answers app#3 (not on app's board); a create answers site#4.
// `fail` names the gh verb (transfer, item-edit, comment…) that exits 1.
const world = (o: { idea?: Partial<ItemSpec>; tasks?: ItemSpec[]; moved?: Partial<ItemSpec>; fail?: string } = {}) =>
  router({
    graphql: {
      Repo: v => REPOS[v.name],
      Work: v =>
        v.name === 'ideas'
          ? workData({ issue: { number: 5, status: 'Designed', title: 'My idea', body: BODY, ...o.idea }, tasks: o.tasks, repo: IDEAS })
          : workData({ issue: { number: 3, title: 'My idea', body: BODY, onBoard: false, ...o.moved }, repo: APP, board: 2 }),
      Comments: v => (v.after === 'c1' ? commentsPage([`second ![s.png](${OLD_PNG})`]) : commentsPage(['first'], 'c1')),
    },
    cli: (s: Spawned) => {
      const [cmd, sub, verb] = s.argv
      if (o.fail && verb === o.fail) return { code: 1, stderr: 'HTTP 502' }
      if (cmd === 'mkdir') return {}
      if (sub === 'extension') return { stdout: 'gh image\tdrogers0/gh-image\tv1.4.1\n' }
      if (sub === 'image') return verb === 'download' ? {} : { stdout: verb!.endsWith('/idea.md') ? `[idea.md](${NEW_MD})\n` : `![s.png](${NEW_PNG})\n` }
      if (sub === 'project') return {}
      if (sub === 'issue') return verb === 'transfer' ? { stdout: url(3, APP) + '\n' } : verb === 'create' ? { stdout: url(4, SITE) + '\n' } : {}
      return undefined
    },
  })

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

test('a transfer that lost something says what', async ($, on) => {
  await boot($, on, { reply: world({ moved: { body: 'Idea\n' } }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: APP })
  expect(r.text).toContain('Lost in the transfer:')
  expect(r.text).toContain(OLD_MD)
  expect(r.text!.split('\n').find(l => l.includes(OLD_MD))).toMatch(/^Lost in the transfer:/)
})

test('a move to a public repo recreates the issue with fresh attachments and no link back', async ($, on) => {
  const reply = world()
  const w = await boot($, on, { reply })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toBeUndefined()
  expect(reply.seen.Comments).toEqual([{ owner: 'trackness', name: 'ideas', number: 5, after: null }, { owner: 'trackness', name: 'ideas', number: 5, after: 'c1' }])
  const created = issueCalls(w, 'create')
  expect(created).toHaveLength(1)
  expect(created[0]!.argv).toEqual(['gh', 'issue', 'create', '-R', SITE, '--project', 'site', '--title', 'My idea', '--body-file', '-'])
  expect(created[0]!.input).toContain(NEW_MD)
  expect(created[0]!.input).not.toContain('files/1/idea.md')
  const comments = issueCalls(w, 'comment')
  expect(comments.map(s => s.input)).toEqual(['first', `second ![s.png](${NEW_PNG})`])
  expect(comments.every(s => s.argv[3] === url(4, SITE))).toBe(true)
  // no link back: nothing posted to the public repo names the ideas repo
  expect([created[0]!, ...comments].some(s => s.input!.includes(IDEAS))).toBe(false)
  const a = argvs(w)
  expect(a.some(x => /^gh image download --output \/tmp\/superpowers-github\/\S+\/idea\.md https:\/\/github\.com\/user-attachments\/files\/1\/idea\.md$/.test(x))).toBe(true)
  // gh-image's pin is checked before its first use, the download
  expect(a.indexOf('gh extension list')).toBeLessThan(a.findIndex(x => x.startsWith('gh image download')))
  expect(a.indexOf('gh extension list')).not.toBe(-1)
  expect(a).toContain(edit(4, SITE, 'Designed'))
  const close = `gh issue close ${OLD} --comment Moved to ${url(4, SITE)}`
  expect(a).toContain(close)
  expect(a.indexOf(close)).toBe(a.length - 1)
})

test('a public move that fails after the create names the new issue and creates nothing twice', async ($, on) => {
  const w = await boot($, on, { reply: world({ fail: 'item-edit' }) })
  const r = await callTool($, 'idea_move', { issue: OLD, to: SITE })
  expect(r.deny).toContain(`created ${url(4, SITE)}, then`)
  expect(r.deny).toContain('item-edit')
  expect(r.deny).toContain('HTTP 502')
  expect(r.deny).toContain('Not retried')
  expect(issueCalls(w, 'create')).toHaveLength(1)
  expect(issueCalls(w, 'comment')).toEqual([])
  expect(issueCalls(w, 'close')).toEqual([])
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
