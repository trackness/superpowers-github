import { assertWritable, issueBody, repoInfo } from '../board.ts'
import { checkBody } from '../body.ts'
import { TMP_ROOT } from '../config.ts'
import { gh, parseIssue, runOk, ToolError } from '../gh.ts'
import { upload, withAttachment } from '../image.ts'
import { optStr, str, type Tool } from '../tools.ts'

export const attachTool: Tool = {
  spec: {
    name: 'attach',
    description: 'Uploads a file, or a directory zipped first, to an issue through gh-image and lists it under the issue\'s ## Attachments. gh-image must be installed at the pinned version.',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'The issue: its URL or <owner>/<repo>#<number>.' },
        path: { type: 'string', description: 'The file or directory to attach.' },
        name: { type: 'string', description: 'For a directory, the zip\'s file name (default: the directory\'s name + .zip).' },
      },
      required: ['issue', 'path'],
    },
  },
  async run(io, input, call) {
    const ref = parseIssue(str(input, 'issue'))
    const [path, name] = [str(input, 'path'), optStr(input, 'name')]
    assertWritable(await repoInfo(io, ref.repo))
    const current = await issueBody(io, ref.url)
    let file = path
    if ((await io.fs.stat(path)).kind === 'dir') {
      const dir = `${TMP_ROOT}/${call.tool_use_id}`
      const base = name?.split('/').pop() // only a file name, so the zip stays in the call's own folder
      file = `${dir}/${base && base !== '.' && base !== '..' ? base : `${path.replace(/\/+$/, '').split('/').pop()}.zip`}`
      await runOk(io, ['mkdir', '-p', dir])
      await runOk(io, ['zip', '-r', '-q', file, '.'], { cwd: path })
    }
    const uploaded = await upload(io, file, ref.repo)
    let body: string
    try {
      body = withAttachment(current, uploaded)
      checkBody(body)
    } catch (e) {
      throw new ToolError(`${(e as Error).message} The file was already uploaded, and is not attached: ${uploaded.markdown}`)
    }
    await gh(io, ['issue', 'edit', ref.url, '--body-file', '-'], { input: body })
    return `Attached ${uploaded.markdown} to ${ref.url}.`
  },
}
