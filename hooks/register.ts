import type { Register } from 'claude-code'
import { registerTools } from './tools.ts'
import { reviewPackageTool } from './tools/review-package.ts'
import { runFolderTool } from './tools/run-folder.ts'

export const register: Register = on => {
  registerTools(on, [runFolderTool, reviewPackageTool])
}
