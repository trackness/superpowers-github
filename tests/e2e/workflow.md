# superpowers-github workflow end-to-end test

You are the driver of an unattended end-to-end test of the superpowers-github mod as a user meets it: real superpowers skills (brainstorming, writing-plans, subagent-driven-development, finishing-a-development-branch) in a headless Claude session, the inner session, which you talk to as a scripted user whose replies are fixed. You set up one throwaway private repo with its board and a clone, install superpowers into the clone at project scope, hold the conversation, assert what lands on GitHub after each stage, then delete everything this run made. Follow this file exactly.

## Rules

- Make exactly one tool call per message, in the order written; a Write counts as one. Never call tools in parallel.
- Run each Bash command exactly as written, quoting and flag order included (the allow rules match its text), after replacing the `<PLACEHOLDERS>`. One command per Bash call: no `;`, `&&`, `||`, pipes, `$(...)`, loops, `sleep` or scripts. The only `cd` commands are the ones in steps 2 and 8.
- Never use the mod's write tools yourself, except board_setup in step 2: the inner session does the work. You may call the mod's reads (`status` without `status`, `pr_check`).
- Do not read other files, explore code, invoke skills, spawn agents or use the web. Never change the mod.
- Touch only the repo and board this run creates (named `<RUN>`). Never touch `trackness/ideas` or any other repo or board.
- Never run `gh image extract-token`, and never print a token.
- A read (`gh`, `git`, `ls`, status, pr_check) may be retried once after a transient network or GraphQL error. An inner turn is never re-run.
- When an assertion fails or a call is denied, record the step as FAIL with the exact text that shows it, mark every later step that needs its result SKIPPED, and go straight to step 8. Step 8 always runs, whatever happened before.
- Record a one-line evidence quote for every step, taken verbatim from a tool's output.

## Placeholders

- `<RUN>`: `superpowers-github-e2e-<YYYYMMDD-HHMMSS>`, from step 1. `<ROOT>`: `/private/tmp/<RUN>`. `<CLONE>`: `/private/tmp/<RUN>/clone`.
- `<SID>`: the inner session's id, from step 1, in lower case.
- `<SNAP>`: this command:

```
gh issue list -R trackness/<RUN> --state all --json number,title,state,parent,subIssues,projectItems
```

An issue's column is the `status.name` of its `projectItems` entry whose `title` is `<RUN>`.

- `<TURN text>`: an inner turn, the Bash command below with `<text>` replaced by the turn's text, run from `<CLONE>`. The first turn is the only one with `--session-id <SID>`; every later turn has `--resume <SID>` in its place.

```
claude -p '<text>' --resume <SID> --settings /Users/james/workspace/claude-code/plugins/superpowers-github/tests/e2e/workflow-settings.json --setting-sources project,local --plugin-dir /Users/james/workspace/claude-code/plugins/superpowers-github --model sonnet --permission-prompts none --max-budget-usd 15 --output-format json
```

It prints one JSON object. Its `result` is the inner session's last message, `is_error` and `subtype` say whether the turn ran to its end, `permission_denials` lists every call the inner session's permissions refused, and `total_cost_usd` is the inner session's cost so far. A turn can run for many minutes; wait for it.

## Steps

### 1. Preflight

1. Bash: `gh image check-token`. PASS when a line of its output is exactly `trackness`. Otherwise record FAIL with its output and this fix: "Sign in to GitHub as trackness in the browser, then run `gh image extract-token` yourself." Then go to step 8.
2. Bash: `date +%Y%m%d-%H%M%S`. Set `<RUN>` to `superpowers-github-e2e-` followed by its output.
3. Bash: `uuidgen`. Set `<SID>` to its output in lower case.
4. Bash: `ls -a /tmp/superpowers-github`. Record its entries as `<TMPBASE>` (none if it says "No such file or directory"). This is the mod's temp folder; step 8 removes only what this run adds to it.
5. Bash: `gh project list --owner trackness --format json`. Record each board's `number` and `title` as `<BOARDS0>`.
6. Bash: `gh issue list -R trackness/ideas --state all --json number,title,state,updatedAt`. Record its output as `<IDEAS0>`.
7. Bash: `claude plugin list --json`. Record every entry whose `scope` is `user` (its `id`, `version`, `enabled`, `installedAt` and `lastUpdated`) as `<PLUGINS0>`.

### 2. Repo, board, clone, superpowers

