import crypto from 'crypto';
import { db } from '@loginhub/database';
import { cofreContas, cofreCofres, cofreItens, cofreAparelhos, cofreAparelhoPedidos, cofreDigitais } from '@loginhub/schema';
import type { CofreAparelho, CofreAparelhoAcesso, CofreAparelhoPedido, CofreConta, CofreDigital, CofreDigitalEmbrulho, CofreEstado, CofreKdf } from '@loginhub/schema';
import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';

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
/** db/017: chave pública X25519 (32 bytes em base64) e selo "x1.<pública efêmera>.<nonce>.<cifra>". */
const CHAVE_PUBLICA = /^[A-Za-z0-9+/]{43}=$/;
const SELO = /^x1\.[A-Za-z0-9+/]{43}=\.[A-Za-z0-9+/=]{20,64}\.[A-Za-z0-9+/=]{16,}$/;
const HASH_SHA256 = /^[0-9a-f]{64}$/;
/** HMAC-SHA256 em base64 (32 bytes). */
const PROVA = /^[A-Za-z0-9+/]{43}=$/;
const PEDIDO_MS = 10 * 60 * 1000;
const MAX_PEDIDOS = 50;
const ALFABETO32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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

/**
 * Código do pedido de uma máquina: 12 letras base32 (60 bits) do sha256 do id e
 * da chave pública. O navegador refaz a conta com a chave que recebeu
 * (`codigoDoPedido` em apps/ui/src/features/cofre/pareamento.ts): trocar a chave
 * pública no caminho muda o código, e a pessoa só aprova o que a máquina mostrou.
 */
