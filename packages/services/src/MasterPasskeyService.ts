import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { db } from '@loginhub/database';
import { masterPasskeys } from '@loginhub/schema';
import type { Passkey, PasskeyOpcoes } from '@loginhub/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { emitirPasse, lerPasse, queimarPasse } from './PasskeyService';

/**
 * Digital do MASTER do painel (db/020_master_passkeys.sql, 24/11/2026, pedido do
 * dono: entrar com a biometria no lugar de digitar a Master Key).
 *
 * A passkey é de LOGIN: o hub guarda a chave pública e confere a assinatura do
 * aparelho sobre um desafio de uso único (passe assinado de 5 minutos, `jti`
 * queimado), com verificação do usuário exigida — o aparelho e o dedo. Quem
 * emite a sessão é o AuthService, a mesma do login com a chave.
 *
 * Regras que seguram o resto:
 *   - cadastrar e tirar exigem SESSÃO MASTER (rota do adminRouter, `soMaster`);
 *   - o domínio (rpId) e a origem aceitos são os do próprio painel
 *     (`UI_PUBLIC_URL`): uma página de outro endereço não consegue pedir a digital;
 *   - a Master Key continua valendo. A digital é um caminho a mais.
 *
 * O cofre também tem passkeys neste domínio (a digital que abre o cofre, com
 * PRF). Para o aparelho não oferecer uma delas aqui, o login manda a lista das
 * credenciais do master (`allowCredentials`).
 */
const MAX_PASSKEYS_DO_MASTER = 10;

const painel = (): { rpId: string; origem: string } => {
    const url = new URL(process.env.UI_PUBLIC_URL || 'https://loginhub.astralwavelabel.com');
    if (url.protocol !== 'https:') throw new Error('PASSKEY_INDISPONIVEL');
    return { rpId: url.hostname, origem: url.origin };
};

type Linha = typeof masterPasskeys.$inferSelect;

export class MasterPasskeyService {
    private ativas(): Promise<Linha[]> {
        return db.select().from(masterPasskeys).where(isNull(masterPasskeys.revogadaEm)).orderBy(desc(masterPasskeys.criadoEm));
    }

    /** A tela de login mostra o botão da digital? Público: só diz se existe alguma. */
    public async disponivel(): Promise<boolean> {
        return (await this.ativas()).length > 0;
    }

    public async listar(): Promise<Passkey[]> {
        return (await this.ativas()).map((p) => ({ id: p.id, nome: p.nome, criado_em: p.criadoEm, ultimo_uso: p.ultimoUso }));
    }

    public async revogar(idBruto: unknown): Promise<void> {
        const id = Number(idBruto);
        if (!Number.isInteger(id) || id <= 0) throw new Error('PASSKEY_NAO_ENCONTRADA');
        const r = await db
            .update(masterPasskeys)
            .set({ revogadaEm: new Date() })
            .where(and(eq(masterPasskeys.id, id), isNull(masterPasskeys.revogadaEm)))
            .returning({ id: masterPasskeys.id });
        if (r.length === 0) throw new Error('PASSKEY_NAO_ENCONTRADA');
    }

    // ------------------------------------------------------------- cadastro (sessão master)

    public async opcoesDeRegistro(): Promise<PasskeyOpcoes> {
        const { rpId } = painel();
        const existentes = await this.ativas();
        if (existentes.length >= MAX_PASSKEYS_DO_MASTER) throw new Error('PASSKEY_LIMITE');
        const opcoes = await generateRegistrationOptions({
            rpName: 'LoginHUB',
            rpID: rpId,
            userName: 'master',
            userDisplayName: 'LoginHUB · Master',
            attestationType: 'none',
            // O mesmo aparelho não cadastra duas vezes.
            excludeCredentials: existentes.map((p) => ({ id: p.credentialId })),
            // Leitor do próprio aparelho (Touch ID / Face ID), com a digital conferida.
            authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
        });
        return {
            opcoes: opcoes as unknown as Record<string, unknown>,
            challengeToken: emitirPasse({ action: 'master-registro', ch: opcoes.challenge }),
        };
    }

