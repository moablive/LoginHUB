-- =============================================================================
-- 021_aparelho_confiavel.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/021_aparelho_confiavel.sql
--
-- Pedido de 24/11/2026 (Sul Alimentos): "o LoginHUB dos membros da Sul deve logar
-- CPF + CPF e já ter o 2FA da conta cadastrado com o ícone da Sul, sem precisar
-- pôr a palavra-passe"; "precisamos registrar todos os dispositivos do usuário";
-- "o admin pode visualizar todos os aparelhos de cada usuário".
--
--   aplicativos.aparelho_confiavel   TRUE = conta de CPF deste app entra só com
--       CPF + CPF a partir de um aparelho JÁ REGISTRADO: o 2FA vale uma vez por
--       aparelho, no primeiro login dele. E o "Meu cofre" mostra a conta do app
--       (logo, CPF, código 2FA ao vivo) sem palavra-passe. Só o app 2 (Sul).
--   usuarios_aparelho.confianca_hash  sha256 (hex) da chave de aparelho
--       confiável que o hub sorteia no login completo e entrega ao navegador.
--       O id do aparelho sozinho não basta (ele viaja em todo login e no
--       registro); a chave só sai uma vez e aqui fica só o hash. Liberar a vaga,
--       ou outro aparelho tomá-la, apaga a confiança junto.
-- Idempotente.
-- =============================================================================
BEGIN;

ALTER TABLE aplicativos ADD COLUMN IF NOT EXISTS aparelho_confiavel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios_aparelho ADD COLUMN IF NOT EXISTS confianca_hash VARCHAR(64);

UPDATE aplicativos SET aparelho_confiavel = TRUE WHERE id = 2 AND nome = 'Sul Alimentos';

COMMENT ON COLUMN aplicativos.aparelho_confiavel IS
    'TRUE: conta de CPF entra só com CPF + CPF a partir de aparelho registrado (2FA uma vez por aparelho) e o Meu cofre mostra a conta do app sem palavra-passe (db/021, Sul Alimentos).';
COMMENT ON COLUMN usuarios_aparelho.confianca_hash IS
    'sha256 hex da chave de aparelho confiável entregue no login completo (db/021). NULL = aparelho ainda não registrado.';

COMMIT;
