import { IDEAS_REPO, type Status, TOOL_PREFIX } from './config.ts'
import { gh, graphql, type Io, parseIssue, run, ToolError } from './gh.ts'

export type Board = { owner: string; number: number; title: string; url: string }
export type RepoInfo = { repo: string; isPrivate: boolean; board?: Board }
export type Item = { number: number; url: string; title: string; closed: boolean; onBoard: boolean; status?: Status; body: string; blockedBy: number[]; blocking: number[] }
export type Work = { repo: RepoInfo; board: Board; issue: Item; parent?: Item; tasks: Item[] }

export const NOT_DONE = `only GitHub's "Item closed" workflow moves an issue to Done, when the issue is closed`

export const link = (i: { number: number; title: string; url: string }) => `[#${i.number} ${i.title}](${i.url})`

// The new issue is on the board already: `gh issue create --project` added it.
export const created = (url: string, title: string, body: string): Item => ({ ...parseIssue(url), title, body, closed: false, onBoard: true, blockedBy: [], blocking: [] })

// A step that fails after a write that must not happen twice: name the write and the step, so nothing is written again.
export const failedAfter = (done: string, step: string, err: unknown, again = 'create the issue') =>
  new ToolError(`${done}, then ${step} failed: ${err instanceof Error ? err.message : err}. Not retried: fix that step; don't ${again} again.`)

// `gh issue create` creates the issue, then applies --project, --parent and --blocked-by, and exits non-zero without
// printing the URL when one of those fails: so a failed create looks for the issue it may have made.
export async function createIssue(io: Io, repo: string, project: string, title: string, body: string, links: string[] = []): Promise<string> {
  const since = Date.now() - 2 * 60_000 // GitHub's clock may run behind ours
  try {
    return (await gh(io, ['issue', 'create', '-R', repo, ...links, '--project', project, '--title', title, '--body-file', '-'], { input: body })).trim().split('\n').pop()!
  } catch (err) {
    // No --search: the search index can lag behind a new issue.
    const made = await gh(io, ['issue', 'list', '-R', repo, '--author', '@me', '--state', 'open', '--limit', '20', '--json', 'number,title,url,createdAt'])
      .then(out => (JSON.parse(out) as { title: string; url: string; createdAt: string }[]).find(i => i.title === title && Date.parse(i.createdAt) >= since))
      .catch(() => undefined)
    if (made) throw failedAfter(`created ${made.url}`, "gh's own --parent/--blocked-by/--project step", err)
    throw new ToolError(`${err instanceof Error ? err.message : err}. gh creates the issue before applying --parent, --blocked-by and --project, so it may already exist: check \`gh issue list -R ${repo} --author @me\` before calling again.`)
  }
}

// shortcut: reads the first 100 boards linked to the repo; page through them if a repo ever links more.
const REPO = `query Repo($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    isPrivate
    projectsV2(first: 100) { nodes { number title url owner { ... on User { login } ... on Organization { login } } } }
  }
}`

// GitHub allows at most 100 sub-issues per parent, so one page holds every task.
const WORK = `fragment Item on Issue {
  number url title closed body
  blockedBy(first: 100) { nodes { number } }
  blocking(first: 100) { nodes { number } }
  projectItems(first: 100) { nodes { project { url } status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } }
}
query Work($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      ...Item
      subIssues(first: 100) { nodes { ...Item } }
      parent { ...Item subIssues(first: 100) { nodes { ...Item } } }
    }
  }
}`

export function splitRepo(repo: string): [owner: string, name: string] {
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repo)
  if (!m) throw new ToolError(`Give the repo as <owner>/<name>, not "${repo}".`)
  return [m[1]!, m[2]!]
}

