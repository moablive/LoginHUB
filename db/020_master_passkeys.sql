-- =============================================================================
-- 020_master_passkeys.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/020_master_passkeys.sql
--
-- Pedido de 24/11/2026: o master entra no painel com a digital (Touch ID /
-- Face ID) no lugar de digitar a Master Key. O master não é linha de
-- `usuarios`, então as passkeys dele ganham tabela própria.
--
--   master_passkeys  chave pública de cada aparelho do master. O hub confere a
--                    assinatura e só então emite a mesma sessão master do login
--                    com a chave. Cadastrar exige sessão master.
--
-- A Master Key continua valendo (painel e serviços): a digital é um caminho a
-- mais, não tira o outro. Só acrescenta. Idempotente.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS master_passkeys (
    id             SERIAL PRIMARY KEY,
    credential_id  VARCHAR(1024) NOT NULL UNIQUE,
    public_key     TEXT NOT NULL,
    counter        BIGINT NOT NULL DEFAULT 0,
    transports     VARCHAR(255),
    nome           VARCHAR(120) NOT NULL DEFAULT 'Aparelho',
    criado_em      TIMESTAMP DEFAULT NOW(),
    ultimo_uso     TIMESTAMP,
    revogada_em    TIMESTAMP
);

COMMENT ON TABLE master_passkeys IS
    'Passkeys (WebAuthn) do master do painel: chave publica por aparelho. A assinatura conferida vale a sessao master; revogada_em preenchido = nao entra mais.';

COMMIT;
