#!/usr/bin/env bash
#
# Propaga a fonte canônica do auth-kit para os apps clientes e para os bots.
#
# O LoginHUB é a identidade central, mas cada app carrega o próprio pedaço da
# integração — e foi assim que nasceram três forks divergentes do mesmo cliente,
# uma delas ainda chamando `/auth/change-password`, rota que não existe há
# tempo. Vendorizar sem sincronizar é o que produz isso.
#
# Este script copia os MESMOS arquivos para todos os destinos e sabe conferir se
# alguém editou uma cópia:
#
#   ./scripts/sync-auth-kit.sh          propaga
#   ./scripts/sync-auth-kit.sh --check  só verifica, sai != 0 se divergir
#
# Rode o --check no CI de cada app, ou aqui depois de mexer no auth-kit.
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONTE="$RAIZ/packages/auth-kit/src"
BASE="$(cd "$RAIZ/../.." && pwd)"   # /mnt/nvme2tb/docker-services

SERVER="$FONTE/hubAuthServer.ts"
CLIENT="$FONTE/hubAuthClient.ts"
BOT="$FONTE/hubAuthBot.ts"

MODO="${1:-sync}"

# destino_relativo_ao_BASE  |  arquivo_de_origem (server | client | bot)
#
# Os bots de Telegram recebem DOIS arquivos, no MESMO diretório: o `hubAuthBot`
# é uma camada fina sobre o `hubAuthClient` e o importa por caminho relativo.
# Separar os dois quebra a cópia.
#
# editores-web fica de fora desta lista: não tem build de TypeScript, então
# recebe o JS transpilado (ver TRANSPILE, abaixo).
DESTINOS=$(cat <<'LISTA'
LifeBusinessSuit/MoneyAPP/apps/backend/src/lib/hubAuthServer.ts|server
LifeBusinessSuit/MoneyAPP/apps/frontend/src/lib/hubAuthClient.ts|client
LifeBusinessSuit/TodoAPP/apps/backend/src/lib/hubAuthServer.ts|server
LifeBusinessSuit/TodoAPP/apps/frontend/src/lib/hubAuthClient.ts|client
LifeBusinessSuit/NotesAPP/apps/backend/src/lib/hubAuthServer.ts|server
LifeBusinessSuit/NotesAPP/apps/frontend/src/lib/hubAuthClient.ts|client
LifeBusinessSuit/LBSTTSAPP/apps/backend/src/lib/hubAuthServer.ts|server
LifeBusinessSuit/LBS_NotifyAPP/src/lib/hubAuthServer.ts|server
LifeBusinessSuit/LBSTTSAPP/apps/frontend/src/lib/hubAuthClient.ts|client
Astral_Wave/astralwavelabel/api/src/shared/lib/hubAuthServer.ts|server
Astral_Wave/astralwavelabel/apps/artist/src/lib/hubAuthClient.ts|client
Astral_Wave/astralwavelabel/apps/site/src/lib/hubAuthClient.ts|client
Sul_Alimentos/sul-alimentos/apps/api/src/lib/hubAuthServer.ts|server
Sul_Alimentos/sul-alimentos/packages/http-client/src/hubAuthClient.ts|client
server/dashboard/apps/api/src/lib/hubAuthServer.ts|server
server/dashboard/packages/api-client/src/hubAuthClient.ts|client
LifeBusinessSuit/MoneyAPP/apps/bot/src/lib/hubAuthClient.ts|client
LifeBusinessSuit/MoneyAPP/apps/bot/src/lib/hubAuthBot.ts|bot
LifeBusinessSuit/TodoAPP/apps/bot/src/lib/hubAuthClient.ts|client
LifeBusinessSuit/TodoAPP/apps/bot/src/lib/hubAuthBot.ts|bot
LifeBusinessSuit/NotesAPP/apps/bot/src/lib/hubAuthClient.ts|client
LifeBusinessSuit/NotesAPP/apps/bot/src/lib/hubAuthBot.ts|bot
LISTA
)

