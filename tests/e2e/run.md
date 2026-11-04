# superpowers-github end-to-end test

You are running a fully ephemeral end-to-end test of the superpowers-github mod against real GitHub, unattended. It creates one throwaway private repo and its board, exercises all eleven of the mod's tools on them, asserts every result against GitHub, then deletes everything it made. Follow this file exactly.

## Rules

- Make exactly one tool call per message, in the order written; a Write counts as one. Never call tools in parallel.
- Run each Bash command exactly as written, quoting and flag order included (the allow rules match its text), after replacing the `<PLACEHOLDERS>`. One command per Bash call: no `;`, `&&`, `||`, pipes, `$(...)`, loops, `sleep` or scripts. The only `cd` commands are the ones in steps 3 and 11.
- Use the mod's own tools (`mcp__superpowers-github__<name>`) for every write they cover. Never work around a failing mod tool with `gh issue create`, `gh issue edit`, `gh project item-edit` or the like.
- Do not read other files, explore code, invoke skills, spawn agents or use the web. Never change the mod.
- Touch only the repo and board this run creates (named `<RUN>`), and in `trackness/ideas` only the one idea issue step 9 creates.
- Never run `gh image extract-token`, and never print a token.
- A mod tool that writes (board_setup, issue_create, attach, design_write, issue_edit, status with `status`, idea_move) is never called a second time for the same purpose. A read (status without `status`, pr_check, work_list) or a `gh` read may be retried once after a transient network or GraphQL error.
- GitHub can take a moment to show a write in a later read, so an Expect or Assert on a read of GitHub (a `gh` read, status without `status`, pr_check, work_list) in steps 2 to 10 and in the leftover checks is re-checked before it fails. When it first fails: Bash `date +%s` sets `<TR>`. Then repeat the pair Bash `date +%s` then the same read until it passes, and record FAIL, quoting the last output, once a `date +%s` is 60 or more past `<TR>`. Only the read is repeated, never a write. Step 8.4 has its own, longer wait.
- When an assertion fails or a call is denied, record the step as FAIL with the exact text that shows it, mark every later step that needs its result SKIPPED, and go straight to step 11. Step 11 always runs, whatever happened before.
- Record a one-line evidence quote for every step, taken verbatim from a tool's output.

## Placeholders

- `<RUN>`: `superpowers-github-e2e-<YYYYMMDD-HHMMSS>`, from step 1.
- `<ROOT>`: `/private/tmp/superpowers-github-e2e-run`, the same for every run, so the allow rules can name it exactly. `<CLONE>`: `<ROOT>/clone`.
- `<DRIVER_SID>`: this session's id, from step 1.
- `<SNAP name>`: this command, with `<name>` replaced by a repo name in `trackness`:

```
gh issue list -R trackness/<name> --state all --json number,title,state,parent,subIssues,blockedBy,projectItems
```

An issue's column on a board is the `status.name` of its `projectItems` entry whose `title` is that board's title: `<RUN>` for board `<N>`, `ideas` for the ideas board.

## Steps

### 1. Preflight

1. Bash: `printenv CLAUDE_CODE_SESSION_ID`. Set `<DRIVER_SID>` to its output.
2. Bash: `gh image check-token`. PASS when a line of its output is exactly `trackness`. Otherwise record FAIL with its output and this fix: "Sign in to GitHub as trackness in the browser, then run `gh image extract-token` yourself." Then go to step 11.
3. Bash: `ls -d <ROOT>`. PASS when it says "No such file or directory". Otherwise record FAIL with this fix: "An earlier run left `<ROOT>` behind: delete it yourself with `rm -rf <ROOT>`." Then go to step 11.
4. Bash: `date +%Y%m%d-%H%M%S`. Set `<RUN>` to `superpowers-github-e2e-` followed by its output.
5. Write `<ROOT>/started` with the line `Marks the start of this run.` Step 11 deletes only what is made in the mod's temp folder after this file.
6. Bash: `ls -a /tmp/superpowers-github`. Record its entries as `<TMPBASE>` (none if it says "No such file or directory"). This is the mod's temp folder.

