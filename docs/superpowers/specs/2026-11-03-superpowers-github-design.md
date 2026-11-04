# superpowers-github — design

A Claude Code mod that makes the superpowers workflow keep all of its work on GitHub: the idea, the design, the plan and every task live in GitHub issues on a per-repo GitHub Project board, and the issues move across that board as the work progresses. No idea, design, plan or task text is written to the local disk.

## Intent

James uses superpowers (brainstorming → writing-plans → subagent-driven-development → finishing-a-development-branch) and wants the work tracked in a system of record instead of local markdown files. GitHub was chosen over Linear because superpowers' artifacts map onto issues, sub-issues and boards with no third-party service, and because `gh` already works in the shell and inside subagents.

Success: starting from an idea, a whole piece of work runs through superpowers and every artifact and every state change is visible on GitHub, while the superpowers skills that don't need to change are untouched and unaware.

## Goals

- The idea, the design, the plan and the tasks live only on GitHub.
- Each task is a sub-issue; dependencies from the plan become blocked-by links.
- Board columns move automatically: Claude moves them up to In Review; merging the PR moves everything to Done.
- A board per repo. An idea with no repo yet is an issue in a private ideas repo, whose board is the **Ideas** board.
- Plans always run with subagent-driven-development.
- Only the superpowers skills that must change are changed, and only at load time; superpowers' files on disk are never edited.

## Non-goals

- Linear.
- Projects that span more than one repo.
- executing-plans (inline plan execution).
- Any awareness of multiple GitHub identities. The mod uses whatever `gh` is signed in as.

## Anti-goals (failure even if it technically works)

