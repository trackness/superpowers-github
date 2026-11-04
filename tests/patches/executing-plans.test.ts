import { expect, test } from 'claude-code/testing'
import { executingPlans } from '../../hooks/patches/executing-plans'
import { SKILLS } from '../fixtures/superpowers-7.0.0'
import { boot, router } from '../kit'

test('executing-plans reaches the model replaced', async ($, on) => {
  await boot($, on, { reply: router({}) })
  expect((await $.skill.prompt({ skill: 'superpowers:executing-plans', text: SKILLS['executing-plans'] })).text).toBe(executingPlans.replaceWith)
})
