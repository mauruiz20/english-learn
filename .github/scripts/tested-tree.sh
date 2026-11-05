#!/usr/bin/env bash
# Finds a successful CI run on develop that already tested the exact tree of a commit.
#
# Releases merge develop into main with --no-ff, so the merge commit is new but its tree is the
# one develop's CI just tested. When this finds that run, ci.yml skips the test jobs on main and
# deploys directly.
#
# Usage: tested-tree.sh [commit]   (default HEAD; needs gh, jq and GH_TOKEN with actions: read)
# Writes tested=true|false and run_url=<url> to $GITHUB_OUTPUT when set, else to stdout.
# Fails safe: any lookup error prints tested=false, so CI runs every check as usual.
#
# A run only counts when it belongs to this repository, ran this workflow file on a push to
# develop, and concluded with success.
set -uo pipefail

repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required (owner/name)}"
workflow="${WORKFLOW_FILE:-ci.yml}"
lookback="${LOOKBACK:-30}"
commit="${1:-HEAD}"
out="${GITHUB_OUTPUT:-/dev/stdout}"

emit() {
  printf 'tested=%s\nrun_url=%s\n' "$1" "${2:-}" >>"$out"
  exit 0
}

if ! tree=$(git rev-parse --verify --quiet "${commit}^{tree}"); then
  echo "::warning::Could not resolve the tree of ${commit}; running every check."
  emit false
fi
echo "Tree of ${commit}: ${tree}"

# Server-side filters narrow the list; the jq select re-checks every field, so a filter the API
# ignored can never widen what is trusted.
if ! candidates=$(gh api -X GET "repos/${repo}/actions/workflows/${workflow}/runs" \
  -f branch=develop -f event=push -f status=success -F per_page="${lookback}" \
  --jq ".workflow_runs[]
    | select(.head_branch == \"develop\"
        and .event == \"push\"
        and .status == \"completed\"
        and .conclusion == \"success\"
        and .path == \".github/workflows/${workflow}\"
        and .repository.full_name == \"${repo}\"
        and .head_repository.full_name == \"${repo}\")
    | \"\(.head_sha) \(.html_url)\""); then
  echo "::warning::Could not list develop runs; running every check."
  emit false
fi

while read -r sha url; do
  [ -n "${sha:-}" ] || continue
  if ! run_tree=$(gh api "repos/${repo}/git/commits/${sha}" --jq '.tree.sha'); then
    echo "::warning::Could not read commit ${sha}; skipping it."
    continue
  fi
  if [ "$run_tree" = "$tree" ]; then
    echo "Tree already tested by develop commit ${sha}: ${url}"
    emit true "$url"
  fi
done <<<"$candidates"

echo "No successful develop run among the last ${lookback} tested this tree; running every check."
emit false
