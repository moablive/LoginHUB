import crypto from 'crypto';
import { db } from '@loginhub/database';
import { cofreContas, cofreCofres, cofreItens, cofreAparelhos, cofreDigitais } from '@loginhub/schema';
import type { CofreAparelho, CofreConta, CofreDigital, CofreDigitalEmbrulho, CofreEstado, CofreKdf } from '@loginhub/schema';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

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
const MAX_APARELHOS = 20;
const MAX_DIGITAIS = 20;
/** id da credencial WebAuthn em base64url e sal do PRF (32 bytes em base64). */
const CREDENCIAL = /^[A-Za-z0-9_-]{16,1400}$/;
const SAL_PRF = /^[A-Za-z0-9+/]{43}=$/;

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
    public async estado(dono: string, aparelhoId?: string): Promise<CofreEstado> {
        const conta = await db.select().from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) return { dono, conta: null, cofres: [], itens: [] };
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
        let aparelho: CofreEstado['aparelho'];
        if (aparelhoId) {
            const a = await db
                .select({ chave: cofreAparelhos.chavePorAparelho })
                .from(cofreAparelhos)
                .where(and(eq(cofreAparelhos.id, aparelhoId), eq(cofreAparelhos.dono, dono), isNull(cofreAparelhos.revogadoEm)))
                .limit(1);
            if (a[0]?.chave) aparelho = { id: aparelhoId, chave_por_aparelho: a[0].chave };
        }
        // Digitais (db/015): só embrulhos; sem a passkey do aparelho nenhum deles abre nada.
        const digitais: CofreDigitalEmbrulho[] = (
            await db
                .select({ id: cofreDigitais.id, credencial_id: cofreDigitais.credencialId, prf_sal: cofreDigitais.prfSal, chave: cofreDigitais.chavePorDigital })
                .from(cofreDigitais)
                .where(and(eq(cofreDigitais.dono, dono), isNull(cofreDigitais.revogadoEm)))
        )
            .filter((d: { chave: string | null }) => !!d.chave)
            .map((d: { id: string; credencial_id: string; prf_sal: string; chave: string | null }) => ({ id: d.id, credencial_id: d.credencial_id, prf_sal: d.prf_sal, chave_por_digital: d.chave as string }));
        return {
            dono,
            conta: { kdf: c.kdf as CofreKdf, chave_por_senha: c.chavePorSenha, chave_por_kit: c.chavePorKit },
            ...(aparelho ? { aparelho } : {}),
            digitais,
            cofres,
            itens,
        };
    }

    // ------------------------------------------------------------ aparelhos (CLI hub-pass, db/014)

    /**
     * Aprova uma máquina. O CLI já abriu a conta com a palavra-passe e manda a
     * chave da conta embrulhada pela chave da máquina; aqui nasce o token de
     * acesso (devolvido UMA vez; guardamos só o sha256 dele).
     */
    public async registrarAparelho(dono: string, idBruto: unknown, nomeBruto: unknown, chaveBruta: unknown, ip: string | null): Promise<{ token: string }> {
        const id = uuid(idBruto, 'id');
        const chave = envelope(chaveBruta, 'chave_por_aparelho');
        const nome = String(nomeBruto ?? '').trim().slice(0, 120) || 'Aparelho';
        const conta = await db.select({ d: cofreContas.dono }).from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) throw erro('Crie o cofre primeiro.', 'NOT_FOUND');
        const ativos = await db
            .select({ n: sql<number>`count(*)` })
            .from(cofreAparelhos)
            .where(and(eq(cofreAparelhos.dono, dono), isNull(cofreAparelhos.revogadoEm)));
        if (Number(ativos[0]?.n ?? 0) >= MAX_APARELHOS) throw erro('Limite de aparelhos atingido: revogue um antes.', 'VALIDATION');
        const token = crypto.randomBytes(32).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        try {
            await db.insert(cofreAparelhos).values({ id, dono, nome, tokenHash, chavePorAparelho: chave, ip: ip?.slice(0, 64) ?? null });
        } catch (e) {
            if ((e as { code?: string }).code === '23505') throw erro('Aparelho já registrado.', 'DUPLICATE_ENTRY');
            throw e;
        }
        return { token };
    }

    public async listarAparelhos(dono: string): Promise<CofreAparelho[]> {
        const linhas = await db
            .select({
                id: cofreAparelhos.id,
                nome: cofreAparelhos.nome,
                ip: cofreAparelhos.ip,
                criado_em: cofreAparelhos.criadoEm,
                ultimo_uso: cofreAparelhos.ultimoUso,
                revogado_em: cofreAparelhos.revogadoEm,
            })
            .from(cofreAparelhos)
            .where(eq(cofreAparelhos.dono, dono))
            .orderBy(desc(cofreAparelhos.criadoEm));
        return linhas.map(({ revogado_em, ...l }: any) => ({ ...l, revogado: !!revogado_em }));
    }

    /** Revoga: zera o embrulho da chave e invalida o token. A chave que ficou na máquina não abre mais nada. */
    public async revogarAparelho(dono: string, idBruto: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        const r = await db
            .update(cofreAparelhos)
            .set({ revogadoEm: new Date(), chavePorAparelho: null })
            .where(and(eq(cofreAparelhos.id, id), eq(cofreAparelhos.dono, dono), isNull(cofreAparelhos.revogadoEm)))
            .returning({ id: cofreAparelhos.id });
        if (r.length === 0) throw erro('Aparelho não encontrado.', 'NOT_FOUND');
    }

    // ------------------------------------------------------------ digitais (passkey com PRF, db/015)

    /**
     * Guarda a digital de um aparelho. O navegador já abriu o cofre, fez a
     * passkey com PRF e manda só o id da credencial, o sal e a chave da conta
     * embrulhada pelo segredo do PRF — que ele nunca envia.
     */
    public async registrarDigital(dono: string, dados: Record<string, unknown>): Promise<void> {
        const id = uuid(dados.id, 'id');
        const chave = envelope(dados.chave_por_digital, 'chave_por_digital');
        const credencialId = typeof dados.credencial_id === 'string' && CREDENCIAL.test(dados.credencial_id) ? dados.credencial_id : null;
        if (!credencialId) throw erro('credencial_id inválido.', 'VALIDATION');
        const sal = typeof dados.prf_sal === 'string' && SAL_PRF.test(dados.prf_sal) ? dados.prf_sal : null;
        if (!sal) throw erro('prf_sal inválido (32 bytes em base64).', 'VALIDATION');
        const nome = String(dados.nome ?? '').trim().slice(0, 120) || 'Aparelho';
        const conta = await db.select({ d: cofreContas.dono }).from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) throw erro('Crie o cofre primeiro.', 'NOT_FOUND');
        const ativas = await db
            .select({ n: sql<number>`count(*)` })
            .from(cofreDigitais)
            .where(and(eq(cofreDigitais.dono, dono), isNull(cofreDigitais.revogadoEm)));
        if (Number(ativas[0]?.n ?? 0) >= MAX_DIGITAIS) throw erro('Limite de digitais atingido: tire uma antes.', 'VALIDATION');
        try {
            await db.insert(cofreDigitais).values({ id, dono, nome, credencialId, prfSal: sal, chavePorDigital: chave });
        } catch (e) {
            if ((e as { code?: string }).code === '23505') throw erro('Esta digital já abre o cofre.', 'DUPLICATE_ENTRY');
            throw e;
        }
    }

    public async listarDigitais(dono: string): Promise<CofreDigital[]> {
        return db
            .select({ id: cofreDigitais.id, nome: cofreDigitais.nome, criado_em: cofreDigitais.criadoEm, ultimo_uso: cofreDigitais.ultimoUso })
            .from(cofreDigitais)
            .where(and(eq(cofreDigitais.dono, dono), isNull(cofreDigitais.revogadoEm)))
            .orderBy(desc(cofreDigitais.criadoEm));
    }

    /** Tira a digital: zera o embrulho. A passkey que ficou no aparelho não abre mais nada. */
    public async revogarDigital(dono: string, idBruto: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        const r = await db
            .update(cofreDigitais)
            .set({ revogadoEm: new Date(), chavePorDigital: null })
            .where(and(eq(cofreDigitais.id, id), eq(cofreDigitais.dono, dono), isNull(cofreDigitais.revogadoEm)))
            .returning({ id: cofreDigitais.id });
        if (r.length === 0) throw erro('Digital não encontrada.', 'NOT_FOUND');
    }

    /** Anota o último uso (a tela mostra). Só informativo: quem abre é o navegador. */
    public async usouDigital(dono: string, idBruto: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        await db
            .update(cofreDigitais)
            .set({ ultimoUso: new Date() })
            .where(and(eq(cofreDigitais.id, id), eq(cofreDigitais.dono, dono), isNull(cofreDigitais.revogadoEm)));
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
