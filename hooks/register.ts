import type { Register } from 'claude-code'
import { brainstorming } from './patches/brainstorming'
import { registerPatches } from './patches/engine'
import { executingPlans } from './patches/executing-plans'
import { finishing } from './patches/finishing'
import { subagentDrivenDevelopment } from './patches/subagent-driven-development'
import { writingPlans } from './patches/writing-plans'
import { attachTool } from './tools/attach'
import { boardSetupTool } from './tools/board-setup'
import { designWriteTool } from './tools/design-write'
import { registerTools } from './tools/engine'
import { ideaMoveTool } from './tools/idea-move'
import { issueCreateTool } from './tools/issue-create'
import { issueEditTool } from './tools/issue-edit'
import { prCheckTool } from './tools/pr-check'
import { reviewPackageTool } from './tools/review-package'
import { runFolderTool } from './tools/run-folder'
import { statusTool } from './tools/status'
import { workListTool } from './tools/work-list'

export const register: Register = on => {
  registerTools(on, [runFolderTool, reviewPackageTool, statusTool, workListTool, issueCreateTool, issueEditTool, attachTool, designWriteTool, boardSetupTool, ideaMoveTool, prCheckTool])
  registerPatches(on, [executingPlans, brainstorming, writingPlans, subagentDrivenDevelopment, finishing])
}
