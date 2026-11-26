// Teste do cripto.ts do cofre (vetores RFC 6238, ida e volta, adulteração). Rodar: npx tsx scripts/teste-cofre-cripto.ts
import * as c from '../apps/ui/src/features/cofre/cripto';
import * as co from '../apps/ui/src/features/cofre/compartilhar';
import { selar as selarAparelho } from '../apps/ui/src/features/cofre/pareamento';
let falhas = 0;
const ok = (nome: string, cond: boolean) => { console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}`); if (!cond) falhas++; };

// RFC 6238, apêndice B (SHA-1, segredo "12345678901234567890"), 6 dígitos
const seg = new TextEncoder().encode('12345678901234567890');
const t = { segredo: seg, digitos: 8, periodo: 30 };
ok('TOTP RFC 6238 T=59', c.codigoTotp(t, 59_000) === '94287082');
ok('TOTP RFC 6238 T=1111111109', c.codigoTotp(t, 1111111109_000) === '07081804');
ok('TOTP RFC 6238 T=2000000000', c.codigoTotp(t, 2000000000_000) === '69279037');
ok('lerTotp base32', c.lerTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')!.segredo.every((b, i) => b === seg[i]));
ok('lerTotp otpauth', c.codigoTotp({ ...c.lerTotp('otpauth://totp/x?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8')! }, 59_000) === '94287082');

(async () => {
  const kdf = c.novosParametrosKdf();
  const t0 = Date.now();
  const m1 = await c.chaveMestraDe('cavalo-azul-pavilhão-chuva', kdf);
  console.log(`argon2id 64MiB/3: ${Date.now() - t0} ms`);
  const m2 = await c.chaveMestraDe('cavalo-azul-pavilhão-chuva', kdf);
  const m3 = await c.chaveMestraDe('cavalo-azul-pavilhao-chuva', kdf);
  ok('KDF determinístico', c.b64(m1) === c.b64(m2));
  ok('KDF muda com 1 letra', c.b64(m1) !== c.b64(m3));

  const conta = c.novaChave();
  const env = c.cifrar(m1, conta, c.adContaSenha('master'));
  ok('abre com a chave certa', c.b64(c.decifrar(m2, env, c.adContaSenha('master'))) === c.b64(conta));
  let recusou = false; try { c.decifrar(m3, env, c.adContaSenha('master')); } catch (e) { recusou = (e as Error).message === 'CHAVE_ERRADA'; }
  ok('recusa palavra-passe errada', recusou);
  recusou = false; try { c.decifrar(m1, env, c.adContaKit('master')); } catch { recusou = true; }
  ok('recusa dado associado trocado', recusou);
  const [v, n, x] = env.split('.');
  const mexido = `${v}.${n}.${x!.slice(0, 10)}${x![10] === 'A' ? 'B' : 'A'}${x!.slice(11)}`;
  recusou = false; try { c.decifrar(m1, mexido, c.adContaSenha('master')); } catch { recusou = true; }
  ok('recusa cifra adulterada', recusou);

  const kit = c.novoKit();
  ok('kit lido de volta', c.b64(c.kitDeTexto(kit.texto.toLowerCase())) === c.b64(kit.bytes));
  const envKit = c.cifrar(c.chaveDoKit(kit.bytes), conta, c.adContaKit('master'));
  ok('kit abre a conta', c.b64(c.decifrar(c.chaveDoKit(c.kitDeTexto(kit.texto)), envKit, c.adContaKit('master'))) === c.b64(conta));

  const item = { titulo: 'GitHub', senha: 'x' };
  const envItem = c.cifrarJson(conta, item, c.adItem('a', 'b'));
  ok('item ida e volta', JSON.stringify(c.decifrarJson(conta, envItem, c.adItem('a', 'b'))) === JSON.stringify(item));
  recusou = false; try { c.decifrarJson(conta, envItem, c.adItem('outro-cofre', 'b')); } catch { recusou = true; }
  ok('item não abre noutro cofre', recusou);
  ok('envelope casa com o validador do servidor', /^v1\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/.test(envItem));
  // Digital (passkey com PRF, db/015): o segredo do PRF vira chave pelo HKDF e embrulha a conta.
  const prf = c.novaChave();
  ok("HKDF do PRF determinístico", c.b64(c.chaveDoPrf(prf)) === c.b64(c.chaveDoPrf(new Uint8Array(prf))));
  ok("HKDF do PRF não é o segredo cru", c.b64(c.chaveDoPrf(prf)) !== c.b64(prf));
  const envPrf = c.cifrar(c.chaveDoPrf(prf), conta, c.adContaPrf("u:155", "credA"));
  ok("digital abre a conta", c.b64(c.decifrar(c.chaveDoPrf(prf), envPrf, c.adContaPrf("u:155", "credA"))) === c.b64(conta));
  recusou = false; try { c.decifrar(c.chaveDoPrf(c.novaChave()), envPrf, c.adContaPrf("u:155", "credA")); } catch { recusou = true; }
  ok("recusa outra digital", recusou);
  recusou = false; try { c.decifrar(c.chaveDoPrf(prf), envPrf, c.adContaPrf("master", "credA")); } catch { recusou = true; }
  ok("digital não abre o cofre de outro dono", recusou);
  recusou = false; try { c.decifrar(c.chaveDoPrf(prf), envPrf, c.adContaPrf("u:155", "credB")); } catch { recusou = true; }
  ok("embrulho preso à credencial", recusou);
  ok("embrulho da digital casa com o validador do servidor", /^v1\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/.test(envPrf));
  ok("sal do PRF casa com o validador do servidor", /^[A-Za-z0-9+/]{43}=$/.test(c.b64(c.novaChave())));
  const s = c.gerarSenha(24);
  ok('gerador 24 caracteres', s.length === 24);

  // ------------------------------------------------------------ cofre compartilhado (db/022)
  const recusa = async (f: () => unknown): Promise<boolean> => { try { await f(); return false; } catch { return true; } };
  const erroDe = async (f: () => unknown): Promise<string> => { try { await f(); return ''; } catch (e) { return (e as Error).message; } };
  const SELO_X1 = /^x1\.[A-Za-z0-9+/]{43}=\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/;
  const donoA = 'p:aaaa', donoB = 'p:bbbb', donoC = 'p:cccc';
  const contaA = c.novaChave(), contaB = c.novaChave();
  const parA = await co.novoParDaPessoa();
  const parB = await co.novoParDaPessoa();
  const parC = await co.novoParDaPessoa();

  // par da conta: a privada vai cifrada com a chave da conta (dado associado com a pública) e a pública é DERIVADA
  const guardado = co.protegerPar(contaB, donoB, parB);
  ok('par: servidor recebe a pública em claro e a privada cifrada v1', guardado.chave_publica === parB.publica && /^v1\./.test(guardado.chave_privada) && !guardado.chave_privada.includes(parB.privada));
  const aberto0 = await co.abrirPar(contaB, donoB, guardado);
  ok('par: privada abre com a chave da conta e a pública bate com a derivada', aberto0.par.privada === parB.privada && aberto0.par.publica === parB.publica && !aberto0.regravar);
  ok('par: outra chave de conta não abre', await recusa(() => co.abrirPar(contaA, donoB, guardado)));
  ok('par: privada de uma conta não abre como de outra (dado associado)', await recusa(() => co.abrirPar(contaB, donoC, guardado)));
  ok('par: validador do servidor aceita o envelope', /^v1\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/.test(guardado.chave_privada) && /^[A-Za-z0-9+/]{43}=$/.test(guardado.chave_publica));
  // H1: o servidor troca a chave pública da conta (pela dele)
  ok('par: pública trocada pelo servidor não abre (a pública está no dado associado)', await recusa(() => co.abrirPar(contaB, donoB, { ...guardado, chave_publica: parC.publica })));
  // par legado (dado associado antigo "pessoa:<dono>"): abre, confere a pública e pede regravação com o dado novo
  const legado = { chave_publica: parB.publica, chave_privada: c.cifrar(contaB, c.deB64(parB.privada), `pessoa:${donoB}`) };
  const abLegado = await co.abrirPar(contaB, donoB, legado);
  ok('par legado: abre e devolve o registro regravado com o dado associado novo', abLegado.par.publica === parB.publica && !!abLegado.regravar && (await co.abrirPar(contaB, donoB, abLegado.regravar)).regravar === undefined);
  ok('par legado com pública trocada também é detectado', (await erroDe(() => co.abrirPar(contaB, donoB, { ...legado, chave_publica: parC.publica }))) === 'PAR_ADULTERADO');

  // selar / abrir (autenticando o remetente)
  const cofreId = c.novoId();
  const chaveCofre = c.novaChave();
  const pedido = { parDoDono: parA, dono: donoA, membro: donoB, publicaDoMembro: parB.publica, cofreId, chave: c.b64(chaveCofre), nome: 'Servidores', icone: 'server', cor: 'azul' };
  const esperado = { cofreId, dono: donoA, membro: donoB, publicaDoDono: parA.publica };
  const selo = await co.selarCofre(pedido);
  ok('selo casa com o validador x1 do servidor', SELO_X1.test(selo));
  const aberto = await co.abrirCofreSelado(parB, selo, esperado);
  ok('selar/abrir ida e volta (chave, nome, ícone, cor, dono)', aberto.chave === pedido.chave && aberto.nome === 'Servidores' && aberto.icone === 'server' && aberto.cor === 'azul' && aberto.cofre === cofreId && aberto.dono === donoA);
  ok('selo de outra chave pública falha', await recusa(() => co.abrirCofreSelado(parC, selo, { ...esperado, membro: donoC })));
  ok('dado associado trocado (outro membro) falha', await recusa(() => co.abrirCofreSelado(parB, selo, { ...esperado, membro: donoC })));
  ok('dado associado trocado (outro cofre) falha', await recusa(() => co.abrirCofreSelado(parB, selo, { ...esperado, cofreId: c.novoId() })));
  ok('dado associado trocado (outro dono) falha', await recusa(() => co.abrirCofreSelado(parB, selo, { ...esperado, dono: donoC })));
  const [vx, ef, nn, cf] = selo.split('.');
  const seloMexido = `${vx}.${ef}.${nn}.${cf!.slice(0, 8)}${cf![8] === 'A' ? 'B' : 'A'}${cf!.slice(9)}`;
  ok('selo adulterado falha', await recusa(() => co.abrirCofreSelado(parB, seloMexido, esperado)));
  const seloAparelho = await selarAparelho(parB.publica, { tipo: 'conta', chave: 'x' }, 'qualquer');
  ok('selo de máquina do CLI não abre como selo de membro (etiqueta HKDF própria)', await recusa(() => co.abrirCofreSelado(parB, seloAparelho, esperado)));
  ok('selo sem chave pública de 32 bytes é recusado', await recusa(() => co.selarCofre({ ...pedido, publicaDoMembro: 'AAAA' })));
  ok('dois selos do mesmo conteúdo diferem (efêmera e nonce novos)', (await co.selarCofre(pedido)) !== selo);

  // M1: o servidor forja "cofre compartilhado por A" — sem a privada de A não há tag que confira
  const forjador = await co.novoParDaPessoa(); // o servidor tem o próprio par e a pública de B
  const seloForjado = await co.selarCofre({ ...pedido, parDoDono: forjador }); // dono declarado = A, mas tag feita com a privada do forjador
  ok('selo forjado em nome do dono (tag de outra privada) não autentica', (await erroDe(() => co.abrirCofreSelado(parB, seloForjado, esperado))) === 'REMETENTE_NAO_CONFERE');
  ok('selo forjado só abre se o membro aceitar a pública do forjador como a do dono (é o que o código fixado pega)', (await co.abrirCofreSelado(parB, seloForjado, { ...esperado, publicaDoDono: forjador.publica })).dono === donoA && co.codigoDaChave(forjador.publica) !== co.codigoDaChave(parA.publica));
  ok('tag do remetente é simétrica (dono e membro chegam ao mesmo valor)', (await co.etiquetaDoRemetente(parA, parB.publica, { cofre: cofreId, membro: donoB, dono: donoA, chave: 'k' })) === (await co.etiquetaDoRemetente(parB, parA.publica, { cofre: cofreId, membro: donoB, dono: donoA, chave: 'k' })));
  ok('tag muda com a chave do cofre', (await co.etiquetaDoRemetente(parA, parB.publica, { cofre: cofreId, membro: donoB, dono: donoA, chave: 'k1' })) !== (await co.etiquetaDoRemetente(parA, parB.publica, { cofre: cofreId, membro: donoB, dono: donoA, chave: 'k2' })));

  // código de verificação
  const cod = co.codigoDaChave(parB.publica);
  ok('código: 5 grupos de 4 caracteres', /^([A-Z2-7]{4}-){4}[A-Z2-7]{4}$/.test(cod));
  ok('código estável para a mesma chave', cod === co.codigoDaChave(parB.publica));
  ok('código muda com outra chave', cod !== co.codigoDaChave(parC.publica));

  // prova do membro
  const prova = co.provaDoMembro(contaA, donoA, cofreId, donoB, parB.publica);
  ok('prova estável e no formato do servidor', prova === co.provaDoMembro(contaA, donoA, cofreId, donoB, parB.publica) && /^[A-Za-z0-9+/]{43}=$/.test(prova));
  ok('prova muda com a chave pública trocada', prova !== co.provaDoMembro(contaA, donoA, cofreId, donoB, parC.publica));
  ok('prova depende da chave da conta do dono', prova !== co.provaDoMembro(contaB, donoA, cofreId, donoB, parB.publica));

  // girar a chave: cofre de A com 3 itens, membros B e C; remove C
  const itensA = ['um', 'dois', 'três'].map((t) => {
    const id = c.novoId();
    return { id, dados: c.cifrarJson(chaveCofre, { titulo: t, senha: `s-${t}` }, c.adItem(cofreId, id)), atualizado_em: '2026-11-26T10:00:00.000Z' };
  });
  const membros: co.MembroDoGiro[] = [
    { membro: donoB, chave_publica: parB.publica, prova: co.provaDoMembro(contaA, donoA, cofreId, donoB, parB.publica) },
    { membro: donoC, chave_publica: parC.publica, prova: co.provaDoMembro(contaA, donoA, cofreId, donoC, parC.publica) },
  ];
  const base = { dono: donoA, parDoDono: parA, chaveDaConta: contaA, cofreId, chaveAntiga: chaveCofre, registro: { nome: 'Servidores', icone: 'server', cor: 'azul', ordem: 2 }, itens: itensA, membros, remover: donoC };
  const { chaveNova, giro } = await co.prepararGiro(base);
  ok('girar: chave nova diferente da antiga', c.b64(chaveNova) !== c.b64(chaveCofre));
  ok('girar: todos os itens recifrados', giro.itens.length === 3 && giro.itens.every((i, n) => i.id === itensA[n]!.id && i.dados !== itensA[n]!.dados && i.atualizado_em === itensA[n]!.atualizado_em));
  ok('girar: itens abrem com a chave nova, com o mesmo conteúdo', giro.itens.every((i, n) => (c.decifrarJson(chaveNova, i.dados, c.adItem(cofreId, i.id)) as { titulo: string }).titulo === ['um', 'dois', 'três'][n]));
  ok('girar: a chave antiga não abre mais os itens novos', await recusa(() => c.decifrarJson(chaveCofre, giro.itens[0]!.dados, c.adItem(cofreId, giro.itens[0]!.id))));
  ok('girar: item recifrado continua preso ao cofre e ao id (dado associado)', await recusa(() => c.decifrarJson(chaveNova, giro.itens[0]!.dados, c.adItem(c.novoId(), giro.itens[0]!.id))));
  ok('girar: registro do cofre guarda a chave nova e abre com a chave da conta', (c.decifrarJson(contaA, giro.dados, c.adCofre(donoA, cofreId)) as { chave: string; nome: string; ordem: number }).chave === c.b64(chaveNova));
  ok('girar: só o membro que fica recebe selo novo', giro.membros.length === 1 && giro.membros[0]!.membro === donoB && giro.remover === donoC);
  const seloNovoB = await co.abrirCofreSelado(parB, giro.membros[0]!.chave_selada, esperado);
  ok('girar: o membro que fica abre a chave nova, autenticada pelo dono', seloNovoB.chave === c.b64(chaveNova) && seloNovoB.nome === 'Servidores' && seloNovoB.dono === donoA);
  ok('girar: o membro removido não abre o selo novo', await recusa(() => co.abrirCofreSelado(parC, giro.membros[0]!.chave_selada, { ...esperado, membro: donoC })));
  ok('girar: a chave do selo novo não é a antiga', seloNovoB.chave !== c.b64(chaveCofre));
  ok('girar: recusa se o servidor trocou a chave pública de um membro (prova)', await recusa(() => co.prepararGiro({ ...base, registro: { nome: 'S' }, membros: [{ membro: donoB, chave_publica: parC.publica, prova: membros[0]!.prova }], remover: null })));
  ok('girar: item que não abre com a chave antiga impede o giro', await recusa(() => co.prepararGiro({ ...base, chaveAntiga: c.novaChave(), registro: { nome: 'S' }, membros: [], remover: null })));
  ok('girar: corpo casa com o que o servidor valida (envelopes v1 e selo x1)', giro.itens.every((i) => /^v1\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/.test(i.dados)) && SELO_X1.test(giro.membros[0]!.chave_selada));
  console.log(`falhas: ${falhas}`);
  process.exit(falhas ? 1 : 0);
})();
