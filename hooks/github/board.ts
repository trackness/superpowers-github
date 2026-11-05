import { CLOSED_NOT_DONE_GRACE_MS, IDEAS_REPO, type Status, TOOL_PREFIX } from '../config'
import { gh, graphql, type Io, ModelFacingError, parseIssue, run } from './gh'

export type Board = { owner: string; number: number; title: string; url: string }
export type RepoInfo = { repo: string; isPrivate: boolean; board?: Board }
export type Item = { number: number; url: string; title: string; closed: boolean; closedAt?: string; onBoard: boolean; itemId?: string; archivedItemId?: string; status?: Status; body: string; blockedBy: number[]; blocking: number[] }
// `tasks`: the parent's sub-issues when the issue has a parent, else its own.
export type Work = { repo: RepoInfo; board: Board; issue: Item; parent?: Item; tasks: Item[]; ownSubIssues: Item[] }

export const NOT_DONE = `only GitHub's "Item closed" workflow moves an issue to Done, when the issue is closed`

export const link = (i: { number: number; title: string; url: string }) => `[#${i.number} ${i.title}](${i.url})`

export const linkWithColumn = (i: Item) => `${link(i)} — ${i.status ?? (i.onBoard ? 'no Status' : 'not on the board')}`

// setStatus puts it on the board by number: `gh issue create --project` picks a board by title, ignoring case, among every board the user can see.
export const created = (url: string, title: string, body: string): Item => ({ ...parseIssue(url), title, body, closed: false, onBoard: false, blockedBy: [], blocking: [] })

export const failedAfter = (done: string, step: string, err: unknown, again = 'create the issue') =>
  new ModelFacingError(`${done}, then ${step} failed: ${err instanceof Error ? err.message : err}. Not retried: fix that step; don't ${again} again.`)

// `gh issue create` creates the issue, then applies --parent and --blocked-by, and exits non-zero without
// printing the URL when one of those fails: so a failed create looks for the issue it may have made.
export async function createIssue(io: Io, repo: string, title: string, body: string, links: string[] = []): Promise<string> {
  const since = Date.now() - 2 * 60_000 // GitHub's clock may run behind ours
  try {
    return (await gh(io, ['issue', 'create', '-R', repo, ...links, '--title', title, '--body-file', '-'], { input: body })).trim().split('\n').pop()!
  } catch (err) {
    // No --search: the search index can lag behind a new issue. The body tells this issue from another session's with the same title.
    const made = await gh(io, ['issue', 'list', '-R', repo, '--author', '@me', '--state', 'open', '--limit', '20', '--json', 'number,title,body,url,createdAt'])
      .then(out => (JSON.parse(out) as { title: string; body: string; url: string; createdAt: string }[]).find(i => i.title === title && i.body.trim() === body.trim() && Date.parse(i.createdAt) >= since))
      .catch(() => undefined)
    if (made) throw failedAfter(`created ${made.url}`, links.length ? "gh's own --parent/--blocked-by step" : 'gh', err)
    throw new ModelFacingError(`${err instanceof Error ? err.message : err}. gh creates the issue before applying --parent and --blocked-by, so it may already exist: check \`gh issue list -R ${repo} --author @me\` before calling again.`)
  }
}

// shortcut: reads the first 100 boards linked to the repo; page through them if a repo ever links more.
const REPO_FIELDS = `nameWithOwner
    isPrivate
    projectsV2(first: 100) { nodes { number title url owner { ... on User { login } ... on Organization { login } } } }`

const REPO = `query Repo($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    ${REPO_FIELDS}
  }
}`

// GitHub allows at most 100 sub-issues per parent, so one page holds every task.
const WORK = `fragment Item on Issue {
  number url title closed closedAt body
  blockedBy(first: 100) { nodes { number } }
  blocking(first: 100) { nodes { number } }
  projectItems(first: 100) { nodes { id isArchived project { url } status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } }
}
query Work($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    ${REPO_FIELDS}
    issue(number: $number) {
      ...Item
      subIssues(first: 100) { nodes { ...Item } }
      parent { ...Item subIssues(first: 100) { nodes { ...Item } } }
    }
  }
}`

export function splitRepo(repo: string): [owner: string, name: string] {
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repo)
  if (!m) throw new ModelFacingError(`Give the repo as <owner>/<name>, not "${repo}".`)
  return [m[1]!, m[2]!]
}

