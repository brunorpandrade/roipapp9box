#!/usr/bin/env bash
# ROIP APP 9BOX — validate (ME-003 + ME-010 + ME-046a).
# Regua de aceite permanente (§4). Encadeia, na ordem exata, as 10 verificacoes
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
#
# Passo 10 (`verify-canonic-consistency --mode=repo`) entrou na ME-046a
# (S161): tabela de assercoes embutida verificada contra o codigo (cadencia
# semestral do D em Q1/Q3, direcao estrutural C x D, enum dashboardLevel,
# inventario nominal fechado das 53 tabelas, tipos fechaveis do
# cycleSchedule, ausencia de termos abandonados em src/tests). O modo
# --mode=docs da mesma regua vive fora do validate (fundacao de abertura
# de ME em Claude via ROIP_DOCS_DIR; passo 1 do protocolo §3).

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

TOTAL=10
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
run_step "verify-canonic-consistency.mjs --mode=repo" \
  node scripts/verify-canonic-consistency.mjs --mode=repo

echo ""
echo "=== validate: 10/10 PASS ==="
exit 0
