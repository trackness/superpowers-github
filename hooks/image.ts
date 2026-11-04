import { attachmentUrls } from './body.ts'
import { GH_IMAGE, TOOL_PREFIX } from './config.ts'
import { gh, type Io, run, runOk, ToolError } from './gh.ts'

export type Ref = { markdown: string; name: string; url: string }

const HEADING = /^## Attachments[ \t]*$/m

export function parseRefs(text: string): Ref[] {
  const re = /!?\[([^\]]*)\]\((https:\/\/github\.com\/user-attachments\/[^)\s]+)\)/g
  return [...text.matchAll(re)].map(m => ({ markdown: m[0], name: m[1]!, url: m[2]! }))
}

export async function checkGhImage(io: Io): Promise<void> {
  const out = await runOk(io, ['gh', 'extension', 'list'])
  // Whole fields, so v1.4.10 is not taken for v1.4.1.
  if (!out.split('\n').some(l => { const [, repo, version] = l.split('\t'); return repo?.trim() === GH_IMAGE.repo && version?.trim() === GH_IMAGE.version })) {
    // An installed gh-image takes no --pin from a second install (gh says "already installed"), so it goes first.
    throw new ToolError(`gh-image ${GH_IMAGE.version} is not installed. Ask James to run \`gh extension remove gh-image\` (if any version is installed), then: gh extension install ${GH_IMAGE.repo} --pin ${GH_IMAGE.version}`)
  }
}

export async function upload(io: Io, file: string, repo: string): Promise<Ref> {
  await checkGhImage(io)
  const r = await run(io, ['gh', 'image', file, '--repo', repo])
  const output = `gh-image output: ${r.stdout.trim()} ${r.stderr.trim()}`.trim()
  if (r.code !== 0) throw new ToolError(`gh image failed (exit ${r.code}) for ${file}. ${output}`)
  // For a video gh-image prints the bare URL: it is listed as a link named after the file.
  const [url, name] = [attachmentUrls(r.stdout).at(-1), file.split('/').pop()!]
  const ref = parseRefs(r.stdout).at(-1) ?? (url && { name, url, markdown: `[${name}](${url})` })
  if (!ref) throw new ToolError(`gh image printed no reference for ${file}. ${output}`)
  return ref
}

// gh-image makes the folder, names the file from the URL (its link text is only a label), and prints its path.
export async function download(io: Io, ref: Ref, dir: string): Promise<string> {
  await checkGhImage(io)
  return (await gh(io, ['image', 'download', '--output-dir', dir, ref.url])).trim()
}

// The Attachments section: where it starts, and where the text after it resumes (the next `## ` heading, else the end).
function section(body: string): { start: number; end: number } | undefined {
  const m = HEADING.exec(body)
  if (!m) return undefined
  const next = /^## /m.exec(body.slice(m.index + m[0].length))
  return { start: m.index, end: next ? m.index + m[0].length + next.index : body.length }
}

export function withAttachment(body: string, ref: Ref): string {
  const s = section(body)
  if (!s) return `${body}\n\n## Attachments\n\n- ${ref.markdown}\n`
  const list = body.slice(s.start, s.end).trimEnd()
  const after = body.slice(s.end)
  const sep = list === '## Attachments' ? '\n\n' : '\n'
  return body.slice(0, s.start) + list + `${sep}- ${ref.markdown}` + (after ? `\n\n${after}` : '\n')
}

export function splitAttachments(body: string): { text: string; refs: string[] } {
  const s = section(body)
  if (!s) return { text: body.trimEnd(), refs: [] }
  const lines = body.slice(s.start, s.end).split('\n').slice(1).filter(l => l.trim())
  // A line that is not a "- " item would land in neither the idea nor the list: refuse rather than drop it.
  const stray = lines.filter(l => !l.startsWith('- '))
  if (stray.length) throw new ToolError(`These lines under ## Attachments are not "- " items: ${stray.map(l => `"${l.trim()}"`).join(', ')}. Move them above the heading (or make each a "- " item) with ${TOOL_PREFIX}issue_edit, then call again.`)
  return { text: (body.slice(0, s.start) + body.slice(s.end)).trimEnd(), refs: lines.map(l => l.slice(2).trim()) }
}
