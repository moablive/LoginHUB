import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from '@loginhub/database';
import { aplicativos, usuarios, usuariosPasskeys } from '@loginhub/schema';
import type { Passkey, PasskeyOpcoes } from '@loginhub/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ehContaDeCpf } from './AparelhoService';

/**
 * Login por biometria: passkeys / WebAuthn (db/010_passkeys.sql).
 *
 * A digital ou o rosto libera uma chave guardada no aparelho; o hub guarda só a
 * chave pública e confere a assinatura. Com `userVerification: 'required'` a
 * passkey já são dois fatores (o aparelho e o dedo), então ela entra no lugar de
 * senha + código do autenticador — decisão do dono em 10/11/2026.
 *
 * Duas regras que seguram o resto:
 *   - cadastrar exige SESSÃO COMPLETA (senha + 2FA): ninguém cadastra biometria
 *     só sabendo o e-mail da conta;
 *   - o desafio vale uma vez só. Ele viaja num passe assinado de 5 minutos (sem
 *     tabela), e o `jti` do passe é queimado na conferência — uma resposta
 *     capturada não serve de novo.
 *
 * Fica de fora por enquanto a conta de CPF (Sul Alimentos): ela tem as vagas de
 * aparelho do `AparelhoService`, e a passkey dela é a fase F3 do plano.
 */

const DESAFIO_TTL_SEGUNDOS = 300;
const MAX_PASSKEYS_POR_CONTA = 10;

type AcaoDoDesafio = 'passkey-registro' | 'passkey-login';

interface PasseDoDesafio {
    action: AcaoDoDesafio;
    ch: string;
    jti: string;
    sub?: string;
    app_id?: string;
    exp?: number;
}

// Passes já usados, até vencerem. Um container de API só (mesma premissa do
// rate limit em memória): reiniciar esquece a lista, mas o passe vive 5 minutos.
const passesUsados = new Map<string, number>();

const queimarPasse = (passe: PasseDoDesafio): void => {
    const agora = Date.now();
    if (passesUsados.size > 2000) for (const [k, v] of passesUsados) if (v <= agora) passesUsados.delete(k);
    if (passesUsados.has(passe.jti)) throw new Error('CHALLENGE_INVALIDO');
    passesUsados.set(passe.jti, (passe.exp ?? Math.floor(agora / 1000) + DESAFIO_TTL_SEGUNDOS) * 1000);
};

const segredo = (): string => {
    const s = process.env.JWT_SECRET;
    if (!s) {
        console.error('JWT_SECRET missing in .env');
        throw new Error('ERRO_INTERNO');
    }
    return s;
};

const emitirPasse = (dados: Omit<PasseDoDesafio, 'jti' | 'exp'>): string =>
    jwt.sign({ ...dados, jti: crypto.randomBytes(12).toString('hex') }, segredo(), { expiresIn: DESAFIO_TTL_SEGUNDOS });

const lerPasse = (token: unknown, acao: AcaoDoDesafio): PasseDoDesafio => {
    let passe: PasseDoDesafio;
    try {
        passe = jwt.verify(String(token ?? ''), segredo()) as PasseDoDesafio;
    } catch {
        throw new Error('CHALLENGE_INVALIDO');
    }
    if (passe.action !== acao || !passe.ch || !passe.jti) throw new Error('CHALLENGE_INVALIDO');
    return passe;
};

interface ConfigDoApp {
    appId: number;
    appNome: string;
    rpId: string;
    origem: string;
}

export class PasskeyService {
    /**
     * Domínio e origem das passkeys do app. A origem aceita é a da
     * `platform_url` e tem de estar DENTRO do rpId — cadastro errado no banco
     * não vira passkey válida para outro site.
     */
    private async configDoApp(appId: number): Promise<ConfigDoApp> {
        const rows = await db
            .select({ id: aplicativos.id, nome: aplicativos.nome, status: aplicativos.status, platformUrl: aplicativos.platformUrl, rpId: aplicativos.webauthnRpId, usaLoginHub: aplicativos.usaLoginHub })
            .from(aplicativos)
            .where(eq(aplicativos.id, appId))
            .limit(1);
        const app = rows[0];
        if (!app || !app.rpId || !app.platformUrl || app.usaLoginHub === false) throw new Error('PASSKEY_INDISPONIVEL');
        if (app.status !== 'ativo') throw new Error('APP_BLOQUEADO');
        let url: URL;
        try {
            url = new URL(app.platformUrl);
        } catch {
            throw new Error('PASSKEY_INDISPONIVEL');
        }
        const dentro = url.hostname === app.rpId || url.hostname.endsWith(`.${app.rpId}`);
        if (url.protocol !== 'https:' || !dentro) throw new Error('PASSKEY_INDISPONIVEL');
        return { appId: app.id, appNome: app.nome, rpId: app.rpId, origem: url.origin };
    }

