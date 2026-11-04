import type { On } from 'claude-code'
import { PATCHED_FOR, PLUGIN, REPO_DIR } from '../config.ts'

export type Patch = { id: string; find: string; replace: string; count?: number; ifMissing: string }
export type PatchSet = { skill: string; patches: Patch[]; replaceWith?: string }
export type Failure = { id: string; expected: string; count: number; found: number; nearby?: string; ifMissing: string }

const occurrences = (text: string, find: string) => text.split(find).length - 1

// The text where the find would be, as many lines as it has, placed by its first non-blank line that occurs (so a changed first line still shows the rest).
function nearbyLines(text: string, find: string): string | undefined {
  const lines = find.split('\n')
  const i = lines.findIndex(l => l.trim() !== '' && text.includes(l))
  if (i < 0) return undefined
  const row = text.slice(0, text.indexOf(lines[i]!)).split('\n').length - 1
  return text.split('\n').slice(Math.max(0, row - i), row - i + lines.length).join('\n')
}

export function applyPatches(text: string, set: PatchSet): { text: string; failures: Failure[] } {
  const failures: Failure[] = []
  for (const p of set.patches) {
    const count = p.count ?? 1
    const found = occurrences(text, p.find)
    if (found !== count) {
      failures.push({ id: p.id, expected: p.find, count, found, nearby: nearbyLines(text, p.find), ifMissing: p.ifMissing })
      continue
    }
    text = text.split(p.find).join(p.replace) // split/join: `replace` is literal, no `$&` expansion
  }
  return { text: failures.length === 0 && set.replaceWith !== undefined ? set.replaceWith : text, failures }
}

// Four backticks: some anchors hold three-backtick fences of their own, and none holds four.
const fence = (s: string) => '````\n' + s + '\n````'

export function blockText(a: { skill: string; version: string; root?: string; failures: Failure[]; partial: string }): string {
  const what = (f: Failure) =>
    f.found > 0 ? `it appears ${f.found} times`
    : f.nearby !== undefined ? fence(f.nearby)
    : 'its first line does not appear in the skill'
  return [
    `${PLUGIN} blocked ${a.skill}: superpowers ${a.version} no longer matches the text its patches were written for (${PATCHED_FOR}).`,
    'Stop. Do not follow this skill. Tell James:',
    ...a.failures.map(f => `${f.id}\nExpected (${f.count} time(s)):\n${fence(f.expected)}\nWhat is there now:\n${what(f)}`),
    `Remediation (offer to carry it out): run \`node ${REPO_DIR}/tests/fixtures/make-fixture.mjs ${a.root ?? '<root>'}\`, point the patch tests at the new fixture, set \`PATCHED_FOR\` in \`${REPO_DIR}/hooks/config.ts\` to the new version, update each failed patch until \`claude plugin test ${REPO_DIR}\` passes, then \`/reload-plugins\`.`,
    'Or work around it: follow the skill with only the patches that applied. What goes wrong:',
    ...a.failures.map(f => `- ${f.id}: ${f.ifMissing}`),
    'If James chooses the workaround, follow this text:',
    a.partial,
  ].join('\n\n')
}

export function registerPatches(on: On, sets: PatchSet[]): void {
  for (const set of sets) {
    on('skill.prompt', { skill: set.skill }, async ($, e, next) => {
      const root = e.path?.includes('/skills/') ? e.path.slice(0, e.path.indexOf('/skills/')) : undefined
      let version = 'unknown'
      if (root) {
        try { version = JSON.parse(await $.fs.read(`${root}/.claude-plugin/plugin.json`)).version ?? 'unknown' } catch { /* unreadable: unknown */ }
      }
      try {
        const { text } = await next(e)
        const r = applyPatches(text, set)
        if (r.failures.length) return { text: blockText({ skill: set.skill, version, root, failures: r.failures, partial: r.text }) }
        // Every anchor matched, so the anchors rule; but text outside them may have changed with the version.
        const note = version === 'unknown' || version === PATCHED_FOR ? ''
          : `${PLUGIN} note: these patches were written for superpowers ${PATCHED_FOR} and superpowers ${version} is installed. Every patch applied, but text outside them may have changed: if two instructions below contradict each other, ask James which to follow.\n\n`
        return { text: note + r.text }
      } catch (err) {
        // A failing skill.prompt hook would pass the unpatched text through, so answer with a block instead.
        const failure: Failure = { id: 'hook-error', expected: 'the patches apply', count: 1, found: 0, ifMissing: String(err) }
        return { text: blockText({ skill: set.skill, version, root, failures: [failure], partial: e.text }) }
      }
    })
  }
}
