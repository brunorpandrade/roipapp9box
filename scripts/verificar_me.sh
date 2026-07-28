#!/usr/bin/env bash
# ROIP APP 9BOX — scripts/verificar_me.sh
# Verificacao de aplicacao de micro-etapa, UNICA e PARAMETRICA (S202).
#
# Substitui o verify script descartavel que ate a ME-049a era gerado a
# cada ME e reprovado (L74/L85) a cada despacho. Agora o script e
# versionado no repositorio, no precedente do `setup-mysql.sh` (S115), e
# a prova de path root x path ubuntu e feita UMA VEZ por versao do
# script, pinada pelo SHA-256 dele proprio. O que varia por ME e apenas
# o MANIFESTO de hashes, que viaja no dispatch.
#
# Uso canonico (a partir da raiz do clone, apos descompactar o ZIP):
#
#   bash scripts/verificar_me.sh <manifesto.sha256> [--sem-validate]
#
#   <manifesto.sha256>  arquivo no formato `sha256sum` com UMA linha por
#                       arquivo [NOVO]/[EDIT] da ME, caminhos relativos a
#                       raiz do repositorio.
#   --sem-validate      pula a regua completa (uso exclusivo de
#                       diagnostico; o dispatch canonico NUNCA usa).
#
# Etapas, com exit code isolado por etapa (RV-01 corolario):
#   1. Raiz do repositorio confirmada por `git rev-parse`.
#   2. HEAD registrado (a aplicacao NAO commita — L41).
#   3. `sha256sum -c` do manifesto (RV-02: hash divergente = o Manus
#      editou -> reverter, nao negociar).
#   4. Fundacao MySQL check-only (L35: NUNCA inicia o daemon; L22:
#      credencial verificada por `SELECT 1`, nao por `mysqladmin ping`).
#   5. `npm install --no-audit --no-fund --prefer-offline` (L82).
#   6. `npm run validate` (regua permanente de 10 passos, §4).
#   7. Bloco de retorno consolidado.
#
# Convencoes:
#   - NUNCA grava no cwd (L70). Arquivos operacionais vao para
#     `${TMPDIR:-/tmp}` com UID_TAG `$(id -u)` no nome (L78), evitando
#     colisao entre execucao root (Claude) e ubuntu (Manus).
#   - `$SUDO` condicional (L74/L85): resolvido por deteccao, nunca
#     assumido. Este script nao precisa de privilegio; a deteccao existe
#     para o diagnostico de ambiente do bloco de retorno.
#   - Progresso em stdout; erros em stderr.
#   - NAO entra no `npm run validate` — separacao fundacao x produto
#     (L35).
#
# Exit codes:
#   0 — verificacao completa aprovada
#   2 — uso incorreto (manifesto ausente ou ilegivel)
#   3 — nao esta na raiz de um clone do repositorio
#   4 — hash divergente (RV-02)
#   5 — fundacao MySQL indisponivel
#   6 — npm install falhou
#   7 — regua `npm run validate` reprovou

set -o pipefail

readonly EXIT_OK=0
readonly EXIT_USO=2
readonly EXIT_RAIZ=3
readonly EXIT_HASH=4
readonly EXIT_MYSQL=5
readonly EXIT_NPM=6
readonly EXIT_VALIDATE=7

readonly UID_TAG="$(id -u)"
readonly OUT_DIR="${TMPDIR:-/tmp}"
readonly OUT_HASH="$OUT_DIR/roip_verificar_me_hash_${UID_TAG}.txt"
readonly OUT_NPM="$OUT_DIR/roip_verificar_me_npm_${UID_TAG}.txt"
readonly OUT_VALIDATE="$OUT_DIR/roip_verificar_me_validate_${UID_TAG}.txt"

readonly MYSQL_HOST='127.0.0.1'
readonly MYSQL_PORT='3306'
readonly MYSQL_USER='root'
readonly MYSQL_PASSWORD='roip_local_root'

SUDO=""
RODAR_VALIDATE=1
MANIFESTO=""

log() {
  printf '[verificar_me] %s\n' "$*"
}

err() {
  printf '[verificar_me] ERRO: %s\n' "$*" >&2
}

# ---------- Argumentos ----------

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --sem-validate)
        RODAR_VALIDATE=0
        shift
        ;;
      -*)
        err "opcao desconhecida: $1"
        return "$EXIT_USO"
        ;;
      *)
        if [ -n "$MANIFESTO" ]; then
          err "manifesto informado mais de uma vez"
          return "$EXIT_USO"
        fi
        MANIFESTO="$1"
        shift
        ;;
    esac
  done

  if [ -z "$MANIFESTO" ]; then
    err "uso: bash scripts/verificar_me.sh <manifesto.sha256> [--sem-validate]"
    return "$EXIT_USO"
  fi
  if [ ! -r "$MANIFESTO" ]; then
    err "manifesto nao encontrado ou ilegivel: $MANIFESTO"
    return "$EXIT_USO"
  fi
  return 0
}

# ---------- Deteccao de ambiente (L74/L85) ----------

detect_env() {
  if [ "$UID_TAG" -eq 0 ]; then
    SUDO=""
    log "ambiente: root (sem sudo)"
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    SUDO="sudo"
    log "ambiente: usuario nao-root com sudo NOPASSWD"
    return 0
  fi
  SUDO=""
  log "ambiente: usuario nao-root SEM sudo"
  return 0
}

# ---------- Etapa 1-2: raiz e HEAD ----------

