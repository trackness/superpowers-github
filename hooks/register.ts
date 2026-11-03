import type { Register } from 'claude-code'
import { registerPatches } from './patches/engine.ts'
import { executingPlans } from './patches/executing-plans.ts'
import { registerTools } from './tools.ts'
import { reviewPackageTool } from './tools/review-package.ts'
import { runFolderTool } from './tools/run-folder.ts'
import { statusTool } from './tools/status.ts'
import { workListTool } from './tools/work-list.ts'

export const register: Register = on => {
  registerTools(on, [runFolderTool, reviewPackageTool, statusTool, workListTool])
  registerPatches(on, [executingPlans])
}
