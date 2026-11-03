import { closedNotDone, type Item, link, NOT_DONE, readWork, recomputeParent, setStatus } from '../board.ts'
import { STATUSES, type Status } from '../config.ts'
import { ToolError } from '../gh.ts'
import { optStr, str, type Tool } from '../tools.ts'

const line = (i: Item) => `${link(i)} — ${i.status ?? (i.onBoard ? 'no Status' : 'not on the board')}`

export const statusTool: Tool = {
  spec: {
    name: 'status',
    description: `Reads or moves a piece of work on its repo's board. With only \`issue\`, returns the parent and each of its tasks as \`[#n title](url) — <Status>\` lines. With \`status\`, moves a task and then recomputes its parent's column from its tasks, or moves a parent that has no tasks (an idea, a small change). A parent with tasks is refused: its column is derived from its tasks. Done is refused: ${NOT_DONE}. Also names any closed issue that is not in Done, which means the board's "Item closed" workflow is off.`,
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'The issue: its URL (https://github.com/<owner>/<repo>/issues/<number>) or <owner>/<repo>#<number>.' },
        status: { type: 'string', enum: [...STATUSES], description: 'The column to move it to. Leave it out to read the work.' },
      },
      required: ['issue'],
    },
  },
  async run(io, input) {
    const issue = str(input, 'issue')
    const status = optStr(input, 'status') as Status | undefined
    if (status !== undefined && !STATUSES.includes(status)) throw new ToolError(`status must be one of: ${STATUSES.join(', ')}`)
    if (status === 'Done') throw new ToolError(NOT_DONE)
    const work = await readWork(io, issue)
    if (!status) return [work.parent ?? work.issue, ...work.tasks].map(line).concat(closedNotDone(work)).join('\n')
    if (!work.parent && work.tasks.length) throw new ToolError(`${link(work.issue)} has tasks, so its column is derived from its tasks: move a task instead.`)
    await setStatus(io, work.board, work.issue, status)
    const parent = work.parent && (await recomputeParent(io, work, { number: work.issue.number, status }))
    return [`Moved ${link(work.issue)} to ${status}.`, parent, ...closedNotDone(work)].filter(Boolean).join('\n')
  },
}
