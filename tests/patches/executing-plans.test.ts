import { expect, test } from 'claude-code/testing'
import { PATCHED_FOR } from '../../hooks/config'
import { executingPlans } from '../../hooks/patches/executing-plans'
import { SKILLS } from '../fixtures/superpowers'
import { boot, router } from '../kit'

test('executing-plans reaches the model replaced', async ($, on) => {
  await boot($, on, { reply: router({}) })
  expect((await $.skill.prompt({ skill: 'superpowers:executing-plans', text: SKILLS['executing-plans'] })).text).toBe(executingPlans.text)
})

test('executing-plans is replaced the same way whatever superpowers holds: no anchor to block on, no version note', async ($, on) => {
  const json = (v: string) => ({ [`/sp/${v}/.claude-plugin/plugin.json`]: JSON.stringify({ version: v }) })
  await boot($, on, { reply: router({}), files: { ...json(PATCHED_FOR), ...json('9.9.9') } })
  const prompt = async (v: string, text: string) => (await $.skill.prompt({ skill: 'superpowers:executing-plans', text, path: `/sp/${v}/skills/executing-plans/SKILL.md` })).text
  expect(await prompt('9.9.9', 'something else')).toBe(await prompt(PATCHED_FOR, SKILLS['executing-plans']))
})
