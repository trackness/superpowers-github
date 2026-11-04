import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../hooks/patches/engine.ts'
import { subagentDrivenDevelopment } from '../hooks/patches/subagent-driven-development.ts'
import { SKILLS } from './fixtures/superpowers-7.0.0.ts'
import { boot, router } from './kit.ts'

const ABSENT = [
  'PLAN_FILE', 'scripts/', 'plan file', 'executing-plans', 'Rulings I made', 'task-brief', 'sdd-workspace', 'Rule and continue', 'presents the options',
  'leave it in place and start your own',
  'In every template',
  "delete this plan's workspace",
  'rm -rf <workspace>',
  'Before you delete anything',
  'each edited sub-issue so the implementer',
  '"Fix the plan (edit the sub-issues), announce, ledger"',
  'Conflicts,',
  'the sub-issue link',
]
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
  'giving the issue numbers (the `#n` from',
  'progress-other.md',
  'a task never starts before every task it is blocked by is complete',
  'in the run order below',
  "In every task's template",
  'filling its `[BRIEF_FILE]` with the parent issue URL',
  "the report file takes the first task's N",
  'leave the run folder in place',
  "names the task's own sub-issue (each batched one, for a batch)",
  '"Fix the plan (edit the sub-issues), or rule if the spec backs it; announce, ledger"',
  'Ambiguities, a cap you would have asked to exceed — decide them.',
  '`[PLAN_OR_REQUIREMENTS]` with the parent issue URL and every task sub-issue',
  'the sub-issue (as `[BRIEF_FILE]`, filled exactly as for the implementer), the report-file path',
  '(folded into #n)',
  'none: too large to package',
  'is complete even when the ledger has no line for it',
]
const PARENT_PLAN_FIX = "or the parent's `## Plan` section when the mistake is there"
const patched = () => applyPatches(SKILLS['subagent-driven-development'], subagentDrivenDevelopment)
test('every subagent-driven-development patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched subagent-driven-development keeps nothing the mod replaces', () => expect(ABSENT.filter(s => patched().text.includes(s))).toEqual([]))
test("the patched subagent-driven-development says what the mod does instead", () => expect(PRESENT.filter(s => !patched().text.includes(s))).toEqual([]))
// Principle, pre-start scan, BLOCKED, plan-mandated finding, breaker: each route that edits the plan.
test("every plan-fix route can fix the parent's ## Plan section too", () => expect(patched().text.split(PARENT_PLAN_FIX).length - 1).toBe(5))
test('subagent-driven-development reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['subagent-driven-development'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:subagent-driven-development', text })).text).toBe(applyPatches(text, subagentDrivenDevelopment).text)
})
