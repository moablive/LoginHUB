/**
 * Tipos de item do cofre além do login (27/11/2026): cartão e documento. Plano: docs/plano-cartoes-documentos-cofre.md.
 *
 * Tudo isto mora DENTRO do JSON cifrado do item (`ItemCofre`): o servidor não sabe nem o tipo do item. Funções puras (sem
 * Vue, sem rede) para poderem ser testadas em scripts/teste-cofre-tipos.ts.
 */

export type TipoItem = 'login' | 'cartao' | 'documento';

export interface DadosCartao {
  titular: string;
  /** Só dígitos. */
  numero: string;
  bandeira: string;
  /** MM/AA */
  validade: string;
  banco: string;
  /** Só existe se a pessoa desligou "Não salvar CVV e PIN". */
  cvv?: string;
  pin?: string;
}

export type TipoDocumento = 'cnh' | 'rg' | 'cpf' | 'passaporte' | 'outro';

/** Arquivo cifrado de um documento: o servidor guarda só os bytes; chave, nome e tipo ficam aqui, no item cifrado. */
export interface AnexoRef {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
  /** File Key (256 bits) em base64. */
  chave: string;
  /** sha256 (hex) do blob cifrado. */
  sha256: string;
}

export interface DadosDocumento {
  tipo: TipoDocumento;
  nome: string;
  numero: string;
  categoria?: string;
  orgao?: string;
  /** AAAA-MM-DD */
  emissao?: string;
  validade?: string;
  nascimento?: string;
  anexos: AnexoRef[];
}

export const TIPOS_DOCUMENTO: { id: TipoDocumento; rotulo: string }[] = [
  { id: 'cnh', rotulo: 'CNH' },
  { id: 'rg', rotulo: 'RG' },
  { id: 'cpf', rotulo: 'CPF' },
  { id: 'passaporte', rotulo: 'Passaporte' },
  { id: 'outro', rotulo: 'Outro' },
];

export const MAX_ANEXO_MB = 10;
export const MAX_ANEXO_BYTES = MAX_ANEXO_MB * 1024 * 1024;
export const MAX_ANEXOS_POR_ITEM = 10;
export const MIMES_ANEXO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export const soDigitos = (s: string): string => s.replace(/\D/g, '');

/** Algoritmo de Luhn: o dígito final do cartão confere com os outros. */
export function luhnOk(numero: string): boolean {
  const n = soDigitos(numero);
  if (n.length < 13 || n.length > 19) return false;
  let soma = 0;
  let dobra = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (dobra) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    dobra = !dobra;
  }
  return soma % 10 === 0;
}

/** Bandeira pelo início do número (BIN). Vazio quando não reconhece. */
export function bandeiraDe(numero: string): string {
  const n = soDigitos(numero);
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699)/.test(n)) return 'Elo';
  if (/^(606282|3841)/.test(n)) return 'Hipercard';
  if (/^3[47]/.test(n)) return 'Amex';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'Mastercard';
  if (/^4/.test(n)) return 'Visa';
  return '';
}

/** "4111111111111111" → "4111 1111 1111 1111" (Amex em 4-6-5). */
export function agruparNumero(numero: string): string {
  const n = soDigitos(numero).slice(0, 19);
  if (/^3[47]/.test(n)) return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(' ');
  return n.replace(/(.{4})/g, '$1 ').trim();
}

export const finalDe = (numero: string): string => soDigitos(numero).slice(-4);

/** "•••• •••• •••• 1111": o que a lista e o detalhe mostram sem a pessoa pedir. */
export const mascaraCartao = (numero: string): string => `•••• •••• •••• ${finalDe(numero)}`;

/** Aceita "MM/AA" com mês de 01 a 12. */
export function validadeCartaoOk(v: string): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  return !!m && Number(m[1]) >= 1 && Number(m[1]) <= 12;
}

/** "0829" → "08/29" enquanto a pessoa digita. */
export function formatarValidade(v: string): string {
  const d = soDigitos(v).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** O cartão já venceu? (vale até o último dia do mês). */
export function cartaoVencido(v: string, agora = new Date()): boolean {
  if (!validadeCartaoOk(v)) return false;
  const mes = Number(v.slice(0, 2));
  const ano = 2000 + Number(v.slice(3, 5));
  return agora.getFullYear() > ano || (agora.getFullYear() === ano && agora.getMonth() + 1 > mes);
}

export function cpfValido(cpf: string): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function formatarCpf(cpf: string): string {
  const c = soDigitos(cpf).slice(0, 11);
  return c.replace(/^(\d{3})(\d{0,3})(\d{0,3})(\d{0,2}).*/, (_, a: string, b: string, d: string, e: string) => a + (b ? `.${b}` : '') + (d ? `.${d}` : '') + (e ? `-${e}` : ''));
}

/** Número de documento mascarado: só o fim aparece. */
export function mascaraDocumento(tipo: TipoDocumento, numero: string): string {
  const n = numero.replace(/\s/g, '');
  if (!n) return '—';
  if (tipo === 'cpf' && soDigitos(n).length === 11) return `•••.•••.${soDigitos(n).slice(6, 9)}-${soDigitos(n).slice(9)}`;
  return `${'•'.repeat(Math.max(4, n.length - 3))}${n.slice(-3)}`;
}

export const numeroDocumentoFormatado = (tipo: TipoDocumento, numero: string): string => (tipo === 'cpf' ? formatarCpf(numero) : numero);

export type SituacaoValidade = 'vencido' | 'vence-logo' | 'em-dia';

/** Vencimento de CNH/passaporte (AAAA-MM-DD): "vence-logo" = nos próximos 90 dias. */
export function situacaoDaValidade(iso: string | undefined, agora = new Date()): SituacaoValidade | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const fim = new Date(`${iso}T23:59:59`);
  if (Number.isNaN(fim.getTime())) return null;
  const dias = (fim.getTime() - agora.getTime()) / 86_400_000;
  return dias < 0 ? 'vencido' : dias <= 90 ? 'vence-logo' : 'em-dia';
}

export const brData = (iso: string | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');

export const cartaoVazio = (): DadosCartao => ({ titular: '', numero: '', bandeira: '', validade: '', banco: '' });
export const documentoVazio = (tipo: TipoDocumento = 'cnh'): DadosDocumento => ({ tipo, nome: '', numero: '', anexos: [] });

export function nomeDoTipoDocumento(t: TipoDocumento): string {
  return TIPOS_DOCUMENTO.find((x) => x.id === t)?.rotulo ?? 'Documento';
}

/** O cartão preenchido pode ser salvo? */
export const cartaoValido = (c: DadosCartao): boolean => luhnOk(c.numero) && validadeCartaoOk(c.validade);

/** O documento preenchido pode ser salvo? CPF confere os dígitos; "outro" não exige número. */
export function documentoValido(d: DadosDocumento): boolean {
  if (d.tipo === 'cpf') return cpfValido(d.numero);
  if (d.tipo === 'outro') return true;
  return d.numero.trim().length >= 3;
}
