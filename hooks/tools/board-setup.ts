import { assertWritable, type Board, repoInfo, splitRepo } from '../board.ts'
import { IDEAS_REPO, STATUSES } from '../config.ts'
import { gh, type Io, ToolError } from '../gh.ts'
import { deleteOffWorkflows, ensureBoardView, fixSteps, setOptions, statusField, workflowDiffs, workflows } from '../setup.ts'
import { bool, optStr, str, type Tool } from '../tools.ts'

const MERGE_SETTINGS = ['--enable-squash-merge', '--enable-merge-commit=false', '--enable-rebase-merge=false', '--delete-branch-on-merge', '--squash-merge-commit-message', 'pr-title']

// Reads the board back: exactly the six Status options, in order, and every workflow as WORKFLOWS says.
async function check(io: Io, board: Board, repo: string): Promise<string> {
  const { owner, number, title, url } = board
  const names = (await statusField(io, owner, number)).options.map(o => o.name)
  const optionsWrong = names.join('\n') !== STATUSES.join('\n')
  const diffs = workflowDiffs(await workflows(io, owner, number))
  if (!optionsWrong && !diffs.length) return `board "${title}" (${url}) is set up for ${repo}`
  const offDiffs = diffs.filter(d => d.endsWith('must be off'))
  const onDiffs = diffs.filter(d => d.endsWith('must be on'))
  const lines = [`board "${title}" (${url}) differs from what board_setup sets up:`]
  // Each group of differences sits right above its own fix, so the workflows fixSteps says to turn on are the ones just above it.
  if (optionsWrong || offDiffs.length) {
    if (optionsWrong) lines.push(`- Status options: ${names.join(', ') || 'none'}; must be exactly ${STATUSES.join(', ')}, in that order`)
    lines.push(...offDiffs.map(d => `- ${d}`), 'To fix these, call board_setup again with repair: true.')
    const removed = names.filter(n => !(STATUSES as readonly string[]).includes(n))
    if (removed.length) lines.push(`Repair removes these options, and their items lose their Status: ${removed.join(', ')}.`)
  }
  if (onDiffs.length) lines.push(...onDiffs.map(d => `- ${d}`), fixSteps(url))
  throw new ToolError(lines.join('\n'))
}

export const boardSetupTool: Tool = {
  spec: {
    name: 'board_setup',
    description: `Sets up a repo's board, or checks the one it has. A repo's board is the board linked to it whose title is exactly the repo's name. With none, it builds one through the API: the Status options ${STATUSES.join(', ')}; the workflows "Item closed" and "Auto-close issue" kept on and the other four deleted; a board view; the board linked to the repo; and the repo's merge settings (squash merges only, with the PR's title as the commit message, and the branch deleted on merge). Then it reads the board back. With a board, it checks the Status options and the workflows, and refuses with what differs and how to fix it. Ask James once before building a board. \`create\` makes the repo first; ${IDEAS_REPO} must stay private.`,
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: '<owner>/<name>.' },
        create: { type: 'string', enum: ['private', 'public'], description: `Create the repo first, with this visibility. ${IDEAS_REPO} is never created public.` },
        repair: { type: 'boolean', description: 'For a board that exists: set its Status options to the six (keeping the IDs of those it has) and delete the workflows that must be off, then check it again.' },
      },
      required: ['repo'],
    },
  },
  async run(io, input) {
    const [repo, create, repair] = [str(input, 'repo'), optStr(input, 'create'), bool(input, 'repair')]
    if (create !== undefined && create !== 'private' && create !== 'public') throw new ToolError('create must be private or public')
    splitRepo(repo) // before `gh repo create`, which would read a bare name as the signed-in user's repo
    if (create === 'public' && repo.toLowerCase() === IDEAS_REPO) throw new ToolError(`${IDEAS_REPO} must stay private: it is never created public.`)
    if (create) await gh(io, ['repo', 'create', repo, `--${create}`])
    const info = await repoInfo(io, repo)
    assertWritable(info)
    if (info.board) {
      const { owner, number } = info.board
      if (repair) {
        await setOptions(io, await statusField(io, owner, number))
        await deleteOffWorkflows(io, await workflows(io, owner, number))
      }
      return check(io, info.board, info.repo)
    }
    const [owner, name] = splitRepo(info.repo)
    // Without --format json, gh prints nothing when its output isn't a terminal.
    const p: { number: number; id: string; url: string } = JSON.parse(await gh(io, ['project', 'create', '--owner', owner, '--title', name, '--format', 'json']))
    try {
      await setOptions(io, await statusField(io, owner, p.number))
      await deleteOffWorkflows(io, await workflows(io, owner, p.number))
      await ensureBoardView(io, owner, p.number, p.id)
      await gh(io, ['project', 'link', String(p.number), '--owner', owner, '--repo', info.repo])
      await gh(io, ['repo', 'edit', info.repo, ...MERGE_SETTINGS])
    } catch (err) {
      throw new ToolError(`Created board "${name}" (${p.url}), then: ${err instanceof Error ? err.message : err}\nNot retried. Until that board is linked to ${info.repo}, calling board_setup again creates a second board.`)
    }
    return check(io, { owner, number: p.number, title: name, url: p.url }, info.repo)
  },
}
