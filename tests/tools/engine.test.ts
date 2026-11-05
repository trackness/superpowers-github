import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { TOOL_PREFIX } from '../../hooks/config'
import { bool, nums, optStr, str } from '../../hooks/tools/engine'
import { boot, callTool, router, url, type Verdict } from '../kit'

const RUN_FOLDER = `${TOOL_PREFIX}run_folder`
const git = router({ cli: s => (s.argv[1] === 'rev-parse' ? { stdout: '/work/repo\n' } : s.argv[0] === 'mkdir' ? {} : undefined) })

test('a tool asks the permission check with its own arguments, and a deny runs nothing', async ($, on) => {
  const asked: unknown[] = []
  const check = (e: { tool: string; input: unknown }): Verdict => {
    asked.push(e)
    return { decision: 'deny', reason: 'blocked by rule' }
  }
  const w = await boot($, on, { reply: git, check })
  expect(await callTool($, 'run_folder', { parent: url(12) })).toEqual({ deny: 'blocked by rule' })
  expect(asked).toEqual([{ tool: RUN_FOLDER, input: { parent: url(12) } }])
  expect(w.spawned).toEqual([])
})

// $.ui.ask reaches the user as an AskUserQuestion tool call.
const answer = (on: On, label: string) => {
  const questions: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e: any) => {
    questions.push(e.questions[0].question)
    return { result: { questions: e.questions, answers: { [e.questions[0].question]: label } } }
  })
  return questions
}
const ruleAsk = (): Verdict => ({ decision: 'ask', reason: 'Asked by a rule.', rule: RUN_FOLDER })

test('an ask that the user allows runs the tool', async ($, on) => {
  const questions = answer(on, 'Yes')
  const w = await boot($, on, { reply: git, check: e => (e.tool === RUN_FOLDER ? ruleAsk() : { decision: 'allow' }) })
  expect((await callTool($, 'run_folder', { parent: url(12) })).text).toBe('/work/repo/.superpowers/sdd/12')
  expect(questions).toHaveLength(1)
  expect(questions[0]).toContain(RUN_FOLDER)
  expect(questions[0]).toContain(url(12))
  expect(w.spawned).not.toEqual([])
})

test('an ask that the user refuses runs nothing', async ($, on) => {
  answer(on, 'No')
  const w = await boot($, on, { reply: git, check: e => (e.tool === RUN_FOLDER ? ruleAsk() : { decision: 'allow' }) })
  expect((await callTool($, 'run_folder', { parent: url(12) })).deny).toContain('did not allow')
  expect(w.spawned).toEqual([])
})

test('an ask that cannot be put to the user runs nothing', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ deny: 'no one to ask' }))
  const w = await boot($, on, { reply: git, check: e => (e.tool === RUN_FOLDER ? ruleAsk() : { decision: 'allow' }) })
  expect((await callTool($, 'run_folder', { parent: url(12) })).deny).toContain('no one to ask')
  expect(w.spawned).toEqual([])
})

// What the engine answers a tool with no settings rule: core's own ask, no `rule` behind it.
const ruleless = (): Verdict => ({ decision: 'ask', reason: 'Claude requested permissions to use it.' })

test('with no rule the mod vouches for each of its own tools, and a call runs without asking', async ($, on) => {
  const questions = answer(on, 'No')
  const w = await boot($, on, { reply: git, check: ruleless })
  expect(w.registered).toHaveLength(11)
  for (const name of w.registered) {
    expect(await $.tool.check({ tool: `${TOOL_PREFIX}${name}`, input: {} })).toEqual({ decision: 'allow', reason: 'superpowers-github vouches for its own tool' })
  }
  expect((await callTool($, 'run_folder', { parent: url(12) })).text).toBe('/work/repo/.superpowers/sdd/12')
  expect(questions).toEqual([])
})

test('an ask or deny a rule decided, and an ask under an org ceiling, stand as the engine gave them', async ($, on) => {
  const ruled: Record<string, Verdict> = {
    [RUN_FOLDER]: { decision: 'ask', reason: 'Asked by a rule.', rule: RUN_FOLDER },
    [`${TOOL_PREFIX}status`]: { decision: 'deny', reason: 'Denied by a rule.', rule: `${TOOL_PREFIX}status` },
  }
  await boot($, on, { reply: git, check: e => ruled[e.tool] ?? ruleless() })
  for (const [tool, verdict] of Object.entries(ruled)) expect(await $.tool.check({ tool, input: {} })).toEqual(verdict)
  expect(await $.tool.check({ tool: `${TOOL_PREFIX}work_list`, input: {}, ceiling: 'ask' })).toMatchObject({ decision: 'ask' })
})

// Core's plan-mode ask, as 2.1.318 words it (Ooe): ruleless, so only its reason sets it apart.
const planMode = (e: { tool: string }): Verdict => ({ decision: 'ask', reason: `Cannot call ${e.tool} while in plan mode.` })

test('in plan mode the vouch stands aside, so every call of the mod\'s tools is put to the user',async ($, on) => {
  const questions = answer(on, 'No')
  const w = await boot($, on, { reply: git, check: e => (e.tool.startsWith(TOOL_PREFIX) ? planMode(e) : { decision: 'allow' }) })
  for (const name of w.registered) expect(await $.tool.check({ tool: `${TOOL_PREFIX}${name}`, input: {} })).toEqual(planMode({ tool: `${TOOL_PREFIX}${name}` }))
  expect((await callTool($, 'idea_move', { issue: url(12) })).deny).toBe(`Your human partner did not allow ${TOOL_PREFIX}idea_move.`)
  expect(questions).toHaveLength(1)
  expect(questions[0]).toContain('while in plan mode')
  expect(w.spawned).toEqual([])
})

test('an ask another mod\'s hook made stands', async ($, on) => {
  const guard = (): Verdict => ({ decision: 'ask', reason: 'The guard mod asks.', plugin: 'guard' })
  await boot($, on, { reply: git, check: guard })
  expect(await $.tool.check({ tool: RUN_FOLDER, input: {} })).toMatchObject({ decision: 'ask', reason: 'The guard mod asks.' })
})

test('the vouch matches only the mod\'s own tool names', async ($, on) => {
  await boot($, on, { reply: git, check: ruleless })
  for (const tool of ['Bash', 'mcp__other__run_folder', `${TOOL_PREFIX}not_a_tool`]) expect(await $.tool.check({ tool, input: {} })).toEqual(ruleless())
})

test('the input readers name the key on a wrong type', () => {
  expect(str({ parent: 'x' }, 'parent')).toBe('x')
  expect(() => str({}, 'parent')).toThrow('parent')
  expect(optStr({}, 'repo')).toBeUndefined()
  expect(() => optStr({ repo: 5 }, 'repo')).toThrow('repo')
  expect(nums({}, 'blockedBy')).toEqual([])
  expect(nums({ blockedBy: [3, 4] }, 'blockedBy')).toEqual([3, 4])
  expect(() => nums({ blockedBy: [3, '4'] }, 'blockedBy')).toThrow('blockedBy')
  expect(bool({}, 'repair')).toBe(false)
  expect(bool({ repair: true }, 'repair')).toBe(true)
  expect(() => bool({ repair: 'yes' }, 'repair')).toThrow('repair')
})
