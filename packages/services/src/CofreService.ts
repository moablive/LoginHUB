import { db } from '@loginhub/database';
import { cofreContas, cofreCofres, cofreItens } from '@loginhub/schema';
import type { CofreConta, CofreEstado, CofreKdf } from '@loginhub/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

/**
 * Cofre de senhas cifrado de ponta a ponta (db/013_cofre.sql, 19/11/2026).
 *
 * Este serviço é um ARMÁRIO: guarda e devolve texto cifrado e nunca vê a
 * palavra-passe, o kit nem chave nenhuma. A única coisa que ele confere é a
 * forma do que chega (tamanho, formato "v1.<nonce>.<cifra>", uuid) e que cada
 * cofre/item pertence ao dono da sessão.
 */
const ENVELOPE = /^v1\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DADOS = 64 * 1024;
const MAX_COFRES = 100;
const MAX_ITENS = 5000;

const erro = (mensagem: string, code: string) => Object.assign(new Error(mensagem), { code });

function envelope(valor: unknown, campo: string): string {
    if (typeof valor !== 'string' || valor.length > MAX_DADOS || !ENVELOPE.test(valor)) {
        throw erro(`${campo} inválido (esperado texto cifrado v1).`, 'VALIDATION');
    }
    return valor;
}

function uuid(valor: unknown, campo: string): string {
    if (typeof valor !== 'string' || !UUID.test(valor)) throw erro(`${campo} inválido.`, 'VALIDATION');
    return valor.toLowerCase();
}

/** Argon2id com limites: fraco demais não protege; pesado demais trava o celular. */
function kdf(valor: unknown): CofreKdf {
    const k = (valor ?? {}) as Partial<CofreKdf>;
    const t = Number(k.t), m = Number(k.m), p = Number(k.p);
    const ok =
        k.alg === 'argon2id' &&
        Number.isInteger(t) && t >= 2 && t <= 10 &&
        Number.isInteger(m) && m >= 19456 && m <= 1048576 &&
        Number.isInteger(p) && p >= 1 && p <= 4 &&
        typeof k.salt === 'string' && /^[A-Za-z0-9+/=]{16,64}$/.test(k.salt);
    if (!ok) throw erro('Parâmetros do Argon2id inválidos.', 'VALIDATION');
    return { alg: 'argon2id', t, m, p, salt: k.salt as string };
}

