import { expect, test } from 'claude-code/testing'
import { applyPatches, blockText, type PatchSet } from '../hooks/patches/engine.ts'
import { executingPlans } from '../hooks/patches/executing-plans.ts'
import { SKILLS } from './fixtures/superpowers-7.0.0.ts'
import { boot, router } from './kit.ts'

const SET: PatchSet = { skill: 'superpowers:demo', patches: [
  { id: 'one', find: 'alpha\nbeta', replace: 'ALPHA', ifMissing: 'one is lost' },
  { id: 'two', find: 'ALPHA gamma', replace: 'done', ifMissing: 'two is lost' } ] }
test('patches apply in order, each on the text the earlier ones left', () => {
  expect(applyPatches('alpha\nbeta gamma', SET)).toEqual({ text: 'done', failures: [] })
})
test('a missing anchor is a failure that shows what is there now', () => {
  const r = applyPatches('alpha\nzeta gamma', SET)
  expect(r.failures.map(f => f.id)).toEqual(['one', 'two'])
  expect(r.failures[0].nearby).toBe('alpha\nzeta gamma')
  expect(r.failures[1].nearby).toBeUndefined()
})
test('an anchor found twice where once is expected blocks rather than patching both', () => {
  expect(applyPatches('alpha\nbeta alpha\nbeta', SET).failures[0]).toMatchObject({ id: 'one', found: 2 })
})
test('the block text names the skill, the version, the patch, the remedy and the workaround', () => {
  const t = blockText({ skill: 'superpowers:demo', version: '7.1.0', root: '/sp/7.1.0', failures: applyPatches('x', SET).failures, partial: 'PARTIAL' })
  for (const s of ['superpowers:demo', '7.1.0', 'one', 'alpha\nbeta', 'its first line does not appear', 'make-fixture.mjs /sp/7.1.0', 'claude plugin test', '/reload-plugins', 'one is lost', 'PARTIAL']) expect(t).toContain(s)
})
test('executing-plans reaches the model replaced', async ($, on) => {
  await boot($, on, { reply: router({}) })
  expect((await $.skill.prompt({ skill: 'superpowers:executing-plans', text: SKILLS['executing-plans'] })).text).toBe(executingPlans.replaceWith)
})
test('a skill whose anchor is missing comes back as the block text with the installed version', async ($, on) => {
  await boot($, on, { reply: router({}), files: { '/sp/9.0.0/.claude-plugin/plugin.json': '{"version":"9.0.0"}' } })
  const { text } = await $.skill.prompt({ skill: 'superpowers:executing-plans', text: 'something else', path: '/sp/9.0.0/skills/executing-plans/SKILL.md' })
  expect(text).toContain('superpowers-github blocked superpowers:executing-plans: superpowers 9.0.0')
})
test('other skills pass through untouched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  expect((await $.skill.prompt({ skill: 'superpowers:test-driven-development', text: 'as is' })).text).toBe('as is')
})
