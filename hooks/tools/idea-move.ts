import { assertWritable, created, createIssue, failedAfter, link, readWork, repoInfo, requireBoard, setStatus, type Work } from '../board.ts'
import { attachmentUrls, checkBody } from '../body.ts'
import { IDEAS_REPO, TMP_ROOT } from '../config.ts'
import { gh, graphqlPages, parseIssue, ToolError } from '../gh.ts'
import { download, parseRefs, upload } from '../image.ts'
import { str, type Tool } from '../tools.ts'

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

// The issue's links to other issues. With a parent, readWork's tasks are the parent's sub-issues, not the issue's own.
const links = (w: Work): string[] => [
  ...(w.parent ? [`parent #${w.parent.number}`] : w.tasks.map(t => `sub-issue #${t.number}`)),
  ...w.issue.blockedBy.map(n => `blocked by #${n}`),
  ...w.issue.blocking.map(n => `blocking #${n}`),
]

const kept = (w: Work) => [...attachmentUrls(w.issue.body).map(u => `attachment ${u}`), ...links(w)]

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
    if (ref.repo.toLowerCase() !== IDEAS_REPO) throw new ToolError(`idea_move moves ideas out of ${IDEAS_REPO} only; ${ref.url} is in ${ref.repo}.`)
    const work = await readWork(io, ref.url)
    assertWritable(work.repo) // the move writes to the ideas repo: the transfer, or the closing comment
    const { issue } = work
    if (issue.closed) throw new ToolError(`${link(issue)} is closed: only an open idea is moved.`)
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
      } catch (err) {
        throw failedAfter(`transferred ${issue.url} to ${url}`, step, err, 'transfer it')
      }
      const after = kept(moved)
      const lost = kept(work).filter(k => !after.includes(k)).map(k => `Lost in the transfer: ${k}`)
      return [`Transferred ${issue.url} to ${link(moved.issue)}, in ${status} on board "${board.title}".`, ...lost].join('\n')
    }

    const linked = links(work)
    if (linked.length) throw new ToolError(`${link(issue)} has links a public repo can't recreate (${linked.join(', ')}): remove them first, or move it to a private repo.`)
    const comments = (await graphqlPages<{ body: string }>(io, 'Comments', COMMENTS, { owner: ref.owner, name: ref.name, number: ref.number }, d => d.repository.issue.comments)).map(c => c.body)
    const texts = [issue.body, ...comments]
    const refs = [...new Map(texts.flatMap(t => parseRefs(t)).map(r => [r.url, r])).values()]
    const fresh = new Map<string, string>()
    for (const [i, r] of refs.entries()) fresh.set(r.url, (await upload(io, await download(io, r, `${TMP_ROOT}/${call.tool_use_id}/${i}`), dest.repo)).url)
    const swap = (t: string) => [...fresh].reduce((s, [old, now]) => s.replaceAll(old, now), t)
    const [body, copies] = [swap(issue.body), comments.map(swap)]
    // Old attachment URLs are never referenced from the public repo; one that isn't a [name](url) link wasn't uploaded again.
    const left = attachmentUrls(texts.join('\n')).filter(u => [body, ...copies].some(t => t.includes(u)))
    if (left.length) throw new ToolError(`These attachments in ${link(issue)} or its comments aren't [name](url) links, so they weren't uploaded again, and a public issue must not reference them: ${left.join(', ')}. Make each one a link, then call idea_move again.`)
    checkBody(body)

    const url = await createIssue(io, dest.repo, board.title, issue.title, body)
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
