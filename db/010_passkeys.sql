-- =============================================================================
-- 010_passkeys.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/010_passkeys.sql
--
-- Pedido de 10/11/2026: login por biometria no PWA do MoneyAPP (fases F1, F2 e
-- F6 do "Plano Biometria (passkeys)" de 06/11). A biometria da web é a passkey
-- (WebAuthn): a digital ou o rosto libera uma chave guardada no aparelho, e o
-- hub guarda só a chave PÚBLICA. Decisão do dono: a passkey substitui a senha
-- e o código do autenticador de uma vez (aparelho + dedo já são dois fatores).
--
--   aplicativos.webauthn_rp_id   domínio a que as passkeys do app ficam presas
--                                (ex.: money.astralwavelabel.com). NULL = o app
--                                não tem login por biometria. A origem aceita é
--                                a da `platform_url`, que tem de estar dentro
--                                desse domínio.
--   usuarios_passkeys            uma linha por aparelho cadastrado. Só nasce
--                                com sessão completa (senha + 2FA): ninguém
--                                cadastra biometria só sabendo o e-mail.
--                                `revogada_em` preenchido = não entra mais.
-- =============================================================================
BEGIN;

ALTER TABLE aplicativos ADD COLUMN IF NOT EXISTS webauthn_rp_id VARCHAR(255);

COMMENT ON COLUMN aplicativos.webauthn_rp_id IS
    'Dominio (rpId) das passkeys do app. NULL = sem login por biometria.';

CREATE TABLE IF NOT EXISTS usuarios_passkeys (
    id             SERIAL PRIMARY KEY,
    usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    rp_id          VARCHAR(255) NOT NULL,
    credential_id  VARCHAR(1024) NOT NULL UNIQUE,
    public_key     TEXT NOT NULL,
    counter        BIGINT NOT NULL DEFAULT 0,
    transports     VARCHAR(255),
    nome           VARCHAR(120) NOT NULL DEFAULT 'Aparelho',
    criado_em      TIMESTAMP DEFAULT NOW(),
    ultimo_uso     TIMESTAMP,
    revogada_em    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS usuarios_passkeys_usuario_idx ON usuarios_passkeys (usuario_id);

COMMENT ON TABLE usuarios_passkeys IS
    'Passkeys (WebAuthn) das contas: chave publica por aparelho. Entra no lugar de senha + 2FA; revogada_em preenchido = nao vale mais.';

COMMIT;
