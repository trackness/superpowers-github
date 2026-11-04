import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { TOOL_PREFIX } from '../hooks/config.ts'
import { attachTool } from '../hooks/tools/attach.ts'
import { boardSetupTool } from '../hooks/tools/board-setup.ts'
import { designWriteTool } from '../hooks/tools/design-write.ts'
import { ideaMoveTool } from '../hooks/tools/idea-move.ts'
import { issueCreateTool } from '../hooks/tools/issue-create.ts'
import { issueEditTool } from '../hooks/tools/issue-edit.ts'
import { prCheckTool } from '../hooks/tools/pr-check.ts'
import { reviewPackageTool } from '../hooks/tools/review-package.ts'
import { runFolderTool } from '../hooks/tools/run-folder.ts'
import { statusTool } from '../hooks/tools/status.ts'
import { workListTool } from '../hooks/tools/work-list.ts'
import { boot, callTool, router, url, type Verdict } from './kit.ts'

const RUN_FOLDER = `${TOOL_PREFIX}run_folder`
const git = router({ cli: s => (s.argv[1] === 'rev-parse' ? { stdout: '/work/repo\n' } : s.argv[0] === 'mkdir' ? {} : undefined) })

test('session start registers all eleven tools', async ($, on) => {
  const w = await boot($, on, { reply: git })
  const tools = [runFolderTool, reviewPackageTool, statusTool, workListTool, issueCreateTool, issueEditTool, attachTool, designWriteTool, boardSetupTool, ideaMoveTool, prCheckTool]
  expect(w.registered).toEqual(tools.map(t => t.spec.name))
})

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

// The ask goes to James as AskUserQuestion; this hook answers it as he would.
const answer = (on: On, label: string) => {
  const questions: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e: any) => {
    questions.push(e.questions[0].question)
    return { result: { questions: e.questions, answers: { [e.questions[0].question]: label } } }
  })
  return questions
}
// An ask a settings rule decided: the one ask the mod's vouch leaves standing.
const ask = (): Verdict => ({ decision: 'ask', reason: 'Asked by a rule.', rule: RUN_FOLDER })

test('an ask that James allows runs the tool', async ($, on) => {
  const questions = answer(on, 'Yes')
  const w = await boot($, on, { reply: git, check: e => (e.tool === RUN_FOLDER ? ask() : { decision: 'allow' }) })
  expect((await callTool($, 'run_folder', { parent: url(12) })).text).toBe('/work/repo/.superpowers/sdd/12')
  expect(questions).toHaveLength(1)
  expect(questions[0]).toContain(RUN_FOLDER)
  expect(questions[0]).toContain(url(12))
  expect(w.spawned).not.toEqual([])
})

test('an ask that James refuses runs nothing', async ($, on) => {
  answer(on, 'No')
  const w = await boot($, on, { reply: git, check: e => (e.tool === RUN_FOLDER ? ask() : { decision: 'allow' }) })
  expect((await callTool($, 'run_folder', { parent: url(12) })).deny).toContain('did not allow')
  expect(w.spawned).toEqual([])
})

test('an ask that cannot be put to James runs nothing', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ deny: 'no one to ask' }))
  const w = await boot($, on, { reply: git, check: e => (e.tool === RUN_FOLDER ? ask() : { decision: 'allow' }) })
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

test('the vouch matches only the mod\'s own tool names', async ($, on) => {
  await boot($, on, { reply: git, check: ruleless })
  for (const tool of ['Bash', 'mcp__other__run_folder', `${TOOL_PREFIX}not_a_tool`]) expect(await $.tool.check({ tool, input: {} })).toEqual(ruleless())
})
