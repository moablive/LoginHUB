-- =============================================================================
-- 018_aparelho_telegram.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/018_aparelho_telegram.sql
--
-- Pedido de 24/11/2026 (Sul Alimentos): o bot do Telegram passa a aceitar o
-- login de CPF (CPF + senha + 2FA do Cofre). O bot fala do servidor, sem
-- navegador: sem uma vaga própria ele seria classificado como "celular" e
-- tomaria (ou seria recusado por) a vaga do celular de verdade da pessoa.
--
--   usuarios_aparelho  tipo passa a aceitar 'telegram' (terceira vaga).
--
-- Só o bot com a chave HUB_TELEGRAM_KEY (cabeçalho x-telegram-key) ganha essa
-- vaga; um navegador não consegue pedir por ela. Idempotente.
-- =============================================================================
BEGIN;

ALTER TABLE usuarios_aparelho DROP CONSTRAINT IF EXISTS usuarios_aparelho_tipo_chk;
ALTER TABLE usuarios_aparelho ADD CONSTRAINT usuarios_aparelho_tipo_chk CHECK (tipo IN ('celular', 'computador', 'telegram'));

COMMENT ON TABLE usuarios_aparelho IS
    'Vagas de aparelho de uma conta de CPF: um celular, um computador (05/11/2026) e um Telegram (24/11/2026, só pelo bot com a chave). Sai por logout no aparelho, Liberar do app, outro CPF no mesmo computador ou 12 h sem uso (computador).';

COMMIT;
