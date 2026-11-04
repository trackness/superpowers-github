import { ATTACHMENT_LINE_ROOM, TMP_ROOT } from '../config'
import { assertWritable, issueBody, repoInfo } from '../github/board'
import { checkBody } from '../github/body'
import { gh, ModelFacingError, parseIssue, runOk } from '../github/gh'
import { upload, withAttachment } from '../github/image'
import { optStr, str, type Tool } from './engine'

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
    // An upload can't be undone, so the body must have room for its line first.
    checkBody(withAttachment(await issueBody(io, ref.url), { name: '', url: '', markdown: ' '.repeat(ATTACHMENT_LINE_ROOM) }))
    let file = path
    if ((await io.fs.stat(path)).kind === 'dir') {
      const dir = `${TMP_ROOT}/${call.tool_use_id}`
      const given = name?.split('/').pop() // only a file name, so the zip stays in the call's own folder
      const base = given && given !== '.' && given !== '..' ? given : path.replace(/\/+$/, '').split('/').pop()!
      file = `${dir}/${base.endsWith('.zip') ? base : `${base}.zip`}` // zip adds .zip to a name without an extension
      await runOk(io, ['mkdir', '-p', dir])
      await runOk(io, ['zip', '-r', '-q', file, '.'], { cwd: path })
    }
    const uploaded = await upload(io, file, ref.repo)
    try {
      // Read again: another write may have landed during the upload.
      const body = withAttachment(await issueBody(io, ref.url), uploaded)
      checkBody(body)
      await gh(io, ['issue', 'edit', ref.url, '--body-file', '-'], { input: body })
    } catch (e) {
      throw new ModelFacingError(`${(e as Error).message} The file was already uploaded, and is not attached: ${uploaded.markdown}`)
    }
    return `Attached ${uploaded.markdown} to ${ref.url}.`
  },
}
