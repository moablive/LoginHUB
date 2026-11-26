# lp — página de venda do LoginHUB

Home do hub (`https://loginhub.astralwavelabel.com/` e `/assine/`): Vue 3 + Vite + Tailwind v4, estática,
servida por nginx no container `server_loginhub_lp` (serviço `login-hub-lp` do `docker-compose.yml`).
Fica **fora dos workspaces npm** do monorepo (tem `package.json` e Dockerfile próprios).

- O nginx do hub (`apps/ui/nginx.conf`) repassa `/` (exato) e `/assine/` para este container. A LP é construída com
  base `/assine/` para os assets não colidirem com os do hub.
- Venda: `POST /api/venda/apps/28/assinar` no `/api` do próprio hub (mesma origem). Preço no texto
  (`src/i18n/{pt-BR,en}.ts`, R$ 24,99) e em `planos_app.valor` do app 28: mudar um sem o outro faz a página
  prometer um valor e o Mercado Pago cobrar outro.
- Volta do Mercado Pago: `/assine/obrigado?pedido=<ref>` (o `PaymentBanner` consulta o pedido).
- App instalado (PWA) pula a LP e vai a `/dashboard` (`src/main.ts`). Botão **Entrar** = `/login`.
- Deploy: `docker compose up -d --build --no-deps login-hub-lp`. Dev: `cd lp && npm install && npm run dev`.
- Histórico: nasceu como `apps/security-lp` no projeto astralwavelabel (26/11/2026), passou um dia no site da
  label (`/loginhub`) e voltou para cá, onde "tudo fica junto no LoginHUB".
