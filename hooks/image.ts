import { GH_IMAGE } from './config.ts'
import { gh, type Io, run, runOk, ToolError } from './gh.ts'

export type Ref = { markdown: string; name: string; url: string }

const HEADING = /^## Attachments[ \t]*$/m

export function parseRefs(text: string): Ref[] {
  const re = /!?\[([^\]]*)\]\((https:\/\/github\.com\/user-attachments\/[^)\s]+)\)/g
  return [...text.matchAll(re)].map(m => ({ markdown: m[0], name: m[1]!, url: m[2]! }))
}

export async function checkGhImage(io: Io): Promise<void> {
  const out = await runOk(io, ['gh', 'extension', 'list'])
  if (!out.split('\n').some(l => l.includes(GH_IMAGE.repo) && l.includes(GH_IMAGE.version))) {
    throw new ToolError(`gh-image ${GH_IMAGE.version} is not installed. Ask James to run: gh extension install ${GH_IMAGE.repo} --pin ${GH_IMAGE.version}`)
  }
}

export async function upload(io: Io, file: string, repo: string): Promise<Ref> {
  await checkGhImage(io)
  const r = await run(io, ['gh', 'image', file, '--repo', repo])
  const output = `gh-image output: ${r.stdout.trim()} ${r.stderr.trim()}`.trim()
  if (r.code !== 0) throw new ToolError(`gh image failed (exit ${r.code}) for ${file}. ${output}`)
  const ref = parseRefs(r.stdout).at(-1)
  if (!ref) throw new ToolError(`gh image printed no reference for ${file}. ${output}`)
  return ref
}

export async function download(io: Io, ref: Ref, dir: string): Promise<string> {
  await checkGhImage(io)
  await runOk(io, ['mkdir', '-p', dir])
  const base = ref.name.split('/').pop()
  const out = `${dir}/${base && base !== '.' && base !== '..' ? base : 'attachment'}`
  await gh(io, ['image', 'download', '--output', out, ref.url])
  return out
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
  const refs = body.slice(s.start, s.end).split('\n').flatMap(l => (l.startsWith('- ') ? [l.slice(2).trim()] : []))
  return { text: (body.slice(0, s.start) + body.slice(s.end)).trimEnd(), refs }
}
