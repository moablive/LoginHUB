// Teste de integração do cofre compartilhado (db/022): CofreService contra um Postgres DESCARTÁVEL.
// NUNCA contra o banco de produção: o script recusa rodar sem TESTE_COFRE_BANCO_DESCARTAVEL=1 e cria/apaga dados de teste.
//
//   docker network create lh_teste_net
//   docker run -d --rm --name lh_teste_pg --network lh_teste_net -e POSTGRES_PASSWORD=x -e POSTGRES_DB=login_hub postgres:16-alpine
//   # aplicar db/013, 014, 015, 017 e 022 (e `usuarios`/`aplicativos` mínimas) no lh_teste_pg, depois:
//   TESTE_COFRE_BANCO_DESCARTAVEL=1 DB_HOST=lh_teste_pg DB_USER=postgres DB_PASS=x ts-node --transpile-only scripts/teste-cofre-compartilhado.ts
//
// Cobre a autorização de papel em cada operação, o 404 igual para "não existe"/"sem par", a conferência da chave
// pública atual do convidado, o selo de quem escreve, o giro de chave transacional (itens e membros exatos) e o cascade.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '@loginhub/database';
import { CofreService } from '../packages/services/src/CofreService';

if (process.env.TESTE_COFRE_BANCO_DESCARTAVEL !== '1') {
  console.error('Recusado: este teste só roda em banco descartável (TESTE_COFRE_BANCO_DESCARTAVEL=1).');
  process.exit(2);
}

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
/** Roda `f` e devolve o `code` do erro (ou null se não falhou). */
const codigo = async (f: () => Promise<unknown>): Promise<string | null> => {
  try {
    await f();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'SEM_CODE';
  }
};

const b64 = (n: number) => randomBytes(n).toString('base64');
const envelope = () => `v1.${b64(24)}.${b64(40)}`;
const selo = () => `x1.${b64(32)}.${b64(24)}.${b64(40)}`;
const chavePublica = () => b64(32);
const prova = () => b64(32);
const uuid = () => crypto.randomUUID();
const kdf = () => ({ alg: 'argon2id', t: 3, m: 65536, p: 1, salt: b64(16) });
const donoDe = (email: string) => `p:${createHash('sha256').update(email.trim().toLowerCase()).digest('base64url')}`;

const svc = new CofreService();

