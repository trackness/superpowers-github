import { expect, test } from 'claude-code/testing'
import { workflowDiffs } from '../../hooks/github/setup'

test('workflowDiffs: must-be-on missing or off, must-be-off on; a must-be-off one deleted or disabled is fine', () => {
  const wf = (name: string, enabled: boolean) => ({ id: `wf-${name}`, name, enabled })
  expect(workflowDiffs([wf('Item closed', true), wf('Auto-close issue', true), wf('Pull request merged', false)])).toEqual([])
  expect(workflowDiffs([wf('Item closed', false), wf('Item added to project', true), wf('Pull request merged', false)])).toEqual([
    'Item closed: off, must be on',
    'Auto-close issue: missing, must be on',
    'Item added to project: on, must be off',
  ])
})
