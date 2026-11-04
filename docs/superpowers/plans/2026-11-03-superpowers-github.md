# superpowers-github Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code mod that rewrites five superpowers 7.0.0 skills as they load and serves eleven `gh`-backed tools, so the idea, design, plan and tasks of every piece of work live in GitHub issues on a per-repo board that moves as the work moves.

**Architecture:** One plugin folder that is also its own one-plugin marketplace. `hooks/register.ts` registers a `skill.prompt` hook per patched skill (exact-text patches behind an upgrade guard that blocks the whole skill when any anchor is missing) and eleven MCP tools served by `tool.call` hooks. Every tool runs `gh`, `git` or `zip` through `$.process.spawn`, GraphQL as a JSON body to `gh api graphql --input -`; tests run under `claude plugin test` with those commands faked by a `process.spawn` stand-in and the real superpowers 7.0.0 text supplied by a generated fixture.

**Tech Stack:** Claude Code 2.1.317 mod API (TypeScript hooks module; types from `claude-code`, test kit from `claude-code/testing`), gh 2.102.0, gh-image `v1.4.1`, git, `/usr/bin/zip`, node 26 (fixture generator only).

**Spec:** `docs/superpowers/specs/2026-11-03-superpowers-github-design.md`

## Global Constraints

- `<repo>` means `/Users/james/workspace/claude-code/plugins/superpowers-github`. Run every command as its own tool call: no `;`, `&&`, `||`, pipes, substitutions or `cd` chains (James's CLAUDE.md). A commit step is two commands: `git -C <repo> add <files>`, then `git -C <repo> commit -m "<message>"`.
- Commit messages follow Conventional Commits, with the attribution trailers the executing session's harness specifies. Part 1 runs on branch `feature/superpowers-github-mod`.
- Markdown files: one line per paragraph, list item or table row; never hard-wrap.
- Plugin name `superpowers-github`; its tools are `mcp__superpowers-github__<name>`, and patched skill text names each tool by that full name. `hooks/hooks.json` is `{ "modules": ["./register.ts"] }`.
- Matchers, exactly: `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:subagent-driven-development`, `superpowers:executing-plans`, `superpowers:finishing-a-development-branch`. Every other superpowers skill is untouched; superpowers' files on disk are never edited.
- Every patch replaces exact superpowers 7.0.0 text. A missing anchor blocks the whole skill; a skill never runs half-patched silently.
- Status options, exactly and in this order: Idea, Designed, Todo, In Progress, In Review, Done.
- Only GitHub's "Item closed" workflow moves an issue to Done. The mod never sets Done.
- Issue bodies are at most 65,536 characters, counted as Unicode code points (`[...body].length`) and checked before every write. Nothing is split or truncated. This is GitHub's limit on creating an issue, checked 2026-11-03 on `trackness/kidcough`: 65,536 was accepted; 65,537 was refused with `Body is too long (maximum is 65536 characters)`; 32,769 emoji (65,538 UTF-16 units) were accepted. Edits allow up to 262,144 UTF-8 bytes, but `idea_move` re-creates issues, so every body keeps to the create limit. 65,536 code points can never exceed 262,144 bytes.
- No idea, design, plan or task text is written locally, except `idea.md` built under `/tmp/superpowers-github/` for upload. The run folder is `<repo root>/.superpowers/sdd/<parent issue number>/`, ignored by `.superpowers/sdd/.gitignore` containing `*\n`, which is created only when absent.
- Nothing that happens during a run is posted to GitHub, and never as a comment.
- Every attachment goes through gh-image (`drogers0/gh-image`, pinned `v1.4.1`): upload `gh image <file> --repo <owner>/<repo>` and nothing else; download `gh image download --output <file> <url>`. Before any use, `gh extension list` must show `drogers0/gh-image` at `v1.4.1`; otherwise stop and give James `gh extension install drogers0/gh-image --pin v1.4.1`. A non-zero exit, or output without a reference, stops the tool with gh-image's own output and the file. Nothing is retried.
- The ideas repo is `trackness/ideas` and must stay private: the mod refuses to write to it while it is public, and refuses to create it public.
- A repo's board is the board linked to the repo whose title equals the repo's name exactly. Other linked boards are ignored.
- Boards are created and linked with the repo owner's login (`--owner trackness`). `gh project link` refuses `--owner @me` for a repo (`'trackness/kidcough' has different owner from '@me'`, checked 2026-11-03).
- Required workflows on every board: "Item closed" (Status = Done) and "Auto-close issue" stay on, as a fresh board has them. "Item added to project", "Pull request linked to issue", "Pull request merged" and "Auto-add sub-issues to project" are deleted with `deleteProjectV2Workflow`: the API can't switch a workflow off, and a deleted one can't fire.
- Status options are set with `updateProjectV2Field`, passing the existing option IDs for Todo, In Progress and Done. Replaced without those IDs, "Item closed" has no Done to set: a closed issue got no Status at all (checked 2026-11-03).
- Repo merge settings: `gh repo edit <owner>/<repo> --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge --squash-merge-commit-message pr-title`.
- Writes use `gh` commands by name and number, never stored IDs; wide reads use GraphQL. The mod has no shell scripts and no `jq`.
- A plan edit is announced in the session at once as `Edited <issue link>: <what changed> — <why>` and ledgered as `Plan change: <issue URL> — <what changed> — <why>`. The PR section heading is `## Plan changes made during the run`.

## Review Focus

1. A write sequence that fails half-way (the issue is created, then the board step fails): the tool reports the created issue's URL and the step that failed, and creates nothing twice. Test: Task 5.
2. An issue given as `owner/repo#12`, or as a URL with a `#issuecomment-…` fragment, or as a bare `12`: the first two resolve to the same issue; the bare number is refused with a message asking for the URL. Test: Task 2.
3. A body edit that drops an existing `https://github.com/user-attachments/…` reference: refused, naming each dropped reference, because an unreferenced upload is unreachable for anyone else. Test: Task 5.
4. A board with more than 100 items, or several boards linked to one repo with near-identical titles: every page is read, and the board is the one titled exactly the repo's name. Test: Task 4.
5. `gh` failing (signed out, missing `project` scope, no network): the tool returns `gh`'s own stderr as an error and never reports success. Test: Task 2.

## Calls this plan makes where the spec leaves a choice

- **No template board, by James's decision on 2026-11-03.** The spec was updated to match the same day. This was checked end to end on throwaway boards, since deleted. A board built through the API has the six Status options (keeping the IDs of Todo, In Progress and Done), the four must-be-off workflows deleted, and a board-layout view. On it, "Item closed" moved a closed issue to Done, and "Auto-close issue" closed an issue whose Status was set to Done. A copied board, by contrast, turned off the workflows it kept. The cost: a view or field wanted on every board goes into the mod's code, not a hand-edited template.
- Eleven tools: the spec's seven, less template setup, plus five. The extra five are `work_list` (the linked lists of Idea and Designed issues), `issue_create` and `issue_edit` (the mod has to be in the path to refuse an oversized body), `design_write` (the idea → design swap with `idea.md`), and `pr_check` (the PR gate and the `closingIssuesReferences` check). `status` called without a `status` reads the work.
- Downloads use `gh image download --output`, not `gh api`. The mod API returns a child's output as decoded text, and `$.fs.write` writes only text, so a zip or image fetched through `gh api` stdout would be corrupted. On 2026-11-03 this route fetched the spec's three kidcough uploads intact: the zip passes `unzip -t`, and the PNG and `.md` are whole. Task 15 proves it again after the pinned reinstall.
- `claude plugin test` can't read the disk or import non-code files (checked 2026-11-03). So the real 7.0.0 text reaches the tests as `tests/fixtures/superpowers-7.0.0.ts`, generated verbatim from the installed skills, with superpowers' MIT notice beside it. Only tests import it.
- Brainstorming asks "which piece of work" right after its quick-task check, so a quick task never touches GitHub. A new piece of work is created once its size is known: a small change goes into Designed once approved; a project goes into Idea with the discussion so far. If James says to turn the discussion into a piece of work, it is created at once.
- Attachments live in a `## Attachments` list in the body. `attach` and `design_write` keep that list, and `issue_edit` refuses to drop any reference in it.
- `idea_move` to a public repo refuses an idea that has sub-issues or dependency links, because those can't be recreated faithfully. Copied comments are posted verbatim.
- The Status option colours and descriptions (Task 7), the executing-plans replacement (Task 3), and every patch's "if missing" estimate (Tasks 3, 10–13).

## Files

| Path | Responsibility |
|---|---|
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `README.md`, `.gitignore` | Manifest, one-plugin marketplace, module entry, install notes |
| `hooks/register.ts` | Registers the patch hooks and the tools, nothing else |
| `hooks/config.ts` | The constants in Global Constraints |
| `hooks/gh.ts` | Running commands, GraphQL, `ToolError`, `parseIssue` |
| `hooks/tools.ts` | The `Tool` type, input readers, `registerTools` |
| `hooks/body.ts` | Body limit and attachment URLs |
| `hooks/board.ts` | Board lookup, reading a piece of work, Status writes, parent derivation |
| `hooks/image.ts` | gh-image pin check, upload, download, references, the Attachments list |
| `hooks/setup.ts` | Building a board: Status options, workflow deletion and checks, the board view |
| `hooks/tools/*.ts` | One file per tool |
| `hooks/patches/engine.ts` | `applyPatches`, `blockText`, `registerPatches` |
| `hooks/patches/<skill>.ts` | One `PatchSet` per patched skill |
| `tests/kit.ts` | Test world: faked commands and fs, GraphQL routing, data builders |
| `tests/fixtures/` | The generator, the generated 7.0.0 fixture, superpowers' LICENSE |

---

## Part 1: the mod (Tasks 1–13, on `feature/superpowers-github-mod`)

### Task 1: Repository, manifests and the 7.0.0 fixture

**Files:**
- Create: `.gitignore`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `hooks/register.ts`, `README.md`, `tests/fixtures/make-fixture.mjs`, `tests/fixtures/LICENSE-superpowers`, `tests/fixtures/superpowers-7.0.0.ts` (generated)
- Test: `tests/fixture.test.ts`

**Interfaces:**
- Produces: `tests/fixtures/superpowers-7.0.0.ts` exports `VERSION: string` and `SKILLS: Record<'brainstorming' | 'writing-plans' | 'subagent-driven-development' | 'executing-plans' | 'finishing-a-development-branch', string>`, each the whole `SKILL.md` verbatim. `node tests/fixtures/make-fixture.mjs <superpowers plugin root>` writes `tests/fixtures/superpowers-<version>.ts` beside itself, reading the version from `<root>/.claude-plugin/plugin.json`.

- [ ] **Step 1: Start the repository.** Write `.gitignore` with `.idea/` and `.superpowers/`. Run `git -C <repo> init -b main`, `git -C <repo> add .gitignore docs`, `git -C <repo> commit -m "docs: add the superpowers-github design and plan"`, `git -C <repo> switch -c feature/superpowers-github-mod`. Expected: `git -C <repo> log --oneline` shows one commit, and `git -C <repo> config user.email` prints the `trackness` noreply address.

- [ ] **Step 2: Write the manifests.** `plugin.json`: `{ "name": "superpowers-github", "version": "0.1.0", "description": "Keeps superpowers' ideas, designs, plans and tasks in GitHub issues on a per-repo board.", "author": { "name": "trackness" } }`. `marketplace.json`: `{ "name": "superpowers-github", "owner": { "name": "trackness" }, "plugins": [{ "name": "superpowers-github", "source": "./" }] }`. `hooks/hooks.json` as in Global Constraints. `hooks/register.ts`: `export const register: Register = () => {}` (type from `claude-code`). `README.md` (at least 40 words): what the mod does; requirements (gh 2.102.0 or later with the `project` scope, gh-image pinned to v1.4.1); local install (`claude plugin marketplace add <repo>`, then `claude plugin install superpowers-github@superpowers-github`, then `/reload-plugins` after edits); what to do when the upgrade guard blocks a skill; superpowers' text under `tests/fixtures/` is MIT, © Jesse Vincent.

- [ ] **Step 3: Write the failing test** `tests/fixture.test.ts`:

```ts
import { expect, test } from 'claude-code/testing'
import { SKILLS, VERSION } from './fixtures/superpowers-7.0.0.ts'

test('the fixture holds the five patched superpowers 7.0.0 skills verbatim', () => {
  expect(VERSION).toBe('7.0.0')
  expect(Object.keys(SKILLS).sort()).toEqual(['brainstorming', 'executing-plans', 'finishing-a-development-branch', 'subagent-driven-development', 'writing-plans'])
  expect(SKILLS['brainstorming'].startsWith('---\nname: brainstorming\n')).toBe(true)
  expect(SKILLS['subagent-driven-development']).toContain('`bash scripts/task-brief PLAN_FILE N`')
  expect(SKILLS['writing-plans']).toContain('Use superpowers:executing-plans')
})
```

- [ ] **Step 4: Run it.** Run: `claude plugin test <repo>`. Expected: FAIL, `cannot import "./fixtures/superpowers-7.0.0.ts"`.

- [ ] **Step 5: Write `tests/fixtures/make-fixture.mjs`.** `node:fs` only. It reads the five `skills/<name>/SKILL.md` files, then writes a header comment (`// Generated by make-fixture.mjs from superpowers <version> (MIT, see LICENSE-superpowers). Do not edit.`), `export const VERSION = '<version>'`, and `export const SKILLS = <JSON.stringify(skills, null, 2)> as const`. Run `node <repo>/tests/fixtures/make-fixture.mjs /Users/james/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0`, then `cp /Users/james/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/LICENSE <repo>/tests/fixtures/LICENSE-superpowers`.

- [ ] **Step 6: Run the checks.** `claude plugin test <repo>` → `1 pass`, `0 fail`. `claude plugin validate <repo>` → `✔ Validation passed`. The README, LICENSE and icon notes are plugin-directory checks and don't fail validation.

- [ ] **Step 7: Commit:** `feat: scaffold the superpowers-github mod and the 7.0.0 fixture`.

### Task 2: The command runner, the tool framework, `run_folder` and `review_package`

**Files:**
- Create: `hooks/config.ts`, `hooks/gh.ts`, `hooks/tools.ts`, `hooks/tools/run-folder.ts`, `hooks/tools/review-package.ts`, `tests/kit.ts`
- Modify: `hooks/register.ts`
- Test: `tests/gh.test.ts`, `tests/run-folder.test.ts`

**Interfaces:**
- Produces `hooks/config.ts`: `PLUGIN = 'superpowers-github'`, `TOOL_PREFIX = 'mcp__superpowers-github__'`, `IDEAS_REPO = 'trackness/ideas'`, `BODY_LIMIT = 65_536`, `GH_IMAGE = { repo: 'drogers0/gh-image', version: 'v1.4.1' }`, `TMP_ROOT = '/tmp/superpowers-github'`, `STATUSES` (the six, in order, `as const`), `type Status`, and `WORKFLOWS: Record<string, boolean>` (workflow name → whether it must be on, per Global Constraints).
- Produces `hooks/gh.ts`:
  - `class ToolError extends Error`.
  - `type Ran = { code: number; stdout: string; stderr: string }`.
  - `run($: EngineInterface, argv: string[], opts?: { cwd?: string; input?: string }): Promise<Ran>` collects the chunks of `$.process.spawn({ argv, cwd, input })`; the exit comes from `await stream.result`, and a signal reads as code 1.
  - `gh($, args: string[], opts?): Promise<string>` and `git($, args, opts?): Promise<string>` return stdout. A non-zero exit throws a `ToolError` whose message is `` `<argv joined by spaces>` failed (exit <code>): <stderr, else stdout> ``.
  - `graphql<T>($, operationName: string, query: string, variables?: Record<string, unknown>): Promise<T>` runs `gh api graphql --input -` with `JSON.stringify({ query, variables, operationName })` on stdin, and returns `data`. A response carrying `errors`, or a non-zero exit, throws a `ToolError` with the messages.
  - `type IssueRef = { owner: string; name: string; repo: string; number: number; url: string }`, where `repo` is `owner/name` and `url` is canonical.
  - `parseIssue(ref: string): IssueRef` accepts `https://github.com/<o>/<n>/issues/<k>` (a `#…` fragment or a trailing slash is allowed) and `<o>/<n>#<k>`. Anything else throws a `ToolError` containing `issue's URL`.
- Produces `hooks/tools.ts`:
  - `type Tool = { spec: ToolSpec; run: ($: EngineInterface, input: Record<string, unknown>, call: { tool_use_id: string }) => Promise<string> }`.
  - `str(input, key): string`, `optStr(input, key): string | undefined` and `nums(input, key): number[]` (a missing key gives `[]`). Each throws a `ToolError` naming the key on a wrong type.
  - `registerTools(on: On, tools: Tool[]): void` adds a `session.start` hook that awaits `$.tool.register(t.spec)` for each tool, then returns `next(e)`. Each tool also gets a `tool.call` hook on `{ tool: TOOL_PREFIX + name }`, which answers `{ result: text }`, or `{ deny: message }` for a `ToolError`, or `` { deny: `superpowers-github ${name} failed: ${message}` } `` for any other error.
- Produces `runFolder($, parentUrl: string): Promise<string>` and `runFolderTool` (`run_folder`, input `{ parent }`) in `hooks/tools/run-folder.ts`; `reviewPackageTool` (`review_package`, input `{ parent, base, head }`) in `hooks/tools/review-package.ts`.
- Produces `tests/kit.ts`:
  - `DEMO = 'trackness/demo'`, and `url(n: number, repo = DEMO)` → `https://github.com/<repo>/issues/<n>`.
  - `type Spawned = { argv: string[]; cwd?: string; input?: string }` and `type Reply = { stdout?: string; stderr?: string; code?: number }`.
  - `boot($, on, o: { reply: (s: Spawned) => Reply; files?: Record<string, string>; dirs?: string[]; cwd?: string }): Promise<{ spawned: Spawned[]; written: Record<string, string> }>`. Before its first call on `$`, it registers stand-ins for:
    - `tool.register` → `{ value: { tool: TOOL_PREFIX + name } }`;
    - `session.start` → `{ cwd }`, default `/work/repo`;
    - `skill.prompt` → passes `{ text: e.text }` through;
    - `process.spawn` → records the call, yields the reply's stdout and stderr, and returns `{ value: { code, signal: null } }`;
    - `fs.read` → from `files`, else `{ deny: 'ENOENT: <path>' }`;
    - `fs.write` → recorded into `written`;
    - `fs.exists` → `files`, `written` or `dirs`;
    - `fs.stat` → `kind: 'directory'` for `dirs`, `'file'` for `files`, else a deny.

    Then it starts the session.
  - `callTool($, name, input): Promise<{ text?: string; deny?: string }>` maps `{ result }` to `text`, and `deny`, or `isError` with its `text`, to `deny`.
  - `argvs(w): string[]` gives each spawned argv joined by spaces.
  - `router(r: { graphql?: Record<string, (variables: any) => unknown>; cli?: (s: Spawned) => Reply | undefined }): (s: Spawned) => Reply`. A `gh api graphql` call is routed by its stdin's `operationName` and answered `{ stdout: JSON.stringify({ data }) }`. Anything unrouted answers `{ code: 1, stderr: 'unrouted: <argv>' }`. The returned function also carries `seen: Record<string, any[]>`, which holds each GraphQL call's variables under its `operationName`, in call order; tests read it as `seen`.

Test-kit facts checked 2026-11-03 against 2.1.317: a test's `$` has no `fs` or `process`; a stand-in for a call on `$` answers `{ value }`; a `process.spawn` stand-in is an async generator, and the caller reads the exit from `await stream.result`; a tool call's `e` holds `tool`, `tool_use_id` and the input fields at top level; test files import only relative code files and `claude-code/testing`.

- [ ] **Step 1: Write the failing tests.**

```ts
// tests/gh.test.ts
test('parseIssue reads a URL, a URL with a fragment and owner/repo#n alike', () => {
  const want = { owner: 'trackness', name: 'demo', repo: 'trackness/demo', number: 12, url: 'https://github.com/trackness/demo/issues/12' }
  expect(parseIssue('https://github.com/trackness/demo/issues/12')).toEqual(want)
  expect(parseIssue('https://github.com/trackness/demo/issues/12#issuecomment-99')).toEqual(want)
  expect(parseIssue('trackness/demo#12')).toEqual(want)
})
test('parseIssue refuses a bare number', () => {
  expect(() => parseIssue('12')).toThrow("issue's URL")
  expect(() => parseIssue('#12')).toThrow("issue's URL")
})
test('a failing command reaches the model as its own stderr', async ($, on) => {
  await boot($, on, { reply: () => ({ code: 128, stderr: 'fatal: not a git repository' }) })
  expect((await callTool($, 'run_folder', { parent: url(12) })).deny).toContain('fatal: not a git repository')
})
```

```ts
// tests/run-folder.test.ts — git answers `rev-parse --show-toplevel` with '/work/repo\n'
test('run_folder creates the self-ignoring run folder keyed by the parent number', async ($, on) => {
  const w = await boot($, on, { reply: router({ cli: s => s.argv[1] === 'rev-parse' ? { stdout: '/work/repo\n' } : s.argv[0] === 'mkdir' ? {} : undefined }) })
  const r = await callTool($, 'run_folder', { parent: url(12) })
  expect(r.text).toBe('/work/repo/.superpowers/sdd/12')
  expect(argvs(w)).toContain('mkdir -p /work/repo/.superpowers/sdd/12')
  expect(w.written['/work/repo/.superpowers/sdd/.gitignore']).toBe('*\n')
})
test('run_folder leaves an existing .gitignore alone', …)            // files: { '/work/repo/.superpowers/sdd/.gitignore': 'custom\n' } → written has no .gitignore
test('review_package writes the commit list, stat and diff for the range', …)
// input { parent: url(12), base: 'abc', head: 'HEAD' }; git answers: rev-parse --show-toplevel → '/work/repo\n';
// rev-parse --verify --quiet abc^{commit} → 'a'×40, HEAD^{commit} → 'b'×40; merge-base --is-ancestor → code 0;
// rev-list --count → '1\n'; log --oneline → 'bbbbbbb feat: x\n'; diff --stat → ' x.ts | 1 +\n'; diff -U10 → 'diff --git a/x.ts b/x.ts\n'
//   expect(w.written['/work/repo/.superpowers/sdd/12/review-aaaaaaa..bbbbbbb.diff']).toBe('# Review package: abc..HEAD\n\n## Commits\nbbbbbbb feat: x\n\n## Files changed\n x.ts | 1 +\n\n## Diff\ndiff --git a/x.ts b/x.ts\n')
//   expect(r.text).toMatch(/^wrote \/work\/repo\/\.superpowers\/sdd\/12\/review-aaaaaaa\.\.bbbbbbb\.diff: 1 commit\(s\), \d+ bytes$/)
test('review_package refuses a HEAD that does not descend from BASE', …)  // merge-base code 1 → deny 'HEAD is not a descendant of BASE: abc..HEAD'; no review file written
test('review_package refuses an empty range', …)                        // rev-list '0\n' → deny 'empty commit range: abc..HEAD'
```

- [ ] **Step 2: Run them.** `claude plugin test <repo>`. Expected: FAIL, `cannot import "../hooks/gh.ts"`.

- [ ] **Step 3: Implement** the Interfaces above.
  - `run_folder` runs `git rev-parse --show-toplevel` in the session cwd, then `mkdir -p <dir>`, and writes `.superpowers/sdd/.gitignore` only when `$.fs.exists` says it is absent. It writes no marker: a folder left by the same parent is a resume, which the ledger's first line already identifies.
  - `review_package` gets the run folder from `runFolder` and resolves each ref with `git rev-parse --verify --quiet <ref>^{commit}`; a failure refuses with `bad BASE: <base>` or `bad HEAD: <head>`. It checks `merge-base --is-ancestor`, then `rev-list --count`, then writes the file with `$.fs.write`; a write over 4 MiB is refused, and that error reaches the model.
  - The file name uses `sha.slice(0, 7)`, and the byte count is the UTF-8 length.
  - Wire both tools in `register.ts` with `registerTools(on, [runFolderTool, reviewPackageTool])`. Later tasks add to that list.

- [ ] **Step 4: Run the tests.** `claude plugin test <repo>`. Expected: all pass.

- [ ] **Step 5: Commit:** `feat: run gh and git from the mod; add run_folder and review_package`.

### Task 3: Patch engine, upgrade guard and the executing-plans replacement

**Files:**
- Create: `hooks/patches/engine.ts`, `hooks/patches/executing-plans.ts`
- Modify: `hooks/register.ts`
- Test: `tests/patch-engine.test.ts`

**Interfaces:**
- Consumes: `boot`, `router` (Task 2); `SKILLS` (Task 1).
- Produces:
  - `type Patch = { id: string; find: string; replace: string; count?: number; ifMissing: string }`, where `count` defaults to 1.
  - `type PatchSet = { skill: string; patches: Patch[]; replaceWith?: string }`.
  - `type Failure = { id: string; expected: string; count: number; found: number; nearby?: string; ifMissing: string }`.
- Produces `applyPatches(text: string, set: PatchSet): { text: string; failures: Failure[] }`:
  - Patches apply in order, each counted on the text the earlier ones left.
  - A `find` found other than `count` times is a failure and is skipped.
  - `nearby` is taken from where the find's first line first occurs: that many lines (as many as the find has). When the first line doesn't occur, `nearby` is undefined.
  - With `replaceWith`, the result is `replaceWith` once every anchor matched.
- Produces `blockText(a: { skill: string; version: string; root?: string; failures: Failure[]; partial: string }): string`.
- Produces `registerPatches(on: On, sets: PatchSet[]): void`, which adds one hook per set: `on('skill.prompt', { skill }, …)`.
  - The hook awaits `next(e)`, applies the set, and returns the patched `{ text }`.
  - On any failure it returns `{ text: blockText(…) }`. The version is read from `<root>/.claude-plugin/plugin.json`, where root is `e.path` cut before `/skills/`; it is `unknown` when unreadable.
  - Its `.catch` also answers with a block text. Without that, a failing `skill.prompt` hook passes the unpatched text through.
- Produces `executingPlans: PatchSet`: one patch, `e-anchor`, finding `# Executing Plans`, with `replaceWith` set to the exact copy below. Its `ifMissing`: `executing-plans runs as upstream wrote it if invoked: inline execution with plan files on disk, which this setup does not support.`

`blockText`, in this order:
- `superpowers-github blocked <skill>: superpowers <version> no longer matches the text its patches were written for (7.0.0).`
- `Stop. Do not follow this skill. Tell James:`
- For each failure: the patch id; `Expected (<count> time(s)):` and the text in a fence; then `What is there now:` followed by `nearby` in a fence, or `it appears <found> times`, or `its first line does not appear in the skill`.
- `Remediation (offer to carry it out):` run `node <repo>/tests/fixtures/make-fixture.mjs <root>`, point the patch tests at the new fixture, update each failed patch until `claude plugin test <repo>` passes, then `/reload-plugins`.
- `Or work around it: follow the skill with only the patches that applied. What goes wrong:` and each failure's `ifMissing`.
- `If James chooses the workaround, follow this text:` and the partially patched text.

`executingPlans.replaceWith`, exact copy:

```
# Executing Plans

Not used here: this setup always executes plans with superpowers:subagent-driven-development. Invoke that skill instead, with the plan's parent issue.
```

- [ ] **Step 1: Write the failing tests.**

```ts
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
```

- [ ] **Step 2: Run them.** Expected: FAIL, `cannot import "../hooks/patches/engine.ts"`.
- [ ] **Step 3: Implement**, and add `registerPatches(on, [executingPlans])` to `register.ts`. Later patch tasks append their sets.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat(patches): add the patch engine, the upgrade guard and the executing-plans replacement`.

### Task 4: Boards, reading a piece of work, `status` and `work_list`

**Files:**
- Create: `hooks/board.ts`, `hooks/tools/status.ts`, `hooks/tools/work-list.ts`
- Modify: `hooks/gh.ts`, `hooks/register.ts`, `tests/kit.ts`
- Test: `tests/board.test.ts`, `tests/status.test.ts`, `tests/work-list.test.ts`

**Interfaces:**
- Consumes: Task 2's `gh`, `graphql`, `parseIssue`, `ToolError`, `Tool`, readers, config.
- Produces in `hooks/gh.ts`: `graphqlPages<N>($, operationName, query, variables, pick: (data: any) => { nodes: N[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }): Promise<N[]>`. It passes `after: endCursor` until `hasNextPage` is false.
- Produces in `hooks/board.ts`:
  - `type Board = { owner: string; number: number; title: string; url: string }`.
  - `type RepoInfo = { repo: string; isPrivate: boolean; board?: Board }`.
  - `repoInfo($, repo: string): Promise<RepoInfo>` uses op `Repo` with vars `{ owner, name }`. `board` is the linked project whose title equals `name` exactly.
  - `requireBoard(info): Board` throws a `ToolError` reading `<repo> has no board. Ask James once whether to set one up, then call mcp__superpowers-github__board_setup.`
  - `assertWritable(info): void` throws a `ToolError` containing `must stay private` when `info.repo === IDEAS_REPO && !info.isPrivate`.
  - `type Item = { number: number; url: string; title: string; closed: boolean; onBoard: boolean; status?: Status; body: string; blockedBy: number[]; blocking: number[] }`.
  - `type Work = { repo: RepoInfo; board: Board; issue: Item; parent?: Item; tasks: Item[] }`. For a task, `tasks` is the parent's sub-issues with the issue among them; otherwise it is the issue's own sub-issues.
  - `readWork($, issueUrl: string): Promise<Work>` uses op `Repo`, then op `Work` with vars `{ owner, name, number }`. Each item's status is its `Status` value on `board`.
  - `deriveParentStatus(tasks: (Status | undefined)[]): Status`; an undefined status counts as Todo.
  - `setStatus($, board, issue: Item, status: Status): Promise<void>` refuses `Done`. When `!issue.onBoard` it first runs `gh project item-add <n> --owner <owner> --url <url>`, then `gh project item-edit <n> --owner <owner> --url <url> --field Status --value <status>`.
  - `recomputeParent($, work, moved?: { number: number; status: Status }): Promise<string | undefined>` applies `moved` to the tasks, adding it when it isn't among them yet, and derives the parent's column. It writes only when the result differs from the parent's status and isn't Done, and returns a line saying what it did.
  - `closedNotDone(work): string[]` gives one line per closed item not in Done: `#<n> is closed but not in Done on board "<title>" (<url>): "Item closed" isn't moving closed issues. Open the board's Workflows and turn on "Item closed" with Status = Done.`
  - `currentRepo($): Promise<string | undefined>` runs `gh repo view --json nameWithOwner --jq .nameWithOwner` in the session cwd; a non-zero exit gives undefined.
- Produces tools: `statusTool` (`status`, input `{ issue, status? }`) and `workListTool` (`work_list`, input `{ status: 'Idea' | 'Designed', repo? }`).
- Produces in `tests/kit.ts`:
  - `type ItemSpec = { number: number; status?: Status; closed?: boolean; title?: string; body?: string; onBoard?: boolean; blockedBy?: number[]; blocking?: number[] }`.
  - `repoData(o: { repo?: string; isPrivate?: boolean; boards?: string[] }): unknown`. Boards are numbered from 1 in order; the default is one board named after the repo. Every board's owner is `trackness`.
  - `workData(o: { issue: ItemSpec; parent?: ItemSpec; tasks?: ItemSpec[]; board?: number; repo?: string }): unknown`.
  - `itemsPage(items: ItemSpec[], endCursor?: string): unknown`, where `hasNextPage` is true when `endCursor` is given.
  - Item URLs are `url(number, repo)`, and titles default to `Task <n>: T<n>`.

`status` behaviour:

| Input | Effect |
|---|---|
| `{ issue }` | Reads the work and returns the parent and each task as `[#n title](url) — <Status>` lines, plus any `closedNotDone` lines |
| a task and a status | `setStatus` on the task, then `recomputeParent`; returns both lines plus `closedNotDone` |
| a parent with tasks and a status | Refused: `its column is derived from its tasks` |
| a parent without tasks and a status | `setStatus` directly (an idea, a small change) |
| any issue and `Done` | Refused: `only GitHub's "Item closed" workflow moves an issue to Done` |

`work_list` behaviour:
- The repo defaults to `currentRepo`, else `IDEAS_REPO`.
- It reads every board item with op `Items` (vars `{ number, after }`) through `graphqlPages`.
- It returns the open issues in that status as `- [#n title](url)` lines, or `No issues in <status> on <repo>'s board.`
- A repo without a board returns `<repo> has no board yet.`, which is not an error.

- [ ] **Step 1: Write the failing tests.** Each test boots with a `router` that answers `Repo` with `repoData(…)` and `Work` with `workData(…)`; `gh project` calls answer `{}`.

```ts
test('deriveParentStatus follows the spec table', () => {
  expect(deriveParentStatus(['Todo', 'Todo'])).toBe('Todo')
  expect(deriveParentStatus(['In Progress', 'Todo'])).toBe('In Progress')
  expect(deriveParentStatus(['In Review', 'Todo'])).toBe('In Progress')
  expect(deriveParentStatus(['In Review', 'Done'])).toBe('In Review')
  expect(deriveParentStatus(['Done', 'Done'])).toBe('Done')
  expect(deriveParentStatus([undefined, 'In Review'])).toBe('In Progress')
})
const edit = (n: number, s: string, board = 1) => `gh project item-edit ${board} --owner trackness --url ${url(n)} --field Status --value ${s}`
test('the board is the one titled exactly the repo name', …)        // boards ['demo-old', 'Demo', 'demo']; solo #10 Idea → status Designed → argvs contains edit(10, 'Designed', 3)
test('status moves a task and recomputes its parent', …)            // parent #10 Todo; tasks #11, #12 Todo → #11 In Progress → argvs contains edit(11, 'In Progress') and edit(10, 'In Progress')
test('status leaves the parent alone when its column does not change', …) // parent In Progress; #11 In Progress → In Review, #12 Todo → only edit(11, 'In Review')
test('status never writes Done', …)                                // deny contains '"Item closed"'; no item-edit spawned
test('status refuses a direct move of a parent that has tasks', …) // deny contains 'derived from its tasks'
test('status moves a parent with no tasks directly', …)            // solo #10 Designed → In Progress → edit(10, 'In Progress')
test('status adds an issue that is not on the board before setting it', …) // onBoard false → the item-add index is below the item-edit index
test('status flags a closed issue that is not in Done', …)         // #12 closed, In Review → text contains '#12 is closed but not in Done' and '"Item closed"'
test('status refuses a repo with no board', …)                    // boards [] → deny contains 'board_setup'
test('status with no status reports the work as links', …)         // text contains `[#11 Task 11: T11](${url(11)}) — Todo`
test('work_list lists open issues in the column across every page', …) // page 1 (endCursor 'c1'): #1 Idea, #2 Designed; page 2: #3 Idea, #4 Idea closed → text has #1 and #3, not #2 or #4; two Items calls
test('work_list falls back to the ideas repo outside a GitHub repo', …) // `gh repo view` code 1 → seen.Repo[0] equals { owner: 'trackness', name: 'ideas' }
```

- [ ] **Step 2: Run them.** Expected: FAIL, `cannot import "../hooks/board.ts"`.
- [ ] **Step 3: Implement**, and register `statusTool` and `workListTool`.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat(board): add status and work_list with derived parent columns`.

### Task 5: `issue_create` and `issue_edit`

**Files:**
- Create: `hooks/body.ts`, `hooks/tools/issue-create.ts`, `hooks/tools/issue-edit.ts`
- Modify: `hooks/register.ts`
- Test: `tests/issue-create.test.ts`, `tests/issue-edit.test.ts`

**Interfaces:**
- Consumes: `repoInfo`, `requireBoard`, `assertWritable`, `readWork`, `setStatus`, `recomputeParent` (Task 4); the kit's builders.
- Produces in `hooks/body.ts`:
  - `checkBody(body: string): void` counts code points (`[...body].length`) and throws `body is <n> characters; GitHub's limit is 65,536. Rewrite it to fit: nothing is split or truncated.`
  - `attachmentUrls(text: string): string[]` returns the distinct `https://github.com/user-attachments/(assets|files)/…` URLs, in order.
- Produces `issueCreateTool` (`issue_create`, input `{ title, body, repo?, parent?, blockedBy?, status? }`):
  - With `parent` it creates a task. The title must match `^Task \d+: `. It runs `gh issue create -R <repo> --parent <n> [--blocked-by <a,b>] --project <board title> --title <title> --body-file -` with the body on stdin; the URL is the last stdout line. Then it runs `setStatus` Todo and `recomputeParent`.
  - Without `parent`, `repo` is required and the status is `Idea` (the default) or `Designed`. It runs `gh issue create -R <repo> --project <board title> --title <title> --body-file -`, then `setStatus`.
  - Before any write it calls `checkBody`, `assertWritable` and `requireBoard`.
  - Any failure after the create throws `created <url>, then <step> failed: <message>. Not retried: fix that step; don't create the issue again.`
- Produces `issueEditTool` (`issue_edit`, input `{ issue, body?, title?, addBlockedBy?, removeBlockedBy? }`):
  - It needs at least one change, and calls `assertWritable` and, for a body, `checkBody`.
  - A new body that lacks any URL from `attachmentUrls(current body)` throws `the new body drops these attachments, which can't be re-referenced once dropped: <urls>. Keep them in the ## Attachments list.`
  - It runs `gh issue edit <url> [--title <t>] [--body-file -] [--add-blocked-by <a,b>] [--remove-blocked-by <c>]`, in that order.

- [ ] **Step 1: Write the failing tests.** The parent is #10 in Designed with no tasks; `gh issue create` answers `url(13) + '\n'`.

```ts
test('issue_create refuses a body over 65,536 characters before touching GitHub', …) // 'x'.repeat(65_537) → deny contains '65537' and '65,536'; no 'gh issue create' in argvs
test('issue_create takes a body of exactly 65,536 characters', …)                     // text contains url(13)
test('issue_create counts characters, not UTF-16 units', …)                          // '😀'.repeat(65_536) → created; '😀'.repeat(65_537) → deny contains '65537'
test('issue_create makes a task sub-issue with its blockers, on the board, in Todo', async ($, on) => {
  // … input { parent: url(10), title: 'Task 3: Store', body: 'TASK BODY', blockedBy: [11, 12] }
  expect(w.spawned.find(s => s.argv[2] === 'create')).toMatchObject({ argv: ['gh', 'issue', 'create', '-R', 'trackness/demo', '--parent', '10', '--blocked-by', '11,12', '--project', 'demo', '--title', 'Task 3: Store', '--body-file', '-'], input: 'TASK BODY' })
  expect(argvs(w)).toContain(`gh project item-edit 1 --owner trackness --url ${url(13)} --field Status --value Todo`)
  expect(argvs(w)).toContain(`gh project item-edit 1 --owner trackness --url ${url(10)} --field Status --value Todo`)
})
test('issue_create reports the created issue when a later step fails', …) // item-edit code 1, stderr 'HTTP 502' → deny contains url(13), 'item-edit', 'HTTP 502', 'Not retried'; exactly one create spawned
test('issue_create makes a parent in Idea on the repo board', …)          // { repo: DEMO, title: 'Idea', body: 'b' } → argv ['gh','issue','create','-R','trackness/demo','--project','demo','--title','Idea','--body-file','-'], then item-edit Idea
test('issue_create refuses to write to the ideas repo when it is public', …) // repoData({ repo: 'trackness/ideas', isPrivate: false }) → deny 'must stay private'; no create
test('issue_create refuses a repo with no board', …)                     // deny contains 'board_setup'
test('issue_edit refuses a body that drops an attachment', …)            // current body lists files/1/idea.md and files/2/z.zip; the new body keeps files/1 only → deny contains 'https://github.com/user-attachments/files/2/z.zip'; no 'gh issue edit'
test('issue_edit sets the body and the blocked-by links', …)             // argv ['gh','issue','edit',url(11),'--body-file','-','--add-blocked-by','4','--remove-blocked-by','5'], input = the new body
test('issue_edit refuses an oversized body', …)                          // deny contains '65,536'
```

- [ ] **Step 2: Run them.** Expected: FAIL, `cannot import "../hooks/body.ts"`.
- [ ] **Step 3: Implement**, and register both tools.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat(issues): add issue_create and issue_edit with the body limit and attachment guard`.

### Task 6: gh-image, `attach` and `design_write`

**Files:**
- Create: `hooks/image.ts`, `hooks/tools/attach.ts`, `hooks/tools/design-write.ts`
- Modify: `hooks/register.ts`
- Test: `tests/attach.test.ts`, `tests/design-write.test.ts`

**Interfaces:**
- Consumes: `readWork`, `setStatus`, `assertWritable` (Task 4); `checkBody` (Task 5).
- Produces in `hooks/image.ts`:
  - `type Ref = { markdown: string; name: string; url: string }`.
  - `parseRefs(text: string): Ref[]` finds each `[name](url)` and `![name](url)` whose URL starts with `https://github.com/user-attachments/`.
  - `checkGhImage($): Promise<void>` runs `gh extension list`. A line holding both `drogers0/gh-image` and `v1.4.1` passes; anything else throws a `ToolError` containing `gh extension install drogers0/gh-image --pin v1.4.1`.
  - `upload($, file: string, repo: string): Promise<Ref>` runs `checkGhImage`, then `gh image <file> --repo <repo>`, and returns the last ref printed. A non-zero exit, or no ref, throws a `ToolError` containing gh-image's stdout and stderr, the file, and (for the no-ref case) `no reference`.
  - `download($, ref: Ref, dir: string): Promise<string>` runs `gh image download --output <dir>/<basename of ref.name, else 'attachment'> <url>` and returns the path.
  - `withAttachment(body: string, ref: Ref): string` adds `- <ref.markdown>` as the last item of the `## Attachments` list, keeping any later `## ` section after it. When the list is absent it appends `\n\n## Attachments\n\n- <ref>\n`.
  - `splitAttachments(body: string): { text: string; refs: string[] }` gives the body without its Attachments section (end trimmed) and that section's list items.
- Produces `attachTool` (`attach`, input `{ issue, path, name? }`):
  - A directory (`$.fs.stat(path).kind === 'directory'`) is zipped first: `zip -r -q <TMP_ROOT>/<tool_use_id>/<name ?? basename(path) + '.zip'> .` with `cwd: path`. A file is uploaded as it is.
  - It then calls `upload`, then `checkBody(withAttachment(current, ref))`, then `gh issue edit <url> --body-file -`.
  - When the body check fails after the upload, the error carries the uploaded reference, so it is not lost.
- Produces `designWriteTool` (`design_write`, input `{ issue, design }`):
  - It calls `assertWritable`. The issue must be in Idea and have no tasks; otherwise `#<n> is in <status>, not Idea: revise a design with mcp__superpowers-github__issue_edit`.
  - The idea is `splitAttachments(body).text`.
  - Before any upload, `design` plus the kept Attachments list plus 200 characters must fit the limit.
  - When the idea isn't empty: `$.fs.write('<TMP_ROOT>/<tool_use_id>/idea.md', idea)`, then upload it.
  - The new body is `design` plus `\n\n## Attachments\n\n` with the kept refs and then the `idea.md` ref, one `- ` item per line. It is written with `gh issue edit <url> --body-file -`, then `setStatus` Designed.

- [ ] **Step 1: Write the failing tests.** `gh extension list` answers `gh image\tdrogers0/gh-image\tv1.4.1\n` unless a test says otherwise; the issue is `url(10)`.

```ts
test('attach refuses when gh-image is not the pinned version', …)   // 'v1.3.0' → deny contains 'gh extension install drogers0/gh-image --pin v1.4.1'; no 'gh image /' upload
test('attach uploads a file and lists it under Attachments', async ($, on) => {
  // body 'B'; `gh image` answers 'fast upload unavailable (HTTP 422); using browser session\n[idea.md](https://github.com/user-attachments/files/7/idea.md)\n'
  expect(w.spawned.find(s => s.argv[1] === 'image')!.argv).toEqual(['gh', 'image', '/tmp/x/idea.md', '--repo', 'trackness/demo'])
  expect(w.spawned.find(s => s.argv[2] === 'edit')!.input).toBe('B\n\n## Attachments\n\n- [idea.md](https://github.com/user-attachments/files/7/idea.md)\n')
})
test('attach adds to an existing list that a later section follows', …)
// body 'B\n\n## Attachments\n\n- [a](https://github.com/user-attachments/files/1/a)\n\n## Plan\n\nP'
// → edit input 'B\n\n## Attachments\n\n- [a](https://github.com/user-attachments/files/1/a)\n- [idea.md](https://github.com/user-attachments/files/7/idea.md)\n\n## Plan\n\nP'
test('attach zips a directory before uploading it', …)
// dirs ['/tmp/brainstorm-1/content'], name 'visual-companion.zip' → the zip spawn has argv ['zip','-r','-q', Z, '.'] and cwd '/tmp/brainstorm-1/content',
// with Z matching /^\/tmp\/superpowers-github\/[^/]+\/visual-companion\.zip$/; the upload's argv[2] === Z
test("attach stops with gh-image's own output when the upload fails", …) // code 1, stderr 'session token expired' → deny contains it and '/tmp/x/idea.md'; no 'gh issue edit'
test('attach stops when gh-image prints no reference', …)               // stdout 'ok\n' → deny contains 'no reference'
test('design_write keeps the idea as idea.md and puts the design in its place', …)
// issue #10 Idea, body 'my idea\n\n## Attachments\n\n- [visual-companion.zip](https://github.com/user-attachments/files/3/visual-companion.zip)\n';
// upload answers '[idea.md](https://github.com/user-attachments/files/8/idea.md)\n'
// → the one written path matches /^\/tmp\/superpowers-github\/[^/]+\/idea\.md$/, holding 'my idea';
//   edit input 'THE DESIGN\n\n## Attachments\n\n- [visual-companion.zip](https://github.com/user-attachments/files/3/visual-companion.zip)\n- [idea.md](https://github.com/user-attachments/files/8/idea.md)\n';
//   argvs contains the item-edit Designed for #10
test('design_write on an empty body writes the design without an idea.md', …) // no upload spawned; edit input 'THE DESIGN'
test('design_write refuses an issue that is not in Idea', …)                  // Designed → deny contains 'issue_edit'
test('design_write checks the size before uploading anything', …)            // design 'x'.repeat(65_400) → deny contains '65,536'; no upload; nothing written
```

- [ ] **Step 2: Run them.** Expected: FAIL, `cannot import "../hooks/image.ts"`.
- [ ] **Step 3: Implement**, and register both tools.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat(attach): upload through gh-image; add attach and design_write`.

### Task 7: `board_setup`

**Files:**
- Create: `hooks/setup.ts`, `hooks/tools/board-setup.ts`
- Modify: `hooks/register.ts`, `tests/kit.ts`
- Test: `tests/setup.test.ts`

Checked end to end on 2026-11-03 on throwaway boards, since deleted:
- A fresh board from `gh project create` has all six workflows on.
- `deleteProjectV2Workflow` removes a workflow, and it stays removed.
- With the Status options set and the IDs of Todo, In Progress and Done kept, "Item closed" moved a closed issue to Done, and "Auto-close issue" closed an issue whose Status was set to Done. Set without those IDs, a closed issue got no Status.
- `createProjectV2View` with `layout: BOARD_LAYOUT` works.
- `gh project link` needs the owner's login, and a linked board shows in `repository.projectsV2`.

**Interfaces:**
- Consumes: `repoInfo`, `assertWritable` (Task 4).
- Produces in `hooks/setup.ts`:
  - `statusField($, owner: string, number: number): Promise<{ projectId: string; fieldId: string; options: { id: string; name: string }[] }>` uses op `Fields`, vars `{ owner, number }`.
  - `setOptions($, field, drop: boolean): Promise<void>` uses op `SetOptions`, vars `{ fieldId, options }`. The options are the six `STATUSES` in order, each `{ name, ...OPTION_STYLE[name] }`, plus `id` wherever the field already has an option of that name. It refuses a field with no option named exactly Done, and, unless `drop`, one with options outside the six (audit-fix D-1, D-2).
  - `workflows($, owner, number): Promise<{ id: string; name: string; enabled: boolean }[]>` uses op `Workflows`.
  - `workflowDiffs(list): string[]` gives one line per difference:
    - a workflow that must be on and is missing → `<name>: missing, must be on`;
    - one that must be on and is disabled → `<name>: off, must be on`;
    - one that must be off and is present and enabled → `<name>: on, must be off`.

    A must-be-off workflow that is deleted or disabled is fine.
  - `deleteOffWorkflows($, list): Promise<void>` deletes each present workflow that `WORKFLOWS` says must be off, using op `DeleteWorkflow`, vars `{ workflowId }`.
  - `ensureBoardView($, owner, number, projectId): Promise<void>` uses op `Views`. When no view has `BOARD_LAYOUT`, it uses op `CreateView`, vars `{ projectId, name: 'Board', layout: 'BOARD_LAYOUT' }`.
  - `fixSteps(boardUrl: string): string`, exact copy below, for a must-be-on workflow that is missing or off: the one case the API can't fix.
  - `OPTION_STYLE: Record<Status, { color: string; description: string }>`:

    | Status | Colour | Description |
    |---|---|---|
    | Idea | GRAY | Its body is only the idea |
    | Designed | PURPLE | Designed; not yet planned |
    | Todo | BLUE | Planned; not started |
    | In Progress | YELLOW | With an implementer |
    | In Review | ORANGE | Approved by its reviewer; waiting for the merge |
    | Done | GREEN | Merged |
- Produces `boardSetupTool` (`board_setup`, input `{ repo, create?: 'private' | 'public', repair?: boolean }`). `<owner>` is the repo's owner. In order:
  1. `create: 'public'` for `IDEAS_REPO` is refused (`must stay private`) before anything runs.
  2. `create` runs `gh repo create <repo> --private|--public`.
  3. `repoInfo`, then `assertWritable`.
  4. **An existing board:** its Status options must be exactly the six, and `workflowDiffs` must be empty. With `repair`, the tool first runs `setOptions` and `deleteOffWorkflows`, then checks again. If everything matches, it returns `board "<title>" (<url>) is set up for <repo>`. Otherwise it refuses with the differences, adding `call board_setup again with repair: true` for wrong options or must-be-off workflows, and `fixSteps(url)` for a must-be-on workflow.
  5. **A new board:** run `gh project create --owner <owner> --title <name> --format json`. It prints the project object (`number`, `url`, `id`), and nothing at all without `--format json` (gh's source). Then run `setOptions`, `deleteOffWorkflows`, `ensureBoardView`, `gh project link <n> --owner <owner> --repo <repo>`, and the merge-settings command. Finally read back: the options must be exactly the six and `workflowDiffs` empty. Any difference is refused as in step 4, and calling again rechecks.
- Produces in `tests/kit.ts`:
  - `projectJson(number: number): Reply` answers with stdout `{"number":<n>,"id":"P<n>","url":"https://github.com/users/trackness/projects/<n>"}`.
  - `fieldsData(options: string[]): unknown` gives each option the id `id-<name>`, with fieldId `F1` and projectId `P1`.
  - `viewsData(layouts: string[]): unknown`.
  - `workflowsData(enabled: Record<string, boolean>): unknown` gives each workflow the id `wf-<name>`; a name left out is absent. Handlers answer the state left by earlier mutations in the same test.

`fixSteps(boardUrl)`, exact copy:

```
Open <boardUrl>. In the top-right, click the ⋯ menu, then Workflows. Under "Default workflows", click each workflow listed above, click Edit, set it (for "Item closed": Status = Done), then click "Save and turn on workflow". Then call this tool again: it reads the workflows back through the API.
```

- [ ] **Step 1: Write the failing tests.** `FRESH` is all six workflows on, as a fresh board has them; `KEPT` is only "Item closed" and "Auto-close issue", both on.

```ts
test('board_setup builds a fresh board: option IDs kept, four workflows deleted, a board view, linked', …)
// Repo boards []; create answers projectJson(7); Fields ['Todo','In Progress','Done']; Workflows FRESH; Views ['TABLE_LAYOUT']
//   expect(argvs(w)).toContain('gh project create --owner trackness --title demo --format json')
//   expect(seen.SetOptions[0].options.map((o: any) => [o.name, o.id])).toEqual([['Idea', undefined], ['Designed', undefined], ['Todo', 'id-Todo'], ['In Progress', 'id-In Progress'], ['In Review', undefined], ['Done', 'id-Done']])
//   expect(seen.DeleteWorkflow.map((v: any) => v.workflowId).sort()).toEqual(['wf-Auto-add sub-issues to project', 'wf-Item added to project', 'wf-Pull request linked to issue', 'wf-Pull request merged'])
//   expect(seen.CreateView[0]).toMatchObject({ layout: 'BOARD_LAYOUT' })
//   expect(argvs(w)).toContain('gh project link 7 --owner trackness --repo trackness/demo')
//   expect(argvs(w)).toContain('gh repo edit trackness/demo --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge --squash-merge-commit-message pr-title')
//   expect(r.text).toContain('is set up for trackness/demo')
test('board_setup refuses when a must-be-on workflow is missing', …)   // after the deletions, Workflows lack 'Item closed' → deny contains 'Item closed: missing, must be on' and 'Save and turn on workflow'
test('board_setup only checks a repo that already has its board', …)   // Repo boards ['demo'], six options, Workflows KEPT → no 'gh project create'; text contains 'is set up'
test('board_setup reports a board that differs, and repairs it on request', …)
// existing board with 'Pull request merged' on → deny contains 'Pull request merged: on, must be off' and 'repair: true';
// again with repair: true → seen.DeleteWorkflow contains { workflowId: 'wf-Pull request merged' }, then text contains 'is set up'
test('board_setup creates a private repo first', …)                    // { repo: 'trackness/new', create: 'private' } → argvs contains 'gh repo create trackness/new --private'
test('board_setup will not make the ideas repo public', …)             // { repo: 'trackness/ideas', create: 'public' } → deny 'must stay private'; spawned is empty
```

- [ ] **Step 2: Run them.** Expected: FAIL, `cannot import "../hooks/setup.ts"`.
- [ ] **Step 3: Implement**, and register the tool.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat(setup): add board_setup, building each board through the API`.

### Task 8: `idea_move`

**Files:**
- Create: `hooks/tools/idea-move.ts`
- Modify: `hooks/register.ts`, `tests/kit.ts`
- Test: `tests/idea-move.test.ts`

**Interfaces:**
- Consumes: `repoInfo`, `requireBoard`, `readWork`, `setStatus` (Task 4); `checkBody`, `attachmentUrls` (Task 5); `parseRefs`, `upload`, `download` (Task 6).
- Produces `ideaMoveTool` (`idea_move`, input `{ issue, to }`):
  - **Checks first:** the issue must be in `IDEAS_REPO` and open, and `to` must have a board (`requireBoard`). Let S be the issue's status on the Ideas board.
  - **A private `to`:**
    1. Run `gh issue transfer <url> <to>`; gh prints the new issue's URL on stdout (its source: `fmt.Fprintln(opts.IO.Out, url)`).
    2. `readWork(new)`: `setStatus` adds the issue to the board when it isn't there and sets S when its status differs.
    3. Compare against before: the body's `attachmentUrls`, the sub-issue numbers, and `blockedBy` and `blocking`. Each loss is a line starting `Lost in the transfer:`. There is no automatic repair.
  - **A public `to`:**
    1. Refuse when the idea has sub-issues or dependency links.
    2. Read every comment with op `Comments` (vars `{ owner, name, number, after }`).
    3. For each distinct ref in the body and the comments: `download` into `<TMP_ROOT>/<tool_use_id>/<i>/`, then `upload` to `to`. Every old URL is replaced by the new one in the body and the comments.
    4. Before creating anything, refuse if an old URL remains or the body fails `checkBody`.
    5. Run `gh issue create -R <to> --project <board title> --title <title> --body-file -`, then `setStatus` S.
    6. Post each comment in order with `gh issue comment <new url> --body-file -`.
    7. Run `gh issue close <old url> --comment "Moved to <new url>"`. Links only ever go from the private repo to the public one.
  - A failure after the create follows Task 5's `created <url>, then …` rule.
- Produces in `tests/kit.ts`: `commentsPage(bodies: string[], endCursor?: string): unknown`.

- [ ] **Step 1: Write the failing tests.** The idea is `url(5, 'trackness/ideas')` in Designed.

```ts
test('a move to a private repo transfers the issue and keeps its column', …)
// to 'trackness/app' (private, board 'app'); transfer answers url(3, 'trackness/app'); the new issue is not on the board
// → argvs contains 'gh issue transfer https://github.com/trackness/ideas/issues/5 trackness/app'; item-add before item-edit Designed on app's board
test('a transfer that lost something says what', …)   // the new body lacks an attachment URL → text contains 'Lost in the transfer:' and that URL
test('a move to a public repo recreates the issue with fresh attachments and no link back', …)
// to 'trackness/site' (public); body 'Idea\n\n## Attachments\n\n- [idea.md](https://github.com/user-attachments/files/1/idea.md)\n';
// comments ['first', 'second ![s.png](https://github.com/user-attachments/assets/aaa)']; uploads answer files/91/idea.md, then assets/bbb; create answers url(4, 'trackness/site')
//   created.input contains 'https://github.com/user-attachments/files/91/idea.md' and not 'files/1/idea.md'
//   the comment inputs equal ['first', 'second ![s.png](https://github.com/user-attachments/assets/bbb)']
//   some argv matches /^gh image download --output \/tmp\/superpowers-github\/\S+\/idea\.md https:\/\/github\.com\/user-attachments\/files\/1\/idea\.md$/
//   argvs contains `gh issue close https://github.com/trackness/ideas/issues/5 --comment Moved to ${url(4, 'trackness/site')}`
test('a public move refuses an idea with sub-issues or dependency links', …) // tasks [#6] → deny; no 'gh issue create'
test('idea_move only moves issues from the ideas repo', …)                  // url(5) in trackness/demo → deny contains 'trackness/ideas'
test('idea_move needs the destination board', …)                           // to without a board → deny contains 'board_setup'
```

- [ ] **Step 2: Run them.** Expected: FAIL, `no implementation for tool.call` for `mcp__superpowers-github__idea_move`.
- [ ] **Step 3: Implement**, and register the tool.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat(ideas): add idea_move for private transfers and public recreation`.

### Task 9: `pr_check`

**Files:**
- Create: `hooks/tools/pr-check.ts`
- Modify: `hooks/register.ts`, `tests/kit.ts`
- Test: `tests/pr-check.test.ts`

**Interfaces:**
- Consumes: `readWork` (Task 4).
- Produces `prCheckTool` (`pr_check`, input `{ parent, pr? }`, where `pr` is a number or a PR URL):
  - **Without `pr`, when there are tasks:** every task must be In Review. Otherwise refuse with `No PR: these tasks are not In Review:` followed by `- [#n title](url) — <status>` lines. On success it returns `Gate passed. Put these lines in the PR description:`, then `Closes #<parent>` and `Closes #<task>` for each task in order, each on its own line, then `and a "## Plan changes made during the run" section.`
  - **Without `pr`, when there are no tasks (a small change):** the parent must be In Review, and the result is `Closes #<parent>`.
  - **With `pr`:** read op `ClosingRefs` (vars `{ owner, name, number }`) and compare its `<repo>#<n>` set with the parent plus the tasks. A mismatch is refused with `The PR's closing issues don't match. Missing: #a, #b. Extra: #c. Fix the description (gh pr edit <n> --body …) and check again.`, leaving out an empty part. With tasks, the PR body must contain `## Plan changes made during the run`. When everything matches it returns `PR #<n> closes exactly the parent and every task: hand it over.`
- Produces in `tests/kit.ts`: `closingData(o: { body: string; closes: number[]; repo?: string }): unknown`.

- [ ] **Step 1: Write the failing tests.** The parent is #10 with tasks #11 and #12.

```ts
test('the gate names every task that is not In Review', …)         // #11 In Review, #12 In Progress → deny contains `[#12 ` and 'In Progress', and not `(${url(11)})`
test('the gate passes with the Closes lines for the parent and every task', …) // both In Review → text contains 'Closes #10\nCloses #11\nCloses #12'
test('a small change passes the gate only from In Review', …)      // no tasks: parent In Review → text contains 'Closes #10'; parent In Progress → deny
test('a PR that closes exactly the parent and its tasks is ready to hand over', …) // closingData({ body: 'x\n## Plan changes made during the run\n\nNone.', closes: [10, 11, 12] }) → text contains 'hand it over'
test('a PR missing a task names it', …)                            // closes [10, 11] → deny contains 'Missing: #12'
test('a PR closing an extra issue names it', …)                    // closes [10, 11, 12, 99] → deny contains 'Extra: #99'
test('a PR for a planned run must carry the plan-changes section', …) // the body lacks the heading → deny contains '## Plan changes made during the run'
```

- [ ] **Step 2: Run them.** Expected: FAIL, `no implementation for tool.call` for `mcp__superpowers-github__pr_check`.
- [ ] **Step 3: Implement**, and register the tool.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit:** `feat(pr): add pr_check for the PR gate and the closing-issues check`.

### Tasks 10–13: the patch sets

Each task adds one `PatchSet` file, registers it in `register.ts` through `registerPatches`, and adds one test file with the same four tests. Task 10 writes these out; Tasks 11–13 copy their shape from `tests/patches-brainstorming.test.ts`.

What the engine hands `skill.prompt` was checked live on 2026-11-03, with `claude -p --plugin-dir` running a throwaway probe mod:
- `skill` is `superpowers:executing-plans` (so the matchers are spelled right), `pluginName` is `superpowers`, `source` is `plugin`, and `path` is the absolute path of the 7.0.0 `SKILL.md`.
- `text` is `Base directory for this skill: <skill dir>\n\n` followed by the `SKILL.md` with its frontmatter and the blank line after it removed. Otherwise it is unchanged: its length equals the file's, rebuilt that way.
- Within one module, the first hook registered sits outermost.

```ts
import { expect, test } from 'claude-code/testing'
import { applyPatches } from '../hooks/patches/engine.ts'
import { brainstorming } from '../hooks/patches/brainstorming.ts'
import { SKILLS } from './fixtures/superpowers-7.0.0.ts'
import { boot, router } from './kit.ts'

const ABSENT = [/* the task's list */], PRESENT = [/* the task's list */]
const patched = () => applyPatches(SKILLS['brainstorming'], brainstorming)
test('every brainstorming patch applies to the 7.0.0 text as counted', () => expect(patched().failures).toEqual([]))
test('the patched brainstorming keeps nothing the mod replaces', () => { for (const s of ABSENT) expect(patched().text).not.toContain(s) })
test("the patched brainstorming says what the mod does instead", () => { for (const s of PRESENT) expect(patched().text).toContain(s) })
test('brainstorming reaches the model patched', async ($, on) => {
  await boot($, on, { reply: router({}) })
  const text = 'Base directory for this skill: /x\n\n' + SKILLS['brainstorming'].replace(/^---\n[\s\S]*?\n---\n\n/, '')
  expect((await $.skill.prompt({ skill: 'superpowers:brainstorming', text })).text).toBe(applyPatches(text, brainstorming).text)
})
```

Each table row is one patch, in file order.
- **Anchor:** the exact 7.0.0 text, copied verbatim from `/Users/james/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/<skill>/SKILL.md` at the lines given (whole lines, without the final newline), or the quoted string.
- **Replacement:** it must say what the row says. The wording is the implementer's, except text marked as exact copy.
- **Replacement text never contains a string from that task's ABSENT list.**
- **If missing:** goes into the patch's `ifMissing`.

Steps for each of Tasks 10–13:
- [ ] Step 1: Write the test file.
- [ ] Step 2: Run `claude plugin test <repo>`. Expected: FAIL, `cannot import "../hooks/patches/<skill>.ts"`.
- [ ] Step 3: Write the `PatchSet` and register it.
- [ ] Step 4: Run the tests. Expected: all pass.
- [ ] Step 5: Commit: `feat(patches): patch <skill> for GitHub`.

### Task 10: brainstorming

**Files:** Create `hooks/patches/brainstorming.ts` (exports `brainstorming`, skill `superpowers:brainstorming`). Modify `hooks/register.ts`. Test: `tests/patches-brainstorming.test.ts`.

| id | Anchor | Replacement says | If missing |
|---|---|---|---|
| `b-which-work` | line 24 | Keeps the line, then: before the first message, call `work_list` with status `Idea` (it reads the current repo, or the ideas repo outside one). Ask in one message which piece of work this is: each listed issue as a link, with **a new piece of work** as the default choice. For an existing issue, read its body with `gh issue view <url>` as the description so far; if the body is empty, ask James to describe it. A new piece of work is created once its size is known (see sizing), or at once if James asks to turn the discussion into a piece of work. | brainstorming never offers the board's existing ideas, and the work starts unlinked to its Idea issue |
| `b-size` | line 140 | Keeps the line, then what each size means on GitHub. A quick task stays in chat; nothing goes on GitHub. A small change, once approved in chat: an existing Idea issue gets the agreed change through `design_write`; a new piece of work gets `issue_create` with status `Designed` and the change as its body. `status` moves it to In Progress when building starts and to In Review when it's built; the PR's `Closes #<parent>` moves it to Done. A project, for a new piece of work: ask which repo (the current repo, `trackness/ideas`, another existing repo, or a new repo made with `board_setup` and `create` once James gives its name and visibility), then `issue_create` with status `Idea` and the discussion so far as its body, and carry on. | small changes and projects get no parent issue, and nothing reaches the board |
| `b-where` | lines 156–158 | The design replaces the parent issue's body through `design_write`: the idea becomes an attached `idea.md` under the design, and the status moves to Designed. Later revisions go through `issue_edit`. Nothing is written to disk. Hand the design over as the issue's link. | the design is written to docs/superpowers/specs/ on disk, and the issue keeps the bare idea |
| `b-builder` | the string `` **Builder check:** dispatch a fresh subagent with\n`builder-check-prompt.md` in this directory. `` | Keeps the string, then: fill `[DOCUMENT_PATH]` with `` the GitHub issue <url> (read it with `gh issue view <url>`) `` | the builder check is pointed at a design file that doesn't exist |
| `b-companion` | lines 224–225 | Keeps the text, then: start the server as `SUPERPOWERS_DISABLE_TELEMETRY=1 bash scripts/start-server.sh --open`, without `--project-dir` whatever `visual-companion.md` says, so its files live in `/tmp`. `screen_dir` and `state_dir` are in `$STATE_DIR/server-info`, and screens and assets are in `<session>/content/`. Before stopping the server, if anything is worth keeping, call `attach` with the parent issue, path `<session>/content` and name `visual-companion.zip`. | the companion writes mockups into the repo's .superpowers/brainstorm/, loads the primeradiant.com logo, and nothing is attached to the issue |

ABSENT: `docs/superpowers/specs/`. PRESENT: `mcp__superpowers-github__work_list`, `mcp__superpowers-github__design_write`, `mcp__superpowers-github__issue_create`, `mcp__superpowers-github__issue_edit`, `mcp__superpowers-github__attach`, `mcp__superpowers-github__board_setup`, `mcp__superpowers-github__status`, `SUPERPOWERS_DISABLE_TELEMETRY=1`, `gh issue view`, `a new piece of work`.

### Task 11: writing-plans

**Files:** Create `hooks/patches/writing-plans.ts` (exports `writingPlans`, skill `superpowers:writing-plans`). Modify `hooks/register.ts`. Test: `tests/patches-writing-plans.test.ts`.

| id | Anchor | Replacement says | If missing |
|---|---|---|---|
| `w-location` | lines 16–17 | The plan goes in the parent issue. When the skill starts on its own, first call `work_list` with status `Designed` and ask which parent (as links). Non-task content goes into the parent's body under `` `## Plan` `` through `issue_edit`: Goal, Architecture, Tech Stack, Global Constraints, Review Focus. There is no title line, no agentic-workers line and no Spec line, because the design is in the same body. Each task becomes a sub-issue through `issue_create`, in plan order, with the parent, title `Task N: <name>`, the task's full text as its body, and `blockedBy` listing the earlier tasks it consumes from (Interfaces → Consumes) or whose created files it modifies. One task's text must fit one issue, 65,536 characters: when the tool refuses one, rewrite that task to fit; never split or truncate it. Never write a plan file. | the plan is saved to docs/superpowers/plans/ on disk, and no sub-issues are created |
| `w-agentic` | line 59 and the newline after it | Removed | the plan header still offers executing-plans |
| `w-spec` | lines 67–69 | Removed | the plan header asks for a spec path that doesn't exist on GitHub |
| `w-check` | line 177 | Keeps the line, then: run subagent-driven-development's pre-start check on the plan. It looks for tasks that contradict each other or the Global Constraints, and for anything the plan mandates that the review rubric treats as a defect (a test that asserts nothing, or verbatim duplication of a logic block). Fix each finding in the plan itself: `issue_edit` on the affected sub-issues, with `addBlockedBy` or `removeBlockedBy` where the fix is about order. Keep a list of every fix: the issue link, what changed, and why. | plan defects reach the run instead of being fixed before approval |
| `w-handoff` | lines 179–204 (to the end of the file) | `## Execution Handoff`: link the parent issue for James to review on GitHub, list every fix the check made (or say it found none), and ask exactly **"should we start?"**. On yes, the REQUIRED SUB-SKILL is superpowers:subagent-driven-development, with the parent issue. | the handoff offers inline execution (executing-plans), which this setup doesn't support, and points at a plan file |

ABSENT: `docs/superpowers/plans/`, `executing-plans`, `**Spec:**`, `Native`, `Which execution approach`. PRESENT: `mcp__superpowers-github__work_list`, `mcp__superpowers-github__issue_create`, `mcp__superpowers-github__issue_edit`, `` `## Plan` ``, `65,536`, `should we start?`, `superpowers:subagent-driven-development`.

### Task 12: subagent-driven-development

**Files:** Create `hooks/patches/subagent-driven-development.ts` (exports `subagentDrivenDevelopment`, skill `superpowers:subagent-driven-development`). Modify `hooks/register.ts`. Test: `tests/patches-subagent-driven-development.test.ts`.

The upstream prompt templates aren't changed. Their placeholders are filled as this skill now says.

| id | Anchor | Replacement says | If missing |
|---|---|---|---|
| `s-principle` | lines 19–25 | Keeps the paragraph, except that plan defects are fixed in the plan (the sub-issues not yet done) and never ruled around. The run still never stops to wait. | the principle still has the controller rule around plan defects |
| `s-when` | lines 33–57 | `## When to Use`: you have a parent issue with a `## Plan` section and task sub-issues written by superpowers:writing-plans. This setup always executes plans with this skill. | the skill can route to inline execution |
| `s-dot` | the string `"Rule on the conflict, ledger the ruling"`, 3 times | `"Fix the plan (edit the sub-issues), announce, ledger"` | the flow chart still says to rule around a plan conflict |
| `s-workspace` | lines 136–149 | Call `run_folder` with the parent issue. It prints `<repo root>/.superpowers/sdd/<parent number>/`, which is git-ignored and holds the ledger, the reports and the review packages. The ledger is `<run folder>/progress.md`, and its first line is `# SDD ledger — plan: <parent issue URL>` (exact copy). The resume rules stay as upstream wrote them, keyed by that URL. | the controller runs sdd-workspace, which refuses to run without a plan file |
| `s-read` | lines 156–160 | Read the parent once with `gh issue view <url>`: its design is the spec, and its `## Plan` holds the context and Global Constraints. List its tasks with `status`, giving only the parent. Make one todo per task. | the controller looks for a plan file and a spec path |
| `s-prestart` | lines 176–182 | Write the table to the ledger. Before Task 1, fix every finding in the plan itself: `issue_edit` the affected sub-issues not yet done (GitHub keeps their edit history), with `addBlockedBy` or `removeBlockedBy` where the fix is about order. Announce each edit at once in the session line from Global Constraints, ledger it as `Plan change:`, and then dispatch Task 1. | pre-start plan defects are ruled around instead of fixed in the sub-issues |
| `s-dispatch` | lines 251–266 | Just before dispatching, `status` moves the task's sub-issue to In Progress. No brief file is written: in the templates, `[BRIEF_FILE]` is filled with the exact copy `` sub-issue #N (<task url>) and the parent's Global Constraints (<parent url>) — read both with `gh issue view <url>` ``. The dispatch keeps its five parts, with the sub-issue in place of the brief. Exact values appear only in the sub-issue, and no subagent ever reads the whole plan. The report file is `<run folder>/task-N-report.md`, under the same contract. | the controller runs task-brief, which refuses to run without a plan file, and the task stays in Todo |
| `s-done` | line 290 | DONE: make the review package with `review_package`, giving the parent, BASE and HEAD. It prints the file it wrote. BASE is the commit recorded before the dispatch, never `HEAD~1`. Then dispatch the reviewer with that path. | no review package can be made |
| `s-blocked` | line 300 | 4. If the plan itself is wrong, fix it (edit the sub-issues not yet done, announce the edit, ledger the `Plan change:`), then re-dispatch. | a wrong plan is ruled around instead of fixed |
| `s-review` | lines 316–327 | Hand the reviewer its diff as the file `review_package` makes (parent, BASE, HEAD), never `HEAD~1`, and never dispatch a reviewer without a diff file. The reviewer's inputs are the sub-issue (through `[BRIEF_FILE]` as above), the report file, the review package, and the global constraints that bind the task. | reviewers get no diff file and a brief path that doesn't exist |
| `s-mandated` | lines 366–371 | A finding labeled plan-mandated, or one that conflicts with the plan's text, is a plan defect. Fix the plan (edit, announce, ledger) before dispatching the fix. | a reviewer finding against the plan is ruled around instead of fixed |
| `s-brief-path` | the string `the brief path`, 2 times (counted after `s-dispatch`) | `the sub-issue link` | fix rounds hand the implementer a brief path that doesn't exist |
| `s-rereview` | lines 396–403 | The scoped re-review runs `review_package` with the parent, FIX_BASE and HEAD, then re-review-prompt.md with the findings, the sub-issue, the report file and the printed path. The rest of the paragraph stays. | re-reviews get no diff file |
| `s-breaker` | lines 420–425 | Real and load-bearing: when the finding reveals a plan defect, fix the plan (edit, announce, ledger) and carry on; otherwise rule as upstream says. Stop only when every path forward is a guess. | a defect found at the fix-round cap is ruled around instead of fixed |
| `s-complete` | lines 441–443 | Then `status` moves the task's sub-issue to In Review; mark the todo complete and move on. Upstream's "never move on with open Critical or Important issues" sentence stays. | tasks stay In Progress, and the PR gate refuses to open a PR |
| `s-final` | the string `` `bash scripts/review-package PLAN_FILE MERGE_BASE HEAD` `` | `` `mcp__superpowers-github__review_package` with the parent, base MERGE_BASE and head HEAD `` | the final review gets no package |
| `s-final-fix` | the string `` (`bash scripts/review-package PLAN_FILE FIX_BASE HEAD` over the fix range, `` | `` (`mcp__superpowers-github__review_package` with the parent over the fix range FIX_BASE..HEAD, `` | the final fix wave's re-review gets no package |
| `s-finish` | lines 473–480 | Before deleting anything, collect every `Plan change:` and `Ruling:` ledger line into a message headed `## Plan changes made during the run`. Each plan change comes first, in the order made, with its issue link, what changed and why; every other ruling follows, with what it costs if wrong. The list is exhaustive, and finishing-a-development-branch puts it in the PR description. | the plan changes never reach the PR description |
| `s-example` | lines 503–568 (to the end of the file) | Removed | the example still runs task-brief, sdd-workspace and the review-package script |

ABSENT: `PLAN_FILE`, `scripts/`, `plan file`, `executing-plans`, `Rulings I made`, `task-brief`, `sdd-workspace`. PRESENT: `mcp__superpowers-github__run_folder`, `mcp__superpowers-github__review_package`, `mcp__superpowers-github__status`, `mcp__superpowers-github__issue_edit`, `In Progress`, `In Review`, `gh issue view`, `Plan change:`, `## Plan changes made during the run`, `# SDD ledger — plan: <parent issue URL>`.

### Task 13: finishing-a-development-branch

**Files:** Create `hooks/patches/finishing.ts` (exports `finishing`, skill `superpowers:finishing-a-development-branch`). Modify `hooks/register.ts`. Test: `tests/patches-finishing.test.ts`.

| id | Anchor | Replacement says | If missing |
|---|---|---|---|
| `f-principle` | line 10 | Exact copy: `**Core principle:** Verify tests → Gate → Detect environment → Push and open the PR → Clean up.` | the overview still promises a menu of options |
| `f-env` | lines 38–44 | `This determines how the branch is pushed and how cleanup works:`, with a table whose columns are State, Push and Cleanup. Normal repo: `git push -u origin <branch>`; no cleanup. Named-branch worktree: the same push; provenance-based cleanup (Step 6). Detached HEAD: `git push origin HEAD:refs/heads/<new-branch>`; externally managed, left in place. | the environment table still chooses a menu |
| `f-options` | lines 53–130 | **`## Step 4: Gate`.** Call `pr_check` with the parent issue. If it names unfinished tasks (or a small change's parent isn't In Review), open no PR and tell James which ones, as links. **`## Step 5: Push and Open the PR`**, the only route. Push as the table says. Run `gh pr create --base <base-branch> --title <title> --body <description>`; the description holds a summary, the `Closes #…` lines `pr_check` gave (the parent and every task), and, after a planned run, the `## Plan changes made during the run` section from subagent-driven-development's final message. Then call `pr_check` with the parent and the PR. While it reports a mismatch, fix the description with `gh pr edit <n> --body <description>` and check again. Hand the PR over only once it matches. James merges, or asks you to: `gh pr merge <n> --squash --delete-branch` (squash only, remote branch deleted). Keep the worktree for PR feedback. | finishing offers a local merge and keep-as-is, and opens PRs without the Closes check |
| `f-cleanup` | lines 161–165 | Exact copy: `` **Runs for confirmed discards only.** The PR route always preserves the worktree. The discard path has already changed directory to the main repo root — worktree removal must run from outside the worktree — and uses the `GIT_DIR`/`GIT_COMMON`/`WORKTREE_PATH` values captured in Step 2, from before that directory change. `` | cleanup still refers to options that no longer exist |
| `f-quickref` | lines 205–210 | The table with two rows: the PR (push: yes; keep worktree: yes) and a discard, on explicit request only (cleanup branch: yes, forced) | the quick reference still lists a local merge |
| `f-rationalizations` | lines 217–218 | Exact copy: `\| "They obviously want it merged" \| Merging is your human partner's call. Hand the PR over and merge only when they ask. \|`, then a newline, then `\| "They seem done with this feature — I'll offer to discard it" \| The PR route is the only one offered. Discard happens only when your human partner asks for it in so many words. \|` | two rationalizations still mention the menu |

ABSENT: `Merge back to`, `Keep the branch as-is`, `Which option?`, `### Option`, `Options 2 and 3`, `Present the menu`, `The menu is complete`. PRESENT: `mcp__superpowers-github__pr_check`, `Closes #`, `--squash --delete-branch`, `## Plan changes made during the run`, `HEAD:refs/heads/<new-branch>`.

After Task 13 comes the whole-branch review, then finishing-a-development-branch with option 1, **Merge back to main locally**. The repo has no remote, and the mod isn't installed yet, so finishing is still upstream's own.

---

## Part 2: live setup (Tasks 14–16, run by the controller on `main`, with James)

These tasks act on James's machine and GitHub account, and some steps are his. The controller runs them in the main session, not through implementer subagents. `<scratch>` is a new, empty folder in the executing session's scratchpad.

### Task 14: Install the mod and check every patch against the live text

- [ ] **Step 1:** `claude plugin validate <repo>` → `✔ Validation passed`; `claude plugin test <repo>` → `0 fail`.
- [ ] **Step 2:** `claude plugin marketplace add <repo>` → adds the marketplace `superpowers-github`. Then `claude plugin install superpowers-github@superpowers-github` → `Installed superpowers-github`.
- [ ] **Step 3 (James):** type `/reload-plugins`. Expected: the reload names `superpowers-github@superpowers-github`, re-read from `<repo>`.
- [ ] **Step 4:** ToolSearch `+superpowers-github` with `max_results` 20 (the default is 5) lists eleven tools: `attach`, `board_setup`, `design_write`, `idea_move`, `issue_create`, `issue_edit`, `pr_check`, `review_package`, `run_folder`, `status`, `work_list`.
- [ ] **Step 5: Load check.** Say in the session that these loads are checks only, and act on none of them. Load `superpowers:executing-plans` with the Skill tool: its text is exactly Task 3's replacement, which proves the matcher spelling against the live text. Then load `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:subagent-driven-development` and `superpowers:finishing-a-development-branch`, one at a time. Each must contain `mcp__superpowers-github__`, and none may contain `superpowers-github blocked`. A block text means the live text differs from the fixture: follow its remediation before going on.

### Task 15: gh-image pinned, verified and proven live

- [ ] **Step 1 (James; auto mode blocks third-party binaries):** run `gh extension remove gh-image`, then `gh extension install drogers0/gh-image --pin v1.4.1`. Expected: `/Users/james/.local/share/gh/extensions/gh-image/manifest.yml` reads `tag: v1.4.1` and `ispinned: true`, and `gh extension list` shows `drogers0/gh-image` at `v1.4.1`.
- [ ] **Step 2: Attestation.** Run `gh release download v1.4.1 -R drogers0/gh-image -p darwin-arm64 -D <scratch>/release`, then `gh attestation verify <scratch>/release/darwin-arm64 --repo drogers0/gh-image`. Expected: verification succeeds, and it was built by `.github/workflows/release.yml` at `refs/tags/v1.4.1` (2026-11-03: Actions run 40590566262). Don't use `--owner drogers0`; it is a user account.
- [ ] **Step 3: Same binary.** Run `cp <scratch>/release/darwin-arm64 <scratch>/release.bin`, `cp <manifest path> <scratch>/installed.bin`, `codesign --remove-signature <scratch>/release.bin`, `codesign --remove-signature <scratch>/installed.bin`, `stat -f %z <scratch>/release.bin`, `stat -f %z <scratch>/installed.bin`, then `cmp -l <scratch>/release.bin <scratch>/installed.bin`. Expected: both sizes are `7999840`, and `cmp -l` prints exactly two lines, in the Mach-O header (2026-11-03: offsets 1553–1554). Anything else: stop, tell James, and don't use gh-image.
- [ ] **Step 4: Live proof on `trackness/kidcough`, the approved testbed.**
  1. Run `mkdir -p <scratch>/live <scratch>/back`.
  2. Write `<scratch>/live/idea.md` (a few lines) with the Write tool.
  3. Run `cp /Users/james/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/assets/app-icon.png <scratch>/live/issue.png`, then `zip -j -q <scratch>/live/session.zip <scratch>/live/idea.md <scratch>/live/issue.png`.
  4. Upload each file: `gh image <scratch>/live/session.zip --repo trackness/kidcough`, then the same for `idea.md` and `issue.png`. Expected: the zip and the `.md` print `fast upload unavailable (HTTP 422); using browser session`, then `[session.zip](https://github.com/user-attachments/files/…)` and `[idea.md](…)`. The PNG prints `![issue.png](https://github.com/user-attachments/assets/…)` with no note.
  5. For each upload, run `gh image download --output <scratch>/back/<name> <url>`, then `cmp <scratch>/live/<name> <scratch>/back/<name>`. Expected: no output, exit 0.
  6. Run `curl -s -o /dev/null -w "%{http_code}" <session.zip url>`. Expected: `404`.
  7. Run `gh image check-token`. Expected: `trackness`.

### Task 16: The ideas repo and its board

- [ ] **Step 1:** Call `mcp__superpowers-github__board_setup` with `{ "repo": "trackness/ideas", "create": "private" }`. Expected: `board "ideas" (<url>) is set up for trackness/ideas`.
- [ ] **Step 2: Verify.**
  - `gh repo view trackness/ideas --json visibility` → `{"visibility":"PRIVATE"}`.
  - `gh api graphql -f query='{ repository(owner: "trackness", name: "ideas") { projectsV2(first: 5) { nodes { number title } } } }'` → one board, titled `ideas`. Call its number N.
  - `gh api graphql -f query='{ viewer { projectV2(number: N) { workflows(first: 20) { nodes { name enabled } } field(name: "Status") { ... on ProjectV2SingleSelectField { options { name } } } views(first: 5) { nodes { layout } } } } }'` → exactly two workflows, "Item closed" and "Auto-close issue", both enabled; the options Idea, Designed, Todo, In Progress, In Review, Done; and a `BOARD_LAYOUT` view.
  - `mcp__superpowers-github__work_list` with `{ "status": "Idea", "repo": "trackness/ideas" }` → `No issues in Idea on trackness/ideas's board.`
