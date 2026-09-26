#!/usr/bin/env bash
# ROIP APP 9BOX — validate:fast (ME de otimizacao do tempo de testes).
#
# Atalho do loop de desenvolvimento. NAO substitui o gate: `npm run
# validate` (11/11, incluindo integracao contra MySQL real e `next build`)
# continua obrigatorio e identico antes de todo commit. Este script roda
# apenas as verificacoes rapidas e sem banco:
#
#   1. tsc --noEmit  — typecheck incremental (tsBuildInfoFile em
#      node_modules/.cache; a primeira execucao popula o cache, as
#      seguintes reaproveitam).
#   2. eslint .
#   3. prettier --check .
#   4. vitest run --project unit — apenas o projeto unitario, que NAO tem
#      globalSetup e portanto nunca sobe o MySQL efemero.
#
# Fora daqui (so no gate completo): verify-schema, check-forbidden-terms,
# check-no-raw-sql, check-no-dead-exports, verify-migration, o projeto de
# integracao do vitest, verify-canonic-consistency e next build.
#
# Cada etapa isola o exit code; falha (RC != 0) para na primeira e imprime
# qual verificacao reprovou.

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

TOTAL=4
STEP=0

run_step() {
  local name="$1"
  shift
  STEP=$((STEP + 1))
  local label="[$STEP/$TOTAL] $name"
  echo ""
  echo "=== $label ==="
  "$@"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    echo ""
    echo "FAIL: $label (RC=$rc)"
    exit "$rc"
  fi
  echo "PASS: $label (RC=0)"
}

run_step "tsc --noEmit" npx tsc --noEmit
run_step "eslint ." npx eslint .
run_step "prettier --check ." npx prettier --check .
run_step "vitest run --project unit" npx vitest run --project unit

echo ""
echo "=== validate:fast: 4/4 PASS ==="
echo "Lembrete: rode 'npm run validate' completo antes do commit."
exit 0