### 2. board_setup

1. Call `mcp__superpowers-github__board_setup` with `{ "repo": "trackness/<RUN>", "create": "private" }`. Expect `board "<RUN>" (https://github.com/users/trackness/projects/<N>) is set up for trackness/<RUN>`. Set `<N>` from that URL.
2. Bash: `gh repo view trackness/<RUN> --json nameWithOwner,visibility`. Assert `visibility` is `PRIVATE`.
3. Bash: `gh project view <N> --owner trackness --format json`. Assert `title` is `<RUN>`.

### 3. Clone, and work from it

1. Bash: `git clone https://github.com/trackness/<RUN>.git <CLONE>` (an empty repo: a warning saying so is expected).
2. Bash: `cd <CLONE>`. Every later git command, and every run_folder and review_package call, runs with the clone as the working directory: the mod resolves the repo root with `git rev-parse --show-toplevel` and the repo with `gh repo view` in the session's working directory.
3. Bash: `git rev-parse --show-toplevel`. Assert it prints `<CLONE>`.
4. Bash: `gh repo view --json nameWithOwner`. Assert `trackness/<RUN>`.
5. Write `<CLONE>/README.md` with two lines: `# <RUN>` and `Throwaway repo for the superpowers-github end-to-end test.`
6. Bash: `git add README.md`
7. Bash: `git commit -m "chore: initial commit"`
8. Bash: `git -C <CLONE> push -u origin HEAD:main`
9. Bash: `gh repo view trackness/<RUN> --json defaultBranchRef`. Assert the default branch is `main`.

### 4. Idea, attachment, design, plan, tasks

1. Call `mcp__superpowers-github__issue_create` with `{ "repo": "trackness/<RUN>", "title": "E2E parent: greet the user", "body": "Idea: a one-file greeting, used only to exercise the superpowers-github mod end to end. It should say hello in a plain text file." }`. Expect `Created [#<P> E2E parent: greet the user](<PURL>) in Idea.` Set `<P>` and `<PURL>`. Bash: `<SNAP <RUN>>`. Assert issue `<P>` is on board `<N>` in `Idea`.
2. Write `<ROOT>/files/notes.txt` with the line `Attachment for the superpowers-github end-to-end test.` Call `mcp__superpowers-github__attach` with `{ "issue": "<PURL>", "path": "<ROOT>/files/notes.txt" }`. Expect `Attached [notes.txt](<ATT>) to <PURL>.`, where `<ATT>` starts `https://github.com/user-attachments/`. Set `<ATT>`. Bash: `gh issue view <PURL> --json body`. Assert the body has a `## Attachments` heading and contains `<ATT>`.
3. Call `mcp__superpowers-github__design_write` with `{ "issue": "<PURL>", "design": "## Design\n\nA file e2e.txt holding the line Hello, e2e!. Task 1 writes it; task 2 documents it." }`. Expect `Wrote the design to [#<P> E2E parent: greet the user](<PURL>) and moved it to Designed. The idea is attached as idea.md.` Bash: `gh issue view <PURL> --json body`. Assert the body starts with `## Design`, has a `## Attachments` list that contains `<ATT>` and an `[idea.md](https://github.com/user-attachments/...)` link, and no longer contains the idea paragraph's text. Set `<IDEAMD>` to that idea.md URL. Bash: `<SNAP <RUN>>`. Assert `<P>` is in `Designed`.
4. Call `mcp__superpowers-github__issue_edit` with `{ "issue": "<PURL>", "appendBody": "## Plan\n\n- Task 1: write the greeting\n- Task 2: document the greeting" }`. Expect `Edited <PURL>.` Bash: `gh issue view <PURL> --json body`. Assert the body ends with the `## Plan` section and still contains `<ATT>` and `<IDEAMD>`.
5. Call `mcp__superpowers-github__issue_create` with `{ "title": "Task 1: write the greeting", "body": "Add e2e.txt holding the greeting.", "parent": "<PURL>" }`. Expect `Created [#<T1> Task 1: write the greeting](<T1URL>) in Todo.` and `Moved parent [#<P> ...](<PURL>) to Todo, derived from its tasks.` Set `<T1>` and `<T1URL>`.
6. Call `mcp__superpowers-github__issue_create` with `{ "title": "Task 2: document the greeting", "body": "Say in the PR what e2e.txt is for.", "parent": "<PURL>", "blockedBy": [<T1>] }`. Expect `Created [#<T2> Task 2: document the greeting](<T2URL>) in Todo.` Set `<T2>` and `<T2URL>`.
7. Bash: `<SNAP <RUN>>`. Assert: `<P>` has subIssues `<T1>` and `<T2>` and is in `Todo`; `<T1>` and `<T2>` have parent `<P>` and are in `Todo`; `<T2>`'s blockedBy is `<T1>`.

