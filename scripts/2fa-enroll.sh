#!/usr/bin/env bash
#
# Ativa 2FA numa conta do LoginHUB, pelo terminal.
#
# Existe porque o painel do hub é só do master: não há tela de usuário onde
# fazer o enrolamento, e cada app cliente ainda vai construir a sua. Enquanto
# isso, este script fala direto com a API — sem navegador, logo sem CORS.
#
#   ./scripts/2fa-enroll.sh <email> <app_id> [base_url]
#
set -euo pipefail

EMAIL="${1:-}"
APP_ID="${2:-}"
API="${3:-http://localhost:3005/api}"

[ -z "$EMAIL" ] || [ -z "$APP_ID" ] && {
  echo "uso: $0 <email> <app_id> [base_url]" >&2
  exit 1
}

read -rsp "Senha de $EMAIL: " SENHA; echo

json() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('$1',''))"; }

echo "→ autenticando..."
LOGIN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,sys;print(json.dumps({'email':sys.argv[1],'password':sys.argv[2],'app_id':sys.argv[3]}))" "$EMAIL" "$SENHA" "$APP_ID")")

if echo "$LOGIN" | grep -q '"requires2FA"'; then
  echo "Esta conta JÁ tem 2FA ativo. Para trocar o autenticador, desative antes." >&2
  exit 1
fi

# Duas formas de credencial, conforme o estado da conta:
#   `token`      → sessão normal (conta sem exigência de 2FA registrada);
#   `setupToken` → passe de enrolamento de 10 min, que é o que o login devolve
#                  desde que o 2FA passou a ser obrigatório para todo mundo.
# As rotas de enrolamento aceitam os dois.
TOKEN=$(echo "$LOGIN" | json token)
[ -z "$TOKEN" ] && TOKEN=$(echo "$LOGIN" | json setupToken)
[ -z "$TOKEN" ] && { echo "Login falhou:"; echo "$LOGIN"; exit 1; }

echo "→ gerando o secret..."
SETUP=$(curl -s -X POST "$API/auth/2fa/setup" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')
URI=$(echo "$SETUP" | json otpauthUri)
[ -z "$URI" ] && { echo "Setup falhou:"; echo "$SETUP"; exit 1; }

echo
echo "Conta:  $(echo "$SETUP" | json label)"
echo "Chave:  $(echo "$SETUP" | json secret)"
echo
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$URI"
else
  echo "(qrencode não instalado — digite a chave acima manualmente no autenticador,"
  echo " ou gere o QR a partir desta URI:)"
  echo "$URI"
fi

echo
read -rp "Código de 6 dígitos do autenticador: " CODIGO

RES=$(curl -s -X POST "$API/auth/2fa/verify-setup" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"codigo\":\"$CODIGO\"}")

if ! echo "$RES" | grep -q '"ativo":true'; then
  echo "Não ativou:"; echo "$RES"
  echo
  echo "Dica: se o código acabou de ser usado, espere o próximo (30s) e rode de novo."
  exit 1
fi

echo
echo "✅ 2FA ativado."
echo
echo "CÓDIGOS DE RECUPERAÇÃO — guarde agora, não voltam a aparecer:"
echo "$RES" | python3 -c "import json,sys;[print('   ',c) for c in json.load(sys.stdin)['backupCodes']]"
echo
echo "⚠️  Suas outras sessões foram encerradas. Entre de novo nos demais dispositivos."