export async function repoInfo(io: Io, repo: string): Promise<RepoInfo> {
  const [owner, name] = splitRepo(repo)
  const { repository: r } = await graphql<any>(io, 'Repo', REPO, { owner, name })
  // GitHub's spelling of the name, so a differently cased input still finds the board and the ideas repo.
  const title = r.nameWithOwner.split('/')[1]
  const p = r.projectsV2.nodes.find((p: any) => p?.title === title)
  return { repo: r.nameWithOwner, isPrivate: r.isPrivate, board: p && { owner: p.owner.login, number: p.number, title: p.title, url: p.url } }
}

export function requireBoard(info: RepoInfo): Board {
  if (!info.board) throw new ToolError(`${info.repo} has no board. Ask James once whether to set one up, then call ${TOOL_PREFIX}board_setup.`)
  return info.board
}

export function assertWritable(info: RepoInfo): void {
  if (info.repo === IDEAS_REPO && !info.isPrivate) throw new ToolError(`${IDEAS_REPO} is public, and it must stay private: make it private again before anything is written to it.`)
}

export async function readWork(io: Io, issueUrl: string): Promise<Work> {
  const ref = parseIssue(issueUrl)
  const repo = await repoInfo(io, ref.repo)
  const board = requireBoard(repo)
  const { repository } = await graphql<any>(io, 'Work', WORK, { owner: ref.owner, name: ref.name, number: ref.number })
  const item = (n: any): Item => {
    const onBoard = n.projectItems.nodes.find((p: any) => p?.project?.url === board.url)
    const numbers = (c: any): number[] => c.nodes.map((i: any) => i.number)
    return { number: n.number, url: n.url, title: n.title, closed: n.closed, onBoard: !!onBoard, status: onBoard?.status?.name, body: n.body, blockedBy: numbers(n.blockedBy), blocking: numbers(n.blocking) }
  }
  const raw = repository.issue
  return { repo, board, issue: item(raw), parent: raw.parent ? item(raw.parent) : undefined, tasks: (raw.parent ?? raw).subIssues.nodes.map(item) }
}

// The spec's table: all Todo → Todo; all Done → Done; all In Review or Done → In Review; anything between → In Progress.
export function deriveParentStatus(tasks: (Status | undefined)[]): Status {
  const s = tasks.map(t => t ?? 'Todo')
  if (s.every(t => t === 'Done')) return 'Done'
  if (s.every(t => t === 'In Review' || t === 'Done')) return 'In Review'
  if (s.every(t => t === 'Todo')) return 'Todo'
  return 'In Progress'
}

export async function setStatus(io: Io, board: Board, issue: Item, status: Status): Promise<void> {
  if (status === 'Done') throw new ToolError(NOT_DONE)
  const item = [String(board.number), '--owner', board.owner, '--url', issue.url]
  if (!issue.onBoard) await gh(io, ['project', 'item-add', ...item])
  await gh(io, ['project', 'item-edit', ...item, '--field', 'Status', '--value', status])
}

export async function recomputeParent(io: Io, work: Work, moved?: { number: number; status: Status }): Promise<string | undefined> {
  const parent = work.parent ?? work.issue
  const statuses = work.tasks.map(t => (t.number === moved?.number ? moved.status : t.status))
  if (moved && !work.tasks.some(t => t.number === moved.number)) statuses.push(moved.status)
  if (!statuses.length) return undefined
  const status = deriveParentStatus(statuses)
  if (status === parent.status || status === 'Done') return undefined
  await setStatus(io, work.board, parent, status)
  return `Moved parent ${link(parent)} to ${status}, derived from its tasks.`
}

export function closedNotDone(work: Work): string[] {
  const { title, url } = work.board
  return [work.parent ?? work.issue, ...work.tasks]
    .filter(i => i.closed && i.status !== 'Done')
    .map(i => `#${i.number} is closed but not in Done on board "${title}" (${url}): "Item closed" isn't moving closed issues. Open the board's Workflows and turn on "Item closed" with Status = Done.`)
}

export async function currentRepo(io: Io): Promise<string | undefined> {
  const r = await run(io, ['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  return (r.code === 0 && r.stdout.trim()) || undefined
}
