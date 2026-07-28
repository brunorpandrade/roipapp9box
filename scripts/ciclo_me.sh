#!/usr/bin/env bash
# ROIP APP 9BOX — scripts/ciclo_me.sh (ME-050/51, N4/S223).
#
# Orquestrador canonico do ciclo de composicao de uma ME no lado
# Claude. Encadeia as etapas obrigatorias em ordem canonica, com exit
# code isolado por etapa (RV-01 corolario) e output persistido para
# auditoria via UID_TAG.
#
# Etapas canonicas (todas com exit code isolado):
#   1. Raiz do repositorio confirmada por `git rev-parse`.
#   2. HEAD baseline registrado.
#   3. Lista de arquivos alvo lida do MANIFESTO textual (uma linha por
#      arquivo, path relativo a raiz).
#   4. `prettier --write` sobre a lista alvo (S002 — formato canonico
#      antes do hash).
#   5. Manifesto de hashes SHA-256 gerado pos-`prettier --write`
#      (RV-02: hash deste manifesto e a referencia usada pelo
#      `verificar_me.sh` no clone Manus).
#   6. `tsc --noEmit` (S007 estendido — o passo 2 da regua canonica).
#   7. `eslint .` — o passo 3 da regua.
#   8. `vitest run` dirigido aos arquivos de teste da ME (input
#      opcional VITEST_FILES). Sem input roda a suite inteira do vitest.
#   9. `npm run validate` (a regua canonica de 10 passos).
#  10. ZIP deterministico com timestamps 2026-01-01 UTC (S002),
#      contendo os arquivos alvo + o manifesto de hashes.
#
# Convencoes canonicas herdadas do `verificar_me.sh` e `setup-mysql.sh`:
#   - NUNCA grava no cwd (L70). Todos os arquivos operacionais vao
#     para `${TMPDIR:-/tmp}` com UID_TAG `$(id -u)` no nome (L78).
#   - `$SUDO` condicional (L74/L85): resolvido por deteccao. Este
#     script nao precisa de privilegio; a deteccao existe apenas para
#     o bloco de retorno.
#   - Progresso em stdout; erros em stderr.
#   - Cada etapa e chamada dentro de uma funcao dedicada, exit code
#     capturado antes de qualquer pipe (L02).
#
# Uso canonico:
#
#   bash scripts/ciclo_me.sh <manifesto-in.txt> <output.zip>
#                             [--no-validate] [--tests <padroes>]
#
#     <manifesto-in.txt>   arquivo com UMA linha por arquivo alvo
#                          (path relativo a raiz do repositorio),
#                          coberto por [NOVO] ou [EDIT] da ME.
#     <output.zip>         path do ZIP a ser produzido; sobrescreve
#                          se existir.
#     --no-validate        pula o passo 9 (uso de diagnostico apenas —
#                          o dispatch canonico exige validate 10/10).
#     --tests <padroes>    padroes vitest (globs) dos arquivos de teste
#                          desta ME. Passado a `vitest run` no passo 8.
#                          Sem esta flag, o passo 8 roda a suite inteira.
#
# Exit codes:
#   0 — ciclo completo aprovado
#   2 — uso incorreto (arquivos ausentes, flags invalidas)
#   3 — nao esta na raiz de um clone do repositorio
#   4 — prettier falhou
#   5 — geracao do manifesto SHA-256 falhou
#   6 — tsc reprovou
#   7 — eslint reprovou
#   8 — vitest reprovou
#   9 — `npm run validate` reprovou
#  10 — geracao do ZIP falhou

set -o pipefail

# ---------- Constantes canonicas ----------

readonly EXIT_OK=0
readonly EXIT_USO=2
readonly EXIT_RAIZ=3
readonly EXIT_PRETTIER=4
readonly EXIT_HASH=5
readonly EXIT_TSC=6
readonly EXIT_ESLINT=7
readonly EXIT_VITEST=8
readonly EXIT_VALIDATE=9
readonly EXIT_ZIP=10

