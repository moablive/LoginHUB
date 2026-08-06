<div align="center">

# 🛡️ LoginHUB

**Plataforma de autenticação centralizada da Astral Wave Label**

<img src="https://skillicons.dev/icons?i=ts,react,vite,tailwind,nodejs,express,postgres,docker,nginx,git&perline=10" />

<br/><br/>

[![Status](https://img.shields.io/badge/status-em%20produção-success)](https://loginhub.astralwavelabel.com)
[![PWA](https://img.shields.io/badge/pwa-enabled-blueviolet)]()
[![JWT](https://img.shields.io/badge/auth-JWT%20%2B%20Refresh-blue)](#-fluxo-de-autenticação)
[![Monorepo](https://img.shields.io/badge/npm-workspaces-CB3837?logo=npm&logoColor=white)](#-estrutura-do-monorepo)
[![License](https://img.shields.io/badge/license-private-lightgrey)]()

[**🌐 UI Pública**](https://loginhub.astralwavelabel.com/login) &nbsp;•&nbsp;
[**🔌 API Pública**](https://loginhub.astralwavelabel.com/api) &nbsp;•&nbsp;
[**📖 Endpoints**](#-endpoints-da-api) &nbsp;•&nbsp;
[**🔄 Integração**](#-integração-em-um-app-cliente-ex-moneyapp)

</div>

---

## 📌 Sobre o projeto

O **LoginHUB** é o serviço de **identidade central** que autentica os usuários de todos os aplicativos da infraestrutura Astral Wave Label (MoneyAPP, LifeDash, e futuros tenants). Cada usuário pertence a **um aplicativo** (`tenant`) com **um nível de acesso** (`role`), e todo o ciclo de vida da conta — convite, primeiro acesso, troca de senha, refresh de sessão — é gerenciado por aqui.

### Principais capacidades

| Recurso | Status |
|---|---|
| 🔑 Login com e-mail + senha (JWT 24h) | ✅ |
| 🔄 Refresh sliding com grace period de 7 dias | ✅ |
| 👥 Multi-tenant (apps isolados, usuários por app) | ✅ |
| 🛡️ 4 níveis de acesso (`master` / `admin` / `user` / `suporte`) | ✅ |
| 📧 Envio automático de convites por e-mail (SMTP) | ✅ |
| 🔒 Senha temporária + troca obrigatória no 1º acesso | ✅ |
| 🗝️ Reset de senha pelo admin (gera nova temp, envia e-mail) | ✅ |
| 🖼️ Logo do app em base64 (PNG/JPG/WEBP/SVG, ≤256px) | ✅ |
| 🤖 URL de bot por app (Telegram, WhatsApp, etc.) incluída no convite | ✅ |
| 🔐 Master key para acesso administrativo de infra | ✅ |
| 📱 PWA funcional (Instalável, Ícones, Service Worker) | ✅ |

---

## 🧱 Arquitetura

```
┌────────────────────────────────────────────────────────────────────┐
│                          USUÁRIO FINAL                             │
│   (cliente do MoneyAPP, LifeDash, etc — não acessa o LoginHUB UI)  │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │   APP CLIENTE (MoneyAPP)     │
                    │   - tela de login            │
                    │   - tela de troca de senha   │
                    └──────────────┬───────────────┘
                                   │  HTTPS
                                   │  (@loginhub/api-client)
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                          LOGINHUB                                  │
│  ┌────────────────────┐         ┌────────────────────────────────┐ │
│  │  apps/ui (React)   │         │  apps/api (Express + JWT)      │ │
│  │  Admin Dashboard   │ ◀──▶    │  /auth/*  /admin/*             │ │
│  │  (master/admin)    │         │                                │ │
│  └────────────────────┘         └─────────────┬──────────────────┘ │
│                                               │                    │
│                                               ▼                    │
│                              ┌──────────────────────────┐          │
│                              │  PostgreSQL (Drizzle ORM)│          │
│                              │  aplicativos / usuarios  │          │
│                              │  niveis_acesso           │          │
│                              └──────────────────────────┘          │
└────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │
                          ┌────────┴────────┐
                          │  SMTP Hostinger │  (e-mails de convite)
                          └─────────────────┘
```

---

## 📂 Estrutura do monorepo

Gerenciado com **NPM workspaces** e build em ordem topológica explícita (`schema → database → api-client → middlewares → services → api → ui`).

```
LoginHUB/
├── apps/
│   ├── api/                      # Express + JWT + Drizzle (porta 3000 interna / 3005 externa)
│   │   ├── src/
│   │   │   ├── app.ts            # Configuração de middlewares globais
│   │   │   ├── server.ts         # Bootstrap
│   │   │   ├── routes/index.ts   # Definição de rotas
│   │   │   └── controllers/      # Camada HTTP (input → service → response)
│   │   ├── Dockerfile
│   │   └── docker-compose.yml
│   └── ui/                       # React + Vite + Tailwind (porta 80 interna / 3006 externa)
│       ├── src/
│       │   ├── pages/            # Dashboard, AppUsers, CreateApp, Login
│       │   ├── components/
│       │   │   ├── modals/       # CreateUserModal, ConfirmModal, etc.
│       │   │   ├── LogoUpload/   # Upload + resize de logo do app
│       │   │   └── ...
│       │   └── templates/emails/ # Templates React → HTML para envio
│       ├── Dockerfile
│       └── docker-compose.yml
└── packages/
    ├── schema/                   # Interfaces TS + Drizzle table definitions
    ├── database/                 # Drizzle client + connection pool
    ├── api-client/               # Axios com interceptors + auto-refresh
    ├── middlewares/              # authMiddleware, adminMiddleware, CORS, métricas
    └── services/                 # Regras de negócio (AuthService, UserService, AppService, EmailService)
```

---

## 🚀 Setup local

### Pré-requisitos
- Docker + Docker Compose
- Rede Docker `awl_network` (externa, compartilhada com `server_db_postgres`)
- PostgreSQL rodando em `server_db_postgres` (mesma rede)

### Subir tudo
```bash
# A partir da raiz
docker compose -f apps/api/docker-compose.yml up -d --build
docker compose -f apps/ui/docker-compose.yml up -d --build
```

### Build local (sem Docker, para desenvolvimento)
```bash
npm install
npm run build      # build topológico de todos os workspaces
```

> ℹ️ **Importante**: o script `build` da raiz já está na ordem correta. Não use `npm run build --workspaces` direto — ele roda em ordem alfabética e quebra por dependência cruzada.

### Reset Cloudflare cache (regra de deploy)
Após qualquer deploy que afete o frontend:
```bash
/mnt/docker-services/documentacao/scripts/cleancachecloudflare.sh
```

---

## 🔧 Variáveis de ambiente

Arquivo `.env` na **raiz** do projeto. O `docker-compose.yml` da UI tem um symlink `apps/ui/.env → ../../.env` para que o Vite consiga interpolar os `VITE_*` no build.

```env
# ====================
# Servidor (API)
# ====================
PORT=3000
TZ=America/Sao_Paulo

# ====================
# Banco de dados
# ====================
DB_HOST=server_db_postgres
DB_PORT=5432
DB_NAME=login_hub
DB_USER=admin_root
DB_PASS='***'

# ====================
# Segurança
# ====================
JWT_SECRET='***'                # usado para assinar JWTs
MASTER_API_KEY='***'            # admin key para rotas /admin/*
VITE_MASTER_KEY='***'           # mesma key, embutida no bundle da UI

# ====================
# Domínios públicos
# ====================
API_PUBLIC_URL=https://loginhub.astralwavelabel.com
UI_PUBLIC_URL=https://loginhub.astralwavelabel.com
VITE_API_URL=https://loginhub.astralwavelabel.com/api

# ====================
# SMTP (Hostinger)
# ====================
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=awlsrvlab@astralwavelabel.com
SMTP_PASS='***'
```

> 🔐 `NODE_ENV` **NÃO** vai no `.env` — o Vite reclama. Ele é definido pelo `environment` do `docker-compose.yml` da API.

---

## 🛣️ Endpoints da API

**Base URL:**
- Pública: `https://loginhub.astralwavelabel.com/api`
- Local: `http://localhost:3005/api`
- Interna (outros containers na `awl_network`): `http://server_loginhub_backend:3000/api`

> ⚠️ **Mudança em 2026-07-28.** A API era publicada num hostname próprio,
> `api-auth.astralwavelabel.com`, apontando direto para o container da API. Essa
> rota do Cloudflare foi removida e a API passou a ser servida pelo nginx da
> própria UI (`apps/ui/nginx.conf`), em `/api` do mesmo hostname.
>
> Backends e bots **nunca** devem usar a URL pública — só a interna acima.

### 🔓 Auth (`/auth`)

| Método | Path | Auth | Função |
|---|---|---|---|
| `POST` | `/auth/login` | público | Autentica e devolve JWT 24h |
| `POST` | `/auth/refresh` | Bearer (mesmo expirado, grace 7d) | Renova o JWT |
| `POST` | `/auth/change-password` | Bearer | Define nova senha definitiva e zera `senha_padrao` |
| `POST` | `/auth/logout` | público | Sinal de saída (cliente limpa storage) |

### 🔐 Admin (`/admin/*`)

Todas exigem header `x-api-key: <MASTER_API_KEY>`.

#### Aplicativos

| Método | Path | Função |
|---|---|---|
| `GET` | `/admin/apps` | Lista todos com `total_usuarios`, `logo`, `bot_url` |
| `GET` | `/admin/apps/:id` | Detalhes |
| `POST` | `/admin/apps` | Cria app (+ admin opcional) |
| `PUT` | `/admin/apps/:id` | Atualiza (`nome`, `email`, `documento`, `telefone`, `logo`, `bot_url`) |
| `PATCH` | `/admin/apps/:id/status` | Body: `{ status: 'ativo' \| 'inativo' }` |
| `DELETE` | `/admin/apps/:id` | Remove (cascata nos usuários) |

#### Usuários

| Método | Path | Função |
|---|---|---|
| `GET` | `/admin/users` | Lista global |
| `GET` | `/admin/apps/:id/users` | Lista por app |
| `POST` | `/admin/users` | Cria usuário; envia e-mail se `emailHtml` no payload |
| `PUT` | `/admin/users/:id` | Atualiza dados |
| `POST` | `/admin/users/:id/reset-password` | Gera nova temp e envia e-mail |
| `DELETE` | `/admin/users/:id` | Remove |

#### Misc

| Método | Path | Função |
|---|---|---|
| `GET` | `/api` | Health check (status, env, master_key flag) |
| `GET` | `/metrics` | Prometheus scrape |

---

## 🔄 Fluxo de autenticação

### 1️⃣ Login

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@app.com", "password": "..." }
```

**Resposta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 86400,
  "requirePasswordChange": true,
  "usuario": { "id": "12", "nome": "...", "email": "...", "role": "user" },
  "app":     { "id": "3", "nome": "MoneyAPP", "status": "ativo" }
}
```

**Erros:**
| Status | Código | Quando |
|---|---|---|
| `401` | `CREDENCIAIS_INVALIDAS` | E-mail/senha errados |
| `403` | `APP_BLOQUEADO` | App do usuário foi suspenso |

### 2️⃣ Refresh (sliding session)

```http
POST /api/auth/refresh
Authorization: Bearer <token-atual-ou-recém-expirado>
```

Aceita JWT **válido ou expirado há até 7 dias** (grace period). Revalida usuário + status do app no DB e emite novo JWT 24h. Mesma estrutura de response do `/login`.

**Erros:**
| Status | Código | Quando |
|---|---|---|
| `401` | `TOKEN_AUSENTE` / `TOKEN_INVALIDO` / `TOKEN_EXPIRADO` | Sem token / assinatura inválida / passou da grace |
| `401` | `USUARIO_INVALIDO` | Usuário foi removido |
| `403` | `APP_BLOQUEADO` | App foi suspenso |

### 3️⃣ Trocar senha definitiva

```http
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{ "novaSenha": "novaSenhaForte123!" }
```

**Resposta 200:**
```json
{ "message": "Senha atualizada com sucesso." }
```

No DB: `senha_padrao = false`. O JWT atual continua válido — não precisa relogar.

---

## 🔌 Integração em um app cliente (ex: MoneyAPP)

### A flag-chave: `requirePasswordChange`

Toda a coreografia gira em torno da coluna `usuarios.senha_padrao`:

| Operação | Flag depois |
|---|---|
| Admin cria usuário (sem senha → gera temp) | `senha_padrao = true` |
| Admin reseta a senha | `senha_padrao = true` |
| Usuário chama `/auth/change-password` | `senha_padrao = false` |

E essa flag é refletida no response do login como `requirePasswordChange`.

### Fluxo completo de primeiro acesso

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Admin cria usuário no LoginHUB → POST /admin/users              │
│     Backend gera senha temp + dispara e-mail com link e credenciais │
│                                                                     │
│  2. Usuário recebe e-mail (login + senha temp + URL do app + bot)   │
│                                                                     │
│  3. Usuário abre o MoneyAPP → digita email + senha temp             │
│                                                                     │
│  4. MoneyAPP → POST /auth/login                                     │
│                                                                     │
│  5. LoginHUB responde { token, requirePasswordChange: TRUE, ... }   │
│                                                                     │
│  6. MoneyAPP detecta a flag → tela "Defina sua nova senha"          │
│                                                                     │
│  7. Usuário define a senha → POST /auth/change-password             │
│                                                                     │
│  8. LoginHUB grava hash, zera senha_padrao                          │
│                                                                     │
│  9. MoneyAPP libera o app — próximos logins entram direto           │
└─────────────────────────────────────────────────────────────────────┘
```

### Implementação no cliente (TypeScript)

```ts
// 1) LOGIN
const { token, requirePasswordChange, usuario } = await loginHub.post('/auth/login', {
  email, password
});
localStorage.setItem('moneyapp_token', token);

if (requirePasswordChange) {
  navigate('/define-nova-senha');   // 🚨 bloqueia acesso ao resto do app
} else {
  navigate('/dashboard');
}

// 2) TROCAR SENHA DEFINITIVA
await loginHub.post('/auth/change-password',
  { novaSenha: 'minhaSenhaForte123!' },
  { headers: { Authorization: `Bearer ${token}` } }
);
// senha_padrao agora é false — próximos logins vêm com requirePasswordChange: false
navigate('/dashboard');
```

### Refresh transparente (recomendado)

Se o app cliente usar `@loginhub/api-client`, o interceptor já cuida do refresh automaticamente em qualquer `401`:

```
chamada → 401 → tenta /auth/refresh com o token atual → recebe novo →
reexecuta a chamada original transparentemente
```

Refresh proativo (opcional):
```ts
import { authApi } from '@loginhub/api-client';

const result = await authApi.refresh();
if (!result) authApi.logout();   // refresh falhou — sessão acabou
```

### Checklist de integração

- [ ] Tela de login chama `POST /auth/login` e persiste `token`, `usuario`, `app`
- [ ] **Verifica `requirePasswordChange`** e redireciona para tela de troca se `true`
- [ ] Bloqueia rotas protegidas enquanto `requirePasswordChange === true`
- [ ] Tela de troca chama `POST /auth/change-password` com `Authorization: Bearer <token>`
- [ ] (Recomendado) Usa `@loginhub/api-client` para ganhar auto-refresh em 401
- [ ] (Opcional) Botão "Sair" chama `POST /auth/logout` e limpa storage

---

## 👥 Modelo de dados

### `aplicativos` (tenants)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `nome` | varchar(255) | obrigatório |
| `documento` | varchar(20) | CPF/CNPJ |
| `email` | varchar(255) | contato corporativo |
| `telefone` | varchar(20) | |
| `logo` | text | base64 dataURL (≤256px após resize) |
| `bot_url` | varchar(500) | link enviado no e-mail de convite |
| `status` | varchar(20) | `'ativo'` \| `'inativo'` |
| `data_cadastro` | timestamp | |

### `usuarios`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | serial PK | |
| `app_id` | FK → aplicativos | cascata no delete |
| `nivel_acesso_id` | FK → niveis_acesso | |
| `nome`, `email`, `senha_hash`, `telefone` | varchar | `email` único |
| `senha_padrao` | boolean | **flag-chave** — controla `requirePasswordChange` |
| `ultimo_acesso` | timestamp | atualizado no login |

### `niveis_acesso` (roles)

| ID | Nome | Uso |
|---|---|---|
| 1 | `master` | nível de sistema (autenticado via MASTER_API_KEY, não atribuído a usuário comum) |
| 2 | `admin` | gerencia outros usuários do mesmo app |
| 3 | `user` | acesso comum ao app |
| 4 | `suporte` | atendimento/diagnóstico |

---

## 📧 E-mail (SMTP + templates)

### Configuração
SMTP configurado via `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`). Hoje aponta para Hostinger. Se as credenciais faltarem, o `EmailService` cai em modo simulado (loga no console em vez de enviar).

### Templates disponíveis (`apps/ui/src/templates/emails/`)
- **`MoneyAppInviteEmail.tsx`** — convite específico do MoneyAPP (tema dark com tons emerald)
- **`InviteEmailTemplate.tsx`** — convite genérico (tema light, qualquer app)
- **`ResetPasswordEmail.tsx`** — usado quando admin reseta senha

### Comportamento
- O frontend renderiza o template para HTML com `ReactDOMServer.renderToStaticMarkup` antes de enviar
- A senha temporária é colocada como placeholder `__TEMP_PASSWORD__` no HTML — o backend substitui pela senha real **na hora do envio** (admin nunca vê a senha em tela)
- Se o e-mail **não** for enviado (SMTP fora do ar, ex.), o backend devolve `{ emailSent: false, tempPassword: "..." }` e a UI cai num fallback mostrando as credenciais para repasse manual
- Se o app tem `bot_url` cadastrado, o template inclui um CTA secundário "Acessar Bot"

> ⚠️ **SPF/DKIM**: para evitar quarentena/spam (especialmente no ProtonMail), configure SPF e DKIM no DNS do `astralwavelabel.com` autorizando o Hostinger a enviar em nome do domínio.

---

## 🧰 Pacote `@loginhub/api-client`

Cliente Axios pronto para uso em qualquer app cliente. Já vem com:

✅ Injeção automática do header `Authorization: Bearer <token>` (lê do localStorage)
✅ Injeção automática do header `x-api-key` para chamadas administrativas
✅ Interceptor de resposta com **auto-refresh em 401** (single-flight, evita loops)
✅ Métodos tipados para todos os endpoints

### Métodos expostos

```ts
import { authApi, userApi, appApi } from '@loginhub/api-client';

// Auth
authApi.login(email, password)              // login + master key fallback
authApi.logout()                            // limpa storage + redireciona
authApi.changePassword(novaSenha)
authApi.refresh()                           // refresh manual proativo
authApi.isAuthenticated()
authApi.getUser()
authApi.getRole()

// Apps
appApi.getAll() / getById(id)
appApi.create(payload)                      // payload inclui logo e bot_url opcionais
appApi.update(id, payload)
appApi.toggleStatus(id, status)
appApi.delete(id)

// Users
userApi.getAllGlobal() / getByAppId(appId)
userApi.create(payload)                     // payload inclui emailHtml para envio automático
userApi.update(id, payload)
userApi.resetPassword(id, emailHtml?)
userApi.delete(id)
```

---

## 🎨 UI (Admin Dashboard)

URL: [`https://loginhub.astralwavelabel.com/login`](https://loginhub.astralwavelabel.com/login)

Acesso restrito ao **master** (autentica via `VITE_MASTER_KEY` digitada no campo senha, qualquer e-mail). Recursos:

- 📋 Listagem de aplicativos com logo, status, total de usuários
- ➕ Criação de novo aplicativo (com upload de logo + URL do bot)
- ✏️ Edição inline de dados do app
- 👥 Gestão de usuários por app
- 📨 **Convite com pré-visualização do e-mail** (iframe com template renderizado antes do envio)
- 🔑 Reset de senha com modal de confirmação bonito (sem `alert()` nativo)
- 🎨 Tailwind + Heroicons em todo lugar

---

## 🔒 Regras de segurança aplicadas

| Regra | Implementação |
|---|---|
| Senhas hashed | `bcryptjs` com salt rounds = 10 |
| JWT expira em 24h | `jsonwebtoken` `expiresIn: '24h'` |
| Refresh tem grace de 7 dias | `ignoreExpiration: true` + diff manual |
| Body limit | `express.json({ limit: '5mb' })` — comporta logos base64 |
| Helmet ativo | `app.use(helmet())` |
| CORS | Permitido em prod (configurável via `corsMiddleware`) |
| Rotas admin protegidas | `adminMiddleware` checa `x-api-key` |
| Rotas autenticadas protegidas | `authMiddleware` valida JWT + status do app |
| App suspenso bloqueia acesso | Verificação em login E refresh |

### ⚠️ Pontos de atenção

- O `corsMiddleware` com whitelist está implementado em `@loginhub/middlewares` mas o `app.ts` ainda usa `cors()` aberto. **Trocar para fechar a brecha.**
- Não há **rate limiting** nas rotas de login — vulnerável a brute force.
- Não há fluxo de **forgot-password** público — só admin reseta hoje.
- Coluna `vencimento` ainda existe no DB (não usada) — pode ser dropada com segurança.

---

## 🐛 Troubleshooting

<details>
<summary><b>Build local quebra com "Cannot find module '@loginhub/schema'"</b></summary>

O `npm run build` na raiz já roda em ordem topológica. Se mesmo assim quebrar, limpe os builds anteriores:
```bash
rm -rf apps/*/dist packages/*/dist
npm run build
```
</details>

<details>
<summary><b>Login com master key não funciona</b></summary>

O login mestre é **client-side**: o `api-client` compara `password === VITE_MASTER_KEY` direto no browser. Se o `VITE_MASTER_KEY` não está embutido no bundle, verifique se o symlink `apps/ui/.env → ../../.env` existe — sem ele o Vite não consegue interpolar a variável no build do Docker.

```bash
ls -la apps/ui/.env   # deve mostrar o link simbólico
```
</details>

<details>
<summary><b>E-mail não chega no destinatário</b></summary>

1. Confirme que `SMTP_HOST` (e não `SMTP_SERVER`) está no `.env`
2. Cheque os logs: `docker logs server_loginhub_backend | grep -i email`
3. Verifique a pasta **Spam** do destinatário (ProtonMail é especialmente filtrador)
4. Configure SPF/DKIM no DNS do `astralwavelabel.com` autorizando o Hostinger
</details>

<details>
<summary><b>Container UI não pega novo bundle após rebuild</b></summary>

Hard-refresh no browser (Ctrl+Shift+R) ou limpe cache do Cloudflare:
```bash
/mnt/docker-services/documentacao/scripts/cleancachecloudflare.sh
```
</details>

---

## 🗺️ Roadmap

- [ ] Fechar CORS com whitelist (`corsMiddleware`)
- [ ] Rate limiting em `/auth/login`
- [ ] `POST /auth/forgot-password` público (usuário esqueceu a senha)
- [ ] `GET /auth/me` — perfil do usuário logado
- [ ] Validação de força de senha no backend
- [ ] Invalidação de tokens antigos ao trocar senha (forçar relogin em todos os devices)
- [ ] Auditoria de eventos (login, mudanças, deletes)
- [ ] Soft-delete de usuário (`status: 'inativo'` em vez de DELETE)

---

<div align="center">

**Construído com excelência pela Astral Wave Label** ⚡

<img src="https://skillicons.dev/icons?i=ts,nodejs,react,postgres,docker" />

</div>
