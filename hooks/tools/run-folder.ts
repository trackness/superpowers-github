import { currentRepo } from '../github/board'
import { git, type Io, ModelFacingError, parseIssue, runOk } from '../github/gh'
import { str, type Tool } from './engine'

export const PARENT = {
  type: 'string',
  description: "The parent issue: its URL (https://github.com/<owner>/<repo>/issues/<number>) or <owner>/<repo>#<number>.",
}

export async function runFolder(io: Io, parentUrl: string): Promise<string> {
  const { number, repo, url } = parseIssue(parentUrl)
  // The folder is keyed by number alone, so in another repo's checkout it would be that repo's own #<number>. Unknown (gh can't tell) passes.
  const here = await currentRepo(io)
  if (here && here.toLowerCase() !== repo.toLowerCase()) throw new ModelFacingError(`The parent ${url} is in ${repo}, but this checkout is ${here}: its run folder and commits would land in ${here}. Work from a checkout of ${repo}.`)
  const root = (await git(io, ['rev-parse', '--show-toplevel'])).replace(/\n$/, '')
  const sdd = `${root}/.superpowers/sdd`
  const dir = `${sdd}/${number}`
  await runOk(io, ['mkdir', '-p', dir])
  // Create-only: a repo may commit its own .gitignore here.
  if (!(await io.fs.exists(`${sdd}/.gitignore`))) await io.fs.write(`${sdd}/.gitignore`, '*\n')
  return dir
}

export const runFolderTool: Tool = {
  spec: {
    name: 'run_folder',
    description: "Resolves and creates the run folder for a parent issue, in place of superpowers' scripts/sdd-workspace: <repo root>/.superpowers/sdd/<parent issue number>/, kept out of git by .superpowers/sdd/.gitignore (created only when absent). Returns the folder's absolute path. Refuses a parent from another repo than this checkout's. A folder that already exists for the same parent is a resume: its progress log says where the run stands.",
    inputSchema: { type: 'object', properties: { parent: PARENT }, required: ['parent'] },
  },
  run: (io, input) => runFolder(io, str(input, 'parent')),
}
