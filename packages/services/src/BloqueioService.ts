import jwt from 'jsonwebtoken';
import { db } from '@loginhub/database';
import { loginBloqueios, usuarios, LoginBloqueio, LoginBloqueioTipo } from '@loginhub/schema';
import { and, eq, isNull, desc, sql } from 'drizzle-orm';

/**
 * Lista negra do login (28/10/2026).
 *
 * Nasceu do app da Sul Alimentos: o motorista entra com o CPF como login, e
 * um CPF é mais fácil de adivinhar que um e-mail — com o segundo fator
 * protegendo a sessão, o que sobrava era alguém varrer senhas à vontade. O
 * `rateLimitLogin` (10 por conta a cada 15 min) só adia; isto aqui PARA:
 *
 *   - 5 falhas vindas do mesmo IP  → o IP fica bloqueado naquele app
 *   - 10 falhas na mesma conta/1 h → a conta fica bloqueada naquele app
 *
 * Falha é senha errada OU código 2FA errado — as duas somam no mesmo balde.
 * O bloqueio NÃO expira sozinho: sai só pelo botão "Liberar" do app
 * (`POST /admin/bloqueios/:id/liberar`), que é como o escritório resolve o
 * funcionário que errou a própria senha. A contagem (sem bloqueio) zera no
 * acerto e depois de 1 h parada — dedo errado de vez em quando não acumula
 * para sempre.
 *
 * É por APP, nunca global: a mesma pessoa pode ter conta em dois apps e o
 * bloqueio de um não vaza para o outro; e o app só vê a lista dele.
 *
 * Quando um bloqueio nasce, o hub avisa o app dono por webhook (ver
 * `avisarApp`): é o app quem fala com a equipe (Telegram da Sul, sininho).
 */

export const LIMITE_POR_IP = 5;
export const LIMITE_POR_CONTA = 10;
export const JANELA_MS = 60 * 60 * 1000;

export type OrigemFalha = 'senha' | '2fa';

const normalizarConta = (email: string | undefined | null): string | null => {
    const v = String(email ?? '').trim().toLowerCase();
    return v ? v.slice(0, 255) : null;
};

const limiteDe = (tipo: LoginBloqueioTipo): number => (tipo === 'ip' ? LIMITE_POR_IP : LIMITE_POR_CONTA);

const serializar = (l: typeof loginBloqueios.$inferSelect): LoginBloqueio => ({
    id: l.id,
    appId: l.appId,
    tipo: l.tipo as LoginBloqueioTipo,
    alvo: l.alvo,
    detalhe: l.detalhe ?? null,
    origem: (l.origem as OrigemFalha) ?? 'senha',
    tentativas: l.tentativas,
    janelaInicio: l.janelaInicio.toISOString(),
    ultimaTentativa: l.ultimaTentativa.toISOString(),
    bloqueadoEm: l.bloqueadoEm ? l.bloqueadoEm.toISOString() : null,
    liberadoEm: l.liberadoEm ? l.liberadoEm.toISOString() : null,
    liberadoPor: l.liberadoPor ?? null,
});

/**
 * Webhooks por app: `LOGIN_BLOQUEIO_WEBHOOKS="2=https://api.sulalimentos.com/api/seguranca/aviso-bloqueio;3=https://..."`.
 * A chave `LOGIN_BLOQUEIO_WEBHOOK_KEY` vai em `x-api-key` — é a mesma que o
 * app confere do lado dele. Sem a variável, ninguém é avisado (e o bloqueio
 * continua valendo; o app ainda vê a lista pelo `/admin/apps/:id/bloqueios`).
 */
const webhookDoApp = (appId: number): string | null => {
    const lista = process.env.LOGIN_BLOQUEIO_WEBHOOKS ?? '';
    for (const par of lista.split(';')) {
        const [id, ...resto] = par.split('=');
        const url = resto.join('=').trim();
        if (id && Number(id.trim()) === appId && url) return url;
    }
    return null;
};

const avisarApp = (bloqueio: LoginBloqueio): void => {
    const url = webhookDoApp(bloqueio.appId);
    const chave = process.env.LOGIN_BLOQUEIO_WEBHOOK_KEY;
    if (!url || !chave) return;
    // Fire-and-forget: o login do atacante já foi recusado; avisar é
    // consequência, e o app fora do ar não pode travar o hub.
    void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': chave },
        body: JSON.stringify(bloqueio),
        signal: AbortSignal.timeout(5000),
    })
        .then((r) => { if (!r.ok) console.error(`[bloqueio] webhook do app ${bloqueio.appId} respondeu ${r.status}.`); })
        .catch((e) => console.error(`[bloqueio] webhook do app ${bloqueio.appId} falhou:`, e?.message ?? e));
};

export class BloqueioService {
    /** Linha aberta (não liberada) de um alvo, bloqueada ou só em contagem. */
    private async aberta(appId: number, tipo: LoginBloqueioTipo, alvo: string) {
        const [linha] = await db.select().from(loginBloqueios)
            .where(and(eq(loginBloqueios.appId, appId), eq(loginBloqueios.tipo, tipo), eq(loginBloqueios.alvo, alvo), isNull(loginBloqueios.liberadoEm)))
            .orderBy(desc(loginBloqueios.id))
            .limit(1);
        return linha ?? null;
    }

    /** O IP ou a conta estão na lista negra deste app? */
    public async estaBloqueado(appId: number, ip: string, email?: string | null): Promise<boolean> {
        const conta = normalizarConta(email);
        const porIp = await this.aberta(appId, 'ip', ip);
        if (porIp?.bloqueadoEm) return true;
        if (conta) {
            const porConta = await this.aberta(appId, 'conta', conta);
            if (porConta?.bloqueadoEm) return true;
        }
        return false;
    }

