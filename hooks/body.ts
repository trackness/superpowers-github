import { BODY_LIMIT } from './config.ts'
import { ToolError } from './gh.ts'

export function checkBody(body: string): void {
  const n = [...body].length
  if (n > BODY_LIMIT) throw new ToolError(`body is ${n} characters; GitHub's limit is 65,536. Rewrite it to fit: nothing is split or truncated.`)
}

export function attachmentUrls(text: string): string[] {
  return [...new Set(text.match(/https:\/\/github\.com\/user-attachments\/(?:assets|files)\/[^\s)<>"'\]]+/g) ?? [])]
}
