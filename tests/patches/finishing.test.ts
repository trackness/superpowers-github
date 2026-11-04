import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../../hooks/patches/engine'
import { finishing } from '../../hooks/patches/finishing'
import { SKILLS } from '../fixtures/superpowers-7.0.0'
import { boot, router } from '../kit'

const ABSENT = [
  'Merge back to', 'Keep the branch as-is', 'Which option?', '### Option', 'Options 2 and 3', 'Present the menu', 'The menu is complete', 'the menu comes',
  'Verify tests → Gate', 'Step 5 changes directory', 'merged-result', 'merged result', 'before merging', 'obviously main',
]
const TARGETS_DEFAULT_BRANCH = ['gh repo view --json defaultBranchRef', 'stop before opening the PR']
const HANDLES_NO_PARENT_ISSUE = ['With no parent issue', 'skip the gate and the `Closes` lines']
const RUN_FOLDER_OUTLIVES_PR_CHECK = ['rm -rf <repo root>/.superpowers/sdd/<parent issue number>', "the run folder's `progress.md`"]
const NO_LOCAL_MERGE_LEFT = ['**Core principle:** Verify tests → Detect environment → Gate → Push and open the PR → Clean up.', 'the discard path changes directory', 'Confirm it before opening the PR.']
const PRESENT = [
  'mcp__superpowers-github__pr_check',
  'Closes #',
  '--squash --delete-branch',
  '## Plan changes made during the run',
  'HEAD:refs/heads/<new-branch>',
  '--head <new-branch>',
  ...TARGETS_DEFAULT_BRANCH,
  ...HANDLES_NO_PARENT_ISSUE,
  ...RUN_FOLDER_OUTLIVES_PR_CHECK,
  ...NO_LOCAL_MERGE_LEFT,
]
const patched = () => applyPatches(SKILLS['finishing-a-development-branch'], finishing)
test('every finishing patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched finishing keeps nothing the mod replaces', () => { const t = patched().text; expect(ABSENT.filter(s => t.includes(s))).toEqual([]) })
test("the patched finishing says what the mod does instead", () => { const t = patched().text; expect(PRESENT.filter(s => !t.includes(s))).toEqual([]) })
test('finishing reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['finishing-a-development-branch'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:finishing-a-development-branch', text })).text).toBe(applyPatches(text, finishing).text)
})
