// Teste das peças puras de cartão e documento no cofre (28/11/2026): validações, máscaras e a cifra dos anexos. Sem banco,
// sem rede, sem navegador. Roda dentro da imagem base: ~/sh/loginhub-teste-cofre-tipos.sh.
import { randomBytes } from 'node:crypto';
import {
  agruparNumero, bandeiraDe, cartaoValido, cartaoVencido, cpfValido, documentoValido, finalDe, formatarCpf, formatarValidade,
  luhnOk, mascaraCartao, mascaraDocumento, situacaoDaValidade, validadeCartaoOk,
} from '../apps/ui/src/features/cofre/tipos';
import { adAnexo, cifrarBytes, conferirRef, decifrarBytes, tipoConfere } from '../apps/ui/src/features/cofre/anexosCripto';
import { cifrarJson, decifrarJson, novaChave, novoId } from '../apps/ui/src/features/cofre/cripto';
import type { ItemCofre } from '../apps/ui/src/features/cofre/useCofre';

let falhas = 0;
const ok = (nome: string, cond: boolean) => {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}`);
  if (!cond) falhas++;
};
const lanca = (f: () => unknown): string | null => {
  try {
    f();
    return null;
  } catch (e) {
    return (e as { codigo?: string; message?: string }).codigo ?? (e as Error).message;
  }
};

// ---- cartão (números de teste públicos das bandeiras)
ok('luhn: números de teste válidos', luhnOk('4111111111111111') && luhnOk('5555555555554444') && luhnOk('378282246310005') && luhnOk('4111 1111 1111 1111'));
ok('luhn: dígito trocado, curto e vazio são recusados', !luhnOk('4111111111111112') && !luhnOk('411111') && !luhnOk('') && !luhnOk('abcd'));
ok('bandeira: Visa, Mastercard (51 e 2221), Amex, Elo, Hipercard', bandeiraDe('4111111111111111') === 'Visa' && bandeiraDe('5555555555554444') === 'Mastercard' && bandeiraDe('2221000000000009') === 'Mastercard' && bandeiraDe('378282246310005') === 'Amex' && bandeiraDe('5067000000000000') === 'Elo' && bandeiraDe('6062820000000000') === 'Hipercard' && bandeiraDe('9999') === '');
ok('agrupar: 4-4-4-4 e Amex em 4-6-5', agruparNumero('4111111111111111') === '4111 1111 1111 1111' && agruparNumero('378282246310005') === '3782 822463 10005');
ok('máscara do cartão mostra só o final', mascaraCartao('4111111111111111') === '•••• •••• •••• 1111' && finalDe('4111 1111 1111 1111') === '1111' && !mascaraCartao('4111111111111111').includes('4111 1111'));
ok('validade: formato e mês', validadeCartaoOk('08/29') && !validadeCartaoOk('13/29') && !validadeCartaoOk('00/29') && !validadeCartaoOk('8/29') && !validadeCartaoOk('0829') && formatarValidade('0829') === '08/29' && formatarValidade('08') === '08');
ok('vencido: vale até o fim do mês', !cartaoVencido('11/26', new Date(2026, 10, 30)) && cartaoVencido('10/26', new Date(2026, 10, 1)) && cartaoVencido('12/25', new Date(2026, 0, 1)) && !cartaoVencido('01/30', new Date(2026, 10, 1)));
ok('cartão válido exige Luhn e validade', cartaoValido({ titular: '', numero: '4111111111111111', bandeira: 'Visa', validade: '08/29', banco: '' }) && !cartaoValido({ titular: '', numero: '4111111111111112', bandeira: '', validade: '08/29', banco: '' }) && !cartaoValido({ titular: '', numero: '4111111111111111', bandeira: '', validade: '', banco: '' }));

// ---- documento
ok('cpf: dígitos verificadores', cpfValido('123.456.789-09') && cpfValido('12345678909') && !cpfValido('123.456.789-10') && !cpfValido('11111111111') && !cpfValido('1234') && !cpfValido(''));
ok('cpf: formatação enquanto digita', formatarCpf('12345678909') === '123.456.789-09' && formatarCpf('1234') === '123.4' && formatarCpf('') === '');
ok('máscara do documento: CPF mostra 3+2 e o resto só o fim', mascaraDocumento('cpf', '12345678909') === '•••.•••.789-09' && mascaraDocumento('cnh', '12345678900') === '••••••••900' && mascaraDocumento('rg', '') === '—' && !mascaraDocumento('cnh', '12345678900').includes('1234'));
ok('documento válido: CPF confere, "outro" não exige número, CNH exige', documentoValido({ tipo: 'cpf', nome: '', numero: '12345678909', anexos: [] }) && !documentoValido({ tipo: 'cpf', nome: '', numero: '12345678900', anexos: [] }) && documentoValido({ tipo: 'outro', nome: '', numero: '', anexos: [] }) && !documentoValido({ tipo: 'cnh', nome: '', numero: '', anexos: [] }) && documentoValido({ tipo: 'cnh', nome: '', numero: '123456', anexos: [] }));
const hoje = new Date(2026, 10, 28);
ok('validade do documento: vencido, vence em 90 dias, em dia, inválido', situacaoDaValidade('2026-11-01', hoje) === 'vencido' && situacaoDaValidade('2027-01-15', hoje) === 'vence-logo' && situacaoDaValidade('2031-05-14', hoje) === 'em-dia' && situacaoDaValidade('lixo', hoje) === null && situacaoDaValidade(undefined, hoje) === null);

// ---- anexos: cifra
const item = novoId(), anexo = novoId();
const arquivo = new Uint8Array(randomBytes(5000));
const { cifrado, chave } = cifrarBytes(arquivo, item, anexo);
ok('anexo: formato [1][nonce 24][cifra + etiqueta 16]', cifrado[0] === 1 && cifrado.length === 1 + 24 + arquivo.length + 16);
ok('anexo: ida e volta devolve os mesmos bytes', Buffer.from(decifrarBytes(cifrado, chave, item, anexo)).equals(Buffer.from(arquivo)));
ok('anexo: o blob não contém o arquivo em claro', !Buffer.from(cifrado).includes(Buffer.from(arquivo.subarray(0, 32))));
ok('anexo: dois envios do mesmo arquivo dão blobs e chaves diferentes', (() => { const o = cifrarBytes(arquivo, item, anexo); return o.chave !== chave && !Buffer.from(o.cifrado).equals(Buffer.from(cifrado)); })());
ok('anexo: colar o blob em OUTRO item falha', lanca(() => decifrarBytes(cifrado, chave, novoId(), anexo)) === 'INTEGRIDADE');
ok('anexo: colar o blob com OUTRO id de anexo falha', lanca(() => decifrarBytes(cifrado, chave, item, novoId())) === 'INTEGRIDADE');
ok('anexo: chave errada falha', lanca(() => decifrarBytes(cifrado, cifrarBytes(arquivo, item, anexo).chave, item, anexo)) === 'INTEGRIDADE');
const mexido = new Uint8Array(cifrado);
mexido[100] ^= 1;
ok('anexo: um bit alterado no blob falha', lanca(() => decifrarBytes(mexido, chave, item, anexo)) === 'INTEGRIDADE');
ok('anexo: blob truncado e versão desconhecida falham', lanca(() => decifrarBytes(cifrado.subarray(0, 30), chave, item, anexo)) === 'ABRIR' && lanca(() => decifrarBytes(Uint8Array.of(9, ...cifrado.subarray(1)), chave, item, anexo)) === 'ABRIR');

// ---- referência de anexo vinda do item (pode ter sido gravada por outro membro) e tipo do arquivo
const refBoa = { id: novoId(), mime: 'application/pdf', sha256: 'a'.repeat(64), chave, tamanho: 10 };
ok('ref: referência bem formada passa', lanca(() => conferirRef(refBoa)) === null);
ok('ref: id com ../, mime estranho, sha curto, chave curta e tamanho texto são recusados', ['id', 'mime', 'sha256', 'chave', 'tamanho'].every((k) => lanca(() => conferirRef({ ...refBoa, [k]: k === 'id' ? '../aparelhos' : k === 'mime' ? 'text/html' : k === 'sha256' ? 'abc' : k === 'chave' ? 'AAAA' : '10' })) === 'ABRIR'));
ok('tipo: magic bytes de PDF, JPEG, PNG e WebP', tipoConfere(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]), 'application/pdf') && tipoConfere(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg') && tipoConfere(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), 'image/png') && tipoConfere(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), 'image/webp'));
ok('tipo: HTML disfarçado de PDF ou imagem é recusado', !tipoConfere(new TextEncoder().encode('<html><script>x</script>'), 'application/pdf') && !tipoConfere(new TextEncoder().encode('<svg onload=x>'), 'image/jpeg') && !tipoConfere(Uint8Array.from([0x25, 0x50, 0x44, 0x46]), 'text/html'));
ok('dado associado leva a versão do blob', adAnexo('i', 'a') === 'anexo:v1:i:a');

// ---- o que vai ao servidor não tem o dado em claro (zero-knowledge)
const NUMERO = '4111111111111111', CVV = '737', CPF = '12345678909', NOME = 'MOAB EXEMPLO';
const cofreChave = novaChave();
const cartaoItem: ItemCofre = { titulo: 'Roxinho', usuario: '', senha: '', url: '', totp: '', notas: '', tipo: 'cartao', cartao: { titular: NOME, numero: NUMERO, bandeira: 'Visa', validade: '08/29', banco: 'X', cvv: CVV } };
const docItem: ItemCofre = { titulo: 'CPF', usuario: '', senha: '', url: '', totp: '', notas: '', tipo: 'documento', documento: { tipo: 'cpf', nome: NOME, numero: CPF, anexos: [{ id: anexo, nome: 'cnh-frente.jpg', mime: 'image/jpeg', tamanho: 10, chave, sha256: 'a'.repeat(64) }] } };
const envC = cifrarJson(cofreChave, cartaoItem, `item:${item}`);
const envD = cifrarJson(cofreChave, docItem, `item:${item}`);
const textoServidor = `${envC}\n${envD}\n${Buffer.from(cifrado).toString('base64')}`;
ok('servidor: o item cifrado não contém número, CVV, CPF, nome, nome de arquivo nem a chave do anexo', [NUMERO, CVV, CPF, NOME, 'cnh-frente', chave, 'Visa', 'image/jpeg'].every((t) => !textoServidor.includes(t)));
ok('item cifrado: ida e volta preserva cartão e documento (inclui a lista de anexos)', (() => {
  const c = decifrarJson<ItemCofre>(cofreChave, envC, `item:${item}`), d = decifrarJson<ItemCofre>(cofreChave, envD, `item:${item}`);
  return c.cartao?.numero === NUMERO && c.cartao.cvv === CVV && d.documento?.numero === CPF && d.documento.anexos[0]?.chave === chave;
})());
ok('item cifrado: item de login antigo (sem tipo) segue abrindo', (() => {
  const l: ItemCofre = { titulo: 'GitHub', usuario: 'a', senha: 'b', url: 'x', totp: '', notas: '' };
  const r = decifrarJson<ItemCofre>(cofreChave, cifrarJson(cofreChave, l, `item:${item}`), `item:${item}`);
  return r.tipo === undefined && r.senha === 'b';
})());

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
