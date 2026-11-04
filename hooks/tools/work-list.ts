import { currentRepo, link, repoInfo } from '../board.ts'
import { IDEAS_REPO, TOOL_PREFIX } from '../config.ts'
import { graphqlPages, ToolError } from '../gh.ts'
import { workflowDiffs, workflows } from '../setup.ts'
import { optStr, str, type Tool } from '../tools.ts'

// The board's owner is a user or an organization, and both are a ProjectV2Owner. GitHub applies the board's own filter.
const ITEMS = `query Items($owner: String!, $number: Int!, $filter: String!, $after: String) {
  repositoryOwner(login: $owner) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        items(first: 100, after: $after, query: $filter) {
          nodes {
            status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            content { ... on Issue { number title url closed } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
}`

export const workListTool: Tool = {
  spec: {
    name: 'work_list',
    description: `Lists the open issues in Idea or Designed on a repo's board as \`- [#n title](url)\` lines, to ask James which piece of work to pick up. The repo defaults to the session's GitHub repo, else ${IDEAS_REPO}. A repo with no board says so; that is not an error.`,
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['Idea', 'Designed'], description: 'The column to list.' },
        repo: { type: 'string', description: `<owner>/<name>. Defaults to the session's GitHub repo, else ${IDEAS_REPO}.` },
      },
      required: ['status'],
    },
  },
  async run(io, input) {
    const status = str(input, 'status')
    if (status !== 'Idea' && status !== 'Designed') throw new ToolError('status must be Idea or Designed')
    const info = await repoInfo(io, optStr(input, 'repo') ?? (await currentRepo(io)) ?? IDEAS_REPO)
    if (!info.board) return `${info.repo} has no board yet.`
    const { owner, number, title, url } = info.board
    const items = await graphqlPages<any>(io, 'Items', ITEMS, { owner, number, filter: `is:open is:issue status:${status}` }, d => {
      // A login GitHub no longer knows answers null, with no error.
      if (!d.repositoryOwner?.projectV2) throw new ToolError(`GitHub found no board ${number} of ${owner} (${url}), the board linked to ${info.repo}.`)
      return d.repositoryOwner.projectV2.items
    })
    // A safety net behind GitHub's filter.
    const lines = items.filter(i => i?.content?.number && !i.content.closed && i.status?.name === status).map(i => `- ${link(i.content)}`)
    // A workflow that must be off moves cards too, and two movers fight over one card.
    const diffs = workflowDiffs(await workflows(io, owner, number))
    const warning = diffs.length ? [`Board "${title}" (${url}) differs: ${diffs.join('; ')}. Call ${TOOL_PREFIX}board_setup with repair: true for ${info.repo} before using it.`] : []
    return [lines.length ? lines.join('\n') : `No issues in ${status} on ${info.repo}'s board.`, ...warning].join('\n')
  },
}
