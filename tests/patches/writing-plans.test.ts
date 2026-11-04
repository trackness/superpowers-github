import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../../hooks/patches/engine'
import { writingPlans } from '../../hooks/patches/writing-plans'
import { SKILLS } from '../fixtures/superpowers-7.0.0'
import { boot, router } from '../kit'

const ABSENT = [
  'docs/superpowers/plans/', 'executing-plans', '**Spec:**', 'Native', 'Which execution approach', '# [Feature Name] Implementation Plan',
  'a new one made with', 'pass it back', "run subagent-driven-development's pre-start check",
]
const PRESENT = [
  'mcp__superpowers-github__work_list',
  'mcp__superpowers-github__issue_create',
  'mcp__superpowers-github__issue_edit',
  'mcp__superpowers-github__idea_move',
  '`## Plan`',
  'replaces the whole body',
  '65,536',
  'should we start?',
  'superpowers:subagent-driven-development',
  'get its name and visibility from your human partner',
  'with `appendBody` set to the `## Plan` section',
  '`blockedBy` listing the issue numbers (the `#n` from `mcp__superpowers-github__issue_create` or the status listing), not the task numbers',
  '`removeBlockedBy` where the fix is about order, giving the issue numbers (the `#n` from `mcp__superpowers-github__issue_create` or the status listing), not the task numbers',
  'do not load that skill',
  'inside a repo also with `repo` `trackness/ideas`',
  'run Self-Review checks 1-5 first; then write the parent\'s `## Plan` and create the sub-issues; then run check 6',
]
const patched = () => applyPatches(SKILLS['writing-plans'], writingPlans)
test('every writing-plans patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched writing-plans keeps nothing the mod replaces', () => { for (const s of ABSENT) expect(patched().text).not.toContain(s) })
test("the patched writing-plans says what the mod does instead", () => { for (const s of PRESENT) expect(patched().text).toContain(s) })
test('writing-plans reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['writing-plans'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:writing-plans', text })).text).toBe(applyPatches(text, writingPlans).text)
})
