import type { PatchSet } from './engine.ts'

export const executingPlans: PatchSet = {
  skill: 'superpowers:executing-plans',
  patches: [{
    id: 'e-anchor',
    find: '# Executing Plans',
    replace: '# Executing Plans',
    ifMissing: 'executing-plans runs as upstream wrote it if invoked: inline execution with plan files on disk, which this setup does not support.',
  }],
  replaceWith: '# Executing Plans\n\nNot used here: this setup always executes plans with superpowers:subagent-driven-development. Invoke that skill instead, with the plan\'s parent issue.',
}
