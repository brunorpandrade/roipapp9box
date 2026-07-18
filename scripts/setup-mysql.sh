#!/usr/bin/env bash
# ROIP APP 9BOX — scripts/setup-mysql.sh
# Bootstrap MySQL versionado para a fundacao das reguas 8 e 9 do
# `npm run validate` (§4). Codifica em regua executavel os aprendizados
# MySQL do §7: L20, L21, L22, L23, L30, L33, L35, L38, L50, L63, L64,
# L65, L69, L70, L71. Introduzido na ME-040a (S115).
#
# Executavel nos dois ambientes:
#  - Claude: root sem sudo.
#  - Manus: user ubuntu com NOPASSWD sudo, sem systemd, sem AppArmor.
#
# Idempotente: se o daemon esta vivo e a credencial canonica bate,
# termina RC=0 sem tocar nada. Se o datadir ja existe, nao re-inicializa.
#
# Exit codes:
#   0 — sucesso (fundacao pronta ou --shutdown/--status conforme flag)
#   7 — fundacao impossivel (com instrucao clara no stderr)
#
# NUNCA grava arquivos no cwd (L70). Progresso vai a stdout; erros a stderr.
# NAO entra no `npm run validate` (L35 — separacao fundacao × produto).

set -o pipefail

# ---------- Constantes canonicas ----------

readonly ROIP_MYSQL_ROOT_PASSWORD='roip_local_root'
readonly ROIP_MYSQL_ROOT="${ROIP_MYSQL_ROOT:-$HOME/.roip_mysql}"
readonly ROIP_MYSQL_DATADIR="$ROIP_MYSQL_ROOT/data"
readonly ROIP_MYSQL_SOCKET="$ROIP_MYSQL_ROOT/run/mysqld.sock"
readonly ROIP_MYSQL_PID_FILE="$ROIP_MYSQL_ROOT/run/mysqld.pid"
readonly ROIP_MYSQL_LOG_ERROR="$ROIP_MYSQL_ROOT/mysqld.err"
readonly ROIP_MYSQL_INIT_FILE="$ROIP_MYSQL_ROOT/init.sql"
readonly ROIP_MYSQL_PORT=3306
readonly ROIP_MYSQL_BIND=127.0.0.1

readonly EXIT_OK=0
readonly EXIT_IMPOSSIBLE=7

SUDO=""

# ---------- Log / err (L70: nada no cwd) ----------

log() {
  printf '[setup-mysql] %s\n' "$*"
}

err() {
  printf '[setup-mysql] ERRO: %s\n' "$*" >&2
}

# ---------- detect_env (L64) ----------

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
  err "ambiente sem root e sem NOPASSWD sudo — impossivel prosseguir"
  err "sugestao: rodar como root ou habilitar NOPASSWD sudo"
  return $EXIT_IMPOSSIBLE
}

# ---------- ensure_mysql_installed (L21/L23) ----------

ensure_mysql_installed() {
  if command -v mysqld >/dev/null 2>&1 \
    && command -v mysql >/dev/null 2>&1 \
    && command -v mysqladmin >/dev/null 2>&1; then
    log "mysql-server ja instalado"
    return 0
  fi
  log "instalando mysql-server via apt-get"
  $SUDO apt-get update >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y mysql-server >/dev/null 2>&1
  local rc=$?
  if [ $rc -ne 0 ]; then
    err "apt-get install mysql-server falhou (RC=$rc)"
    err "sugestao: verificar rede/repositorio ou instalar manualmente"
    return $EXIT_IMPOSSIBLE
  fi
  if ! command -v mysqld >/dev/null 2>&1; then
    err "mysqld ausente apos install (pacote quebrado?)"
    return $EXIT_IMPOSSIBLE
  fi
  log "mysql-server instalado: $(mysqld --version)"
  return 0
}

# ---------- prepare_paths (L65/L70) ----------

prepare_paths() {
  # Traverse ate $HOME para o user mysql (L65: caminho legivel).
  chmod 755 "$HOME" 2>/dev/null || $SUDO chmod 755 "$HOME" 2>/dev/null || true
  mkdir -p "$ROIP_MYSQL_ROOT" "$ROIP_MYSQL_DATADIR" "$(dirname "$ROIP_MYSQL_SOCKET")"
  # init-file com a senha canonica (L33): ALTER USER + FLUSH.
  cat > "$ROIP_MYSQL_INIT_FILE" <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '$ROIP_MYSQL_ROOT_PASSWORD';
FLUSH PRIVILEGES;
EOF
  # Owner mysql em toda a arvore + init-file 644 (L65).
  # $SUDO obrigatorio: quando o script roda como user nao-root, chown
  # para outro usuario exige root (mesmo com NOPASSWD sudo, chown puro
  # falha com 'Operation not permitted').
  $SUDO chown -R mysql:mysql "$ROIP_MYSQL_ROOT"
  local rc=$?
  if [ $rc -ne 0 ]; then
    err "chown -R mysql:mysql em $ROIP_MYSQL_ROOT falhou (RC=$rc)"
    err "sugestao: verificar disponibilidade de sudo/root"
    return $EXIT_IMPOSSIBLE
  fi
  $SUDO chmod 644 "$ROIP_MYSQL_INIT_FILE"
  # log-error precisa existir gravavel pelo mysql (L30).
  $SUDO touch "$ROIP_MYSQL_LOG_ERROR"
  $SUDO chown mysql:mysql "$ROIP_MYSQL_LOG_ERROR"
  rc=$?
  if [ $rc -ne 0 ]; then
    err "chown $ROIP_MYSQL_LOG_ERROR falhou (RC=$rc)"
    return $EXIT_IMPOSSIBLE
  fi
  log "paths preparados em: $ROIP_MYSQL_ROOT"
  return 0
}

