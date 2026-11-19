-- 015 — Cofre aberto pela digital (19/11/2026, pedido do dono: "a biometria deve ir para o próprio app cofre").
-- Fase C3/B4 de docs/plano-organizacoes-cofre.md: passkey com a extensão PRF do WebAuthn.
--
-- No aparelho, a passkey do cofre (rpId loginhub.astralwavelabel.com, só para isto: NÃO é login) devolve, depois do
-- Touch ID/Face ID, um segredo fixo de 32 bytes (PRF) para o sal guardado aqui. O navegador passa esse segredo pelo
-- HKDF e embrulha a chave da conta com ele — o quarto embrulho da hierarquia (palavra-passe, kit, máquina do CLI e
-- digital). O servidor guarda só o id da credencial, o sal e o embrulho: o segredo do PRF nunca sai do aparelho,
-- então nada daqui (nem o banco inteiro) abre o cofre. Revogar zera o embrulho. Idempotente.

CREATE TABLE IF NOT EXISTS cofre_digitais (
    id                UUID PRIMARY KEY,
    dono              VARCHAR(64) NOT NULL REFERENCES cofre_contas(dono) ON DELETE CASCADE,
    nome              VARCHAR(120) NOT NULL,
    -- id da credencial (base64url): o navegador pede a passkey certa por ele (allowCredentials).
    credencial_id     VARCHAR(1400) NOT NULL,
    -- sal do PRF (32 bytes em base64). Público: sem a passkey do aparelho não serve.
    prf_sal           VARCHAR(64) NOT NULL,
    -- chave da conta embrulhada pela chave derivada do PRF ("v1.<nonce>.<cifra>"); NULL depois de revogada.
    chave_por_digital TEXT,
    criado_em         TIMESTAMP NOT NULL DEFAULT NOW(),
    ultimo_uso        TIMESTAMP,
    revogado_em       TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cofre_digitais_dono_idx ON cofre_digitais (dono);
CREATE UNIQUE INDEX IF NOT EXISTS cofre_digitais_credencial_idx ON cofre_digitais (dono, credencial_id) WHERE revogado_em IS NULL;
