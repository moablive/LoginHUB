# CLAUDE.md — LoginHUB

Contexto que o Claude Code deve carregar antes de mexer neste repositório.

## Dono do repositório

Esta pasta é do **git pessoal do moab** (`moablive`), não de conta corporativa.

| | |
|---|---|
| Remote | `https://github.com/moablive/LoginHUB.git` |
| `git config user.name` | `moablive` |
| `git config user.email` | `guilhermeferrazbonato@gmail.com` |
| Branch principal | `main` |

Commits e PRs saem sob essa identidade. Não trocar autoria, não empurrar para
outro remote e não usar o e-mail da conta Claude como autor. Antes de commitar,
conferir que `user.email` do repositório ainda é o pessoal — a máquina hospeda
vários projetos e o global pode ser outro.

## O que é o projeto

Plataforma de **identidade central** da Astral Wave Label. Autentica os usuários
de todos os apps clientes (MoneyAPP, LifeDash, Sul Alimentos, …) com JWT, magic
link e **2FA por TOTP obrigatório**.

Monorepo npm workspaces:

```
apps/api            Express + rotas/controllers
apps/ui             React + Vite (painel do MASTER apenas — não é tela de usuário final)
packages/schema     Drizzle (tabelas) + DTOs/tipos compartilhados
packages/database   conexão Drizzle/pg
packages/services   AuthService, UserService, AppService, TwoFactorService, EmailService
packages/middlewares auth, rate limit, CORS, métricas Prometheus
packages/api-client  cliente HTTP que os apps clientes consomem
packages/auth-kit    fonte canônica da integração, copiada para cada app cliente
db/                 SQL de migração, aplicado À MÃO (não há runner)
scripts/2fa-enroll.sh  enrolamento de 2FA pelo terminal
scripts/bump-version.mjs  VERSION -> APP_VERSION/APP_BUILD_DATE no .env
VERSION             fonte da verdade da versão de build (versionada)
```

O **README.md é a documentação de verdade** — fluxos, endpoints, decisões e
armadilhas. Consultar antes de propor mudança de fluxo de auth; ele explica o
"porquê" de escolhas que parecem estranhas fora de contexto.

## Como rodar

Stack em Docker com hot reload (bind mount do host, sem rebuild a cada save):

```bash
docker compose --env-file .env up -d
```

- `server_loginhub_packages` — `tsc -w` dos `packages/*`; alimenta api e ui.
  Se um pacote não reflete a mudança, é aqui que se olha primeiro.
- `server_loginhub_backend` — API, `http://localhost:3005/api`
- `server_loginhub_frontend` — UI, `http://localhost:3006`
- Banco: container `server_db_postgres` (compartilhado com outros projetos do host).

Sem Docker: `npm run dev` na raiz. Build: `npm run build`.

Para publicar, use `npm run docker:deploy` ou `./redeploy.sh` — os dois
incrementam a versão de build antes de subir. É o bump que acende o aviso de
"nova versão disponível" na aba de quem já está com o painel aberto; deploy sem
bump deixa o mecanismo mudo. Detalhes na seção *Versionamento* do README.

**Não há suíte de testes** — nenhum `*.test.ts` no repositório e nenhum script
`test` no `package.json`. Mudança em auth/TOTP se valida à mão (curl, o
`scripts/2fa-enroll.sh`, ou consulta ao Postgres).

## Regras do domínio que não se deve quebrar

- **Todo token com claim `action` é passe de etapa única**, nunca sessão:
  `setup-password` (magic link), `2fa-challenge`, `2fa-setup`. O
  `authMiddleware` recusa todos por padrão; só as rotas de enrolamento abrem
  exceção para `2fa-setup`, e o `/auth/refresh` recusa qualquer um deles.
- **2FA é obrigatório para toda conta que faz login aqui**, sem configuração por
  app. Não existe rota que isente — a ação administrativa é o *reset* do
  autenticador (`POST /admin/users/:id/reset-2fa`), nunca a isenção.
- **`aplicativos.usa_login_hub = false` não é isenção de 2FA — é app que não
  autentica no hub.** Hoje só o **Cofre** (app 14): o hub emite o convite e
  para por aí; quem entra lá usa a senha mestra do próprio cofre, que é a chave
  de criptografia e o hub nunca vê. Essas contas **não** ganham linha em
  `usuarios_2fa` (o "pendente" nunca resolveria) e o `login` as **recusa**
  (`APP_NAO_AUTENTICA_NO_HUB`, 403). Recusar é mais restritivo que o
  comportamento antigo: com `obrigatorio = false`, `estadoDoLogin` devolveria
  `'sessao'` e a conta entraria SEM segundo fator se alguém lhe desse uma senha.
  Ver `db/004_apps_sem_login_hub.sql`.
- **`sessoes_validas_desde`** é o piso de validade das sessões: JWT com `iat`
  anterior é recusado no middleware **e** no refresh. Comparar sempre em
  segundos nos dois lados (o `iat` é truncado; o piso tem milissegundos).
- **O secret e o QR nunca vão por e-mail** — é o mesmo canal do magic link e do
  reset de senha; juntar os dois fatores ali anula o segundo.
- **Uso único do magic link** vem da claim `pwf` (fingerprint do `senha_hash`),
  não de flag no usuário. Trocar a senha mata o link sozinho.
- **Multi-tenant real**: o mesmo e-mail pode existir em apps diferentes; a
  unicidade é `(email, app_id)`. Login sem `app_id` desambigua pela senha.
- **O passe `setup-password` carrega `app_id`, e um app depende disso.** O hub
  resolve o tenant pelo `sub` e não precisaria da claim, mas o **Cofre**
  (`server/Cofre`, app 14) aceita o magic link como autorização para criar um
  cofre e usa `app_id` para recusar convite de outro tenant — sem ela, um
  convite do MoneyAPP abriria um cofre. Emitida em `UserService.addUser` e em
  `resetPassword`. Ao mexer nesses `jwt.sign`, rode
  `docker exec server_cofre_backend node scripts/smoke.mjs`.
- **O login master (`master@infra.local`) não tem linha em `usuarios`** e por
  isso fica fora do 2FA. É protegido só pela `MASTER_API_KEY`.

## Migrações

`db/*.sql` são aplicadas manualmente no Postgres, em ordem. Não há runner nem
controle de versão de schema no código — ao adicionar SQL novo, dizer no PR
que precisa rodar, e escrever de forma idempotente (`IF NOT EXISTS`,
`ON CONFLICT`).

## Estilo

- Código, commits e comentários em **português**.
- Commits seguem Conventional Commits com escopo: `fix(2fa): ...`,
  `feat(ui): ...`, `refactor(auth): ...`. Sem acentos na primeira linha.
- Os comentários deste repositório explicam **por que**, não o que — manter esse
  padrão em vez de narrar o óbvio.