function toRepoInfo(r: any): RepoInfo {
  // GitHub's spelling of the name, so a differently cased input still finds the board and the ideas repo.
  const title = r.nameWithOwner.split('/')[1]
  const p = r.projectsV2.nodes.find((p: any) => p?.title === title)
  return { repo: r.nameWithOwner, isPrivate: r.isPrivate, board: p && { owner: p.owner.login, number: p.number, title: p.title, url: p.url } }
}

export async function repoInfo(io: Io, repo: string): Promise<RepoInfo> {
  const [owner, name] = splitRepo(repo)
  return toRepoInfo((await graphql<any>(io, 'Repo', REPO, { owner, name })).repository)
}

// For a tool that must work without a board, which readWork requires.
export const issueBody = async (io: Io, url: string): Promise<string> => (JSON.parse(await gh(io, ['issue', 'view', url, '--json', 'body'])) as { body: string }).body

export function requireBoard(info: RepoInfo): Board {
  if (!info.board) throw new ModelFacingError(`${info.repo} has no board. Ask your human partner once whether to set one up, then call ${TOOL_PREFIX}board_setup.`)
  return info.board
}

export function assertWritable(info: RepoInfo): void {
  if (info.repo === IDEAS_REPO && !info.isPrivate) throw new ModelFacingError(`${IDEAS_REPO} is public, and it must stay private: make it private again before anything is written to it.`)
}

export async function readWork(io: Io, issueUrl: string): Promise<Work> {
  const ref = parseIssue(issueUrl)
  // One call for the repo, its board and the work: each gh call is a process and a round trip.
  const { repository } = await graphql<any>(io, 'Work', WORK, { owner: ref.owner, name: ref.name, number: ref.number })
  const repo = toRepoInfo(repository)
  const board = requireBoard(repo)
  const item = (n: any): Item => {
    const onBoard = n.projectItems.nodes.find((p: any) => p?.project?.url === board.url)
    const numbers = (c: any): number[] => c.nodes.map((i: any) => i.number)
    return { number: n.number, url: n.url, title: n.title, closed: n.closed, closedAt: n.closedAt ?? undefined, onBoard: !!onBoard, itemId: onBoard?.id, archivedItemId: onBoard?.isArchived ? onBoard.id : undefined, status: onBoard?.status?.name, body: n.body, blockedBy: numbers(n.blockedBy), blocking: numbers(n.blocking) }
  }
  // A missing issue or a PR number never gets here: GitHub answers NOT_FOUND, and graphql throws its message.
  const raw = repository.issue
  return { repo, board, issue: item(raw), parent: raw.parent ? item(raw.parent) : undefined, tasks: (raw.parent ?? raw).subIssues.nodes.map(item), ownSubIssues: raw.subIssues.nodes.map(item) }
}

export function deriveParentStatus(tasks: (Status | undefined)[]): Status {
  const s = tasks.map(t => t ?? 'Todo')
  if (s.every(t => t === 'Done')) return 'Done'
  if (s.every(t => t === 'In Review' || t === 'Done')) return 'In Review'
  if (s.every(t => t === 'Todo')) return 'Todo'
  return 'In Progress'
}

// GitHub's words when it refuses an add, as it did on a board created moments before: "Please try again."
const TEMPORARY_CONFLICT = 'Your attempt to move this item created a temporary conflict. Please try again.'

export async function setStatus(io: Io, board: Board, issue: Item, status: Status): Promise<void> {
  if (status === 'Done') throw new ModelFacingError(NOT_DONE)
  const item = [String(board.number), '--owner', board.owner, '--url', issue.url]
  const add = () => gh(io, ['project', 'item-add', ...item])
  // Adding an issue that is already on the board adds nothing, so one retry can't make a second card.
  if (!issue.onBoard)
    await add().catch(err => {
      if (!(err instanceof Error && err.message.includes(TEMPORARY_CONFLICT))) throw err
      return add()
    })
  // An archived card stays hidden on the board and from work_list, so a move brings it back.
  if (issue.archivedItemId) await gh(io, ['project', 'item-archive', String(board.number), '--owner', board.owner, '--id', issue.archivedItemId, '--undo'])
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
    .filter(i => i.closed && i.onBoard && i.status !== 'Done') // no workflow moves an issue that is not on the board
    .filter(i => Date.now() - Date.parse(i.closedAt!) > CLOSED_NOT_DONE_GRACE_MS)
    .map(i => `#${i.number} is closed but not in Done on board "${title}" (${url}): "Item closed" isn't moving closed issues. Open the board's Workflows and turn on "Item closed" with Status = Done.`)
}

export async function currentRepo(io: Io): Promise<string | undefined> {
  const r = await run(io, ['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  return (r.code === 0 && r.stdout.trim()) || undefined
}
