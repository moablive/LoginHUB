#!/usr/bin/env bash
# =============================================================================
# redeploy.sh — Republica (redeploy) os projetos Docker do LifeBusinessSuit.
#
# Descobre AUTOMATICAMENTE cada subpasta que contém um docker-compose.yml
# (MailAPP, MoneyAPP, TodoAPP e qualquer projeto futuro como o NotesAPP),
# garante a rede externa `awl_network` e roda o padrão do repositório:
#
#     docker compose --env-file .env up -d --build
#
# Sem argumentos, num terminal, ele PERGUNTA qual app republicar (menu).
# Em cron/pipe (sem terminal) e sem argumentos = republica TODOS os projetos.
#
# Exemplos:
#   ./redeploy.sh                 # menu interativo: escolha qual app (ou TODOS)
#   ./redeploy.sh MoneyAPP        # só o MoneyAPP
#   ./redeploy.sh Money Todo      # dois projetos (case-insensitive, prefixo ok)
#   ./redeploy.sh --list          # lista os projetos descobertos
#   ./redeploy.sh --no-build App  # sobe sem rebuildar imagem
#   ./redeploy.sh --down MailAPP  # derruba e recria do zero (recreate limpo)
#   ./redeploy.sh --pull --prune  # atualiza imagens base e limpa dangling
# =============================================================================
set -uo pipefail

# --- Configuração ------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK="awl_network"
COMPOSE_FILE="docker-compose.yml"

# --- Cores (desativa se não for terminal) ------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
  C_RESET=''; C_BOLD=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''
fi
log()  { printf '%s\n' "${C_BLUE}▶${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GREEN}✔${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YELLOW}⚠${C_RESET} $*" >&2; }
err()  { printf '%s\n' "${C_RED}✗${C_RESET} $*" >&2; }

# --- Flags -------------------------------------------------------------------
DO_BUILD=1
DO_DOWN=0
DO_PULL=0
DO_PRUNE=0
JUST_LIST=0
SELECTED=()

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)     usage 0 ;;
    -l|--list)     JUST_LIST=1 ;;
    --no-build)    DO_BUILD=0 ;;
    --down)        DO_DOWN=1 ;;
    --pull)        DO_PULL=1 ;;
    --prune)       DO_PRUNE=1 ;;
    --)            shift; while [[ $# -gt 0 ]]; do SELECTED+=("$1"); shift; done; break ;;
    -*)            err "Opção desconhecida: $1"; usage 1 ;;
    *)             SELECTED+=("$1") ;;
  esac
  shift
done

# --- Pré-requisitos ----------------------------------------------------------
command -v docker >/dev/null 2>&1 || { err "docker não encontrado no PATH."; exit 1; }
docker compose version >/dev/null 2>&1 || { err "'docker compose' (v2) não disponível."; exit 1; }

# --- Descoberta de projetos --------------------------------------------------
# Um "projeto" é qualquer subpasta imediata de ROOT_DIR com um docker-compose.yml.
mapfile -t ALL_PROJECTS < <(
  find "$ROOT_DIR" -name "node_modules" -prune -o -mindepth 2 -maxdepth 3 -name "$COMPOSE_FILE" -printf '%h\n' \
    | sort -u
)

