-- =============================================================================
-- 011_afiliados_cadastro.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/011_afiliados_cadastro.sql
--
-- Pedido de 10/11/2026: a página de venda do app ganha o botão "link de
-- afiliado" — a pessoa informa nome completo, WhatsApp, CPF e e-mail e já sai
-- com o link dela para vender. Até aqui afiliado só nascia pelo painel.
--
--   afiliados.telefone   WhatsApp de quem se cadastrou.
--   afiliados.documento  CPF (ou CNPJ), só dígitos. É para quem o repasse da
--                        comissão é feito.
--   afiliados.origem     'painel' (criado pelo master) ou 'pagina' (a própria
--                        pessoa se cadastrou). O painel mostra a diferença.
-- =============================================================================
BEGIN;

ALTER TABLE afiliados
    ADD COLUMN IF NOT EXISTS telefone  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS documento VARCHAR(14),
    ADD COLUMN IF NOT EXISTS origem    VARCHAR(10) NOT NULL DEFAULT 'painel';

COMMENT ON COLUMN afiliados.origem IS
    'painel = criado pelo master; pagina = a pessoa se cadastrou pela pagina de venda.';

-- Um cadastro por e-mail em cada app: quem repete o formulário recebe o mesmo link.
CREATE INDEX IF NOT EXISTS afiliados_app_email_idx ON afiliados (app_id, lower(email));

COMMIT;
