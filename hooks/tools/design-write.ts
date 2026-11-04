import { assertWritable, failedAfter, issueBody, link, readWork, setStatus } from '../board.ts'
import { attachmentUrls, checkBody } from '../body.ts'
import { TMP_ROOT, TOOL_PREFIX } from '../config.ts'
import { gh, parseIssue, ToolError } from '../gh.ts'
import { parseRefs, splitAttachments, upload } from '../image.ts'
import { str, type Tool } from '../tools.ts'

const items = (refs: string[]) => refs.map(r => `- ${r}\n`).join('')

// The idea, and the list the new body keeps: the old list plus every link in the idea's own text, so no attachment is left only inside idea.md.
function parts(body: string, design: string): { idea: string; refs: string[] } {
  const { text: idea, refs } = splitAttachments(body)
  for (const r of parseRefs(idea)) if (!refs.some(x => x.includes(r.url))) refs.push(r.markdown)
  // As issue_edit refuses: an attachment dropped from the body can't be referenced again.
  const dropped = attachmentUrls(body).filter(u => !design.includes(u) && !refs.some(x => x.includes(u)))
  if (dropped.length) throw new ToolError(`The idea references these attachments other than as [name](url) links, so the new body would drop them: ${dropped.join(', ')}. Make each one a link with ${TOOL_PREFIX}issue_edit, then call design_write again.`)
  return { idea, refs }
}

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
    const { idea, refs } = parts(issue.body, design)
    // The heading only with a list, and the idea.md line (about 200 characters) only with an idea.
    checkBody(idea || refs.length ? `${design}\n\n## Attachments\n\n${items(refs)}${idea ? ' '.repeat(200) : ''}` : design)
    let uploaded = ''
    if (idea) {
      const file = `${TMP_ROOT}/${call.tool_use_id}/idea.md`
      await io.fs.write(file, idea) // creates the folder (claude-code.d.ts line 3377)
      uploaded = (await upload(io, file, ref.repo)).markdown
    }
    try {
      let list = refs
      if (uploaded) {
        // Read again: another write may have landed during the upload.
        const now = parts(await issueBody(io, ref.url), design)
        if (now.idea !== idea) throw new ToolError(`#${issue.number}'s idea changed during the upload, so idea.md would not hold it: call design_write again.`)
        list = [...now.refs, uploaded]
      }
      const body = list.length ? `${design}\n\n## Attachments\n\n${items(list)}` : design
      checkBody(body)
      await gh(io, ['issue', 'edit', ref.url, '--body-file', '-'], { input: body })
    } catch (e) {
      throw new ToolError(`${(e as Error).message} The issue body is unchanged.${uploaded && ` idea.md was already uploaded, and is not in it: ${uploaded}`}`)
    }
    try {
      await setStatus(io, work.board, issue, 'Designed')
    } catch (err) {
      throw failedAfter(`wrote the design to ${link(issue)}`, 'moving it to Designed', err, 'call design_write')
    }
    return `Wrote the design to ${link(issue)} and moved it to Designed.${idea ? ' The idea is attached as idea.md.' : ''}`
  },
}