### 5. Status moves and the derived parent

1. Call `mcp__superpowers-github__status` with `{ "issue": "<T1URL>", "status": "In Progress" }`. Expect `Moved [#<T1> ...](...) to In Progress.` and `Moved parent [#<P> ...](<PURL>) to In Progress, derived from its tasks.`
2. Call it with `{ "issue": "<T1URL>", "status": "In Review" }`. Expect `Moved [#<T1> ...](...) to In Review.` and no parent line (the parent stays In Progress while task 2 is not In Review).
3. Call it with `{ "issue": "<T2URL>", "status": "In Progress" }`. Expect `Moved [#<T2> ...](...) to In Progress.` and no parent line.
4. Bash: `<SNAP <RUN>>`. Assert `<P>` is in `In Progress`, `<T1>` in `In Review`, `<T2>` in `In Progress`.
5. Call it with `{ "issue": "<T2URL>", "status": "In Review" }`. Expect `Moved [#<T2> ...](...) to In Review.` and `Moved parent [#<P> ...](<PURL>) to In Review, derived from its tasks.`
6. Call it with `{ "issue": "<PURL>", "status": "Todo" }`. Expect a refusal containing `has tasks, so its column is derived from its tasks`. This step PASSES when it is refused.
7. Bash: `<SNAP <RUN>>`. Assert `<P>`, `<T1>` and `<T2>` are all in `In Review`.

### 6. Run folder, a commit, the review package

1. Call `mcp__superpowers-github__run_folder` with `{ "parent": "<PURL>" }`. Expect `<CLONE>/.superpowers/sdd/<P>`. Set `<DIR>`. Bash: `ls -a <DIR>` (it must exist).
2. Bash: `git rev-parse HEAD`. Set `<BASE>` to its output.
3. Bash: `git switch -c e2e-work`
4. Write `<CLONE>/e2e.txt` with the line `Hello, e2e!`
5. Bash: `git add e2e.txt`
6. Bash: `git commit -m "feat: add the greeting"`
7. Bash: `git status --porcelain`. Assert it prints nothing: the run folder is kept out of git.
8. Call `mcp__superpowers-github__review_package` with `{ "parent": "<PURL>", "base": "<BASE>", "head": "HEAD" }`. Expect `wrote <DIR>/review-<7 chars>..<7 chars>.diff: 1 commit(s), <n> bytes`. Set `<PKG>` to that path.
9. Bash: `ls -l <PKG>`. Assert the file exists and its size is the `<n>` bytes reported. Read `<PKG>`. Assert it contains `## Commits`, `feat: add the greeting`, `## Diff` and `e2e.txt`.

### 7. The PR gate, the PR, the PR check