export class CofreService {
    public async estado(dono: string): Promise<CofreEstado> {
        const conta = await db.select().from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) return { conta: null, cofres: [], itens: [] };
        const cofres = await db
            .select({ id: cofreCofres.id, dados: cofreCofres.dados, atualizado_em: cofreCofres.atualizadoEm })
            .from(cofreCofres)
            .where(eq(cofreCofres.dono, dono));
        const ids = cofres.map((c: { id: string }) => c.id);
        const itens = ids.length
            ? await db
                  .select({ id: cofreItens.id, cofre_id: cofreItens.cofreId, dados: cofreItens.dados, atualizado_em: cofreItens.atualizadoEm })
                  .from(cofreItens)
                  .where(inArray(cofreItens.cofreId, ids))
            : [];
        const c = conta[0];
        return {
            conta: { kdf: c.kdf as CofreKdf, chave_por_senha: c.chavePorSenha, chave_por_kit: c.chavePorKit },
            cofres,
            itens,
        };
    }

    /** Cria a conta do cofre. Uma por dono: a segunda tentativa é 409 (não sobrescreve nada). */
    public async criarConta(dono: string, dados: Partial<CofreConta>): Promise<void> {
        const valores = {
            dono,
            kdf: kdf(dados.kdf),
            chavePorSenha: envelope(dados.chave_por_senha, 'chave_por_senha'),
            chavePorKit: envelope(dados.chave_por_kit, 'chave_por_kit'),
        };
        const r = await db.insert(cofreContas).values(valores).onConflictDoNothing().returning({ dono: cofreContas.dono });
        if (r.length === 0) throw erro('O cofre já existe.', 'DUPLICATE_ENTRY');
    }

    /**
     * Troca a palavra-passe (ou a define de novo depois de abrir pelo kit). Só
     * muda o embrulho da chave da conta: cofres e itens continuam como estão.
     */
    public async trocarSenha(dono: string, dados: Partial<CofreConta>): Promise<void> {
        const r = await db
            .update(cofreContas)
            .set({ kdf: kdf(dados.kdf), chavePorSenha: envelope(dados.chave_por_senha, 'chave_por_senha'), atualizadoEm: new Date() })
            .where(eq(cofreContas.dono, dono))
            .returning({ dono: cofreContas.dono });
        if (r.length === 0) throw erro('Cofre não encontrado.', 'NOT_FOUND');
    }

    public async salvarCofre(dono: string, idBruto: unknown, dadosBrutos: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        const dados = envelope(dadosBrutos, 'dados');
        const conta = await db.select({ d: cofreContas.dono }).from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) throw erro('Crie o cofre primeiro.', 'NOT_FOUND');
        const existente = await db.select({ dono: cofreCofres.dono }).from(cofreCofres).where(eq(cofreCofres.id, id)).limit(1);
        if (existente[0]) {
            if (existente[0].dono !== dono) throw erro('Cofre não encontrado.', 'NOT_FOUND');
            await db.update(cofreCofres).set({ dados, atualizadoEm: new Date() }).where(eq(cofreCofres.id, id));
            return;
        }
        const total = await db.select({ n: sql<number>`count(*)` }).from(cofreCofres).where(eq(cofreCofres.dono, dono));
        if (Number(total[0]?.n ?? 0) >= MAX_COFRES) throw erro('Limite de cofres atingido.', 'VALIDATION');
        await db.insert(cofreCofres).values({ id, dono, dados });
    }

    public async apagarCofre(dono: string, idBruto: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        const r = await db.delete(cofreCofres).where(and(eq(cofreCofres.id, id), eq(cofreCofres.dono, dono))).returning({ id: cofreCofres.id });
        if (r.length === 0) throw erro('Cofre não encontrado.', 'NOT_FOUND');
    }

    private async cofreDoDono(dono: string, cofreId: string): Promise<boolean> {
        const r = await db.select({ id: cofreCofres.id }).from(cofreCofres).where(and(eq(cofreCofres.id, cofreId), eq(cofreCofres.dono, dono))).limit(1);
        return !!r[0];
    }

    public async salvarItem(dono: string, idBruto: unknown, cofreIdBruto: unknown, dadosBrutos: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        const cofreId = uuid(cofreIdBruto, 'cofre_id');
        const dados = envelope(dadosBrutos, 'dados');
        if (!(await this.cofreDoDono(dono, cofreId))) throw erro('Cofre não encontrado.', 'NOT_FOUND');
        const existente = await db.select({ cofreId: cofreItens.cofreId }).from(cofreItens).where(eq(cofreItens.id, id)).limit(1);
        if (existente[0]) {
            // Mudar de cofre exige recifrar com a chave do cofre novo: o navegador manda o item já recifrado.
            if (!(await this.cofreDoDono(dono, existente[0].cofreId))) throw erro('Item não encontrado.', 'NOT_FOUND');
            await db.update(cofreItens).set({ cofreId, dados, atualizadoEm: new Date() }).where(eq(cofreItens.id, id));
            return;
        }
        const total = await db
            .select({ n: sql<number>`count(*)` })
            .from(cofreItens)
            .innerJoin(cofreCofres, eq(cofreCofres.id, cofreItens.cofreId))
            .where(eq(cofreCofres.dono, dono));
        if (Number(total[0]?.n ?? 0) >= MAX_ITENS) throw erro('Limite de itens atingido.', 'VALIDATION');
        await db.insert(cofreItens).values({ id, cofreId, dados });
    }

    public async apagarItem(dono: string, idBruto: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        const item = await db.select({ cofreId: cofreItens.cofreId }).from(cofreItens).where(eq(cofreItens.id, id)).limit(1);
        if (!item[0] || !(await this.cofreDoDono(dono, item[0].cofreId))) throw erro('Item não encontrado.', 'NOT_FOUND');
        await db.delete(cofreItens).where(eq(cofreItens.id, id));
    }
}

export const cofreService = new CofreService();
