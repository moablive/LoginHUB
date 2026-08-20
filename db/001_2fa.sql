-- 2FA (TOTP) — puramente aditivo: dois CREATE TABLE, nenhum ALTER em `usuarios`.
-- Rollback é DROP das duas tabelas; nada da base existente é tocado.

CREATE TABLE IF NOT EXISTS usuarios_2fa (
    usuario_id            integer PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    -- AES-256-GCM: "v1:<iv>:<tag>:<ciphertext>" em base64. Nunca em claro.
    secret_cifrado        text        NOT NULL,
    ativo                 boolean     NOT NULL DEFAULT false,
    -- Maior step TOTP já aceito — bloqueia replay dentro da janela de 30s.
    ultimo_step           integer,
    -- Piso de validade das sessões: JWT com iat anterior a isto é recusado.
    sessoes_validas_desde timestamp,
    confirmado_em         timestamp,
    criado_em             timestamp   DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios_2fa_backup_codes (
    id           serial PRIMARY KEY,
    usuario_id   integer     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    -- HMAC-SHA256 com TWOFA_ENC_KEY como pepper. Nunca o código em claro.
    codigo_hmac  varchar(64) NOT NULL,
    usado_em     timestamp,
    criado_em    timestamp   DEFAULT now(),
    CONSTRAINT usuarios_2fa_backup_codes_unique UNIQUE (usuario_id, codigo_hmac)
);

CREATE INDEX IF NOT EXISTS idx_2fa_backup_codes_usuario
    ON usuarios_2fa_backup_codes (usuario_id) WHERE usado_em IS NULL;
