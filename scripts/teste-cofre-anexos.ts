// Teste de integração dos anexos cifrados do cofre (db/026): CofreAnexoService e a lista `anexos` do salvarItem, contra um
// Postgres DESCARTÁVEL. NUNCA contra o banco de produção: recusa rodar sem TESTE_COFRE_BANCO_DESCARTAVEL=1.
// Quem roda é o ~/sh/loginhub-teste-cofre-anexos.sh (sobe o banco, aplica db/013, 022, 023 e 026, roda e derruba).
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '@loginhub/database';
import { CofreService } from '../packages/services/src/CofreService';
import { CofreAnexoService, MAX_ANEXO_BYTES } from '../packages/services/src/CofreAnexoService';

if (process.env.TESTE_COFRE_BANCO_DESCARTAVEL !== '1') {
  console.error('Recusado: este teste só roda em banco descartável (TESTE_COFRE_BANCO_DESCARTAVEL=1).');
  process.exit(2);
}

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
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
const uuid = () => crypto.randomUUID();
const kdf = () => ({ alg: 'argon2id', t: 3, m: 65536, p: 1, salt: b64(16) });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** Blob válido: versão 1 + nonce + cifra (conteúdo qualquer: o servidor não abre). */
const blob = (tam = 100): Buffer => Buffer.concat([Buffer.from([1]), randomBytes(tam - 1)]);

const cofreSvc = new CofreService();
const anexoSvc = new CofreAnexoService();
const contagem = async (where: string): Promise<number> => Number(((await db.execute(sql.raw(`SELECT count(*)::int AS n FROM cofre_anexos WHERE ${where}`))).rows[0] as { n: number }).n);

