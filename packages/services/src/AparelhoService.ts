import { db } from '@loginhub/database';
import { usuarios, usuarios2fa, usuariosAparelho, loginAparelhos, AparelhoDoLogin, AparelhosDoApp, LoginAparelhoEvento } from '@loginhub/schema';
import { and, eq, desc, lt, sql } from 'drizzle-orm';

/**
 * Um aparelho por conta de CPF (04/11/2026, pedido do dono da Sul Alimentos).
 *
 * O funcionário entra com CPF + CPF + 2FA. Para o mesmo CPF não ficar aberto
 * em dois celulares ao mesmo tempo, o app manda em todo login um id de
 * aparelho (gerado e guardado no navegador) e um nome legível; o hub prende o
 * primeiro aparelho que concluir o login e recusa os outros.
 *
 *   - Prende só no login COMPLETO (depois do 2FA). Prender na senha deixaria
 *     quem sabe só o CPF tomar o lugar do aparelho do dono e trancá-lo fora.
 *   - O IP fica no registro, não na regra: celular troca de IP a toda hora.
 *   - Solta no logout feito NO aparelho preso, ou no "Liberar" do app.
 *   - Só conta de CPF (11 dígitos no lugar do e-mail). E-mail não é preso.
 *
 * Tudo vai para `login_aparelhos` (entrou/recusado/saiu/liberado, com nome e IP).
 */

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * LGPD (parecer do Conselho, 04/11/2026): o registro tem nome do aparelho e IP
 * — dado pessoal com finalidade de segurança, guardado só enquanto serve a ela.
 * 6 meses; o expurgo roda junto com as gravações, no máximo uma vez por hora.
 */
const RETENCAO_DIAS = 180;
let ultimoExpurgo = 0;

export const ehContaDeCpf = (email: string | null | undefined): boolean => /^\d{11}$/.test(String(email ?? ''));

