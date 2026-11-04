import { TOOL_PREFIX as P } from '../config.ts'
import type { PatchSet } from './engine.ts'

export const writingPlans: PatchSet = {
  skill: 'superpowers:writing-plans',
  patches: [
    {
      id: 'w-location',
      find: '**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`\n- (User preferences for plan location override this default)',
      replace: `**Where the plan goes:** the parent issue, plus one sub-issue per task. Never write a plan file.

- **Which parent:** when this skill starts on its own, first call \`${P}work_list\` with status \`Designed\` and ask James which parent issue the plan is for, listing each as a link.
- **A repo is needed:** when the parent issue is still in \`trackness/ideas\`, first ask James which repo it belongs in: an existing repo, or a new one made with \`${P}board_setup\` and \`create\`. Then call \`${P}idea_move\` with the issue and that repo, and write the plan on the moved issue.
- **The non-task content** (Goal, Architecture, Tech Stack, Global Constraints, Review Focus) goes into the parent's body under \`## Plan\`, through \`${P}issue_edit\`. Its \`body\` replaces the whole body, so read the current body with \`gh issue view <url>\` and pass it back with the \`## Plan\` section appended — never only the plan, which would replace the design. There is no title line, no agentic-workers line and no Spec line, because the design is in the same body.
- **Each task** becomes a sub-issue through \`${P}issue_create\`, in plan order, with the parent, the title \`Task N: <name>\`, the task's full text as its body, and \`blockedBy\` listing the earlier tasks it consumes from (Interfaces → Consumes) or whose created files it modifies.
- **Size:** one task's text must fit one issue, 65,536 characters. When the tool refuses one, rewrite that task to fit; never split or truncate it.`,
      ifMissing: 'the plan is saved to docs/superpowers/plans/ on disk, and no sub-issues are created',
    },
    {
      id: 'w-agentic',
      find: '# [Feature Name] Implementation Plan\n\n> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.\n',
      replace: '',
      ifMissing: 'the plan header still opens with a title line and offers executing-plans',
    },
    {
      id: 'w-spec',
      find: "**Spec:** [path to the spec/design doc this plan implements — the plan\nargues from the spec, so the spec travels with it; executors read both]\n\n",
      replace: '',
      ifMissing: "the plan header asks for a spec path that doesn't exist on GitHub",
    },
    {
      id: 'w-check',
      find: 'If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.',
      replace: `If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

**6. Pre-start check:** run subagent-driven-development's pre-start check on the plan. It looks for tasks that contradict each other or the Global Constraints, and for anything the plan mandates that the review rubric treats as a defect (a test that asserts nothing, or verbatim duplication of a logic block). Fix each finding in the plan itself: \`${P}issue_edit\` on the affected sub-issues, with \`addBlockedBy\` or \`removeBlockedBy\` where the fix is about order. Keep a list of every fix: the issue link, what changed, and why.`,
      ifMissing: 'plan defects reach the run instead of being fixed before approval',
    },
    {
      id: 'w-handoff',
      find: `## Execution Handoff

After saving and self-reviewing the plan, link it for your human partner
to read. If they have already explicitly supplied an execution method, ask
them to review the plan and confirm it captures what they want; wait for that
review before implementation, then use the preserved method. Otherwise, ask
them to review the plan and choose an execution method before implementation.

**When no execution method has already been supplied:**

**"Plan complete and saved to \`docs/superpowers/plans/<filename>.md\`. Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend <one of the two>, because <one sentence from the plan: how much the tasks depend on each other's interfaces, how many there are, what a shipped mistake would cost>. Does the plan capture what you want, and which approach should we use?"**

**When an execution method has already been supplied:**

**"Plan complete and saved to \`docs/superpowers/plans/<filename>.md\`. Please review the plan. Does it capture what you want?"**

**If Subagent-driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development

**If Native chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans`,
      replace: `## Execution Handoff

Link the parent issue for James to review on GitHub. List every fix the pre-start check made (issue link, what changed, why), or say it found none. Then ask exactly:

**"should we start?"**

On yes:
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development, with the parent issue.`,
      ifMissing: 'the handoff offers inline execution, which this setup does not support, and points at a plan file',
    },
  ],
}
