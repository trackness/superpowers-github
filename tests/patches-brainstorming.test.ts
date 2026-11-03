import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../hooks/patches/engine.ts'
import { brainstorming } from '../hooks/patches/brainstorming.ts'
import { SKILLS } from './fixtures/superpowers-7.0.0.ts'
import { boot, router } from './kit.ts'

const ABSENT = ['docs/superpowers/specs/']
const PRESENT = [
  'mcp__superpowers-github__work_list',
  'mcp__superpowers-github__design_write',
  'mcp__superpowers-github__issue_create',
  'mcp__superpowers-github__issue_edit',
  'mcp__superpowers-github__attach',
  'mcp__superpowers-github__board_setup',
  'mcp__superpowers-github__status',
  'SUPERPOWERS_DISABLE_TELEMETRY=1',
  'gh issue view',
  'a new piece of work',
]
const patched = () => applyPatches(SKILLS['brainstorming'], brainstorming)
test('every brainstorming patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched brainstorming keeps nothing the mod replaces', () => { for (const s of ABSENT) expect(patched().text).not.toContain(s) })
test("the patched brainstorming says what the mod does instead", () => { for (const s of PRESENT) expect(patched().text).toContain(s) })
test('brainstorming reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['brainstorming'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:brainstorming', text })).text).toBe(applyPatches(text, brainstorming).text)
})