(async () => {
  const A = 'master', B = 'u:2', C = 'u:3', D = 'u:4';
  const pub: Record<string, string> = {};
  for (const d of [A, B, C, D]) {
    await cofreSvc.criarConta(d, { kdf: kdf(), chave_por_senha: envelope(), chave_por_kit: envelope() } as never);
    pub[d] = b64(32);
    await cofreSvc.registrarPessoa(d, { chave_publica: pub[d], chave_privada: envelope() });
  }
  const cofre = uuid();
  await cofreSvc.salvarCofre(A, cofre, envelope());
  const convite = (membro: string, papel: string) => ({ membro, chave_publica: pub[membro], chave_selada: selo(), papel, prova: b64(32) }) as never;
  await cofreSvc.convidar(A, cofre, convite(B, 'escrita'));
  await cofreSvc.convidar(A, cofre, convite(C, 'leitura'));
  const item = uuid();
  const g = { geracao: 0 };
  await cofreSvc.salvarItem(A, item, cofre, envelope(), null, g);

  // ---- enviar: forma
  const a1 = uuid(), b1 = blob();
  await anexoSvc.enviar(A, a1, cofre, item, sha(b1), b1);
  ok('enviar: blob válido do dono é aceito', (await contagem(`id = '${a1}'`)) === 1);
  ok('enviar: o mesmo envio de novo (mesmo id e sha256) é aceito sem duplicar', (await codigo(() => anexoSvc.enviar(A, a1, cofre, item, sha(b1), b1))) === null && (await contagem(`id = '${a1}'`)) === 1);
  const b1b = blob();
  ok('enviar: mesmo id com conteúdo diferente dá 409', (await codigo(() => anexoSvc.enviar(A, a1, cofre, item, sha(b1b), b1b))) === 'DUPLICATE_ENTRY');
  ok('enviar: sha256 que não bate com o corpo é recusado', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, item, sha(blob()), blob()))) === 'VALIDATION');
  ok('enviar: sha256 mal formado é recusado', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, item, 'xyz', blob()))) === 'VALIDATION');
  ok('enviar: corpo menor que o mínimo (41 bytes) é recusado', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, item, undefined, blob(40)))) === 'VALIDATION');
  ok('enviar: corpo acima de 10 MiB + sobrecarga é recusado', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, item, undefined, blob(MAX_ANEXO_BYTES + 1)))) === 'VALIDATION');
  const velho = Buffer.concat([Buffer.from([2]), randomBytes(99)]);
  ok('enviar: versão de envelope desconhecida é recusada', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, item, undefined, velho))) === 'VALIDATION');
  ok('enviar: corpo que não é Buffer (JSON, texto) é recusado', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, item, undefined, { x: 1 }))) === 'VALIDATION');
  ok('enviar: ids que não são uuid são recusados', (await codigo(() => anexoSvc.enviar(A, 'abc', cofre, item, undefined, blob()))) === 'VALIDATION' && (await codigo(() => anexoSvc.enviar(A, uuid(), 'abc', item, undefined, blob()))) === 'VALIDATION' && (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, 'abc', undefined, blob()))) === 'VALIDATION');
  const max = blob(MAX_ANEXO_BYTES);
  ok('enviar: exatamente o máximo (10 MiB de arquivo + sobrecarga) é aceito', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, uuid(), undefined, max))) === null);

  // ---- papéis
  const aB = uuid(), bB = blob();
  ok('papel: membro com escrita envia', (await codigo(() => anexoSvc.enviar(B, aB, cofre, item, sha(bB), bB))) === null);
  ok('papel: membro só leitura NÃO envia', (await codigo(() => anexoSvc.enviar(C, uuid(), cofre, item, undefined, blob()))) === 'SEM_PERMISSAO');
  ok('papel: quem não participa NÃO envia (404 igual ao de cofre inexistente)', (await codigo(() => anexoSvc.enviar(D, uuid(), cofre, item, undefined, blob()))) === 'NOT_FOUND');
  ok('papel: cofre inexistente dá 404', (await codigo(() => anexoSvc.enviar(A, uuid(), uuid(), item, undefined, blob()))) === 'NOT_FOUND');
  const lido = await anexoSvc.baixar(C, a1);
  ok('baixar: membro só leitura baixa os mesmos bytes e o sha256 confere', lido.blob.equals(b1) && lido.sha256 === sha(b1));
  ok('baixar: quem não participa recebe 404 (igual a anexo inexistente)', (await codigo(() => anexoSvc.baixar(D, a1))) === 'NOT_FOUND' && (await codigo(() => anexoSvc.baixar(D, uuid()))) === 'NOT_FOUND');
  ok('apagar: só leitura NÃO apaga; escrita apaga', (await codigo(() => anexoSvc.apagar(C, aB))) === 'SEM_PERMISSAO' && (await codigo(() => anexoSvc.apagar(B, aB))) === null && (await contagem(`id = '${aB}'`)) === 0);

  // ---- máquina do CLI
  const aCli = uuid(), bCli = blob();
  ok('CLI: a máquina do dono envia e baixa', (await codigo(() => anexoSvc.enviar(A, aCli, cofre, item, undefined, bCli, { aparelho: true }))) === null && (await anexoSvc.baixar(A, aCli, { aparelho: true })).blob.equals(bCli));
  ok('CLI: a máquina de um membro NÃO alcança o cofre do outro', (await codigo(() => anexoSvc.baixar(B, a1, { aparelho: true }))) === 'NOT_FOUND');
  ok('CLI: alcance por cofre — fora da lista é 404', (await codigo(() => anexoSvc.baixar(A, a1, { aparelho: true, permitidos: [uuid()] }))) === 'NOT_FOUND' && (await codigo(() => anexoSvc.baixar(A, a1, { aparelho: true, permitidos: [cofre] }))) === null);

  // ---- limite por item (10) e cota (500 MiB por dono)
  const itemCheio = uuid();
  await cofreSvc.salvarItem(A, itemCheio, cofre, envelope(), null, g);
  for (let i = 0; i < 10; i++) await anexoSvc.enviar(A, uuid(), cofre, itemCheio, undefined, blob());
  ok('limite: o 11º arquivo do mesmo item é recusado', (await codigo(() => anexoSvc.enviar(A, uuid(), cofre, itemCheio, undefined, blob()))) === 'VALIDATION');

  // ---- lista `anexos` do salvarItem
  const it2 = uuid(), x1 = uuid(), x2 = uuid(), x3 = uuid();
  for (const x of [x1, x2, x3]) await anexoSvc.enviar(A, x, cofre, it2, undefined, blob());
  ok('item novo: lista que cita anexo inexistente é recusada', (await codigo(() => cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: [x1, uuid()] }))) === 'VALIDATION');
  ok('item novo: lista que cita anexo de OUTRO item é recusada', (await codigo(() => cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: [a1] }))) === 'VALIDATION');
  ok('item novo: lista com mais de 10 ids ou ids inválidos é recusada', (await codigo(() => cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: Array.from({ length: 11 }, uuid) }))) === 'VALIDATION' && (await codigo(() => cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: ['x'] }))) === 'VALIDATION' && (await codigo(() => cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: 'x' }))) === 'VALIDATION');
  ok('item novo: nada foi gravado nas tentativas recusadas (transação)', Number(((await db.execute(sql.raw(`SELECT count(*)::int AS n FROM cofre_itens WHERE id = '${it2}'`))).rows[0] as { n: number }).n) === 0);
  await cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: [x1, x2, x3] });
  ok('item novo: grava o item e marca os três anexos como ligados', (await contagem(`item_id = '${it2}' AND ligado_em IS NOT NULL`)) === 3);
  await cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: [x1] });
  ok('edição com lista menor: apaga os anexos que saíram da lista', (await contagem(`item_id = '${it2}'`)) === 1 && (await contagem(`id = '${x1}'`)) === 1);
  await cofreSvc.salvarItem(A, it2, cofre, envelope(), null, g);
  ok('edição SEM lista (cliente antigo, CLI): não mexe nos anexos', (await contagem(`id = '${x1}'`)) === 1);
  await cofreSvc.salvarItem(A, it2, cofre, envelope(), null, { ...g, anexos: [] });
  ok('edição com lista vazia: apaga todos os anexos do item', (await contagem(`item_id = '${it2}'`)) === 0);

  // ---- mover de cofre (sem membros: sem prova de geração)
  const cx = uuid(), cy = uuid(), it3 = uuid(), m1 = uuid();
  await cofreSvc.salvarCofre(A, cx, envelope());
  await cofreSvc.salvarCofre(A, cy, envelope());
  await cofreSvc.salvarItem(A, it3, cx, envelope(), null, {});
  await anexoSvc.enviar(A, m1, cx, it3, undefined, blob());
  await cofreSvc.salvarItem(A, it3, cx, envelope(), null, { anexos: [m1] });
  await cofreSvc.salvarItem(A, it3, cy, envelope(), null, {});
  ok('mover item: o anexo vai junto para o cofre novo', (await contagem(`id = '${m1}' AND cofre_id = '${cy}'`)) === 1);
  ok('mover item: ainda baixa depois da mudança', (await codigo(() => anexoSvc.baixar(A, m1))) === null);

  // ---- apagar item e cofre
  await cofreSvc.apagarItem(A, it3);
  ok('apagar item: apaga os anexos dele', (await contagem(`item_id = '${it3}'`)) === 0);
  const it4 = uuid(), n1 = uuid();
  await cofreSvc.salvarItem(A, it4, cy, envelope(), null, {});
  await anexoSvc.enviar(A, n1, cy, it4, undefined, blob());
  await cofreSvc.apagarCofre(A, cy);
  ok('apagar cofre: apaga todos os anexos (cascade)', (await contagem(`cofre_id = '${cy}'`)) === 0);

  // ---- faxina de upload abandonado
  const cz = uuid(), velhoId = uuid(), ligadoVelho = uuid();
  await cofreSvc.salvarCofre(A, cz, envelope());
  const itz = uuid();
  await db.execute(sql.raw(`INSERT INTO cofre_anexos (id, cofre_id, item_id, tamanho, sha256, blob, criado_em) VALUES ('${velhoId}', '${cz}', '${uuid()}', 100, '${'a'.repeat(64)}', '\\x01'::bytea, NOW() - INTERVAL '25 hours')`));
  await db.execute(sql.raw(`INSERT INTO cofre_anexos (id, cofre_id, item_id, tamanho, sha256, blob, criado_em, ligado_em) VALUES ('${ligadoVelho}', '${cz}', '${uuid()}', 100, '${'b'.repeat(64)}', '\\x01'::bytea, NOW() - INTERVAL '25 hours', NOW() - INTERVAL '25 hours')`));
  await anexoSvc.enviar(A, uuid(), cz, itz, undefined, blob());
  ok('faxina: blob sem item citado há mais de 24 h sai no próximo envio', (await contagem(`id = '${velhoId}'`)) === 0);
  ok('faxina: blob ligado a um item NÃO é tocado', (await contagem(`id = '${ligadoVelho}'`)) === 1);

  // ---- cota por dono (500 MiB): 50 linhas de 10 MiB fecham a conta do dono
  await db.execute(sql.raw(`INSERT INTO cofre_anexos (id, cofre_id, item_id, tamanho, sha256, blob) SELECT gen_random_uuid(), '${cz}', gen_random_uuid(), 10485760, repeat('c', 64), '\\x01'::bytea FROM generate_series(1, 50)`));
  ok('cota: acima de 500 MiB por dono é recusado', (await codigo(() => anexoSvc.enviar(A, uuid(), cz, uuid(), undefined, blob()))) === 'VALIDATION');
  const cD = uuid();
  await cofreSvc.salvarCofre(D, cD, envelope());
  ok('cota: vale por DONO do cofre — o cofre de outra conta não é afetado', (await codigo(() => anexoSvc.enviar(D, uuid(), cD, uuid(), undefined, blob()))) === null);
  ok('cota: membro que escreve em cofre alheio gasta a cota do DONO do cofre (não a própria)', (await codigo(() => anexoSvc.enviar(B, uuid(), cofre, item, undefined, blob()))) === 'VALIDATION');

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  await pool.end();
  process.exit(falhas ? 1 : 0);
})().catch(async (e) => {
  console.error('ERRO NO TESTE', e);
  await pool.end().catch(() => undefined);
  process.exit(3);
});
