// Teste da aprovação de máquina pelo navegador (db/017): o selo cifrado para a chave pública da máquina.
// Não fala com servidor nenhum. Rodar:
//   NODE_PATH=cli/hub-pass/node_modules npx tsx scripts/teste-cofre-pareamento.ts
import { createHash } from 'node:crypto';
import * as c from '../apps/ui/src/features/cofre/cripto';
import * as p from '../apps/ui/src/features/cofre/pareamento';

let falhas = 0;
const ok = (nome: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra ? ` (${extra})` : ''}`);
  if (!cond) falhas++;
};
const lanca = async (f: () => Promise<unknown>, esperado: string): Promise<boolean> => {
  try {
    await f();
    return false;
  } catch (e) {
    return (e as Error).message === esperado;
  }
};

// A conta do código no hub (CofreService.codigoDoPedido), refeita aqui só com o Node.
function codigoDoHub(id: string, publica: string): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const h = createHash('sha256').update(`loginhub-cofre-pedido-v1|${id}|${publica}`).digest();
  let bits = 0, valor = 0, out = '';
  for (const b of h.subarray(0, 8)) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += A[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.slice(0, 12);
}

(async () => {
  // Arrange
  const maquina = await p.novoParDoAparelho();
  const outra = await p.novoParDoAparelho();
  const id = c.novoId();
  const ad = p.adSelo('master', id);
  const conta = c.novaChave();
  const cofres = [{ id: c.novoId(), nome: 'SERVIDORES', chave: c.b64(c.novaChave()) }];

  // par e código
  ok('chave pública da máquina tem 32 bytes', c.deB64(maquina.publica).length === 32);
  const codigo = p.codigoDoPedido(id, maquina.publica);
  ok('código do pedido: 12 letras base32', /^[A-Z2-7]{12}$/.test(codigo), codigo);
  ok('código igual ao que o hub calcula', codigo === codigoDoHub(id, maquina.publica));
  ok('código muda se a chave pública for trocada', codigo !== p.codigoDoPedido(id, outra.publica));
  ok('código muda com o id do pedido', codigo !== p.codigoDoPedido(c.novoId(), maquina.publica));
  ok('código digitado com hífen e minúscula é o mesmo', p.limparCodigo(p.formatarCodigo(codigo).toLowerCase()) === codigo);

  // selo da conta inteira
  const seloConta = await p.selar(maquina.publica, { tipo: 'conta', chave: c.b64(conta) }, ad);
  ok('selo no formato x1.<pública>.<nonce>.<cifra>', /^x1\.[A-Za-z0-9+/]{43}=\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/.test(seloConta));
  const aberto = await p.abrirSelo(maquina, seloConta, ad);
  ok('a máquina abre o selo da conta', aberto.tipo === 'conta' && aberto.chave === c.b64(conta));
  ok('dois selos do mesmo conteúdo são diferentes (efêmera e nonce novos)', seloConta !== (await p.selar(maquina.publica, { tipo: 'conta', chave: c.b64(conta) }, ad)));

  // selo só de alguns cofres
  const seloCofres = await p.selar(maquina.publica, { tipo: 'cofres', cofres }, ad);
  const abertoCofres = await p.abrirSelo(maquina, seloCofres, ad);
  ok('a máquina abre o selo dos cofres escolhidos', abertoCofres.tipo === 'cofres' && abertoCofres.cofres[0]?.nome === 'SERVIDORES' && abertoCofres.cofres[0]?.chave === cofres[0]!.chave);

  // quem não deve abrir
  ok('outra máquina não abre', await lanca(() => p.abrirSelo(outra, seloConta, ad), 'CHAVE_ERRADA'));
  ok('selo de outro dono não abre', await lanca(() => p.abrirSelo(maquina, seloConta, p.adSelo('u:9', id)), 'CHAVE_ERRADA'));
  ok('selo de outro aparelho não abre', await lanca(() => p.abrirSelo(maquina, seloConta, p.adSelo('master', c.novoId())), 'CHAVE_ERRADA'));
  const partes = seloConta.split('.');
  const mexido = [partes[0], partes[1], partes[2], c.b64(c.deB64(partes[3]!).map((b, i) => (i === 0 ? b ^ 1 : b)))].join('.');
  ok('selo mexido não abre', await lanca(() => p.abrirSelo(maquina, mexido, ad), 'CHAVE_ERRADA'));
  const efemeraTrocada = [partes[0], outra.publica, partes[2], partes[3]].join('.');
  ok('selo com a chave efêmera trocada não abre', await lanca(() => p.abrirSelo(maquina, efemeraTrocada, ad), 'CHAVE_ERRADA'));
  ok('chave pública de tamanho errado é recusada', await lanca(() => p.selar(c.b64(new Uint8Array(16)), { tipo: 'conta', chave: '' }, ad), 'CHAVE_PUBLICA_INVALIDA'));

  // prova da chave pública (HMAC com a chave da conta)
  const prova = p.provaDoAparelho(conta, 'master', id, maquina.publica);
  ok('prova: HMAC de 32 bytes em base64, estável', /^[A-Za-z0-9+/]{43}=$/.test(prova) && prova === p.provaDoAparelho(conta, 'master', id, maquina.publica));
  ok('prova muda com a chave pública, o id, o dono e a chave da conta', new Set([prova, p.provaDoAparelho(conta, 'master', id, outra.publica), p.provaDoAparelho(conta, 'master', c.novoId(), maquina.publica), p.provaDoAparelho(conta, 'u:9', id, maquina.publica), p.provaDoAparelho(c.novaChave(), 'master', id, maquina.publica)]).size === 5);

  console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
