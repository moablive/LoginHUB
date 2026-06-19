# 🗄️ AWLSRV Login Hub - API

Backend centralizado para autenticação multi-tenant, gestão de permissões e gateway de identidade (IdP).

Esta API fornece os endpoints seguros consumidos pelo painel administrativo e por aplicações clientes.

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=ts,nodejs,express,postgres,docker,nginx" />
  </a>
</p>

---

## 🏗️ Arquitetura e Estrutura

O sistema segue uma arquitetura robusta baseada em **Camadas (Layered Architecture)**, priorizando a integridade dos dados via transações SQL manuais.

- **`src/controllers`**: Gerencia requisições HTTP, validação de entrada e respostas padronizadas.
- **`src/services`**: Contém a regra de negócio.
  - **Destaque**: Implementação de Transações ACID (BEGIN, COMMIT, ROLLBACK) para operações críticas (ex: remover usuário e seus vínculos).
- **`src/db`**: Configuração do Pool de conexões PostgreSQL e queries SQL puras para máxima performance.
- **`src/routes`**: Definição de endpoints da API (separados por domínios: Auth, Companies, Users).
- **`src/middlewares`**: Interceptadores para validação de JWT e Chave Mestra (Master Key).

---

## 🗄️ Banco de Dados (Schema)

O sistema utiliza **PostgreSQL** com relacionamentos fortes e chaves estrangeiras (Foreign Keys) com cascata configurada.

### 📊 Diagrama Relacional

```mermaid
erDiagram
    EMPRESAS ||--|{ USUARIOS : "possui"
    NIVEIS_ACESSO ||--|{ USUARIOS : "define permissão"

    EMPRESAS {
        uuid id PK
        string documento "CNPJ/CPF"
        string nome
        string status "ativo/inativo"
    }
    USUARIOS {
        uuid id PK
        uuid empresa_id FK
        uuid nivel_acesso_id FK
        string email
        string senha_hash
    }
    NIVEIS_ACESSO {
        uuid id PK
        string nome "admin/usuario"
    }
```

---

### 📋 Detalhamento das Tabelas

#### 1. `empresas` (Tenants)
Representa os clientes finais (donos dos projetos/infraestrutura).

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único (PK) |
| `nome` | VARCHAR | Razão Social ou Nome Fantasia |
| `documento` | VARCHAR | CPF ou CNPJ (Unique Index) |
| `status` | VARCHAR | Controle de acesso (ativo, inativo) |

#### 2. `usuarios` (Identity)
Usuários vinculados a uma empresa específica. A unicidade do e-mail é composta (`empresa_id` + `email`), permitindo que o mesmo e-mail exista em empresas diferentes.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único (PK) |
| `empresa_id` | UUID | Vínculo com Tenant (FK) |
| `nivel_acesso_id` | UUID | Define se é Admin ou User (FK) |
| `senha_hash` | VARCHAR | Hash Bcrypt (Nunca salvo em texto plano) |

---

## 🔌 API Endpoints

Todas as rotas são prefixadas com `/api`.

### Autenticação

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| POST | `/auth/login` | Gera Token JWT para acesso | 🔓 Pública |

### Empresas (Requer Master Key)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/companies` | Lista todas as empresas |
| POST | `/companies` | Cria nova empresa + Admin inicial (Transação) |
| PATCH | `/companies/:id/status` | Alterna entre Ativo/Inativo |

### Usuários (Requer JWT ou Master Key)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/users` | Lista usuários (Filtra por empresa se não for Super Admin) |
| POST | `/users` | Cria novo usuário na empresa logada |
| DELETE | `/users/:id` | Remove usuário (Soft ou Hard delete conforme config) |

---

## 🚀 Instalação e Setup

### 1. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz:

```properties
PORT=3000

# Conexão com Postgres (Docker Container)
DATABASE_URL=postgres://admin_root:admin_password@localhost:5432/login_hub

# Segredos
JWT_SECRET=seu_segredo_jwt_super_seguro

# Chave usada pelo Front-end (Super Admin) para gerenciar empresas
MASTER_KEY='M?u@+Ok3@5ze6j1m:(w*Ras&b}{}s6()'
```

### 2. Inicializar Banco de Dados

Execute o script SQL abaixo no seu cliente Postgres ou via Docker:

<details>
<summary><strong>📄 Clique para ver o Script SQL Completo (Init.sql)</strong></summary>

```sql
-- Criar database
CREATE DATABASE login_hub;
\c login_hub

-- TABELA 1: EMPRESAS
CREATE TABLE empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    documento VARCHAR(18) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABELA 2: NÍVEIS DE ACESSO
CREATE TABLE niveis_acesso (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(50) NOT NULL UNIQUE,
    descricao TEXT,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABELA 3: USUÁRIOS
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nivel_acesso_id UUID NOT NULL REFERENCES niveis_acesso(id),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
    ultimo_acesso TIMESTAMP,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(empresa_id, email)
);

-- FUNÇÃO E TRIGGERS (Auto Update Data)
CREATE OR REPLACE FUNCTION atualizar_data_atualizacao()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_atualizacao = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_empresas 
BEFORE UPDATE ON empresas 
FOR EACH ROW EXECUTE FUNCTION atualizar_data_atualizacao();

CREATE TRIGGER trigger_atualizar_usuarios 
BEFORE UPDATE ON usuarios 
FOR EACH ROW EXECUTE FUNCTION atualizar_data_atualizacao();

-- SEED INICIAL
INSERT INTO niveis_acesso (nome, descricao) 
VALUES 
    ('admin', 'Administrador'), 
    ('usuario', 'Padrão');
```

</details>

### 3. Rodar o Projeto

```bash
# Instalar dependências
npm install

# Modo Desenvolvimento (Watch Mode)
npm run dev

# Build e Produção
npm run build
npm start
```

---

**AWLSRV - Astral Wave Label 🤵🏻**