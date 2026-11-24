/**
 * Digital do MASTER do painel (24/11/2026, db/020, pedido do dono: entrar com a
 * biometria no lugar de digitar a Master Key).
 *
 * Aqui mora só a conversa com o APARELHO (`navigator.credentials`): o hub manda
 * as opções em JSON, o aparelho assina com Touch ID / Face ID e a resposta volta
 * em JSON para o hub conferir. Diferente da digital do cofre (features/cofre/
 * digital.ts), que não é login: lá o que importa é o segredo PRF, aqui é a
 * assinatura, que o servidor confere antes de emitir a sessão master.
 */
import { authApi, masterDigitalApi, type DigitalDoMaster } from '@loginhub/api-client';

/** Códigos: SEM_SUPORTE, CANCELADO, JA_CADASTRADA. */
export class ErroDigitalMaster extends Error {
  codigo: 'SEM_SUPORTE' | 'CANCELADO' | 'JA_CADASTRADA';

  constructor(codigo: 'SEM_SUPORTE' | 'CANCELADO' | 'JA_CADASTRADA') {
    super(codigo);
    this.codigo = codigo;
  }
}

const deB64u = (texto: string): ArrayBuffer => {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const paraB64u = (buffer: ArrayBuffer | null | undefined): string | undefined => {
  if (!buffer) return undefined;
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const digitalMasterSuportada = (): boolean =>
  typeof window !== 'undefined' && window.isSecureContext === true && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials;

const traduz = (e: unknown): ErroDigitalMaster => {
  if (e instanceof ErroDigitalMaster) return e;
  const nome = (e as { name?: string } | null)?.name;
  if (nome === 'NotAllowedError' || nome === 'AbortError') return new ErroDigitalMaster('CANCELADO');
  if (nome === 'InvalidStateError') return new ErroDigitalMaster('JA_CADASTRADA');
  return new ErroDigitalMaster('SEM_SUPORTE');
};

type Credencial = { id: string; transports?: AuthenticatorTransport[] };
// `hints` (WebAuthn L3) ainda não está no lib.dom de todas as versões: vai por espalhamento, sem tipo.
const NO_APARELHO: object = { hints: ['client-device'] };

/** Entra no painel pela digital: pede a assinatura ao aparelho e troca pela sessão master. */
export async function entrarComADigitalDoMaster(): Promise<string> {
  if (!digitalMasterSuportada()) throw new ErroDigitalMaster('SEM_SUPORTE');
  const { opcoes, challengeToken } = await masterDigitalApi.opcoesDeLogin();
  let c: PublicKeyCredential | null;
  try {
    c = (await navigator.credentials.get({
      publicKey: {
        challenge: deB64u(opcoes.challenge),
        rpId: opcoes.rpId,
        timeout: opcoes.timeout,
        userVerification: 'required',
        allowCredentials: ((opcoes.allowCredentials ?? []) as Credencial[]).map((x) => ({ type: 'public-key' as const, id: deB64u(x.id), transports: x.transports ?? (['internal', 'hybrid'] as AuthenticatorTransport[]) })),
        ...NO_APARELHO,
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw traduz(e);
  }
  if (!c) throw new ErroDigitalMaster('CANCELADO');
  const r = c.response as AuthenticatorAssertionResponse;
  const resultado = await authApi.loginMasterPelaDigital(challengeToken, {
    id: c.id,
    rawId: paraB64u(c.rawId),
    type: c.type,
    clientExtensionResults: {},
    response: {
      clientDataJSON: paraB64u(r.clientDataJSON),
      authenticatorData: paraB64u(r.authenticatorData),
      signature: paraB64u(r.signature),
      userHandle: paraB64u(r.userHandle),
    },
  });
  return resultado.redirect;
}

/** Cadastra a digital deste aparelho para o master (só com a sessão master aberta). */
export async function ativarDigitalDoMaster(nome: string): Promise<DigitalDoMaster> {
  if (!digitalMasterSuportada()) throw new ErroDigitalMaster('SEM_SUPORTE');
  const { opcoes, challengeToken } = await masterDigitalApi.opcoesDeRegistro();
  let c: PublicKeyCredential | null;
  try {
    c = (await navigator.credentials.create({
      publicKey: {
        rp: opcoes.rp,
        user: { id: deB64u(opcoes.user.id), name: opcoes.user.name, displayName: opcoes.user.displayName },
        challenge: deB64u(opcoes.challenge),
        pubKeyCredParams: opcoes.pubKeyCredParams,
        timeout: opcoes.timeout,
        attestation: 'none',
        excludeCredentials: ((opcoes.excludeCredentials ?? []) as Credencial[]).map((x) => ({ type: 'public-key' as const, id: deB64u(x.id), transports: x.transports })),
        authenticatorSelection: opcoes.authenticatorSelection,
        ...NO_APARELHO,
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    throw traduz(e);
  }
  if (!c) throw new ErroDigitalMaster('CANCELADO');
  const r = c.response as AuthenticatorAttestationResponse;
  return masterDigitalApi.registrar(
    challengeToken,
    {
      id: c.id,
      rawId: paraB64u(c.rawId),
      type: c.type,
      clientExtensionResults: {},
      response: {
        clientDataJSON: paraB64u(r.clientDataJSON),
        attestationObject: paraB64u(r.attestationObject),
        transports: typeof r.getTransports === 'function' ? r.getTransports() : undefined,
      },
    },
    nome.trim().slice(0, 120) || 'Aparelho',
  );
}