- A local plan, spec or task file written anywhere, including a copy of a task's text. The only local files are: subagent-driven-development's run folder (implementer reports, progress log, review diffs) in `.superpowers/sdd/<parent issue number>/`, gitignored and deleted when the final review is clean, exactly as superpowers does natively (`subagent-driven-development/SKILL.md:119`); and temporary files in `/tmp` (the visual companion's session folder and the files the attach tool builds to upload).
- The mod implementing uploads itself. Every attachment goes through `gh image`.
- A superpowers skill running half-patched after an upgrade, silently.
- Two things moving the same issue between columns.
- A board whose workflows differ from the required settings, used without warning.
- Forking superpowers or copying its skills.

## Where everything lives

| superpowers artifact | On GitHub |
|---|---|
| A piece of work | One **parent issue** in the repo, on the repo's board. Before a repo exists: an issue in the private **ideas repo**, on its board (the Ideas board). |
| The idea | The parent's body, written by James or, when James says so, by Claude from the conversation. |
| The design (brainstorming's output) | **Replaces** the parent's body. The idea it evicts becomes `idea.md`, uploaded by the attach tool and attached in the parent's body, under the design. This applies to every idea → design change. |
| Visual companion output worth keeping | The session's screens and assets (`<session>/content/`), zipped, uploaded by the attach tool and attached in the parent's body. |
| The plan's non-task content | Appended to the parent's body under a `## Plan` heading: Goal, Architecture, Tech Stack, Global Constraints, Review Focus. The plan's `Spec:` line is dropped (the design is in the same body). |
| Each plan task | A **sub-issue** of the parent, titled `Task N: <name>`, whose body is the task's full text (Files, Interfaces, steps). |
| Dependencies | Blocked-by links between sub-issues, derived from each task's `Interfaces → Consumes` (and from Files: a task modifying a file an earlier task creates). |
| Everything that happens during a run | Not on GitHub, and never as comments. Implementer reports, review verdicts, fix rounds, completion lines and the progress log stay where superpowers keeps them natively, in the run folder (`.superpowers/sdd/<parent issue number>/`), deleted when the final review is clean (`subagent-driven-development/SKILL.md:119`). |

### Plan defects are fixed in the plan, not ruled around

Contradictions between tasks, tasks that contradict the Global Constraints, and steps the review would flag as defects (the three things subagent-driven-development's pre-start check looks for, `subagent-driven-development/SKILL.md:165–167`) all originate in the plan, so they are fixed in the plan:

- **Before approval:** writing-plans runs that same check after its own self-review and fixes what it finds in the plan itself (editing the affected sub-issues, and adding blocked-by links where the fix is about order). The "should we start?" message lists every fix it made.
- **Before Task 1 and during the run:** when subagent-driven-development finds a plan defect (its pre-start check, a reviewer finding that conflicts with the plan, a defect found at the fix-round cap, or an implementer reporting the plan is wrong, `SKILL.md:300`, `:366–371`, `:420–423`), Claude fixes the plan itself and keeps going: it edits the sub-issues of the tasks not yet done (GitHub's edit history keeps the original text) and the blocked-by links where order is the fix. This replaces native ruling-and-carrying-on for plan defects; the "rulings, not stalls" principle (`SKILL.md:19–25`) still holds, in that the run never stops to wait.
- **Clearly communicated, every time:** the moment Claude edits a task, it says so in the session in one line: which issue (linked), what changed and why. The PR description carries a **Plan changes made during the run** section listing every such edit, each with a link to the issue, what changed and why, in the order made. That section replaces the native "Rulings I made" final message (`SKILL.md:473–480`), and also lists any non-plan rulings Claude made.

### Size limit

GitHub caps an issue body at 65,536 characters. Measured against the real plans in superpowers 7.0.0's own docs: whole plans run 48–77k characters (too big for one body), the largest single task is 33,308 characters, a plan header about 4,500, designs 10–27k. One task per sub-issue therefore fits. Every body stays under the limit: writing-plans is told that one task's text must fit in one issue, and before creating each sub-issue the mod checks the length and refuses one that is too long, so writing-plans rewrites that task to fit. Nothing is split automatically and nothing is ever truncated.

## Board

### Columns (the Status field)

Idea → Designed → Todo → In Progress → In Review → Done

| Status | Parent is here when | Task is here when | Who moves it |
|---|---|---|---|
| **Idea** | Its body is only the idea | never | Claude, on creation |
| **Designed** | brainstorming has written the design; writing-plans hasn't run | never | Claude |
| **Todo** | derived from its tasks (below) | writing-plans created it | Claude |
| **In Progress** | derived | its task went to an implementer subagent | the mod's status tool |
| **In Review** | derived | the reviewer subagent approved it | the mod's status tool |
| **Done** | derived | the PR merged (closed by `Closes #…`) | GitHub's "Item closed" workflow |

The parent's column, from Todo onward, is derived from its tasks and recomputed every time a task moves:

- all tasks Todo → Todo
- any task In Progress → In Progress
- some tasks still Todo and some past it (the moment between two tasks) → the parent remains In Progress
- every task In Review or Done, at least one In Review → In Review
- all tasks Done → Done

### Board workflows

GitHub's API can read a board's built-in workflows (name and whether each is on) and delete them, but cannot create, switch on or switch off a workflow (only `deleteProjectV2Workflow` exists), and cannot show what a workflow does when it fires. Checked 2026-11-03 on throwaway boards: a fresh board from `gh project create` has all six built-in workflows on, with "Item closed" setting Status = Done; a deleted workflow stays deleted; a copied board kept its Status options and deletions but turned off the workflows it kept. So boards are built, not copied, and every board's workflows are read back rather than trusted.

Required workflow settings on every board:

| Workflow | Setting |
|---|---|
| Item closed | **On**, sets Status = Done |
| Auto-close issue | **On** (Status set to Done closes the issue) |
| Item added to project | Off (deleted) |
| Pull request linked to issue | Off (deleted) |
| Pull request merged | Off, deleted (PRs are not board items) |
| Auto-add sub-issues to project | Off (deleted) |

### How a board is built

Every board is built through the API, and there is no template board (James's decision, 2026-11-03). A board has:

- Status options exactly: Idea, Designed, Todo, In Progress, In Review, Done. They are set with `updateProjectV2Field` and `singleSelectOptions`, keeping the existing IDs of Todo, In Progress and Done. Set without those IDs, "Item closed" has no Done to set (checked 2026-11-03: a closed issue got no Status).
- A board-layout view (`createProjectV2View` with `layout: BOARD_LAYOUT`). Its columns are the Status field by default (GitHub docs, *Customizing the board layout*); the API cannot set a view's column field (`ProjectV2ViewConfigurationInput` takes only `visibleFieldIds`), and doesn't need to.
- The workflow settings above. The four that must be off are deleted with `deleteProjectV2Workflow`; "Item closed" and "Auto-close issue" stay on, as a fresh board has them. Checked end to end 2026-11-03 on a board built this way: closing an issue moved it to Done, and setting an issue's Status to Done closed it.

No step needs the GitHub UI.

### Per-repo board setup

A repo's board is the board linked to the repo whose title is exactly the repo's name (James's call); any other boards linked to it are ignored. The first time the workflow needs a repo's board and the repo has none:

1. Claude asks once.
2. Builds the board as above, titled with the repo's name (`gh project create --owner <owner> --title <repo> --format json`), then reads its Status options back and refuses to continue unless they are exactly the six above.
3. Links it to the repo with the owner's login (`gh project link <n> --owner trackness --repo <repo>`; `--owner @me` is refused for a repo), so it can be found later by asking the repo (`repository.projectsV2`, checked against the live API).
4. Sets the repo's merge settings: `gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge --squash-merge-commit-message pr-title`.
5. Reads the new board's workflows back and refuses to continue if any is on or off differently from the table, saying exactly what differs and how to fix it. What each workflow does when it fires is GitHub's default, checked end to end as above.

The ideas repo is `trackness/ideas`, a private repo owned by James's account; it must stay private. Its board, set up like any other repo's, is the Ideas board. The ideas repo and its board are created as part of building this mod; nothing is created lazily on first need.

### Checking the workflows on real items

No test items are ever created: an issue number can't be reused, so a throwaway issue costs a number for good. Instead, the mod checks the workflows as real items flow through. Whenever the status tool reads a piece of work, it checks that every closed task and parent is in Done; if one isn't, "Item closed" isn't doing its job, and the mod says so, naming the board and the fix.

## The flow

1. **Start.** Brainstorming keeps its own sizing (`brainstorming/SKILL.md:134–138`), and each size maps to GitHub differently:
   - **Quick task:** agreed in chat; nothing on GitHub.
   - **Small change:** one parent issue with no children; its body is the change as agreed in chat. It is created in **Designed** (agreed in chat, it is effectively designed); Claude moves it to **In Progress** when building starts and **In Review** when the build is done; the PR's `Closes #<parent>` moves it to **Done**. The PR gate is "the parent is In Review".
   - **Project:** the rest of this flow.

   For a small change or a project, Claude always asks which piece of work it is: it lists the un-brainstormed ideas (open issues in **Idea**) of the current repo, or of the ideas repo when outside a repo, each as a link to its issue, and the default choice is always **a new piece of work**. When writing-plans starts on its own, it offers the same kind of linked list, of issues in **Designed**.
2. **A new piece of work.** If James picks it, or tells Claude to turn a discussion into a piece of work, Claude creates the parent issue in whichever repo James chooses: the current repo, the ideas repo, another existing repo of his, or a new repo, which Claude creates with the name and visibility James gives and then sets up its board. The parent goes on that repo's board, status **Idea**, with James's description or the discussion so far as the body, then brainstorming carries on.
3. **Brainstorming.** Reads the parent's body as the idea (or asks James to describe it if empty). Ends by replacing the body with the design; status **Designed**. Works the same in the ideas repo: designs can be written before the destination repo exists.
4. **Moving an idea to its destination repo.** The destination is an existing repo of James's or a new one Claude creates when asked (name and visibility from James, board set up); it may be private or public:
   - **Private destination:** `gh issue transfer`. GitHub keeps the issue's comments and assignees, and allows it because both repos have the same owner. Claude then makes sure the issue is on the destination's board in the same Status, and that its attachments, sub-issues and links survived; GitHub's docs don't say what a transfer does to board membership or sub-issues, so this is checked on every transfer, not assumed.
   - **Public destination:** GitHub won't transfer a private issue to a public repo, so the issue is recreated: a new issue in the destination with the same title and body, on its board in the same Status; every attachment downloaded from the ideas repo and uploaded again against the destination by the attach tool (old attachment URLs are never referenced from the public repo); comments copied in order (posted now, by James's account); then the ideas-repo issue is closed with a link to the new one. Links only ever go from the private repo to the public one. Downloading an attachment uses `gh image download --output <file> <url>`, which fetched the 2026-11-03 kidcough uploads (a zip, an image, an `.md`) intact. `gh api` downloads them too, with the `gh` token, but the mod reads a child's output only as text, which would corrupt a binary file. Without credentials the same URL returns 404.
5. **Writing the plan** (needs a repo). Appends the plan's non-task content to the parent's body under `## Plan`, then creates one sub-issue per task with its full text, in plan order, each with its blockers, on the repo's board, in **Todo**: `gh issue create --parent <n> --blocked-by <a,b> --project "<repo>" --title "Task N: …" --body …`. Blockers always exist first because a task only consumes from earlier tasks. James reviews the plan on GitHub. Its last step asks **"should we start?"** instead of offering a choice of execution method.
6. **Running.** subagent-driven-development, per task in plan order:
   - just before dispatching the implementer: task → **In Progress**;
   - the implementer reads its sub-issue and the parent's Global Constraints directly with `gh issue view` (no local copy of the task's text), and writes its report to its report file in the run folder, as natively;
   - the reviewer reads the same sub-issue, the report file and the review diff file, which the mod's review-package tool writes into the run folder with the same two range checks as the native script (HEAD descends from BASE; range not empty);
   - when the reviewer approves: the completion line goes in the run folder's progress log, as natively, and the task → **In Review**.
7. **Finishing.** subagent-driven-development only reaches finishing-a-development-branch after its last task and the final whole-branch review (`subagent-driven-development/SKILL.md:115–120`). The mod still checks rather than trusts that: before any PR is opened, every task sub-issue must be in In Review (or Done, when James closed it during the run); if any isn't, no PR is opened and Claude names the unfinished tasks. finishing-a-development-branch offers only the PR route: push, open a PR whose description says `Closes #<parent>` and `Closes #<task>` for every task and carries the "Plan changes made during the run" section, merge by squash only, remote branch deleted. Before handing the PR over for merging, the mod reads the PR's `closingIssuesReferences` (GraphQL: "list of issues that may be closed by this pull request"; checked returning real links on `kidcough` PRs) and confirms it is exactly the parent plus every task issue. If any is missing, the PR description is corrected and the check repeated; the PR is not handed over until the set matches. James merges (or asks Claude to).
8. **Done.** Merging closes every issue the check confirmed; "Item closed" moves them to **Done**.

### Recovery after compaction

As natively: the run folder's progress log and `git log` are the recovery map (`subagent-driven-development/SKILL.md:150–152`). The only change is that the folder is named after the parent issue number instead of the plan file.

## The mod

A Claude Code mod: a plugin whose hooks module uses the `skill.prompt` hook to rewrite superpowers' skill text as it is expanded for the model (typed as `/name`, run by the Skill tool, or preloaded into a subagent). superpowers' files on disk are never edited.

### What each patched skill becomes

| Skill | Change |
|---|---|
| **brainstorming** | Added instructions (brainstorming already defers to the user's preferences on where output goes, `SKILL.md:158`): brainstorming's own sizing kept (quick task: chat only; small change: one parent issue, no children; project: parent plus design); for a small change or project, start from the parent (ask which, listing the repo's issues in Idea as links, with a new piece of work as the default choice, which Claude then creates in the current repo, the ideas repo, another existing repo or a new repo, as James chooses); the idea is its body; the design replaces the body and the idea is uploaded as `idea.md` and attached in the body, under the design; status → Designed. The builder-check subagent's `[DOCUMENT_PATH]` (`builder-check-prompt.md:12`) is filled with the parent issue and told to read it with `gh issue view`. The visual companion is offered exactly as brainstorming offers it natively; once James accepts, its server starts without `--project-dir` so its files live in `/tmp`. The mod tells Claude where a session's files are (`screen_dir` and `state_dir` in `$STATE_DIR/server-info`; screens and assets in `<session>/content/`) so anything worth keeping can be zipped and attached in the parent's body before the server stops. The server is started with `SUPERPOWERS_DISABLE_TELEMETRY=1`, which stops each screen loading a logo from `primeradiant.com`; it changes nothing else (only `server.cjs` reads it, for the page header; superpowers' own test `branding.test.js:293` confirms local branding stays), and its only effect beyond that is that superpowers' authors don't count this install. |
| **writing-plans** | When started on its own: ask which parent, listing the repo's issues in Designed as links; plan location → parent body (`## Plan`) plus sub-issues; every task's text kept under the issue-body limit (the mod refuses an oversized sub-issue and writing-plans rewrites that task to fit); after its self-review, the pre-start conflict check runs and its findings are fixed in the plan; the header line naming executing-plans goes; the Execution Handoff becomes "should we start?", listing any fixes the check made. |
| **subagent-driven-development** | Plan read from the parent and sub-issues; the run folder kept as natively but named after the parent issue number, so `sdd-workspace` and `review-package` (which both refuse to run without a plan file) are replaced by mod tools that do the same keyed by the parent; `task-brief` removed, and the templates' `[BRIEF_FILE]` placeholder is filled with "read sub-issue #N and the parent's Global Constraints with `gh issue view`" so no copy of the task's text is written; `[REPORT_FILE]` and `[DIFF_FILE]` stay files in the run folder, so the upstream prompt templates are unchanged; In Progress and In Review moves added; plan defects found before Task 1 or during the run are fixed by editing the not-yet-done sub-issues (and blocked-by links), each edit announced in the session, instead of ruled around; the final "Rulings I made" message becomes the PR's "Plan changes made during the run" section; the When-to-Use branch to executing-plans removed. |
| **executing-plans** | Text replaced: not used here; use subagent-driven-development. |
| **finishing-a-development-branch** | No PR unless every task sub-issue is In Review or Done; only the PR route; PR description lists `Closes #…` for the parent and every task; the PR's `closingIssuesReferences` is checked to be exactly that set before it's handed over; the PR description carries the "Plan changes made during the run" section; squash merge; branch deleted. |

Every other superpowers skill is untouched.

### Tools the mod provides

No shell scripts. Every operation is a tool the mod registers (`$.tool.register`, listed as `mcp__superpowers-github__<name>`), written in TypeScript in the mod's hooks module and served by its `tool.call` hook. Each tool runs `gh` through `$.process.spawn` (GraphQL through `gh api graphql` where `gh` has no command, and attachments through the gh-image extension's `gh image`). Reasons: one language for the whole mod; Claude and subagents make one tool call instead of running a script that hides several commands (James's CLAUDE.md forbids those); logic is tested with `claude plugin test`; no `jq` dependency.

- **status**: set a task's Status, then recompute and set its parent's.
- **board setup**: the per-repo setup steps above, including the workflow check.
- **idea move**: move an idea from the ideas repo to its destination (transfer for a private destination, recreate for a public one), with the checks above.
- **run folder**: resolve and create the run folder `.superpowers/sdd/<parent issue number>/` (self-ignoring, as the native script makes it), in place of `sdd-workspace`.
- **review package**: write the commit list, stat summary and full diff for a commit range into the run folder, refusing a range that is empty or not rooted at BASE, in place of `review-package`.
- **attach**: upload a file as a GitHub attachment with `gh image` and put the reference it prints in an issue's body (details below).

Writes use `gh` commands (by name, no stored IDs); wide reads use GraphQL. Reading an issue needs no tool of the mod's: implementers and reviewers use `gh issue view` directly.

### The attach tool

The attach tool uploads a file as a GitHub attachment and puts its reference in an issue's body. It never handles credentials. It runs the gh-image extension (`gh image <file> --repo <owner>/<repo>`; `drogers0/gh-image`, MIT-licensed, pinned to `v1.4.1`) and inserts the Markdown reference gh-image prints into the body: `![name](https://github.com/user-attachments/assets/<uuid>)` for an image, `[name](https://github.com/user-attachments/files/<id>/<name>)` for any other file. Every attachment goes this one way, images included.

**Why gh-image rather than the mod's own code.** GitHub documents attaching only through the browser. Tested 2026-11-03 against `trackness/kidcough`:

- `gh --attach` refuses anything but png, jpg, jpeg, gif, webp, svg, mp4, mov, webm, checked on gh's side before uploading.
- The endpoint `gh` uses (`POST https://uploads.github.com/user-attachments/assets?name=…&content_type=…&repository_id=…`, found in `cli/cli` `internal/attachments/client.go`) accepted a PNG and rejected `application/zip`, `application/x-zip-compressed`, `text/markdown` and `text/html` with HTTP 422, "content_type is not included in the list of allowed content types".
- gh-image takes every file type GitHub accepts, so the mod calls it rather than implementing uploads itself.

**What gh-image does** (its README): for an image or video on a repo the `gh` token can push to, a single upload to the endpoint above with the `gh` token; for everything else, the same upload the GitHub web page performs. gh-image handles the browser session itself.

**Proven on this machine**, 2026-11-03, gh-image `v1.4.1`, against `trackness/kidcough`:

- A zip and an `.md` in one call: gh-image printed "fast upload unavailable (HTTP 422); using browser session", then `[session.zip](https://github.com/user-attachments/files/34326062/session.zip)` and `[idea.md](https://github.com/user-attachments/files/34326065/idea.md)`. The zip downloaded back with `gh api` is byte-identical to the original (`cmp`); the `.md` downloaded back with its text intact; the zip's URL returns 404 without credentials.
- A PNG: uploaded by the fast `gh`-token route (no fallback note), printing `![issue.png](https://github.com/user-attachments/assets/fa454a08-9bf1-4aaf-8764-da526a0e258c)`.
- `gh image check-token` confirmed the browser session it uses belongs to `trackness`.
- It ran inside Claude Code's normal sandbox, and auto mode raised no objection to it.
- macOS Full Disk Access for Ghostty (the terminal running Claude Code) is in place, granted 2026-11-03; gh-image's browser route depends on it.

**Rules:**

- The tool calls `gh image` with only the file path and `--repo <owner>/<repo>`.
- Before any upload, the tool checks gh-image is installed at the pinned version (`gh extension list` shows `drogers0/gh-image` at `v1.4.1`). If not, it stops and gives James the install command.
- gh-image's browser route is an undocumented GitHub flow. Any non-zero exit, or output without a reference, stops the tool with gh-image's own output and the file being uploaded; nothing is retried silently.
- Downloading an attachment (needed when an idea is recreated in a public repo) uses `gh image download --output <file> <url>`, which writes the file itself. The mod's API hands a child's output back as text, so a binary file fetched through `gh api` stdout would be corrupted. Proven 2026-11-03 on the kidcough uploads.
- Uploads can't be deleted (GitHub documents no way). An upload that is never referenced resolves only for the uploader, per gh-image's README.

**Verifying the installed gh-image.** `gh` re-signs an extension's binary when installing it on macOS: the installed binary's signature identifier is `gh-image-<hash>` (ad-hoc), where the release asset's is `a.out` (linker-signed). So the installed file has no attestation of its own (`gh attestation verify` on it returns 404). It is verified in three steps:

1. Download the release's macOS asset (`gh release download v1.4.1 -R drogers0/gh-image -p darwin-arm64`).
2. `gh attestation verify <asset> --repo drogers0/gh-image` must pass, showing it was built by `.github/workflows/release.yml` at `refs/tags/v1.4.1` (2026-11-03: Actions run 40590566262). `--owner drogers0` doesn't work, because `drogers0` is a user account, not an organization (the API answers 404 on `/orgs/drogers0/...`).
3. Strip the signature from copies of both files (`codesign --remove-signature`) and compare them. On 2026-11-03 they were the same size (7,999,840 bytes) and differed in only 2 bytes of the Mach-O header (offsets 1553–1554).

Upgrading gh-image is a deliberate act: pin the new tag, repeat the verification, and repeat the live upload proof before relying on it.

### Upgrade guard

Every rewrite matches exact text in superpowers 7.0.0. When any expected text is missing (superpowers changed), the mod blocks the skill and tells James:

- which skill and which patch failed;
- the text it expected and what is there now;
- the superpowers version;
- a defined remediation plan (update the patch, run the patch tests against the new text, reload) and an offer to carry it out;
- an offer to work around the mismatch instead, with an informed estimate of what goes wrong if it does (for example: "the In Progress patch didn't apply; tasks stay in Todo until the PR merges").

### Layout and install

- Lives at `~/workspace/claude-code/plugins/superpowers-github/`, its own git repo.
- The repo is its own one-plugin marketplace (`.claude-plugin/marketplace.json` beside `plugin.json`, entry source `./`), installed locally from the folder, so edits take effect with `/reload-plugins`.
- Files: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `hooks/register.ts` (hooks and tools, TypeScript), `*.test.ts`.
- External dependencies: the `gh` CLI (2.102.0 installed) and the gh-image extension, pinned to `v1.4.1` (`gh extension install drogers0/gh-image --pin v1.4.1`). `gh extension install` supports `--pin` for a release tag.
- Marketplaces that list it for installs elsewhere live under `~/workspace/claude-code/marketplaces/` and reference it by its GitHub repo (a relative path may not contain `..`).
- This design document moves into the repo when it is created.

## Constraints and verified facts

- `gh issue create` supports `--parent`, `--blocked-by`, `--project` (installed gh).
- `gh project item-edit <n> --owner <o> --url <issue> --field Status --value "<option>"`.
- `gh project create` (`--owner`, `--title`), `link` (`--owner <login>`), `item-add` and `item-edit` exist. Outside a terminal, `create` prints the project only with `--format json` (gh's source, checked 2026-11-03).
- `gh issue transfer <issue> <destination-repo>` exists. GitHub's docs: a transfer keeps comments and assignees, keeps labels and milestones only where the target has matching ones, works only between repos with the same owner, and can't move a private issue to a public repo. They say nothing about board membership or sub-issues, so both must be checked on the first real transfer.
- An issue exposes `subIssues`, `parent`, `blockedBy`, `blocking` and `projectItems` in GraphQL, which is everything the status tool reads.
- GraphQL mutations exist: `copyProjectV2`, `linkProjectV2ToRepository`, `updateProjectV2Field`, `createProjectV2View`; `deleteProjectV2Workflow` deletes a workflow, and none creates, switches on or switches off one.
- Issue dependencies are generally available (August 2025), up to 50 per relationship type.
- The signed-in `gh` token has the `project` scope.
- A plugin's skill reaches `skill.prompt` as `<plugin>:<skill>`, so the matchers are `superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:subagent-driven-development`, `superpowers:executing-plans` and `superpowers:finishing-a-development-branch`. Evidence: the published `jev-skill-suggestion` mod (davila7/claude-code-templates) matches its own plugin skill with `on('skill.prompt', { skill: 'jev-skill-suggestion:setup' }, …)`. The mod API's types don't state the format; their only example is a built-in (`{ skill: "commit" }`). Verified live 2026-11-03: a headless session with a probe mod received `superpowers:executing-plans`, and its text was the `SKILL.md` without its frontmatter, after a `Base directory for this skill:` line.
- gh-image's own facts, from its README: it uploads any file type GitHub accepts; images and video on a repo the `gh` token can push to go by the `gh` token, everything else by the browser's logged-in session, which gh-image handles itself; uploads are attributed to whichever account authenticated them, so the browser session and the `gh` login could in principle be different accounts (on this machine both are `trackness`, checked 2026-11-03 with `gh image check-token`).
- Mod API: `skill.prompt` fires for `/name`, the Skill tool and subagent preloads; `tool.call` carries `agentId` inside subagents; `$.tool.call` accepts MCP tools; `$.tool.register` adds tools.

## Required outcomes

The plan must deliver every one of these; none is assumed to exist already:

1. `~/workspace/claude-code/plugins/superpowers-github/` is a git repo, with this design document committed in it.
2. The mod's files (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `hooks/hooks.json`, `hooks/register.ts`, tests) exist and pass `claude plugin validate` and `claude plugin test`.
3. The mod is installed locally from its folder (`claude plugin marketplace add` on the folder, then install), so edits take effect with `/reload-plugins`.
4. Board setup builds a repo's board through the API with the six Status options, a board-layout view and the required workflow settings, confirmed by reading them back.
5. `trackness/ideas` exists, private, with its board built that way and linked to it.
6. Every patch, tool and guard in this document is implemented and covered by tests that feed the real superpowers 7.0.0 skill text. The attach tool's tests fake `gh image` (no real session in tests); its one live check is an upload of a zip, an `.md` and an image to `trackness/kidcough`, the approved testbed, each downloaded back and compared.
7. gh-image is installed pinned to `v1.4.1` and verified as described under "Verifying the installed gh-image". On 2026-11-03 it was installed unpinned (`ispinned: false` in its manifest), so it must be reinstalled pinned. Installing a third-party binary is blocked by auto mode ("Code from External"), so James runs the install himself.

Already in place, not to be redone: macOS Full Disk Access for Ghostty (granted 2026-11-03), which gh-image's browser route depends on.

## Left to the builder

- The wording of every rewrite, provided each replaces exact upstream text and is covered by a test feeding the real 7.0.0 skill text.
- Tool names and input schemas.
- The GraphQL query shapes.
