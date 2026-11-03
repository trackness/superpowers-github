import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../hooks/patches/engine.ts'
import { subagentDrivenDevelopment } from '../hooks/patches/subagent-driven-development.ts'
import { SKILLS } from './fixtures/superpowers-7.0.0.ts'
import { boot, router } from './kit.ts'

const ABSENT = ['PLAN_FILE', 'scripts/', 'plan file', 'executing-plans', 'Rulings I made', 'task-brief', 'sdd-workspace', 'Rule and continue', 'presents the options']
const PRESENT = [
  'mcp__superpowers-github__run_folder',
  'mcp__superpowers-github__review_package',
  'mcp__superpowers-github__status',
  'mcp__superpowers-github__issue_edit',
  'In Progress',
  'In Review',
  'gh issue view',
  'Plan change:',
  '## Plan changes made during the run',
  '# SDD ledger — plan: <parent issue URL>',
  'Batch small same-shape work',
  'names each batched sub-issue',
  'moves to In Review now',
]
const patched = () => applyPatches(SKILLS['subagent-driven-development'], subagentDrivenDevelopment)
test('every subagent-driven-development patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched subagent-driven-development keeps nothing the mod replaces', () => { for (const s of ABSENT) expect(patched().text).not.toContain(s) })
test("the patched subagent-driven-development says what the mod does instead", () => { for (const s of PRESENT) expect(patched().text).toContain(s) })
test('subagent-driven-development reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['subagent-driven-development'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:subagent-driven-development', text })).text).toBe(applyPatches(text, subagentDrivenDevelopment).text)
})
