import type { Register } from 'claude-code'
import { brainstorming } from './patches/brainstorming.ts'
import { registerPatches } from './patches/engine.ts'
import { executingPlans } from './patches/executing-plans.ts'
import { registerTools } from './tools.ts'
import { attachTool } from './tools/attach.ts'
import { boardSetupTool } from './tools/board-setup.ts'
import { designWriteTool } from './tools/design-write.ts'
import { ideaMoveTool } from './tools/idea-move.ts'
import { issueCreateTool } from './tools/issue-create.ts'
import { issueEditTool } from './tools/issue-edit.ts'
import { prCheckTool } from './tools/pr-check.ts'
import { reviewPackageTool } from './tools/review-package.ts'
import { runFolderTool } from './tools/run-folder.ts'
import { statusTool } from './tools/status.ts'
import { workListTool } from './tools/work-list.ts'

export const register: Register = on => {
  registerTools(on, [runFolderTool, reviewPackageTool, statusTool, workListTool, issueCreateTool, issueEditTool, attachTool, designWriteTool, boardSetupTool, ideaMoveTool, prCheckTool])
  registerPatches(on, [executingPlans, brainstorming])
}
