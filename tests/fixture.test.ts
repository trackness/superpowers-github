import { expect, test } from 'claude-code/testing'
import { SKILLS, VERSION } from './fixtures/superpowers-7.0.0'

// The README's Tests section has the full check that the fixture is verbatim: regenerate, then git diff.
test('the fixture is superpowers 7.0.0 with the five patched skills, spot-checked in three places', () => {
  expect(VERSION).toBe('7.0.0')
  expect(Object.keys(SKILLS).sort()).toEqual(['brainstorming', 'executing-plans', 'finishing-a-development-branch', 'subagent-driven-development', 'writing-plans'])
  expect(SKILLS['brainstorming'].startsWith('---\nname: brainstorming\n')).toBe(true)
  expect(SKILLS['subagent-driven-development']).toContain('`bash scripts/task-brief PLAN_FILE N`')
  expect(SKILLS['writing-plans']).toContain('Use superpowers:executing-plans')
})
