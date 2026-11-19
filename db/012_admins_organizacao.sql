-- 012 — Admins de organização (19/11/2026, pedido do dono: "convidar admin de
-- uma organização pelo próprio hub; o novo admin, ao logar no LoginHUB dele,
-- pode convidar outras pessoas").
--
-- Organização = categoria do painel (LBS, SUL ALIMENTOS, ASTRAL WAVE, SRV…).
-- O admin de organização é uma conta comum do hub, dentro de um app especial,
-- o "LoginHUB · Painel" (`painel_do_hub = TRUE`). Ser conta comum é o que dá a
-- ele, de graça, tudo o que o hub já protege: convite por magic link, 2FA
-- obrigatório, piso de sessão, lista negra do login e reset pelo master.
--
-- O que ele pode fazer mora em `admins_organizacao`: uma linha por
-- organização. Sem linha, a sessão dele não abre nada em /admin.
--
-- Idempotente: pode rodar de novo.

ALTER TABLE aplicativos
    ADD COLUMN IF NOT EXISTS painel_do_hub BOOLEAN NOT NULL DEFAULT FALSE;

-- Um painel só.
CREATE UNIQUE INDEX IF NOT EXISTS aplicativos_painel_do_hub_unico
    ON aplicativos (painel_do_hub) WHERE painel_do_hub;

CREATE TABLE IF NOT EXISTS admins_organizacao (
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    categoria_id  INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    convidado_por VARCHAR(255) NOT NULL DEFAULT 'master',
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS admins_organizacao_categoria_idx ON admins_organizacao (categoria_id);

-- O app do painel. Sem categoria de propósito: assim ele nunca entra no
-- escopo de um admin de organização (só o master gerencia quem é admin do hub
-- pela tabela de usuários; o admin de organização gerencia pela tela própria).
-- `platform_url` = a própria UI do hub, que tem a tela /setup-password.
INSERT INTO aplicativos (nome, email, documento, platform_url, usa_login_hub, painel_do_hub, status)
SELECT 'LoginHUB · Painel', 'guilhermebonato@pm.me', '60522261000101',
       'https://loginhub.astralwavelabel.com', TRUE, TRUE, 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM aplicativos WHERE painel_do_hub);
