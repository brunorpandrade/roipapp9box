#!/usr/bin/env bash
# ROIP APP 9BOX — check-no-raw-sql (ME-003).
# Falha (RC != 0) se qualquer arquivo .ts em src/ contiver `db.execute` ou
# template `sql` (backtick). Reforca RV-12: 100% Drizzle tipado, zero SQL cru
# fora das declaracoes de schema.
#
# Excecao unica (RV-12): declaracoes de schema em src/db/schema/ e a propria
# migration em src/db/migrations/. Ambas sao SQL/schema por natureza.
#   - src/db/schema/tables.ts: hoje NAO usa `sql``` (S004 manda CHECKs para a
#     migration), mas a excecao esta codificada porque futuras declaracoes
#     de schema podem precisar.
#   - src/db/migrations/**: sao arquivos .sql (nao .ts), entao nao seriam
#     pegos pelo grep de .ts de qualquer forma; a excecao esta codificada
#     por transparencia e para migrations .ts futuras (se ocorrerem).
#
# Aprendizado L02 aplicado (nunca falhar por exit code do grep):
#   - --exclude/--exclude-dir *antes* dos paths.
#   - Falha por CONTEUDO (linhas encontradas), nunca por exit code do grep.

set -o pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 2

# Padroes proibidos:
#   db.execute        — chamada de query crua
#   sql`              — tagged template do Drizzle (backtick apos "sql")
PATTERN='db\.execute|sql`'

# Grep em .ts sob src/, excluindo:
#   - src/db/schema/  (declaracoes de schema — RV-12 permite)
#   - src/db/migrations/  (arquivos de migration — .sql, mas exclusao explicita)
#   - node_modules/, .next/, dist/, .git/ (nunca deveriam aparecer, mas por seguranca)
hits=$(grep -rnE \
  --include='*.ts' \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=.git \
  "$PATTERN" src/ 2>/dev/null \
  | grep -vE '^src/db/schema/|^src/db/migrations/' \
  || true)

if [ -n "$hits" ]; then
  echo "FAIL: SQL cru encontrado (RV-12):"
  echo ""
  echo "$hits"
  exit 1
fi

echo "OK — nenhum SQL cru encontrado em src/ (RV-12)"
exit 0
