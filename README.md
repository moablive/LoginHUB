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
| 🪄 Magic Link (1º Acesso & Reset) | ✅ | Criação de conta e reset de senha utilizam Magic Link seguro de uso único (JWT 1h) em substituição a senhas temporárias. |
| 🔄 Refresh Session (Sliding 7d) | ✅ | Renovação contínua do JWT com grace period de até 7 dias após a expiração. |
| 👥 Multi-Tenant Isolado | ✅ | Cada aplicativo possui seus próprios usuários, configurações, logos e URLs de integração. |
| 🛡️ 4 Níveis de Acesso | ✅ | Níveis padronizados: `master` / `admin` / `user` / `suporte`. |
| 🚦 Gestão Granular de Status | ✅ | Controle de status em apps (`ativo`/`inativo`) e usuários (`ativo`/`inativo`/`bloqueado`). |
| 📧 Envio Automático por E-mail (SMTP) | ✅ | Disparo de convites e links de acesso via templates HTML personalizáveis. |
| 🔗 URLs de Integração (`bot_url` / `platform_url`) | ✅ | Suporte a links diretos para bots (Telegram/WhatsApp) e plataformas web por aplicativo. |
| 🎨 Dracula Dark Mode & Light Mode | ✅ | Alternância dinâmica de tema na UI com suporte nativo ao Dracula Theme. |
| 📱 PWA Funcional | ✅ | Frontend instalável como Progressive Web App (Service Worker + Web App Manifest). |
| 🚢 Script de Deploy Automatizado | ✅ | Script `./redeploy.sh` na raiz para deploy interativo ou via CLI com Docker Compose. |

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
# URLs Públicas
# ====================
API_PUBLIC_URL=https://loginhub.astralwavelabel.com
UI_PUBLIC_URL=https://loginhub.astralwavelabel.com
VITE_API_URL=https://loginhub.astralwavelabel.com/api

# ====================
# Serviço de E-mail (SMTP Hostinger)
# ====================
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=awlsrvlab@astralwavelabel.com
SMTP_PASS='***'
```

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
| `POST` | `/auth/setup-password` | Público (via Magic Link Token) | Define a senha do usuário no 1º acesso ou reset (invalida o Magic Link). |
| `POST` | `/auth/change-password` | Público (via Magic Link Token) | Alias de compatibilidade para `setup-password`. |
| `POST` | `/auth/logout` | Público | Retorna orientação para o cliente limpar o storage local. |

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
 │    - Backend cria registro com `senha_padrao = true`.                   │
 │    - Backend assina JWT (1h, `action: 'setup-password'`).               │
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
 │    - Backend valida o JWT.                                              │
 │    - Verifica se `senha_padrao === true` (garante uso único).           │
 │    - Grava o hash da nova senha e atualiza `senha_padrao = false`.       │
 └────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ 4. Usuário é redirecionado para o Login e acessa o app com a nova senha│
 └─────────────────────────────────────────────────────────────────────────┘
```

> ℹ️ **Fallback de E-mail**: Se o SMTP falhar ao enviar o e-mail, a API retorna `{ emailSent: false, magicLinkToken: "..." }`. A UI exibe o link gerado para que o administrador possa enviá-lo manualmente ao usuário.

---

### 3️⃣ Fluxo de Redefinição de Senha (Reset)

1. O administrador aciona **"Resetar Senha"** no painel de usuários (`POST /admin/users/:id/reset-password`).
2. O backend marca a conta com `senha_padrao = true` e gera um novo Magic Link token (expiração 1h).
3. O e-mail de redefinição é disparado. Ao acessar o link, o usuário define sua nova senha e conclui o processo.

---

### 4️⃣ Fluxo de Renovação de Sessão (Sliding Refresh)

```http
POST /api/auth/refresh
Authorization: Bearer <token-jwt>
```

- Valida o token atual (aceita tokens expirados há **até 7 dias** — Grace Period).
- Checa se o usuário e o aplicativo continuam com status `ativo` no banco de dados.
- Emite um novo token JWT com validade renovada de 24 horas.

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
| `senha_padrao` | `boolean` | Flag que indica se a senha ainda não foi personalizada (controla uso do Magic Link). |
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

## 🧰 Pacote `@loginhub/api-client`

SDK em TypeScript para integração rápida de aplicações clientes com a API do LoginHUB:

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
- 🧛 **Dracula Dark Mode**: Chaveador de tema escuro/claro integrado.
- 📱 **PWA**: Instalável como aplicativo nativo em desktops e dispositivos móveis.

---

## 🔒 Segurança Aplicada

- **Criptografia de Senhas**: Bcrypt com salt rounds = 10.
- **Tokens Temporais**: JWT com validade de 24 horas para sessão e 1 hora para Magic Links.
- **Proteção de Magic Links**: Tokens de primeiro acesso/reset possuem validação de uso único (`senha_padrao`).
- **Body Limit**: Express configurado com `5mb` para suportar upload de logos base64 otimizadas.
- **Proteção HTTP**: Middlewares `helmet()` e CORS configurados.

---

<div align="center">

**Desenvolvido com excelência pela Astral Wave Label** ⚡

</div>
