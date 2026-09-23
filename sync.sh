#!/usr/bin/env bash
# 클라우드에서 온 것을 PC 로 받는다
#
# 클라우드 세션은 GitHub 에만 닿을 수 있으므로, 다리는 git 하나뿐이다.
# 저쪽은 cloud/* 브랜치로 push 하고, 이쪽에서 이걸로 받는다.
#
#   ./sync.sh              뭐가 와 있는지 본다
#   ./sync.sh <브랜치>      그 브랜치를 main 에 합친다
#
# 합치기는 --no-ff 로 한다. 클라우드에서 한 일이 한 덩어리로 남아야
# 나중에 "이건 밖에서 한 것" 을 되짚을 수 있다.

set -e
cd "$(dirname "$0")"

git fetch --all --prune

if [ -z "$1" ]; then
  echo
  echo "원격 브랜치 (최근 순)"
  echo "────────────────────────────────────────────────────────────"
  git for-each-ref --sort=-committerdate refs/remotes/origin \
    --format='  %(refname:short)  %(committerdate:relative)  %(contents:subject)' \
    | head -12
  echo
  echo "지금 가지: $(git rev-parse --abbrev-ref HEAD)"
  git status --short
  echo
  echo "합치려면:  ./sync.sh cloud/<이름>"
  exit 0
fi

BRANCH="$1"
BRANCH="${BRANCH#origin/}"

if ! git rev-parse --verify "origin/$BRANCH" >/dev/null 2>&1; then
  echo "origin/$BRANCH 가 없다. ./sync.sh 로 목록을 먼저 본다."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "작업 중인 변경이 있다. 커밋하거나 치워두고 다시 한다."
  git status --short
  exit 1
fi

echo
echo "합칠 것 — origin/$BRANCH"
git log --oneline "main..origin/$BRANCH" | head -20
echo

git checkout main
git merge --no-ff "origin/$BRANCH" -m "merge: 클라우드에서 한 $BRANCH 를 합친다"

echo
echo "합쳤다. 아래를 돌려보고 이상 없으면 push 한다."
echo "  cd mark3-mobile && npx tsc --noEmit && npm run sim:eval"
