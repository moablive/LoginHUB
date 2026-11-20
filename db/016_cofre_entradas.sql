-- 016 — Entrada pelo cofre (19/11/2026, pedido do dono: "a biometria do Escritórios deve ficar no próprio cofre do
-- LoginHUB", não numa passkey do Proton Pass ou da Apple).
--
-- A chave de entrada de uma conta de app (hoje o Escritórios 3D, app 18) é um par Ed25519 gerado no navegador DENTRO
-- do cofre: a privada vai cifrada como item do cofre (só abre com a palavra-passe, o kit ou a digital do cofre) e a
-- pública fica aqui. Para entrar, o app manda a pessoa ao cofre com um desafio de 5 minutos; o cofre aberto assina o
-- desafio e o hub confere a assinatura com esta chave pública e emite a mesma sessão do login com senha + 2FA.
-- Cadastrar exige a sessão completa do app (senha + 2FA) E o cofre aberto. Revogar marca `revogada_em`. Idempotente.

CREATE TABLE IF NOT EXISTS cofre_entradas (
    id            UUID PRIMARY KEY,
    -- dono do cofre que guarda a chave privada ('master' ou 'u:<id>')
    dono          VARCHAR(64) NOT NULL REFERENCES cofre_contas(dono) ON DELETE CASCADE,
    -- conta de app que esta chave abre
    usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    -- chave pública Ed25519 crua (32 bytes) em base64url
    chave_publica VARCHAR(64) NOT NULL,
    nome          VARCHAR(120) NOT NULL,
    criado_em     TIMESTAMP NOT NULL DEFAULT NOW(),
    ultimo_uso    TIMESTAMP,
    revogada_em   TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cofre_entradas_usuario_idx ON cofre_entradas (usuario_id) WHERE revogada_em IS NULL;
CREATE INDEX IF NOT EXISTS cofre_entradas_dono_idx ON cofre_entradas (dono);
