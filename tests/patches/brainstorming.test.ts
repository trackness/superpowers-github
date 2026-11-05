import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../../hooks/patches/engine'
import { brainstorming } from '../../hooks/patches/brainstorming'
import { SKILLS } from '../fixtures/superpowers'
import { boot, router } from '../kit'

const ABSENT = ['docs/superpowers/specs/', '<session>', 'read its body with `gh issue view <url>`']
const PRESENT = [
  'mcp__superpowers-github__work_list',
  'mcp__superpowers-github__design_write',
  'mcp__superpowers-github__issue_create',
  'mcp__superpowers-github__issue_edit',
  'mcp__superpowers-github__attach',
  'mcp__superpowers-github__board_setup',
  'mcp__superpowers-github__status',
  'mcp__superpowers-github__idea_move',
  'SUPERPOWERS_DISABLE_TELEMETRY=1',
  'gh issue view',
  'a new piece of work',
  'ask which repo it will be built in (`repo` for `mcp__superpowers-github__issue_create`); an issue still in `trackness/ideas` is first moved there with `mcp__superpowers-github__idea_move`',
  'If your human partner then skips the questions, treat a chosen issue as a small change',
  'Creating the repo, its board and the parent issue is not building.',
  'path set to the `screen_dir` value from start-server\'s output',
  '`gh issue view <url> --json title,body,comments` and take the body and every comment as the description so far',
]
const patched = () => applyPatches(SKILLS['brainstorming'], brainstorming)
test('every brainstorming patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched brainstorming keeps nothing the mod replaces', () => { const t = patched().text; expect(ABSENT.filter(s => t.includes(s))).toEqual([]) })
test("the patched brainstorming says what the mod does instead", () => { const t = patched().text; expect(PRESENT.filter(s => !t.includes(s))).toEqual([]) })
test('brainstorming reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['brainstorming'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:brainstorming', text })).text).toBe(applyPatches(text, brainstorming).text)
})
