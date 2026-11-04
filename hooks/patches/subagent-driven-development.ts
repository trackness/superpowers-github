import { TOOL_PREFIX as P } from '../config.ts'
import type { PatchSet } from './engine.ts'

export const subagentDrivenDevelopment: PatchSet = {
  skill: 'superpowers:subagent-driven-development',
  patches: [
    {
      id: 's-principle',
      find: `**Rulings, not stalls.** A running plan does not wait on a human. Conflicts,
ambiguities, plan defects, a cap you would have asked to exceed — decide
them. The spec is the binding authority, the plan is its argument, and your
judgment settles what neither answers. Record every decision in the ledger as
\`Ruling: <what you decided> — <why> — <what it costs if wrong>\`, and keep
going. A wrong ruling costs rework your human partner can see and undo; a
session parked on a question costs their whole day and buys nothing.`,
      replace: `**Rulings, not stalls.** A running plan does not wait on a human.
Ambiguities, a cap you would have asked to exceed — decide them. The spec is
the binding authority, the plan is its argument, and your
judgment settles what neither answers. Record every decision in the ledger as
\`Ruling: <what you decided> — <why> — <what it costs if wrong>\`, and keep
going. Plan defects are never ruled around: fix them in the plan itself.
Edit the sub-issues of the tasks not yet done,
or the parent's \`## Plan\` section when the mistake is there, with
\`${P}issue_edit\` (pass the current body back with only the fix changed),
announce each edit in the session at once as
\`Edited <issue link>: <what changed> — <why>\`, ledger it as
\`Plan change: <issue URL> — <what changed> — <why>\`, and keep going: fixing
the plan never stops the run to wait. A fix that leaves a task with nothing
to do says so in its sub-issue (folded into #n), is ledgered as a Plan
change, and moves straight to In Review with no dispatch: call
\`${P}status\` with its sub-issue and status \`In Review\`, and ledger
\`Task <N>: complete (folded into #n)\`. A wrong ruling or plan change costs
rework your human partner can see and undo; a session parked on a question
costs their whole day and buys nothing.`,
      ifMissing: 'the principle still has the controller rule around plan defects',
    },
    {
      id: 's-when',
      find: `## When to Use

\`\`\`dot
digraph when_to_use {
    "Have implementation plan?" [shape=diamond];
    "Tasks mostly independent?" [shape=diamond];
    "Partner chose inline, or no subagent tool?" [shape=diamond];
    "subagent-driven-development" [shape=box];
    "executing-plans" [shape=box];
    "Manual execution or brainstorm first" [shape=box];

    "Have implementation plan?" -> "Tasks mostly independent?" [label="yes"];
    "Have implementation plan?" -> "Manual execution or brainstorm first" [label="no"];
    "Tasks mostly independent?" -> "Partner chose inline, or no subagent tool?" [label="yes"];
    "Tasks mostly independent?" -> "Manual execution or brainstorm first" [label="no - tightly coupled"];
    "Partner chose inline, or no subagent tool?" -> "executing-plans" [label="yes"];
    "Partner chose inline, or no subagent tool?" -> "subagent-driven-development" [label="no"];
}
\`\`\`

**vs. Executing Plans (inline):**
- Fresh subagent per task (no context pollution) instead of one context doing every task
- Review after each task (spec compliance + code quality) instead of only at the end
- Costs a fresh context per task and per review; inline costs one context plus one final reviewer
- Both run in this session, share the same plan workspace and ledger, and never pause between tasks`,
      replace: `## When to Use

You have a parent issue with a \`## Plan\` section and task sub-issues
written by superpowers:writing-plans. This setup always executes plans with
this skill: there is no inline route to choose instead.`,
      ifMissing: 'the skill can route to inline execution',
    },
    {
      id: 's-dot',
      find: '"Rule on the conflict, ledger the ruling"',
      replace: '"Fix the plan (edit the sub-issues), or rule if the spec backs it; announce, ledger"',
      count: 3,
      ifMissing: 'the flow chart still says to rule around a plan conflict',
    },
    {
      id: 's-dot-breaker',
      find: '"Rule and continue; stop only if every path forward is a guess"',
      replace: '"Fix the plan or rule, and continue; stop only if every path forward is a guess"',
      count: 2,
      ifMissing: 'the flow chart still says to rule around a load-bearing finding that reveals a plan defect',
    },
    {
      id: 's-workspace',
      find: `- Each plan owns a workspace: at skill start, run this skill's
  \`bash scripts/sdd-workspace PLAN_FILE\` — it prints the plan's git-ignored
  directory (under \`<repo-root>/.superpowers/sdd/\`), home to
  every artifact for THIS plan: ledger, briefs, reports, review packages.
  Another plan's directory is never yours to read or write.
- Check for this plan's ledger at \`<workspace>/progress.md\`. If its first
  line names your plan file, tasks with a \`Task <N>: complete\` line are DONE
  — do not re-dispatch them; resume at the first task without one. A task
  whose last line is a fix round is mid-loop: resume the loop at the next
  round. A ledger whose first line names a different plan file — or a stray
  ledger at the old flat path \`.superpowers/sdd/progress.md\` — is another
  plan's progress: leave it in place and start your own, fresh.
- Create the ledger with its identity as the first line:
  \`# SDD ledger — plan: <plan file path>\`.`,
      replace: `- Each plan owns a workspace, its run folder: at skill start, call
  \`${P}run_folder\` with the parent issue — it prints
  \`<repo root>/.superpowers/sdd/<parent number>/\`, the plan's git-ignored
  directory, home to every artifact for THIS plan: ledger, reports, review
  packages. Another plan's directory is never yours to read or write; the one
  exception is the rename of another plan's ledger below.
- Check for this plan's ledger at \`<run folder>/progress.md\`. If its first
  line names your parent issue URL, tasks with a \`Task <N>: complete\` line
  are DONE — do not re-dispatch them; resume at the first task without one,
  in the run order below.
  A task whose last line is a fix round is mid-loop: resume the loop at the
  next round. A ledger there whose first line names anything else is another
  plan's progress: rename it to \`progress-other.md\` in the same folder, then
  start your own, fresh. A stray ledger at the old flat path
  \`.superpowers/sdd/progress.md\` is another plan's too: leave it in place.
- Create the ledger with its identity as the first line:
  \`# SDD ledger — plan: <parent issue URL>\`.`,
      ifMissing: 'the controller runs sdd-workspace, which refuses to run without a plan file',
    },
    {
      id: 's-read',
      find: `Read the plan once, note its context and Global Constraints, and create a
todo per task. If the plan names a Spec, read that too: the spec is the
authority the plan argues from, and conflicts inside the plan resolve
against it. A plan with no reachable spec gets a ledger note saying so —
rulings made without one are provisional.`,
      replace: `Read the parent issue once with \`gh issue view <url>\`: its design is the
spec — the authority the plan argues from, against which conflicts inside
the plan resolve — and its \`## Plan\` section holds the plan's context and
Global Constraints. List its tasks with \`${P}status\`,
giving only the parent: it returns the parent and each task sub-issue,
\`Task N: <name>\`, as links with their columns. Read each task's sub-issue
once the same way, for the scan below, and create one todo per task. Run
tasks in plan order, except
that a task never starts before every task it is blocked by is complete (its
blocked-by links: \`gh issue view <url> --json blockedBy\`). On a
resume, a task whose ledger has a \`Task <N>: complete\` line but whose
column is neither In Review nor Done moves to In Review now: call
\`${P}status\` with its sub-issue and status \`In Review\`. A task already
In Review or Done is complete even when the ledger has no line for it: add
its \`Task <N>: complete\` line (commits from \`git log\`) and don't dispatch
it again.`,
      ifMissing: 'the controller looks for a plan file and a spec path',
    },
    {
      id: 's-prestart',
      find: `Write the table to the ledger. Rule on everything you find before execution
begins — each finding against the plan text that mandates it — and record
each ruling in the ledger. If the scan is clean, proceed without comment.
Rule on each conflict it surfaces — the spec is the binding authority, the
plan is its argument — record the ruling beside its row, and dispatch
Task 1. The review loop remains the net for conflicts that only emerge from
implementation.`,
      replace: `Write the table to the ledger. If the scan is clean, proceed without
comment. Otherwise, before dispatching Task 1, fix every finding in the plan
itself — the spec is the binding authority, the plan is its argument: call
\`${P}issue_edit\` on each affected sub-issue of a task
not yet done, or the parent's \`## Plan\` section when the mistake is there
(pass the current body back with only the fix changed; GitHub keeps every
edit in the issue's history), with
\`addBlockedBy\` or \`removeBlockedBy\` where the fix is about task order,
giving the issue numbers (the \`#n\` from \`${P}issue_create\` or the
status listing), not the task numbers.
Announce each edit in the session at once as
\`Edited <issue link>: <what changed> — <why>\`, ledger it as
\`Plan change: <issue URL> — <what changed> — <why>\`, and then dispatch
Task 1. The review loop remains the net for conflicts that only emerge from
implementation.`,
      ifMissing: 'pre-start plan defects are ruled around instead of fixed in the sub-issues',
    },
    {
      id: 's-dispatch',
      find: `- **Task brief:** before dispatching an implementer, run this skill's
  \`bash scripts/task-brief PLAN_FILE N\` — it extracts the task's full text to a
  uniquely named file and prints the path. Compose the dispatch so the
  brief stays the single source of
  requirements. Your dispatch should contain: (1) one line on where this
  task fits in the project; (2) the brief path, introduced as "read this
  first — it is your requirements, with the exact values to use verbatim";
  (3) interfaces and decisions from earlier tasks that the brief cannot
  know; (4) your resolution of any ambiguity you noticed in the brief;
  (5) the report-file path and report contract. Exact values (numbers,
  magic strings, signatures, test cases) appear only in the brief. Never
  make a subagent read the whole plan file.
- **Report file:** name the implementer's report file after the brief
  (brief \`…/task-N-brief.md\` → report \`…/task-N-report.md\`) and put it in
  the dispatch prompt. The implementer writes the full report there and
  returns only status, commits, a one-line test summary, and concerns.`,
      replace: `- **The task's sub-issue is its brief:** no brief file is written. Just
  before dispatching an implementer, call \`${P}status\`
  with the task's sub-issue and status \`In Progress\`. In every task's template,
  whatever its placeholder notes say, fill \`[BRIEF_FILE]\` with exactly
  \`\` sub-issue #N (<task url>) and the parent's Global Constraints (<parent url>) — read both with \`gh issue view <url>\` \`\`
  where \`#N\` is the sub-issue's own issue number. Compose the dispatch so
  the sub-issue stays the single source of requirements. Your dispatch
  should contain: (1) one line on where this task fits in the project;
  (2) the sub-issue, as \`[BRIEF_FILE]\` above, introduced as "read this
  first — it is your requirements, with the exact values to use verbatim";
  (3) interfaces and decisions from earlier tasks that the sub-issue cannot
  know; (4) your resolution of any ambiguity you noticed in the sub-issue;
  (5) the report-file path and report contract. Exact values (numbers,
  magic strings, signatures, test cases) appear only in the sub-issue.
  Never make a subagent read the whole plan: no dispatch points at another
  task's sub-issue, except a batch dispatch (**Batch small same-shape
  work**), which names each batched sub-issue. For a batch, \`[BRIEF_FILE]\`
  lists each batched sub-issue, the report file takes the first task's N,
  and every status move and \`Task <N>: complete\` line is made for each
  batched task.
- **Report file:** the implementer's report file is
  \`<run folder>/task-N-report.md\`, N being the task's number from its
  title \`Task N: <name>\`; put it in the dispatch prompt as \`[REPORT_FILE]\`.
  The implementer writes the full report there and returns only status,
  commits, a one-line test summary, and concerns.`,
      ifMissing: 'the controller runs task-brief, which refuses to run without a plan file, and the task stays in Todo',
    },
    {
      id: 's-done',
      find: "**DONE:** Generate the review package (`bash scripts/review-package PLAN_FILE BASE HEAD`, from this skill's directory — it prints the unique file path it wrote; BASE is the commit you recorded before dispatching the implementer — never `HEAD~1`, which silently drops all but the last commit of a multi-commit task), then dispatch the task reviewer with the printed path.",
      replace: `**DONE:** Generate the review package (call \`${P}review_package\` with the parent issue, base BASE and head HEAD — it prints the file it wrote, as \`wrote <path>: <n> commit(s), <bytes> bytes\`; BASE is the commit you recorded before dispatching the implementer — never \`HEAD~1\`, which silently drops all but the last commit of a multi-commit task), then dispatch the task reviewer with the printed path as \`[DIFF_FILE]\`.`,
      ifMissing: 'no review package can be made',
    },
    {
      id: 's-blocked',
      find: '4. If the plan itself is wrong, rule on the correction, ledger it, and re-dispatch with the ruling carried in the dispatch',
      replace: `4. If the plan itself is wrong, fix it: edit the sub-issues of the tasks not yet done, or the parent's \`## Plan\` section when the mistake is there, with \`${P}issue_edit\` (pass the current body back with only the fix changed), announce the edit and ledger the \`Plan change:\` as **Rulings, not stalls** says, then re-dispatch — the fixed sub-issue carries the correction`,
      ifMissing: 'a wrong plan is ruled around instead of fixed',
    },
    {
      id: 's-review',
      find: `- Hand the reviewer its diff as a file: run this skill's
  \`bash scripts/review-package PLAN_FILE BASE HEAD\` and pass the reviewer the file path
  it prints (or, without bash: \`git log --oneline\`, \`git diff --stat\`,
  and \`git diff -U10\` for the range, redirected to one uniquely named
  file). The output never enters your own context, and the reviewer sees
  the commit list, stat summary, and full diff with context in one Read
  call. Use the BASE you recorded before dispatching the implementer —
  never \`HEAD~1\`, which silently truncates multi-commit tasks. Never
  dispatch a task reviewer without a diff file.
- **Reviewer inputs:** the task reviewer gets three paths — the same brief
  file, the report file, and the review package — plus the global
  constraints that bind the task.`,
      replace: `- Hand the reviewer its diff as a file: call
  \`${P}review_package\` with the parent issue, base BASE
  and head HEAD, and pass the reviewer the file path it prints as
  \`[DIFF_FILE]\`, whatever the template's placeholder notes say. The output
  never enters your own context, and the reviewer sees the commit list,
  stat summary, and full diff with context in one Read call. Use the BASE
  you recorded before dispatching the implementer — never \`HEAD~1\`, which
  silently truncates multi-commit tasks. Never dispatch a task reviewer
  without a diff file, with one exception: if \`${P}review_package\` refuses
  the package as too large, dispatch the reviewer with \`[DIFF_FILE]\` set to
  \`none: too large to package\` — its template then has it fetch the diff
  itself.
- **Reviewer inputs:** the task reviewer gets the task's sub-issue (as
  \`[BRIEF_FILE]\`, filled exactly as for the implementer), the report file,
  and the review package — plus the global constraints that bind the task.`,
      ifMissing: "reviewers get no diff file and a brief path that doesn't exist",
    },
    {
      id: 's-mandated',
      find: `- A finding labeled plan-mandated — or any finding that conflicts with
  what the plan's text requires — is yours to rule on: weigh the finding
  against the plan text, decide with the spec as the binding authority, and
  ledger the ruling before you act on it. Do not dismiss the finding because
  the plan mandates it, and do not dispatch a fix that contradicts the plan
  without a recorded ruling.`,
      replace: `- A finding labeled plan-mandated — or any finding that conflicts with
  what the plan's text requires — is a plan defect: fix the plan before you
  dispatch the fix. Decide the correction with the spec as the binding
  authority, edit the sub-issues of the tasks not yet done,
  or the parent's \`## Plan\` section when the mistake is there, with
  \`${P}issue_edit\` (pass the current body back with only the fix
  changed), and announce the edit and ledger the
  \`Plan change:\` as **Rulings, not stalls** says. The fix dispatch
  names the task's own sub-issue (each batched one, for a batch) when it was
  edited, and the parent when its \`## Plan\` was, so the implementer re-reads
  it. Do not dismiss the finding because the plan mandates it, and never
  dispatch a fix that
  contradicts the plan's text — fix the text first. When the spec backs the
  plan's text, the finding is not a plan defect: rule on it as **Rulings,
  not stalls** says, ledger the \`Ruling:\`, and leave the plan as it is —
  that ruling closes the finding.`,
      ifMissing: 'a reviewer finding against the plan is ruled around instead of fixed',
    },
    {
      id: 's-brief-path',
      find: 'the brief path',
      replace: 'the sub-issue (as `[BRIEF_FILE]`, filled exactly as for the implementer)',
      count: 2,
      ifMissing: "fix rounds hand the implementer a brief path that doesn't exist",
    },
    {
      id: 's-rereview',
      find: `**The re-review is scoped.** Run \`bash scripts/review-package PLAN_FILE FIX_BASE HEAD\`
where FIX_BASE is the head the previous review saw, and dispatch
[re-review-prompt.md](re-review-prompt.md) with the findings list, the
brief, the report file, and the printed diff path. The re-reviewer verdicts
each finding ADDRESSED or NOT ADDRESSED and flags new breakage in the fix
diff only. New Critical/Important breakage in the fix diff joins the open
findings list. Out-of-scope observations go to the ledger as deferred
minors — they never extend the loop.`,
      replace: `**The re-review is scoped.** Call \`${P}review_package\`
with the parent issue, base FIX_BASE and head HEAD,
where FIX_BASE is the head the previous review saw, and dispatch
[re-review-prompt.md](re-review-prompt.md) with the findings list, the
sub-issue (as \`[BRIEF_FILE]\`, filled exactly as for the implementer), the
report file, and the printed diff path. The re-reviewer verdicts
each finding ADDRESSED or NOT ADDRESSED and flags new breakage in the fix
diff only. New Critical/Important breakage in the fix diff joins the open
findings list. Out-of-scope observations go to the ledger as deferred
minors — they never extend the loop.`,
      ifMissing: 're-reviews get no diff file',
    },
    {
      id: 's-breaker',
      find: `- **Real and load-bearing** — a later task builds on it, or it reveals a
  plan defect: rule on the smallest change that unblocks the dependent work,
  ledger it as \`Task <N>: Ruling: <finding> — <what you decided and why>\`,
  and carry it into the next task's dispatch. Parking a structural failure
  silently lets every dependent task build on it. Stop only when the defect
  leaves every path forward a guess.`,
      replace: `- **Real and load-bearing** — a later task builds on it, or it reveals a
  plan defect. When it reveals a plan defect, fix the plan: edit the
  sub-issues of the tasks not yet done,
  or the parent's \`## Plan\` section when the mistake is there, with
  \`${P}issue_edit\` (pass the current body back with only the fix
  changed), announce the edit and ledger the \`Plan change:\` as **Rulings, not
  stalls** says, and carry on — the fixed sub-issues carry the change into
  the dependent tasks' dispatches. Otherwise, rule on the smallest change
  that unblocks the dependent work, ledger it as
  \`Task <N>: Ruling: <finding> — <what you decided and why>\`, and carry it
  into the next task's dispatch. Parking a structural failure silently lets
  every dependent task build on it. Stop only when every path forward is a
  guess.`,
      ifMissing: 'a defect found at the fix-round cap is ruled around instead of fixed',
    },
    {
      id: 's-complete',
      find: `Then mark the todo complete and move on. Never move to the next task while
the review has open Critical/Important issues that are neither fixed nor
parked-with-ruling at the cap.`,
      replace: `Then call \`${P}status\` with the task's sub-issue and
status \`In Review\`, mark the todo complete, and move on. Never move to the
next task while the review has open Critical/Important issues that are
neither fixed nor parked-with-ruling at the cap.`,
      ifMissing: 'tasks stay In Progress, and the PR gate refuses to open a PR',
    },
    {
      id: 's-final',
      find: '`bash scripts/review-package PLAN_FILE MERGE_BASE HEAD`',
      replace: `\`${P}review_package\` with the parent, base MERGE_BASE and head HEAD`,
      ifMissing: 'the final review gets no package',
    },
    {
      id: 's-final-plan',
      find: '[code-reviewer.md](../requesting-code-review/code-reviewer.md).',
      replace: `[code-reviewer.md](../requesting-code-review/code-reviewer.md). Fill its
\`[PLAN_OR_REQUIREMENTS]\` with the parent issue URL and every task sub-issue
URL from the \`${P}status\` listing — the design, the \`## Plan\` section and the tasks,
each read with \`gh issue view <url>\` — never a file path.`,
      ifMissing: "the final reviewer is pointed at a plan file that doesn't exist",
    },
    {
      id: 's-final-fix',
      find: '(`bash scripts/review-package PLAN_FILE FIX_BASE HEAD` over the fix range,',
      replace: `(\`${P}review_package\` with the parent over the fix range FIX_BASE..HEAD, and
the re-review template, filling its \`[BRIEF_FILE]\` with the parent issue URL:`,
      ifMissing: "the final fix wave's re-review gets no package",
    },
    {
      id: 's-residual',
      find: 'finishing-a-development-branch presents the options.',
      replace: "finishing-a-development-branch hands the PR over, with their rulings in the\nPR's `## Plan changes made during the run` section.",
      ifMissing: 'the final-review text still promises a menu of options that finishing no longer offers',
    },
    {
      id: 's-finish',
      find: `Before you delete anything, collect every ledger line containing \`Ruling:\` —
preflight rulings, parked findings, breaker adjudications, all of them — into
your final message under "Rulings I made", in the order you made them, each
with what it costs if wrong. The list is exhaustive: if the ledger holds a
ruling, the list holds it. That list is the only place the decisions you
took on your human partner's behalf reach them — they read it and rework
whatever you got wrong. A ruling that dies with the workspace was a decision
made in secret.`,
      replace: `Before you hand over to finishing, collect every ledger line containing
\`Plan change:\` or \`Ruling:\` — preflight plan changes, plan changes made
mid-run, preflight rulings, parked findings, breaker adjudications, all of
them — into your final message, under the heading
\`## Plan changes made during the run\`. Every plan change comes first, in
the order you made them, each with its issue link, what changed and why;
every other ruling follows, in the order you made them, each with what it
costs if wrong. The list is exhaustive: if the ledger holds a plan change or
a ruling, the list holds it; if it holds neither, the section says so.
superpowers:finishing-a-development-branch puts this section in the PR
description, the only place the decisions you took on your human partner's
behalf reach them — they read it and rework whatever you got wrong. A plan
change or ruling that dies with the workspace was a decision made in
secret.`,
      ifMissing: 'the plan changes never reach the PR description',
    },
    {
      id: 's-keep-folder',
      find: `When the final whole-branch review is clean and its fixes are merged,
delete this plan's workspace (\`rm -rf <workspace>\`) — the git history is
the record now. Sibling directories belong to other plans; leave them
alone.`,
      replace: `When the final whole-branch review is clean, leave the run folder in place:
superpowers:finishing-a-development-branch deletes it once \`${P}pr_check\`
confirms the PR carries the \`## Plan changes made during the run\` section.
Until then its ledger is that section's only record outside this session.
Sibling directories belong to other plans; leave them alone.`,
      ifMissing: 'the run folder, the only lasting record of the plan changes, is deleted before the PR carries them',
    },
    {
      id: 's-dot-keep-folder',
      find: `"Final review clean: delete this plan's workspace"`,
      replace: '"Final review clean: keep the run folder for finishing"',
      count: 3,
      ifMissing: 'the flow chart still deletes the run folder before the PR carries the plan changes',
    },
    {
      id: 's-example',
      find: `## Example Workflow

\`\`\`
You: I'm using Subagent-Driven Development to execute this plan.

[Setup: worktree verified]
[Read plan file once: docs/superpowers/plans/feature-plan.md]
[Resolve workspace: bash scripts/sdd-workspace docs/superpowers/plans/feature-plan.md — no ledger inside, fresh start]
[Create todos for all tasks]

Task 1: Hook installation script

[Run task-brief for Task 1; dispatch implementer with brief + report paths + context]

Implementer: "Before I begin - should the hook be installed at user or system level?"

You: "User level (~/.config/superpowers/hooks/)"

Implementer: [Later]
  - Implemented install-hook command
  - Added tests, 5/5 passing
  - Self-review: Found I missed --force flag, added it
  - Committed

[Run review-package PLAN_FILE BASE HEAD; dispatch task reviewer with the printed path]
Task reviewer: Spec ✅ - all requirements met, nothing extra.
  Strengths: Good test coverage, clean. Issues: None. Task quality: Approved.

[Ledger: Task 1: complete (commits a1b2c3d..d4e5f6a, review clean)]

Task 2: Recovery modes

[Run task-brief for Task 2; dispatch implementer with brief + report paths + context]

Implementer: [No questions]
  - Added verify/repair modes
  - 8/8 tests passing
  - Committed

[Run review-package PLAN_FILE BASE HEAD; dispatch task reviewer with the printed path]
Task reviewer: Spec ❌:
  - Missing: Progress reporting (spec says "report every 100 items")
  Issues (Important): Magic number (100)

[Fix round 1: resume the implementer with both findings]
Implementer: Added progress reporting, extracted PROGRESS_INTERVAL constant.
  Re-ran test/recovery.test.js — 10/10 passing. Fix report appended.

[Run review-package PLAN_FILE FIX_BASE HEAD; dispatch scoped re-review]
Re-reviewer: Missing progress reporting — ADDRESSED (src/recovery.js:41).
  Magic number — ADDRESSED (src/recovery.js:7). New breakage: none.
  Verdict: all findings addressed.

[Ledger: Task 2: fix round 1/5 (2 addressed, 0 open; commits d4e5f6a..b7c8d9e)]
[Ledger: Task 2: complete (commits d4e5f6a..b7c8d9e, review clean)]

...

[After all tasks]
[Run review-package PLAN_FILE MERGE_BASE HEAD; dispatch final code-reviewer, most capable model]
Final reviewer: All requirements met. Deferred minors triaged: none block merge.

[Delete this plan's workspace — the record now lives in git]

Done! Using superpowers:finishing-a-development-branch.
\`\`\``,
      replace: '',
      ifMissing: 'the example still runs task-brief, sdd-workspace and the review-package script',
    },
  ],
}