1. Call `mcp__superpowers-github__board_setup` with `{ "repo": "trackness/<RUN>", "create": "private" }`. Expect `board "<RUN>" (https://github.com/users/trackness/projects/<N>) is set up for trackness/<RUN>`. Set `<N>` from that URL.
2. Bash: `gh repo view trackness/<RUN> --json nameWithOwner,visibility`. Assert `visibility` is `PRIVATE`.
3. Bash: `git clone https://github.com/trackness/<RUN>.git <CLONE>` (an empty repo: a warning saying so is expected).
4. Bash: `cd <CLONE>`. Every later command up to step 8.6 runs with the clone as the working directory: the inner sessions start there, and `claude plugin` acts on the project there.
5. Bash: `claude plugin install superpowers@claude-plugins-official --scope project`. Expect `Successfully installed plugin: superpowers@claude-plugins-official (scope: project)`.
6. Bash: `claude plugin list --json`. Assert it has an entry with `id` `superpowers@claude-plugins-official`, `scope` `project`, `version` `7.0.0`, `enabled` true and `projectPath` `<CLONE>`. Quote that entry's `installPath` as evidence.
7. Write `<CLONE>/README.md` with two lines: `# <RUN>` and `Throwaway repo for the superpowers-github workflow end-to-end test.`
8. Write `<CLONE>/CLAUDE.md` with these three lines (the third is one line):

```
# Working in this repo

Run exactly one command per Bash call: never join commands with `&&`, `||`, `;` or `|`, and never use subshells, `$(...)`, `$?`, heredocs or redirection. Never put a line break inside a command: pass multi-line text, such as a PR body or a commit message, through a file you write with the Write tool under `.superpowers/sdd/` (git-ignored), as in `gh pr create --body-file <file>` or `git commit -F <file>`. Create and change files with the Write and Edit tools, not the shell.
```

9. Bash: `git add README.md CLAUDE.md .claude/settings.json`
10. Bash: `git commit -m "chore: initial commit"`
11. Bash: `git -C <CLONE> push -u origin HEAD:main`
12. Bash: `git status --porcelain`. Assert it prints nothing.
13. Bash (the probe, a separate throwaway session):

```
claude -p 'List every skill you can invoke whose name starts with superpowers:, one per line, names only. Then, on a last line, give the base directory that the Skill tool reports for superpowers:using-git-worktrees after you invoke it. Do nothing else that skill says.' --settings /Users/james/workspace/claude-code/plugins/superpowers-github/tests/e2e/workflow-settings.json --setting-sources project,local --plugin-dir /Users/james/workspace/claude-code/plugins/superpowers-github --model haiku --permission-prompts none --no-session-persistence --output-format json
```

