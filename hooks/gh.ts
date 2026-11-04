import type { EngineInterface } from 'claude-code'

// What helpers may call on `$`. The engine refuses to load a module that hands `$` itself to a
// function, so the hook builds this from closures that spell `$.noun.method(...)` (registerTools).
export type Io = {
  process: Pick<EngineInterface['process'], 'spawn'>
  fs: Pick<EngineInterface['fs'], 'write' | 'exists' | 'stat'> & { read: (path: string) => Promise<string> } // text only: $.fs.read is overloaded
}

// An error whose message is meant for the model as it stands.
export class ToolError extends Error {}

export type Ran = { code: number; stdout: string; stderr: string }
type RunOptions = { cwd?: string; input?: string }

export async function run(io: Io, argv: string[], opts: RunOptions = {}): Promise<Ran> {
  const child = io.process.spawn({ argv, ...opts })
  let stdout = ''
  let stderr = ''
  for await (const { stream, text } of child) {
    if (stream === 'stdout') stdout += text
    else stderr += text
  }
  const { code } = await child.result
  return { code: code ?? 1, stdout, stderr } // a signal reads as code 1
}

// Runs a command and returns its stdout; a non-zero exit throws with the command's own words.
export async function runOk(io: Io, argv: string[], opts?: RunOptions): Promise<string> {
  const r = await run(io, argv, opts)
  if (r.code !== 0) throw new ToolError(`\`${argv.join(' ')}\` failed (exit ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`)
  return r.stdout
}

export const gh = (io: Io, args: string[], opts?: RunOptions) => runOk(io, ['gh', ...args], opts)
export const git = (io: Io, args: string[], opts?: RunOptions) => runOk(io, ['git', ...args], opts)

export async function graphql<T>(io: Io, operationName: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await run(io, ['gh', 'api', 'graphql', '--input', '-'], { input: JSON.stringify({ query, variables, operationName }) })
  let body: { data?: T; errors?: { message: string }[] } | undefined
  try {
    body = JSON.parse(r.stdout)
  } catch {
    // not JSON: reported below with gh's own output
  }
  const errors = body?.errors?.map(e => e.message).join('; ')
  if (r.code !== 0 || errors || body?.data === undefined) {
    throw new ToolError(`GraphQL ${operationName} failed (exit ${r.code}): ${errors || r.stderr.trim() || r.stdout.trim()}`)
  }
  return body.data
}

type Page<N> = { nodes: N[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }

// Runs a paged query until its last page, passing `after: endCursor` (null on the first call).
export async function graphqlPages<N>(io: Io, operationName: string, query: string, variables: Record<string, unknown>, pick: (data: any) => Page<N>): Promise<N[]> {
  const all: N[] = []
  for (let after: string | null = null; ;) {
    const page: Page<N> = pick(await graphql(io, operationName, query, { ...variables, after }))
    all.push(...page.nodes)
    if (!page.pageInfo.hasNextPage) return all
    after = page.pageInfo.endCursor
  }
}

export type IssueRef = { owner: string; name: string; repo: string; number: number; url: string }

const ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/([1-9]\d*)\/?(?:#.*)?$/
const ISSUE_SHORT = /^([\w.-]+)\/([\w.-]+)#([1-9]\d*)$/

export function parseIssue(ref: string): IssueRef {
  const m = ISSUE_URL.exec(ref) ?? ISSUE_SHORT.exec(ref)
  if (!m) throw new ToolError(`Give the issue's URL (https://github.com/<owner>/<repo>/issues/<number>) or <owner>/<repo>#<number>, not "${ref}".`)
  const [owner, name, number] = [m[1]!, m[2]!, Number(m[3])]
  return { owner, name, repo: `${owner}/${name}`, number, url: `https://github.com/${owner}/${name}/issues/${number}` }
}
