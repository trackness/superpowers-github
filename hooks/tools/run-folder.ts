import { git, type Io, parseIssue, runOk } from '../gh.ts'
import { str, type Tool } from '../tools.ts'

export const PARENT = {
  type: 'string',
  description: "The parent issue: its URL (https://github.com/<owner>/<repo>/issues/<number>) or <owner>/<repo>#<number>.",
}

// The run folder superpowers' sdd-workspace makes, keyed by the parent issue's number instead of the plan file.
export async function runFolder(io: Io, parentUrl: string): Promise<string> {
  const { number } = parseIssue(parentUrl)
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
    description: "Resolves and creates the run folder for a parent issue, in place of superpowers' scripts/sdd-workspace: <repo root>/.superpowers/sdd/<parent issue number>/, kept out of git by .superpowers/sdd/.gitignore (created only when absent). Returns the folder's absolute path. A folder that already exists for the same parent is a resume: its progress log says where the run stands.",
    inputSchema: { type: 'object', properties: { parent: PARENT }, required: ['parent'] },
  },
  run: (io, input) => runFolder(io, str(input, 'parent')),
}
