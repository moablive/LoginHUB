-- =============================================================================
-- 004_apps_sem_login_hub.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/004_apps_sem_login_hub.sql
--
-- Nem todo app cliente autentica pelo hub. O **Cofre** (senhas.astralwavelabel.com)
-- usa o hub apenas como EMISSOR DE CONVITE: o magic link autoriza a criação do
-- cofre, e a partir dali quem autentica é a senha mestra do próprio cofre — que
-- é a chave de criptografia e, por desenho, o hub nunca vê.
--
-- Consequência que esta coluna conserta: as contas desses apps nasciam com
-- `usuarios_2fa.obrigatorio = true` e nunca enrolavam, porque a pessoa jamais
-- passa pelo login do hub. O painel mostrava "2FA pendente" para sempre —
-- um estado que nunca resolve e que sugere uma proteção que não existe.
--
-- POR QUE NÃO FOI SÓ "DESLIGAR O 2FA DESSE APP"
--
-- `estadoDoLogin` devolve 'sessao' quando `obrigatorio` é falso. Marcar essas
-- contas como não-obrigatórias faria com que, ao ganharem uma senha no hub (um
-- reset administrativo basta), elas entrassem SEM segundo fator. Trocaríamos um
-- rótulo enganoso por um buraco real.
--
-- Então a coluna não diz "não exige 2FA", diz "não faz login aqui" — e o
-- `AuthService.login` recusa essas contas de saída. É mais restritivo que hoje,
-- não menos.
--
-- Para religar (ex.: colocar o hub como portão do Cofre, com 2FA):
--   UPDATE aplicativos SET usa_login_hub = TRUE WHERE id = 14;
-- e enrolar o 2FA das contas existentes com POST /admin/users/:id/reset-2fa.
-- =============================================================================

ALTER TABLE aplicativos
    ADD COLUMN IF NOT EXISTS usa_login_hub BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN aplicativos.usa_login_hub IS
    'FALSE = o hub so emite convite para este app; as contas dele nao autenticam aqui e nao enrolam 2FA.';

-- Cofre: convite sim, login nao.
UPDATE aplicativos SET usa_login_hub = FALSE WHERE id = 14;

-- Limpa o "2FA pendente" que nunca vai resolver das contas ja criadas por
-- convite do Cofre. So remove linhas NAO enroladas: se alguma conta chegou a
-- ativar o segundo fator, ela fica como esta.
DELETE FROM usuarios_2fa
WHERE ativo = FALSE
  AND secret_cifrado IS NULL
  AND usuario_id IN (
      SELECT u.id FROM usuarios u
      JOIN aplicativos a ON a.id = u.app_id
      WHERE a.usa_login_hub = FALSE
  );
