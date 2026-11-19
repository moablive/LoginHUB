// Teste do cripto.ts do cofre (vetores RFC 6238, ida e volta, adulteração). Rodar: npx tsx scripts/teste-cofre-cripto.ts
import * as c from '../apps/ui/src/features/cofre/cripto';
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
  console.log(`falhas: ${falhas}`);
  process.exit(falhas ? 1 : 0);
})();
