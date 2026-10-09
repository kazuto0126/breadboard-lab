#!/bin/bash
# 開啟、恢復或壓縮對話時執行。stdout 會加進 Claude 的上下文，所以只印精簡的進度摘要；
# 安裝相依套件等雜訊一律導到 stderr。
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" || exit 0

# 雲端容器：裝好相依套件（容器狀態會被快取，所以用 npm install 而不是 npm ci），
# 並讓 e2e 使用預先安裝的 Chromium。
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  npm install --no-audit --no-fund >&2 || echo "⚠ npm install 失敗，請手動執行 npm install" >&2
  if [ -x /opt/pw-browsers/chromium ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
  fi
fi

git fetch --all --prune --quiet >&2 2>&1 || echo "⚠ git fetch 失敗，以下可能不是 GitHub 上的最新狀態" >&2

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
echo "## 專案進度（session 開始時自動從 GitHub 同步，$(date -u +%Y-%m-%dT%H:%MZ)）"
echo
echo "目前分支：${branch}"
if git rev-parse --verify --quiet "origin/${branch}" >/dev/null; then
  read -r behind ahead < <(git rev-list --left-right --count "origin/${branch}...HEAD")
  echo "相對 origin/${branch}：落後 ${behind}、領先 ${ahead} 個 commit$([ "${behind}" != 0 ] && echo '（先 git pull 再開始工作）')"
fi
dirty=$(git status --porcelain | wc -l | tr -d ' ')
[ "${dirty}" != 0 ] && echo "工作目錄有 ${dirty} 個未提交的修改"
echo
echo "### GitHub 上最近更新的分支"
git for-each-ref --sort=-committerdate --count=6 --format='- %(refname:lstrip=3)：%(committerdate:relative)，%(subject)' refs/remotes/origin | grep -v ': HEAD' || true
echo
if [ -f docs/PROGRESS.md ]; then
  echo "### docs/PROGRESS.md"
  cat docs/PROGRESS.md
else
  echo "（找不到 docs/PROGRESS.md）"
fi
exit 0