export function codigoDoPedido(id: string, chavePublica: string): string {
    const h = crypto.createHash('sha256').update(`loginhub-cofre-pedido-v1|${id}|${chavePublica}`).digest();
    let bits = 0, valor = 0, out = '';
    for (const b of h.subarray(0, 8)) {
        valor = (valor << 8) | b;
        bits += 8;
        while (bits >= 5) {
            out += ALFABETO32[(valor >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    return out.slice(0, 12);
}

function selo(valor: unknown): string {
    if (typeof valor !== 'string' || valor.length > MAX_DADOS || !SELO.test(valor)) throw erro('selo inválido (esperado texto cifrado x1).', 'VALIDATION');
    return valor;
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
                .select({ chave: cofreAparelhos.chavePorAparelho, selo: cofreAparelhos.selo, cofres: cofreAparelhos.cofres })
                .from(cofreAparelhos)
                .where(and(eq(cofreAparelhos.id, aparelhoId), eq(cofreAparelhos.dono, dono), isNull(cofreAparelhos.revogadoEm)))
                .limit(1);
            if (a[0]?.selo) aparelho = { id: aparelhoId, selo: a[0].selo, cofres: a[0].cofres ?? null };
            else if (a[0]?.chave) aparelho = { id: aparelhoId, chave_por_aparelho: a[0].chave };
            // Máquina com alcance por cofre (db/017): só recebe o que é dos cofres dela, e nada que
            // sirva para tentar a palavra-passe (embrulhos da conta, digitais).
            const permitidos = a[0]?.selo ? a[0].cofres : null;
            if (aparelho && permitidos) {
                const pode = new Set(permitidos);
                return {
                    dono,
                    conta: { kdf: c.kdf as CofreKdf, chave_por_senha: '', chave_por_kit: '' },
                    aparelho,
                    digitais: [],
                    cofres: cofres.filter((x: { id: string }) => pode.has(x.id)),
                    itens: itens.filter((x: { cofre_id: string }) => pode.has(x.cofre_id)),
                };
            }
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
                cofres: cofreAparelhos.cofres,
                chave_publica: cofreAparelhos.chavePublica,
                prova: cofreAparelhos.prova,
            })
            .from(cofreAparelhos)
            .where(eq(cofreAparelhos.dono, dono))
            .orderBy(desc(cofreAparelhos.criadoEm));
        return linhas.map(({ revogado_em, ...l }: any) => ({ ...l, cofres: l.cofres ?? null, revogado: !!revogado_em }));
    }

    /** Revoga: zera o embrulho da chave e invalida o token. A chave que ficou na máquina não abre mais nada. */
    public async revogarAparelho(dono: string, idBruto: unknown): Promise<void> {
        const id = uuid(idBruto, 'id');
        const r = await db
            .update(cofreAparelhos)
            .set({ revogadoEm: new Date(), chavePorAparelho: null, selo: null })
            .where(and(eq(cofreAparelhos.id, id), eq(cofreAparelhos.dono, dono), isNull(cofreAparelhos.revogadoEm)))
            .returning({ id: cofreAparelhos.id });
        if (r.length === 0) throw erro('Aparelho não encontrado.', 'NOT_FOUND');
    }

    // ------------------------------------------------------------ aprovação pelo navegador (db/017)

    /**
     * Pedido de uma máquina (`hub-pass login`), ainda sem dono: ela sorteou o par
     * X25519 e o token e manda a chave pública e o hash do token. Vale 10 minutos.
     * Devolve o código que a pessoa digita com o cofre aberto.
     */
    public async pedirAparelho(dados: Record<string, unknown>, ip: string | null): Promise<{ codigo: string; expira_em: Date }> {
        const id = uuid(dados.id, 'id');
        const chavePublica = typeof dados.chave_publica === 'string' && CHAVE_PUBLICA.test(dados.chave_publica) ? dados.chave_publica : null;
        if (!chavePublica) throw erro('chave_publica inválida (32 bytes em base64).', 'VALIDATION');
        const tokenHash = typeof dados.token_hash === 'string' && HASH_SHA256.test(dados.token_hash) ? dados.token_hash : null;
        if (!tokenHash) throw erro('token_hash inválido (sha256 em hex).', 'VALIDATION');
        const nome = String(dados.nome ?? '').trim().slice(0, 120) || 'Aparelho';
        await db.delete(cofreAparelhoPedidos).where(lt(cofreAparelhoPedidos.expiraEm, new Date()));
        const pendentes = await db.select({ n: sql<number>`count(*)` }).from(cofreAparelhoPedidos);
        if (Number(pendentes[0]?.n ?? 0) >= MAX_PEDIDOS) throw erro('Há pedidos demais esperando aprovação. Tente em alguns minutos.', 'VALIDATION');
        const jaAprovado = await db.select({ id: cofreAparelhos.id }).from(cofreAparelhos).where(eq(cofreAparelhos.id, id)).limit(1);
        if (jaAprovado[0]) throw erro('Aparelho já registrado.', 'DUPLICATE_ENTRY');
        const codigo = codigoDoPedido(id, chavePublica);
        const expiraEm = new Date(Date.now() + PEDIDO_MS);
        try {
            await db.insert(cofreAparelhoPedidos).values({ id, nome, chavePublica, tokenHash, codigo, ip: ip?.slice(0, 64) ?? null, expiraEm });
        } catch (e) {
            if ((e as { code?: string }).code === '23505') throw erro('Pedido já registrado.', 'DUPLICATE_ENTRY');
            throw e;
        }
        return { codigo, expira_em: expiraEm };
    }

    /** O pedido que a pessoa digitou (o código aceita hífen, espaço e minúscula). */
    public async pedidoPorCodigo(codigoBruto: unknown): Promise<CofreAparelhoPedido> {
        const codigo = String(codigoBruto ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
        if (codigo.length !== 12) throw erro('Código do pedido inválido (12 letras).', 'VALIDATION');
        const r = await db
            .select({ id: cofreAparelhoPedidos.id, nome: cofreAparelhoPedidos.nome, chave_publica: cofreAparelhoPedidos.chavePublica, ip: cofreAparelhoPedidos.ip, criado_em: cofreAparelhoPedidos.criadoEm })
            .from(cofreAparelhoPedidos)
            .where(and(eq(cofreAparelhoPedidos.codigo, codigo), gt(cofreAparelhoPedidos.expiraEm, new Date())))
            .limit(1);
        if (!r[0]) throw erro('Pedido não encontrado ou vencido. Rode hub-pass login de novo na máquina.', 'NOT_FOUND');
        return r[0];
    }

    /** Confere o alcance: `null` (a conta inteira) ou uma lista de cofres que são do dono. */
    private async acesso(dono: string, bruto: Partial<CofreAparelhoAcesso>): Promise<CofreAparelhoAcesso> {
        const s = selo(bruto.selo);
        if (bruto.cofres === null || bruto.cofres === undefined) return { selo: s, cofres: null };
        if (!Array.isArray(bruto.cofres) || bruto.cofres.length === 0 || bruto.cofres.length > MAX_COFRES) {
            throw erro('Escolha pelo menos um cofre para a máquina.', 'VALIDATION');
        }
        const ids = [...new Set(bruto.cofres.map((c) => uuid(c, 'cofres')))];
        const meus = await db.select({ id: cofreCofres.id }).from(cofreCofres).where(and(eq(cofreCofres.dono, dono), inArray(cofreCofres.id, ids)));
        if (meus.length !== ids.length) throw erro('Cofre não encontrado.', 'NOT_FOUND');
        return { selo: s, cofres: ids };
    }

    /**
     * Aprova o pedido: o navegador, com o cofre aberto, já cifrou para a chave
     * pública da máquina o que ela pode abrir (`selo`). O pedido vira aparelho do
     * dono; o token é o que a máquina sorteou (só o hash passou por aqui).
     */
    public async aprovarPedido(dono: string, idBruto: unknown, bruto: Partial<CofreAparelhoAcesso>): Promise<void> {
        const id = uuid(idBruto, 'id');
        const conta = await db.select({ d: cofreContas.dono }).from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) throw erro('Crie o cofre primeiro.', 'NOT_FOUND');
        const a = await this.acesso(dono, bruto);
        const prova = typeof bruto.prova === 'string' && PROVA.test(bruto.prova) ? bruto.prova : null;
        if (!prova) throw erro('prova inválida (HMAC em base64).', 'VALIDATION');
        const ativos = await db
            .select({ n: sql<number>`count(*)` })
            .from(cofreAparelhos)
            .where(and(eq(cofreAparelhos.dono, dono), isNull(cofreAparelhos.revogadoEm)));
        if (Number(ativos[0]?.n ?? 0) >= MAX_APARELHOS) throw erro('Limite de aparelhos atingido: revogue um antes.', 'VALIDATION');
        await db.transaction(async (tx: any) => {
            const p = await tx
                .delete(cofreAparelhoPedidos)
                .where(and(eq(cofreAparelhoPedidos.id, id), gt(cofreAparelhoPedidos.expiraEm, new Date())))
                .returning();
            const pedido = p[0];
            if (!pedido) throw erro('Pedido não encontrado ou vencido. Rode hub-pass login de novo na máquina.', 'NOT_FOUND');
            await tx.insert(cofreAparelhos).values({
                id,
                dono,
                nome: pedido.nome,
                tokenHash: pedido.tokenHash,
                chavePublica: pedido.chavePublica,
                selo: a.selo,
                cofres: a.cofres,
                prova,
                ip: pedido.ip,
            });
        });
    }

    /** Muda o alcance de uma máquina aprovada pelo navegador: selo novo, cofres novos. */
    public async alterarAcesso(dono: string, idBruto: unknown, bruto: Partial<CofreAparelhoAcesso>): Promise<void> {
        const id = uuid(idBruto, 'id');
        const a = await this.acesso(dono, bruto);
        const r = await db
            .update(cofreAparelhos)
            .set({ selo: a.selo, cofres: a.cofres })
            .where(and(eq(cofreAparelhos.id, id), eq(cofreAparelhos.dono, dono), isNull(cofreAparelhos.revogadoEm), sql`${cofreAparelhos.chavePublica} is not null`))
            .returning({ id: cofreAparelhos.id });
        if (r.length === 0) throw erro('Aparelho não encontrado (ou aprovado do jeito antigo: aprove de novo).', 'NOT_FOUND');
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

    /** `permitidos` (máquina com alcance por cofre): ela não cria, renomeia nem apaga cofre. */
    public async salvarCofre(dono: string, idBruto: unknown, dadosBrutos: unknown, permitidos?: string[] | null): Promise<void> {
        if (permitidos) throw erro('Esta máquina só tem acesso a cofres escolhidos: não cria nem altera cofre.', 'FORBIDDEN');
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

    public async apagarCofre(dono: string, idBruto: unknown, permitidos?: string[] | null): Promise<void> {
        if (permitidos) throw erro('Esta máquina só tem acesso a cofres escolhidos: não apaga cofre.', 'FORBIDDEN');
        const id = uuid(idBruto, 'id');
        const r = await db.delete(cofreCofres).where(and(eq(cofreCofres.id, id), eq(cofreCofres.dono, dono))).returning({ id: cofreCofres.id });
        if (r.length === 0) throw erro('Cofre não encontrado.', 'NOT_FOUND');
    }

    private async cofreDoDono(dono: string, cofreId: string): Promise<boolean> {
        const r = await db.select({ id: cofreCofres.id }).from(cofreCofres).where(and(eq(cofreCofres.id, cofreId), eq(cofreCofres.dono, dono))).limit(1);
        return !!r[0];
    }

    /** `permitidos` (máquina com alcance por cofre): só grava em cofre liberado para ela. */
    public async salvarItem(dono: string, idBruto: unknown, cofreIdBruto: unknown, dadosBrutos: unknown, permitidos?: string[] | null): Promise<void> {
        const id = uuid(idBruto, 'id');
        const cofreId = uuid(cofreIdBruto, 'cofre_id');
        const dados = envelope(dadosBrutos, 'dados');
        if (permitidos && !permitidos.includes(cofreId)) throw erro('Cofre não encontrado.', 'NOT_FOUND');
        if (!(await this.cofreDoDono(dono, cofreId))) throw erro('Cofre não encontrado.', 'NOT_FOUND');
        const existente = await db.select({ cofreId: cofreItens.cofreId }).from(cofreItens).where(eq(cofreItens.id, id)).limit(1);
        if (existente[0]) {
            // Mudar de cofre exige recifrar com a chave do cofre novo: o navegador manda o item já recifrado.
            if (permitidos && !permitidos.includes(existente[0].cofreId)) throw erro('Item não encontrado.', 'NOT_FOUND');
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

    public async apagarItem(dono: string, idBruto: unknown, permitidos?: string[] | null): Promise<void> {
        const id = uuid(idBruto, 'id');
        const item = await db.select({ cofreId: cofreItens.cofreId }).from(cofreItens).where(eq(cofreItens.id, id)).limit(1);
        if (!item[0] || !(await this.cofreDoDono(dono, item[0].cofreId))) throw erro('Item não encontrado.', 'NOT_FOUND');
        if (permitidos && !permitidos.includes(item[0].cofreId)) throw erro('Item não encontrado.', 'NOT_FOUND');
        await db.delete(cofreItens).where(eq(cofreItens.id, id));
    }
}

export const cofreService = new CofreService();
