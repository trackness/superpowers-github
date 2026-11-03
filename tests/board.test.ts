import { expect, test } from 'claude-code/testing'
import { assertWritable, deriveParentStatus } from '../hooks/board.ts'

test('deriveParentStatus follows the spec table', () => {
  expect(deriveParentStatus(['Todo', 'Todo'])).toBe('Todo')
  expect(deriveParentStatus(['In Progress', 'Todo'])).toBe('In Progress')
  expect(deriveParentStatus(['In Review', 'Todo'])).toBe('In Progress')
  expect(deriveParentStatus(['In Review', 'Done'])).toBe('In Review')
  expect(deriveParentStatus(['Done', 'Done'])).toBe('Done')
  expect(deriveParentStatus([undefined, 'In Review'])).toBe('In Progress')
})

test('assertWritable refuses only a public ideas repo', () => {
  expect(() => assertWritable({ repo: 'trackness/ideas', isPrivate: false })).toThrow('must stay private')
  expect(() => assertWritable({ repo: 'trackness/ideas', isPrivate: true })).not.toThrow()
  expect(() => assertWritable({ repo: 'trackness/demo', isPrivate: false })).not.toThrow()
})
