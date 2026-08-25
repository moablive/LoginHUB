<div align="center">

# 🛡️ LoginHUB

**Plataforma de autenticação e gestão de identidade centralizada da Astral Wave Label**

<img src="https://skillicons.dev/icons?i=ts,react,vite,tailwind,nodejs,express,postgres,docker,nginx,git&perline=10" />

<br/><br/>

[![Status](https://img.shields.io/badge/status-em%20produção-success)](https://loginhub.astralwavelabel.com)
[![PWA](https://img.shields.io/badge/pwa-enabled-blueviolet)]()
[![Theme](https://img.shields.io/badge/theme-Dracula%20Dark%20%2F%20Light-purple)]()
[![JWT](https://img.shields.io/badge/auth-JWT%20%2B%20Magic%20Link-blue)](#-fluxo-de-autenticação-e-regras-de-negócio)
[![Monorepo](https://img.shields.io/badge/npm-workspaces-CB3837?logo=npm&logoColor=white)](#-estrutura-do-monorepo)
[![License](https://img.shields.io/badge/license-private-lightgrey)]()

[**🌐 UI Pública**](https://loginhub.astralwavelabel.com/login) &nbsp;•&nbsp;
[**🔌 API Pública**](https://loginhub.astralwavelabel.com/api) &nbsp;•&nbsp;
[**📖 Endpoints**](#-endpoints-da-api) &nbsp;•&nbsp;
[**🔄 Integração**](#-integração-em-um-app-cliente-ex-moneyapp) &nbsp;•&nbsp;
[**🚢 Redeploy**](#-script-de-redeploy-redeploysh)

</div>

---

## 📌 Sobre o projeto

O **LoginHUB** é a plataforma de **identidade central** que autentica os usuários de todos os ecossistemas e aplicações da infraestrutura Astral Wave Label (MoneyAPP, LifeDash, e outros clientes). 

Cada usuário pertence a um **aplicativo (tenant)** com um nível de acesso (`role`). O sistema oferece suporte **multi-tenant real**: o mesmo e-mail pode ser cadastrado em aplicativos distintos de forma totalmente isolada.

Todo o ciclo de vida da conta — convite por e-mail, primeiro acesso via **Magic Link**, desambiguação de tenant no login, redefinição de senha, alteração de status e renovação transparente de sessão — é gerenciado de forma centralizada pelo LoginHUB.

### Principais Capacidades

| Recurso | Status | Descrição |
|---|---|---|
| 🔑 Login com E-mail + Senha (JWT 24h) | ✅ | Autenticação centralizada com emissão de token JWT válido por 24 horas. |
| 🔀 Desambiguação Multi-Tenant | ✅ | E-mail único por aplicativo. Se um e-mail existir em múltiplos apps, a API orienta a escolha do app ou desambigua pela senha (`AMBIGUOUS_EMAIL`). |
| 🪄 Magic Link (1º Acesso & Reset) | ✅ | Criação de conta e reset de senha utilizam Magic Link de uso único (JWT 24h, autoinvalidado pelo claim `pwf`) em substituição a senhas temporárias. |
| 🔐 2FA por TOTP | ✅ | Segundo fator compatível com Google Authenticator, Authy, 1Password e Microsoft Authenticator. Secret cifrado em AES-256-GCM, 10 códigos de recuperação, rate limit por conta e corte de sessões na ativação. Ver fluxo 6️⃣. |
| 🔄 Refresh Session (Sliding 7d) | ✅ | Renovação contínua do JWT com grace period de até 7 dias após a expiração. |
| 👥 Multi-Tenant Isolado | ✅ | Cada aplicativo possui seus próprios usuários, configurações, logos e URLs de integração. |
| 🛡️ 4 Níveis de Acesso | ✅ | Níveis padronizados: `master` / `admin` / `user` / `suporte`. |
| 🚦 Gestão Granular de Status | ✅ | Controle de status em apps (`ativo`/`inativo`) e usuários (`ativo`/`inativo`/`bloqueado`). |
| 📧 Envio Automático por E-mail (SMTP) | ✅ | Disparo de convites e links de acesso via templates HTML personalizáveis. |
| 🔗 URLs de Integração (`bot_url` / `platform_url`) | ✅ | Suporte a links diretos para bots (Telegram/WhatsApp) e plataformas web por aplicativo. |
| 🎨 Dracula Dark Mode & Light Mode | ✅ | Alternância dinâmica de tema na UI com suporte nativo ao Dracula Theme. |
| 📱 PWA Funcional | ✅ | Frontend instalável como Progressive Web App (Service Worker + Web App Manifest). |
| 🚢 Script de Deploy Automatizado | ✅ | Script `./redeploy.sh` na raiz para deploy interativo ou via CLI com Docker Compose. |
| 🤝 Convite com Provisionamento no App | ✅ | Apps que guardam dados próprios do usuário (CPF, comissão) criam o cadastro deles e o acesso no hub numa operação só. Ver fluxo 5️⃣. |
| 🔥 Hot Reload no Docker | ✅ | O código vem do host por bind mount: salvar um arquivo reflete no container, sem rebuild. |

---

## 🧱 Arquitetura

A API e a UI do LoginHUB rodam em containers Docker na rede interna `awl_network`, **com hot reload**: o código vem do host por bind mount, não da imagem. O dev server do Vite serve o painel e atua como proxy reverso, roteando as chamadas `/api` para o backend (papel que era do Nginx). Um terceiro container mantém os `packages/*` em `tsc --watch`, alimentando os outros dois.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             USUÁRIO FINAL                                   │
│            (Acessa MoneyAPP, LifeDash ou o LoginHUB Admin UI)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LOGINHUB FRONTEND (UI)                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ React + Vite (dev server, HMR) + Tailwind + PWA + Dracula Theme       │  │
│  │ (Dashboard, Gestão de Tenants, Usuários, Convites & Magic Links)      │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │ /api (Proxy do Vite dev server)      │
│                                      ▼                                      │
│                           LOGINHUB BACKEND (API)                            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Express + JWT + Drizzle ORM + SMTP Client                             │  │
│  │ /auth/* (login, refresh, setup-password)                             │  │
│  │ /admin/* (apps, users, status, reset-password)                        │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
└──────────────────────────────────────┼──────────────────────────────────────┘
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ PostgreSQL Database (login_hub)    │
                    │ - aplicativos (bot_url, platform)  │
                    │ - usuarios (unique: email + app)   │
                    │ - niveis_acesso                    │
                    └────────────────────────────────────┘
```

---

## 📂 Estrutura do Monorepo

O projeto é estruturado como um monorepo gerenciado via **NPM Workspaces**, compilado na ordem topológica: `schema → database → api-client → middlewares → services → api → ui`.

```
LoginHUB/
├── apps/
│   ├── api/                      # Express + JWT + Drizzle (porta 3000 interna / 3005 externa)
│   │   ├── src/
│   │   │   ├── app.ts            # Configuração de Express & Middlewares
│   │   │   ├── server.ts         # Bootstrap do servidor HTTP
│   │   │   ├── routes/           # Rotas /auth e /admin
│   │   │   └── controllers/      # Handlers HTTP (AuthController, AppController, UserController)
│   │   ├── Dockerfile
│   │   └── docker-compose.yml
│   └── ui/                       # React + Vite + PWA (porta 80 interna / 3006 externa)
│       ├── nginx.conf            # Proxy reverso (/api → server_loginhub_backend:3000)
│       ├── src/
│       │   ├── pages/            # Login, Dashboard, AppUsers, CreateApp, SetupPassword
│       │   ├── components/       # Modais, LogoUpload, Layout, Header (Dracula Toggle)
│       │   └── templates/emails/ # Templates React → HTML para disparo de convites
│       ├── Dockerfile
│       └── docker-compose.yml
├── packages/
│   ├── schema/                   # Drizzle Table Schemas, Unique Constraints, Interfaces DTOs
│   ├── database/                 # Pool de conexão PostgreSQL + Client Drizzle
│   ├── api-client/               # Cliente Axios com interceptor de Auto-Refresh (single-flight)
│   ├── middlewares/              # authMiddleware, adminMiddleware, CORS, Métricas
│   └── services/                 # AuthService, AppService, UserService, EmailService
├── docker-compose.yml            # Compose principal da raiz (subição combinada de API + UI)
├── redeploy.sh                   # Script de redeploy interativo/automatizado
└── .env                          # Variáveis de ambiente
```

---

## 🚀 Setup Local e Desenvolvimento

### Pré-requisitos
- Docker & Docker Compose (v2)
- Rede Docker `awl_network` criada (`docker network create awl_network`)
- Banco PostgreSQL acessível em `server_db_postgres` na rede `awl_network`

### 🔥 Hot Reload (stack padrão)

O `docker-compose.yml` da raiz sobe o projeto **com hot reload**. O código não
vem da imagem: vem do host, por bind mount (`.:/app`). Salvar um arquivo no
editor já reflete no container — sem `--build`, sem restart manual.

```bash
docker compose --env-file .env up -d --build
```

São três serviços, todos a partir da mesma imagem `loginhub-base` (Dockerfile da raiz):

| Serviço              | Container                   | O que roda                          | Reage a                       |
|----------------------|-----------------------------|-------------------------------------|-------------------------------|
| `login-hub-packages` | `server_loginhub_packages`  | `tsc --watch` dos 5 packages        | `packages/*/src`              |
| `login-hub-api`      | `server_loginhub_backend`   | `ts-node-dev --respawn`             | `apps/api/src`, `packages/*/dist` |
| `login-hub-ui`       | `server_loginhub_frontend`  | `vite` dev server (HMR no browser)  | `apps/ui/src`, `packages/*/dist` |

Por que o serviço de packages existe: os `packages/*` publicam `dist/`
(`main: dist/index.js`), então nem a API nem a UI enxergam uma alteração em
`packages/*/src` antes do `tsc` rodar. Ele faz o build inicial, marca
`/tmp/packages-ready` — o healthcheck que segura o `depends_on` dos outros dois
— e fica em watch.

#### Portas

A URL do túnel Cloudflare usa o **nome do container + porta interna**; a porta
do host serve só para debug direto na máquina.

| Container                  | Porta interna (túnel) | Porta do host (debug) |
|----------------------------|-----------------------|------------------------|
| `server_loginhub_backend`  | **3000**              | 3005                   |
| `server_loginhub_frontend` | **80**                | 3006                   |

> O Vite escuta na **80** de propósito: é a mesma porta que o Nginx usava, então
> a rota do túnel (`server_loginhub_frontend:80`) continua valendo sem mexer no
> painel da Cloudflare.

#### Detalhes que fazem o hot reload funcionar

- **`node_modules` como volume anônimo.** O host é glibc (Manjaro) e o container
  é Alpine/musl. Se o `node_modules` do host cobrisse o do container, o binário
  nativo do rollup seria o errado e o Vite morreria no boot. Por isso o
  `docker-compose.yml` declara um volume anônimo para cada `node_modules` e o
  `Dockerfile` remove o `package-lock.json` antes do `npm install`.
- **Trocou dependência? Recrie os volumes.** Volume anônimo sobrevive a
  `up -d`. Depois de mexer em qualquer `package.json`:
  ```bash
  npm run docker:rebuild
  ```
- **HMR atrás do túnel.** O browser fala HTTPS/443 com a Cloudflare, não a 80
  interna do Vite. As variáveis `VITE_HMR_CLIENT_PORT=443` e
  `VITE_HMR_PROTOCOL=wss` (definidas no compose) informam isso ao client de HMR.
  Sem elas a página funciona, mas exige F5 a cada alteração.
- **Proxy `/api`.** Painel e API dividem o mesmo hostname
  (`VITE_API_URL=<host>/api`). O desvio, que era do `apps/ui/nginx.conf`, agora
  é `server.proxy` em `apps/ui/vite.config.ts`.

#### Troubleshooting

**O painel não reflete as alterações / continua com a versão antiga**

Antes desta mudança a UI era um bundle estático servido por nginx, e o
`vite-plugin-pwa` registrou um **service worker** no browser de quem já usava o
painel. Esse service worker continua no controle da página e serve o app do
cache — o HMR não alcança uma aba que sequer está falando com o dev server.

É de uma vez só, na primeira visita depois da troca nginx→vite:

```
Ctrl+Shift+R  (ou Cmd+Shift+R no Mac)
```

Se persistir, DevTools → Application → Service Workers → *Unregister*, e recarregue.

> Vale para **qualquer pessoa** que já usava o painel, não só para quem está
> desenvolvendo. Se alguém relatar "o painel não atualizou", é isto.

**403 `Blocked request. This host is not allowed.` no domínio público**

O Vite recarrega o próprio config quando o `vite.config.ts` muda (basta o mtime
mudar — um `tsc -b --force` já provoca isso) e loga `server restarted`. Foi
observado **uma vez** o servidor voltar desse restart sem aplicar o
`allowedHosts: true`, caindo no default `[]` e passando a responder 403 para o
domínio público — enquanto `http://IP:3006` continuava 200, porque o Vite não
faz host check para localhost/IP.

Sintoma e correção:

```bash
# confirma: local responde, público não
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3006/
curl -s -o /dev/null -w '%{http_code}\n' https://loginhub.astralwavelabel.com/

# correção — restart limpo do container recarrega o config corretamente
docker restart server_loginhub_frontend
```

Não foi possível reproduzir depois (restart por `touch` e por `tsc -b --force`
voltaram corretos), então a causa raiz segue em aberto. A variável
`__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` **não** resolve — foi testada no estado
degradado e o 403 permanece.

### Build Local (Desenvolvimento sem Docker)

```bash
# 1. Instalar dependências de todos os workspaces
npm install

# 2. Subir packages (watch) + API + UI num terminal só
npm run dev
```

> `npm run dev` na raiz roda os três em paralelo via `concurrently`. Fora do
> Docker, o proxy `/api` do Vite aponta para `http://localhost:3000` — ajuste com
> `API_PROXY_TARGET` se a API estiver em outro endereço.

Para gerar os artefatos compilados (o que o build de produção faz):

```bash
npm run build
```

> ⚠️ **Atenção**: O comando `npm run build` na raiz executa os builds na sequência
> de dependência correta (`schema → database → api-client → middlewares →
> services → api → ui`). Não utilize `npm run build --workspaces` diretamente
> para evitar falhas de compilação por referência cruzada.

### Voltando para imagem imutável (sem bind mount)

Os Dockerfiles de produção continuam versionados e **não** são usados pelo
compose atual:

- `apps/api/Dockerfile` — API compilada, `node dist/server.js`
- `apps/ui/Dockerfile` + `apps/ui/nginx.conf` — bundle estático servido por Nginx

Para reusá-los, aponte o `build.dockerfile` de cada serviço no
`docker-compose.yml` e remova a linha `.env` do `.dockerignore` (o Dockerfile da
UI faz `COPY .env`).

---

## 🚢 Script de Redeploy (`redeploy.sh`)

O LoginHUB disponibiliza o utilitário `./redeploy.sh` na raiz para simplificar o gerenciamento dos containers em produção:

```bash
# Menu interativo (exibe opções para escolher packages, api, ui ou todos)
./redeploy.sh

# Republicar apenas um serviço específico
./redeploy.sh packages
./redeploy.sh api
./redeploy.sh ui

# Republicar API e UI sem rebuildar imagens
./redeploy.sh --no-build api ui

# Derrubar containers antigos e recriar do zero
# (o -v embutido remove os volumes anônimos de node_modules — é o que usar
#  quando alguma dependência mudou)
./redeploy.sh --down

# Atualizar imagens base e limpar imagens dangling
./redeploy.sh --pull --prune
```

---

## 🔧 Variáveis de Ambiente (`.env`)

O arquivo `.env` deve ser mantido na **raiz** do projeto.

> ℹ️ As `VITE_*` **não são mais build args**. Com o dev server, o Vite lê o `.env`
> da raiz em runtime (`envDir` do `vite.config.ts`) e também o `process.env` que
> vem do `env_file` do compose. Mudou uma `VITE_*`? Basta reiniciar o serviço
> (`docker compose --env-file .env restart login-hub-ui`) — sem rebuild.

```env
# ====================
# Servidor (API)
# ====================
PORT=3000
TZ=America/Sao_Paulo

# ====================
# Banco de Dados PostgreSQL
# ====================
DB_HOST=server_db_postgres
DB_PORT=5432
DB_NAME=login_hub
DB_USER=admin_root
DB_PASS='***'

# ====================
# Autenticação e Segurança
# ====================
JWT_SECRET='***'                # Chave privada para assinatura de JWT (login e magic links)
MASTER_API_KEY='***'            # Chave de administrador mestre para chamadas /admin/*
VITE_MASTER_KEY='***'           # Chave mestra exposta para o build da UI

# ====================
# 2FA (TOTP)
# ====================
# Chave de 32 bytes em HEX (64 chars). Gere com: openssl rand -hex 32
# Cifra o secret TOTP (AES-256-GCM) e é o pepper do HMAC dos códigos de
# recuperação. SEM ASPAS: hex não tem caractere especial, e o env_file
# entregaria as aspas como parte do valor.
# ⚠️ Trocar esta chave torna ilegíveis TODOS os secrets e backup codes gravados.
TWOFA_ENC_KEY=***

# ====================
# CORS
# ====================
# Origens permitidas ALÉM de *.astralwavelabel.com, separadas por vírgula.
# Aceita origem exata (https://app.exemplo.com) ou curinga (*.exemplo.com,
# que cobre o apex e os subdomínios). Só https.
# Um app cliente fora da nossa zona — app.sulalimentos.com, por exemplo —
# leva "blocked by CORS policy" no preflight do login sem estar declarado aqui.
CORS_EXTRA_ORIGINS=*.exemplo.com

# ====================
# URLs Públicas
# ====================
API_PUBLIC_URL=https://loginhub.astralwavelabel.com
UI_PUBLIC_URL=https://loginhub.astralwavelabel.com
VITE_API_URL=https://loginhub.astralwavelabel.com/api

# ====================
# Apps com provisionamento próprio (opcional)
# ====================
# Sobrescreve a URL base da API da Sul Alimentos usada pelo convite de vendedor
# (ver fluxo 5️⃣ e apps/ui/src/config/provisioning.ts). Sem esta linha vale o
# padrão de produção embutido no código.
# VITE_SUL_ALIMENTOS_API_URL=https://sul-api.astralwavelabel.com/api

# ====================
# Serviço de E-mail (SMTP Hostinger)
# ====================
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=awlsrvlab@astralwavelabel.com
SMTP_PASS='***'

# ====================
# Remetente por aplicativo (opcional)
# ====================
# Por padrão todo e-mail sai de SMTP_USER. As chaves seguem `aplicativos.id`:
#   SMTP_APP_<id>_FROM / _USER / _PASS / _HOST / _PORT
# ⚠️ Sem _USER/_PASS próprios, o envio sai pela conta padrão só trocando o
# cabeçalho From — a maioria dos provedores recusa, e o SPF do outro domínio
# não cobre o nosso servidor. Crie a caixa de verdade.
#SMTP_APP_2_FROM=contato@sulalimentos.com
#SMTP_APP_2_USER=contato@sulalimentos.com
#SMTP_APP_2_PASS='***'
```

### Remetente por aplicativo

Um convite da Sul Alimentos saindo de `awlsrvlab@astralwavelabel.com` confunde
quem recebe: a pessoa foi convidada para um cliente e o e-mail chega de um
domínio que ela nunca viu. As chaves `SMTP_APP_<id>_*` resolvem isso.

| Config presente | O que acontece |
|---|---|
| `_USER` + `_PASS` | Transporte dedicado, autenticado na caixa do cliente. **É o único caminho que passa em SPF/DKIM do domínio dele.** |
| só `_FROM` | Reusa a conta padrão trocando o cabeçalho. A Hostinger tende a recusar remetente fora da conta autenticada; se passar, cai em spam. Serve para teste. |
| nada | Remetente padrão do hub. |

Valores de exemplo (`__DEFINIR__`, `***`, `changeme`) são tratados como ausentes
— um placeholder ligaria um SMTP que só sabe falhar, derrubando os convites
daquele app.

---

## 🛣️ Endpoints da API

**Base URL:**
- Pública: `https://loginhub.astralwavelabel.com/api`
- Interna Docker (`awl_network`): `http://server_loginhub_backend:3000/api`

---

### 🔓 Autenticação (`/auth`)

| Método | Path | Autenticação | Descrição |
|---|---|---|---|
| `POST` | `/auth/login` | Público | Autentica e emite JWT 24h. Aceita `email`, `password` e `app_id` (opcional). |
| `POST` | `/auth/refresh` | Bearer Token (válido ou grace 7d) | Renova o token JWT por mais 24h. |
| `POST` | `/auth/setup-password` | Público (via Magic Link Token) | Define a senha no 1º acesso ou reset (invalida o Magic Link). **Três desfechos**: `requires2FA` + `challengeToken` se a conta já tem 2FA ativo; `require2FASetup` + passe de 10 min se falta enrolar; sessão de 24h só quando não há pendência. |
| `POST` | `/auth/logout` | Público | Retorna orientação para o cliente limpar o storage local. |

#### 2FA (`/auth/2fa`)

| Método | Path | Autenticação | Descrição |
|---|---|---|---|
| `POST` | `/auth/2fa/verify` | `challengeToken` no corpo | Fecha o login com o código do autenticador. Devolve a sessão de 24h. |
| `POST` | `/auth/2fa/verify-backup` | `challengeToken` no corpo | Idem, com um código de recuperação (uso único). |
| `GET` | `/auth/2fa/status` | Sessão **ou** passe `2fa-setup` | Se o 2FA está ativo e quantos códigos de recuperação restam. |
| `POST` | `/auth/2fa/setup` | Sessão **ou** passe `2fa-setup` | Gera o secret e a URI `otpauth://`. Ainda não ativa nada. |
| `POST` | `/auth/2fa/verify-setup` | Sessão **ou** passe `2fa-setup` | Confirma a ativação com um código. Devolve os códigos de recuperação **uma única vez**, encerra as demais sessões e **devolve a sessão nova** — grave-a, senão a requisição seguinte cai em `SESSAO_REVOGADA`. |
| `POST` | `/auth/2fa/disable` | Sessão (só) | Desativa. Exige `codigo` (TOTP) **ou** `backupCode`. |
| `POST` | `/auth/2fa/backup-codes` | Bearer Token | Regenera os códigos (exige `codigo` TOTP). Invalida os anteriores. |
| `GET` | `/auth/2fa/backup-codes` | Bearer Token | Mesmo handler, código em `?code=`. Existe por compatibilidade — **prefira o POST**: na query string o código para em log de acesso e histórico do navegador. |

**Limites de tentativa** — em memória, por processo, por CONTA (não por IP: as APIs
dos tenants chegam todas pelo mesmo gateway da rede interna):

| Rotas | Limite | Chave |
|---|---|---|
| `/auth/login` | 10 por 15 min | e-mail normalizado |
| `verify`, `verify-backup` | 5 por 15 min | `sub` do `challengeToken` |
| `setup`, `verify-setup`, `disable`, `backup-codes`, `status` | 10 por 15 min | `sub` da sessão |

> A contrapartida de limitar por conta: quem souber o e-mail de alguém consegue
> queimar o balde daquela conta por 15 min. É o preço de não tratar todos os
> tenants como um cliente só — eles chegam pelo mesmo gateway interno.

Ao estourar: `429` com `Retry-After` em segundos. O contador zera a cada restart
da API — é aceitável para travar força bruta, mas não sobreviveria a réplicas.

---

### 🔐 Administração (`/admin/*`)

*Exige o header `x-api-key: <MASTER_API_KEY>` em todas as requisições.*

#### Aplicativos (Tenants)

| Método | Path | Body / Params | Descrição |
|---|---|---|---|
| `GET` | `/admin/apps` | - | Lista todos os aplicativos com contagem de usuários (`total_usuarios`), `logo`, `bot_url` e `platform_url`. |
| `GET` | `/admin/apps/:id` | - | Obtém detalhes completos de um aplicativo. |
| `POST` | `/admin/apps` | `CreateAppDTO` | Cadastra novo aplicativo (+ conta admin inicial opcional). |
| `PUT` | `/admin/apps/:id` | `UpdateAppDTO` | Atualiza dados (`nome`, `email`, `documento`, `telefone`, `logo`, `bot_url`, `platform_url`). |
| `PATCH` | `/admin/apps/:id/status` | `{ "status": "ativo" \| "inativo" }` | Altera a situação do aplicativo. |
| `DELETE` | `/admin/apps/:id` | - | Exclui o aplicativo e remove em cascata todos os usuários vinculados. |

#### Usuários

| Método | Path | Body / Params | Descrição |
|---|---|---|---|
| `GET` | `/admin/users` | - | Listagem global de usuários de todos os aplicativos. |
| `GET` | `/admin/apps/:id/users` | - | Lista usuários vinculados a um aplicativo específico. |
| `POST` | `/admin/users` | `CreateUserDTO` | Cria usuário. Gera Magic Link (1h); dispara e-mail com template se `emailHtml` for informado. |
| `PUT` | `/admin/users/:id` | `UpdateUserDTO` | Atualiza dados cadastrais, telefone, e-mail ou nível de acesso (`role`). |
| `PATCH` | `/admin/users/:id/status` | `{ "status": "ativo" \| "inativo" \| "bloqueado" }` | Atualiza o status do usuário. |
| `POST` | `/admin/users/:id/reset-password` | `{ "emailHtml"?: "..." }` | Invalida senha atual, gera Magic Link (1h) e dispara e-mail de redefinição. |
| `POST` | `/admin/users/:id/reset-2fa` | — | Descarta o autenticador da conta (perdeu o celular **e** os códigos). A exigência de 2FA **permanece**: a pessoa reenrola no próximo login. Encerra as sessões abertas. |
| `DELETE` | `/admin/users/:id` | - | Exclui a conta do usuário. |

---

## 🔄 Fluxos de Autenticação e Regras de Negócio

### 1️⃣ Fluxo de Login e Desambiguação Multi-Tenant

Como um mesmo e-mail pode pertencer a múltiplos aplicativos clientes, o backend trata a autenticação da seguinte forma:

```
[ POST /api/auth/login ] { email, password, app_id? }
          │
          ├─► Se app_id foi informado ──► Autentica diretamente naquele app.
          │
          └─► Se app_id NÃO foi informado:
                │
                ├─► Valida as senhas dos apps vinculados ao e-mail.
                │
                ├─► Apenas 1 app teve senha correspondente ──► Sucesso (Login automático).
                │
                └─► 2 ou mais apps possuem a mesma senha ──► Retorna 409 AMBIGUOUS_EMAIL:
                      {
                        "error": "AMBIGUOUS_EMAIL",
                        "message": "Este e-mail está vinculado a mais de um aplicativo...",
                        "availableApps": [
                          { "id": "1", "nome": "MoneyAPP", "logo": "data:image/..." },
                          { "id": "2", "nome": "LifeDash", "logo": "data:image/..." }
                        ]
                      }
```

O app cliente exibe a interface de seleção e reenvia a requisição com o `app_id` selecionado.

---

### 2️⃣ Fluxo de Primeiro Acesso via Magic Link

O LoginHUB não gera senhas temporárias. Toda a inclusão de novos usuários utiliza **Magic Link**:

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 1. Admin cria usuário no LoginHUB UI (POST /admin/users)                │
 │    - Backend grava um hash placeholder (CSPRNG) como senha inicial.     │
 │    - Backend assina JWT (24h, `action: 'setup-password'`, claim `pwf`). │
 │    - SMTP envia o e-mail contendo o Magic Link ao usuário.              │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 2. Usuário clica no link do e-mail (redireciona para /setup-password)   │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 3. UI chama POST /auth/setup-password { token, novaSenha }              │
 │    - Backend valida o JWT e a `action`.                                 │
 │    - Confere o claim `pwf` contra o `senha_hash` atual (uso único).     │
 │    - Grava o hash da nova senha — o que mata o próprio link.            │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 4. Usuário é redirecionado para o Login e acessa o app com a nova senha│
 └─────────────────────────────────────────────────────────────────────────┘
```

> ℹ️ **Fallback de E-mail**: Se o SMTP falhar ao enviar o e-mail, a API retorna `{ emailSent: false, magicLinkToken: "..." }`. A UI exibe o link gerado para que o administrador possa enviá-lo manualmente ao usuário.

> 🔐 **Uso único sem coluna de controle**: o token carrega em `pwf` uma impressão
> digital (SHA-256, 16 hex) do `senha_hash` vigente na emissão. Definida a senha,
> o hash muda, a impressão deixa de bater e o link morre — sem estado no banco.
> Isso substituiu a flag `senha_padrao`, que era do *usuário* e não do *token*:
> dois links abertos dividiam o mesmo estado e um reset ressuscitava um convite
> anterior ainda não expirado. Token sem `pwf` é recusado (fail closed).

---

### 3️⃣ Fluxo de Redefinição de Senha (Reset)

1. O administrador aciona **"Resetar Senha"** no painel de usuários (`POST /admin/users/:id/reset-password`).
2. O backend substitui a senha por um valor aleatório do CSPRNG (ninguém o conhece) e gera um novo Magic Link token (expiração 24h), já com o `pwf` do novo hash — o que invalida qualquer link emitido antes.
3. O e-mail de redefinição é disparado. Ao acessar o link, o usuário define sua nova senha e conclui o processo.

---

### 4️⃣ Fluxo de Renovação de Sessão (Sliding Refresh)

```http
POST /api/auth/refresh
Authorization: Bearer <token-jwt>
```

- Valida o token atual (aceita tokens expirados há **até 7 dias** — Grace Period).
- **Recusa qualquer token com a claim `action`** — magic link (`setup-password`),
  desafio de 2FA (`2fa-challenge`) e passe de enrolamento (`2fa-setup`) são
  passes de etapa única. Trocá-los por sessão aqui anularia a etapa que eles
  guardam (no caso do desafio, seria bypass do segundo fator).
- Respeita o **piso de sessão** (`sessoes_validas_desde`): token emitido antes da
  ativação do 2FA não se renova — devolve `SESSAO_REVOGADA`.
- Checa se o usuário e o aplicativo continuam com status `ativo` no banco de dados.
- Emite um novo token JWT com validade renovada de 24 horas.

---

### 5️⃣ Fluxo de Convite com Provisionamento no App

O fluxo padrão (2️⃣) resolve tudo dentro do LoginHUB. Alguns apps, porém, guardam
dados do usuário que o hub não conhece — CPF, comissão, contrato. Convidar só
pelo hub deixaria a pessoa com **login válido e sem cadastro no app**.

Para esses apps o fluxo **inverte**: o modal de convite chama o endpoint do
próprio app, e é ele quem cria o usuário no LoginHUB (via M2M) e a linha na base
dele — numa operação só, sem meio-caminho.

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 1. Admin abre "Convidar Usuário" num app provisionado                   │
 │    - A UI consulta config/provisioning.ts pelo app_id.                   │
 │    - O modal ganha o papel do app ("Vendedor") + os campos extras.       │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 2. UI faz POST direto no endpoint do APP (não no LoginHUB)              │
 │    - Ex: POST https://sul-api.../api/vendedor                            │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 3. O app cria o usuário no LoginHUB via M2M e grava o cadastro dele     │
 │    - Dispara o e-mail de convite com o template do próprio app.          │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 4. Daqui em diante é o Magic Link normal (fluxo 2️⃣)                     │
 └─────────────────────────────────────────────────────────────────────────┘
```

**Onde se configura:** [`apps/ui/src/config/provisioning.ts`](apps/ui/src/config/provisioning.ts).
A chave é o `app_id` no LoginHUB. Um app **sem entrada** ali segue no fluxo
padrão — não é preciso mexer em mais nada para desativar.

```ts
export const PROVISIONED_APPS: Record<string, ProvisionedApp> = {
  "2": {                              // Sul Alimentos
    roleLabel: "Vendedor",
    endpoint: `${SUL_ALIMENTOS_API}/vendedor`,
    fields: [ /* cpf, phone, commissionRate */ ],
    buildPayload: (base, extra) => ({ /* formato que o app espera */ }),
  },
};
```

Pontos que valem atenção ao adicionar um app novo:

- **Só o papel provisionado passa pelo endpoint do app.** Admin, suporte e
  usuário padrão continuam no fluxo normal do LoginHUB — senão não haveria como
  convidar um administrador para um app provisionado.
- **Não há etapa de pré-visualização** nesse caminho: quem monta e envia o
  e-mail é o app, com o template dele.
- **Máscara ≠ número.** Campos com `mask` vão sem formatação para a API; campos
  numéricos não passam por `unmask`, senão `"7.5"` viraria `"75"`.
- **Erros por campo**: se o app responder `{ fields: { cpf: "Já cadastrado" } }`,
  a mensagem aparece no input correspondente. Sem isso, o modal cai em mensagens
  por status (401/403 = sessão sem permissão, sem resposta = app fora do ar).
- A URL base da Sul Alimentos pode ser sobrescrita por
  `VITE_SUL_ALIMENTOS_API_URL` no `.env`; sem ela vale o padrão de produção
  embutido no código.

---

### 6️⃣ Fluxo de 2FA (TOTP)

Opt-in, por conta. Quem não ativou **não percebe diferença nenhuma**: a resposta
do `/auth/login` continua idêntica byte a byte.

#### Ativação

```
[ POST /auth/2fa/setup ]  Bearer <jwt>
          │  gera secret (160 bits), grava CIFRADO como pendente
          ▼
   { secret, otpauthUri, label, issuer }
          │  o cliente desenha o QR a partir da otpauthUri
          ▼
[ POST /auth/2fa/verify-setup ]  { codigo: "123456" }
          │  confere o código, marca ativo
          ├─► gera 10 códigos de recuperação  ── exibidos UMA vez
          └─► carimba sessoes_validas_desde    ── derruba as sessões anteriores
```

#### Login com 2FA ativo

```
[ POST /auth/login ]  { email, password }
          │  senha OK, mas a conta tem 2FA
          ▼
   200 { requires2FA: true, challengeToken, expiresIn: 300, methods: [...] }
          │  ⚠️ NÃO há `token` aqui
          ▼
[ POST /auth/2fa/verify ]  { challengeToken, codigo }
   ou
[ POST /auth/2fa/verify-backup ]  { challengeToken, backupCode }
          ▼
   200 { token, expiresIn: 86400, usuario, app }   ← sessão normal de 24h
```

#### 2FA é exigido de todas as contas

Não há configuração por app: toda conta criada nasce com 2FA obrigatório, e o
reset de senha (o caminho de reconvite das contas antigas) também passa a exigir.

> ⚠️ **Todo app cliente precisa tratar a resposta de desafio.** Um cliente que
> assume `200` = token na mão vai ler `token` como `undefined` e gravar a string
> `"undefined"` no storage — o usuário fica travado numa sessão inválida, sem
> mensagem de erro. Atualize o cliente ANTES de reconvidar os usuários dele.

A migração [`003_2fa_backfill.sql`](db/003_2fa_backfill.sql) fecha o acervo
antigo. Sem ela a exigência só era gravada por convite ou reset, e toda conta
anterior ao 2FA entrava apenas com senha — `estadoDoLogin` devolve `'sessao'`
quando não existe linha em `usuarios_2fa`. "Obrigatório" valia para os novos e
para mais ninguém. Depois do backfill, quem ainda não enrolou cai no fluxo de
enrolamento no próximo login.

#### Detalhes que economizam depuração

- **Código de uso único de verdade.** `ultimo_step` guarda o maior step aceito, então
  o mesmo código não passa duas vezes nem dentro dos 30s em que continua
  matematicamente válido. Consequência prática: ativar o 2FA e logar no mesmo
  intervalo de 30s exige esperar o próximo código. GitHub e Google se comportam igual.
- **Tolerância de relógio de ±1 step** (30s para cada lado). Celular muito
  dessincronizado falha — o ajuste é no relógio do aparelho.
- **Multi-tenant.** O 2FA é por linha de `usuarios`. Quem tem o mesmo e-mail em
  vários apps enrola uma vez por app; o `label` da URI carrega o nome do app
  (`LoginHUB:MoneyAPP (fulano@x.com)`), senão o autenticador mostra N entradas idênticas.
- **O master está fora.** O login master não tem linha em `usuarios` (`sub: "0"`),
  então não comporta 2FA nesta versão. Ele segue protegido só pela `MASTER_API_KEY`.
- **Reset de senha não substitui o segundo fator.** Numa conta com 2FA ativo, o
  `/auth/setup-password` devolve `requires2FA` + `challengeToken` em vez de
  sessão. Sem isso o reset seria um atalho para pular o TOTP: bastaria controlar
  a caixa de entrada — ou ser um admin disparando reset — para entrar sem tocar
  no autenticador.
- **Perdeu o celular e os códigos?** `POST /admin/users/:id/reset-2fa`. Descarta
  o autenticador sem isentar do 2FA; a conta volta para "precisa enrolar". Não
  há caminho pelo próprio usuário, de propósito.

#### 2FA obrigatório

Todo convite exige o segundo fator — não é opcional. O convidado define a senha
e escaneia o QR **na mesma tela**; sem concluir, a conta não abre sessão.

```
e-mail de convite  →  /setup-password?token=…   (magic link, como sempre)
                          │  define a senha
                          │  setup-password devolve PASSE de 10 min + require2FASetup
                          ▼
                     mesma página mostra o QR   ← desenhado no NAVEGADOR
                          │  confirma o código
                          ▼
                     backup codes na tela
```

> 🔒 **O secret e o QR nunca entram no e-mail.** Esse mesmo e-mail carrega o magic
> link de senha e é o canal de recuperação da conta: pôr o segundo fator ali
> colocaria os dois fatores no mesmo lugar, e quem lesse a caixa postal teria
> ambos. O e-mail só ganha um aviso de "tenha o celular à mão".

Detalhes:

- **Quem abandona no meio** (senha definida, 2FA não configurado) recebe no login
  `{ require2FASetup, setupToken }` — um passe de 10 min que só abre as rotas de
  enrolamento, em vez de ficar preso sem saída. O `/auth/setup-password` devolve
  o mesmo passe, e não sessão: senão abrir o convite, definir a senha e fechar a
  aba renderia 24h de acesso (renováveis por mais sete pelo grace do refresh)
  sem segundo fator nenhum.
- **Passe não é sessão.** O `authMiddleware` recusa qualquer token com claim
  `action` — só as rotas de enrolamento abrem exceção para `2fa-setup`. Antes a
  claim era ignorada, e um `challengeToken` (que se obtém só com a senha) já
  lia `/auth/2fa/status`.
- **O usuário não desativa** um 2FA obrigatório: `/auth/2fa/disable` devolve
  `403 OBRIGATORIO`. E como a exigência agora vale para todas as contas, não há
  rota que a remova — a ação administrativa disponível é o *reset* (troca de
  autenticador), nunca a isenção.

#### Ativando pelo terminal

Não há tela de usuário no painel do hub (ele é só do master), então o enrolamento
sai por [`scripts/2fa-enroll.sh`](scripts/2fa-enroll.sh) — que fala direto com a
API e por isso não esbarra em CORS:

```bash
./scripts/2fa-enroll.sh voce@exemplo.com 8
```

Ele autentica, gera o secret, desenha o QR no terminal (se houver `qrencode`;
senão mostra a chave para digitação manual), pede o código e imprime os códigos
de recuperação.

#### Testando pelo curl

```bash
API=https://loginhub.astralwavelabel.com/api

# 1. login -> challenge
curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"voce@exemplo.com","password":"...","app_id":"8"}'

# 2. segunda etapa
curl -s -X POST $API/auth/2fa/verify -H 'Content-Type: application/json' \
  -d '{"challengeToken":"<do passo 1>","codigo":"123456"}'

# 3. ativação (com uma sessão já aberta)
curl -s -X POST $API/auth/2fa/setup -H "Authorization: Bearer $JWT"
curl -s -X POST $API/auth/2fa/verify-setup -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' -d '{"codigo":"123456"}'
```

**Componentes de referência** para o app cliente copiar
([`useTwoFactor.ts`](apps/ui/src/features/twoFactor/useTwoFactor.ts),
[`TwoFactorSetup.tsx`](apps/ui/src/features/twoFactor/TwoFactorSetup.tsx),
[`TwoFactorChallenge.tsx`](apps/ui/src/features/twoFactor/TwoFactorChallenge.tsx)).

Ficam em `apps/ui` para o TypeScript do monorepo validá-los a cada build, em vez
de apodrecerem dentro de um bloco de markdown. Os três são exercitados de
verdade em [`SetupPassword.tsx`](apps/ui/src/pages/SetupPassword.tsx) — a única
página do hub por onde passa usuário final: define a senha, escaneia o QR
(`TwoFactorSetup`) ou confirma o código quando a conta já tem 2FA
(`TwoFactorChallenge`). O resto do painel é só do master.

---

## 🔌 Integração em um App Cliente (ex: MoneyAPP)

### Fluxo de Login com Suporte a Desambiguação (TypeScript)

```ts
import { authApi } from '@loginhub/api-client';

async function handleLogin(email: string, password: string, appId?: string) {
  try {
    const response = await authApi.login(email, password, appId);
    
    // Sucesso no login
    localStorage.setItem('user_token', response.token);
    return response;
  } catch (error: any) {
    if (error.response?.data?.error === 'AMBIGUOUS_EMAIL') {
      // Exibe modal para o usuário escolher o aplicativo desejado
      const apps = error.response.data.availableApps;
      showTenantSelectorModal(apps, (selectedAppId) => {
        handleLogin(email, password, selectedAppId);
      });
      return;
    }
    throw error;
  }
}
```

### Auto-Refresh com `@loginhub/api-client`

Se o aplicativo cliente utilizar a biblioteca `@loginhub/api-client`, o interceptor Axios já renova o token automaticamente em caso de resposta `401 Unauthorized` por expiração do JWT.

---

## 👥 Modelo de Dados (PostgreSQL)

### Tabela `aplicativos` (Tenants)

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `serial` (PK) | Identificador do aplicativo. |
| `nome` | `varchar(255)` | Nome exibido do app (obrigatório). |
| `documento` | `varchar(20)` | CNPJ/CPF da organização responsável. |
| `email` | `varchar(255)` | E-mail de contato do aplicativo. |
| `telefone` | `varchar(20)` | Telefone de contato. |
| `logo` | `text` | Imagem da logo em base64 (dataURL, auto-resized). |
| `bot_url` | `varchar(500)` | Link do bot de suporte (Telegram, WhatsApp, etc.). |
| `platform_url` | `varchar(500)` | Link da plataforma web/painel do cliente. |
| `status` | `varchar(20)` | Estado do tenant: `'ativo'` ou `'inativo'`. |
| `data_cadastro` | `timestamp` | Data de criação no sistema. |
| `data_atualizacao` | `timestamp` | Data da última alteração. |

---

### Tabela `usuarios`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `serial` (PK) | Identificador único do usuário. |
| `app_id` | `integer` (FK) | Referência para `aplicativos.id` (delete em cascata). |
| `nivel_acesso_id` | `integer` (FK) | Referência para `niveis_acesso.id`. |
| `nome` | `varchar(255)` | Nome completo do usuário. |
| `email` | `varchar(255)` | E-mail do usuário. *(Único por aplicativo)*. |
| `senha_hash` | `varchar(255)` | Hash bcrypt da senha (cost factor 10). |
| `telefone` | `varchar(20)` | Telefone de contato do usuário. |
| `status` | `varchar(20)` | Situação da conta: `'ativo'`, `'inativo'` ou `'bloqueado'`. |
| `ultimo_acesso` | `timestamp` | Timestamp atualizado a cada login com sucesso. |
| `data_cadastro` | `timestamp` | Data de cadastro. |

> 🔒 **Constraint de Unicidade**: `usuarios_email_app_id_unique` UNIQUE (`email`, `app_id`).

---

### Tabela `niveis_acesso` (Roles)

| ID | Nome | Descrição |
|---|---|---|
| 1 | `master` | Acesso de infraestrutura/sistema (autenticado por `MASTER_API_KEY`). |
| 2 | `admin` | Administrador da organização/tenant. |
| 3 | `user` | Usuário comum com acesso ao aplicativo. |
| 4 | `suporte` | Perfil de atendimento e suporte. |

---

### Tabelas de 2FA

`usuarios_2fa` — uma linha por linha de `usuarios` (por conta, não por e-mail):

| Coluna | Tipo | Descrição |
|---|---|---|
| `usuario_id` | `integer` (PK, FK) | Referência para `usuarios.id`, cascata no delete. |
| `secret_cifrado` | `text` | Secret TOTP em AES-256-GCM: `v1:<iv>:<tag>:<ciphertext>` em base64. Nunca em claro. |
| `ativo` | `boolean` | `false` enquanto o enrolamento não é confirmado. |
| `ultimo_step` | `integer` | Maior step TOTP já aceito — bloqueia replay dentro dos 30s. |
| `sessoes_validas_desde` | `timestamp` | Piso de validade: JWT com `iat` anterior é recusado. |
| `confirmado_em` | `timestamp` | Quando o 2FA foi ativado. |

> A linha **não é apagada** ao desativar (só `ativo = false`): `sessoes_validas_desde`
> precisa sobreviver, senão desativar o 2FA ressuscitaria as sessões que a ativação derrubou.

`usuarios_2fa_backup_codes` — 10 por usuário, HMAC-SHA256 com `TWOFA_ENC_KEY` de pepper:

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | `serial` (PK) | — |
| `usuario_id` | `integer` (FK) | Cascata no delete. |
| `codigo_hmac` | `varchar(64)` | HMAC do código normalizado (maiúsculas, sem hífen). |
| `usado_em` | `timestamp` | `NULL` enquanto não gasto. Uso único. |

DDL em [`db/001_2fa.sql`](db/001_2fa.sql), com
[`002_2fa_obrigatorio.sql`](db/002_2fa_obrigatorio.sql) (coluna `obrigatorio`) e
[`003_2fa_backfill.sql`](db/003_2fa_backfill.sql) (exigência para o acervo
antigo) por cima — dois `CREATE TABLE`, nenhum `ALTER` em
`usuarios`. Rollback é derrubar as duas tabelas.

---

## 🧰 Pacote `@loginhub/auth-kit`

**Fonte canônica da integração com o hub.** Os apps clientes não instalam este
pacote por npm: recebem uma **cópia dos arquivos** pelo `scripts/sync-auth-kit.sh`.
Vendorizar sem sincronizar foi exatamente o que produziu três forks divergentes
do cliente antigo — uma delas ainda chamando `/auth/change-password`, rota que
não existe mais.

```bash
./scripts/sync-auth-kit.sh          # propaga para os apps e para os bots
./scripts/sync-auth-kit.sh --check  # falha se alguma cópia divergir (use no CI)
```

### `hubAuthServer.ts` — guarda das APIs clientes

> ⚠️ **Sem isto, o 2FA não protege o app cliente.**
>
> Todo app valida o JWT do hub com o MESMO `JWT_SECRET` — é o que faz a
> identidade central funcionar. Mas o hub assina com essa chave **três passes de
> etapa única**, e um `jwt.verify` cru aceita os três:
>
> | Token | Como se obtém | Validade |
> |---|---|---|
> | `action: '2fa-challenge'` | **só a senha** | 5 min |
> | `action: '2fa-setup'` | **só a senha** | 10 min |
> | `action: 'setup-password'` | **só o e-mail de convite** | 24 h |
>
> O `2fa-setup` carrega `sub`, `email`, `app_id` e `role` — indistinguível de
> uma sessão para quem só confere assinatura. O hub recusa esses tokens nas
> próprias rotas; a guarda leva a mesma regra para o outro lado da fronteira.

```ts
import { verifyHubToken, HubAuthError, bearerDoRequest } from './lib/hubAuthServer';

const hubConfig = { secret: process.env.JWT_SECRET, appId: process.env.LOGINHUB_APP_ID };

const token = bearerDoRequest(req);
const sessao = verifyHubToken(token, hubConfig);  // recusa `action`, confere tenant
```

Falha **fechada** (500) quando falta `secret` ou `appId`: um
`process.env.JWT_SECRET || 'fallback'` aceita token forjado por quem ler o
código, e um `appId` ausente desliga a checagem de tenant sem ninguém perceber.

### `hubAuthClient.ts` — cliente dos frontends

`/auth/login` e `/auth/setup-password` respondem **200 em três desfechos** e só
um traz sessão. Cliente que assume "200 = token na mão" grava `undefined` no
storage — e como `!!'undefined'` é `true`, o app se dá por autenticado com lixo
e entra num laço de 401 sem mostrar erro nenhum.

O kit devolve união discriminada, então o compilador cobra os três:

```ts
const hub = createHubAuth({ baseUrl: LOGINHUB_API, appId: 3, tokenKey: 'meu_token' });

const r = await hub.login(email, senha);
if (r.status === 'desafio')  { /* pedir código → hub.twoFactor.verify(...) */ }
if (r.status === 'enrolar')  { location.href = `${HUB_UI}/enrolar-2fa?token=${r.setupToken}`; }
if (r.status === 'sessao')   { /* sessão já gravada */ }
```

Sem framework e sem axios — só `fetch`. O mesmo arquivo roda em Vue, React e
página estática; o que muda é a config.

O `refresh` também é do kit, com **single-flight**: quando a sessão vence,
várias requisições caem em 401 juntas, e sem coordenação cada uma dispararia a
própria renovação. O coordenador mora no kit — antes eram três `performRefresh`
copiados, cada um com a sua versão do que gravar no storage.

```ts
// dentro do interceptor de 401, com o axios local reenviando a requisição
const novo = await hub.refresh();          // ou hub.refresh(tokenExplicito)
if (!novo) { /* deslogar — inclui SESSAO_REVOGADA */ }
config.headers.Authorization = `Bearer ${novo}`;
return api.request(config);
```

### `hubAuthBot.ts` — os bots de Telegram

Camada fina sobre o `hubAuthClient`, para os bots (MoneyAPP, TodoAPP, NotesAPP).
Existe por uma diferença que não é de estilo:

| | frontend | bot |
|---|---|---|
| pessoas por processo | 1 | N conversas simultâneas |
| storage da sessão | `localStorage` | **nenhum** — o token volta para quem chamou |

Um storage ambiente num bot entregaria a sessão de quem entrou por último a
todos os outros chats. Aqui o storage não guarda nada; na prática o bot nem
precisa do token depois: a sessão serve para descobrir de quem é a conta e
gravar o vínculo `telegram_id → loginhub_id`, e daí em diante é o vínculo que
autoriza.

```ts
const hub = criarHubAuthBot({ baseUrl: LOGINHUB_API, appId: 3, appLoginUrl: APP_LOGIN_URL });

const r = await hub.login(email, senha);
if (r.status === 'enrolar')  { responder(hub.linkEnrolamento()); }  // manda para o login do app
if (r.status === 'desafio')  { guardar(r.challengeToken); /* pedir o código */ } // 5 min
if (r.status === 'sessao')   { vincular(hub.donoDaSessao(r.session)); }

// o código de 6 dígitos e o de recuperação (XXXXX-XXXXX) têm rotas diferentes
const sessao = await hub.segundoFator(challengeToken, oQueAPessoaDigitou);
```

O desafio se resolve **no chat** (código de uso único, apagado da conversa logo
depois), mas o enrolamento **não**: desenhar o QR no Telegram poria o secret do
TOTP no mesmo canal por onde o bot conversa — a mesma razão pela qual ele não
vai por e-mail. O bot manda o link da tela do hub, abaixo.

### Tela de enrolamento compartilhada

Um app que recebe `require2FASetup` tem um passe de 10 minutos e nenhuma tela
para gastá-lo. Em vez de oito implementações de QR divergindo, todos apontam
para a **mesma página do hub**:

```
https://loginhub.astralwavelabel.com/enrolar-2fa?token=<setupToken>&retorno=<url-do-app>
```

---

## 🧰 Pacote `@loginhub/api-client`

SDK do **painel admin do hub** (rotas de apps e usuários, `x-api-key`). Para a
integração de um app cliente use o [`auth-kit`](#-pacote-loginhubauth-kit) acima
— é ele que trata os três desfechos do login e recusa os passes de etapa única.

- ✅ Injeção automática de `Authorization: Bearer <token>`
- ✅ Interceptor com **Auto-Refresh transparente em 401** (evita chamadas duplicadas simultâneas)
- ✅ Métodos tipados para Auth, Apps e Usuários

```ts
import { authApi, userApi, appApi } from '@loginhub/api-client';

// Realizar Login
const response = await authApi.login('usuario@email.com', 'senha123');

// Se houver ambiguidade de tenant:
if (response.error === 'AMBIGUOUS_EMAIL') {
  const selectedAppId = response.availableApps[0].id;
  const loginResult = await authApi.login('usuario@email.com', 'senha123', selectedAppId);
}

// Obter dados do usuário logado
const user = authApi.getUser();
```

---

## 🎨 UI (Admin Dashboard)

Disponível em: [`https://loginhub.astralwavelabel.com/login`](https://loginhub.astralwavelabel.com/login)

- 📊 Dashboard de métricas e status dos aplicativos e usuários cadastrados.
- 🏢 Gestão de Apps (suporte a upload/resize de logos, `bot_url` e `platform_url`).
- 👥 Gestão de Usuários por Tenant (criação, edição, alternância de status, exclusão).
- 📨 Visualização prévia de e-mail de convite renderizado dinamicamente antes do envio.
- 🤝 Convite com provisionamento: em apps configurados em `config/provisioning.ts`, o modal
  pede os campos que o app exige (CPF, comissão...) e delega a criação a ele. Ver fluxo 5️⃣.
- 🧛 **Dracula Dark Mode**: Chaveador de tema escuro/claro integrado.
- 📱 **PWA**: Instalável como aplicativo nativo em desktops e dispositivos móveis.

---

## 🔒 Segurança Aplicada

- **Criptografia de Senhas**: Bcrypt com salt rounds = 10.
- **Tokens Temporais**: JWT com validade de 24 horas para sessão e 24 horas para Magic Links.
- **Proteção de Magic Links**: Uso único garantido pelo claim `pwf` (impressão digital do `senha_hash` na emissão) — o link se autoinvalida assim que a senha muda. Tokens sem `pwf` são recusados.
- **Senhas Placeholder**: contas criadas por convite e contas resetadas recebem um valor de `crypto.randomBytes(32)` até o usuário definir a própria senha.
- **2FA (TOTP)**: secret cifrado em AES-256-GCM (nunca em claro), replay bloqueado por `ultimo_step`, códigos de recuperação em HMAC-SHA256, rate limit por conta e corte de sessões na ativação.
- **TOTP sem dependência externa**: RFC 6238 sobre `crypto` nativo, validado contra os 6 vetores de teste oficiais da RFC (inclusive `T=20000000000`, que exige contador de 64 bits).
- **Body Limit**: Express configurado com `5mb` para suportar upload de logos base64 otimizadas.
- **Proteção HTTP**: Middlewares `helmet()` e CORS configurados.

---

<div align="center">

**Desenvolvido com excelência pela Astral Wave Label** ⚡

</div>
