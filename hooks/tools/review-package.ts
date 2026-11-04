import { git, type Io, ModelFacingError, run } from '../github/gh'
import { str, type Tool } from './engine'
import { PARENT, runFolder } from './run-folder'

async function fullCommitSha(io: Io, ref: string, end: 'BASE' | 'HEAD'): Promise<string> {
  const r = await run(io, ['git', 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  const sha = r.stdout.trim()
  if (r.code !== 0 || !sha) throw new ModelFacingError(`bad ${end}: ${ref}`)
  return sha
}

export const reviewPackageTool: Tool = {
  spec: {
    name: 'review_package',
    description: "Writes the review package for a task's commit range into the parent's run folder, in place of superpowers' scripts/review-package: the commit list, the stat summary and the full diff with 10 lines of context, as review-<base7>..<head7>.diff. Refuses a ref that names no commit, a HEAD that does not descend from BASE, and an empty range. Returns `wrote <path>: <n> commit(s), <size> bytes`.",
    inputSchema: {
      type: 'object',
      properties: {
        parent: PARENT,
        base: { type: 'string', description: 'BASE: the commit the task started from.' },
        head: { type: 'string', description: "HEAD: the task's last commit, usually HEAD." },
      },
      required: ['parent', 'base', 'head'],
    },
  },
  async run(io, input) {
    const [parent, base, head] = [str(input, 'parent'), str(input, 'base'), str(input, 'head')]
    const dir = await runFolder(io, parent)
    const from = await fullCommitSha(io, base, 'BASE')
    const to = await fullCommitSha(io, head, 'HEAD')
    const named = `${base}..${head}`
    const range = `${from}..${to}`
    // The same two range checks as the native script: a wrong-branch HEAD gives a range not rooted at BASE, or an empty one.
    if ((await run(io, ['git', 'merge-base', '--is-ancestor', from, to])).code !== 0) throw new ModelFacingError(`HEAD is not a descendant of BASE: ${named}`)
    const count = Number(await git(io, ['rev-list', '--count', range]))
    if (!(count > 0)) throw new ModelFacingError(`empty commit range: ${named}`)
    const log = await git(io, ['log', '--oneline', range])
    const stat = await git(io, ['diff', '--stat', range])
    const diff = await git(io, ['diff', '-U10', range])
    const text = `# Review package: ${named}\n\n## Commits\n${log}\n## Files changed\n${stat}\n## Diff\n${diff}`
    const out = `${dir}/review-${from.slice(0, 7)}..${to.slice(0, 7)}.diff`
    // The engine refuses a write over 4 MiB; registerTools hands that refusal to the model.
    await io.fs.write(out, text)
    return `wrote ${out}: ${count} commit(s), ${new TextEncoder().encode(text).length} bytes`
  },
}
