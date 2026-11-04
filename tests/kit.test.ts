import { expect, test } from 'claude-code/testing'
import { router } from './kit'

test('the fake GitHub refuses an operation name the query text does not declare, as GitHub does', () => {
  const reply = router({ graphql: { Work: () => ({ ok: true }) } })
  const ask = (query: string) => reply({ argv: ['gh', 'api', 'graphql', '--input', '-'], input: JSON.stringify({ query, variables: {}, operationName: 'Work' }) })
  expect(ask('query Wrok($n: Int!) { x }')).toEqual({ code: 1, stderr: 'No operation named "Work"' })
  expect(ask('query Workflows { x }')).toEqual({ code: 1, stderr: 'No operation named "Work"' })
  expect(ask('fragment F on Issue { n }\nquery Work($n: Int!) { x }')).toEqual({ stdout: '{"data":{"ok":true}}' })
})