1. Call `mcp__superpowers-github__pr_check` with `{ "parent": "<PURL>" }`. Expect `Gate passed.` followed by the lines `Closes #<P>`, `Closes #<T1>` and `Closes #<T2>`, and a request for a `## Plan changes made during the run` section.
2. Bash: `git -C <CLONE> push -u origin e2e-work`
3. Write `<ROOT>/files/pr-body.md` with, in order: the three `Closes` lines the gate returned (one per line), a blank line, `## Plan changes made during the run`, a blank line, and `None: the plan ran as written.`
4. Bash: `gh pr create -R trackness/<RUN> --base main --head e2e-work --title "feat: add the greeting" --body-file <ROOT>/files/pr-body.md`. It prints the PR's URL. Set `<PR>` to its number.
5. Call `mcp__superpowers-github__pr_check` with `{ "parent": "<PURL>", "pr": <PR> }`. Expect `PR #<PR> closes exactly the parent and every task: hand it over.` (GitHub can take a moment to link the closing issues: re-check as in Rules.)

### 8. Merge, and every issue reaches Done

1. Bash: `gh pr merge <PR> -R trackness/<RUN> --squash --delete-branch`
2. Bash: `gh pr view <PR> --json state,mergedAt`. Assert `state` is `MERGED`.
3. Bash: `date +%s`. Set `<T0>`.
4. Call `mcp__superpowers-github__status` with `{ "issue": "<PURL>" }`. PASS when all three lines (`<P>`, `<T1>`, `<T2>`) end `— Done` and no line says `is closed but not in Done`. GitHub's "Item closed" workflow does this after the merge, on an undocumented delay: until it passes, repeat the pair Bash `date +%s` then this status call, and stop with FAIL (quoting the last status output) once a `date +%s` is 120 or more past `<T0>`.
5. Bash: `<SNAP <RUN>>`. Assert `<P>`, `<T1>` and `<T2>` are `CLOSED` and in `Done`.

### 9. idea_move out of trackness/ideas

1. Call `mcp__superpowers-github__issue_create` with `{ "repo": "trackness/ideas", "title": "E2E idea <RUN>", "body": "Throwaway idea from the superpowers-github end-to-end test <RUN>. It is moved to trackness/<RUN> and deleted with it." }`. Expect `Created [#<I> E2E idea <RUN>](<IURL>) in Idea.` Set `<I>` and `<IURL>`.
2. Bash: `<SNAP ideas>`. Assert issue `<I>` is on the ideas board in `Idea`.
3. Bash: `gh project list --owner trackness --format json`. Set `<IDEAS_N>` to the number of the board titled exactly `ideas`.
4. Call `mcp__superpowers-github__idea_move` with `{ "issue": "<IURL>", "to": "trackness/<RUN>" }`. Expect `Transferred <IURL> to [#<M> E2E idea <RUN>](<MURL>), in Idea on board "<RUN>".` and no `Lost in the transfer:` line. Set `<M>` and `<MURL>`.
5. Bash: `<SNAP <RUN>>`. Assert issue `<M>` is titled `E2E idea <RUN>`, is `OPEN`, is on board `<N>` in `Idea` (it kept its column), and has no `projectItems` entry titled `ideas`.
6. Bash: `gh project item-list <IDEAS_N> --owner trackness --format json`. Assert no item is titled `E2E idea <RUN>`: idea_move removed the moved idea's card from the ideas board. Quote the item list as evidence that the card is gone.
7. Bash: `gh issue list -R trackness/ideas --state all --json number,title`. Assert no issue is titled `E2E idea <RUN>`: it left trackness/ideas.

### 10. work_list

1. Call `mcp__superpowers-github__work_list` with `{ "status": "Idea", "repo": "trackness/<RUN>" }`. Expect exactly one line, `- [#<M> E2E idea <RUN>](<MURL>)`, and no `differs` warning.
2. Call it with `{ "status": "Designed", "repo": "trackness/<RUN>" }`. Expect `No issues in Designed on trackness/<RUN>'s board.`
3. Call it with `{ "status": "Idea", "repo": "trackness/ideas" }`. Assert it does not list `E2E idea <RUN>`, and quote its output in the report's Notes.

