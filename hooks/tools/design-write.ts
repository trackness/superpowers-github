import { assertWritable, link, readWork, setStatus } from '../board.ts'
import { checkBody } from '../body.ts'
import { TMP_ROOT, TOOL_PREFIX } from '../config.ts'
import { gh, parseIssue, ToolError } from '../gh.ts'
import { splitAttachments, upload } from '../image.ts'
import { str, type Tool } from '../tools.ts'

const items = (refs: string[]) => refs.map(r => `- ${r}\n`).join('')

export const designWriteTool: Tool = {
  spec: {
    name: 'design_write',
    description: 'Swaps an Idea issue\'s body for its design: the idea is kept as an attached idea.md (uploaded through gh-image), the other attachments stay listed, and the issue moves to Designed.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'The issue in Idea: its URL or <owner>/<repo>#<number>.' },
        design: { type: 'string', description: 'The whole design, which becomes the issue body.' },
      },
      required: ['issue', 'design'],
    },
  },
  async run(io, input, call) {
    const ref = parseIssue(str(input, 'issue'))
    const design = str(input, 'design')
    const work = await readWork(io, ref.url)
    assertWritable(work.repo)
    const { issue } = work
    if (issue.status !== 'Idea' || work.tasks.length) {
      const why = issue.status !== 'Idea' ? `is in ${issue.status ?? 'no status'}, not Idea` : 'already has tasks'
      throw new ToolError(`#${issue.number} ${why}: revise a design with ${TOOL_PREFIX}issue_edit`)
    }
    const { text: idea, refs } = splitAttachments(issue.body)
    // The idea.md line is about 200 characters.
    checkBody(`${design}\n\n## Attachments\n\n${items(refs)}${' '.repeat(200)}`)
    if (idea) {
      const file = `${TMP_ROOT}/${call.tool_use_id}/idea.md`
      await io.fs.write(file, idea) // creates the folder (claude-code.d.ts line 3377)
      refs.push((await upload(io, file, ref.repo)).markdown)
    }
    const body = refs.length ? `${design}\n\n## Attachments\n\n${items(refs)}` : design
    checkBody(body)
    await gh(io, ['issue', 'edit', ref.url, '--body-file', '-'], { input: body })
    await setStatus(io, work.board, issue, 'Designed')
    return `Wrote the design to ${link(issue)} and moved it to Designed.${idea ? ' The idea is attached as idea.md.' : ''}`
  },
}
