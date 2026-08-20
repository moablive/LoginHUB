-- 2FA obrigatório por convite.
--
-- A linha de `usuarios_2fa` passa a poder existir ANTES do enrolamento: o
-- convite já a cria marcando a exigência, e o secret só aparece quando a pessoa
-- escaneia o QR. Por isso `secret_cifrado` deixa de ser NOT NULL.

ALTER TABLE usuarios_2fa ALTER COLUMN secret_cifrado DROP NOT NULL;
ALTER TABLE usuarios_2fa ADD COLUMN IF NOT EXISTS obrigatorio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN usuarios_2fa.obrigatorio IS
  'Convite exigiu 2FA: a conta só abre sessão depois do enrolamento concluído.';
COMMENT ON COLUMN usuarios_2fa.secret_cifrado IS
  'NULL enquanto o enrolamento não começou (linha criada pelo convite obrigatório).';
