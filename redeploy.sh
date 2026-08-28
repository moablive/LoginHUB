#!/usr/bin/env bash
# =============================================================================
# redeploy.sh — Republica (redeploy) o projeto Docker LoginHUB.
#
# Roda o padrão do repositório a partir da raiz:
#
#     docker compose --env-file .env up -d --build
#
# Sem argumentos, num terminal, ele exibe um menu para escolher o serviço.
# Em cron/pipe (sem terminal) e sem argumentos = republica TODOS os serviços.
#
# Exemplos:
#   ./redeploy.sh                 # menu interativo
#   ./redeploy.sh api             # só a API
#   ./redeploy.sh ui              # só a UI
#   ./redeploy.sh api ui          # os dois serviços
#   ./redeploy.sh --no-build api  # sobe sem rebuildar imagem
#   ./redeploy.sh --down api      # derruba e recria do zero
#   ./redeploy.sh --pull --prune  # atualiza imagens base e limpa dangling
#   ./redeploy.sh --no-bump api   # sobe sem incrementar a versao de build
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
DO_BUMP=1
DO_DOWN=0
DO_PULL=0
DO_PRUNE=0
JUST_LIST=0
SELECTED=()

usage() {
  sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)     usage 0 ;;
    -l|--list)     JUST_LIST=1 ;;
    --no-build)    DO_BUILD=0 ;;
    --no-bump)     DO_BUMP=0 ;;
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

# --- Serviços Disponíveis ----------------------------------------------------
# No LoginHUB temos serviços definidos no docker-compose.yml raiz.
# 'packages' vem primeiro: api e ui dependem do healthcheck dele (depends_on).
ALL_SERVICES=("login-hub-packages" "login-hub-api" "login-hub-ui")

if [[ $JUST_LIST -eq 1 ]]; then
  log "Serviços disponíveis em ${C_BOLD}$ROOT_DIR${C_RESET}:"
  for s in "${ALL_SERVICES[@]}"; do printf '   • %s\n' "$s"; done
  exit 0
fi

# --- Menu interativo (quando nenhum serviço é passado por argumento) ---------
if [[ ${#SELECTED[@]} -eq 0 && -t 0 ]]; then
  printf '%s\n' "${C_BOLD}Qual serviço você quer republicar?${C_RESET}"
  i=1
  for s in "${ALL_SERVICES[@]}"; do
    printf '   %s%d%s) %s\n' "$C_BOLD" "$i" "$C_RESET" "$s"
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
      0|todos|TODOS|all) SELECTED=(); break ;;
      *[!0-9]*) SELECTED+=("$choice") ;;
      *)
        idx=$((choice - 1))
        if [[ $idx -ge 0 && $idx -lt ${#ALL_SERVICES[@]} ]]; then
          SELECTED+=("${ALL_SERVICES[$idx]}")
        else
          err "Opção inválida: '$choice'"; exit 1
        fi
        ;;
    esac
  done
fi

# --- Resolve seleção -------------------------
TARGETS=()
if [[ ${#SELECTED[@]} -eq 0 ]]; then
  TARGETS=("${ALL_SERVICES[@]}")
else
  for want in "${SELECTED[@]}"; do
    match=""
    for s in "${ALL_SERVICES[@]}"; do
      if [[ "${s,,}" == *"${want,,}"* ]]; then
        match="$s"; break
      fi
    done
    if [[ -n "$match" ]]; then
      TARGETS+=("$match")
    else
      err "Serviço não encontrado para '$want' (use --list para ver os nomes)."
      exit 1
    fi
  done
fi

# Elimina duplicatas de alvos se houver
TARGETS=($(printf "%s\n" "${TARGETS[@]}" | sort -u))

# --- Garante a rede externa compartilhada ------------------------------------
if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  log "Rede '$NETWORK' não existe — criando..."
  docker network create "$NETWORK" >/dev/null && ok "Rede '$NETWORK' criada."
fi

# --- Redeploy ----------------------------------------------------------------
declare -a RESULTS=()
FAILED=0

deploy_services() {
  local -a base=(docker compose)
  [[ -f "$ROOT_DIR/.env" ]] && base+=(--env-file .env)

  printf '\n%s\n' "${C_BOLD}────────────────────────────────────────────────────────${C_RESET}"
  log "Redeploy dos serviços: ${C_BOLD}${TARGETS[*]}${C_RESET}"

  (
    cd "$ROOT_DIR" || exit 1

    # Incrementa a versao de build ANTES do up: e o .env recem-escrito que o
    # compose le para injetar APP_VERSION/VITE_APP_VERSION nos containers.
    # Deploy sem bump deixa o aviso de "nova versao" do painel sem sinal —
    # e a razao mais comum de o mecanismo virar decoracao. Use --no-bump
    # quando estiver so recriando um servico, sem codigo novo.
    if [[ $DO_BUMP -eq 1 ]]; then
      if [[ -f scripts/bump-version.mjs ]]; then
        node scripts/bump-version.mjs || warn "bump falhou; seguindo com a versao anterior."
      else
        warn "scripts/bump-version.mjs nao encontrado; seguindo sem bump."
      fi
    fi

    if [[ $DO_DOWN -eq 1 ]]; then
      log "down (removendo containers antigos dos serviços alvos)..."
      "${base[@]}" rm -f -s -v "${TARGETS[@]}" || exit 1
    fi

    if [[ $DO_PULL -eq 1 ]]; then
      log "pull (imagens base)..."
      "${base[@]}" pull --ignore-buildable "${TARGETS[@]}" || true
    fi

    local -a up=("${base[@]}" up -d --remove-orphans)
    [[ $DO_BUILD -eq 1 ]] && up+=(--build)
    up+=("${TARGETS[@]}")
    
    log "${up[*]}"
    "${up[@]}"
  )

  local rc=$?
  if [[ $rc -eq 0 ]]; then
    ok "Serviços atualizados com sucesso."
    RESULTS+=("${C_GREEN}✔${C_RESET} ${TARGETS[*]}")
  else
    err "Falha ao atualizar serviços (exit $rc)."
    RESULTS+=("${C_RED}✗${C_RESET} ${TARGETS[*]} (exit $rc)")
    FAILED=$((FAILED + 1))
  fi
}

START_TS=$(date +%s)
# Ao invés de iterar sobre diretórios, rodamos o docker compose up com os serviços selecionados
if [[ ${#TARGETS[@]} -gt 0 ]]; then
  deploy_services
fi

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
  err "O redeploy falhou."
  exit 1
fi
ok "Redeploy concluído."
