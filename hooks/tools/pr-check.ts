import { link, linkWithColumn, readWork } from '../github/board'
import { graphql, ModelFacingError } from '../github/gh'
import { str, type Tool } from './engine'
import { PARENT } from './run-folder'

const HEADING = '## Plan changes made during the run'

const CLOSING_REFS = `query ClosingRefs($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    pullRequest(number: $number) {
      body
      baseRefName
      closingIssuesReferences(first: 100) { nodes { number repository { nameWithOwner } } }
    }
  }
}`

const PR_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/([1-9]\d*)\/?(?:#.*)?$/

function readPr(input: Record<string, unknown>, parentRepo: string): { owner: string; name: string; number: number } {
  const pr = input.pr
  const [owner, name] = parentRepo.split('/') as [string, string]
  if (typeof pr === 'number' && Number.isInteger(pr) && pr > 0) return { owner, name, number: pr }
  const text = str(input, 'pr')
  const m = PR_URL.exec(text)
  if (m) return { owner: m[1]!, name: m[2]!, number: Number(m[3]) }
  if (/^[1-9]\d*$/.test(text)) return { owner, name, number: Number(text) }
  throw new ModelFacingError(`pr must be a number or a PR URL (https://github.com/<owner>/<repo>/pull/<number>), not "${text}"`)
}

const ref = (repo: string, i: { number: number }) => `${repo}#${i.number}`

export const prCheckTool: Tool = {
  spec: {
    name: 'pr_check',
    description: `The gate before a PR and the check after it. Without \`pr\`: every task of the parent must be In Review or Done (a parent with no tasks, a small change, must itself be); returns the \`Closes #n\` lines for the PR description. With \`pr\`: checks that the PR targets the repo's default branch (GitHub closes issues only from a PR into it), that its closing issues are exactly the parent and every task, and that a planned run's PR body carries "${HEADING}".`,
    inputSchema: {
      type: 'object',
      properties: {
        parent: PARENT,
        pr: { type: ['number', 'string'], description: 'The opened PR: its number or URL. Leave it out to check the gate before opening one.' },
      },
      required: ['parent'],
    },
  },
  async run(io, input) {
    const work = await readWork(io, str(input, 'parent'))
    if (work.parent) throw new ModelFacingError(`${link(work.issue)} is a task of ${link(work.parent)}: give the parent issue, ${work.parent.url}.`)
    const { issue: parent, tasks } = work
    if (input.pr == null) {
      const notReady = (tasks.length ? tasks : [parent]).filter(i => i.status !== 'In Review' && i.status !== 'Done')
      if (notReady.length) throw new ModelFacingError(`No PR: these ${tasks.length ? 'tasks' : 'changes'} are neither In Review nor Done:\n${notReady.map(i => `- ${linkWithColumn(i)}`).join('\n')}`)
      const closes = [parent, ...tasks].map(i => `Closes #${i.number}`)
      return tasks.length ? `Gate passed. Put these lines in the PR description:\n${closes.join('\n')}\nand a "${HEADING}" section.` : closes.join('\n')
    }
    const pr = readPr(input, work.repo.repo)
    const { repository } = await graphql<any>(io, 'ClosingRefs', CLOSING_REFS, pr)
    const [base, main] = [repository.pullRequest.baseRefName, repository.defaultBranchRef.name]
    if (base !== main) throw new ModelFacingError(`PR #${pr.number} targets ${base}, not the default branch ${main}: GitHub closes issues only from a PR into the default branch, so its Closes lines would never close anything. Retarget it with \`gh pr edit ${pr.number} --base ${main}\`, or tell your human partner.`)
    const found = new Set<string>(repository.pullRequest.closingIssuesReferences.nodes.map((n: any) => ref(n.repository.nameWithOwner, n)))
    const want = new Set([parent, ...tasks].map(i => ref(work.repo.repo, i)))
    const show = (key: string) => (key.startsWith(`${work.repo.repo}#`) ? `#${key.split('#')[1]}` : key)
    const part = (label: string, keys: string[]) => (keys.length ? `${label}: ${keys.map(show).join(', ')}.` : '')
    const missing = [...want].filter(k => !found.has(k))
    const extra = [...found].filter(k => !want.has(k))
    if (missing.length || extra.length) {
      throw new ModelFacingError(`The PR's closing issues don't match. ${[part('Missing', missing), part('Extra', extra)].filter(Boolean).join(' ')} Fix the description (gh pr edit ${pr.number} --body …) and check again.`)
    }
    if (tasks.length && !repository.pullRequest.body.includes(HEADING)) throw new ModelFacingError(`The PR body needs a "${HEADING}" section. Add it (gh pr edit ${pr.number} --body …) and check again.`)
    return `PR #${pr.number} closes exactly the parent and every task: hand it over.`
  },
}
