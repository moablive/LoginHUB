-- =============================================================================
-- 006_login_bloqueios.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/006_login_bloqueios.sql
--
-- Pedido de 28/10/2026 (Sul Alimentos): com o motorista entrando por CPF +
-- senha + 2FA, o login passou a ser alvo fácil de força bruta. O hub ganha
-- uma LISTA NEGRA por aplicativo:
--
--   5 senhas (ou códigos 2FA) errados do mesmo IP   → o IP fica bloqueado
--   10 erros na mesma conta em 1 h, de qualquer IP  → a conta fica bloqueada
--
-- Bloqueio não expira: só sai pelo botão "Liberar" do app (rota
-- POST /admin/bloqueios/:id/liberar, com a chave mestra). Uma linha por
-- (app, tipo, alvo) ABERTA (liberado_em IS NULL); liberar fecha a linha e a
-- próxima falha abre outra — o histórico fica.
-- =============================================================================

CREATE TABLE IF NOT EXISTS login_bloqueios (
    id               SERIAL PRIMARY KEY,
    app_id           INTEGER NOT NULL DEFAULT 0,
    tipo             VARCHAR(10)  NOT NULL,            -- 'ip' | 'conta'
    alvo             VARCHAR(255) NOT NULL,            -- o IP, ou o e-mail/CPF da conta
    detalhe          VARCHAR(255),                     -- ip: última conta tentada; conta: último IP
    origem           VARCHAR(10)  NOT NULL DEFAULT 'senha', -- 'senha' | '2fa' (a última falha)
    tentativas       INTEGER NOT NULL DEFAULT 0,
    janela_inicio    TIMESTAMP NOT NULL DEFAULT now(),
    ultima_tentativa TIMESTAMP NOT NULL DEFAULT now(),
    bloqueado_em     TIMESTAMP,
    liberado_em      TIMESTAMP,
    liberado_por     VARCHAR(255),
    criado_em        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_bloqueios_abertos_idx
    ON login_bloqueios (app_id, tipo, alvo) WHERE liberado_em IS NULL;

COMMENT ON TABLE login_bloqueios IS
    'Lista negra do login por app: contagem de falhas por IP e por conta; bloqueado_em preenchido = barrado até liberado_em.';