    private async conta(usuarioId: string) {
        const rows = await db
            .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, appId: usuarios.appId, status: usuarios.status })
            .from(usuarios)
            .where(eq(usuarios.id, Number(usuarioId)))
            .limit(1);
        const u = rows[0];
        // `sub` 0 é a sessão master do painel: não é linha de `usuarios`.
        if (!u || !u.appId) throw new Error('USUARIO_INVALIDO');
        if (u.status !== 'ativo') throw new Error('USUARIO_BLOQUEADO');
        if (ehContaDeCpf(u.email)) throw new Error('PASSKEY_INDISPONIVEL');
        return { ...u, appId: u.appId as number };
    }

    private ativas(usuarioId: number) {
        return db
            .select()
            .from(usuariosPasskeys)
            .where(and(eq(usuariosPasskeys.usuarioId, usuarioId), isNull(usuariosPasskeys.revogadaEm)))
            .orderBy(desc(usuariosPasskeys.criadoEm));
    }

    // ------------------------------------------------------------- cadastro

    /** Opções para `navigator.credentials.create`. Exige sessão completa (rota). */
    public async opcoesDeRegistro(usuarioId: string): Promise<PasskeyOpcoes> {
        const u = await this.conta(usuarioId);
        const cfg = await this.configDoApp(u.appId);
        const existentes = await this.ativas(u.id);
        if (existentes.length >= MAX_PASSKEYS_POR_CONTA) throw new Error('PASSKEY_LIMITE');

        const opcoes = await generateRegistrationOptions({
            rpName: cfg.appNome,
            rpID: cfg.rpId,
            userName: u.email,
            userDisplayName: u.nome || u.email,
            // O id da conta volta como `userHandle` no login sem digitar e-mail.
            userID: new TextEncoder().encode(String(u.id)),
            attestationType: 'none',
            // O mesmo aparelho não cadastra duas vezes.
            excludeCredentials: existentes.map((p: typeof existentes[0]) => ({ id: p.credentialId })),
            authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        });

        return {
            opcoes: opcoes as unknown as Record<string, unknown>,
            challengeToken: emitirPasse({ action: 'passkey-registro', ch: opcoes.challenge, sub: String(u.id) }),
        };
    }

    public async verificarRegistro(usuarioId: string, challengeToken: unknown, resposta: unknown, nome?: unknown): Promise<Passkey> {
        const passe = lerPasse(challengeToken, 'passkey-registro');
        if (passe.sub !== String(usuarioId)) throw new Error('CHALLENGE_INVALIDO');
        const u = await this.conta(usuarioId);
        const cfg = await this.configDoApp(u.appId);
        if (!resposta || typeof resposta !== 'object') throw new Error('PASSKEY_INVALIDA');
        queimarPasse(passe);

        let conferido;
        try {
            conferido = await verifyRegistrationResponse({
                response: resposta as Parameters<typeof verifyRegistrationResponse>[0]['response'],
                expectedChallenge: passe.ch,
                expectedOrigin: cfg.origem,
                expectedRPID: cfg.rpId,
                requireUserVerification: true,
            });
        } catch (e) {
            console.warn('[PasskeyService] cadastro recusado:', (e as Error).message);
            throw new Error('PASSKEY_INVALIDA');
        }
        if (!conferido.verified || !conferido.registrationInfo) throw new Error('PASSKEY_INVALIDA');

        const { credential } = conferido.registrationInfo;
        try {
            const rows = await db
                .insert(usuariosPasskeys)
                .values({
                    usuarioId: u.id,
                    rpId: cfg.rpId,
                    credentialId: credential.id,
                    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
                    counter: credential.counter,
                    transports: (credential.transports ?? []).join(',').slice(0, 255) || null,
                    nome: String(nome ?? '').trim().slice(0, 120) || 'Aparelho',
                })
                .returning();
            const p = rows[0];
            return { id: p.id, nome: p.nome, criado_em: p.criadoEm, ultimo_uso: p.ultimoUso };
        } catch (e: any) {
            if (e.code === '23505') throw new Error('PASSKEY_JA_CADASTRADA');
            throw e;
        }
    }

    // ---------------------------------------------------------------- login

    /**
     * Opções para `navigator.credentials.get`. Sem lista de credenciais: o
     * aparelho mostra as passkeys que tem para o domínio e a pessoa não digita
     * nem o e-mail. Rota pública — não revela se alguma conta existe.
     */
    public async opcoesDeLogin(appId: unknown): Promise<PasskeyOpcoes> {
        const cfg = await this.configDoApp(Number(appId));
        const opcoes = await generateAuthenticationOptions({ rpID: cfg.rpId, userVerification: 'required' });
        return {
            opcoes: opcoes as unknown as Record<string, unknown>,
            challengeToken: emitirPasse({ action: 'passkey-login', ch: opcoes.challenge, app_id: String(cfg.appId) }),
        };
    }

    /** Confere a assinatura e devolve o id da conta. A sessão quem emite é o AuthService. */
    public async verificarLogin(appId: unknown, challengeToken: unknown, resposta: unknown): Promise<string> {
        const passe = lerPasse(challengeToken, 'passkey-login');
        if (passe.app_id !== String(Number(appId))) throw new Error('CHALLENGE_INVALIDO');
        const cfg = await this.configDoApp(Number(appId));
        const credencialId = (resposta as { id?: unknown } | null)?.id;
        if (typeof credencialId !== 'string' || !credencialId) throw new Error('PASSKEY_INVALIDA');
        queimarPasse(passe);

        const rows = await db
            .select({ passkey: usuariosPasskeys, appId: usuarios.appId })
            .from(usuariosPasskeys)
            .innerJoin(usuarios, eq(usuarios.id, usuariosPasskeys.usuarioId))
            .where(and(eq(usuariosPasskeys.credentialId, credencialId), isNull(usuariosPasskeys.revogadaEm)))
            .limit(1);
        const linha = rows[0];
        // Passkey de outro app (ou revogada) recebe a mesma resposta de assinatura errada.
        if (!linha || linha.appId !== cfg.appId || linha.passkey.rpId !== cfg.rpId) throw new Error('PASSKEY_INVALIDA');
        const p = linha.passkey;

        let conferido;
        try {
            conferido = await verifyAuthenticationResponse({
                response: resposta as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
                expectedChallenge: passe.ch,
                expectedOrigin: cfg.origem,
                expectedRPID: cfg.rpId,
                requireUserVerification: true,
                credential: {
                    id: p.credentialId,
                    publicKey: new Uint8Array(Buffer.from(p.publicKey, 'base64url')),
                    counter: p.counter,
                },
            });
        } catch (e) {
            console.warn(`[PasskeyService] login recusado (passkey ${p.id}):`, (e as Error).message);
            throw new Error('PASSKEY_INVALIDA');
        }
        if (!conferido.verified) throw new Error('PASSKEY_INVALIDA');

        await db
            .update(usuariosPasskeys)
            .set({ counter: conferido.authenticationInfo.newCounter, ultimoUso: new Date() })
            .where(eq(usuariosPasskeys.id, p.id));
        return String(p.usuarioId);
    }

    // -------------------------------------------------------------- gestão

    /** O app tem biometria ligada? Público: a tela de login decide se mostra o botão. */
    public async disponivel(appId: unknown): Promise<boolean> {
        try {
            await this.configDoApp(Number(appId));
            return true;
        } catch {
            return false;
        }
    }

    public async listar(usuarioId: string): Promise<Passkey[]> {
        const rows = await this.ativas(Number(usuarioId));
        return rows.map((p: typeof rows[0]) => ({ id: p.id, nome: p.nome, criado_em: p.criadoEm, ultimo_uso: p.ultimoUso }));
    }

    /** Revoga uma passkey da própria conta. */
    public async revogar(usuarioId: string, id: string): Promise<void> {
        const rows = await db
            .update(usuariosPasskeys)
            .set({ revogadaEm: new Date() })
            .where(and(eq(usuariosPasskeys.id, Number(id)), eq(usuariosPasskeys.usuarioId, Number(usuarioId)), isNull(usuariosPasskeys.revogadaEm)))
            .returning({ id: usuariosPasskeys.id });
        if (rows.length === 0) throw new Error('PASSKEY_NAO_ENCONTRADA');
    }

    /**
     * Revoga todas as passkeys da conta. Chamado pelo "Resetar 2FA" do painel:
     * quem perdeu o celular perdeu junto a biometria dele.
     */
    public async revogarTodas(usuarioId: string): Promise<number> {
        const rows = await db
            .update(usuariosPasskeys)
            .set({ revogadaEm: new Date() })
            .where(and(eq(usuariosPasskeys.usuarioId, Number(usuarioId)), isNull(usuariosPasskeys.revogadaEm)))
            .returning({ id: usuariosPasskeys.id });
        return rows.length;
    }
}

export const passkeyService = new PasskeyService();
