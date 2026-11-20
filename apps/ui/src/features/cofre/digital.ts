/**
 * Digital que abre o cofre (19/11/2026, db/015, pedido do dono: "a biometria
 * deve ir para o próprio app cofre"). Fase C3/B4 do plano: passkey com a
 * extensão PRF do WebAuthn.
 *
 * Esta passkey NÃO é de login: o rpId é o host do painel (loginhub.astralwavelabel.com),
 * o servidor nem confere a assinatura dela. O que importa é o PRF: depois do
 * Touch ID/Face ID, o aparelho devolve um segredo fixo de 32 bytes para o sal
 * daquela digital — sempre o mesmo, e só aquele aparelho consegue produzir.
 * Esse segredo vira (pelo HKDF, em cripto.ts) a chave que embrulha a chave da
 * conta, e nunca sai do navegador.
 *
 * Funciona com Senhas do iCloud (Safari 18+ e Chrome no Mac/iPhone) e com o
 * Gerenciador de Senhas do Google. Provedor sem PRF (alguns gerenciadores de
 * terceiros) cai em `SEM_PRF`: a tela avisa e o cofre segue pela palavra-passe.
 */
import { randomBytes } from '@noble/ciphers/utils.js';

/** Códigos: SEM_SUPORTE, SEM_PRF, CANCELADO, NAO_RECONHECIDA. */
export class ErroDigital extends Error {
  constructor(public codigo: 'SEM_SUPORTE' | 'SEM_PRF' | 'CANCELADO' | 'NAO_RECONHECIDA') {
    super(codigo);
  }
}

// O lib.dom do TypeScript ainda não descreve a extensão PRF; só o pedaço que usamos.
type PrfEntrada = { eval?: { first: BufferSource }; evalByCredential?: Record<string, { first: BufferSource }> };
type PrfSaida = { enabled?: boolean; results?: { first?: ArrayBuffer } };
// `hints` (WebAuthn L3) ainda não está no lib.dom de todas as versões: vai por espalhamento, sem tipo.
const NO_APARELHO: object = { hints: ['client-device'] };

export const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const deB64url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/** O navegador tem WebAuthn? (Só em https.) */
export const digitalSuportada = (): boolean =>
  typeof window !== 'undefined' && window.isSecureContext === true && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials;

const traduz = (e: unknown): ErroDigital => {
  if (e instanceof ErroDigital) return e;
  const nome = (e as { name?: string } | null)?.name;
  if (nome === 'NotAllowedError' || nome === 'AbortError') return new ErroDigital('CANCELADO');
  return new ErroDigital('SEM_SUPORTE');
};

const prfDe = (c: PublicKeyCredential): PrfSaida | undefined =>
  (c.getClientExtensionResults() as { prf?: PrfSaida }).prf;

/** Pede o segredo PRF a UMA das credenciais (cada uma com o seu sal). */
export async function pedirSegredo(credenciais: { credencial_id: string; prf_sal: Uint8Array }[]): Promise<{ credencialId: string; segredo: Uint8Array }> {
  if (!digitalSuportada()) throw new ErroDigital('SEM_SUPORTE');
  const porCredencial: Record<string, { first: BufferSource }> = {};
  for (const c of credenciais) porCredencial[c.credencial_id] = { first: c.prf_sal as BufferSource };
  let c: PublicKeyCredential | null;
  try {
    c = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        rpId: window.location.hostname,
        userVerification: 'required',
        timeout: 60000,
        allowCredentials: credenciais.map((x) => ({ type: 'public-key' as const, id: deB64url(x.credencial_id) as BufferSource, transports: ['internal', 'hybrid'] as AuthenticatorTransport[] })),
        // Leitor do próprio aparelho primeiro (Touch ID/Face ID), não a janela de um gerenciador de terceiros.
        ...NO_APARELHO,
        extensions: { prf: { evalByCredential: porCredencial } satisfies PrfEntrada } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw traduz(e);
  }
  if (!c) throw new ErroDigital('CANCELADO');
  const primeiro = prfDe(c)?.results?.first;
  if (!primeiro) throw new ErroDigital('SEM_PRF');
  return { credencialId: b64url(new Uint8Array(c.rawId)), segredo: new Uint8Array(primeiro) };
}

/**
 * Cria a passkey do cofre neste aparelho e devolve o segredo PRF para o sal
 * dado. Alguns navegadores já devolvem o PRF na criação; os outros pedem a
 * digital uma segunda vez (o `get` logo em seguida).
 */
export async function criarDigital(dono: string, nome: string, sal: Uint8Array): Promise<{ credencialId: string; segredo: Uint8Array }> {
  if (!digitalSuportada()) throw new ErroDigital('SEM_SUPORTE');
  let c: PublicKeyCredential | null;
  try {
    c = (await navigator.credentials.create({
      publicKey: {
        rp: { id: window.location.hostname, name: 'Cofre do LoginHUB' },
        // id aleatório: a passkey do cofre não é a conta de login e não precisa revelar quem é.
        user: { id: randomBytes(16) as BufferSource, name: `cofre ${dono} · ${nome}`, displayName: 'Cofre do LoginHUB' },
        challenge: randomBytes(32) as BufferSource,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: 60000,
        attestation: 'none',
        // `platform` + `client-device`: a digital do cofre nasce no leitor do aparelho (Senhas da Apple/Google, com PRF).
        // Sem isso o Proton Pass do Chrome toma o pedido e a passkey dele não devolve o PRF (19/11/2026).
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
        ...NO_APARELHO,
        extensions: { prf: { eval: { first: sal as BufferSource } } satisfies PrfEntrada } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw traduz(e);
  }
  if (!c) throw new ErroDigital('CANCELADO');
  const credencialId = b64url(new Uint8Array(c.rawId));
  const prf = prfDe(c);
  if (prf?.enabled === false) throw new ErroDigital('SEM_PRF');
  if (prf?.results?.first) return { credencialId, segredo: new Uint8Array(prf.results.first) };
  return pedirSegredo([{ credencial_id: credencialId, prf_sal: sal }]);
}
