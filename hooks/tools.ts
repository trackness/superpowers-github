import type { On, ToolSpec } from 'claude-code'
import { PLUGIN, TOOL_PREFIX } from './config.ts'
import { type Io, ToolError } from './gh.ts'

export type Tool = {
  spec: ToolSpec
  run: (io: Io, input: Record<string, unknown>, call: { tool_use_id: string }) => Promise<string>
}

export function str(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string') throw new ToolError(`${key} must be a string`)
  return value
}

export function optStr(input: Record<string, unknown>, key: string): string | undefined {
  return input[key] == null ? undefined : str(input, key)
}

export function nums(input: Record<string, unknown>, key: string): number[] {
  const value = input[key]
  if (value == null) return []
  if (!Array.isArray(value) || !value.every(n => Number.isInteger(n))) throw new ToolError(`${key} must be a list of whole numbers`)
  return value
}

export function bool(input: Record<string, unknown>, key: string): boolean {
  const value = input[key]
  if (value == null) return false
  if (typeof value !== 'boolean') throw new ToolError(`${key} must be true or false`)
  return value
}

export function registerTools(on: On, tools: Tool[]): void {
  on('session.start', async ($, e, next) => {
    for (const t of tools) await $.tool.register(t.spec)
    return next(e)
  })
  for (const t of tools) {
    const { name } = t.spec
    on('tool.call', { tool: `${TOOL_PREFIX}${name}` as const }, async ($, e) => {
      // Answering in place skips the engine's permission path, so ask for its verdict on this call first.
      const { tool, tool_use_id, agentId, requestMeta, ...input } = e
      try {
        const verdict = await $.tool.check({ tool, input })
        if (verdict.decision === 'deny') return { deny: verdict.reason ?? `${tool} is denied.` }
        if (verdict.decision === 'ask') {
          const question = `${verdict.reason ?? ''} Run ${tool} with ${JSON.stringify(input).slice(0, 500)}?`.trim()
          if ((await $.ui.ask(question, ['Yes', 'No'])) !== 'Yes') return { deny: `James did not allow ${tool}.` }
        }
      } catch (err) {
        return { deny: `${PLUGIN} ${name} did not run: its permission check failed: ${err instanceof Error ? err.message : String(err)}` }
      }
      const io: Io = {
        process: { spawn: request => $.process.spawn(request) },
        fs: {
          write: (path, text) => $.fs.write(path, text),
          exists: path => $.fs.exists(path),
          stat: (path, options) => $.fs.stat(path, options),
        },
      }
      try {
        return { result: await t.run(io, e, { tool_use_id }) }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { deny: err instanceof ToolError ? message : `${PLUGIN} ${name} failed: ${message}` }
      }
    })
  }
}
