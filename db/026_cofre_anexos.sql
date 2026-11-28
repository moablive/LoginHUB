-- 026 — Anexos cifrados do cofre (27/11/2026, pedido do dono: cartões e documentos no cofre). Plano:
--        docs/plano-cartoes-documentos-cofre.md.
--
-- Foto ou PDF de um documento (CNH, RG…) é cifrado NO NAVEGADOR com uma chave só dele (XChaCha20-Poly1305, 256 bits). Essa
-- chave, o nome e o tipo do arquivo moram DENTRO do JSON cifrado do item (cofre_itens.dados), então:
--   - o servidor guarda só bytes cifrados, sem nome nem MIME;
--   - compartilhar o cofre dá acesso aos anexos sem nada extra, e girar a chave do cofre não regrava os blobs.
-- Dado associado da cifra do anexo: "anexo:<item_id>:<anexo_id>" (sem o cofre, para o item poder mudar de cofre).
--
-- `item_id` NÃO tem chave estrangeira: o navegador sobe o blob ANTES de gravar o item (item novo ainda não existe). Blob
-- sem item citado há mais de 24 h é apagado pela própria API a cada upload do cofre. Apagar o item apaga os blobs dele
-- (CofreService.apagarItem); apagar o cofre apaga tudo (ON DELETE CASCADE em cofre_id).
-- Só acrescenta. Idempotente. NÃO mexe em nenhuma tabela existente.

CREATE TABLE IF NOT EXISTS cofre_anexos (
    id        UUID PRIMARY KEY,
    cofre_id  UUID NOT NULL REFERENCES cofre_cofres(id) ON DELETE CASCADE,
    item_id   UUID NOT NULL,
    -- bytes do blob (versão 1 + nonce de 24 + cifra); máx. 10 MiB de arquivo + sobrecarga
    tamanho   INTEGER NOT NULL CHECK (tamanho BETWEEN 41 AND 10485760 + 64),
    -- sha256 (hex) do blob cifrado, conferido na subida e devolvido no download
    sha256    CHAR(64) NOT NULL,
    blob      BYTEA NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    -- marcado quando o item que cita este anexo foi gravado; sem isso, após 24 h é lixo
    ligado_em TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cofre_anexos_item_idx ON cofre_anexos (item_id);
CREATE INDEX IF NOT EXISTS cofre_anexos_cofre_idx ON cofre_anexos (cofre_id);
