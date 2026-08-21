-- 2FA obrigatório para o acervo existente.
--
-- A 002 adicionou `obrigatorio` com DEFAULT false e não tocou em quem já
-- estava no banco. Resultado: `estadoDoLogin` devolvia 'sessao' para toda
-- conta sem linha em `usuarios_2fa` — as contas anteriores ao 2FA entravam
-- só com a senha, inclusive as de nível admin. "Obrigatório" valia apenas
-- para quem fosse convidado depois.
--
-- Esta migração fecha isso: toda conta passa a exigir segundo fator. Quem
-- ainda não enrolou cai no fluxo de enrolamento no próximo login (passe de
-- 10 min, não sessão), e o reconvite geral cobre o resto.
--
-- Idempotente: rodar de novo não muda nada e não descarta secret de ninguém.

INSERT INTO usuarios_2fa (usuario_id, secret_cifrado, ativo, obrigatorio)
SELECT u.id, NULL, false, true
  FROM usuarios u
ON CONFLICT (usuario_id) DO UPDATE
   SET obrigatorio = true;
