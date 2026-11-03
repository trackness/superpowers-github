# superpowers-github

A Claude Code mod that patches five superpowers 7.0.0 skills (brainstorming, writing-plans, subagent-driven-development, executing-plans, finishing-a-development-branch) as they load, and serves `gh`-backed tools, so the idea, design, plan and tasks of every piece of work live in GitHub issues on a per-repo board that moves as the work moves.

## Requirements

- gh 2.102.0 or later, with the `project` scope.
- The gh-image extension, pinned to v1.4.1: `gh extension install drogers0/gh-image --pin v1.4.1`.

## Install locally

- `claude plugin marketplace add <path to this repository>`
- `claude plugin install superpowers-github@superpowers-github`
- Run `/reload-plugins` after editing the mod.

## When the upgrade guard blocks a skill

Every patch replaces exact superpowers 7.0.0 text. If superpowers has changed and an anchor is missing, the whole skill is blocked rather than run half-patched. Re-check the patch anchors against the installed superpowers version, update the mod, then run `/reload-plugins`.

## License

superpowers' text under `tests/fixtures/` is MIT, © Jesse Vincent; see `tests/fixtures/LICENSE-superpowers`.