(async () => {
  await db.execute(sql`INSERT INTO usuarios (email) VALUES ('ana@exemplo.com')`);
  const A = donoDe('ana@exemplo.com'), B = 'master', C = donoDe('carla@exemplo.com'), D = donoDe('sem-cofre@exemplo.com');
  const pub: Record<string, string> = { [A]: chavePublica(), [B]: chavePublica(), [C]: chavePublica() };
  for (const d of [A, B, C]) {
    await svc.criarConta(d, { kdf: kdf(), chave_por_senha: envelope(), chave_por_kit: envelope() } as never);
    await svc.registrarPessoa(d, { chave_publica: pub[d], chave_privada: envelope() });
  }
  ok('par: segundo registro da mesma conta dá 409', (await codigo(() => svc.registrarPessoa(A, { chave_publica: chavePublica(), chave_privada: envelope() }))) === 'DUPLICATE_ENTRY');
  ok('par: regravar a privada da MESMA pública é aceito (par antigo recifrado)', (await codigo(() => svc.registrarPessoa(A, { chave_publica: pub[A]!, chave_privada: envelope() }))) === null);
  ok('par: chave pública inválida é recusada', (await codigo(() => svc.registrarPessoa(D, { chave_publica: 'x', chave_privada: envelope() }))) === 'VALIDATION');
  ok('par: conta sem cofre não registra par', (await codigo(() => svc.registrarPessoa(D, { chave_publica: chavePublica(), chave_privada: envelope() }))) === 'NOT_FOUND');

  // procurar por e-mail: a mesma resposta para quem não existe e para quem não tem par
  const semPar = await svc.pessoaPublica(D).catch((e: Error) => e);
  const inexistente = await svc.pessoaPublica('p:naoexiste').catch((e: Error) => e);
  ok('pessoaPublica: devolve a chave pública da conta', (await svc.pessoaPublica(B)).chave_publica === pub[B]);
  ok('pessoaPublica: "não existe" e "sem cofre" respondem igual (código e mensagem)', semPar instanceof Error && inexistente instanceof Error && semPar.message === inexistente.message && (semPar as { code?: string }).code === 'NOT_FOUND');

  // A cria um cofre com dois itens
  const cofre = uuid(), i1 = uuid(), i2 = uuid();
  await svc.salvarCofre(A, cofre, envelope());
  await svc.salvarItem(A, i1, cofre, envelope());
  await svc.salvarItem(A, i2, cofre, envelope());

  // convidar
  const novo = (membro: string, papel: string, publica = pub[membro]) => ({ membro, chave_publica: publica, chave_selada: selo(), papel, prova: prova() }) as never;
  ok('convidar: quem não é dono não convida', (await codigo(() => svc.convidar(B, cofre, novo(C, 'leitura')))) === 'NOT_FOUND');
  ok('convidar: chave pública que não é a atual do convidado é recusada (404 genérico)', (await codigo(() => svc.convidar(A, cofre, novo(B, 'leitura', chavePublica())))) === 'NOT_FOUND');
  ok('convidar: conta sem par é recusada com o mesmo 404', (await codigo(() => svc.convidar(A, cofre, novo(D, 'leitura', chavePublica())))) === 'NOT_FOUND');
  ok('convidar: papel inválido', (await codigo(() => svc.convidar(A, cofre, novo(B, 'admin')))) === 'VALIDATION');
  ok('convidar: a si mesmo', (await codigo(() => svc.convidar(A, cofre, novo(A, 'leitura')))) === 'VALIDATION');
  ok('convidar: selo mal formado', (await codigo(() => svc.convidar(A, cofre, { ...(novo(B, 'leitura') as object), chave_selada: 'v1.x.y' } as never))) === 'VALIDATION');
  await svc.convidar(A, cofre, novo(B, 'leitura'));
  ok('convidar: já é membro dá 409', (await codigo(() => svc.convidar(A, cofre, novo(B, 'escrita')))) === 'DUPLICATE_ENTRY');

  // estado
  const eA = await svc.estado(A);
  ok('estado do dono: lista os membros (com e-mail para mostrar) e a chave pública', eA.membros?.length === 1 && eA.membros[0]!.membro === B && eA.membros[0]!.papel === 'leitura' && eA.membros[0]!.chave_publica === pub[B] && eA.pessoa?.chave_publica === pub[A]);
  const eB = await svc.estado(B);
  const comp = eB.compartilhados?.[0];
  ok('estado do membro: cofre compartilhado com selo, papel e itens do cofre', eB.compartilhados?.length === 1 && comp?.id === cofre && comp.papel === 'leitura' && comp.itens.length === 2 && comp.chave_selada.startsWith('x1.'));
  ok('estado do membro: nome do dono resolvido pelo hash do e-mail (SQL sha256)', comp?.dono === A && comp.dono_nome === 'ana@exemplo.com');
  ok('estado do membro: o cofre alheio NÃO entra em cofres/itens próprios', eB.cofres.length === 0 && eB.itens.length === 0);
  ok('estado de quem não participa: nada compartilhado', (await svc.estado(C)).compartilhados?.length === 0);
  ok('estado da máquina do CLI: sem par, membros nem compartilhados', (await svc.estado(A, uuid())).compartilhados === undefined);

  // papel leitura: o servidor recusa a escrita
  ok('leitura: não grava item novo (403)', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope()))) === 'SEM_PERMISSAO');
  ok('leitura: não edita item existente', (await codigo(() => svc.salvarItem(B, i1, cofre, envelope()))) === 'SEM_PERMISSAO');
  ok('leitura: não apaga item', (await codigo(() => svc.apagarItem(B, i1))) === 'SEM_PERMISSAO');
  ok('leitura: não renomeia o cofre', (await codigo(() => svc.salvarCofre(B, cofre, envelope()))) === 'SEM_PERMISSAO');
  ok('leitura: não apaga o cofre', (await codigo(() => svc.apagarCofre(B, cofre))) === 'SEM_PERMISSAO');
  ok('leitura: não gerencia membros', (await codigo(() => svc.ajustarMembro(B, cofre, B, { papel: 'escrita' }))) === 'NOT_FOUND' && (await codigo(() => svc.removerMembro(B, cofre, A))) === 'NOT_FOUND');
  ok('leitura: não gira a chave', (await codigo(() => svc.girarChave(B, cofre, { dados: envelope(), itens: [], membros: [] }))) === 'NOT_FOUND');
  ok('estranho: não vê nem grava no cofre (404)', (await codigo(() => svc.salvarItem(C, uuid(), cofre, envelope()))) === 'NOT_FOUND' && (await codigo(() => svc.apagarItem(C, i1))) === 'NOT_FOUND');
  ok('estranho: renomear cofre alheio é 404 (não revela que existe)', (await codigo(() => svc.salvarCofre(C, cofre, envelope()))) === 'NOT_FOUND');

  // papel escrita (com o selo de hoje)
  await svc.ajustarMembro(A, cofre, B, { papel: 'escrita' });
  const seloDeB = (await svc.estado(B)).compartilhados![0]!.chave_selada;
  const g0 = (await svc.estado(B)).compartilhados![0]!.geracao!;
  ok('estado do membro: traz a geração da chave (db/023) e a pública do dono', typeof g0 === 'number' && (await svc.estado(B)).compartilhados![0]!.dono_chave_publica === pub[A]);
  ok('escrita com selo certo mas SEM geração: 409 (membro sempre prova a geração)', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope(), null, { selo: seloDeB }))) === 'CHAVE_GIRADA');
  ok('escrita com selo certo e geração velha: 409', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope(), null, { selo: seloDeB, geracao: g0 - 1 }))) === 'CHAVE_GIRADA');
  ok('dono sem geração em cofre COM membros: 409 (aba velha)', (await codigo(() => svc.salvarItem(A, uuid(), cofre, envelope()))) === 'CHAVE_GIRADA');
  ok('dono com a geração de hoje grava', (await codigo(() => svc.salvarItem(A, uuid(), cofre, envelope(), null, { geracao: g0 }))) === null);
  ok('dono com geração velha: 409', (await codigo(() => svc.salvarItem(A, uuid(), cofre, envelope(), null, { geracao: g0 + 5 }))) === 'CHAVE_GIRADA');
  ok('escrita sem o selo de hoje: 409 CHAVE_GIRADA', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope()))) === 'CHAVE_GIRADA');
  ok('escrita com selo errado: 409 CHAVE_GIRADA', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope(), null, { selo: selo(), geracao: g0 }))) === 'CHAVE_GIRADA');
  const i3 = uuid();
  ok('escrita com o selo de hoje: grava item novo', (await codigo(() => svc.salvarItem(B, i3, cofre, envelope(), null, { selo: seloDeB, geracao: g0 }))) === null);
  ok('escrita: edita item existente', (await codigo(() => svc.salvarItem(B, i1, cofre, envelope(), null, { selo: seloDeB, geracao: g0 }))) === null);
  ok('escrita: apaga item', (await codigo(() => svc.apagarItem(B, i3))) === null);
  ok('escrita: ainda NÃO renomeia nem apaga o cofre', (await codigo(() => svc.salvarCofre(B, cofre, envelope()))) === 'SEM_PERMISSAO' && (await codigo(() => svc.apagarCofre(B, cofre))) === 'SEM_PERMISSAO');
  ok('máquina do CLI (aparelho) não alcança cofre compartilhado', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope(), null, { aparelho: true, selo: seloDeB }))) === 'NOT_FOUND');
  ok('máquina do CLI do dono continua gravando no cofre do dono', (await codigo(() => svc.salvarItem(A, uuid(), cofre, envelope(), null, { aparelho: true }))) === null);
  ok('mudar o selo exige a chave pública certa', (await codigo(() => svc.ajustarMembro(A, cofre, B, { papel: 'escrita', chave_selada: selo(), chave_publica: chavePublica(), prova: prova() }))) === 'CHAVE_GIRADA');
  await svc.ajustarMembro(A, cofre, B, { papel: 'escrita', chave_selada: selo(), chave_publica: pub[B]!, prova: prova() });
  const seloB2 = (await svc.estado(B)).compartilhados![0]!.chave_selada;
  ok('renomear: selo refeito vale e o selo velho deixa de valer na escrita', seloB2 !== seloDeB && (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope(), null, { selo: seloDeB, geracao: g0 }))) === 'CHAVE_GIRADA');

  // L2: mover item de cofre compartilhado para outro cofre exige selo e geração da ORIGEM
  const cofreB = uuid();
  await svc.salvarCofre(B, cofreB, envelope());
  ok('mover da origem compartilhada sem prova da origem: 409', (await codigo(() => svc.salvarItem(B, i1, cofreB, envelope(), null, { geracao: 0 }))) === 'CHAVE_GIRADA');
  ok('mover da origem compartilhada com prova velha: 409', (await codigo(() => svc.salvarItem(B, i1, cofreB, envelope(), null, { origemSelo: selo(), origemGeracao: g0 }))) === 'CHAVE_GIRADA');
  ok('mover da origem compartilhada com a prova de hoje: ok', (await codigo(() => svc.salvarItem(B, i1, cofreB, envelope(), null, { origemSelo: seloB2, origemGeracao: g0 }))) === null);
  await svc.salvarItem(B, i1, cofre, envelope(), null, { selo: seloB2, geracao: g0 });

  // girar a chave
  await svc.convidar(A, cofre, novo(C, 'leitura'));
  const itensA = (await svc.estado(A)).itens.filter((i) => i.cofre_id === cofre);
  const corpo = (over: Record<string, unknown> = {}) => ({
    dados: envelope(),
    itens: itensA.map((i) => ({ id: i.id, dados: envelope(), atualizado_em: i.atualizado_em })),
    remover: C,
    membros: [{ membro: B, chave_publica: pub[B]!, chave_selada: selo(), prova: prova() }],
    ...over,
  }) as never;
  ok('girar: quem não é dono não gira', (await codigo(() => svc.girarChave(B, cofre, corpo()))) === 'NOT_FOUND');
  ok('girar: falta um item → CONFLITO', (await codigo(() => svc.girarChave(A, cofre, corpo({ itens: itensA.slice(1).map((i) => ({ id: i.id, dados: envelope(), atualizado_em: i.atualizado_em })) })))) === 'CONFLITO');
  ok('girar: item de fora → CONFLITO', (await codigo(() => svc.girarChave(A, cofre, corpo({ itens: [...itensA.map((i) => ({ id: i.id, dados: envelope(), atualizado_em: i.atualizado_em })), { id: uuid(), dados: envelope(), atualizado_em: new Date().toISOString() }] })))) === 'CONFLITO');
  ok('girar: item mudou desde a leitura (base velha) → CONFLITO', (await codigo(() => svc.girarChave(A, cofre, corpo({ itens: itensA.map((i) => ({ id: i.id, dados: envelope(), atualizado_em: '2020-01-01T00:00:00.000Z' })) })))) === 'CONFLITO');
  ok('girar: faltou um membro que fica → CONFLITO', (await codigo(() => svc.girarChave(A, cofre, corpo({ membros: [] })))) === 'CONFLITO');
  ok('girar: membro removido ainda na lista dos que ficam → VALIDATION', (await codigo(() => svc.girarChave(A, cofre, corpo({ membros: [{ membro: B, chave_publica: pub[B]!, chave_selada: selo(), prova: prova() }, { membro: C, chave_publica: pub[C]!, chave_selada: selo(), prova: prova() }] })))) === 'VALIDATION');
  ok('girar: chave pública de quem fica trocada → CONFLITO', (await codigo(() => svc.girarChave(A, cofre, corpo({ membros: [{ membro: B, chave_publica: chavePublica(), chave_selada: selo(), prova: prova() }] })))) === 'CONFLITO');
  ok('girar: remover quem não está → NOT_FOUND', (await codigo(() => svc.girarChave(A, cofre, corpo({ remover: D })))) === 'NOT_FOUND');
  const antes = await svc.estado(A);
  ok('girar: nada foi aplicado pelas tentativas recusadas (transação)', antes.membros!.length === 2 && antes.itens.length === itensA.length);
  const dadosNovos = envelope();
  const seloNovoB = selo();
  const novosItens = itensA.map((i) => ({ id: i.id, dados: envelope(), atualizado_em: i.atualizado_em }));
  ok('girar: correto é aplicado', (await codigo(() => svc.girarChave(A, cofre, corpo({ dados: dadosNovos, itens: novosItens, membros: [{ membro: B, chave_publica: pub[B]!, chave_selada: seloNovoB, prova: prova() }] })))) === null);
  const depois = await svc.estado(A);
  ok('girar: registro do cofre e TODOS os itens trocados', depois.cofres.find((c) => c.id === cofre)?.dados === dadosNovos && novosItens.every((n) => depois.itens.find((i) => i.id === n.id)?.dados === n.dados));
  ok('girar: o removido saiu e o que fica tem o selo novo', depois.membros!.length === 1 && depois.membros![0]!.membro === B && (await svc.estado(B)).compartilhados![0]!.chave_selada === seloNovoB && (await svc.estado(C)).compartilhados!.length === 0);
  ok('girar: o removido não lê nem grava mais', (await codigo(() => svc.salvarItem(C, uuid(), cofre, envelope()))) === 'NOT_FOUND');
  ok('girar: quem ficou com o selo velho recebe 409 ao gravar', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope(), null, { selo: seloB2, geracao: g0 }))) === 'CHAVE_GIRADA');
  ok('girar: com o selo novo grava', (await codigo(() => svc.salvarItem(B, uuid(), cofre, envelope(), null, { selo: seloNovoB, geracao: g0 + 1 }))) === null);

  // sair sozinho e remover sem girar
  await svc.sairDoCofre(B, cofre);
  ok('sair: perde só o próprio acesso (cofre e itens seguem com o dono)', (await svc.estado(B)).compartilhados!.length === 0 && (await svc.estado(A)).itens.length > 0);
  ok('sair: de novo é 404', (await codigo(() => svc.sairDoCofre(B, cofre))) === 'NOT_FOUND');
  await svc.convidar(A, cofre, novo(C, 'leitura'));
  await svc.removerMembro(A, cofre, C);
  ok('remover (sem girar): só o dono, e a pessoa sai', (await svc.estado(C)).compartilhados!.length === 0 && (await codigo(() => svc.removerMembro(A, cofre, C))) === 'NOT_FOUND');

  // M3: a escrita espera o giro (FOR UPDATE) e, ao passar, vê a geração nova
  await svc.convidar(A, cofre, novo(B, 'escrita'));
  const eBm3 = (await svc.estado(B)).compartilhados![0]!;
  const trava = await pool.connect();
  await trava.query('BEGIN');
  await trava.query('SELECT 1 FROM cofre_cofres WHERE id = $1 FOR UPDATE', [cofre]);
  await trava.query('UPDATE cofre_cofres SET geracao = geracao + 1 WHERE id = $1', [cofre]);
  let terminou = false;
  const escrita = svc.salvarItem(B, uuid(), cofre, envelope(), null, { selo: eBm3.chave_selada, geracao: eBm3.geracao! }).then(() => { terminou = true; return null; }, (e: { code?: string }) => { terminou = true; return e.code ?? 'ERRO'; });
  await new Promise((r) => setTimeout(r, 500));
  ok('escrita de membro fica esperando enquanto o giro segura o cofre (FOR SHARE × FOR UPDATE)', terminou === false);
  await trava.query('COMMIT');
  trava.release();
  ok('depois do giro a escrita com a geração velha é recusada (409)', (await escrita) === 'CHAVE_GIRADA');

  // M2: tetos
  const cheio = uuid();
  await svc.salvarCofre(A, cheio, envelope());
  for (let n = 0; n < 1001; n++) await db.execute(sql`INSERT INTO cofre_itens (id, cofre_id, dados) VALUES (${uuid()}, ${cheio}, 'x')`);
  ok('convite recusado: cofre com itens demais para compartilhar', (await codigo(() => svc.convidar(A, cheio, novo(C, 'leitura')))) === 'VALIDATION');
  const muitos = donoDe('muitos@exemplo.com');
  await svc.criarConta(muitos, { kdf: kdf(), chave_por_senha: envelope(), chave_por_kit: envelope() } as never);
  const pubMuitos = chavePublica();
  await svc.registrarPessoa(muitos, { chave_publica: pubMuitos, chave_privada: envelope() });
  for (let n = 0; n < 50; n++) {
    const id = uuid();
    await svc.salvarCofre(A, id, envelope());
    await svc.convidar(A, id, { membro: muitos, chave_publica: pubMuitos, chave_selada: selo(), papel: 'leitura', prova: prova() } as never);
  }
  const mais = uuid();
  await svc.salvarCofre(A, mais, envelope());
  ok('convite recusado: a conta já está em 50 cofres compartilhados', (await codigo(() => svc.convidar(A, mais, { membro: muitos, chave_publica: pubMuitos, chave_selada: selo(), papel: 'leitura', prova: prova() } as never))) === 'VALIDATION');

  // cascade
  await svc.apagarCofre(A, cofre);
  const sobrou = await db.execute(sql`SELECT count(*)::int AS n FROM cofre_membros WHERE cofre_id = ${cofre}`);
  ok('apagar o cofre apaga os membros (cascade)', Number((sobrou.rows[0] as { n: number }).n) === 0 && (await svc.estado(B)).compartilhados!.length === 0);
  await svc.convidar(A, uuid(), novo(B, 'leitura')).catch(() => undefined);

  console.log(`falhas: ${falhas}`);
  await pool.end();
  process.exit(falhas ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
