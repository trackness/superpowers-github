import { currentRepo, link, repoInfo } from '../board.ts'
import { IDEAS_REPO } from '../config.ts'
import { graphqlPages, ToolError } from '../gh.ts'
import { optStr, str, type Tool } from '../tools.ts'

// `viewer`: every board is created under the repo owner's login, which is the signed-in gh user (ruling R6).
const ITEMS = `query Items($number: Int!, $after: String) {
  viewer {
    projectV2(number: $number) {
      items(first: 100, after: $after) {
        nodes {
          status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
          content { ... on Issue { number title url closed } }
        }
        pageInfo { hasNextPage endCursor }
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
    const items = await graphqlPages<any>(io, 'Items', ITEMS, { number: info.board.number }, d => d.viewer.projectV2.items)
    const lines = items.filter(i => i?.content?.number && !i.content.closed && i.status?.name === status).map(i => `- ${link(i.content)}`)
    return lines.length ? lines.join('\n') : `No issues in ${status} on ${info.repo}'s board.`
  },
}
