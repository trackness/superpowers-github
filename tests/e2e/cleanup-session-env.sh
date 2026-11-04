#!/usr/bin/env bash
# Removes the empty ~/.claude/session-env/<session id> folder Claude Code leaves for each session, which no session may delete itself.
# rmdir removes only an empty folder: one that holds anything is kept, and rmdir says so.
set -u
if [ $# -eq 0 ]; then
  echo "usage: bash cleanup-session-env.sh <session id>..." >&2
  exit 2
fi
status=0
for id in "$@"; do
  # Only a session id (a UUID), so no argument can point rmdir outside session-env.
  if [[ ! $id =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo "not a session id, skipped: $id" >&2
    status=1
    continue
  fi
  rmdir -v "$HOME/.claude/session-env/$id" || status=1
done
exit "$status"
