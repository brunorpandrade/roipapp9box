#!/usr/bin/env bash
# ROIP APP 9BOX — check-no-dead-exports (ME-003, estendido em ME-010).
# Falha (RC != 0) se qualquer identificador exportado por arquivos em
# src/server/services/*.ts nao for referenciado por nenhum arquivo fora de
# src/server/services/. Reforca RV-13: motor sem chamador eh codigo morto,
# proibido no repo.
#
# Escopo do parse: apenas exports NOMEADOS de src/server/services/*.ts.
# Formas reconhecidas (regex simples):
#   export function NOME
#   export async function NOME
#   export const NOME
#   export let NOME
#   export class NOME
#   export interface NOME
#   export type NOME
#   export enum NOME
# Nao reconhece `export { X, Y }` nem `export default`. Motivo: services do
# ROIP APP declaram exports diretamente na definicao (pratica canonica);
# `export default` eh proibido por convencao (chamador precisa nomear).
# Se essa convencao mudar, o parser evolui na ME correspondente.
#
# Roots de busca de chamador (ME-010): `src/` e `tests/`. No Bloco B1 o
# teste de integracao conta como chamador (invoca ao menos um export do
# service correspondente), consistente com a promessa canonica "motor +
# chamador + teste na mesma ME" da §5.
#
# Comportamento nos casos limite:
#   - services/ vazio (nenhum .ts alem de .gitkeep): 0 exports, 0 orfaos, RC=0.
#   - services/ com exports mas sem importadores fora de services/: RC=1.
#   - services/ com exports e todos com importadores fora: RC=0.
#
# Aprendizado L02 aplicado: nunca falhar por exit code do grep.

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

SERVICES_DIR="src/server/services"

# Lista arquivos .ts em services/ (exclui .gitkeep e subdirs — services/ eh flat).
service_files=$(find "$SERVICES_DIR" -maxdepth 1 -type f -name '*.ts' 2>/dev/null)

if [ -z "$service_files" ]; then
  echo "OK — nenhum arquivo .ts em $SERVICES_DIR (0 exports, 0 orfaos)"
  exit 0
fi

# Extrai identificadores exportados. Regex captura o NOME apos as formas
# reconhecidas. -h suprime o prefixo de arquivo (queremos so os nomes).
KIND='(async[[:space:]]+function|function|const|let|class|interface|type|enum)'
IDENT='[A-Za-z_][A-Za-z0-9_]*'
EXPORT_RE="^[[:space:]]*export[[:space:]]+${KIND}[[:space:]]+${IDENT}"
SED_RE="s/^[[:space:]]*export[[:space:]]+${KIND}[[:space:]]+(${IDENT}).*/\\2/"
exported_names=$(grep -hE "$EXPORT_RE" $service_files 2>/dev/null \
  | sed -E "$SED_RE" \
  | sort -u)

if [ -z "$exported_names" ]; then
  echo "OK — nenhum export nomeado em $SERVICES_DIR (0 exports, 0 orfaos)"
  exit 0
fi

# Roots de busca de chamador: `src/` (routers/componentes) e `tests/` (integracao).
SEARCH_ROOTS="src/ tests/"

orphans=""
while IFS= read -r name; do
  [ -z "$name" ] && continue
  # Procura referencia FORA de services/, em src/ e tests/.
  # -w para boundary de palavra: evita match parcial (ex.: `foo` vs `foobar`).
  refs=$(grep -rnwE \
    --include='*.ts' \
    --include='*.tsx' \
    --exclude-dir=node_modules \
    --exclude-dir=.next \
    --exclude-dir=dist \
    --exclude-dir=.git \
    "$name" $SEARCH_ROOTS 2>/dev/null \
    | grep -vE "^$SERVICES_DIR/" \
    || true)
  if [ -z "$refs" ]; then
    orphans+="$name"$'\n'
  fi
done <<< "$exported_names"

if [ -n "$orphans" ]; then
  echo "FAIL: exports orfaos em $SERVICES_DIR (RV-13):"
  echo ""
  echo "$orphans"
  exit 1
fi

echo "OK — todos os exports de $SERVICES_DIR tem chamador fora (RV-13)"
exit 0
