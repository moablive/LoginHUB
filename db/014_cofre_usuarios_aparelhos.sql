-- 014 — Cofre para os usuários dos apps e aparelhos aprovados do CLI hub-pass (19/11/2026, pedido do dono).
--
-- 1. `aplicativos.cofre_liberado`: o master liga por app. Ligado, cada usuário daquele app pode criar o PRÓPRIO
--    cofre (dono 'u:<id do usuário>'), com a própria palavra-passe — ninguém mais lê.
-- 2. `cofre_aparelhos`: máquina aprovada para o CLI (como o pass-cli com a chave em arquivo). Ao aprovar, o CLI
--    sorteia uma chave do aparelho, guarda em ~/.config/hub-pass (600) e manda para cá só a chave da conta
--    embrulhada por ela. O servidor guarda o hash do token de acesso, nunca o token. Revogar apaga o embrulho:
--    a chave que ficou na máquina sozinha não abre nada.
-- Idempotente.

ALTER TABLE aplicativos ADD COLUMN IF NOT EXISTS cofre_liberado BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS cofre_aparelhos (
    id                 UUID PRIMARY KEY,
    dono               VARCHAR(64) NOT NULL REFERENCES cofre_contas(dono) ON DELETE CASCADE,
    nome               VARCHAR(120) NOT NULL,
    -- sha256 (hex) do token de acesso do aparelho.
    token_hash         VARCHAR(64) NOT NULL,
    -- chave da conta embrulhada pela chave do aparelho ("v1.<nonce>.<cifra>"); NULL depois de revogado.
    chave_por_aparelho TEXT,
    ip                 VARCHAR(64),
    criado_em          TIMESTAMP NOT NULL DEFAULT NOW(),
    ultimo_uso         TIMESTAMP,
    revogado_em        TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cofre_aparelhos_dono_idx ON cofre_aparelhos (dono);
