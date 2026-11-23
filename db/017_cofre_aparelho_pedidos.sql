-- 017 — Máquina do CLI aprovada pelo navegador, com alcance por cofre (23/11/2026, pedido do dono: os outros
--        servidores usam o cofre sem digitar Master Key nem palavra-passe; a aprovação é com a digital).
--
-- 1. `cofre_aparelho_pedidos`: o `hub-pass login` sorteia o par X25519 e o token da máquina e deixa aqui um PEDIDO
--    (chave pública, hash do token, código de 12 letras = sha256 do id + chave pública). Vale 10 minutos. Não tem
--    dono: quem aprova é quem digita o código com o cofre aberto.
-- 2. `cofre_aparelhos` ganha a chave pública da máquina, o `selo` (o que ela pode abrir, cifrado para a chave
--    pública dela: a chave da conta OU só as chaves dos cofres escolhidos) e `cofres` (ids dos cofres liberados;
--    NULL = a conta inteira). O servidor usa `cofres` para só entregar e aceitar o que é desses cofres.
--    Aprovação antiga (palavra-passe digitada na máquina) continua em `chave_por_aparelho`, com `cofres` NULL.
--    `prova` = HMAC da chave pública feito pelo navegador com a chave da conta: ao mudar o alcance, a tela só
--    cifra de novo para uma chave pública cuja prova confere (o servidor não consegue trocar a chave no caminho).
-- Só acrescenta. Idempotente.

ALTER TABLE cofre_aparelhos ADD COLUMN IF NOT EXISTS chave_publica VARCHAR(64);
ALTER TABLE cofre_aparelhos ADD COLUMN IF NOT EXISTS selo TEXT;
ALTER TABLE cofre_aparelhos ADD COLUMN IF NOT EXISTS cofres JSONB;
ALTER TABLE cofre_aparelhos ADD COLUMN IF NOT EXISTS prova VARCHAR(64);

CREATE TABLE IF NOT EXISTS cofre_aparelho_pedidos (
    id            UUID PRIMARY KEY,
    nome          VARCHAR(120) NOT NULL,
    -- chave pública X25519 da máquina (32 bytes em base64).
    chave_publica VARCHAR(64) NOT NULL,
    -- sha256 (hex) do token de acesso que a máquina sorteou.
    token_hash    VARCHAR(64) NOT NULL,
    -- 12 letras base32 do sha256("loginhub-cofre-pedido-v1|id|chave pública"): o navegador confere de novo.
    codigo        VARCHAR(12) NOT NULL UNIQUE,
    ip            VARCHAR(64),
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    expira_em     TIMESTAMP NOT NULL
);