readonly UID_TAG="$(id -u)"
readonly OUT_DIR="${TMPDIR:-/tmp}"
readonly OUT_PRETTIER="$OUT_DIR/roip_ciclo_me_prettier_${UID_TAG}.txt"
readonly OUT_TSC="$OUT_DIR/roip_ciclo_me_tsc_${UID_TAG}.txt"
readonly OUT_ESLINT="$OUT_DIR/roip_ciclo_me_eslint_${UID_TAG}.txt"
readonly OUT_VITEST="$OUT_DIR/roip_ciclo_me_vitest_${UID_TAG}.txt"
readonly OUT_VALIDATE="$OUT_DIR/roip_ciclo_me_validate_${UID_TAG}.txt"
readonly OUT_MANIFESTO="$OUT_DIR/roip_ciclo_me_manifesto_${UID_TAG}.sha256"
readonly OUT_ZIP_BUILD="$OUT_DIR/roip_ciclo_me_zip_${UID_TAG}.log"

SUDO=""
MANIFESTO_IN=""
OUTPUT_ZIP=""
RODAR_VALIDATE=1
VITEST_PATTERNS=""

# ---------- Log ----------

log() {
  printf '[ciclo_me] %s\n' "$*"
}

err() {
  printf '[ciclo_me] ERRO: %s\n' "$*" >&2
}

# ---------- Argumentos ----------

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-validate)
        RODAR_VALIDATE=0
        shift
        ;;
      --tests)
        if [ "$#" -lt 2 ]; then
          err "--tests exige um argumento (padroes vitest)"
          return "$EXIT_USO"
        fi
        VITEST_PATTERNS="$2"
        shift 2
        ;;
      -*)
        err "opcao desconhecida: $1"
        return "$EXIT_USO"
        ;;
      *)
        if [ -z "$MANIFESTO_IN" ]; then
          MANIFESTO_IN="$1"
        elif [ -z "$OUTPUT_ZIP" ]; then
          OUTPUT_ZIP="$1"
        else
          err "argumentos posicionais em excesso: $1"
          return "$EXIT_USO"
        fi
        shift
        ;;
    esac
  done

  if [ -z "$MANIFESTO_IN" ] || [ -z "$OUTPUT_ZIP" ]; then
    err "uso: bash scripts/ciclo_me.sh <manifesto-in.txt> <output.zip> [--no-validate] [--tests <padroes>]"
    return "$EXIT_USO"
  fi
  if [ ! -r "$MANIFESTO_IN" ]; then
    err "manifesto-in nao encontrado ou ilegivel: $MANIFESTO_IN"
    return "$EXIT_USO"
  fi
  return 0
}

# ---------- Deteccao de ambiente ----------

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

# ---------- Etapa 1-2: raiz + HEAD ----------

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
  log "HEAD baseline: $HEAD_SHA"
  return 0
}

# ---------- Le a lista de arquivos alvo ----------

le_lista_alvo() {
  # Uma linha por arquivo, path relativo a raiz. Comentarios `#` e
  # linhas em branco sao ignorados.
  ALVO=()
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    # Trim inline.
    line="${line%%$'\r'*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    case "$line" in
      ""|"#"*) continue ;;
    esac
    if [ ! -e "$line" ]; then
      err "arquivo alvo do manifesto nao existe no clone: $line"
      return "$EXIT_USO"
    fi
    ALVO+=("$line")
  done <"$MANIFESTO_IN"
  if [ "${#ALVO[@]}" -eq 0 ]; then
    err "manifesto-in nao contem nenhum arquivo alvo valido"
    return "$EXIT_USO"
  fi
  log "manifesto: ${#ALVO[@]} arquivo(s) alvo"
  return 0
}

# ---------- Etapa 4: prettier --write ----------

etapa_prettier() {
  # Prettier so aceita extensoes conhecidas. Filtramos a lista alvo
  # para incluir apenas os arquivos que ele suporta canonicamente no
  # projeto — outros artefatos (scripts .sh, templates .tpl, SQL etc.)
  # passam intactos pelo ciclo.
  local formataveis=()
  local f
  for f in "${ALVO[@]}"; do
    case "$f" in
      *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.html|*.css)
        formataveis+=("$f")
        ;;
    esac
  done
  if [ "${#formataveis[@]}" -eq 0 ]; then
    log "prettier: nenhum arquivo com extensao formatavel — pulado"
    return 0
  fi
  log "prettier --write nos ${#formataveis[@]}/${#ALVO[@]} arquivo(s) formatavel(is)"
  npx prettier --write "${formataveis[@]}" >"$OUT_PRETTIER" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "prettier falhou (RC=$rc); detalhe em: $OUT_PRETTIER"
    tail -20 "$OUT_PRETTIER" >&2
    return "$EXIT_PRETTIER"
  fi
  log "prettier ok"
  return 0
}