# Consumidor sem TypeScript nem bundler: editores-web recebe os dois arquivos
# transpilados a partir da MESMA fonte.
#
#   hubAuthServer.js  CommonJS  — o proxy é `require()` puro
#   auth.js           ESM       — o login.html carrega com <script type="module">
#
# O nome `auth.js` não é arbitrário: é o único caminho de asset que o
# `authMiddleware` do proxy libera sem sessão (junto de `/login*`).
TRANSPILE_DEST="$BASE/server/editores-web/auth-proxy/src/hubAuthServer.js"
TRANSPILE_CLIENT_DEST="$BASE/server/editores-web/auth-proxy/src/auth.js"

divergentes=0
copiados=0

for linha in $DESTINOS; do
    rel="${linha%%|*}"
    tipo="${linha##*|}"
    origem="$SERVER"
    [ "$tipo" = "client" ] && origem="$CLIENT"
    [ "$tipo" = "bot" ] && origem="$BOT"
    destino="$BASE/$rel"

    if [ "$MODO" = "--check" ]; then
        if [ ! -f "$destino" ]; then
            echo "FALTA     $rel"
            divergentes=$((divergentes + 1))
        elif ! cmp -s "$origem" "$destino"; then
            echo "DIVERGE   $rel"
            divergentes=$((divergentes + 1))
        fi
    else
        mkdir -p "$(dirname "$destino")"
        cp "$origem" "$destino"
        copiados=$((copiados + 1))
        echo "→ $rel"
    fi
done

# --- editores-web: TS → CJS -------------------------------------------------
# `--module CommonJS` porque o proxy é `require()` puro, sem bundler nem tsc.
if [ "$MODO" != "--check" ]; then
    tmp="$(mktemp -d)"
    npx --prefix "$RAIZ" tsc "$SERVER" \
        --outDir "$tmp" --module CommonJS --target ES2020 \
        --esModuleInterop --skipLibCheck --declaration false >/dev/null 2>&1 || true

    if [ -f "$tmp/hubAuthServer.js" ]; then
        mkdir -p "$(dirname "$TRANSPILE_DEST")"
        {
            echo "// GERADO por LoginHUB/scripts/sync-auth-kit.sh — não edite à mão."
            echo "// Fonte: LoginHUB/packages/auth-kit/src/hubAuthServer.ts"
            cat "$tmp/hubAuthServer.js"
        } > "$TRANSPILE_DEST"
        copiados=$((copiados + 1))
        echo "→ server/editores-web/auth-proxy/src/hubAuthServer.js (CommonJS)"
    else
        echo "!! falhou ao transpilar o guard para editores-web" >&2
    fi

    # O cliente sai como ESM: `hubAuthClient.ts` não importa nada, então o
    # módulo gerado roda direto no browser, sem bundler nem shim.
    npx --prefix "$RAIZ" tsc "$CLIENT" \
        --outDir "$tmp/esm" --module ES2020 --target ES2020 \
        --lib ES2020,DOM --skipLibCheck --declaration false >/dev/null 2>&1 || true

    if [ -f "$tmp/esm/hubAuthClient.js" ]; then
        mkdir -p "$(dirname "$TRANSPILE_CLIENT_DEST")"
        {
            echo "// GERADO por LoginHUB/scripts/sync-auth-kit.sh — não edite à mão."
            echo "// Fonte: LoginHUB/packages/auth-kit/src/hubAuthClient.ts"
            cat "$tmp/esm/hubAuthClient.js"
        } > "$TRANSPILE_CLIENT_DEST"
        copiados=$((copiados + 1))
        echo "→ server/editores-web/auth-proxy/src/auth.js (ESM)"
    else
        echo "!! falhou ao transpilar o cliente para editores-web" >&2
    fi

    rm -rf "$tmp"
fi

if [ "$MODO" = "--check" ]; then
    if [ "$divergentes" -gt 0 ]; then
        echo
        echo "$divergentes cópia(s) fora de sincronia. Rode ./scripts/sync-auth-kit.sh"
        exit 1
    fi
    echo "todas as cópias em sincronia com packages/auth-kit/src"
else
    echo
    echo "$copiados arquivo(s) propagado(s)."
fi
