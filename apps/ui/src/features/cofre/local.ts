/**
 * O que o cofre guarda NESTE aparelho (25/11/2026, pedido do dono: cofre que abre sem internet e que não pede a
 * digital de novo depois que o iOS fecha o PWA). Duas coisas, ambas no IndexedDB:
 *
 *  - a COPIA do estado do cofre, do jeito que o servidor entrega (tudo cifrado). Sem a chave da conta é texto
 *    ilegível. As embrulhadas pela palavra-passe e pelo kit NÃO entram na cópia: não há motivo para deixar no
 *    aparelho um alvo de força bruta, e sem rede o cofre abre pela digital ou pela sessão guardada.
 *  - a SESSAO: a chave da conta, cifrada com uma chave AES-GCM não extraível do WebCrypto (o JavaScript não
 *    consegue ler o valor dela, só usá-la neste navegador). Vale pelo tempo escolhido, contado desde o último uso;
 *    passou o tempo, trancou ou saiu: é apagada.
 *
 * Tudo aqui falha em silêncio (IndexedDB bloqueado, modo privado): o cofre funciona como antes, só sem o conforto.
 */
import type { CofreEstado } from '@loginhub/schema';

const BANCO = 'loginhub-cofre';
const VERSAO = 1;
const COPIAS = 'copias';
const SESSAO = 'sessao';
const CHAVES = 'chaves';
const ULTIMO_DONO = 'loginhub.cofre.ultimo-dono';

export interface CopiaLocal {
  estado: CofreEstado;
  /** Quando o servidor entregou esta cópia (ISO). */
  em: string;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const nome of [COPIAS, SESSAO, CHAVES]) if (!db.objectStoreNames.contains(nome)) db.createObjectStore(nome);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function ler<T>(loja: string, chave: string): Promise<T | undefined> {
  const db = await abrir();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction(loja, 'readonly').objectStore(loja).get(chave);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}

async function gravar(loja: string, chave: string, valor: unknown): Promise<void> {
  const db = await abrir();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(loja, 'readwrite');
      t.objectStore(loja).put(valor, chave);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

async function limpar(loja: string): Promise<void> {
  const db = await abrir();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(loja, 'readwrite');
      t.objectStore(loja).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** O iOS apaga menos dados de um PWA que pediu armazenamento persistente (não é garantia). */
export function pedirPersistencia(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* sem suporte: segue sem */
  }
}

// --- cópia do estado ---------------------------------------------------------------------------------------------

export const ultimoDono = (): string | null => {
  try {
    return localStorage.getItem(ULTIMO_DONO);
  } catch {
    return null;
  }
};

/** Sem as chaves embrulhadas pela palavra-passe e pelo kit (ver o cabeçalho). */
const semSegredosDeSenha = (e: CofreEstado): CofreEstado => ({
  ...e,
  conta: e.conta ? { ...e.conta, chave_por_senha: '', chave_por_kit: '' } : null,
});

export async function guardarCopia(estado: CofreEstado): Promise<void> {
  try {
    await gravar(COPIAS, estado.dono, { estado: semSegredosDeSenha(estado), em: new Date().toISOString() } satisfies CopiaLocal);
    try {
      localStorage.setItem(ULTIMO_DONO, estado.dono);
    } catch {
      /* sem localStorage: a cópia fica, mas a abertura offline não sabe de quem é */
    }
  } catch {
    /* sem cópia local */
  }
}

export async function lerCopia(dono: string): Promise<CopiaLocal | null> {
  try {
    return (await ler<CopiaLocal>(COPIAS, dono)) ?? null;
  } catch {
    return null;
  }
}

// --- sessão (chave da conta, cifrada com chave não extraível) ----------------------------------------------------

interface SessaoGuardada {
  dono: string;
  iv: Uint8Array;
  cifrado: ArrayBuffer;
  ultimoUso: number;
}

async function chaveDoAparelho(): Promise<CryptoKey> {
  const existente = await ler<CryptoKey>(CHAVES, 'aes');
  if (existente) return existente;
  const nova = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await gravar(CHAVES, 'aes', nova);
  return nova;
}

const adSessao = (dono: string): Uint8Array => new TextEncoder().encode(`loginhub-cofre-sessao:${dono}`);

export async function guardarSessao(dono: string, chaveConta: Uint8Array): Promise<void> {
  try {
    const chave = await chaveDoAparelho();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cifrado = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: adSessao(dono) as BufferSource }, chave, chaveConta as BufferSource);
    await gravar(SESSAO, 'atual', { dono, iv, cifrado, ultimoUso: Date.now() } satisfies SessaoGuardada);
  } catch {
    /* sem sessão guardada: o cofre pede a digital como antes */
  }
}

/** Renova o "último uso" da sessão guardada (a janela do tempo conta daqui). */
export async function tocarSessao(): Promise<void> {
  try {
    const s = await ler<SessaoGuardada>(SESSAO, 'atual');
    if (s) await gravar(SESSAO, 'atual', { ...s, ultimoUso: Date.now() });
  } catch {
    /* nada a renovar */
  }
}

/** A chave da conta guardada, se ainda estiver dentro da janela `janelaMs`; senão apaga e devolve null. */
export async function lerSessao(dono: string, janelaMs: number): Promise<Uint8Array | null> {
  try {
    const s = await ler<SessaoGuardada>(SESSAO, 'atual');
    if (!s) return null;
    if (s.dono !== dono || Date.now() - s.ultimoUso > janelaMs) {
      await apagarSessao();
      return null;
    }
    const chave = await chaveDoAparelho();
    const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv as BufferSource, additionalData: adSessao(dono) as BufferSource }, chave, s.cifrado);
    return new Uint8Array(aberto);
  } catch {
    await apagarSessao();
    return null;
  }
}

export async function apagarSessao(): Promise<void> {
  try {
    await limpar(SESSAO);
  } catch {
    /* nada guardado */
  }
}

const DONO_FIXO = 'loginhub.cofre.dono-fixo:';

/**
 * Código de verificação do DONO de um cofre compartilhado, fixado na primeira abertura (TOFU, db/022): por conta que
 * recebe (`membro`) e por conta que compartilha (`dono`). Mudou depois = a chave do dono não é a que se viu antes.
 */
export function codigoFixadoDoDono(membro: string, dono: string): string | null {
  try {
    return localStorage.getItem(`${DONO_FIXO}${membro}:${dono}`);
  } catch {
    return null;
  }
}

export function fixarCodigoDoDono(membro: string, dono: string, codigo: string): void {
  try {
    localStorage.setItem(`${DONO_FIXO}${membro}:${dono}`, codigo);
  } catch {
    /* sem localStorage: o código volta a ser fixado na próxima abertura */
  }
}

/** Sair da conta: some a cópia, a sessão e a chave do aparelho. */
export async function apagarTudoLocal(): Promise<void> {
  try {
    await Promise.all([limpar(COPIAS), limpar(SESSAO), limpar(CHAVES)]);
    localStorage.removeItem(ULTIMO_DONO);
  } catch {
    /* nada a apagar */
  }
}