# ---------- Etapa 5: manifesto SHA-256 pos-prettier ----------

etapa_manifesto() {
  log "gerando manifesto SHA-256 pos-prettier em: $OUT_MANIFESTO"
  # Zera antes.
  : >"$OUT_MANIFESTO"
  local rc=0
  local f
  for f in "${ALVO[@]}"; do
    sha256sum "$f" >>"$OUT_MANIFESTO" 2>&1 || rc=1
  done
  if [ "$rc" -ne 0 ]; then
    err "geracao do manifesto falhou; detalhe em: $OUT_MANIFESTO"
    return "$EXIT_HASH"
  fi
  local total
  total="$(grep -c . "$OUT_MANIFESTO")"
  if [ "$total" -ne "${#ALVO[@]}" ]; then
    err "manifesto incompleto: $total/${#ALVO[@]}"
    return "$EXIT_HASH"
  fi
  log "manifesto: $total hash(es) gerado(s)"
  return 0
}

# ---------- Etapa 6: tsc --noEmit ----------

etapa_tsc() {
  log "tsc --noEmit"
  npx tsc --noEmit >"$OUT_TSC" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "tsc reprovou (RC=$rc); detalhe em: $OUT_TSC"
    tail -20 "$OUT_TSC" >&2
    return "$EXIT_TSC"
  fi
  log "tsc ok"
  return 0
}

# ---------- Etapa 7: eslint . ----------

etapa_eslint() {
  log "eslint ."
  npx eslint . >"$OUT_ESLINT" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "eslint reprovou (RC=$rc); detalhe em: $OUT_ESLINT"
    tail -20 "$OUT_ESLINT" >&2
    return "$EXIT_ESLINT"
  fi
  log "eslint ok"
  return 0
}

# ---------- Etapa 8: vitest dirigido ----------

etapa_vitest() {
  if [ -z "$VITEST_PATTERNS" ]; then
    log "vitest dirigido: PULADO (sem --tests; o passo 9 validate cobre a suite inteira)"
    return 0
  fi
  log "vitest run dirigido (padroes: $VITEST_PATTERNS)"
  # shellcheck disable=SC2086 -- padroes intencionalmente splitados
  npx vitest run $VITEST_PATTERNS >"$OUT_VITEST" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "vitest reprovou (RC=$rc); detalhe em: $OUT_VITEST"
    tail -30 "$OUT_VITEST" >&2
    return "$EXIT_VITEST"
  fi
  log "vitest dirigido ok"
  return 0
}

# ---------- Etapa 9: npm run validate ----------

etapa_validate() {
  if [ "$RODAR_VALIDATE" -eq 0 ]; then
    log "validate PULADO por --no-validate (uso de diagnostico)"
    return 0
  fi
  log "npm run validate (regua canonica de 10 passos)"
  npm run validate >"$OUT_VALIDATE" 2>&1
  local rc=$?
  VALIDATE_PASS="$(grep -c '^PASS: ' "$OUT_VALIDATE")"
  if [ "$rc" -ne 0 ]; then
    err "regua reprovou (RC=$rc); detalhe em: $OUT_VALIDATE"
    grep -E '^(FAIL|PASS): ' "$OUT_VALIDATE" >&2
    return "$EXIT_VALIDATE"
  fi
  # Extrai contagem do vitest do log do validate (passo 9 canonico).
  VITEST_TEST_FILES="$(sed 's/\x1b\[[0-9;]*m//g' "$OUT_VALIDATE" \
    | grep -aE '^ *Test Files +[0-9]+ passed' | tail -1 | tr -s ' ' | sed 's/^ //')"
  VITEST_TESTS="$(sed 's/\x1b\[[0-9;]*m//g' "$OUT_VALIDATE" \
    | grep -aE '^ *Tests +[0-9]+ passed' | tail -1 | tr -s ' ' | sed 's/^ //')"
  log "regua aprovada: ${VALIDATE_PASS}/10 PASS"
  return 0
}

