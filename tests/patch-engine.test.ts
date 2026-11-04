import { expect, test } from 'claude-code/testing'
import { PATCHED_FOR, TOOL_PREFIX } from '../hooks/config.ts'
import { brainstorming } from '../hooks/patches/brainstorming.ts'
import { applyPatches, blockText, type PatchSet } from '../hooks/patches/engine.ts'
import { executingPlans } from '../hooks/patches/executing-plans.ts'
import { finishing } from '../hooks/patches/finishing.ts'
import { subagentDrivenDevelopment } from '../hooks/patches/subagent-driven-development.ts'
import { writingPlans } from '../hooks/patches/writing-plans.ts'
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
test('an anchor whose first line changed still shows what is there now, from the line in its place', () => {
  const renamed = (s: string) => s.replace('## Step 4: Present Options', '## Step 4: Offer Options')
  const f = applyPatches(renamed(SKILLS['finishing-a-development-branch']), finishing).failures.find(f => f.id === 'f-options')!
  expect(f.nearby).toBe(renamed(f.expected))
})
test('the block text fences with four backticks, so an anchor\'s own fences stay inside', () => {
  const t = blockText({ skill: 'superpowers:demo', version: '7.1.0', failures: [{ id: 'f', expected: 'a\n```\nb\n```', count: 1, found: 0, nearby: 'c\n```\nd\n```', ifMissing: 'lost' }], partial: 'P' })
  for (const s of ['````\na\n```\nb\n```\n````', '````\nc\n```\nd\n```\n````']) expect(t).toContain(s)
})
test('the block text names the skill, the version, the patch, the remedy and the workaround', () => {
  const t = blockText({ skill: 'superpowers:demo', version: '7.1.0', root: '/sp/7.1.0', failures: applyPatches('x', SET).failures, partial: 'PARTIAL' })
  for (const s of ['superpowers:demo', '7.1.0', `written for (${PATCHED_FOR})`, 'one', 'alpha\nbeta', 'its first line does not appear', 'make-fixture.mjs /sp/7.1.0', 'set `PATCHED_FOR` in', 'claude plugin test', '/reload-plugins', 'one is lost', 'PARTIAL']) expect(t).toContain(s)
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
test('a skill whose anchors all match under another superpowers version runs patched, under one line naming both versions', async ($, on) => {
  const json = (v: string) => ({ [`/sp/${v}/.claude-plugin/plugin.json`]: JSON.stringify({ version: v }) })
  await boot($, on, { reply: router({}), files: { ...json(PATCHED_FOR), ...json('9.9.9') } })
  const prompt = async (v: string) => (await $.skill.prompt({ skill: 'superpowers:executing-plans', text: SKILLS['executing-plans'], path: `/sp/${v}/skills/executing-plans/SKILL.md` })).text
  expect(await prompt(PATCHED_FOR)).toBe(executingPlans.replaceWith)
  const text = await prompt('9.9.9')
  const [line] = text.split('\n')
  expect(text).toBe(`${line}\n\n${executingPlans.replaceWith}`)
  for (const s of [`superpowers ${PATCHED_FOR}`, 'superpowers 9.9.9']) expect(line).toContain(s)
})
test('a failure beneath the guard makes the skill a block, never the unpatched text', async $ => {
  // No boot, so no skill.prompt stand-in: the kit's bottom hook throws. (A stand-in that throws is skipped, as a live hook is.)
  const { text } = await $.skill.prompt({ skill: 'superpowers:executing-plans', text: SKILLS['executing-plans'] })
  for (const s of ['superpowers-github blocked superpowers:executing-plans', 'hook-error']) expect(text).toContain(s)
})
test('every tool the patched skills name is one the mod registers', async ($, on) => {
  const w = await boot($, on, { reply: router({}) })
  const patched = [applyPatches(SKILLS['brainstorming'], brainstorming), applyPatches(SKILLS['writing-plans'], writingPlans), applyPatches(SKILLS['subagent-driven-development'], subagentDrivenDevelopment), applyPatches(SKILLS['finishing-a-development-branch'], finishing)]
  const named = new Set(patched.flatMap(p => [...p.text.matchAll(new RegExp(`${TOOL_PREFIX}(\\w+)`, 'g'))].map(m => m[1])))
  expect(named.size).toBeGreaterThan(0)
  for (const name of named) expect(w.registered).toContain(name)
})
test('other skills pass through untouched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  expect((await $.skill.prompt({ skill: 'superpowers:test-driven-development', text: 'as is' })).text).toBe('as is')
})
