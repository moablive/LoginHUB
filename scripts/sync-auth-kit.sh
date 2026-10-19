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
# Raiz absoluta: o LoginHUB mora em projects/LifeBusinessSuit/LBS_LoginHUB desde
# 19/10/2026 e os destinos ficam em projects/ e server/, então subir pastas a
# partir daqui não serve (era assim, e os destinos da LBS davam FALTA).
BASE="/mnt/nvme2tb/docker-services"

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
# A Sul Alimentos saiu desta lista: o sistema dela mora no servidor bonatoeferraz
# e recebe o auth-kit por lá.
DESTINOS=$(cat <<'LISTA'
projects/LifeBusinessSuit/LBS_MoneyAPP/apps/backend/src/lib/hubAuthServer.ts|server
projects/LifeBusinessSuit/LBS_MoneyAPP/apps/frontend/src/lib/hubAuthClient.ts|client
projects/LifeBusinessSuit/LBS_TodoAPP/apps/backend/src/lib/hubAuthServer.ts|server
projects/LifeBusinessSuit/LBS_TodoAPP/apps/frontend/src/lib/hubAuthClient.ts|client
projects/LifeBusinessSuit/LBS_NaoTeEsquece/apps/backend/src/lib/hubAuthServer.ts|server
projects/LifeBusinessSuit/LBS_NaoTeEsquece/apps/frontend/src/lib/hubAuthClient.ts|client
projects/LifeBusinessSuit/LBS_NotesAPP/apps/backend/src/lib/hubAuthServer.ts|server
projects/LifeBusinessSuit/LBS_NotesAPP/apps/frontend/src/lib/hubAuthClient.ts|client
projects/Astral_Wave/astralwavelabel/api/src/shared/lib/hubAuthServer.ts|server
projects/Astral_Wave/astralwavelabel/apps/artist/src/lib/hubAuthClient.ts|client
projects/Astral_Wave/astralwavelabel/apps/site/src/lib/hubAuthClient.ts|client
projects/moabinhoia/apps/api/src/lib/hubAuthServer.ts|server
projects/moabinhoia/packages/api-client/src/hubAuthClient.ts|client
projects/Moving/MovingUP/apps/api/src/lib/hubAuthServer.ts|server
projects/Moving/MovingUP/apps/web/src/lib/hubAuthClient.ts|client
projects/LifeBusinessSuit/LBS_MoneyAPP/apps/bot/src/lib/hubAuthClient.ts|client
projects/LifeBusinessSuit/LBS_MoneyAPP/apps/bot/src/lib/hubAuthBot.ts|bot
projects/LifeBusinessSuit/LBS_TodoAPP/apps/bot/src/lib/hubAuthClient.ts|client
projects/LifeBusinessSuit/LBS_TodoAPP/apps/bot/src/lib/hubAuthBot.ts|bot
projects/LifeBusinessSuit/LBS_NotesAPP/apps/bot/src/lib/hubAuthClient.ts|client
projects/LifeBusinessSuit/LBS_NotesAPP/apps/bot/src/lib/hubAuthBot.ts|bot
LISTA
)

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

# O editores-web (proxy de VNC) recebia aqui o JS transpilado; descontinuado em 01/10/2026,
# o resto está em /root/recuperado/editores-web.

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
