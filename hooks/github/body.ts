import { BODY_LIMIT } from '../config'
import { ModelFacingError } from './gh'

export function checkBody(body: string, what = 'body'): void {
  const n = [...body].length
  if (n > BODY_LIMIT) throw new ModelFacingError(`${what} is ${n} characters; GitHub's limit is ${BODY_LIMIT.toLocaleString('en-US')}. Rewrite it to fit: nothing is split or truncated.`)
}

// A URL never ends in punctuation, so a full stop or comma after it ends the sentence, not the URL.
export function attachmentUrls(text: string): string[] {
  return [...new Set(text.match(/https:\/\/github\.com\/user-attachments\/(?:assets|files)\/[^\s)<>"'\]]*[^\s)<>"'\].,;:!?]/g) ?? [])]
}
