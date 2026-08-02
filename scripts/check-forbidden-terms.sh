#!/usr/bin/env bash
# ROIP APP 9BOX — check-forbidden-terms.
# Falha (RC != 0) se qualquer termo abandonado (DOC 01 §19) ou termo
# proibido do DOC 07 §14 aparecer em arquivos de codigo do repositorio.
#
# Escopo canonico (bit-exact §14.3 do DOC 07):
#   - src/ (codigo-fonte, templates de e-mail em src/lib/email/templates,
#     textos renderizados)
#   - scripts/ (seed, utilitarios)
#   - drizzle/ (migrations SQL — canonico prospectivo; hoje ausente)
#   - tests/ (testes de integracao e unit)
#   - .env.example (configuracoes de ambiente)
#
# Excecao: documentacao canonica em docs/ e este proprio script.
#
# Historico canonico:
#   ME-002 — script criado (DOC 01 §19).
#   ME-020 — bloco DOC 02 §14 acrescentado (S429/S430).
#   ME-064 — extensao bit-exact ao §14.1 do DOC 07:
#            (a) `/desbloqueios` isolada adicionada com excecao §14.4
#                canonica (`/super-admin/desbloqueios` valida).
#            (b) escopo estendido a `tests/` e `.env.example`.
#
# Aprendizado L02 aplicado (correcao de defeito do projeto anterior):
#   - --exclude-dir/--exclude *antes* dos paths (grep exige nessa ordem).
#   - Falha por CONTEUDO (linhas encontradas), nunca por exit code do grep
#     (grep -r retorna 2 em erro de sintaxe, o que mascarava falha).

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEARCH_DIRS=(src scripts drizzle tests)
EXTRA_FILES=(.env.example)

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
NAMING_TERMS=(
  "assessment de 97 itens"
  "PGR"
  "Programa de Gerenciamento de Riscos Psicossociais"
  "Pesquisa NR-1"
  "Painel principal"
  "/gestao-ciclos"
)

# Termos regex com excecao canonica (DOC 07 §14.4).
# `/desbloqueios` isolada: rota superada (S432).
# Excecao canonica unica: `/super-admin/desbloqueios` e' rota canonica
# valida (S431). Estrategia bit-exact §14.4: grep positivo por
# `/desbloqueios\b` e filtro negativo por `/super-admin/desbloqueios`.
REGEX_TERMS=(
  "/desbloqueios\\b"
)
REGEX_EXCEPTIONS=(
  "/super-admin/desbloqueios"
)

ALL_HITS=""

cd "$REPO_ROOT" || exit 2

# Determina paths existentes para evitar erro de path inexistente
# (drizzle/ ainda nao existe no baseline; canonico prospectivo).
EXISTING_PATHS=()
for d in "${SEARCH_DIRS[@]}"; do
  if [ -e "$d" ]; then
    EXISTING_PATHS+=("$d")
  fi
done
for f in "${EXTRA_FILES[@]}"; do
  if [ -e "$f" ]; then
    EXISTING_PATHS+=("$f")
  fi
done

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
    "$term" "${EXISTING_PATHS[@]}" 2>/dev/null)
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
    "$term" "${EXISTING_PATHS[@]}" 2>/dev/null)
  if [ -n "$hits" ]; then
    ALL_HITS+="[TERMO: $term]"$'\n'"$hits"$'\n\n'
  fi
done

# Regex com excecao canonica (§14.4)
# Estrategia canonica bit-exact: grep positivo Extended-regex + filtro
# negativo Fixed-string das excecoes. Zero risco de metacaracter na
# excecao (`-F` em grep -v).
for i in "${!REGEX_TERMS[@]}"; do
  term="${REGEX_TERMS[$i]}"
  hits=$(grep -rEn \
    --exclude-dir=docs \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude-dir=.next \
    --exclude=check-forbidden-terms.sh \
    "$term" "${EXISTING_PATHS[@]}" 2>/dev/null)
  # Aplica excecoes canonicas §14.4
  for exception in "${REGEX_EXCEPTIONS[@]}"; do
    hits=$(echo "$hits" | grep -vF "$exception" 2>/dev/null || true)
  done
  # Remove linha vazia residual apos filtro
  hits=$(echo "$hits" | sed '/^$/d')
  if [ -n "$hits" ]; then
    ALL_HITS+="[TERMO regex: $term]"$'\n'"$hits"$'\n\n'
  fi
done

if [ -n "$ALL_HITS" ]; then
  echo "FAIL: termos abandonados encontrados:"
  echo ""
  echo "$ALL_HITS"
  exit 1
fi

echo "OK — nenhum termo abandonado encontrado em ${EXISTING_PATHS[*]}"
exit 0
