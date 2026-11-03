export const PLUGIN = 'superpowers-github'
export const TOOL_PREFIX = 'mcp__superpowers-github__'
export const REPO_DIR = '/Users/james/workspace/claude-code/plugins/superpowers-github'
export const IDEAS_REPO = 'trackness/ideas'
export const BODY_LIMIT = 65_536
export const GH_IMAGE = { repo: 'drogers0/gh-image', version: 'v1.4.1' }
export const TMP_ROOT = '/tmp/superpowers-github'

export const STATUSES = ['Idea', 'Designed', 'Todo', 'In Progress', 'In Review', 'Done'] as const
export type Status = (typeof STATUSES)[number]

// Board workflow name → whether it must be on.
export const WORKFLOWS: Record<string, boolean> = {
  'Item closed': true,
  'Auto-close issue': true,
  'Item added to project': false,
  'Pull request linked to issue': false,
  'Pull request merged': false,
  'Auto-add sub-issues to project': false,
}
