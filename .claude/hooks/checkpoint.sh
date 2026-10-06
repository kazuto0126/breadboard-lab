#!/bin/bash
# 每次回覆結束（Stop），或回覆因 API 錯誤 / 用量上限中斷（StopFailure）時執行：
# 把還沒提交的修改存成 WIP commit，並把還沒推送的 commit 推上 GitHub，容器被回收也不會遺失進度。
# 只在工作分支上動作；main、detached HEAD、合併或 rebase 進行中都不碰。永遠以 0 結束，不阻擋 Claude。
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
case "${branch}" in main | master | HEAD) exit 0 ;; esac
gitdir=$(git rev-parse --git-dir 2>/dev/null) || exit 0
if [ -e "${gitdir}/MERGE_HEAD" ] || [ -d "${gitdir}/rebase-merge" ] || [ -d "${gitdir}/rebase-apply" ]; then exit 0; fi

if [ -n "$(git status --porcelain)" ]; then
  git add -A >&2 &&
    git commit -q -m "wip: checkpoint $(date -u +%Y-%m-%dT%H:%MZ)" \
      -m "Automatic checkpoint from the Stop hook (.claude/hooks/checkpoint.sh) so unpushed work survives an interrupted session." >&2 ||
    exit 0
fi

if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 || [ -n "$(git rev-list '@{u}..HEAD' 2>/dev/null)" ]; then
  for delay in 0 2 4 8; do
    sleep "${delay}"
    git push -q -u origin "${branch}" >&2 2>&1 && break
  done
fi
exit 0
