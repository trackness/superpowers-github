import { IDEAS_REPO, TMP_ROOT, TOOL_PREFIX } from '../config'
import { assertWritable, created, createIssue, failedAfter, link, NOT_DONE, readWork, repoInfo, requireBoard, setStatus, type Work } from '../github/board'
import { attachmentUrls, checkBody } from '../github/body'
import { gh, graphqlPages, ModelFacingError, parseIssue } from '../github/gh'
import { download, parseRefs, upload } from '../github/image'
import { str, type Tool } from './engine'

const COMMENTS = `query Comments($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      comments(first: 100, after: $after) {
        nodes { body }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`

const issueLinks = (w: Work): string[] => [
  ...(w.parent ? [`parent #${w.parent.number}`] : []),
  ...w.ownSubIssues.map(t => `sub-issue #${t.number}`),
  ...w.issue.blockedBy.map(n => `blocked by #${n}`),
  ...w.issue.blocking.map(n => `blocking #${n}`),
]

const kept = (w: Work) => [...attachmentUrls(w.issue.body).map(u => `attachment ${u}`), ...issueLinks(w)]

export const ideaMoveTool: Tool = {
  spec: {
    name: 'idea_move',
    description: `Moves an open idea out of ${IDEAS_REPO} to its destination repo, which must have a board, keeping its column. To a private repo it is transferred (\`gh issue transfer\`), put on the destination's board in the same Status, and every attachment, sub-issue or dependency link the transfer lost is named on a line starting "Lost in the transfer:"; nothing is repaired. A public repo can't take a transfer, so the idea is recreated there: the same title and body, every attachment downloaded and uploaded again through gh-image, the comments copied in order, and then the old issue closed with "Moved to <new URL>". An idea with sub-issues, a parent or dependency links is refused for a public repo. If a step after the transfer or the create fails, the error names the new issue: don't move the idea again.`,
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: `The idea in ${IDEAS_REPO}: its URL or <owner>/<repo>#<number>.` },
        to: { type: 'string', description: 'The destination repo, <owner>/<name>.' },
      },
      required: ['issue', 'to'],
    },
  },
  async run(io, input, call) {
    const ref = parseIssue(str(input, 'issue'))
    const to = str(input, 'to')
    if (ref.repo.toLowerCase() !== IDEAS_REPO) throw new ModelFacingError(`idea_move moves ideas out of ${IDEAS_REPO} only; ${ref.url} is in ${ref.repo}.`)
    const work = await readWork(io, ref.url)
    assertWritable(work.repo) // the move writes to the ideas repo: the transfer, or the closing comment
    const { issue } = work
    if (issue.closed) throw new ModelFacingError(`${link(issue)} is closed: only an open idea is moved.`)
    if (issue.status === 'Done') throw new ModelFacingError(`${link(issue)} is in Done: a move keeps the column, and ${NOT_DONE}. Nothing was moved.`)
    const dest = await repoInfo(io, to)
    const board = requireBoard(dest)
    const status = issue.status ?? 'Idea' // an issue in the ideas repo with no Status on its board is still an idea

    if (dest.isPrivate) {
      const url = (await gh(io, ['issue', 'transfer', issue.url, dest.repo])).trim().split('\n').pop()!
      let step = 'reading the moved issue'
      let moved: Work
      try {
        moved = await readWork(io, url)
        step = 'setting its Status'
        if (!moved.issue.onBoard || moved.issue.status !== status) await setStatus(io, moved.board, moved.issue, status)
        // The transfer carries the ideas board's card over, so the board would go on listing the moved idea.
        step = `removing its card from board "${work.board.title}"`
        if (issue.itemId) await gh(io, ['project', 'item-delete', String(work.board.number), '--owner', work.board.owner, '--id', issue.itemId])
      } catch (err) {
        throw failedAfter(`transferred ${issue.url} to ${url}`, step, err, 'transfer it')
      }
      const after = kept(moved)
      const lost = kept(work).filter(k => !after.includes(k)).map(k => `Lost in the transfer: ${k}`)
      return [`Transferred ${issue.url} to ${link(moved.issue)}, in ${status} on board "${board.title}".`, ...lost].join('\n')
    }

    const linked = issueLinks(work)
    if (linked.length) throw new ModelFacingError(`${link(issue)} has links a public repo can't recreate (${linked.join(', ')}): remove them first, or move it to a private repo.`)
    const comments = (await graphqlPages<{ body: string }>(io, 'Comments', COMMENTS, { owner: ref.owner, name: ref.name, number: ref.number }, d => d.repository.issue.comments)).map(c => c.body)
    const texts = [issue.body, ...comments]
    const sized = (ts: string[]) => ts.forEach((t, i) => checkBody(t, i ? `comment ${i} of ${ts.length - 1}` : 'body'))
    sized(texts)
    const refs = [...new Map(texts.flatMap(t => parseRefs(t)).map(r => [r.url, r])).values()]
    // Old attachment URLs are never referenced from the public repo; one left once every [name](url) link is taken out can't be uploaded again.
    const left = attachmentUrls(texts.map(t => refs.reduce((s, r) => s.replaceAll(r.url, ''), t)).join('\n'))
    if (left.length) throw new ModelFacingError(`These attachments in ${link(issue)} or its comments aren't [name](url) links, so they can't be uploaded again, and a public issue must not reference them: ${left.join(', ')}. Make each one a link, then call idea_move again.`)
    // Everything is downloaded first: a .md attachment (idea.md) can link the others, and is checked before anything is uploaded.
    const files: string[] = []
    for (const [i, r] of refs.entries()) files.push(await download(io, r, `${TMP_ROOT}/${call.tool_use_id}/${i}`))
    // shortcut: a .md that links another .md is refused (its new copy may not exist yet); upload in link order if that is ever needed.
    const known = refs.filter((_, i) => !files[i]!.endsWith('.md')).map(r => r.url)
    const docs = new Map<number, string>()
    for (const [i, file] of files.entries()) {
      if (!file.endsWith('.md')) continue
      const text = await io.fs.read(file)
      const unknown = attachmentUrls(text).filter(u => !known.includes(u))
      if (unknown.length) throw new ModelFacingError(`${refs[i]!.markdown} links attachments that no [name](url) link in ${link(issue)} or its comments names, so their new copies can't be swapped in: ${unknown.join(', ')}. Link each one in the issue's ## Attachments list with ${TOOL_PREFIX}issue_edit, then call idea_move again. Nothing was uploaded.`)
      docs.set(i, text)
    }
    const fresh = new Map<string, string>()
    const swap = (t: string) => [...fresh].reduce((s, [old, now]) => s.replaceAll(old, now), t)
    const put = async (i: number) => fresh.set(refs[i]!.url, (await upload(io, files[i]!, dest.repo)).url)
    let url: string, body: string, copies: string[]
    try {
      for (const i of refs.keys()) if (!docs.has(i)) await put(i)
      // Last, so swap knows every other attachment's new URL.
      for (const [i, text] of docs) {
        await io.fs.write(files[i]!, swap(text))
        await put(i)
      }
      body = swap(issue.body)
      copies = comments.map(swap)
      sized([body, ...copies]) // a fresh URL can be longer than the one it replaced
      url = await createIssue(io, dest.repo, issue.title, body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const createdIssueLinksUploads = message.startsWith('created ')
      if (!fresh.size || createdIssueLinksUploads) throw err
      throw new ModelFacingError(`${message} Already uploaded to ${dest.repo}, linked from nowhere: ${[...fresh.values()].join(', ')}`)
    }
    let step = 'reading the new issue\'s URL'
    try {
      const recreated = created(url, issue.title, body)
      step = 'setting its Status'
      await setStatus(io, board, recreated, status)
      for (const [i, c] of copies.entries()) {
        step = `copying comment ${i + 1} of ${copies.length}`
        await gh(io, ['issue', 'comment', url, '--body-file', '-'], { input: c })
      }
      step = `closing ${issue.url}`
      await gh(io, ['issue', 'close', issue.url, '--comment', `Moved to ${url}`])
      return `Recreated ${issue.url} as ${link(recreated)} in ${status} on board "${board.title}", with ${refs.length} attachment(s) uploaded again and ${copies.length} comment(s) copied; closed the old issue with a link to the new one.`
    } catch (err) {
      throw failedAfter(`created ${url}`, step, err)
    }
  },
}