Set `<PROBE_SID>` to its `session_id`. Assert its `result` lists `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:subagent-driven-development`, `superpowers:using-git-worktrees` and `superpowers:finishing-a-development-branch`, and ends with the line `/Users/james/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/using-git-worktrees`: the project-scope install is what loads superpowers 7.0.0 (user settings, where the user's own install is enabled, are left out).

### 3. The conversation

The opening turn, `<TURN T0>`, with `--session-id <SID>` in place of `--resume <SID>`, where T0 is this text (one line):

```
Use superpowers:brainstorming. This is a new piece of work, in this repo: trackness/<RUN>, the clone you are in. It is tiny and fully specified, but treat it as a project with a written design and a full plan. Here is the design. Play it back and write it as it stands. Intent: the repo gets a version marker, so a reader or a tool can see which version it is at. Goal: a file VERSION at the repo root whose whole content is one line holding the character 1, ended by a newline. Non-goals: no other file changes, and no build, release or tagging tooling. Constraints: the plan has exactly one task, which adds VERSION and commits it. There is no test framework and no test file: the check is the command grep -x 1 VERSION, which prints 1. Left to the builder: nothing.
```

After each turn:

1. If `is_error` is true or `subtype` is not `success`, record FAIL for the stage in progress with `subtype` and `result`, and go to step 8.
2. Add every command in `permission_denials` to the report's Notes, with the turn's number. A denial is not a failure by itself: the stage checks decide.
3. Pick the reply from this table by what `result` asks. Before sending it, run the step its row names. Then send it as `<TURN reply>`.

| When `result`... | Reply | Run first |
|---|---|---|
| asks which piece of work this is | `A new piece of work.` | |
| asks you to describe the work, asks what is wrong or missing, or asks any other question about what to build | `Nothing is missing: my first message is the whole description.` | |
| names a size and asks you to confirm it | `Yes: a project with a written design and a full plan.` | |
| asks which repo the work belongs in | `This repo: trackness/<RUN>.` | |
| links the parent issue and asks you to approve or review the design | `The design is approved.` | step 4 |
| ends with `should we start?` | `Yes.` | step 5 |
| asks whether to use a worktree or an isolated workspace | `No worktree: work on a new branch in this clone.` | |
| asks you to confirm the base branch | `Yes: main.` | |
| hands over a pull request (links it, or asks whether to merge it) | `Merge the PR.` | step 6 |

When `result` asks more than one of these, send their replies in table order, joined by one space, after running every step they name. When it asks none of them (a question the table doesn't cover, a failure, a block, or no question at all before the merge), record FAIL for the stage in progress, quoting `result`, and go to step 8. Never send any other text. The turn after `Merge the PR.` is the last: once it returns, do only 1 and 2 above, then go to step 7 (whatever it says about the board, step 7 decides). The conversation has at most 8 turns, the opening one included; if a 9th would be needed, record FAIL quoting the last `result`, and go to step 8.

Each stage step runs once. If a step a reply calls for has already passed, don't run it again; if the reply for a later stage comes before an earlier stage's step has run, record that earlier step as FAIL ("stage skipped") and go to step 8.

### 4. Brainstorming: the parent issue in Designed, with the design as its body

1. Bash: `<SNAP>`. Assert there is exactly one issue, `<P>`: `OPEN`, no parent, no sub-issues, in `Designed`. Set `<P>` and `<PURL>` (`https://github.com/trackness/<RUN>/issues/<P>`).
2. Bash: `gh issue view <PURL> --json body`. Assert the body is the design: it contains `VERSION` and `grep -x 1 VERSION`, then a `## Attachments` heading followed by a link starting `[idea.md](https://github.com/user-attachments/`, and it has no `## Plan` heading yet.

### 5. Writing-plans: a `## Plan` section on the parent, and a `Task 1` sub-issue in Todo

1. Bash: `<SNAP>`. Assert there are exactly two issues: `<P>`, with exactly one sub-issue, `<T>`, whose title starts `Task 1: ` and whose parent is `<P>`; both `OPEN` and in `Todo` (the parent's column is derived from its task). Set `<T>` and `<TURL>`.
2. Bash: `gh issue view <PURL> --json body`. Assert the body has a `## Plan` heading after the `## Attachments` list, and still has the `idea.md` link.
3. Bash: `gh issue view <TURL> --json body`. Assert the body names `VERSION`.

### 6. Subagent-driven development and finishing: the task In Review, its commit on a branch, the PR

1. Bash: `<SNAP>`. Assert there are still exactly two issues, `<P>` and `<T>`, both `OPEN` and in `In Review`.
2. Bash: `gh pr list -R trackness/<RUN> --state open --json number,headRefName,baseRefName,url`. Assert exactly one PR, with `baseRefName` `main` and a `headRefName` other than `main`. Set `<PR>` to its number and `<BR>` to its `headRefName`.
3. Bash: `gh pr view <PR> -R trackness/<RUN> --json commits,files,body`. Assert at least one commit, `files` exactly one entry with `path` `VERSION`, and a body that contains `Closes #<P>`, `Closes #<T>` and `## Plan changes made during the run`.
4. Bash: `git -C <CLONE> show origin/<BR>:VERSION`. Assert it prints exactly `1`: the task's commit is on the pushed branch.
5. Call `mcp__superpowers-github__pr_check` with `{ "parent": "<PURL>", "pr": <PR> }`. Expect `PR #<PR> closes exactly the parent and every task: hand it over.` If it says the closing issues don't match, call it once more (GitHub can take a moment to link them); the second answer decides.
6. Bash: `ls -a <CLONE>/.superpowers/sdd`. Say in the report's Notes whether `<P>` is still listed (finishing deletes the run folder once the PR matches). This is not an assertion.

### 7. The merge: every issue closed and in Done

1. Bash: `gh pr view <PR> -R trackness/<RUN> --json state,mergedAt`. Assert `state` is `MERGED`.
2. Bash: `date +%s`. Set `<T0>`.
3. Call `mcp__superpowers-github__status` with `{ "issue": "<PURL>" }`. PASS when both lines (`<P>` and `<T>`) end `— Done` and no line says `is closed but not in Done`. GitHub's "Item closed" workflow does this after the merge, on an undocumented delay: until it passes, repeat the pair Bash `date +%s` then this status call, and stop with FAIL (quoting the last status output) once a `date +%s` is 120 or more past `<T0>`.
4. Bash: `<SNAP>`. Assert `<P>` and `<T>` are `CLOSED` and in `Done`.

### 8. Teardown (always)

Do each part that applies, even after a failure. Skip only what this run never created.

1. If step 2.5 installed superpowers: Bash `claude plugin uninstall superpowers@claude-plugins-official --scope project --keep-data` (from `<CLONE>`, the working directory). `--keep-data` keeps the plugin's data folder, which the user-scope install shares.
2. If the opening turn ran: Bash `claude purge -y <CLONE>`. It deletes the inner session's transcripts (its subagents' included) under `~/.claude/projects/`.
3. If step 2.13 or the opening turn ran: Bash `rm -rf /private/tmp/claude-501/-private-tmp-<RUN>-clone`. This is where those sessions' background tasks wrote their output; purge leaves it.
4. If `<RUN>` is set: Bash `gh repo delete trackness/<RUN> --yes` (an error that the repo does not exist is fine when step 2 never created it).
5. If `<RUN>` is set: Bash `gh project list --owner trackness --format json`. For each board whose `title` is exactly `<RUN>`: Bash `gh project view <its number> --owner trackness --format json`, and only if its `title` is exactly `<RUN>`, Bash `gh project delete <its number> --owner trackness`. Deleting a repo does not delete its board.
6. If `<RUN>` is set: Bash `cd /private/tmp` (Claude Code refuses to delete the working directory or a folder above it), then Bash `rm -rf /private/tmp/<RUN>`
7. Bash: `ls -a /tmp/superpowers-github`. For each entry other than `.` and `..` that is not in `<TMPBASE>`: Bash `rm -rf /tmp/superpowers-github/<entry>`. If `<TMPBASE>` was none and the folder is now empty: Bash `rmdir /tmp/superpowers-github`.

Then check for leftovers, each with one Bash call:

- `gh repo list trackness --limit 300 --json name`: no name starts `superpowers-github-e2e-`.
- `gh project list --owner trackness --format json`: the boards' numbers and titles are exactly `<BOARDS0>`.
- `gh issue list -R trackness/ideas --state all --json number,title,state,updatedAt`: exactly `<IDEAS0>`.
- `ls -d /private/tmp/<RUN>`: "No such file or directory".
- `ls -a /tmp/superpowers-github`: only the `<TMPBASE>` entries, or "No such file or directory" if `<TMPBASE>` was none.
- `claude plugin list --json`: no entry has a `projectPath` starting `/private/tmp/superpowers-github-e2e-`, and its `user`-scope entries are exactly `<PLUGINS0>`.
- `ls -d /Users/james/.claude/projects/-private-tmp-<RUN>-clone`: "No such file or directory".
- `ls -d /private/tmp/claude-501/-private-tmp-<RUN>-clone`: "No such file or directory".
- For `<SID>` and `<PROBE_SID>` (each that is set): `ls -A /Users/james/.claude/session-env/<that id>`: prints nothing. Claude Code makes this empty folder for every session, this one's included, and refuses to let a session delete it; it is not a leftover. Name the folders in the report's Notes.

## Final report

End with this report and nothing after it:

```
E2E WORKFLOW RESULT: PASS | FAIL
RUN: <RUN> (board <N>, session <SID>, probe <PROBE_SID>)
1 preflight: PASS|FAIL|SKIPPED — <evidence>
2 repo, board, clone, superpowers (project scope): ...
3 conversation: <the turns, each as: n. sent "<reply>" → asked "<the question it ended on>">
4 brainstorming (Designed, design body): ...
5 writing-plans (## Plan, Task 1 in Todo): ...
6 subagent-driven development and finishing (In Review, commit on branch, PR, pr_check): ...
7 merge and Done: ...
8 teardown: ...
Leftovers: none | <each one>
Cost: inner session $<the last turn's total_cost_usd>, probe $<its total_cost_usd>
Notes: <permission denials, the run folder, anything unexpected, or none>
```

`E2E WORKFLOW RESULT` is PASS only when every step from 1 to 8 passed and there are no leftovers.
