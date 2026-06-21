# 🛡️ LoginHUB (AWLSRV)

<div align="center">
  <img src="https://skillicons.dev/icons?i=ts,react,vite,tailwind,nodejs,express,postgres,docker&perline=8" />
</div>
<br />

> **O Sistema Definitivo de Autenticação Centralizada de Aplicativos para a infraestrutura Astral Wave Label (AWLSRV).**

O **LoginHUB** é um monorepo Enterprise-grade (gerenciado via NPM Workspaces), criado para centralizar a autenticação e autorização de múltiplos **Aplicativos** (como MoneyAPP, LifeDash, etc). Todo o design da arquitetura segue padrões rigorosos de desacoplamento, garantindo que usuários possam ser alocados a contextos específicos de cada aplicativo.

---

## 🏗️ Arquitetura do Monorepo

Tudo está isolado, performático e tipado. O projeto é dividido entre **Aplicações** (Apps) e **Pacotes Compartilhados** (Packages).

### 🚀 Apps
- **`apps/api` (Backend):** Servidor Express que atende as requisições HTTP, protegido por Middlewares robustos e orquestrando o acesso aos serviços de banco de dados.
- **`apps/web` (Frontend):** Interface de usuário ultrarrápida construída com React e Vite, consumindo as APIs através de um Client isolado.

### 📦 Packages (Fonte Única da Verdade)
- **`@loginhub/schema`:** O coração do projeto. Contém todas as interfaces TypeScript e a definição das tabelas de banco (Drizzle ORM). Usado tanto pelo Front quanto pelo Back.
- **`@loginhub/api-client`:** Uma camada de serviço baseada em Axios. O Frontend só fala com o backend através dela (nada de URLs soltas no React).
- **`@loginhub/services`:** O "cérebro" do backend. Regras de negócio puras (criptografia, tokens, consultas complexas) totalmente desacopladas do Express.
- **`@loginhub/database`:** Configuração do Pool de conexão do PostgreSQL e do Drizzle ORM.
- **`@loginhub/middlewares`:** Proteções e filtros HTTP para as rotas do Express.

---

## 🐳 Infraestrutura & Docker

Para garantir 100% de estabilidade e paridade entre ambientes, o **LoginHUB** é executado de ponta a ponta via **Docker**. As dependências e o build são resolvidos com npm workspaces.

Os containers (`server_loginhub_api` e `server_loginhub_web`) são instanciados e mapeados para a rede interna `awl_network`.

### Como subir a infraestrutura:
```bash
# A partir da raiz do repositório, faça o build de cada serviço passando o .env
cd apps/api
docker compose --env-file ../../.env up -d --build

cd ../web
docker compose --env-file ../../.env up -d --build
```

> ⚠️ **Regra Oficial de Deploy (Moab):**
> Após qualquer deploy que afete o frontend, execute a limpeza obrigatória de cache no servidor raiz:
> `/mnt/docker-services/documentacao/scripts/cleancachecloudflare.sh`

---

## 🔐 Configuração Inicial (.env)

O arquivo `.env` deve ficar na raiz do projeto contendo as seguintes chaves essenciais:

```env
# Conexão DB
DB_PASS=***

# Chaves de Segurança
JWT_SECRET=***
MASTER_KEY=***

# Variáveis do Frontend
VITE_API_URL=https://auth-api.astralwavelabel.com
VITE_MASTER_KEY=***
```

---
<div align="center">
  <i>Construído com excelência pela Astral Wave Label.</i>
</div>
