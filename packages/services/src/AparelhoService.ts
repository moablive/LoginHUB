import { db } from '@loginhub/database';
import { usuarios, usuarios2fa, usuariosAparelho, loginAparelhos, AparelhoDoLogin, AparelhosDoApp, LoginAparelhoEvento, TipoAparelho } from '@loginhub/schema';
import { and, eq, ne, desc, lt, or, sql } from 'drizzle-orm';

/**
 * Aparelhos de uma conta de CPF (pedido do dono da Sul Alimentos).
 *
 * 04/11/2026: um aparelho por CPF. 05/11/2026: DUAS vagas — um **celular** e
 * um **computador** — e o computador pode ser compartilhado (vários CPFs
 * revezando o mesmo PC, um de cada vez, cada um com o próprio 2FA).
 *
 *   - O app manda em todo login um id de aparelho (gerado e guardado no
 *     navegador) e um nome legível. A VAGA (celular/computador) quem decide é
 *     o hub, pelo navegador que fez o pedido (`tipoDe`), não pelo nome.
 *   - Prende só no login COMPLETO (depois do 2FA). Prender na senha deixaria
 *     quem sabe só o CPF tomar a vaga do dono e trancá-lo fora.
 *   - Vaga ocupada por outro aparelho do mesmo tipo → recusa.
 *   - Solta: logout NAQUELE aparelho; "Liberar" do app (por vaga); outro CPF
 *     concluindo o login no mesmo navegador (a sessão do anterior já foi
 *     substituída ali); computador parado há mais de 12 h (a vaga vale como
 *     livre no próximo login de outro computador).
 *   - Soltar uma vaga não derruba a outra: a revogação é por aparelho — o
 *     `/auth/session-floor` responde "revogado" para o token cujo aparelho não
 *     está mais preso (`vinculoExiste`).
 *   - Só conta de CPF (11 dígitos no lugar do e-mail). E-mail não é preso,
 *     mas o login entra no registro.
 *
 * Tudo vai para `login_aparelhos` (entrou/recusado/saiu/liberado, com nome, vaga e IP).
 */

// Mínimo 16: o app gera UUID (36) ou 32 hex; id curto adivinhável não vale (parecer do Conselho).
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Computador sem uso por este tempo: a vaga fica livre para outro computador. */
export const COMPUTADOR_EXPIRA_HORAS = 12;
const COMPUTADOR_EXPIRA_MS = COMPUTADOR_EXPIRA_HORAS * 60 * 60 * 1000;

/**
 * LGPD (parecer do Conselho, 04/11/2026): o registro tem nome do aparelho e IP
 * — dado pessoal com finalidade de segurança, guardado só enquanto serve a ela.
 * 6 meses; o expurgo roda junto com as gravações, no máximo uma vez por hora.
 */
const RETENCAO_DIAS = 180;
let ultimoExpurgo = 0;

export const ehContaDeCpf = (email: string | null | undefined): boolean => /^\d{11}$/.test(String(email ?? ''));

const NOME_VAGA: Record<TipoAparelho, string> = { celular: 'celular', computador: 'computador' };

type Vinculo = typeof usuariosAparelho.$inferSelect;
type Conta = { id: number; email: string; app_id: number | null };

export class AparelhoService {
    /**
     * Celular ou computador, pelo navegador que fez o login. `Sec-CH-UA-Mobile`
     * (Chrome, Edge, Samsung) vale primeiro; sem ele, o User-Agent. A casca do
     * Rastreador conta como celular. Sem informação nenhuma: celular (a vaga
     * mais estrita — ninguém ganha um "computador" de graça).
     */
    tipoDe(userAgent: string | undefined, mobile: string | undefined, nome?: unknown): TipoAparelho {
        if (mobile === '?1') return 'celular';
        // O iPadOS se anuncia como Mac e não manda Sec-CH-UA-Mobile; o app
        // reconhece pelo toque e põe "iPad" no nome. O nome só pode PUXAR para
        // celular (a vaga mais estrita), nunca dar um "computador".
        if (typeof nome === 'string' && /^(iPad|iPhone|Android)\b/.test(nome)) return 'celular';
        const ua = userAgent ?? '';
        if (/SulRastreadorApp\/|Android|iPhone|iPad|iPod|Mobi/i.test(ua)) return 'celular';
        if (mobile === '?0') return 'computador';
        return /Windows|Macintosh|Mac OS X|CrOS|Linux|X11/.test(ua) ? 'computador' : 'celular';
    }

