import { computed, ref, shallowRef } from 'vue';
import { cofreApi } from '@loginhub/api-client';
import type { CofreEstado } from '@loginhub/schema';
import {
  adCofre,
  adContaKit,
  adContaSenha,
  adItem,
  b64,
  chaveDoKit,
  chaveMestraDe,
  cifrar,
  cifrarJson,
  decifrar,
  decifrarJson,
  deB64,
  kitDeTexto,
  novaChave,
  novoId,
  novoKit,
  novosParametrosKdf,
} from './cripto';

/**
 * Estado do cofre ABERTO. As chaves moram só na memória desta aba (nunca no
 * localStorage): trancar, recarregar a página ou fechar a aba esquece tudo.
 */
const DONO = 'master';

export interface CofreAberto {
  id: string;
  nome: string;
  chave: Uint8Array;
}

export interface ItemCofre {
  titulo: string;
  usuario: string;
  senha: string;
  url: string;
  /** Chave base32 ou URI otpauth:// do 2FA do site. */
  totp: string;
  notas: string;
}

export interface ItemAberto extends ItemCofre {
  id: string;
  cofre_id: string;
  atualizado_em: string;
}

const bruto = shallowRef<CofreEstado | null>(null);
const chaveConta = shallowRef<Uint8Array | null>(null);
const cofres = ref<CofreAberto[]>([]);
const itens = ref<ItemAberto[]>([]);
/** Quantos registros não abriram (corrompidos ou mexidos no servidor). */
const ilegiveis = ref(0);

const aberto = computed(() => chaveConta.value !== null);
const existe = computed(() => !!bruto.value?.conta);

async function carregar(): Promise<void> {
  bruto.value = await cofreApi.estado();
}

function abrirTudo(): void {
  const conta = chaveConta.value;
  const estado = bruto.value;
  if (!conta || !estado) return;
  let falhas = 0;
  const abertos: CofreAberto[] = [];
  for (const c of estado.cofres) {
    try {
      const d = decifrarJson<{ nome: string; chave: string }>(conta, c.dados, adCofre(DONO, c.id));
      abertos.push({ id: c.id, nome: d.nome, chave: deB64(d.chave) });
    } catch {
      falhas++;
    }
  }
  const lista: ItemAberto[] = [];
  for (const i of estado.itens) {
    const cofre = abertos.find((c) => c.id === i.cofre_id);
    if (!cofre) {
      falhas++;
      continue;
    }
    try {
      const d = decifrarJson<ItemCofre>(cofre.chave, i.dados, adItem(i.cofre_id, i.id));
      lista.push({ ...d, id: i.id, cofre_id: i.cofre_id, atualizado_em: String(i.atualizado_em) });
    } catch {
      falhas++;
    }
  }
  abertos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  cofres.value = abertos;
  itens.value = lista;
  ilegiveis.value = falhas;
}

/** Cria o cofre: devolve o kit de recuperação, que a tela mostra UMA vez. */
async function criar(palavraPasse: string): Promise<string> {
  const kdf = novosParametrosKdf();
  const mestra = await chaveMestraDe(palavraPasse, kdf);
  const conta = novaChave();
  const kit = novoKit();
  await cofreApi.criarConta({
    kdf,
    chave_por_senha: cifrar(mestra, conta, adContaSenha(DONO)),
    chave_por_kit: cifrar(chaveDoKit(kit.bytes), conta, adContaKit(DONO)),
  });
  mestra.fill(0);
  kit.bytes.fill(0);
  await carregar();
  chaveConta.value = conta;
  // Primeiro cofre já pronto, para começar a guardar.
  await salvarCofre('Geral');
  return kit.texto;
}

/** Lança `CHAVE_ERRADA` se a palavra-passe não abre. */
async function abrirComSenha(palavraPasse: string): Promise<void> {
  await carregar();
  const conta = bruto.value?.conta;
  if (!conta) throw new Error('SEM_COFRE');
  const mestra = await chaveMestraDe(palavraPasse, conta.kdf);
  try {
    chaveConta.value = decifrar(mestra, conta.chave_por_senha, adContaSenha(DONO));
  } finally {
    mestra.fill(0);
  }
  abrirTudo();
}

/** Abre pelo kit de recuperação. Depois disso a tela pede uma palavra-passe nova. */
async function abrirComKit(kitTexto: string): Promise<void> {
  await carregar();
  const conta = bruto.value?.conta;
  if (!conta) throw new Error('SEM_COFRE');
  const kit = kitDeTexto(kitTexto);
  chaveConta.value = decifrar(chaveDoKit(kit), conta.chave_por_kit, adContaKit(DONO));
  kit.fill(0);
  abrirTudo();
}

/** Palavra-passe nova (troca ou depois do kit). Cofres e itens não mudam. */
async function trocarSenha(nova: string): Promise<void> {
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const kdf = novosParametrosKdf();
  const mestra = await chaveMestraDe(nova, kdf);
  await cofreApi.trocarSenha({ kdf, chave_por_senha: cifrar(mestra, conta, adContaSenha(DONO)) });
  mestra.fill(0);
  await carregar();
}

function trancar(): void {
  chaveConta.value?.fill(0);
  for (const c of cofres.value) c.chave.fill(0);
  chaveConta.value = null;
  cofres.value = [];
  itens.value = [];
  ilegiveis.value = 0;
}

async function salvarCofre(nome: string, id?: string): Promise<void> {
  const conta = chaveConta.value;
  if (!conta) throw new Error('TRANCADO');
  const existente = id ? cofres.value.find((c) => c.id === id) : undefined;
  const cofreId = existente?.id ?? novoId();
  const chave = existente?.chave ?? novaChave();
  await cofreApi.salvarCofre(cofreId, cifrarJson(conta, { nome: nome.trim(), chave: b64(chave) }, adCofre(DONO, cofreId)));
  await carregar();
  abrirTudo();
}

async function apagarCofre(id: string): Promise<void> {
  await cofreApi.apagarCofre(id);
  await carregar();
  abrirTudo();
}

async function salvarItem(cofreId: string, dados: ItemCofre, id?: string): Promise<void> {
  const cofre = cofres.value.find((c) => c.id === cofreId);
  if (!cofre) throw new Error('COFRE_NAO_ENCONTRADO');
  const itemId = id ?? novoId();
  await cofreApi.salvarItem(itemId, cofreId, cifrarJson(cofre.chave, dados, adItem(cofreId, itemId)));
  await carregar();
  abrirTudo();
}

async function apagarItem(id: string): Promise<void> {
  await cofreApi.apagarItem(id);
  await carregar();
  abrirTudo();
}

export function useCofre() {
  return {
    existe,
    aberto,
    cofres,
    itens,
    ilegiveis,
    carregar,
    criar,
    abrirComSenha,
    abrirComKit,
    trocarSenha,
    trancar,
    salvarCofre,
    apagarCofre,
    salvarItem,
    apagarItem,
  };
}
