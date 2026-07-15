#!/usr/bin/env bash
# ROIP APP 9BOX — check-no-dead-exports (ME-003, estendido em ME-010 e
# ME-020).
# Falha (RC != 0) se qualquer identificador exportado por arquivos em
# src/server/services/*.ts ou src/server/auth/*.ts nao for referenciado
# por nenhum arquivo fora do proprio diretorio de origem. Reforca RV-13:
# motor sem chamador eh codigo morto, proibido no repo.
#
# Extensao ME-020: `src/server/auth/` entrou no escopo — os modulos de
# autenticacao (password, jwt, rateLimit) seguem a mesma promessa canonica
# do Bloco B1 (teste conta como chamador ate o router nascer na ME-021+).
#
# Escopo do parse: apenas exports NOMEADOS dos diretorios vigiados.
# Formas reconhecidas (regex simples):
#   export function NOME
#   export async function NOME
#   export const NOME
#   export let NOME
#   export class NOME
#   export interface NOME
#   export type NOME
#   export enum NOME
# Nao reconhece `export { X, Y }` nem `export default`. Motivo: modulos do
# ROIP APP declaram exports diretamente na definicao (pratica canonica);
# `export default` eh proibido por convencao (chamador precisa nomear).
# Se essa convencao mudar, o parser evolui na ME correspondente.
#
# Roots de busca de chamador (ME-010): `src/` e `tests/`. No Bloco B1 o
# teste de integracao conta como chamador (invoca ao menos um export do
# service correspondente), consistente com a promessa canonica "motor +
# chamador + teste na mesma ME" da §5. Na ME-020 o mesmo criterio vale
# para os testes unitarios dos modulos de `src/server/auth/`.
#
# Comportamento nos casos limite (por diretorio vigiado):
#   - diretorio vazio ou inexistente: 0 exports, 0 orfaos, segue adiante.
#   - exports sem importadores fora do diretorio: RC=1.
#   - exports todos com importadores fora: RC=0.
#
# Aprendizado L02 aplicado: nunca falhar por exit code do grep.

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

# Diretorios vigiados (flat, sem subdirs).
WATCHED_DIRS=(
  "src/server/services"
  "src/server/auth"
)

# Roots de busca de chamador: `src/` (routers/componentes) e `tests/`.
SEARCH_ROOTS="src/ tests/"

KIND='(async[[:space:]]+function|function|const|let|class|interface|type|enum)'
IDENT='[A-Za-z_][A-Za-z0-9_]*'
EXPORT_RE="^[[:space:]]*export[[:space:]]+${KIND}[[:space:]]+${IDENT}"
SED_RE="s/^[[:space:]]*export[[:space:]]+${KIND}[[:space:]]+(${IDENT}).*/\\2/"

overall_orphans=""

for dir in "${WATCHED_DIRS[@]}"; do
  # Lista arquivos .ts no diretorio (exclui .gitkeep e subdirs).
  module_files=$(find "$dir" -maxdepth 1 -type f -name '*.ts' 2>/dev/null)

  if [ -z "$module_files" ]; then
    echo "OK — nenhum arquivo .ts em $dir (0 exports, 0 orfaos)"
    continue
  fi

  # Extrai identificadores exportados. -h suprime o prefixo de arquivo.
  exported_names=$(grep -hE "$EXPORT_RE" $module_files 2>/dev/null \
    | sed -E "$SED_RE" \
    | sort -u)

  if [ -z "$exported_names" ]; then
    echo "OK — nenhum export nomeado em $dir (0 exports, 0 orfaos)"
    continue
  fi

  while IFS= read -r name; do
    [ -z "$name" ] && continue
    # Procura referencia FORA do diretorio de origem, em src/ e tests/.
    # -w para boundary de palavra: evita match parcial.
    refs=$(grep -rnwE \
      --include='*.ts' \
      --include='*.tsx' \
      --exclude-dir=node_modules \
      --exclude-dir=.next \
      --exclude-dir=dist \
      --exclude-dir=.git \
      "$name" $SEARCH_ROOTS 2>/dev/null \
      | grep -vE "^$dir/" \
      || true)
    if [ -z "$refs" ]; then
      overall_orphans+="$dir: $name"$'\n'
    fi
  done <<< "$exported_names"
done

if [ -n "$overall_orphans" ]; then
  echo "FAIL: exports orfaos (RV-13):"
  echo ""
  echo "$overall_orphans"
  exit 1
fi

echo "OK — todos os exports dos diretorios vigiados tem chamador fora (RV-13)"
exit 0