    /** Limpa o que veio do cliente: id fora do formato vira nulo (= aparelho desconhecido). */
    normalizar(id: unknown, nome: unknown, ip: string | null, tipo: TipoAparelho): AparelhoDoLogin {
        const i = typeof id === 'string' && ID_RE.test(id.trim()) ? id.trim() : null;
        const n = typeof nome === 'string' ? nome.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 255) || null : null;
        return { id: i, nome: n, ip: ip ? ip.slice(0, 64) : null, tipo };
    }

    /** Vaga de computador parada há mais de 12 h. Celular não expira. */
    expirado(v: Pick<Vinculo, 'tipo' | 'ultimoAcesso'>): boolean {
        return v.tipo === 'computador' && Date.now() - v.ultimoAcesso.getTime() > COMPUTADOR_EXPIRA_MS;
    }

    async preso(usuarioId: number, tipo: TipoAparelho): Promise<Vinculo | null> {
        const [linha] = await db.select().from(usuariosAparelho)
            .where(and(eq(usuariosAparelho.usuarioId, usuarioId), eq(usuariosAparelho.tipo, tipo))).limit(1);
        return linha ?? null;
    }

    /** O token deste aparelho ainda tem vaga? (revogação por aparelho, ver `pisoDeSessao`). */
    async vinculoExiste(usuarioId: number, aparelhoId: string): Promise<boolean> {
        const [linha] = await db.select({ u: usuariosAparelho.usuarioId }).from(usuariosAparelho)
            .where(and(eq(usuariosAparelho.usuarioId, usuarioId), eq(usuariosAparelho.aparelhoId, aparelhoId))).limit(1);
        return !!linha;
    }

    async registrar(e: {
        appId: number; usuarioId: number | null; conta: string | null; evento: LoginAparelhoEvento;
        aparelho?: AparelhoDoLogin; detalhe?: string | null;
    }): Promise<void> {
        await db.insert(loginAparelhos).values({
            appId: e.appId,
            usuarioId: e.usuarioId,
            // LGPD (minimização): com usuário conhecido o CPF não se repete aqui —
            // a listagem lê de `usuarios`. Só fica a conta digitada sem usuário.
            conta: e.usuarioId === null && e.conta ? e.conta.slice(0, 255) : null,
            evento: e.evento,
            aparelhoId: e.aparelho?.id ?? null,
            aparelhoNome: e.aparelho?.nome ?? null,
            tipo: e.aparelho?.tipo ?? null,
            ip: e.aparelho?.ip ?? null,
            detalhe: e.detalhe ? e.detalhe.slice(0, 255) : null,
        }).catch((err: Error) => console.error('[aparelho] falha ao registrar:', err.message));
        // Expurgo fora do caminho do login: dispara e não espera.
        if (Date.now() - ultimoExpurgo > 60 * 60 * 1000) {
            ultimoExpurgo = Date.now();
            const corte = new Date(Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000);
            void db.delete(loginAparelhos).where(lt(loginAparelhos.criadoEm, corte))
                .catch((err: Error) => console.error('[aparelho] falha no expurgo:', err.message));
        }
    }

    private async recusar(conta: Conta, aparelho: AparelhoDoLogin, p: Vinculo | null): Promise<never> {
        const appId = conta.app_id ?? 0;
        const onde = p?.aparelhoNome ?? `outro ${NOME_VAGA[aparelho.tipo]}`;
        // Awaited: a recusa é rara e precisa ficar gravada (parecer do Conselho).
        await this.registrar({ appId, usuarioId: conta.id, conta: conta.email, evento: 'recusado', aparelho, detalhe: `vaga de ${NOME_VAGA[aparelho.tipo]} ocupada: ${onde}` });
        const erro = new Error('APARELHO_EM_USO') as Error & { aparelhoNome?: string | null; tipo?: TipoAparelho };
        erro.aparelhoNome = p?.aparelhoNome ?? null;
        erro.tipo = aparelho.tipo;
        throw erro;
    }

    /**
     * Pode este aparelho entrar nesta conta? Lança `APARELHO_EM_USO` (com o nome
     * do aparelho que ocupa a vaga) ou `APARELHO_DESCONHECIDO` (app velho, sem
     * id) e registra a recusa. Conta de e-mail passa sempre.
     */
    async conferir(user: Conta, aparelho: AparelhoDoLogin): Promise<void> {
        if (!ehContaDeCpf(user.email)) return;
        const appId = user.app_id ?? 0;
        if (!aparelho.id) {
            await this.registrar({ appId, usuarioId: user.id, conta: user.email, evento: 'recusado', aparelho, detalhe: 'app sem id de aparelho' });
            throw new Error('APARELHO_DESCONHECIDO');
        }
        const p = await this.preso(user.id, aparelho.tipo);
        if (p && p.aparelhoId !== aparelho.id && !this.expirado(p)) await this.recusar(user, aparelho, p);
    }

    /**
     * Login completo: ocupa a vaga (ou renova a do mesmo aparelho) e registra.
     * Devolve o id a pôr no token (`apa`), ou undefined para conta de e-mail.
     */
    async prender(user: Conta, aparelho: AparelhoDoLogin): Promise<string | undefined> {
        const appId = user.app_id ?? 0;
        if (!ehContaDeCpf(user.email)) {
            // Conta de e-mail não fica presa, mas o login entra no registro
            // (04/11/2026, pedido do dono): o painel mostra onde TODO membro
            // está autenticado. Sem await: o registro não segura o login.
            void this.registrar({ appId, usuarioId: user.id, conta: user.email, evento: 'entrou', aparelho, detalhe: 'conta de e-mail (não fica presa)' });
            // O navegador agora é desta conta: CPF que estava preso a ele sai.
            await this.soltarOutrosNoMesmoAparelho(user.id, appId, aparelho);
            return undefined;
        }
        if (!aparelho.id) return undefined;
        const agora = new Date();
        const anterior = await this.preso(user.id, aparelho.tipo);
        // ON CONFLICT só sobrescreve a vaga do MESMO aparelho — ou a de um
        // computador parado há mais de 12 h. Quem decide é o próprio insert
        // (parecer do Conselho de 04/11): RETURNING vazio ⟺ vaga de outro
        // aparelho ⟹ recusa, sem janela entre gravar e conferir.
        const corte = new Date(agora.getTime() - COMPUTADOR_EXPIRA_MS);
        const gravou = await db.insert(usuariosAparelho).values({
            usuarioId: user.id, tipo: aparelho.tipo, appId, aparelhoId: aparelho.id, aparelhoNome: aparelho.nome, ip: aparelho.ip, desde: agora, ultimoAcesso: agora,
        }).onConflictDoUpdate({
            target: [usuariosAparelho.usuarioId, usuariosAparelho.tipo],
            set: {
                appId, aparelhoId: aparelho.id, aparelhoNome: aparelho.nome, ip: aparelho.ip, ultimoAcesso: agora,
                // Mesmo aparelho: guarda o "desde"; vaga tomada de um computador expirado: começa agora.
                desde: sql`CASE WHEN ${usuariosAparelho.aparelhoId} = excluded.aparelho_id THEN ${usuariosAparelho.desde} ELSE excluded.desde END`,
            },
            setWhere: aparelho.tipo === 'computador'
                ? or(eq(usuariosAparelho.aparelhoId, aparelho.id), lt(usuariosAparelho.ultimoAcesso, corte))
                : eq(usuariosAparelho.aparelhoId, aparelho.id),
        }).returning({ aparelhoId: usuariosAparelho.aparelhoId });
        if (!gravou.length) await this.recusar(user, aparelho, await this.preso(user.id, aparelho.tipo));

        if (anterior && anterior.aparelhoId !== aparelho.id) {
            void this.registrar({
                appId, usuarioId: user.id, conta: user.email, evento: 'saiu',
                aparelho: { id: anterior.aparelhoId, nome: anterior.aparelhoNome, ip: anterior.ip, tipo: aparelho.tipo },
                detalhe: `${NOME_VAGA[aparelho.tipo]} parado há mais de ${COMPUTADOR_EXPIRA_HORAS} h — vaga passou para ${aparelho.nome ?? 'outro aparelho'}`,
            });
        }
        // Mesmo aparelho preso na OUTRA vaga desta conta (ex.: vínculo antigo
        // classificado pelo nome na migração 008): sai, senão o aparelho ocupa
        // as duas vagas e o celular de verdade é recusado.
        await db.delete(usuariosAparelho).where(and(
            eq(usuariosAparelho.usuarioId, user.id),
            eq(usuariosAparelho.aparelhoId, aparelho.id),
            ne(usuariosAparelho.tipo, aparelho.tipo),
        ));
        await this.registrar({ appId, usuarioId: user.id, conta: user.email, evento: 'entrou', aparelho });
        await this.soltarOutrosNoMesmoAparelho(user.id, appId, aparelho);
        return aparelho.id;
    }

    /**
     * Aparelho compartilhado (05/11/2026): o PC do escritório é usado por vários
     * CPFs, um de cada vez. O app guarda UMA sessão por navegador, então quem
     * conclui o login aqui substituiu a sessão de quem estava antes. A vaga do
     * anterior neste mesmo aparelho é solta, para ele não ficar preso a um PC
     * onde já não está logado. O token dele deste aparelho para de valer pela
     * revogação por aparelho (`vinculoExiste`).
     *
     * Só no MESMO app e na MESMA vaga (parecer do Conselho): o id do aparelho
     * vem do cliente, então ele não pode soltar conta de outro app nem a vaga
     * de celular de ninguém a partir de um login de computador.
     */
    private async soltarOutrosNoMesmoAparelho(usuarioId: number, appId: number, aparelho: AparelhoDoLogin): Promise<void> {
        if (!aparelho.id) return;
        const soltos = await db.delete(usuariosAparelho)
            .where(and(
                eq(usuariosAparelho.aparelhoId, aparelho.id),
                eq(usuariosAparelho.appId, appId),
                eq(usuariosAparelho.tipo, aparelho.tipo),
                ne(usuariosAparelho.usuarioId, usuarioId),
            ))
            .returning();
        for (const v of soltos as Vinculo[]) {
            void this.registrar({
                appId: v.appId, usuarioId: v.usuarioId, conta: null, evento: 'saiu',
                aparelho: { id: v.aparelhoId, nome: v.aparelhoNome, ip: v.ip, tipo: v.tipo as TipoAparelho },
                detalhe: 'outro CPF entrou neste aparelho',
            });
        }
    }

    /**
     * Refresh: a sessão de CPF só renova se o aparelho do token ainda tiver vaga.
     *
     * Token SEM `apa` (emitido antes de 04/11/2026, ou pela conclusão do
     * enrolamento/reset de senha) renova enquanto a conta não tiver NENHUMA
     * vaga ocupada — transição, para ninguém cair no dia da mudança.
     */
    async sessaoValida(user: { id: number; email: string }, apa: string | undefined, ip: string | null): Promise<boolean> {
        if (!ehContaDeCpf(user.email)) return true;
        if (!apa) {
            const [algum] = await db.select({ u: usuariosAparelho.usuarioId }).from(usuariosAparelho).where(eq(usuariosAparelho.usuarioId, user.id)).limit(1);
            return !algum;
        }
        const tocou = await db.update(usuariosAparelho)
            .set({ ultimoAcesso: new Date(), ...(ip ? { ip } : {}) })
            .where(and(eq(usuariosAparelho.usuarioId, user.id), eq(usuariosAparelho.aparelhoId, apa)))
            .returning({ u: usuariosAparelho.usuarioId });
        return tocou.length > 0;
    }

    /**
     * Piso de sessão da conta inteira — só quando a conta fica SEM vaga
     * nenhuma (Liberar tudo): derruba também os tokens sem `apa` da transição.
     * Soltar uma vaga só não usa isto: derrubaria o outro aparelho junto.
     */
    private async derrubarSessoes(usuarioId: number): Promise<void> {
        await db.update(usuarios2fa).set({ sessoesValidasDesde: new Date() }).where(eq(usuarios2fa.usuarioId, usuarioId));
    }

    /** Logout feito num aparelho preso: solta só a vaga dele. */
    async sair(usuarioId: number, apa: string, ip: string | null): Promise<void> {
        const soltos = await db.delete(usuariosAparelho)
            .where(and(eq(usuariosAparelho.usuarioId, usuarioId), eq(usuariosAparelho.aparelhoId, apa)))
            .returning();
        if (!soltos.length) return;
        // Era a última vaga: carimba o piso da conta, para o token sem `apa` da
        // transição não voltar a renovar (parecer do Conselho). Com a outra vaga
        // ainda ocupada, não — derrubaria o outro aparelho.
        const [resta] = await db.select({ u: usuariosAparelho.usuarioId }).from(usuariosAparelho).where(eq(usuariosAparelho.usuarioId, usuarioId)).limit(1);
        if (!resta) await this.derrubarSessoes(usuarioId);
        for (const v of soltos as Vinculo[]) {
            await this.registrar({ appId: v.appId, usuarioId, conta: null, evento: 'saiu', aparelho: { id: apa, nome: v.aparelhoNome, ip, tipo: v.tipo as TipoAparelho } });
        }
    }

    /**
     * Botão "Liberar" do app, por vaga (`tipo`) ou as duas (sem `tipo`).
     * `appId` amarra: um app não solta conta de outro.
     */
    async liberar(usuarioId: number, appId: number, por: string, tipo?: TipoAparelho): Promise<void> {
        const soltos = await db.delete(usuariosAparelho)
            .where(and(
                eq(usuariosAparelho.usuarioId, usuarioId),
                eq(usuariosAparelho.appId, appId),
                ...(tipo ? [eq(usuariosAparelho.tipo, tipo)] : []),
            ))
            .returning();
        if (!soltos.length) throw new Error('APARELHO_NAO_ENCONTRADO');
        const [resta] = await db.select({ u: usuariosAparelho.usuarioId }).from(usuariosAparelho).where(eq(usuariosAparelho.usuarioId, usuarioId)).limit(1);
        if (!resta) await this.derrubarSessoes(usuarioId);
        for (const v of soltos as Vinculo[]) {
            await this.registrar({
                appId, usuarioId, conta: null, evento: 'liberado',
                aparelho: { id: v.aparelhoId, nome: v.aparelhoNome, ip: v.ip, tipo: v.tipo as TipoAparelho }, detalhe: `liberado por ${por}`,
            });
        }
    }

    /** `usuarioId`: só o registro dessa pessoa (ficha de acesso do painel), sem o corte dos outros. */
    async listar(appId: number, limite = 200, usuarioId?: number): Promise<AparelhosDoApp> {
        const presos = await db.select({
            usuarioId: usuariosAparelho.usuarioId, nome: usuarios.nome, conta: usuarios.email, tipo: usuariosAparelho.tipo,
            aparelhoNome: usuariosAparelho.aparelhoNome, ip: usuariosAparelho.ip,
            desde: usuariosAparelho.desde, ultimoAcesso: usuariosAparelho.ultimoAcesso,
        }).from(usuariosAparelho)
          .innerJoin(usuarios, eq(usuarios.id, usuariosAparelho.usuarioId))
          .where(usuarioId ? and(eq(usuariosAparelho.appId, appId), eq(usuariosAparelho.usuarioId, usuarioId)) : eq(usuariosAparelho.appId, appId))
          .orderBy(usuarios.nome, usuariosAparelho.tipo);

        const registro = await db.select({
            id: loginAparelhos.id, usuarioId: loginAparelhos.usuarioId, nome: usuarios.nome, conta: sql<string | null>`coalesce(${usuarios.email}, ${loginAparelhos.conta})`,
            evento: loginAparelhos.evento, tipo: loginAparelhos.tipo, aparelhoNome: loginAparelhos.aparelhoNome, ip: loginAparelhos.ip,
            detalhe: loginAparelhos.detalhe, criadoEm: loginAparelhos.criadoEm,
        }).from(loginAparelhos)
          .leftJoin(usuarios, eq(usuarios.id, loginAparelhos.usuarioId))
          .where(usuarioId ? and(eq(loginAparelhos.appId, appId), eq(loginAparelhos.usuarioId, usuarioId)) : eq(loginAparelhos.appId, appId))
          .orderBy(desc(loginAparelhos.criadoEm))
          .limit(limite);

        return {
            presos: presos.map((p: typeof presos[number]) => ({
                ...p, tipo: p.tipo as TipoAparelho, desde: p.desde.toISOString(), ultimoAcesso: p.ultimoAcesso.toISOString(),
                expirado: this.expirado({ tipo: p.tipo, ultimoAcesso: p.ultimoAcesso }),
            })),
            registro: registro.map((r: typeof registro[number]) => ({
                ...r, evento: r.evento as LoginAparelhoEvento, tipo: (r.tipo as TipoAparelho | null) ?? null, criadoEm: r.criadoEm.toISOString(),
            })),
        };
    }
}

export const aparelhoService = new AparelhoService();