if [[ ${#ALL_PROJECTS[@]} -eq 0 ]]; then
  err "Nenhum projeto com $COMPOSE_FILE encontrado em $ROOT_DIR"
  exit 1
fi

if [[ $JUST_LIST -eq 1 ]]; then
  log "Projetos descobertos em ${C_BOLD}$ROOT_DIR${C_RESET}:"
  for p in "${ALL_PROJECTS[@]}"; do printf '   • %s\n' "$(basename "$p")"; done
  exit 0
fi

# --- Menu interativo (quando nenhum projeto é passado por argumento) ---------
# Só pergunta se a saída for um terminal; em cron/pipe cai no comportamento
# padrão (todos) para não travar a automação esperando input.
if [[ ${#SELECTED[@]} -eq 0 && -t 0 ]]; then
  printf '%s\n' "${C_BOLD}Qual app você quer republicar?${C_RESET}"
  i=1
  for p in "${ALL_PROJECTS[@]}"; do
    printf '   %s%d%s) %s\n' "$C_BOLD" "$i" "$C_RESET" "$(basename "$p")"
    i=$((i + 1))
  done
  printf '   %s0%s) TODOS\n' "$C_BOLD" "$C_RESET"
  printf '   %sq%s) sair\n' "$C_BOLD" "$C_RESET"
  printf '%s' "${C_BLUE}▶${C_RESET} Escolha (número, nome, ou vários separados por espaço): "
  read -r -a REPLY_ARR

  if [[ ${#REPLY_ARR[@]} -eq 0 ]]; then
    log "Nada escolhido — cancelado."; exit 0
  fi

  for choice in "${REPLY_ARR[@]}"; do
    case "$choice" in
      q|Q|sair) log "Cancelado."; exit 0 ;;
      0|todos|TODOS|all) SELECTED=(); break ;;   # vazio => todos, resolvido abaixo
      *[!0-9]*) SELECTED+=("$choice") ;;         # não-numérico: trata como nome
      *)                                          # índice numérico
        idx=$((choice - 1))
        if [[ $idx -ge 0 && $idx -lt ${#ALL_PROJECTS[@]} ]]; then
          SELECTED+=("$(basename "${ALL_PROJECTS[$idx]}")")
        else
          err "Opção inválida: '$choice'"; exit 1
        fi
        ;;
    esac
  done
fi

# --- Resolve seleção (nome/prefixo case-insensitive) -------------------------
TARGETS=()
if [[ ${#SELECTED[@]} -eq 0 ]]; then
  TARGETS=("${ALL_PROJECTS[@]}")
else
  for want in "${SELECTED[@]}"; do
    match=""
    for p in "${ALL_PROJECTS[@]}"; do
      name="$(basename "$p")"
      if [[ "${name,,}" == "${want,,}" || "${name,,}" == "${want,,}"* ]]; then
        match="$p"; break
      fi
    done
    if [[ -n "$match" ]]; then
      TARGETS+=("$match")
    else
      err "Projeto não encontrado para '$want' (use --list para ver os nomes)."
      exit 1
    fi
  done
fi

# --- Garante a rede externa compartilhada ------------------------------------
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  log "Rede '$NETWORK' não existe — criando..."
  docker network create "$NETWORK" >/dev/null && ok "Rede '$NETWORK' criada."
fi

# --- Redeploy ----------------------------------------------------------------
declare -a RESULTS=()
FAILED=0

deploy_one() {
  local dir="$1" name; name="$(basename "$dir")"
  local -a base=(docker compose)
  [[ -f "$dir/.env" ]] && base+=(--env-file .env)

  printf '\n%s\n' "${C_BOLD}────────────────────────────────────────────────────────${C_RESET}"
  log "Redeploy ${C_BOLD}$name${C_RESET}  (${dir#"$ROOT_DIR"/})"

  (
    cd "$dir" || exit 1

    if [[ $DO_DOWN -eq 1 ]]; then
      log "down (removendo containers antigos)..."
      "${base[@]}" down --remove-orphans || exit 1
    fi

    if [[ $DO_PULL -eq 1 ]]; then
      log "pull (imagens base)..."
      "${base[@]}" pull --ignore-buildable || true
    fi

    local -a up=("${base[@]}" up -d --remove-orphans)
    [[ $DO_BUILD -eq 1 ]] && up+=(--build)
    log "${up[*]}"
    "${up[@]}"
  )

  local rc=$?
  if [[ $rc -eq 0 ]]; then
    ok "$name atualizado."
    RESULTS+=("${C_GREEN}✔${C_RESET} $name")
  else
    err "$name falhou (exit $rc)."
    RESULTS+=("${C_RED}✗${C_RESET} $name (exit $rc)")
    FAILED=$((FAILED + 1))
  fi
}

START_TS=$(date +%s)
for dir in "${TARGETS[@]}"; do
  deploy_one "$dir"
done

# --- Limpeza opcional --------------------------------------------------------
if [[ $DO_PRUNE -eq 1 ]]; then
  printf '\n'; log "Limpando imagens dangling..."
  docker image prune -f >/dev/null && ok "Imagens dangling removidas."
fi

# --- Resumo ------------------------------------------------------------------
ELAPSED=$(( $(date +%s) - START_TS ))
printf '\n%s\n' "${C_BOLD}══════════════════ RESUMO (${ELAPSED}s) ══════════════════${C_RESET}"
for r in "${RESULTS[@]}"; do printf '   %s\n' "$r"; done
printf '\n'

if [[ $FAILED -gt 0 ]]; then
  err "$FAILED projeto(s) falharam."
  exit 1
fi
ok "Todos os projetos foram republicados."