export class AparelhoService {
    /** Limpa o que veio do cliente: id fora do formato vira nulo (= aparelho desconhecido). */
    normalizar(id: unknown, nome: unknown, ip: string | null): AparelhoDoLogin {
        const i = typeof id === 'string' && ID_RE.test(id.trim()) ? id.trim() : null;
        const n = typeof nome === 'string' ? nome.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 255) || null : null;
        return { id: i, nome: n, ip: ip ? ip.slice(0, 64) : null };
    }

    async preso(usuarioId: number) {
        const [linha] = await db.select().from(usuariosAparelho).where(eq(usuariosAparelho.usuarioId, usuarioId)).limit(1);
        return linha ?? null;
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

    /**
     * Pode este aparelho entrar nesta conta? Lança `APARELHO_EM_USO` (com o nome
     * do aparelho preso) ou `APARELHO_DESCONHECIDO` (app velho, sem id) e
     * registra a recusa. Conta de e-mail passa sempre.
     */
    async conferir(user: { id: number; email: string; app_id: number | null }, aparelho: AparelhoDoLogin): Promise<void> {
        if (!ehContaDeCpf(user.email)) return;
        const appId = user.app_id ?? 0;
        if (!aparelho.id) {
            await this.registrar({ appId, usuarioId: user.id, conta: user.email, evento: 'recusado', aparelho, detalhe: 'app sem id de aparelho' });
            throw new Error('APARELHO_DESCONHECIDO');
        }
        const p = await this.preso(user.id);
        if (p && p.aparelhoId !== aparelho.id) {
            await this.registrar({ appId, usuarioId: user.id, conta: user.email, evento: 'recusado', aparelho, detalhe: `já conectado em ${p.aparelhoNome ?? 'outro aparelho'}` });
            const erro = new Error('APARELHO_EM_USO') as Error & { aparelhoNome?: string | null };
            erro.aparelhoNome = p.aparelhoNome;
            throw erro;
        }
    }

    /**
     * Login completo: prende o aparelho (ou renova o que já estava) e registra.
     * Devolve o id a pôr no token (`apa`), ou undefined para conta de e-mail.
     */
    async prender(user: { id: number; email: string; app_id: number | null }, aparelho: AparelhoDoLogin): Promise<string | undefined> {
        if (!ehContaDeCpf(user.email) || !aparelho.id) return undefined;
        const appId = user.app_id ?? 0;
        const agora = new Date();
        // ON CONFLICT só renova o MESMO aparelho. Quem decide é o próprio insert
        // (parecer do Conselho): RETURNING vazio ⟺ a linha é de outro aparelho ⟹
        // recusa — sem segunda ida ao banco, sem janela para um logout no meio.
        const gravou = await db.insert(usuariosAparelho).values({
            usuarioId: user.id, appId, aparelhoId: aparelho.id, aparelhoNome: aparelho.nome, ip: aparelho.ip, desde: agora, ultimoAcesso: agora,
        }).onConflictDoUpdate({
            target: usuariosAparelho.usuarioId,
            set: { aparelhoNome: aparelho.nome, ip: aparelho.ip, ultimoAcesso: agora },
            setWhere: eq(usuariosAparelho.aparelhoId, aparelho.id),
        }).returning({ aparelhoId: usuariosAparelho.aparelhoId });
        if (!gravou.length) {
            const p = await this.preso(user.id);
            await this.registrar({ appId, usuarioId: user.id, conta: user.email, evento: 'recusado', aparelho, detalhe: `já conectado em ${p?.aparelhoNome ?? 'outro aparelho'}` });
            const erro = new Error('APARELHO_EM_USO') as Error & { aparelhoNome?: string | null };
            erro.aparelhoNome = p?.aparelhoNome ?? null;
            throw erro;
        }
        await this.registrar({ appId, usuarioId: user.id, conta: user.email, evento: 'entrou', aparelho });
        return aparelho.id;
    }

    /**
     * Refresh: a sessão de CPF só renova se for do aparelho preso.
     *
     * Token SEM `apa` (emitido antes desta regra, ou pela conclusão do
     * enrolamento/reset de senha) renova enquanto NENHUM aparelho estiver preso
     * — derrubar todo mundo logado no dia da mudança pararia a operação
     * (parecer do Conselho). Assim que um aparelho prende a conta, esse token
     * antigo para de renovar.
     */
    async sessaoValida(user: { id: number; email: string }, apa: string | undefined, ip: string | null): Promise<boolean> {
        if (!ehContaDeCpf(user.email)) return true;
        const p = await this.preso(user.id);
        if (!apa) return !p;
        if (!p || p.aparelhoId !== apa) return false;
        await db.update(usuariosAparelho)
            .set({ ultimoAcesso: new Date(), ...(ip ? { ip } : {}) })
            .where(eq(usuariosAparelho.usuarioId, user.id));
        return true;
    }

    /**
     * Soltar não basta: a sessão do aparelho velho valeria até 24 h e a regra
     * "um aparelho" ficaria violável nessa janela (parecer do Conselho). O piso
     * de sessão (`usuarios_2fa.sessoes_validas_desde`) já é conferido pelo
     * authMiddleware, pelo refresh e pelo `/auth/session-floor` dos apps (cache
     * de 60 s): carimbar agora derruba os tokens emitidos antes.
     */
    private async derrubarSessoes(usuarioId: number): Promise<void> {
        await db.update(usuarios2fa).set({ sessoesValidasDesde: new Date() }).where(eq(usuarios2fa.usuarioId, usuarioId));
    }

    /** Logout feito no aparelho preso: solta a conta para outro aparelho. */
    async sair(usuarioId: number, apa: string, ip: string | null): Promise<void> {
        const p = await this.preso(usuarioId);
        if (!p || p.aparelhoId !== apa) return;
        await db.delete(usuariosAparelho).where(and(eq(usuariosAparelho.usuarioId, usuarioId), eq(usuariosAparelho.aparelhoId, apa)));
        await this.derrubarSessoes(usuarioId);
        const [u] = await db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
        await this.registrar({ appId: p.appId, usuarioId, conta: u?.email ?? null, evento: 'saiu', aparelho: { id: apa, nome: p.aparelhoNome, ip } });
    }

    /** Botão "Liberar" do app. `appId` amarra: um app não solta conta de outro. */
    async liberar(usuarioId: number, appId: number, por: string): Promise<void> {
        const p = await this.preso(usuarioId);
        if (!p || p.appId !== appId) throw new Error('APARELHO_NAO_ENCONTRADO');
        await db.delete(usuariosAparelho).where(eq(usuariosAparelho.usuarioId, usuarioId));
        await this.derrubarSessoes(usuarioId);
        const [u] = await db.select({ email: usuarios.email }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1);
        await this.registrar({
            appId: p.appId, usuarioId, conta: u?.email ?? null, evento: 'liberado',
            aparelho: { id: p.aparelhoId, nome: p.aparelhoNome, ip: p.ip }, detalhe: `liberado por ${por}`,
        });
    }

    async listar(appId: number, limite = 200): Promise<AparelhosDoApp> {
        const presos = await db.select({
            usuarioId: usuariosAparelho.usuarioId, nome: usuarios.nome, conta: usuarios.email,
            aparelhoNome: usuariosAparelho.aparelhoNome, ip: usuariosAparelho.ip,
            desde: usuariosAparelho.desde, ultimoAcesso: usuariosAparelho.ultimoAcesso,
        }).from(usuariosAparelho)
          .innerJoin(usuarios, eq(usuarios.id, usuariosAparelho.usuarioId))
          .where(eq(usuariosAparelho.appId, appId))
          .orderBy(usuarios.nome);

        const registro = await db.select({
            id: loginAparelhos.id, usuarioId: loginAparelhos.usuarioId, nome: usuarios.nome, conta: sql<string | null>`coalesce(${usuarios.email}, ${loginAparelhos.conta})`,
            evento: loginAparelhos.evento, aparelhoNome: loginAparelhos.aparelhoNome, ip: loginAparelhos.ip,
            detalhe: loginAparelhos.detalhe, criadoEm: loginAparelhos.criadoEm,
        }).from(loginAparelhos)
          .leftJoin(usuarios, eq(usuarios.id, loginAparelhos.usuarioId))
          .where(eq(loginAparelhos.appId, appId))
          .orderBy(desc(loginAparelhos.criadoEm))
          .limit(limite);

        return {
            presos: presos.map((p: typeof presos[number]) => ({ ...p, desde: p.desde.toISOString(), ultimoAcesso: p.ultimoAcesso.toISOString() })),
            registro: registro.map((r: typeof registro[number]) => ({ ...r, evento: r.evento as LoginAparelhoEvento, criadoEm: r.criadoEm.toISOString() })),
        };
    }
}

export const aparelhoService = new AparelhoService();
