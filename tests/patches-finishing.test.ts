import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../hooks/patches/engine.ts'
import { finishing } from '../hooks/patches/finishing.ts'
import { SKILLS } from './fixtures/superpowers-7.0.0.ts'
import { boot, router } from './kit.ts'

const ABSENT = ['Merge back to', 'Keep the branch as-is', 'Which option?', '### Option', 'Options 2 and 3', 'Present the menu', 'The menu is complete', 'the menu comes']
const PRESENT = [
  'mcp__superpowers-github__pr_check',
  'Closes #',
  '--squash --delete-branch',
  '## Plan changes made during the run',
  'HEAD:refs/heads/<new-branch>',
  '--head <new-branch>',
]
const patched = () => applyPatches(SKILLS['finishing-a-development-branch'], finishing)
test('every finishing patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched finishing keeps nothing the mod replaces', () => { for (const s of ABSENT) expect(patched().text).not.toContain(s) })
test("the patched finishing says what the mod does instead", () => { for (const s of PRESENT) expect(patched().text).toContain(s) })
test('finishing reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['finishing-a-development-branch'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:finishing-a-development-branch', text })).text).toBe(applyPatches(text, finishing).text)
})
