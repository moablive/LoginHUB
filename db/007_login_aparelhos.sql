-- =============================================================================
-- 007_login_aparelhos.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/007_login_aparelhos.sql
--
-- Pedido de 04/11/2026 (Sul Alimentos): conta de CPF só fica logada em UM
-- aparelho. O hub registra o aparelho (nome + IP) de cada login e recusa o CPF
-- que já está conectado em outro.
--
--   usuarios_aparelho  o aparelho preso à conta (uma linha por usuário). Nasce
--                      no login COMPLETO (depois do 2FA) e sai quando a pessoa
--                      faz logout nele ou o app libera (botão "Liberar").
--   login_aparelhos    o registro de tudo: entrou, recusado, saiu, liberado —
--                      com o nome do aparelho e o IP.
-- =============================================================================

CREATE TABLE IF NOT EXISTS usuarios_aparelho (
    usuario_id     INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    app_id         INTEGER NOT NULL DEFAULT 0,
    aparelho_id    VARCHAR(64)  NOT NULL,          -- gerado pelo app e guardado no navegador
    aparelho_nome  VARCHAR(255),                   -- ex.: "Android · SM-A146M · Chrome"
    ip             VARCHAR(64),
    desde          TIMESTAMP NOT NULL DEFAULT now(),
    ultimo_acesso  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_aparelhos (
    id             SERIAL PRIMARY KEY,
    app_id         INTEGER NOT NULL DEFAULT 0,
    usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    conta          VARCHAR(255),                   -- o e-mail/CPF da conta
    evento         VARCHAR(20) NOT NULL,           -- 'entrou' | 'recusado' | 'saiu' | 'liberado'
    aparelho_id    VARCHAR(64),
    aparelho_nome  VARCHAR(255),
    ip             VARCHAR(64),
    detalhe        VARCHAR(255),                   -- recusado: o aparelho que já estava; liberado: quem liberou
    criado_em      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_aparelhos_app_idx ON login_aparelhos (app_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS login_aparelhos_usuario_idx ON login_aparelhos (usuario_id, criado_em DESC);

COMMENT ON TABLE usuarios_aparelho IS
    'Aparelho preso a uma conta de CPF: só ele entra até logout nele ou "Liberar" do app.';
COMMENT ON TABLE login_aparelhos IS
    'Registro dos logins por aparelho (nome + IP): entrou, recusado, saiu, liberado.';
