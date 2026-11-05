-- =============================================================================
-- 008_aparelho_por_tipo.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/008_aparelho_por_tipo.sql
--
-- Pedido de 05/11/2026 (Sul Alimentos): conta de CPF passa a ter DUAS vagas,
-- um celular e um computador. O computador pode ser compartilhado (vários
-- CPFs revezando o mesmo PC, um de cada vez).
--
--   usuarios_aparelho  chave passa de (usuario_id) para (usuario_id, tipo);
--                      tipo = 'celular' | 'computador' (decidido pelo hub a
--                      partir do navegador, não do nome que o app manda).
--   login_aparelhos    ganha a coluna tipo.
--
-- O vínculo que já existe é classificado pelo nome do aparelho.
-- =============================================================================
BEGIN;

ALTER TABLE usuarios_aparelho ADD COLUMN IF NOT EXISTS tipo VARCHAR(12) NOT NULL DEFAULT 'celular';
UPDATE usuarios_aparelho SET tipo = 'computador'
 WHERE aparelho_nome !~ '(Android|iPhone|iPad|Rastreador)'
   AND aparelho_nome ~ '(Windows|Mac|Linux|Chromebook)';

ALTER TABLE usuarios_aparelho DROP CONSTRAINT IF EXISTS usuarios_aparelho_pkey;
ALTER TABLE usuarios_aparelho ADD CONSTRAINT usuarios_aparelho_pkey PRIMARY KEY (usuario_id, tipo);
ALTER TABLE usuarios_aparelho DROP CONSTRAINT IF EXISTS usuarios_aparelho_tipo_chk;
ALTER TABLE usuarios_aparelho ADD CONSTRAINT usuarios_aparelho_tipo_chk CHECK (tipo IN ('celular', 'computador'));
-- PC compartilhado: achar quem mais está preso ao mesmo computador.
CREATE INDEX IF NOT EXISTS usuarios_aparelho_aparelho_idx ON usuarios_aparelho (aparelho_id);

ALTER TABLE login_aparelhos ADD COLUMN IF NOT EXISTS tipo VARCHAR(12);

COMMENT ON TABLE usuarios_aparelho IS
    'Vagas de aparelho de uma conta de CPF: um celular e um computador (05/11/2026). Sai por logout no aparelho, Liberar do app, outro CPF no mesmo computador ou 12 h sem uso (computador).';

COMMIT;
