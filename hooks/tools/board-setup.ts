import { IDEAS_REPO, STATUSES } from '../config'
import { assertWritable, type Board, failedAfter, repoInfo, splitRepo } from '../github/board'
import { gh, graphql, type Io, ModelFacingError } from '../github/gh'
import { deleteOffWorkflows, ensureBoardView, fixSteps, hasBoardView, setOptions, statusField, workflowDiffs, workflows } from '../github/setup'
import { bool, optStr, str, type Tool } from './engine'

const MERGE_SETTINGS = ['--enable-squash-merge', '--enable-merge-commit=false', '--enable-rebase-merge=false', '--delete-branch-on-merge', '--squash-merge-commit-message', 'pr-title']
// gh's pr-title sets the title PR_TITLE and the message BLANK.
const MERGE_SETTINGS_READ_BACK: Record<string, boolean | string> = { squashMergeAllowed: true, mergeCommitAllowed: false, rebaseMergeAllowed: false, deleteBranchOnMerge: true, squashMergeCommitTitle: 'PR_TITLE', squashMergeCommitMessage: 'BLANK' }
const MERGE = `query Merge($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${Object.keys(MERGE_SETTINGS_READ_BACK).join(' ')} } }`

// Each step is safe to run again, so repair can finish a half-built board.
async function buildLinkedBoard(io: Io, owner: string, number: number, repo: string, dropOptions: boolean): Promise<void> {
  const field = await statusField(io, owner, number)
  await setOptions(io, field, dropOptions)
  await deleteOffWorkflows(io, await workflows(io, owner, number))
  await ensureBoardView(io, owner, number, field.projectId)
  await gh(io, ['repo', 'edit', repo, ...MERGE_SETTINGS])
}

async function checkBoardSetup(io: Io, board: Board, repo: string): Promise<string> {
  const { owner, number, title, url } = board
  const names = (await statusField(io, owner, number)).options.map(o => o.name)
  const optionsWrong = names.join('\n') !== STATUSES.join('\n')
  const diffs = workflowDiffs(await workflows(io, owner, number))
  const [repoOwner, name] = splitRepo(repo)
  const settings = (await graphql<any>(io, 'Merge', MERGE, { owner: repoOwner, name })).repository
  const repairable = [
    ...diffs.filter(d => d.endsWith('must be off')),
    ...((await hasBoardView(io, owner, number)) ? [] : ['board view: none, must have one']),
    ...Object.entries(MERGE_SETTINGS_READ_BACK).filter(([k, v]) => settings[k] !== v).map(([k, v]) => `${k}: ${settings[k]}, must be ${v}`),
  ]
  const onDiffs = diffs.filter(d => d.endsWith('must be on'))
  if (!optionsWrong && !repairable.length && !onDiffs.length) return `board "${title}" (${url}) is set up for ${repo}`
  const lines = [`board "${title}" (${url}) differs from what board_setup sets up:`]
  // Each group of differences sits right above its own fix, so the workflows fixSteps says to turn on are the ones just above it.
  if (optionsWrong || repairable.length) {
    if (optionsWrong) lines.push(`- Status options: ${names.join(', ') || 'none'}; must be exactly ${STATUSES.join(', ')}, in that order`)
    lines.push(...repairable.map(d => `- ${d}`), 'To fix these, call board_setup again with repair: true.')
    const removed = names.filter(n => !(STATUSES as readonly string[]).includes(n))
    if (removed.length) lines.push(`Ask your human partner before repairing: repair removes these options, and their items lose their Status: ${removed.join(', ')}. Only once they agree, add dropOptions: true.`)
  }
  if (onDiffs.length) lines.push(...onDiffs.map(d => `- ${d}`), fixSteps(url))
  throw new ModelFacingError(lines.join('\n'))
}

export const boardSetupTool: Tool = {
  spec: {
    name: 'board_setup',
    description: `Sets up a repo's board, or checks the one it has. A repo's board is the board linked to it whose title is exactly the repo's name. With none, it builds one through the API: linked to the repo first, then the Status options ${STATUSES.join(', ')}; the workflows "Item closed" and "Auto-close issue" kept on and the other four deleted; a board view; and the repo's merge settings (squash merges only, with the PR's title as the commit message, and the branch deleted on merge). Then it reads the board back. With a board, it checks the Status options, the workflows, the board view and the merge settings, and refuses with what differs and how to fix it. Ask your human partner once before building a board. \`create\` makes the repo first; ${IDEAS_REPO} must stay private.`,
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '<owner>/<name>.' },
        create: { type: 'string', enum: ['private', 'public'], description: `Create the repo first, with this visibility. ${IDEAS_REPO} is never created public.` },
        repair: { type: 'boolean', description: 'For a board that exists: set its Status options to the six (keeping the IDs of those it has), delete the workflows that must be off, add a board view if it has none and set the repo\'s merge settings, then check it again. Finishes a board whose setup failed partway. Refuses a Status field with no option named Done, and one with options outside the six unless dropOptions.' },
        dropOptions: { type: 'boolean', description: 'With repair: also remove the Status options outside the six; their items lose their Status. Pass it only after your human partner agrees.' },
      },
      required: ['repo'],
    },
  },
  async run(io, input) {
    const [repo, create, repair, dropOptions] = [str(input, 'repo'), optStr(input, 'create'), bool(input, 'repair'), bool(input, 'dropOptions')]
    if (create !== undefined && create !== 'private' && create !== 'public') throw new ModelFacingError('create must be private or public')
    splitRepo(repo) // before `gh repo create`, which would read a bare name as the signed-in user's repo
    if (create === 'public' && repo.toLowerCase() === IDEAS_REPO) throw new ModelFacingError(`${IDEAS_REPO} must stay private: it is never created public.`)
    if (create) await gh(io, ['repo', 'create', repo, `--${create}`])
    // Once the repo exists, calling again with create fails on "Name already exists": a failure before the board exists says so.
    const afterCreate = (err: unknown): never => {
      throw create ? failedAfter(`created ${repo}`, 'the board setup', err, 'pass create') : err
    }
    const info = await repoInfo(io, repo).catch(afterCreate)
    assertWritable(info) // never fails after a create: the ideas repo is never created public
    if (info.board) {
      if (repair) await buildLinkedBoard(io, info.board.owner, info.board.number, info.repo, dropOptions)
      return checkBoardSetup(io, info.board, info.repo)
    }
    const [owner, name] = splitRepo(info.repo)
    // Without --format json, gh prints nothing when its output isn't a terminal.
    const p: { number: number; url: string } = await gh(io, ['project', 'create', '--owner', owner, '--title', name, '--format', 'json']).then(JSON.parse).catch(afterCreate)
    const link = ['project', 'link', String(p.number), '--owner', owner, '--repo', info.repo]
    // Linked first: a later call finds the board through the repo, so repair can finish whatever failed after this.
    let linked = false
    try {
      await gh(io, link)
      linked = true
      await buildLinkedBoard(io, owner, p.number, info.repo, true) // a board made a moment ago has no items to lose
    } catch (err) {
      const again = 'call board_setup again without create, with repair: true'
      const fix = linked ? `To finish it, ${again}.` : `It is not linked to ${info.repo}, so calling board_setup now would create a second board: first run \`gh ${link.join(' ')}\`, then ${again}.`
      throw new ModelFacingError(`Created board "${name}" (${p.url}), then this failed: ${err instanceof Error ? err.message : err}\n${fix}`)
    }
    return checkBoardSetup(io, { owner, number: p.number, title: name, url: p.url }, info.repo)
  },
}
