import { IDEAS_REPO, TOOL_PREFIX as P } from '../config'
import type { Patch, PatchSet } from './engine'

const patches: Patch[] = [
  {
    id:'b-which-work',
    find:'- **Something non-trivial is missing.** Start the conversation.',
    replace:`- **Something non-trivial is missing.** Start the conversation.

**Which piece of work:** this applies only when something non-trivial is missing. A quick, clear task never calls \`${P}work_list\` and never touches GitHub. Otherwise, call \`${P}work_list\` with status \`Idea\` (it reads the current repo, or the ideas repo outside one), then ask which piece of work this is. That question is its own message, sent before the message "Your First Message" describes. It is exempt from that section's "That's the whole message" rule and from the "one question, no list" rule, because it is a choice among linked issues: list each issue as a link, with **a new piece of work** as the default choice. Once your human partner answers, the first message follows exactly as that section says. For an existing issue, read it with \`gh issue view <url> --json title,body,comments\` and take the body and every comment as the description so far; if the body is empty and there are no comments, ask your human partner to describe it. If your human partner then skips the questions, treat a chosen issue as a small change: one still in \`${IDEAS_REPO}\` is first moved with \`${P}idea_move\` to the repo it will be built in, then \`${P}status\` moves it to In Progress when building starts and to In Review when it's built. A new piece of work is created once its size is known (see the sizes below), or at once if your human partner asks to turn the discussion into a piece of work.`,
    ifMissing:"brainstorming never offers the board's existing ideas, and the work starts unlinked to its Idea issue",
  },
  {
    id:'b-size',
    find:'If it grows mid-task, stop, say so, and step up a size.',
    replace:`If it grows mid-task, stop, say so, and step up a size.

On GitHub the sizes mean this:

- **A quick task** stays in chat. Nothing goes on GitHub.
- **A small change**, once your human partner approves it in chat: ask which repo it will be built in (\`repo\` for \`${P}issue_create\`); an issue still in \`${IDEAS_REPO}\` is first moved there with \`${P}idea_move\`, and the steps below use the moved issue. Then, for an existing Idea issue, call \`${P}design_write\` with the agreed change; for a new piece of work, call \`${P}issue_create\` with status \`Designed\` and the change as its body. When building starts, \`${P}status\` moves the issue to In Progress, and to In Review when it's built. The PR's \`Closes #<parent>\` moves it to Done.
- **A project**, for a new piece of work: ask which repo it belongs in: the current repo, \`${IDEAS_REPO}\`, another existing repo, or a new repo. For a new repo, get its name and visibility from your human partner, then call \`${P}board_setup\` with \`create\` set to that visibility. Then call \`${P}issue_create\` with status \`Idea\` and the discussion so far as its body, and carry on. Creating the repo, its board and the parent issue is not building.`,
    ifMissing:'small changes and projects get no parent issue, and nothing reaches the board',
  },
  {
    id:'b-where',
    find:`**Where it goes:** in a software repo,
\`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md\`, committed.
Otherwise, ask. Your human partner's preferences override both.`,
    replace:`**Where it goes:** the parent issue. Call \`${P}design_write\` with the issue and the design: the design replaces the issue's body, the idea becomes an attached \`idea.md\` under the design, and the status moves to Designed. Later revisions go through \`${P}issue_edit\`. Nothing is written to disk. Hand the design over as the issue's link.`,
    ifMissing:'the design is written to docs/superpowers/specs/ on disk, and the issue keeps the bare idea',
  },
  {
    id:'b-builder',
    find:'**Builder check:** dispatch a fresh subagent with\n`builder-check-prompt.md` in this directory.',
    replace:'**Builder check:** dispatch a fresh subagent with\n`builder-check-prompt.md` in this directory. Fill `[DOCUMENT_PATH]` with the GitHub issue <url> (read it with `gh issue view <url>`).',
    ifMissing:"the builder check is pointed at a design file that doesn't exist",
  },
  {
    id:'b-companion',
    find:'If they accept, read `visual-companion.md` in this directory before\nstarting the server.',
    replace:`If they accept, read \`visual-companion.md\` in this directory before
starting the server.

Start the server as \`SUPERPOWERS_DISABLE_TELEMETRY=1 bash scripts/start-server.sh --open\`, without \`--project-dir\` whatever \`visual-companion.md\` says, so its files live in \`/tmp\`. Before stopping the server, if anything is worth keeping, call \`${P}attach\` with the parent issue, path set to the \`screen_dir\` value from start-server's output, and name \`visual-companion.zip\`.`,
    ifMissing:"the companion writes mockups into the repo's .superpowers/brainstorm/, loads the primeradiant.com logo, and nothing is attached to the issue",
  },
]

export const brainstorming: PatchSet = {
  skill: 'superpowers:brainstorming',
  patches,
}
