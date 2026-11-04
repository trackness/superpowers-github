import { type Status } from '../config'
import { assertWritable, type Board, created, createIssue, failedAfter, link, readWork, recomputeParent, repoInfo, requireBoard, setStatus, type Work } from '../github/board'
import { checkBody } from '../github/body'
import { ModelFacingError } from '../github/gh'
import { nums, optStr, str, type Tool } from './engine'

export const issueCreateTool: Tool = {
  spec: {
    name: 'issue_create',
    description: 'Creates an issue on its repo\'s board. With `parent` it creates a task (sub-issue) of that issue: the title must start "Task <n>: ", `blockedBy` lists the issue numbers it waits on, and it goes to Todo, which recomputes the parent\'s column. Without `parent`, `repo` is required and the issue goes to `status` Idea (default) or Designed. The body is checked against GitHub\'s 65,536-character limit first; nothing is split or truncated. If a step after the create fails, the error names the created issue: do not create it again.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        repo: { type: 'string', description: '<owner>/<name>. Required without `parent`.' },
        parent: { type: 'string', description: 'The parent issue: its URL or <owner>/<repo>#<number>. Makes this a task.' },
        blockedBy: { type: 'array', items: { type: 'integer' }, description: 'The sibling tasks this one waits on: the issue numbers (the `#n` from `issue_create` or the status listing), not the task numbers.' },
        status: { type: 'string', enum: ['Idea', 'Designed'], description: 'For an issue with no parent. Default Idea.' },
      },
      required: ['title', 'body'],
    },
  },
  async run(io, input) {
    const [title, body, parent, blockedBy] = [str(input, 'title'), str(input, 'body'), optStr(input, 'parent'), nums(input, 'blockedBy')]
    const status = (optStr(input, 'status') ?? 'Idea') as Status
    checkBody(body)
    let work: Work | undefined
    let repo: string
    let board: Board
    if (parent) {
      if (!/^Task \d+: /.test(title)) throw new ModelFacingError(`A task's title must start "Task <n>: ", not "${title}".`)
      work = await readWork(io, parent)
      if (work.parent) throw new ModelFacingError(`${link(work.issue)} is a task of ${link(work.parent)}: give the parent issue, ${work.parent.url}.`)
      repo = work.repo.repo
      board = work.board
    } else {
      if (!['Idea', 'Designed'].includes(status)) throw new ModelFacingError('status must be Idea or Designed')
      const r = optStr(input, 'repo')
      if (!r) throw new ModelFacingError('repo is required when there is no parent')
      const info = await repoInfo(io, r)
      repo = info.repo
      board = requireBoard(info)
      assertWritable(info)
    }
    if (work) {
      assertWritable(work.repo)
      // gh links --blocked-by only after creating the issue, so a stray number would leave a task outside its parent.
      const tasks = work.tasks.map(t => t.number)
      const strays = blockedBy.filter(n => !tasks.includes(n))
      if (strays.length) throw new ModelFacingError(`blockedBy takes the issue numbers of ${link(work.issue)}'s tasks, not task numbers, and these are none of them: ${strays.map(n => `#${n}`).join(', ')}. Its tasks: ${work.tasks.map(link).join(', ') || 'none yet'}. Nothing was created.`)
    }
    const links = work ? ['--parent', String(work.issue.number), ...(blockedBy.length ? ['--blocked-by', blockedBy.join(',')] : [])] : []
    const url = await createIssue(io, repo, title, body, links)
    let step = 'reading the new issue\'s URL'
    try {
      const issue = created(url, title, body)
      step = 'setting its Status'
      if (!work) {
        await setStatus(io, board, issue, status)
        return `Created [#${issue.number} ${title}](${url}) in ${status}.`
      }
      await setStatus(io, board, issue, 'Todo')
      step = 'recomputing the parent'
      const moved = await recomputeParent(io, work, { number: issue.number, status: 'Todo' })
      return [`Created [#${issue.number} ${title}](${url}) in Todo.`, moved].filter(Boolean).join('\n')
    } catch (err) {
      throw failedAfter(`created ${url}`, step, err)
    }
  },
}
