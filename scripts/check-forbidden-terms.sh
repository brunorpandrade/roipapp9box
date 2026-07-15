#!/usr/bin/env bash
# ROIP APP 9BOX — check-forbidden-terms (ME-002).
# Falha (RC != 0) se qualquer termo abandonado (DOC 01 §19) aparecer em
# arquivos de codigo (src/, scripts/, drizzle/) do repositorio.
#
# Excecao: documentacao canonica em docs/ e este proprio script.
#
# Aprendizado L02 aplicado (correcao de defeito do projeto anterior):
#   - --exclude-dir/--exclude *antes* dos paths (grep exige nessa ordem).
#   - Falha por CONTEUDO (linhas encontradas), nunca por exit code do grep
#     (grep -r retorna 2 em erro de sintaxe, o que mascarava falha).

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEARCH_DIRS=(src scripts drizzle)

# Termos abandonados (§19) — estruturas
# Bloco DOC 02 §14 acrescentado na ME-020: colunas desnormalizadas e
# tabela superadas por `accessTokens` + `passwordSet` (S429/S430).
STRUCT_TERMS=(
  "nr1PGRDocuments"
  "emailSettings"
  "leadershipQualityIndex"
  "cadenciaCOPSOQ"
  "performanceId"
  "firstAccessCompleted"
  "resetPasswordTokenHash"
  "resetPasswordExpiresAt"
  "resetPasswordUsedAt"
  "emailChangeRequests"
)

# Termos globais proibidos por nomenclatura canonica
# `/gestao-ciclos` (DOC 02 §14, ME-020): rota superada por
# `/cycle-management` (S431). O termo `/desbloqueios` (rota isolada,
# S432) NAO entra como fixed-string: colidiria com a rota canonica
# `/super-admin/desbloqueios`; tratamento na ME que criar as rotas.
NAMING_TERMS=(
  "assessment de 97 itens"
  "PGR"
  "Programa de Gerenciamento de Riscos Psicossociais"
  "Pesquisa NR-1"
  "Painel principal"
  "/gestao-ciclos"
)

ALL_HITS=""

cd "$REPO_ROOT" || exit 2

for term in "${STRUCT_TERMS[@]}"; do
  # -F fixed-string, -r recursivo, -n com numero de linha,
  # --exclude-dir=docs (canonicos), --exclude=check-forbidden-terms.sh (self).
  hits=$(grep -rnF \
    --exclude-dir=docs \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=.next \
    --exclude=check-forbidden-terms.sh \
    "$term" "${SEARCH_DIRS[@]}" 2>/dev/null)
  if [ -n "$hits" ]; then
    ALL_HITS+="[TERMO: $term]"$'\n'"$hits"$'\n\n'
  fi
done

for term in "${NAMING_TERMS[@]}"; do
  hits=$(grep -rnF \
    --exclude-dir=docs \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=.next \
    --exclude=check-forbidden-terms.sh \
    "$term" "${SEARCH_DIRS[@]}" 2>/dev/null)
  if [ -n "$hits" ]; then
    ALL_HITS+="[TERMO: $term]"$'\n'"$hits"$'\n\n'
  fi
done

if [ -n "$ALL_HITS" ]; then
  echo "FAIL: termos abandonados encontrados:"
  echo ""
  echo "$ALL_HITS"
  exit 1
fi

echo "OK — nenhum termo abandonado encontrado em ${SEARCH_DIRS[*]}"
exit 0