    /**
     * Soma uma falha no IP e na conta. Devolve os bloqueios que NASCERAM agora
     * (para o controller responder 423 já nesta tentativa).
     */
    public async registrarFalha(appId: number, ip: string, email: string | null | undefined, origem: OrigemFalha): Promise<LoginBloqueio[]> {
        const conta = normalizarConta(email);
        const novos: LoginBloqueio[] = [];
        const alvos: Array<[LoginBloqueioTipo, string, string | null]> = [['ip', ip, conta]];
        if (conta) alvos.push(['conta', conta, ip]);

        for (const [tipo, alvo, detalhe] of alvos) {
            const atual = await this.aberta(appId, tipo, alvo);
            const agora = new Date();
            if (atual?.bloqueadoEm) continue; // já barrado: nada a somar

            if (!atual || agora.getTime() - atual.janelaInicio.getTime() > JANELA_MS) {
                // Janela nova (primeira falha, ou a contagem antiga ficou 1 h parada).
                if (atual) {
                    await db.update(loginBloqueios)
                        .set({ tentativas: 1, janelaInicio: agora, ultimaTentativa: agora, detalhe, origem })
                        .where(eq(loginBloqueios.id, atual.id));
                } else {
                    await db.insert(loginBloqueios).values({ appId, tipo, alvo, detalhe, origem, tentativas: 1, janelaInicio: agora, ultimaTentativa: agora });
                }
                if (limiteDe(tipo) > 1) continue;
            }

            const [linha] = await db.update(loginBloqueios)
                .set({
                    tentativas: sql`${loginBloqueios.tentativas} + 1`,
                    ultimaTentativa: agora,
                    detalhe,
                    origem,
                    bloqueadoEm: sql`CASE WHEN ${loginBloqueios.tentativas} + 1 >= ${limiteDe(tipo)} THEN now() ELSE NULL END`,
                })
                .where(and(eq(loginBloqueios.appId, appId), eq(loginBloqueios.tipo, tipo), eq(loginBloqueios.alvo, alvo), isNull(loginBloqueios.liberadoEm), isNull(loginBloqueios.bloqueadoEm)))
                .returning();
            if (linha?.bloqueadoEm) {
                const b = serializar(linha);
                novos.push(b);
                console.warn(`[bloqueio] app ${appId}: ${tipo} ${alvo} bloqueado após ${linha.tentativas} falhas (${origem}).`);
                avisarApp(b);
            }
        }
        return novos;
    }

    /** Acertou: a contagem do IP e da conta volta a zero (bloqueio de verdade não sai daqui). */
    public async registrarSucesso(appId: number, ip: string, email?: string | null): Promise<void> {
        const conta = normalizarConta(email);
        const alvos: Array<[LoginBloqueioTipo, string]> = [['ip', ip]];
        if (conta) alvos.push(['conta', conta]);
        for (const [tipo, alvo] of alvos) {
            await db.delete(loginBloqueios)
                .where(and(eq(loginBloqueios.appId, appId), eq(loginBloqueios.tipo, tipo), eq(loginBloqueios.alvo, alvo), isNull(loginBloqueios.liberadoEm), isNull(loginBloqueios.bloqueadoEm)));
        }
    }

    /**
     * De quem é o desafio de 2FA: app e conta, para a falha do código somar no
     * mesmo balde da senha. Token ilegível → null (o `verificarSegundoFator`
     * é quem recusa de verdade).
     */
    public async contaDoDesafio(challengeToken: string): Promise<{ appId: number; email: string } | null> {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) return null;
        let sub: string | undefined;
        try {
            const decoded = jwt.verify(challengeToken, jwtSecret, { ignoreExpiration: true }) as { sub?: string };
            sub = decoded.sub;
        } catch {
            return null;
        }
        if (!sub) return null;
        const [u] = await db.select({ appId: usuarios.appId, email: usuarios.email }).from(usuarios).where(eq(usuarios.id, Number(sub))).limit(1);
        return u ? { appId: u.appId ?? 0, email: u.email } : null;
    }

    /** A lista do app: bloqueados primeiro, depois contagens abertas, depois liberados (30 dias). */
    public async listar(appId: number): Promise<LoginBloqueio[]> {
        const linhas = await db.select().from(loginBloqueios)
            .where(and(eq(loginBloqueios.appId, appId), sql`(${loginBloqueios.liberadoEm} IS NULL OR ${loginBloqueios.liberadoEm} > now() - interval '30 days')`))
            .orderBy(desc(loginBloqueios.ultimaTentativa))
            .limit(500);
        const peso = (l: typeof loginBloqueios.$inferSelect) => (l.liberadoEm ? 2 : l.bloqueadoEm ? 0 : 1);
        return linhas.sort((a, b) => peso(a) - peso(b)).map(serializar);
    }

    /** Libera (fecha a linha). O app diz quem liberou; o hub só anota. */
    public async liberar(id: number, appId: number | null, por: string): Promise<LoginBloqueio> {
        const [linha] = await db.update(loginBloqueios)
            .set({ liberadoEm: new Date(), liberadoPor: por.slice(0, 255) })
            .where(and(eq(loginBloqueios.id, id), isNull(loginBloqueios.liberadoEm), ...(appId === null ? [] : [eq(loginBloqueios.appId, appId)])))
            .returning();
        if (!linha) throw new Error('BLOQUEIO_NAO_ENCONTRADO');
        return serializar(linha);
    }
}

export const bloqueioService = new BloqueioService();
