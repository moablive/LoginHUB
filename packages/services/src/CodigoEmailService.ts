import crypto from 'crypto';
import { db } from '@loginhub/database';
import { aplicativos, usuarios, loginCodigosEmail } from '@loginhub/schema';
import type { CodigoEmailIniciado } from '@loginhub/schema';
import { and, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { emailService } from './EmailService';
import { buildCodigoLoginEmail } from './templates/codigoLoginEmail';
import { ehContaDeCpf } from './AparelhoService';

// ==========================================
// LOGIN POR CÓDIGO DE E-MAIL (db/024_login_codigo_email.sql)
// ==========================================
//
// Primeiro fator sem app de terceiros: a pessoa informa o e-mail, recebe 6
// dígitos e digita. Este serviço só prova que ela LÊ aquela caixa; o que vem
// depois (aparelho, 2FA se estiver ativo, sessão) é do `AuthService`, o mesmo
// caminho do login por senha.
//
// Regras (todas por causa de e-mail ser um fator fraco: quem entra na caixa
// entra na conta, por isso o TOTP, quando ativo, continua valendo depois):
//   - código de CSPRNG, 6 dígitos, guardado só como HMAC (vazar o banco não
//     revela código ativo);
//   - 5 min de validade, 5 tentativas, uso único (o consumo é atômico);
//   - 1 pedido por minuto e 5 por hora por e-mail — o excedente é ignorado em
//     silêncio, com a MESMA resposta, para não virar bomba de e-mail nem
//     detector de conta;
//   - e-mail que não tem conta recebe a mesma resposta (e o mesmo tempo, o
//     envio é sempre em segundo plano), mas nada é gravado nem enviado.

/** Validade do código. */
export const CODIGO_TTL_SEGUNDOS = 300;
/** Intervalo mínimo entre dois pedidos do mesmo e-mail. */
export const CODIGO_REENVIO_SEGUNDOS = 60;
const MAX_POR_HORA = 5;
const MAX_TENTATIVAS = 5;

/** Chave derivada, para não pedir uma variável nova ao .env e não reusar o JWT_SECRET cru. */
const chave = (): Buffer => {
    const segredo = process.env.JWT_SECRET;
    if (!segredo) throw new Error('ERRO_INTERNO');
    return crypto.createHmac('sha256', segredo).update('login-codigo-email-v1').digest();
};

const hmac = (texto: string): string => crypto.createHmac('sha256', chave()).update(texto).digest('hex');

const normalizarEmail = (email: string): string => email.trim().toLowerCase();
const hashDoEmail = (email: string): string => hmac(`email:${normalizarEmail(email)}`);
const hashDoCodigo = (id: string, codigo: string): string => hmac(`codigo:${id}:${codigo}`);

const iguais = (a: string, b: string): boolean => {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Conta que PODE entrar por código: ativa, num app ativo que usa o login do hub e com e-mail de verdade (não CPF). */
interface ContaElegivel {
    id: number;
    nome: string;
    email: string;
    appId: number | null;
    appNome: string;
    appLogo: string | null;
}

export class CodigoEmailService {
    private async contasDoEmail(email: string, appId?: number): Promise<ContaElegivel[]> {
        if (ehContaDeCpf(email)) return [];
        const base = and(eq(usuarios.email, normalizarEmail(email)), eq(usuarios.status, 'ativo'), eq(aplicativos.status, 'ativo'));
        const linhas = await db.select({
            id: usuarios.id,
            nome: usuarios.nome,
            email: usuarios.email,
            appId: usuarios.appId,
            appNome: aplicativos.nome,
            appLogo: aplicativos.logo,
            usaLoginHub: aplicativos.usaLoginHub,
        })
            .from(usuarios)
            .innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
            .where(appId ? and(base, eq(usuarios.appId, appId)) : base);
        return linhas.filter((l: { usaLoginHub: boolean | null }) => l.usaLoginHub !== false);
    }

    /**
     * Pede um código. A resposta é SEMPRE a mesma: existindo ou não a conta,
     * barrado ou não pelo limite de reenvio. O envio nunca é aguardado.
     */
    public async iniciar(email: string, ip: string | null, appId?: number): Promise<CodigoEmailIniciado> {
        const resposta: CodigoEmailIniciado = {
            challengeId: crypto.randomUUID(),
            expiresIn: CODIGO_TTL_SEGUNDOS,
            reenvioEm: CODIGO_REENVIO_SEGUNDOS,
        };
        void this.emitir(email, ip, appId, resposta.challengeId).catch((e: Error) =>
            console.error('[CodigoEmail] falha ao emitir código:', e.message));
        return resposta;
    }

    private async emitir(email: string, ip: string | null, appId: number | undefined, challengeId: string): Promise<void> {
        const contas = await this.contasDoEmail(email, appId);
        if (contas.length === 0) return;

        const emailHash = hashDoEmail(email);
        const agora = Date.now();

        // Limites por e-mail: 1/min e 5/h. Passou, ignora sem avisar o cliente.
        const recentes = await db.select({ criadoEm: loginCodigosEmail.criadoEm })
            .from(loginCodigosEmail)
            .where(and(eq(loginCodigosEmail.emailHash, emailHash), gt(loginCodigosEmail.criadoEm, new Date(agora - 3600_000))));
        if (recentes.length >= MAX_POR_HORA) return;
        if (recentes.some((r: { criadoEm: Date | null }) => r.criadoEm && agora - r.criadoEm.getTime() < CODIGO_REENVIO_SEGUNDOS * 1000)) return;

        const codigo = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
        // Um e-mail em um único app já amarra a conta; em vários, a escolha vem na conferência.
        const unica = contas.length === 1 ? contas[0] : undefined;

        await db.transaction(async (tx: any) => {
            // O código novo substitui o anterior: só um desafio vivo por e-mail.
            await tx.update(loginCodigosEmail)
                .set({ consumidoEm: new Date() })
                .where(and(eq(loginCodigosEmail.emailHash, emailHash), isNull(loginCodigosEmail.consumidoEm)));
            await tx.insert(loginCodigosEmail).values({
                id: challengeId,
                emailHash,
                usuarioIds: contas.map((c) => c.id),
                codigoHash: hashDoCodigo(challengeId, codigo),
                maxTentativas: MAX_TENTATIVAS,
                expiraEm: new Date(agora + CODIGO_TTL_SEGUNDOS * 1000),
                ipHash: ip ? hmac(`ip:${ip}`) : null,
            });
        });

        const dest = unica ?? contas[0]!;
        // Ambíguo: o e-mail não diz de qual app é; usa o nome do hub, sem logo.
        const html = buildCodigoLoginEmail({
            appName: unica ? unica.appNome : 'LoginHub',
            appLogo: unica?.appLogo ?? null,
            nome: unica ? dest.nome : null,
            codigo,
            minutos: CODIGO_TTL_SEGUNDOS / 60,
        });
        const enviado = await emailService.sendEmail(
            dest.email,
            'Seu código de acesso',
            html,
            unica ? { appId: unica.appId, appNome: unica.appNome } : undefined,
        );
        if (!enviado) console.error(`[CodigoEmail] e-mail do código não saiu (challenge ${challengeId}).`);
    }

    /**
     * Confere o código. Lança `CODIGO_INVALIDO` para QUALQUER falha (desafio
     * desconhecido, vencido, usado, esgotado ou código errado) e `AMBIGUOUS_EMAIL`
     * quando o código está certo mas o e-mail existe em mais de um app e nenhum
     * foi escolhido — nesse caso o código NÃO é consumido.
     */
    public async verificar(challengeId: string, codigo: string, appId?: number): Promise<{ usuarioId: number; resolvido: ContaElegivel }> {
        if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(codigo)) throw new Error('CODIGO_INVALIDO');

        // Gasta a tentativa ANTES de comparar, atomicamente: duas requisições em
        // paralelo não ganham tentativas extras, e o desafio esgotado nem volta linha.
        const [linha] = await db.update(loginCodigosEmail)
            .set({ tentativas: sql`${loginCodigosEmail.tentativas} + 1` })
            .where(and(
                eq(loginCodigosEmail.id, challengeId),
                isNull(loginCodigosEmail.consumidoEm),
                gt(loginCodigosEmail.expiraEm, new Date()),
                lt(loginCodigosEmail.tentativas, loginCodigosEmail.maxTentativas),
            ))
            .returning();
        if (!linha) throw new Error('CODIGO_INVALIDO');

        if (!iguais(hashDoCodigo(linha.id, codigo), linha.codigoHash)) throw new Error('CODIGO_INVALIDO');

        // Escolhe a conta entre as candidatas do desafio (o e-mail em claro não fica no banco).
        const candidatas = await this.contasPorIds(linha.usuarioIds, appId);
        if (candidatas.length > 1) {
            const ambig = new Error('AMBIGUOUS_EMAIL') as Error & { availableApps?: Array<{ id: string; nome: string; logo: string | null }> };
            ambig.availableApps = candidatas.map((c) => ({ id: String(c.appId ?? 0), nome: c.appNome, logo: c.appLogo }));
            throw ambig;
        }
        const conta = candidatas[0];
        if (!conta) throw new Error('CODIGO_INVALIDO');

        // Uso único: quem consumir primeiro leva; a segunda requisição não devolve linha.
        const consumidas = await db.update(loginCodigosEmail)
            .set({ consumidoEm: new Date() })
            .where(and(eq(loginCodigosEmail.id, challengeId), isNull(loginCodigosEmail.consumidoEm)))
            .returning({ id: loginCodigosEmail.id });
        if (consumidas.length === 0) throw new Error('CODIGO_INVALIDO');

        return { usuarioId: conta.id, resolvido: conta };
    }

    /** Contas candidatas do desafio, reconferidas agora (podem ter sido bloqueadas desde o pedido). */
    private async contasPorIds(ids: number[], appId?: number): Promise<ContaElegivel[]> {
        if (ids.length === 0) return [];
        const base = and(inArray(usuarios.id, ids), eq(usuarios.status, 'ativo'), eq(aplicativos.status, 'ativo'));
        const linhas = await db.select({
            id: usuarios.id, nome: usuarios.nome, email: usuarios.email, appId: usuarios.appId,
            appNome: aplicativos.nome, appLogo: aplicativos.logo, usaLoginHub: aplicativos.usaLoginHub,
        })
            .from(usuarios).innerJoin(aplicativos, eq(usuarios.appId, aplicativos.id))
            .where(appId ? and(base, eq(usuarios.appId, appId)) : base);
        return linhas.filter((l: { usaLoginHub: boolean | null }) => l.usaLoginHub !== false);
    }

    /** Limpeza dos desafios vencidos há mais de 1 dia (chamada de vez em quando pelo servidor). */
    public async expurgar(): Promise<void> {
        await db.delete(loginCodigosEmail).where(lt(loginCodigosEmail.expiraEm, new Date(Date.now() - 86_400_000)));
    }
}

export const codigoEmailService = new CodigoEmailService();