# ---------- is_datadir_initialized ----------

is_datadir_initialized() {
  # Presenca do subdir do system tablespace = init rodou.
  [ -d "$ROIP_MYSQL_DATADIR/mysql" ]
}

# ---------- initialize_datadir (L30/L38) ----------

initialize_datadir() {
  if is_datadir_initialized; then
    log "datadir ja inicializado — reaproveitando (L20)"
    return 0
  fi
  log "inicializando datadir em: $ROIP_MYSQL_DATADIR"
  if [ "$(id -u)" -eq 0 ]; then
    mysqld --no-defaults --initialize-insecure --user=mysql \
      --datadir="$ROIP_MYSQL_DATADIR" \
      --socket="$ROIP_MYSQL_SOCKET" \
      --pid-file="$ROIP_MYSQL_PID_FILE" \
      --log-error="$ROIP_MYSQL_LOG_ERROR" \
      --bind-address="$ROIP_MYSQL_BIND" \
      --port="$ROIP_MYSQL_PORT" \
      --mysqlx=OFF
  else
    sudo -u mysql mysqld --no-defaults --initialize-insecure \
      --datadir="$ROIP_MYSQL_DATADIR" \
      --socket="$ROIP_MYSQL_SOCKET" \
      --pid-file="$ROIP_MYSQL_PID_FILE" \
      --log-error="$ROIP_MYSQL_LOG_ERROR" \
      --bind-address="$ROIP_MYSQL_BIND" \
      --port="$ROIP_MYSQL_PORT" \
      --mysqlx=OFF
  fi
  local rc=$?
  if [ $rc -ne 0 ]; then
    err "initialize falhou (RC=$rc); limpando datadir parcial"
    rm -rf "$ROIP_MYSQL_DATADIR"/*
    err "sugestao: consultar $ROIP_MYSQL_LOG_ERROR"
    return $EXIT_IMPOSSIBLE
  fi
  log "datadir inicializado com sucesso"
  return 0
}

# ---------- is_daemon_alive / is_credential_valid (L22) ----------

is_daemon_alive() {
  # ping: RC=0 = daemon respondendo na porta (L22 — nao prova credencial).
  mysqladmin -h"$ROIP_MYSQL_BIND" -P"$ROIP_MYSQL_PORT" --connect-timeout=2 ping >/dev/null 2>&1
}

is_credential_valid() {
  # SELECT 1 real com credencial canonica (L22 — a unica prova real).
  mysql -h"$ROIP_MYSQL_BIND" -P"$ROIP_MYSQL_PORT" -uroot -p"$ROIP_MYSQL_ROOT_PASSWORD" \
    -e "SELECT 1" >/dev/null 2>&1
}

# ---------- start_daemon (L30/L38/L69) ----------

start_daemon() {
  log "subindo mysqld (daemonize + init-file)"
  if [ "$(id -u)" -eq 0 ]; then
    setsid mysqld --no-defaults --user=mysql --daemonize \
      --datadir="$ROIP_MYSQL_DATADIR" \
      --socket="$ROIP_MYSQL_SOCKET" \
      --pid-file="$ROIP_MYSQL_PID_FILE" \
      --log-error="$ROIP_MYSQL_LOG_ERROR" \
      --bind-address="$ROIP_MYSQL_BIND" \
      --port="$ROIP_MYSQL_PORT" \
      --mysqlx=OFF \
      --init-file="$ROIP_MYSQL_INIT_FILE" >/dev/null 2>&1
  else
    sudo -u mysql setsid mysqld --no-defaults --daemonize \
      --datadir="$ROIP_MYSQL_DATADIR" \
      --socket="$ROIP_MYSQL_SOCKET" \
      --pid-file="$ROIP_MYSQL_PID_FILE" \
      --log-error="$ROIP_MYSQL_LOG_ERROR" \
      --bind-address="$ROIP_MYSQL_BIND" \
      --port="$ROIP_MYSQL_PORT" \
      --mysqlx=OFF \
      --init-file="$ROIP_MYSQL_INIT_FILE" >/dev/null 2>&1
  fi
  local rc=$?
  if [ $rc -ne 0 ]; then
    err "mysqld --daemonize retornou RC=$rc"
    err "consulte $ROIP_MYSQL_LOG_ERROR"
    return $EXIT_IMPOSSIBLE
  fi
  # Aguardar ate 20s (L30: ~8-10s antes do primeiro ping bem-sucedido).
  local i=0
  while [ $i -lt 20 ]; do
    if is_daemon_alive; then
      log "daemon vivo apos ${i}s"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  err "timeout de 20s sem ping do daemon"
  err "consulte $ROIP_MYSQL_LOG_ERROR"
  return $EXIT_IMPOSSIBLE
}

# ---------- shutdown_daemon (L71) ----------

shutdown_daemon() {
  if ! is_daemon_alive; then
    log "nenhum daemon vivo — nada a desligar"
    return 0
  fi
  log "desligando daemon"
  mysqladmin -h"$ROIP_MYSQL_BIND" -P"$ROIP_MYSQL_PORT" \
    -uroot -p"$ROIP_MYSQL_ROOT_PASSWORD" shutdown >/dev/null 2>&1 || true
  # Aguardar ate 10s pelo shutdown limpo.
  local i=0
  while [ $i -lt 10 ]; do
    if ! is_daemon_alive; then
      log "daemon desligado"
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  # Fallback 1: kill via pid file.
  if [ -f "$ROIP_MYSQL_PID_FILE" ]; then
    local pid
    pid=$(cat "$ROIP_MYSQL_PID_FILE" 2>/dev/null || echo "")
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      log "kill enviado ao PID $pid"
    fi
  fi
  # Fallback 2 (L71 literal): sem processo orfao entre tarefas — mata
  # todo mysqld que aponte para o mesmo datadir (cobre re-execucoes
  # sucessivas em que instancias anteriores ficaram vivas).
  pkill -f "mysqld.*--datadir=$ROIP_MYSQL_DATADIR" 2>/dev/null || true
  sleep 1
  return 0
}

# ---------- cmd_up (fluxo canonico) ----------

cmd_up() {
  detect_env || return $?
  ensure_mysql_installed || return $?
  prepare_paths || return $?
  if is_daemon_alive; then
    if is_credential_valid; then
      log "daemon vivo com credencial canonica — nada a fazer (idempotente L20)"
      return $EXIT_OK
    fi
    err "daemon vivo mas credencial canonica invalida"
    err "sugestao: rode '$0 --reset' se aceitavel destruir o datadir"
    return $EXIT_IMPOSSIBLE
  fi
  initialize_datadir || return $?
  start_daemon || return $?
  if is_credential_valid; then
    log "fundacao MySQL pronta: mysql://root:***@$ROIP_MYSQL_BIND:$ROIP_MYSQL_PORT/"
    return $EXIT_OK
  fi
  err "daemon vivo mas SELECT 1 falhou com credencial canonica"
  err "sugestao: consultar $ROIP_MYSQL_LOG_ERROR"
  return $EXIT_IMPOSSIBLE
}

# ---------- cmd_reset (destrutivo, opt-in) ----------

cmd_reset() {
  log "reset: destruindo datadir $ROIP_MYSQL_ROOT"
  detect_env || return $?
  shutdown_daemon
  if [ -d "$ROIP_MYSQL_ROOT" ]; then
    rm -rf "$ROIP_MYSQL_ROOT"
    log "datadir removido"
  fi
  cmd_up
}

# ---------- cmd_shutdown ----------

cmd_shutdown() {
  detect_env || return $?
  shutdown_daemon
  return $EXIT_OK
}

# ---------- cmd_status ----------

cmd_status() {
  if is_daemon_alive; then
    if is_credential_valid; then
      log "status: daemon vivo, credencial canonica OK"
      return $EXIT_OK
    fi
    err "status: daemon vivo, credencial canonica INVALIDA"
    return $EXIT_IMPOSSIBLE
  fi
  err "status: daemon nao responde"
  return $EXIT_IMPOSSIBLE
}

# ---------- cmd_help ----------

cmd_help() {
  cat <<EOF
[setup-mysql] scripts/setup-mysql.sh — bootstrap MySQL (S115, ME-040a)

Uso:
  scripts/setup-mysql.sh              sobe fundacao (idempotente)
  scripts/setup-mysql.sh --shutdown   desliga o daemon
  scripts/setup-mysql.sh --status     verifica daemon + credencial
  scripts/setup-mysql.sh --reset      destroi datadir e re-inicializa
  scripts/setup-mysql.sh --help       esta mensagem

Fundacao MySQL das reguas 8-9 do npm run validate.
Path root: \$HOME/.roip_mysql (override: env ROIP_MYSQL_ROOT).
Credencial canonica: root:***@127.0.0.1:3306

Exit codes: 0 sucesso, 7 fundacao impossivel.
EOF
  return $EXIT_OK
}

# ---------- main ----------

main() {
  case "${1:-up}" in
    up | "") cmd_up ;;
    --shutdown) cmd_shutdown ;;
    --status) cmd_status ;;
    --reset) cmd_reset ;;
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
