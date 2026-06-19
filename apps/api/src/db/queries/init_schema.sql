-- 1. Tabela de Níveis de Acesso (Roles)
-- O sistema busca pelo nome, então precisamos criar antes.
CREATE TABLE IF NOT EXISTS niveis_acesso (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE
);

-- 2. Tabela de Empresas
CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    documento VARCHAR(20), -- CPF ou CNPJ
    email VARCHAR(255),
    telefone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT NOW(),
    data_atualizacao TIMESTAMP
);

-- 3. Tabela de Usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
    nivel_acesso_id INTEGER REFERENCES niveis_acesso(id),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    ultimo_acesso TIMESTAMP,
    data_cadastro TIMESTAMP DEFAULT NOW(),
    data_atualizacao TIMESTAMP
);

-- SEED OBRIGATÓRIO (Inserir dados iniciais)
-- O seu código tenta buscar o ID pelo nome (ex: 'master', 'admin'),
-- se a tabela estiver vazia, o cadastro de usuário vai falhar.
INSERT INTO niveis_acesso (nome) VALUES 
('master'),
('admin'),
('user'),
('suporte')
ON CONFLICT (nome) DO NOTHING;
