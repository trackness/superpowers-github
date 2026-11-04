export const PLUGIN = 'superpowers-github'
export const TOOL_PREFIX = 'mcp__superpowers-github__'
export const PATCHED_FOR = '7.0.0'
export const IDEAS_REPO = 'trackness/ideas'
export const BODY_LIMIT = 65_536
export const ATTACHMENT_LINE_ROOM = 200
export const GH_IMAGE = { repo: 'drogers0/gh-image', version: 'v1.4.1' }
export const TMP_ROOT = '/tmp/superpowers-github'
// GitHub's "Item closed" workflow moves a closed issue to Done a little while after the close.
export const CLOSED_NOT_DONE_GRACE_MS = 5 * 60_000

export const STATUSES = ['Idea', 'Designed', 'Todo', 'In Progress', 'In Review', 'Done'] as const
export type Status = (typeof STATUSES)[number]

export const WORKFLOW_MUST_BE_ON: Record<string, boolean> = {
  'Item closed': true,
  'Auto-close issue': true,
  'Item added to project': false,
  'Pull request linked to issue': false,
  'Pull request merged': false,
  'Auto-add sub-issues to project': false,
}
