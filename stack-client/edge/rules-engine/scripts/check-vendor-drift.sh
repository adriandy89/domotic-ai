#!/usr/bin/env bash
# CI guard: fail if the committed src/vendor has drifted from the monorepo source
# of truth (libs/rules-evaluator + libs/models/.../protocols). Run from inside the
# monorepo. Locally: re-run scripts/vendor-libs.sh and commit the result.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/vendor-libs.sh"

if ! git diff --quiet -- "$SCRIPT_DIR/../src/vendor"; then
  echo "error: src/vendor is out of date with libs/. Run scripts/vendor-libs.sh and commit." >&2
  git --no-pager diff --stat -- "$SCRIPT_DIR/../src/vendor" >&2
  exit 1
fi

echo "vendor is in sync with libs/ ✓"
