import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { type Status, TOOL_PREFIX } from '../hooks/config'

export const DEMO = 'trackness/demo'
export const url = (n: number, repo = DEMO) => `https://github.com/${repo}/issues/${n}`

// The run folder for parent #12 in the /work/repo checkout, and the .gitignore that keeps it out of git.
export const DIR = '/work/repo/.superpowers/sdd/12'
export const IGNORE = '/work/repo/.superpowers/sdd/.gitignore'

export type Spawned = { argv: string[]; cwd?: string; input?: string }
export type Reply = { stdout?: string; stderr?: string; code?: number }
export type World = { spawned: Spawned[]; written: Record<string, string>; registered: string[] }
export type Verdict = { decision: 'allow' | 'ask' | 'deny'; reason?: string; rule?: string; plugin?: string }

// The fs.write stand-in replaces the engine's own write, so it keeps the engine's limit (checked live on 2.1.317).
const WRITE_LIMIT = 4 * 1024 * 1024

// Stands in for everything beneath the plugin, then starts the session.
export async function boot($: Engine, on: On, o: { reply: (s: Spawned) => Reply; files?: Record<string, string>; dirs?: string[]; cwd?: string; check?: (e: { tool: string; input: unknown }) => Verdict }): Promise<World> {
  const w: World = { spawned: [], written: {}, registered: [] }
  const files = o.files ?? {}
  const dirs = o.dirs ?? []
  const isFile = (path: string) => Object.hasOwn(files, path)
  on('tool.register', (_, e) => {
    w.registered.push(e.name)
    return { value: { tool: TOOL_PREFIX + e.name } }
  })
  on('tool.check', (_, e) => o.check?.(e) ?? { decision: 'allow' })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('process.spawn', async function* (_, e) {
    const s: Spawned = { argv: [...e.argv], cwd: e.cwd, input: e.input }
    w.spawned.push(s)
    const r = o.reply(s)
    if (r.stdout) yield { stream: 'stdout' as const, text: r.stdout }
    if (r.stderr) yield { stream: 'stderr' as const, text: r.stderr }
    return { value: { code: r.code ?? 0, signal: null } }
  })
  on('fs.read', (_, e) => (isFile(e.path) ? { value: files[e.path]! } : { deny: `ENOENT: ${e.path}` }))
  on('fs.write', (_, e) => {
    const bytes = new TextEncoder().encode(e.text).length
    if (bytes > WRITE_LIMIT) return { deny: `${e.path} refused: ${bytes} bytes is over the ${WRITE_LIMIT}-byte limit` }
    w.written[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', (_, e) => ({ value: isFile(e.path) || Object.hasOwn(w.written, e.path) || dirs.includes(e.path) }))
  // `dir`, not `directory`: what a live $.fs.stat answers for a directory on 2.1.317.
  on('fs.stat', (_, e) =>
    dirs.includes(e.path) ? { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    : isFile(e.path) ? { value: { kind: 'file' as const, size: new TextEncoder().encode(files[e.path]).length, mtimeMs: 0, isLink: false } }
    : { deny: `ENOENT: ${e.path}` })
  await $.session.start({ cwd: o.cwd ?? '/work/repo', surface: null, isInteractive: false })
  return w
}

let calls = 0

export async function callTool($: Engine, name: string, input: Record<string, unknown>): Promise<{ text?: string; deny?: string }> {
  const r = await $.tool.call({ ...input, tool: `${TOOL_PREFIX}${name}` as const, tool_use_id: `toolu_test_${++calls}` })
  if (r.deny !== undefined) return { deny: r.deny }
  if (r.isError) return { deny: r.text }
  return { text: r.result as string }
}

export const argvs = (w: World) => w.spawned.map(s => s.argv.join(' '))

export function router(r: { graphql?: Record<string, (variables: any) => unknown>; cli?: (s: Spawned) => Reply | undefined }) {
  const seen: Record<string, any[]> = {}
  const reply = (s: Spawned): Reply => {
    if (s.argv.slice(0, 3).join(' ') === 'gh api graphql') {
      const { query, operationName, variables } = JSON.parse(s.input ?? '{}')
      // As GitHub does: a name the query text does not declare is refused.
      if (!new RegExp(`\\b(?:query|mutation)\\s+${operationName}\\b`).test(query ?? '')) return { code: 1, stderr: `No operation named "${operationName}"` }
      ;(seen[operationName] ??= []).push(variables)
      const answer = r.graphql?.[operationName]
      if (answer) return { stdout: JSON.stringify({ data: answer(variables) }) }
    } else {
      const answer = r.cli?.(s)
      if (answer) return answer
    }
    return { code: 1, stderr: `unrouted: ${s.argv.join(' ')}` }
  }
  return Object.assign(reply, { seen })
}

export type ItemSpec = { number: number; status?: Status; closed?: boolean; title?: string; body?: string; onBoard?: boolean; archived?: boolean; blockedBy?: number[]; blocking?: number[] }

const boardUrl = (n: number) => `https://github.com/users/trackness/projects/${n}`
const titleOf = (s: ItemSpec) => s.title ?? `Task ${s.number}: T${s.number}`
const numbers = (ns: number[] = []) => ({ nodes: ns.map(number => ({ number })) })

export function repoData(o: { repo?: string; isPrivate?: boolean; boards?: string[] }): unknown {
  const repo = o.repo ?? DEMO
  const boards = o.boards ?? [repo.split('/')[1]!]
  const nodes = boards.map((title, i) => ({ number: i + 1, title, url: boardUrl(i + 1), owner: { login: 'trackness' } }))
  return { repository: { nameWithOwner: repo, isPrivate: o.isPrivate ?? true, projectsV2: { nodes } } }
}

// With `parent`, `tasks` are the parent's sub-issues and `own` the issue's own; otherwise `tasks` are the issue's own.
export function workData(o: { issue: ItemSpec; parent?: ItemSpec; tasks?: ItemSpec[]; own?: ItemSpec[]; board?: number; repo?: string }): unknown {
  const [repo, board, tasks] = [o.repo ?? DEMO, o.board ?? 1, o.tasks ?? []]
  const issue = (s: ItemSpec) => ({
    number: s.number,
    url: url(s.number, repo),
    title: titleOf(s),
    closed: s.closed ?? false,
    body: s.body ?? '',
    blockedBy: numbers(s.blockedBy),
    blocking: numbers(s.blocking),
    projectItems: { nodes: s.onBoard === false ? [] : [{ id: `item-${s.number}`, isArchived: s.archived ?? false, project: { url: boardUrl(board) }, status: s.status ? { name: s.status } : null }] },
  })
  const subIssues = (specs: ItemSpec[]) => ({ nodes: specs.map(issue) })
  const parent = o.parent ? { ...issue(o.parent), subIssues: subIssues(tasks) } : null
  return { repository: { issue: { ...issue(o.issue), subIssues: subIssues(o.own ?? (o.parent ? [] : tasks)), parent } } }
}

export function closingRefsData(o: { body: string; closes: number[]; repo?: string; base?: string }): unknown {
  const nameWithOwner = o.repo ?? DEMO
  const pullRequest = { body: o.body, baseRefName: o.base ?? 'main', closingIssuesReferences: { nodes: o.closes.map(number => ({ number, repository: { nameWithOwner } })) } }
  return { repository: { defaultBranchRef: { name: 'main' }, pullRequest } }
}

export function itemsPage(items: ItemSpec[], nextPageCursor?: string): unknown {
  const nodes = items.map(s => ({ status: s.status ? { name: s.status } : null, content: { number: s.number, title: titleOf(s), url: url(s.number), closed: s.closed ?? false } }))
  return { repositoryOwner: { projectV2: { items: { nodes, pageInfo: { hasNextPage: nextPageCursor !== undefined, endCursor: nextPageCursor ?? null } } } } }
}

export function commentsPage(bodies: string[], nextPageCursor?: string): unknown {
  return { repository: { issue: { comments: { nodes: bodies.map(body => ({ body })), pageInfo: { hasNextPage: nextPageCursor !== undefined, endCursor: nextPageCursor ?? null } } } } }
}

export const projectCreateOutput = (number: number): Reply => ({ stdout: JSON.stringify({ number, id: `P${number}`, url: boardUrl(number) }) })

const project = (p: unknown) => ({ repositoryOwner: { projectV2: p } })

export const fieldsData = (options: string[]): unknown => project({ id: 'P1', field: { id: 'F1', options: options.map(name => ({ id: `id-${name}`, name })) } })

export const viewsData = (layouts: string[]): unknown => project({ views: { nodes: layouts.map(layout => ({ layout })) } })

// A workflow left out is one GitHub has deleted.
export const workflowsData = (enabled: Record<string, boolean>): unknown =>
  project({ workflows: { nodes: Object.entries(enabled).map(([name, on]) => ({ id: `wf-${name}`, name, enabled: on })) } })
