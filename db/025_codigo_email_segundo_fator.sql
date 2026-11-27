-- =============================================================================
-- 025_codigo_email_segundo_fator.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/025_codigo_email_segundo_fator.sql
--
-- 27/11/2026: o segundo fator da conta de e-mail passa a ser o código enviado ao
-- e-mail (db/024), sem Google Authenticator. O TOTP vira opcional: quem já o
-- ativou continua com ele; quem só tinha a EXIGÊNCIA pendente (nunca escaneou o
-- QR) deixa de ficar preso no enrolamento. Conta de CPF (sem e-mail) mantém a
-- exigência. Idempotente.
-- =============================================================================
BEGIN;
UPDATE usuarios_2fa f
   SET obrigatorio = FALSE
  FROM usuarios u
 WHERE u.id = f.usuario_id
   AND f.ativo = FALSE
   AND f.obrigatorio = TRUE
   AND u.email !~ '^[0-9]{11}$';
COMMIT;