### 11. Teardown (always)

Do each part that applies, even after a failure. Skip only what this run never created.

1. If `<IDEAS_N>` is set: Bash `gh project item-list <IDEAS_N> --owner trackness --format json`. Only if it lists an item titled exactly `E2E idea <RUN>`: Bash `gh project item-delete <IDEAS_N> --owner trackness --id <that item's id>`, and say in the report's Notes that the card was left on the ideas board.
2. If step 9.1 created `<IURL>` and step 9.4 did not transfer it, the idea is still in `trackness/ideas`. Leave it: no allow rule can name its number in advance, so this run can't delete it. List it under Leftovers as `<IURL>`, with the command that deletes it: `gh issue delete <IURL> --yes`.
3. If `<RUN>` is set: Bash `gh repo delete trackness/<RUN> --yes` (an error that the repo does not exist is fine when step 2 never created it).
4. If `<RUN>` is set: Bash `gh project list --owner trackness --format json`. For each board whose `title` is exactly `<RUN>`: Bash `gh project view <its number> --owner trackness --format json`, and only if its `title` is exactly `<RUN>`, Bash `gh project delete <its number> --owner trackness`.
5. If `<RUN>` is set: Bash `cd /private/tmp` (Claude Code refuses to delete the working directory or a folder above it, and the clone is the working directory since step 3).
6. If step 1.5 wrote `<ROOT>/started`: Bash `ls -a /tmp/superpowers-github`. If it lists an entry other than `.` and `..` that is not in `<TMPBASE>`: Bash `find /tmp/superpowers-github -mindepth 1 -newer <ROOT>/started -delete`. It deletes everything made in the mod's temp folder since step 1.5, and keeps what was there before. Then, if `<TMPBASE>` was none and the folder exists: Bash `rmdir /tmp/superpowers-github`.
7. If `<RUN>` is set: Bash `rm -rf <ROOT>`

Then check for leftovers, each with one Bash call and re-checked as in Rules:

- `gh repo list trackness --limit 300 --json name`: no name starts `superpowers-github-e2e-`.
- `gh project list --owner trackness --format json`: no title starts `superpowers-github-e2e-`.
- `gh issue list -R trackness/ideas --state all --json number,title`: no title `E2E idea <RUN>`.
- If `<IDEAS_N>` is set: `gh project item-list <IDEAS_N> --owner trackness --format json`: no item titled `E2E idea <RUN>`.
- If `<RUN>` is set: `ls -d <ROOT>`: "No such file or directory".
- If `<TMPBASE>` was recorded: `ls -a /tmp/superpowers-github`: only the `<TMPBASE>` entries, or "No such file or directory" if `<TMPBASE>` was none.

## Final report

End with this report and nothing after it. Its last line is the command that removes the empty `~/.claude/session-env/<DRIVER_SID>` folder Claude Code makes for this session and won't let it delete.

```
E2E RESULT: PASS | FAIL
RUN: <RUN> (board <N>, session <DRIVER_SID>)
1 preflight: PASS|FAIL|SKIPPED — <evidence>
2 board_setup: ...
3 clone: ...
4 issue_create / attach / design_write / issue_edit / tasks: ...
5 status moves and derived parent: ...
6 run_folder / review_package: ...
7 pr_check gate / PR / pr_check: ...
8 merge and Done: ...
9 idea_move: ...
10 work_list: ...
11 teardown: ...
Leftovers: none | <each one>
Notes: <anything unexpected, or none>
Cleanup: bash ~/workspace/claude-code/plugins/superpowers-github/tests/e2e/cleanup-session-env.sh <DRIVER_SID>
```

`E2E RESULT` is PASS only when every step from 1 to 11 passed and there are no leftovers.
