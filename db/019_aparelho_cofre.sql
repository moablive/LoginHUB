-- =============================================================================
-- 019_aparelho_cofre.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/019_aparelho_cofre.sql
--
-- Pedido de 24/11/2026 (Sul Alimentos): funcionário entra no "Meu cofre" do
-- LoginHUB com CPF + CPF + Google Authenticator. A tela do hub mora noutro
-- endereço que o app da Sul, então guarda outro id de aparelho: sem vaga
-- própria, o hub a via como um segundo celular e recusava (APARELHO_EM_USO).
--
--   usuarios_aparelho  tipo passa a aceitar 'cofre' (quarta vaga).
--
-- Só o login que vem da própria tela do hub (cabeçalho Origin = UI_PUBLIC_URL,
-- que página nenhuma de outro endereço consegue forjar) ganha essa vaga. Ela é
-- de UM aparelho, como a do computador: outro só assume depois de 12 h parada.
-- Idempotente.
-- =============================================================================
BEGIN;

ALTER TABLE usuarios_aparelho DROP CONSTRAINT IF EXISTS usuarios_aparelho_tipo_chk;
ALTER TABLE usuarios_aparelho ADD CONSTRAINT usuarios_aparelho_tipo_chk CHECK (tipo IN ('celular', 'computador', 'telegram', 'cofre'));

COMMENT ON TABLE usuarios_aparelho IS
    'Vagas de aparelho de uma conta de CPF: um celular, um computador (05/11/2026), um Telegram (24/11/2026, só pelo bot com a chave) e o cofre do LoginHUB (24/11/2026, só pela tela do hub). Sai por logout no aparelho, Liberar do app, outro CPF no mesmo computador ou 12 h sem uso (computador e cofre).';

COMMIT;
