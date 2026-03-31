#!/usr/bin/env bash
# ============================================================
# AI Harness Verify Script
# Self-Review Loop Step 2 — Sandbox Execution
#
# Usage:
#   npm run verify
#   bash scripts/harness-verify.sh
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed
# ============================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0
REPORT_FILE=".harness-last-report.json"
START_TIME=$(date +%s)
ISSUES=()
ACTIONS=()

# ── 색상 ────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

step_pass() { echo -e "${GREEN}  ✓${NC} $1"; ((PASS++)); ACTIONS+=("PASS: $1"); }
step_fail() { echo -e "${RED}  ✗${NC} $1"; ((FAIL++)); ISSUES+=("FAIL: $1"); ACTIONS+=("FAIL: $1"); }
step_info() { echo -e "${YELLOW}  →${NC} $1"; }

echo ""
echo "══════════════════════════════════════"
echo "  AI Harness — Verify Loop"
echo "══════════════════════════════════════"
echo ""

# ── Step 1: TypeScript ───────────────────────────────────────
step_info "TypeScript type-check (tsc --noEmit)..."
TS_OUT=$(npx tsc --noEmit 2>&1) && step_pass "TypeScript: no errors" || {
  step_fail "TypeScript: type errors found"
  echo "$TS_OUT" | head -20
  ISSUES+=("$TS_OUT")
}

# ── Step 2: ESLint ───────────────────────────────────────────
step_info "ESLint (app/ lib/ components/ types/)..."
LINT_OUT=$(npx eslint app/ lib/ components/ types/ --ext .ts,.tsx --max-warnings 50 2>&1) && step_pass "ESLint: no errors" || {
  step_fail "ESLint: lint errors found"
  echo "$LINT_OUT" | head -30
  ISSUES+=("$LINT_OUT")
}

# ── Step 3: Next.js Build ────────────────────────────────────
step_info "Next.js build (next build)..."
BUILD_OUT=$(npm run build 2>&1) && step_pass "Build: success" || {
  step_fail "Build: failed"
  echo "$BUILD_OUT" | tail -30
  ISSUES+=("$(echo "$BUILD_OUT" | tail -30)")
}

# ── Summary ──────────────────────────────────────────────────
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
TOTAL=$((PASS + FAIL))

echo ""
echo "══════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  STATUS="success"
  CONFIDENCE="0.98"
  echo -e "${GREEN}  ALL CHECKS PASSED${NC} (${PASS}/${TOTAL}) — ${ELAPSED}s"
else
  STATUS="failed"
  CONFIDENCE="0.30"
  echo -e "${RED}  CHECKS FAILED${NC} (${FAIL}/${TOTAL} failed) — ${ELAPSED}s"
fi
echo "══════════════════════════════════════"
echo ""

# ── JSON Report ──────────────────────────────────────────────
ISSUES_JSON=$(printf '%s\n' "${ISSUES[@]+"${ISSUES[@]}"}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().splitlines()))" 2>/dev/null || echo '[]')
ACTIONS_JSON=$(printf '%s\n' "${ACTIONS[@]+"${ACTIONS[@]}"}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().splitlines()))" 2>/dev/null || echo '[]')

cat > "$REPORT_FILE" <<EOF
{
  "status": "$STATUS",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "elapsed_seconds": $ELAPSED,
  "passed": $PASS,
  "failed": $FAIL,
  "changes": [],
  "issues": $ISSUES_JSON,
  "actions_taken": $ACTIONS_JSON,
  "confidence": $CONFIDENCE,
  "logs": "Run at $(date)"
}
EOF

echo "  Report saved: $REPORT_FILE"
echo ""

# ── Exit ─────────────────────────────────────────────────────
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
