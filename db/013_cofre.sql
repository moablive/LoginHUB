-- 013 — Cofre de senhas cifrado de ponta a ponta (19/11/2026, pedido do dono: "meu cofre de senhas, estilo o
-- LoginHUB, com as minhas senhas do geral + o 2FA"). Frente C de docs/plano-organizacoes-cofre.md.
--
-- O servidor guarda SÓ dado cifrado. Toda cifra e decifra acontece no navegador:
--   palavra-passe ──Argon2id──► chave mestra ──abre──► chave da conta ──abre──► chave de cada cofre ──► itens
--   kit de recuperação ─────────────────────────abre──► chave da conta
-- Nada daqui (nem a Master Key, nem o JWT_SECRET, nem o banco inteiro) abre um item.
--
-- `dono` = 'master' (a sessão Master Key). Admins de organização ganham cofre próprio numa fase seguinte
-- ('u:<id do usuário>'). Idempotente.

CREATE TABLE IF NOT EXISTS cofre_contas (
    dono            VARCHAR(64) PRIMARY KEY,
    -- Parâmetros do Argon2id (alg, t, m, p, salt em base64). Não são segredo.
    kdf             JSONB NOT NULL,
    -- A chave da conta embrulhada pela chave mestra e pelo kit (XChaCha20-Poly1305, "v1.<nonce>.<cifra>").
    chave_por_senha TEXT NOT NULL,
    chave_por_kit   TEXT NOT NULL,
    criado_em       TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cofre_cofres (
    -- uuid gerado no navegador: entra nos dados associados da cifra, então o servidor não troca um cofre de lugar.
    id            UUID PRIMARY KEY,
    dono          VARCHAR(64) NOT NULL REFERENCES cofre_contas(dono) ON DELETE CASCADE,
    -- nome + chave do cofre, cifrados com a chave da conta.
    dados         TEXT NOT NULL,
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cofre_cofres_dono_idx ON cofre_cofres (dono);

CREATE TABLE IF NOT EXISTS cofre_itens (
    id            UUID PRIMARY KEY,
    cofre_id      UUID NOT NULL REFERENCES cofre_cofres(id) ON DELETE CASCADE,
    -- título, usuário, senha, URL, segredo do 2FA e notas, cifrados com a chave do cofre.
    dados         TEXT NOT NULL,
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cofre_itens_cofre_idx ON cofre_itens (cofre_id);
