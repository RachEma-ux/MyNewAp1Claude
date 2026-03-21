#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

REPO_URL="https://github.com/RachEma-ux/MyNewAp1Claude.git"
REPO_SLUG="RachEma-ux/MyNewAp1Claude"
BRANCH="work"
WORKFLOW_NAME="Builder Deploy"

echo "==> Checking Termux packages"
pkg update -y
pkg install -y git gh

echo
echo "==> Verifying current directory is a git repo"
git rev-parse --is-inside-work-tree >/dev/null

echo
echo "==> Reading GitHub PAT securely"
read -s -p "GitHub PAT: " GITHUB_TOKEN
echo
export GH_TOKEN="$GITHUB_TOKEN"

echo
echo "==> GitHub CLI auth status"
gh auth status || true

echo
echo "==> Configuring remote"
if git remote get-url origin >/dev/null 2>&1; then
  echo "origin already exists:"
  git remote get-url origin
else
  git remote add origin "$REPO_URL"
  echo "origin added: $REPO_URL"
fi

echo
echo "==> Fetching remote refs"
git fetch origin || true

echo
echo "==> Ensuring branch exists locally"
CURRENT_BRANCH="$(git branch --show-current)"
echo "Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  echo "Switching to $BRANCH"
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
  else
    git checkout -b "$BRANCH"
  fi
fi

echo
echo "==> Working tree status"
git status --short

echo
echo "==> Pushing branch $BRANCH"
git push -u "https://x-access-token:${GITHUB_TOKEN}@github.com/RachEma-ux/MyNewAp1Claude.git" "$BRANCH"

echo
echo "==> Triggering $WORKFLOW_NAME"
gh workflow run "$WORKFLOW_NAME" \
  --repo "$REPO_SLUG" \
  -f version=auto \
  -f run_app=yes \
  -f duration=15 \
  -f oauth_portal_url= \
  -f oauth_server_url= \
  -f app_id= \
  -f database_url= \
  -f dev_mode=true \
  -f use_secrets_for_auth=true

echo
echo "==> Recent workflow runs"
gh run list --repo "$REPO_SLUG" --limit 5

echo
echo "==> Actions page"
echo "https://github.com/$REPO_SLUG/actions"

unset GITHUB_TOKEN