    public async verificarRegistro(challengeToken: unknown, resposta: unknown, nome?: unknown): Promise<Passkey> {
        const passe = lerPasse(challengeToken, 'master-registro');
        const { rpId, origem } = painel();
        if (!resposta || typeof resposta !== 'object') throw new Error('PASSKEY_INVALIDA');
        queimarPasse(passe);

        let conferido;
        try {
            conferido = await verifyRegistrationResponse({
                response: resposta as Parameters<typeof verifyRegistrationResponse>[0]['response'],
                expectedChallenge: passe.ch,
                expectedOrigin: origem,
                expectedRPID: rpId,
                requireUserVerification: true,
            });
        } catch (e) {
            console.warn('[MasterPasskeyService] cadastro recusado:', (e as Error).message);
            throw new Error('PASSKEY_INVALIDA');
        }
        if (!conferido.verified || !conferido.registrationInfo) throw new Error('PASSKEY_INVALIDA');

        const { credential } = conferido.registrationInfo;
        try {
            const rows = await db
                .insert(masterPasskeys)
                .values({
                    credentialId: credential.id,
                    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
                    counter: credential.counter,
                    transports: (credential.transports ?? []).join(',').slice(0, 255) || null,
                    nome: String(nome ?? '').trim().slice(0, 120) || 'Aparelho',
                })
                .returning();
            const p = rows[0] as Linha;
            console.warn(`[MasterPasskeyService] digital do master cadastrada: #${p.id} (${p.nome})`);
            return { id: p.id, nome: p.nome, criado_em: p.criadoEm, ultimo_uso: p.ultimoUso };
        } catch (e) {
            if ((e as { code?: string }).code === '23505') throw new Error('PASSKEY_JA_CADASTRADA');
            throw e;
        }
    }

    // ---------------------------------------------------------------- login (público)

    public async opcoesDeLogin(): Promise<PasskeyOpcoes> {
        const { rpId } = painel();
        const existentes = await this.ativas();
        if (existentes.length === 0) throw new Error('PASSKEY_INDISPONIVEL');
        const opcoes = await generateAuthenticationOptions({
            rpID: rpId,
            userVerification: 'required',
            allowCredentials: existentes.map((p) => ({ id: p.credentialId })),
        });
        return {
            opcoes: opcoes as unknown as Record<string, unknown>,
            challengeToken: emitirPasse({ action: 'master-login', ch: opcoes.challenge }),
        };
    }

    /** Confere a assinatura. Devolve sem valor: quem emite a sessão master é o AuthService. */
    public async verificarLogin(challengeToken: unknown, resposta: unknown): Promise<void> {
        const passe = lerPasse(challengeToken, 'master-login');
        const { rpId, origem } = painel();
        const credencialId = (resposta as { id?: unknown } | null)?.id;
        if (typeof credencialId !== 'string' || !credencialId) throw new Error('PASSKEY_INVALIDA');
        queimarPasse(passe);

        const rows = await db
            .select()
            .from(masterPasskeys)
            .where(and(eq(masterPasskeys.credentialId, credencialId), isNull(masterPasskeys.revogadaEm)))
            .limit(1);
        const p = rows[0] as Linha | undefined;
        if (!p) throw new Error('PASSKEY_INVALIDA');

        let conferido;
        try {
            conferido = await verifyAuthenticationResponse({
                response: resposta as Parameters<typeof verifyAuthenticationResponse>[0]['response'],
                expectedChallenge: passe.ch,
                expectedOrigin: origem,
                expectedRPID: rpId,
                requireUserVerification: true,
                credential: {
                    id: p.credentialId,
                    publicKey: new Uint8Array(Buffer.from(p.publicKey, 'base64url')),
                    counter: p.counter,
                },
            });
        } catch (e) {
            console.warn(`[MasterPasskeyService] login recusado (passkey ${p.id}):`, (e as Error).message);
            throw new Error('PASSKEY_INVALIDA');
        }
        if (!conferido.verified) throw new Error('PASSKEY_INVALIDA');

        await db
            .update(masterPasskeys)
            .set({ counter: conferido.authenticationInfo.newCounter, ultimoUso: new Date() })
            .where(eq(masterPasskeys.id, p.id));
        console.warn(`[MasterPasskeyService] master entrou pela digital #${p.id} (${p.nome})`);
    }
}

export const masterPasskeyService = new MasterPasskeyService();
