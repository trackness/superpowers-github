import { STATUSES, type Status, WORKFLOWS } from './config.ts'
import { graphql, type Io, ToolError } from './gh.ts'

export type StatusField = { projectId: string; fieldId: string; options: { id: string; name: string }[] }
export type Workflow = { id: string; name: string; enabled: boolean }

export const OPTION_STYLE: Record<Status, { color: string; description: string }> = {
  Idea: { color: 'GRAY', description: 'Its body is only the idea' },
  Designed: { color: 'PURPLE', description: 'Designed; not yet planned' },
  Todo: { color: 'BLUE', description: 'Planned; not started' },
  'In Progress': { color: 'YELLOW', description: 'With an implementer' },
  'In Review': { color: 'ORANGE', description: 'Approved by its reviewer; waiting for the merge' },
  Done: { color: 'GREEN', description: 'Merged' },
}

// The board's owner is a user or an organization, and both are a ProjectV2Owner.
const FIELDS = `query Fields($owner: String!, $number: Int!) {
  repositoryOwner(login: $owner) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        id
        field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
      }
    }
  }
}`

const SET_OPTIONS = `mutation SetOptions($fieldId: ID!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
  updateProjectV2Field(input: { fieldId: $fieldId, singleSelectOptions: $options }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
}`

// A board has about a dozen built-in workflows at most, so one page holds them all.
const WORKFLOW_LIST = `query Workflows($owner: String!, $number: Int!) {
  repositoryOwner(login: $owner) {
    ... on ProjectV2Owner { projectV2(number: $number) { workflows(first: 100) { nodes { id name enabled } } } }
  }
}`

const DELETE_WORKFLOW = `mutation DeleteWorkflow($workflowId: ID!) {
  deleteProjectV2Workflow(input: { workflowId: $workflowId }) { deletedWorkflowId }
}`

const VIEWS = `query Views($owner: String!, $number: Int!) {
  repositoryOwner(login: $owner) {
    ... on ProjectV2Owner { projectV2(number: $number) { views(first: 100) { nodes { layout } } } }
  }
}`

const CREATE_VIEW = `mutation CreateView($projectId: ID!, $name: String!, $layout: ProjectV2ViewLayout!) {
  createProjectV2View(input: { projectId: $projectId, name: $name, layout: $layout }) { projectV2View { id } }
}`

const project = async (io: Io, op: string, query: string, owner: string, number: number): Promise<any> =>
  (await graphql<any>(io, op, query, { owner, number })).repositoryOwner.projectV2

export async function statusField(io: Io, owner: string, number: number): Promise<StatusField> {
  const p = await project(io, 'Fields', FIELDS, owner, number)
  if (!p.field?.id) throw new ToolError(`Board ${number} of ${owner} has no single-select field named Status.`)
  return { projectId: p.id, fieldId: p.field.id, options: p.field.options }
}

// The six in order. An option the field already has keeps its ID, so "Item closed" still finds Done.
export async function setOptions(io: Io, field: StatusField): Promise<void> {
  // An undefined id drops out of the JSON body, and GitHub gives that option a new one.
  const options = STATUSES.map(name => ({ id: field.options.find(o => o.name === name)?.id, name, ...OPTION_STYLE[name] }))
  await graphql(io, 'SetOptions', SET_OPTIONS, { fieldId: field.fieldId, options })
}

export async function workflows(io: Io, owner: string, number: number): Promise<Workflow[]> {
  return (await project(io, 'Workflows', WORKFLOW_LIST, owner, number)).workflows.nodes
}

// A must-be-off workflow that is deleted or disabled is fine.
export function workflowDiffs(list: Workflow[]): string[] {
  return Object.entries(WORKFLOWS).flatMap(([name, mustBeOn]) => {
    const found = list.filter(w => w.name === name)
    const on = found.some(w => w.enabled)
    if (mustBeOn) return !found.length ? [`${name}: missing, must be on`] : on ? [] : [`${name}: off, must be on`]
    return on ? [`${name}: on, must be off`] : []
  })
}

// The API can't switch a workflow off, and a deleted one can't fire.
export async function deleteOffWorkflows(io: Io, list: Workflow[]): Promise<string[]> {
  const off = list.filter(w => WORKFLOWS[w.name] === false)
  for (const w of off) await graphql(io, 'DeleteWorkflow', DELETE_WORKFLOW, { workflowId: w.id })
  return off.map(w => w.name)
}

export async function ensureBoardView(io: Io, owner: string, number: number, projectId: string): Promise<void> {
  const { views } = await project(io, 'Views', VIEWS, owner, number)
  if (views.nodes.some((v: { layout: string }) => v.layout === 'BOARD_LAYOUT')) return
  await graphql(io, 'CreateView', CREATE_VIEW, { projectId, name: 'Board', layout: 'BOARD_LAYOUT' })
}

// The one fix the API can't make: a must-be-on workflow that is missing or off.
export const fixSteps = (boardUrl: string): string =>
  `Open ${boardUrl}. In the top-right, click the ⋯ menu, then Workflows. Under "Default workflows", click each workflow listed above, click Edit, set it (for "Item closed": Status = Done), then click "Save and turn on workflow". Then call this tool again: it reads the workflows back through the API.`
