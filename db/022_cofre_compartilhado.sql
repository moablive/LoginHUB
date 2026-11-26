-- 022 — Cofre compartilhado entre contas do LoginHUB (26/11/2026, pedido do dono). Frente C5 de
--        docs/plano-organizacoes-cofre.md. Continua de ponta a ponta: o servidor guarda só texto cifrado.
--
--   par X25519 por conta ──► `cofre_chaves_pessoa`: chave pública em claro; privada cifrada com a CHAVE DA CONTA
--                            (envelope "v1.", dado associado "pessoa:<dono>"). Nasce no navegador na 1ª vez que a conta
--                            abre o cofre depois desta versão; o servidor nunca vê a privada.
--   compartilhar um cofre ─► `cofre_membros`: o dono decifra a chave do cofre no navegador e a SELA para a chave
--                            pública do convidado (X25519 efêmero + HKDF + XChaCha20-Poly1305, "x1.…"). Os itens
--                            continuam cifrados com a MESMA chave do cofre; ninguém além dos membros a abre.
--   papéis ─────────────────► 'leitura' ou 'escrita'. Dono do cofre = `cofre_cofres.dono`: só ele gerencia membros,
--                            renomeia e apaga. O servidor recusa a escrita de quem é só leitura.
--   remover um membro ──────► o navegador do dono GIRA a chave do cofre (POST /cofre/cofres/:id/girar-chave): chave
--                            nova, itens e nome recifrados, selo novo para cada membro que fica — tudo numa transação.
--
-- Colunas além do pedido original, em `cofre_membros`:
--   `chave_publica` = a chave pública do convidado PARA A QUAL o selo foi feito (o servidor só aceita selar para a chave
--   atual dele; se a conta dele for refeita, o selo antigo não vale);
--   `prova` = HMAC (chave da conta do dono) de cofre + membro + chave pública: o navegador do dono confere antes de
--   selar de novo, então o servidor não consegue trocar a chave do convidado no caminho.
-- Só acrescenta. Idempotente. NÃO mexe em nenhuma tabela existente.

CREATE TABLE IF NOT EXISTS cofre_chaves_pessoa (
    dono          VARCHAR(64) PRIMARY KEY REFERENCES cofre_contas(dono) ON DELETE CASCADE,
    -- X25519, 32 bytes crus em base64
    chave_publica VARCHAR(64) NOT NULL,
    -- PKCS#8 cifrado com a chave da conta: "v1.<nonce>.<cifra>"
    chave_privada TEXT NOT NULL,
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cofre_membros (
    cofre_id      UUID NOT NULL REFERENCES cofre_cofres(id) ON DELETE CASCADE,
    membro        VARCHAR(64) NOT NULL REFERENCES cofre_contas(dono) ON DELETE CASCADE,
    -- a chave do cofre (e o nome) cifradas para a chave pública do membro: "x1.<efêmera>.<nonce>.<cifra>"
    chave_selada  TEXT NOT NULL,
    papel         VARCHAR(10) NOT NULL CHECK (papel IN ('leitura', 'escrita')),
    chave_publica VARCHAR(64) NOT NULL,
    prova         VARCHAR(64),
    convidado_por VARCHAR(64) NOT NULL,
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (cofre_id, membro)
);
CREATE INDEX IF NOT EXISTS cofre_membros_membro_idx ON cofre_membros (membro);
