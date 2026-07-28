#!/usr/bin/env bash
# ROIP APP 9BOX — scripts/preparar_ambiente.sh (ME-050/51, N3/S222).
#
# Prepara o ambiente do runtime Manus para a toolchain PDF do
# `puppeteer-core` (S259/S260). Instala idempotente:
#   - chromium-browser (binario apontado por PUPPETEER_EXECUTABLE_PATH).
#   - fontes essenciais para renderizacao editorial deterministica
#     (Liberation, DejaVu, Noto — cobrem Latin + acentos PT-BR).
#
# Executavel nos dois ambientes:
#   - Claude: root sem sudo.
#   - Manus: user ubuntu com NOPASSWD sudo.
#
# Idempotente: se todos os pacotes canonicos ja estao presentes, sai
# RC=0 sem tocar nada. `apt-get install` ja e idempotente por natureza
# (nao reinstala o que ja esta na versao atual do repo).
#
# Racional canonico (S259): puppeteer-core NAO baixa chromium via npm
# (o `npm install` no sandbox Claude falharia por bloqueio de
# googleapis, gate S218). Este script assume a responsabilidade da
# instalacao do binario no ambiente correto — o de execucao do
# validate/tests reais (Manus). Em Claude, este script tambem pode
# rodar; o chromium fica instalado mas nunca e exercitado pelos
# testes (que usam PdfRendererFacade stub — S260).
#
# NUNCA grava arquivos no cwd (L70). Progresso vai a stdout; erros a
# stderr. NAO entra no `npm run validate` (separacao fundacao x produto,
# L35 — o `ciclo_me.sh` e a orquestracao produto).
#
# Exit codes:
#   0 — sucesso (ambiente pronto ou ja preparado)
#   7 — instalacao impossivel (sem root, sem NOPASSWD sudo, ou pacote
#       ausente do repo apt)

set -o pipefail

readonly EXIT_OK=0
readonly EXIT_IMPOSSIBLE=7

# Pacotes canonicos exigidos pela toolchain PDF (S259 + S260).
readonly PACOTES_CANONICOS=(
  chromium-browser
  fonts-liberation
  fonts-dejavu-core
  fonts-noto-core
  ca-certificates
)

SUDO=""

log() {
  printf '[preparar_ambiente] %s\n' "$*"
}

err() {
  printf '[preparar_ambiente] ERRO: %s\n' "$*" >&2
}

# ---------- detect_env (padrao canonico L64) ----------

detect_env() {
  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
    log "ambiente: root (sem sudo)"
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    SUDO="sudo"
    log "ambiente: user nao-root com NOPASSWD sudo"
    return 0
  fi
  err "ambiente sem root e sem NOPASSWD sudo — impossivel instalar pacotes"
  err "sugestao: rodar como root ou habilitar NOPASSWD sudo"
  return $EXIT_IMPOSSIBLE
}

# ---------- ensure_pacotes_canonicos ----------

ensure_pacotes_canonicos() {
  local faltando=()
  local p
  for p in "${PACOTES_CANONICOS[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed"; then
      faltando+=("$p")
    fi
  done
  if [ "${#faltando[@]}" -eq 0 ]; then
    log "todos os pacotes canonicos ja instalados (${#PACOTES_CANONICOS[@]}/${#PACOTES_CANONICOS[@]})"
    return 0
  fi
  log "instalando ${#faltando[@]} pacote(s): ${faltando[*]}"
  $SUDO apt-get update >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y "${faltando[@]}" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    err "apt-get install falhou (RC=$rc)"
    err "sugestao: verificar rede/repositorio ou instalar manualmente"
    return $EXIT_IMPOSSIBLE
  fi
  # Reverificacao pos-install.
  local ainda_faltando=()
  for p in "${faltando[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed"; then
      ainda_faltando+=("$p")
    fi
  done
  if [ "${#ainda_faltando[@]}" -ne 0 ]; then
    err "pacote(s) ainda ausente(s) apos install: ${ainda_faltando[*]}"
    return $EXIT_IMPOSSIBLE
  fi
  log "pacotes instalados com sucesso"
  return 0
}

# ---------- verify_chromium_executavel ----------

verify_chromium_executavel() {
  local candidatos=(
    /usr/bin/chromium-browser
    /usr/bin/chromium
    /snap/bin/chromium
  )
  local achado=""
  local c
  for c in "${candidatos[@]}"; do
    if [ -x "$c" ]; then
      achado="$c"
      break
    fi
  done
  if [ -z "$achado" ]; then
    err "binario chromium nao encontrado em nenhum caminho canonico"
    err "candidatos verificados: ${candidatos[*]}"
    return $EXIT_IMPOSSIBLE
  fi
  log "binario chromium disponivel em: $achado"
  log "configure PUPPETEER_EXECUTABLE_PATH=$achado no .env do runtime"
  return 0
}

# ---------- cmd_up (fluxo canonico) ----------

cmd_up() {
  detect_env || return $?
  ensure_pacotes_canonicos || return $?
  verify_chromium_executavel || return $?
  log "ambiente Manus pronto para a toolchain PDF (S259 + S260)"
  return $EXIT_OK
}

# ---------- cmd_status ----------

cmd_status() {
  local ok=1
  local p
  local instalados=0
  for p in "${PACOTES_CANONICOS[@]}"; do
    if dpkg-query -W -f='${Status}' "$p" 2>/dev/null | grep -q "install ok installed"; then
      instalados=$((instalados + 1))
    fi
  done
  log "status: pacotes ${instalados}/${#PACOTES_CANONICOS[@]} instalados"
  if [ "$instalados" -ne "${#PACOTES_CANONICOS[@]}" ]; then
    ok=0
  fi
  verify_chromium_executavel >/dev/null 2>&1 || ok=0
  if [ "$ok" -eq 1 ]; then
    log "status: ambiente pronto"
    return $EXIT_OK
  fi
  err "status: ambiente incompleto"
  return $EXIT_IMPOSSIBLE
}

# ---------- cmd_help ----------

cmd_help() {
  cat <<EOF
[preparar_ambiente] scripts/preparar_ambiente.sh — ME-050/51 (N3/S222)

Uso:
  scripts/preparar_ambiente.sh              instala pacotes canonicos (idempotente)
  scripts/preparar_ambiente.sh --status     verifica pacotes + binario chromium
  scripts/preparar_ambiente.sh --help       esta mensagem

Prepara o runtime Manus para a toolchain PDF do puppeteer-core:
chromium-browser + fontes essenciais. Fora do npm run validate (L35).

Exit codes: 0 sucesso, 7 instalacao impossivel.
EOF
  return $EXIT_OK
}

# ---------- main ----------

main() {
  case "${1:-up}" in
    up | "") cmd_up ;;
    --status) cmd_status ;;
    --help | -h) cmd_help ;;
    *)
      err "flag desconhecida: $1"
      cmd_help
      return $EXIT_IMPOSSIBLE
      ;;
  esac
}

main "$@"
exit $?
