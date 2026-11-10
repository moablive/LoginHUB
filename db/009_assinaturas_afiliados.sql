-- =============================================================================
-- 009_assinaturas_afiliados.sql
--
--   docker exec -i server_db_postgres psql -U admin_root -d login_hub < db/009_assinaturas_afiliados.sql
--
-- Pedido de 10/11/2026: o MoneyAPP passa a ser VENDIDO como assinatura mensal
-- (cartão automático no Mercado Pago, conta da Astral Wave). O hub vira o dono
-- da venda: preço configurável no painel, links de afiliado, quem é assinante
-- e quanto se deve a cada afiliado.
--
--   planos_app             uma linha por app à venda: preço da mensalidade e a
--                          comissão padrão dos afiliados. Mudar o preço vale
--                          para assinatura NOVA; quem já assina continua
--                          pagando o valor com que entrou.
--   afiliados              quem divulga. `codigo` é o que vai no link
--                          (`/assine?ref=<codigo>`). `comissao_pct` NULL = usa
--                          a comissão padrão do plano.
--   assinaturas            uma linha por checkout iniciado. `ref` é a
--                          external_reference no Mercado Pago;
--                          `mp_preapproval_id` é a assinatura de lá. O usuário
--                          do app só nasce quando o cartão é autorizado.
--   assinatura_pagamentos  uma linha por mensalidade cobrada. A comissão é
--                          gravada AQUI, com a porcentagem do dia, para mudar
--                          a comissão depois não reescrever o que já se deve.
--                          `comissao_paga_em` NULL = ainda devo ao afiliado.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS planos_app (
    app_id              INTEGER PRIMARY KEY REFERENCES aplicativos(id) ON DELETE CASCADE,
    valor               NUMERIC(10,2) NOT NULL,
    comissao_padrao_pct NUMERIC(5,2) NOT NULL DEFAULT 5,
    descricao           VARCHAR(120) NOT NULL DEFAULT 'Assinatura mensal',
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    atualizado_em       TIMESTAMP DEFAULT NOW(),
    CONSTRAINT planos_app_valor_chk CHECK (valor > 0),
    CONSTRAINT planos_app_comissao_chk CHECK (comissao_padrao_pct >= 0 AND comissao_padrao_pct <= 100)
);

COMMENT ON TABLE planos_app IS
    'Preco da assinatura mensal de um app e a comissao padrao dos afiliados (10/11/2026).';

CREATE TABLE IF NOT EXISTS afiliados (
    id            SERIAL PRIMARY KEY,
    app_id        INTEGER NOT NULL REFERENCES aplicativos(id) ON DELETE CASCADE,
    nome          VARCHAR(255) NOT NULL,
    email         VARCHAR(255),
    chave_pix     VARCHAR(255),
    codigo        VARCHAR(40) NOT NULL,
    comissao_pct  NUMERIC(5,2),
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMP DEFAULT NOW(),
    CONSTRAINT afiliados_comissao_chk CHECK (comissao_pct IS NULL OR (comissao_pct >= 0 AND comissao_pct <= 100))
);

-- O codigo vai no link: "JOAO" e "joao" sao o mesmo afiliado.
CREATE UNIQUE INDEX IF NOT EXISTS afiliados_app_codigo_idx ON afiliados (app_id, lower(codigo));

COMMENT ON TABLE afiliados IS
    'Afiliados de um app a venda. comissao_pct NULL = comissao padrao do plano.';

CREATE TABLE IF NOT EXISTS assinaturas (
    id                  SERIAL PRIMARY KEY,
    app_id              INTEGER NOT NULL REFERENCES aplicativos(id) ON DELETE CASCADE,
    usuario_id          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    afiliado_id         INTEGER REFERENCES afiliados(id) ON DELETE SET NULL,
    nome                VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL,
    telefone            VARCHAR(20),
    valor               NUMERIC(10,2) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'iniciada',
    ref                 VARCHAR(64) NOT NULL UNIQUE,
    mp_preapproval_id   VARCHAR(64) UNIQUE,
    criado_em           TIMESTAMP DEFAULT NOW(),
    ativada_em          TIMESTAMP,
    cancelada_em        TIMESTAMP,
    proxima_cobranca    TIMESTAMP,
    conferida_em        TIMESTAMP,
    CONSTRAINT assinaturas_status_chk CHECK (status IN ('iniciada', 'ativa', 'pausada', 'cancelada'))
);

CREATE INDEX IF NOT EXISTS assinaturas_app_status_idx ON assinaturas (app_id, status);
CREATE INDEX IF NOT EXISTS assinaturas_email_idx ON assinaturas (app_id, lower(email));

COMMENT ON TABLE assinaturas IS
    'Assinatura mensal de um app (Mercado Pago, cartao automatico). iniciada = checkout aberto, sem cartao autorizado ainda.';

CREATE TABLE IF NOT EXISTS assinatura_pagamentos (
    id                SERIAL PRIMARY KEY,
    assinatura_id     INTEGER NOT NULL REFERENCES assinaturas(id) ON DELETE CASCADE,
    mp_payment_id     VARCHAR(64) NOT NULL UNIQUE,
    valor             NUMERIC(10,2) NOT NULL,
    status            VARCHAR(20) NOT NULL,
    pago_em           TIMESTAMP,
    afiliado_id       INTEGER REFERENCES afiliados(id) ON DELETE SET NULL,
    comissao_pct      NUMERIC(5,2),
    comissao_valor    NUMERIC(10,2) NOT NULL DEFAULT 0,
    comissao_paga_em  TIMESTAMP,
    criado_em         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assinatura_pagamentos_assinatura_idx ON assinatura_pagamentos (assinatura_id);
CREATE INDEX IF NOT EXISTS assinatura_pagamentos_afiliado_idx ON assinatura_pagamentos (afiliado_id, comissao_paga_em);

COMMENT ON TABLE assinatura_pagamentos IS
    'Mensalidades cobradas. A comissao fica gravada com a porcentagem do dia; comissao_paga_em NULL = a pagar.';

COMMIT;
