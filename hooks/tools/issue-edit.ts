import { assertWritable, issueBody, repoInfo } from '../github/board'
import { attachmentUrls, checkBody } from '../github/body'
import { gh, ModelFacingError, parseIssue } from '../github/gh'
import { nums, optStr, str, type Tool } from './engine'

export const issueEditTool: Tool = {
  spec: {
    name: 'issue_edit',
    description: 'Edits an issue\'s body, title or blocked-by links. `appendBody` adds a section to the end of the body GitHub holds, so nothing already there is retyped. A new body is checked against GitHub\'s 65,536-character limit, and is refused if it drops an attachment (https://github.com/user-attachments/…) the current body references: keep them in the ## Attachments list.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'The issue: its URL or <owner>/<repo>#<number>.' },
        body: { type: 'string', description: 'The whole new body.' },
        appendBody: { type: 'string', description: 'Text to add after the current body, following a blank line. Not with `body`.' },
        title: { type: 'string' },
        addBlockedBy: { type: 'array', items: { type: 'integer' }, description: 'The issues this one now waits on: the issue numbers (the `#n` from `issue_create` or the status listing), not the task numbers.' },
        removeBlockedBy: { type: 'array', items: { type: 'integer' }, description: 'The issues it no longer waits on: the issue numbers (the `#n` from `issue_create` or the status listing), not the task numbers.' },
      },
      required: ['issue'],
    },
  },
  async run(io, input) {
    const ref = parseIssue(str(input, 'issue'))
    const [given, append, title, add, remove] = [optStr(input, 'body'), optStr(input, 'appendBody'), optStr(input, 'title'), nums(input, 'addBlockedBy'), nums(input, 'removeBlockedBy')]
    if (given === undefined && append === undefined && title === undefined && !add.length && !remove.length) throw new ModelFacingError('Nothing to change: give a body, appendBody, a title, addBlockedBy or removeBlockedBy.')
    if (given !== undefined && append !== undefined) throw new ModelFacingError('Give body or appendBody, not both.')
    let body = given
    if (append !== undefined) {
      assertWritable(await repoInfo(io, ref.repo))
      body = `${(await issueBody(io, ref.url)).trimEnd()}\n\n${append}`
      checkBody(body)
    } else if (given === undefined) assertWritable(await repoInfo(io, ref.repo))
    else {
      checkBody(given)
      assertWritable(await repoInfo(io, ref.repo))
      const dropped = attachmentUrls(await issueBody(io, ref.url)).filter(u => !given.includes(u))
      if (dropped.length) throw new ModelFacingError(`the new body drops these attachments, which can't be re-referenced once dropped: ${dropped.join(', ')}. Keep them in the ## Attachments list.`)
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
