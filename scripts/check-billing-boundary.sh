#!/usr/bin/env bash
set -euo pipefail

# Billing Boundary Check Script
# Verifies no Stripe/billing code has leaked outside the designated provider module.
# Run this in CI to prevent billing code from re-entering the public gateway.

VIOLATIONS=0
WARNINGS=0

echo "============================================"
echo "  Billing Boundary Check"
echo "============================================"
echo ""

# ── Check 1: Gateway package.json must NOT list stripe as a dependency ──
echo "Check 1: Gateway package.json stripe dependency"
if grep -q '"stripe"' apps/gateway/package.json 2>/dev/null; then
  echo "  FAIL: 'stripe' found as dependency in apps/gateway/package.json"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  PASS: stripe not in gateway package.json"
fi
echo ""

# ── Check 2: No stripe imports outside billing/stripe/ ──
echo "Check 2: Stripe imports outside billing/stripe/"
STRIPE_IMPORTS=$(grep -rn "from ['\"]stripe['\"]" apps/gateway/src/ \
  --include='*.ts' --include='*.tsx' \
  | grep -v "billing/stripe/" \
  | grep -v "__tests__/" \
  || true)

if [ -n "$STRIPE_IMPORTS" ]; then
  echo "  FAIL: Stripe imports found outside billing/stripe/:"
  echo "$STRIPE_IMPORTS" | while IFS= read -r line; do
    echo "    $line"
  done
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  PASS: No stripe imports outside billing/stripe/"
fi
echo ""

# ── Check 3: No STRIPE_* bindings in gateway core ──
echo "Check 3: STRIPE_* bindings in gateway core"
STRIPE_BINDINGS=$(grep -rn "STRIPE_SECRET_KEY\|STRIPE_WEBHOOK_SECRET" \
  apps/gateway/src/lib/ \
  apps/gateway/src/runtime/ \
  apps/gateway/src/middleware/ \
  apps/gateway/src/routes/ \
  --include='*.ts' --include='*.tsx' \
  2>/dev/null || true)

if [ -n "$STRIPE_BINDINGS" ]; then
  echo "  FAIL: STRIPE_* bindings found in gateway core:"
  echo "$STRIPE_BINDINGS" | while IFS= read -r line; do
    echo "    $line"
  done
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo "  PASS: No STRIPE_* bindings in gateway core (lib/, runtime/, middleware/, routes/)"
fi
echo ""

# ── Check 4: Dashboard billing references (WARNING level) ──
# This check targets billing *infrastructure* (billing providers, subscription management,
# pricing pages). References to the Stripe *connector* (a user-facing product feature)
# are expected and excluded.
echo "Check 4: Dashboard billing references"
DASHBOARD_BILLING=$(grep -rn "stripe\|billing\|subscription\|pricing" \
  apps/dashboard/src/ \
  --include='*.ts' --include='*.tsx' \
  -i \
  2>/dev/null \
  | grep -v "// " \
  | grep -v " \* " \
  | grep -v "connector-stripe" \
  | grep -v "connectors.*stripe" \
  | grep -v "'stripe'" \
  | grep -v "\"stripe\"" \
  | grep -v "Stripe SDK complexity" \
  | grep -v "Stripe SDK" \
  | grep -v "without Stripe" \
  | grep -vi "title: ['\"]Stripe['\"]" \
  | grep -vi "stripe:.*" \
  | grep -vi "GitHub.*Slack.*Stripe" \
  | grep -vi "Stripe.*Discord" \
  | grep -vi "stripe-invoice-notify" \
  | grep -vi "CreditCard" \
  || true)

if [ -n "$DASHBOARD_BILLING" ]; then
  echo "  WARNING: Potential billing references in dashboard (manual review):"
  echo "$DASHBOARD_BILLING" | while IFS= read -r line; do
    echo "    $line"
  done
  WARNINGS=$((WARNINGS + 1))
else
  echo "  PASS: No billing-specific references in dashboard"
fi
echo ""

# ── Check 5: billing/stripe/ isolation (no gateway core imports) ──
echo "Check 5: billing/stripe/ import isolation"
if [ -d "apps/gateway/src/billing/stripe" ]; then
  # Check for imports from gateway core (../../lib, ../../runtime, ../../middleware, ../../routes)
  BAD_IMPORTS=$(grep -rn "from ['\"]\.\.\/\.\.\/lib\|from ['\"]\.\.\/\.\.\/runtime\|from ['\"]\.\.\/\.\.\/middleware\|from ['\"]\.\.\/\.\.\/routes" \
    apps/gateway/src/billing/stripe/ \
    --include='*.ts' --include='*.tsx' \
    2>/dev/null || true)

  if [ -n "$BAD_IMPORTS" ]; then
    echo "  FAIL: billing/stripe/ imports from gateway core:"
    echo "$BAD_IMPORTS" | while IFS= read -r line; do
      echo "    $line"
    done
    VIOLATIONS=$((VIOLATIONS + 1))
  else
    echo "  PASS: billing/stripe/ only imports from allowed sources (stripe, ../provider, ../types, ./)"
  fi
else
  echo "  SKIP: billing/stripe/ directory does not exist (already extracted or not present)"
fi
echo ""

# ── Summary ──
echo "============================================"
echo "  Results"
echo "============================================"
echo "  Violations: $VIOLATIONS"
echo "  Warnings:   $WARNINGS"
echo ""

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "FAIL: $VIOLATIONS billing boundary violation(s) found"
  exit 1
else
  echo "PASS: No billing boundary violations found"
  exit 0
fi