etapa_raiz() {
  if ! command -v git >/dev/null 2>&1; then
    err "git ausente do PATH"
    return "$EXIT_RAIZ"
  fi
  local topo
  topo="$(git rev-parse --show-toplevel 2>/dev/null)"
  if [ -z "$topo" ]; then
    err "diretorio atual nao pertence a um clone git"
    return "$EXIT_RAIZ"
  fi
  if [ "$topo" != "$PWD" ]; then
    err "execute a partir da raiz do repositorio: $topo"
    return "$EXIT_RAIZ"
  fi
  HEAD_SHA="$(git rev-parse HEAD 2>/dev/null)"
  log "raiz confirmada: $topo"
  log "HEAD: $HEAD_SHA"
  return 0
}

# ---------- Etapa 3: hashes (RV-02) ----------

etapa_hash() {
  local total
  total="$(grep -c . "$MANIFESTO")"
  log "conferindo $total hash(es) do manifesto: $MANIFESTO"
  sha256sum -c "$MANIFESTO" >"$OUT_HASH" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "hash divergente — o conteudo aplicado NAO e o gerado por Claude (RV-02)"
    err "detalhe em: $OUT_HASH"
    grep -v ': OK$' "$OUT_HASH" >&2
    return "$EXIT_HASH"
  fi
  log "hashes conferem: $total/$total OK"
  return 0
}

# ---------- Etapa 4: MySQL check-only (L35/L22) ----------

etapa_mysql() {
  if ! command -v mysql >/dev/null 2>&1; then
    err "cliente mysql ausente do PATH"
    err "rode antes, em terminal separado: bash scripts/setup-mysql.sh"
    return "$EXIT_MYSQL"
  fi
  # L22: credencial verificada por SELECT real, nao por ping.
  if ! mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" \
    -p"$MYSQL_PASSWORD" -e 'SELECT 1' >/dev/null 2>&1; then
    err "MySQL indisponivel ou credencial canonica invalida"
    err "este script NAO inicia o daemon (L35)"
    err "rode antes, em terminal separado: bash scripts/setup-mysql.sh"
    return "$EXIT_MYSQL"
  fi
  log "fundacao MySQL disponivel (SELECT 1 OK)"
  return 0
}

# ---------- Etapa 5: dependencias (L82) ----------

etapa_npm() {
  log "npm install (--no-audit --no-fund --prefer-offline)"
  npm install --no-audit --no-fund --prefer-offline >"$OUT_NPM" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "npm install falhou (RC=$rc); detalhe em: $OUT_NPM"
    tail -20 "$OUT_NPM" >&2
    return "$EXIT_NPM"
  fi
  log "dependencias instaladas"
  return 0
}

# ---------- Etapa 6: regua permanente (§4) ----------

etapa_validate() {
  if [ "$RODAR_VALIDATE" -eq 0 ]; then
    log "regua completa PULADA por --sem-validate (uso de diagnostico)"
    return 0
  fi
  log "npm run validate (regua permanente de 10 passos)"
  npm run validate >"$OUT_VALIDATE" 2>&1
  local rc=$?
  VALIDATE_PASS="$(grep -c '^PASS: ' "$OUT_VALIDATE")"
  if [ "$rc" -ne 0 ]; then
    err "regua reprovou (RC=$rc); detalhe em: $OUT_VALIDATE"
    grep -E '^(FAIL|PASS): ' "$OUT_VALIDATE" >&2
    return "$EXIT_VALIDATE"
  fi
  log "regua aprovada: ${VALIDATE_PASS}/10 PASS"
  return 0
}

# ---------- Etapa 7: bloco de retorno ----------

# Extrai a contagem final do vitest do log da regua. O vitest colore a
# saida com escapes ANSI mesmo redirecionado; sem remove-los o grep nao
# casa e o bloco de retorno sai vazio. `sed` limpa os escapes antes.
contagem_vitest() {
  local rotulo="$1"
  sed 's/\x1b\[[0-9;]*m//g' "$OUT_VALIDATE" 2>/dev/null |
    grep -aE "^ *${rotulo} +[0-9]+ passed" |
    tail -1 |
    tr -s ' ' |
    sed 's/^ //'
}

bloco_retorno() {
  local head_final
  head_final="$(git rev-parse HEAD 2>/dev/null)"
  echo ""
  echo "==================== RETORNO ===================="
  echo "script          : scripts/verificar_me.sh"
  echo "script_sha256   : $(sha256sum "$0" | cut -d' ' -f1)"
  echo "manifesto       : $MANIFESTO"
  echo "hashes          : $(grep -c . "$MANIFESTO")/$(grep -c . "$MANIFESTO") OK"
  echo "HEAD_inicial    : $HEAD_SHA"
  echo "HEAD_final      : $head_final"
  echo "HEAD_preservado : $([ "$HEAD_SHA" = "$head_final" ] && echo SIM || echo NAO)"
  if [ "$RODAR_VALIDATE" -eq 1 ]; then
    echo "validate        : ${VALIDATE_PASS}/10 PASS"
    echo "test_files      : $(contagem_vitest 'Test Files')"
    echo "tests           : $(contagem_vitest 'Tests')"
  else
    echo "validate        : PULADO (--sem-validate)"
  fi
  echo "uid             : $UID_TAG"
  echo "sudo            : ${SUDO:-nenhum}"
  echo "resultado       : APROVADO"
  echo "================================================="
}

# ---------- Orquestracao ----------

main() {
  HEAD_SHA=""
  VALIDATE_PASS="0"

  parse_args "$@" || exit $?
  detect_env
  etapa_raiz || exit $?
  etapa_hash || exit $?
  etapa_mysql || exit $?
  etapa_npm || exit $?
  etapa_validate || exit $?
  bloco_retorno
  exit "$EXIT_OK"
}

main "$@"
