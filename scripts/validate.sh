#!/usr/bin/env bash
# ROIP APP 9BOX — validate (ME-003 + ME-010).
# Regua de aceite permanente (§4). Encadeia, na ordem exata, as 9 verificacoes
# que constituem a fronteira canonica do repo. Falha (RC != 0) no primeiro
# erro, imprimindo qual regua reprovou.
#
# Racional: cada etapa isolada com exit code capturado. Falha em uma regua
# nao mascara nem contamina as demais — a saida deixa claro exatamente qual
# invariante quebrou. Isso permite que a prova RV-03 do encadeamento injete
# defeito em UMA regua por vez e observe falha SO nela.
#
# Passo 9 (`vitest run`) entrou na ME-010: a partir do Bloco B1 ha camada de
# acesso a dados a testar. O setup do vitest sobe a base efemera roip_test
# (S007 estendido), aplica a migration, roda os testes e limpa a base.

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

TOTAL=9
STEP=0
FAILED=""

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
    FAILED="$label"
    echo ""
    echo "FAIL: $label (RC=$rc)"
    exit "$rc"
  fi
  echo "PASS: $label (RC=0)"
}

run_step "verify-schema.mjs" node scripts/verify-schema.mjs
run_step "tsc --noEmit" npx tsc --noEmit
run_step "eslint ." npx eslint .
run_step "prettier --check ." npx prettier --check .
run_step "check-forbidden-terms.sh" bash scripts/check-forbidden-terms.sh
run_step "check-no-raw-sql.sh" bash scripts/check-no-raw-sql.sh
run_step "check-no-dead-exports.sh" bash scripts/check-no-dead-exports.sh
run_step "verify-migration.mjs" node scripts/verify-migration.mjs
run_step "vitest run" npx vitest run

echo ""
echo "=== validate: 9/9 PASS ==="
exit 0
