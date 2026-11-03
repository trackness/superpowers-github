import { assertWritable, readWork, repoInfo } from '../board.ts'
import { attachmentUrls, checkBody } from '../body.ts'
import { gh, parseIssue, ToolError } from '../gh.ts'
import { nums, optStr, str, type Tool } from '../tools.ts'

export const issueEditTool: Tool = {
  spec: {
    name: 'issue_edit',
    description: 'Edits an issue\'s body, title or blocked-by links. A new body is checked against GitHub\'s 65,536-character limit, and is refused if it drops an attachment (https://github.com/user-attachments/…) the current body references: keep them in the ## Attachments list.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'The issue: its URL or <owner>/<repo>#<number>.' },
        body: { type: 'string', description: 'The whole new body.' },
        title: { type: 'string' },
        addBlockedBy: { type: 'array', items: { type: 'integer' } },
        removeBlockedBy: { type: 'array', items: { type: 'integer' } },
      },
      required: ['issue'],
    },
  },
  async run(io, input) {
    const ref = parseIssue(str(input, 'issue'))
    const [body, title, add, remove] = [optStr(input, 'body'), optStr(input, 'title'), nums(input, 'addBlockedBy'), nums(input, 'removeBlockedBy')]
    if (body === undefined && title === undefined && !add.length && !remove.length) throw new ToolError('Nothing to change: give a body, a title, addBlockedBy or removeBlockedBy.')
    if (body === undefined) assertWritable(await repoInfo(io, ref.repo))
    else {
      checkBody(body)
      const work = await readWork(io, ref.url)
      assertWritable(work.repo)
      const dropped = attachmentUrls(work.issue.body).filter(u => !body.includes(u))
      if (dropped.length) throw new ToolError(`the new body drops these attachments, which can't be re-referenced once dropped: ${dropped.join(', ')}. Keep them in the ## Attachments list.`)
    }
    const args = ['issue', 'edit', ref.url]
    if (title !== undefined) args.push('--title', title)
    if (body !== undefined) args.push('--body-file', '-')
    if (add.length) args.push('--add-blocked-by', add.join(','))
    if (remove.length) args.push('--remove-blocked-by', remove.join(','))
    await gh(io, args, { input: body })
    return `Edited ${ref.url}.`
  },
}