# ---------- Etapa 10: ZIP deterministico ----------

etapa_zip() {
  log "gerando ZIP deterministico em: $OUTPUT_ZIP"
  # Python 3 embutido — timestamp fixo 2026-01-01 UTC (S002).
  # `manifest.sha256` viaja dentro do ZIP.
  python3 - "$OUTPUT_ZIP" "$OUT_MANIFESTO" "${ALVO[@]}" \
    >"$OUT_ZIP_BUILD" 2>&1 <<'PYEOF'
import os
import sys
import zipfile
from pathlib import Path

output_zip = sys.argv[1]
manifest = sys.argv[2]
alvos = sys.argv[3:]

# Timestamp canonico deterministico: 2026-01-01 00:00:00 UTC (S002).
DATE_TUPLE = (2026, 1, 1, 0, 0, 0)

def _write(zf, arcname, source_path):
    info = zipfile.ZipInfo(arcname)
    info.date_time = DATE_TUPLE
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    with open(source_path, "rb") as src:
        data = src.read()
    zf.writestr(info, data)

with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
    # Ordenacao canonica alfabetica (determinismo cross-execucao).
    for path in sorted(alvos):
        arcname = path
        _write(zf, arcname, path)
    _write(zf, "manifest.sha256", manifest)

print(f"OK: {output_zip}")
print(f"conteudo: {len(alvos) + 1} entradas")
PYEOF
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "geracao do ZIP falhou (RC=$rc); detalhe em: $OUT_ZIP_BUILD"
    tail -20 "$OUT_ZIP_BUILD" >&2
    return "$EXIT_ZIP"
  fi
  ZIP_SHA="$(sha256sum "$OUTPUT_ZIP" | cut -d' ' -f1)"
  ZIP_BYTES="$(wc -c <"$OUTPUT_ZIP" | tr -d ' ')"
  log "ZIP ok: $ZIP_BYTES bytes, sha256=$ZIP_SHA"
  return 0
}

# ---------- Bloco de retorno ----------

bloco_retorno() {
  echo ""
  echo "==================== RETORNO ===================="
  echo "script          : scripts/ciclo_me.sh"
  echo "script_sha256   : $(sha256sum "$0" | cut -d' ' -f1)"
  echo "manifesto-in    : $MANIFESTO_IN"
  echo "alvos           : ${#ALVO[@]}"
  echo "HEAD_baseline   : $HEAD_SHA"
  if [ "$RODAR_VALIDATE" -eq 1 ]; then
    echo "validate        : ${VALIDATE_PASS}/10 PASS"
    echo "test_files      : ${VITEST_TEST_FILES:-n/a}"
    echo "tests           : ${VITEST_TESTS:-n/a}"
  else
    echo "validate        : PULADO (--no-validate)"
  fi
  echo "manifesto_sha   : $(sha256sum "$OUT_MANIFESTO" | cut -d' ' -f1)"
  echo "zip             : $OUTPUT_ZIP"
  echo "zip_sha256      : ${ZIP_SHA:-n/a}"
  echo "zip_bytes       : ${ZIP_BYTES:-n/a}"
  echo "uid             : $UID_TAG"
  echo "sudo            : ${SUDO:-nenhum}"
  echo "resultado       : APROVADO"
  echo "================================================="
}

# ---------- Orquestracao ----------

main() {
  HEAD_SHA=""
  VALIDATE_PASS="0"
  VITEST_TEST_FILES=""
  VITEST_TESTS=""
  ZIP_SHA=""
  ZIP_BYTES=""
  ALVO=()

  parse_args "$@" || exit $?
  detect_env
  etapa_raiz || exit $?
  le_lista_alvo || exit $?
  etapa_prettier || exit $?
  etapa_manifesto || exit $?
  etapa_tsc || exit $?
  etapa_eslint || exit $?
  etapa_vitest || exit $?
  etapa_validate || exit $?
  etapa_zip || exit $?
  bloco_retorno
  exit "$EXIT_OK"
}

main "$@"
