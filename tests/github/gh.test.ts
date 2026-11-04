import { expect, test } from 'claude-code/testing'
import { parseIssue } from '../../hooks/github/gh'
import { boot, callTool, url } from '../kit'

test('parseIssue reads a URL, a URL with a fragment and owner/repo#n alike', () => {
  const want = { owner: 'trackness', name: 'demo', repo: 'trackness/demo', number: 12, url: 'https://github.com/trackness/demo/issues/12' }
  expect(parseIssue('https://github.com/trackness/demo/issues/12')).toEqual(want)
  expect(parseIssue('https://github.com/trackness/demo/issues/12#issuecomment-99')).toEqual(want)
  expect(parseIssue('trackness/demo#12')).toEqual(want)
})

test('parseIssue allows a trailing slash', () => {
  expect(parseIssue('https://github.com/trackness/demo/issues/12/').url).toBe('https://github.com/trackness/demo/issues/12')
})

test('parseIssue refuses a bare number', () => {
  expect(() => parseIssue('12')).toThrow("issue's URL")
  expect(() => parseIssue('#12')).toThrow("issue's URL")
})

test('a failing command reaches the model as its own stderr', async ($, on) => {
  await boot($, on, { reply: () => ({ code: 128, stderr: 'fatal: not a git repository' }) })
  expect((await callTool($, 'run_folder', { parent: url(12) })).deny).toContain('fatal: not a git repository')
})
