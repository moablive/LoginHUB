-- =============================================================================
-- 024_login_codigo_email.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/024_login_codigo_email.sql
--
-- Pedido de 27/11/2026: o login base não pode exigir um app de terceiros (Google
-- Authenticator) do cliente. Entrada "só com o e-mail": a pessoa informa o
-- e-mail, recebe um código de 6 dígitos, digita e entra. O TOTP continua como
-- segundo fator OPCIONAL (e obrigatório onde o convite o exigiu).
--
--   login_codigos_email   um desafio por pedido de código. Guarda só o HMAC do
--       código (nunca o texto), vale 5 min, 5 tentativas, uso único. `email_hash`
--       (HMAC do e-mail) serve ao limite de reenvio sem guardar o e-mail em claro;
--       `usuario_ids` são as contas elegíveis daquele e-mail (mais de uma quando
--       o e-mail está em vários apps e a pessoa escolhe qual na conferência).
--       Desafio sem conta correspondente NÃO é gravado (a resposta da API é
--       igual, para não revelar quem tem conta).
-- Idempotente.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS login_codigos_email (
    id               UUID PRIMARY KEY,
    email_hash       VARCHAR(64) NOT NULL,
    usuario_ids      INTEGER[] NOT NULL,
    codigo_hash      VARCHAR(64) NOT NULL,
    tentativas       SMALLINT NOT NULL DEFAULT 0,
    max_tentativas   SMALLINT NOT NULL DEFAULT 5,
    expira_em        TIMESTAMP NOT NULL,
    consumido_em     TIMESTAMP,
    ip_hash          VARCHAR(64),
    criado_em        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_codigos_email_hash ON login_codigos_email (email_hash, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_login_codigos_expira ON login_codigos_email (expira_em);

COMMENT ON TABLE login_codigos_email IS
    'Desafios de login por código de e-mail (db/024): HMAC do código, 5 min, 5 tentativas, uso único.';

COMMIT;
