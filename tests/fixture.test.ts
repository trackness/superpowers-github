import { expect, test } from 'claude-code/testing'
import { PATCHED_FOR } from '../hooks/config'
import { SKILLS, VERSION } from './fixtures/superpowers'

// The README's Tests section has the full check that the fixture is verbatim: regenerate, then git diff.
test('the fixture is the superpowers version the patches are written for, with the five patched skills, spot-checked in three places', () => {
  expect(VERSION).toBe(PATCHED_FOR)
  expect(Object.keys(SKILLS).sort()).toEqual(['brainstorming', 'executing-plans', 'finishing-a-development-branch', 'subagent-driven-development', 'writing-plans'])
  expect(SKILLS['brainstorming'].startsWith('---\nname: brainstorming\n')).toBe(true)
  expect(SKILLS['subagent-driven-development']).toContain('`bash scripts/task-brief PLAN_FILE N`')
  expect(SKILLS['writing-plans']).toContain('Use superpowers:executing-plans')
})
