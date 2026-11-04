# superpowers-github

A Claude Code mod that patches five superpowers 7.0.0 skills (brainstorming, writing-plans, subagent-driven-development, executing-plans, finishing-a-development-branch) as they load, and serves `gh`-backed tools, so the idea, design, plan and tasks of every piece of work live in GitHub issues on a per-repo board that moves as the work moves.

## Requirements

- gh 2.102.0 or later, with the `project` scope.
- The gh-image extension, pinned to v1.4.1: `gh extension remove gh-image` (if any version is installed: a second install says "already installed" and never applies `--pin`), then `gh extension install drogers0/gh-image --pin v1.4.1`.
- A browser signed in to GitHub as the same account as gh (`gh image check-token` prints the account it finds), and macOS Full Disk Access for the terminal running Claude Code: gh-image uses that browser's session for every upload other than an image or video, and for downloads.
- superpowers 7.0.0, from the `claude-plugins-official` marketplace: every patch replaces its exact text.
- `trackness/ideas`, set up once with the mod's tool `board_setup { repo: "trackness/ideas", create: "private" }` (leave out `create` if the repo exists). Until it is, `work_list` outside a repo fails.

## Install

At the prompt of a terminal session:

```
/plugin install superpowers-github --marketplace trackness/superpowers-github
```

No permission allow rule is needed: when no settings rule decides a call of one of the mod's eleven tools, the mod allows it itself. A deny or ask rule you write for `mcp__superpowers-github__<name>` still stands, as do an organization's ceiling and another mod's ask; in plan mode every call of the mod's tools is put to you.

## Develop

- Start a session that runs the mod from your clone: from inside it, `claude --plugin-dir .`; from anywhere else, give the clone's path, for example `claude --plugin-dir ~/src/superpowers-github`. It overrides an installed copy for that session only, and reloads the mod when a file is saved.
- That session also writes this Claude Code version's types into `.claude-plugin/types/` (which keeps itself out of git), and `tsconfig.json` extends them. Until a session like that has loaded the mod once, the folder doesn't exist, and your editor and `tsc` report `TS2307: Cannot find module 'claude-code'` on every file. Each later session rewrites the types for the version it runs.
- Once a change is merged, `claude plugin update superpowers-github@superpowers-github` brings it to the installed copy; restart Claude Code to apply it.

## When the upgrade guard blocks a skill

Every patch replaces exact superpowers 7.0.0 text. When an anchor is missing, or appears more times than its patch expects, the whole skill is blocked: the block shows what each failed patch expected and what is there now. It also offers a workaround, following the skill with only the patches that applied, and says what each failed patch would break; the skill runs that way only if you choose it. (When every anchor still matches under another version, the skill runs patched, under one line naming both versions.)

To fix the mod, follow the block's own steps:

1. In a session started with `claude --plugin-dir .` from inside your clone, run `node tests/fixtures/make-fixture.mjs <superpowers root>` from the clone (the installed superpowers folder, which the block names) to generate the new version's fixture.
2. Point the patch tests at the new fixture, and set `PATCHED_FOR` in `hooks/config.ts` to the new version.
3. Update each failed patch until `claude plugin test <path to this repo>` passes.
4. Run `/reload-plugins`.

## Tests

`claude plugin test <path to this repo>` runs the suite with every command faked; it does not type-check, so run `tsc -p <path to this repo>` too. The fixture test checks only the version, the five skill names and three known passages. To check that the fixture is still superpowers 7.0.0's text verbatim, regenerate it from the 7.0.0 root, then diff:

- `node <path to this repo>/tests/fixtures/make-fixture.mjs ~/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0`
- `git -C <path to this repo> diff --exit-code tests/fixtures`

## License

MIT, © 2026 trackness; see [LICENSE](LICENSE). superpowers' text quoted in `hooks/patches/` and copied in `tests/fixtures/` stays under its own MIT notice, © Jesse Vincent; see [tests/fixtures/LICENSE-superpowers](tests/fixtures/LICENSE-superpowers).
