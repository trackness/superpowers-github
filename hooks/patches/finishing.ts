import type { PatchSet } from './engine.ts'

const P = 'mcp__superpowers-github__'

export const finishing: PatchSet = {
  skill: 'superpowers:finishing-a-development-branch',
  patches: [
    {
      id: 'f-tests',
      find: 'the menu comes after a green suite',
      replace: 'the PR comes after a green suite',
      ifMissing: 'Step 1 still promises a menu after the tests',
    },
    {
      id: 'f-principle',
      find: '**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.',
      replace: '**Core principle:** Verify tests → Gate → Detect environment → Push and open the PR → Clean up.',
      ifMissing: 'the overview still promises a menu of options',
    },
    {
      id: 'f-env',
      find: `This determines which menu to show and how cleanup works:

| State | Menu | Cleanup |
|-------|------|---------|
| \`GIT_DIR == GIT_COMMON\` (normal repo) | Standard 3 options | No worktree to clean up |
| \`GIT_DIR != GIT_COMMON\`, named branch | Standard 3 options | Provenance-based (see Step 6) |
| \`GIT_DIR != GIT_COMMON\`, detached HEAD | Reduced 2 options (no merge) | Externally managed — leave in place |`,
      replace: `This determines how the branch is pushed and how cleanup works:

| State | Push | Cleanup |
|-------|------|---------|
| \`GIT_DIR == GIT_COMMON\` (normal repo) | \`git push -u origin <branch>\` | No worktree to clean up |
| \`GIT_DIR != GIT_COMMON\`, named branch | \`git push -u origin <branch>\` | Provenance-based (see Step 6) |
| \`GIT_DIR != GIT_COMMON\`, detached HEAD | \`git push origin HEAD:refs/heads/<new-branch>\` | Externally managed — leave in place |`,
      ifMissing: 'the environment table still chooses a menu',
    },
    {
      id: 'f-options',
      find: `## Step 4: Present Options

**Normal repo and named-branch worktree — present exactly these 3 options:**

\`\`\`
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)

Which option?
\`\`\`

**Detached HEAD — present exactly these 2 options:**

\`\`\`
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)

Which option?
\`\`\`

Present the menu exactly as written — concise, with every option coming
from the list above. Discarding the work happens only in response to your
human partner explicitly asking for it (see "If your human partner asks to
discard the work" below). Wait for their answer; the integration decision
is theirs.

## Step 5: Execute Choice

### Option 1: Merge Locally

\`\`\`bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>
\`\`\`

If tests fail on the merged result: stop, leave the worktree and branch in
place, and investigate — nothing has been pushed, so the merge is local
and recoverable.

Once the merged result is green: clean up the worktree (Step 6), then
delete the branch:

\`\`\`bash
git branch -d <feature-branch>
\`\`\`

### Option 2: Push and Create PR

\`\`\`bash
git push -u origin <feature-branch>
# From a detached HEAD, name the new branch on the remote:
# git push origin HEAD:refs/heads/<new-branch>
\`\`\`

Then create the pull/merge request against <base-branch> with the forge's
tooling — its CLI if one is available, or the creation URL most forges
print when you push — following the repo's PR template and conventions if
present, and report the URL to your human partner.

Keep the worktree — your human partner iterates on PR feedback there.

### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."`,
      replace: `## Step 4: Gate

Call \`${P}pr_check\` with the parent issue. If it names unfinished
tasks (or, for a small change, says the parent isn't In Review), open no PR:
tell your human partner which ones, as links, and stop. If the gate passes it
returns the \`Closes #…\` lines for the PR description: the parent and every
task.

## Step 5: Push and Open the PR

This is the only route. Push as the table in Step 2 says, then open the PR
(after a detached-HEAD push, add \`--head <new-branch>\`: gh's \`--head\`
defaults to the current branch, and a detached HEAD has none):

\`\`\`bash
gh pr create --base <base-branch> --title <title> --body <description>
\`\`\`

The description holds a summary of the work, the \`Closes #…\` lines the gate
gave (the parent and every task), and, after a planned run, the
\`## Plan changes made during the run\` section from
subagent-driven-development's final message.

Then call \`${P}pr_check\` with the parent issue and the PR (its number or
URL). While it reports a mismatch, fix the description with
\`gh pr edit <n> --body <description>\` and check again. Hand the PR over to
your human partner only once it matches.

Your human partner merges it, or asks you to:

\`\`\`bash
gh pr merge <n> --squash --delete-branch
\`\`\`

Squash only; the remote branch is deleted.

Keep the worktree — your human partner iterates on PR feedback there.`,
      ifMissing: 'finishing offers a local merge and keep-as-is, and opens PRs without the Closes check',
    },
    {
      id: 'f-cleanup',
      find: `**Runs for Option 1 and confirmed discards.** Options 2 and 3 always
preserve the worktree. Both callers have already changed directory to the
main repo root — worktree removal must run from outside the worktree —
and use the \`GIT_DIR\`/\`GIT_COMMON\`/\`WORKTREE_PATH\` values captured in
Step 2, from before that directory change.`,
      replace: '**Runs for confirmed discards only.** The PR route always preserves the worktree. The discard path has already changed directory to the main repo root — worktree removal must run from outside the worktree — and uses the `GIT_DIR`/`GIT_COMMON`/`WORKTREE_PATH` values captured in Step 2, from before that directory change.',
      ifMissing: 'cleanup still refers to options that no longer exist',
    },
    {
      id: 'f-quickref',
      find: `| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | yes | - | - | yes |
| 2. Create PR | - | yes | yes | - |
| 3. Keep as-is | - | - | yes | - |
| Discard (explicit request only) | - | - | - | yes (force) |`,
      replace: `| Route | Push | Keep Worktree | Cleanup Branch |
|-------|------|---------------|----------------|
| The PR | yes | yes | - |
| Discard (explicit request only) | - | - | yes (force) |`,
      ifMissing: 'the quick reference still lists a local merge',
    },
    {
      id: 'f-rationalizations',
      find: `| "They obviously want it merged" | Integration is your human partner's decision. Present the menu and wait. |
| "They seem done with this feature — I'll offer to discard it" | The menu is complete as written. Discard happens only when your human partner asks for it in so many words. |`,
      replace: `| "They obviously want it merged" | Merging is your human partner's call. Hand the PR over and merge only when they ask. |
| "They seem done with this feature — I'll offer to discard it" | The PR route is the only one offered. Discard happens only when your human partner asks for it in so many words. |`,
      ifMissing: 'two rationalizations still mention the menu',
    },
  ],
}
