import crypto from 'crypto';
import { db } from '@loginhub/database';
import { cofreContas, cofreCofres, cofreItens, cofreAparelhos, cofreAparelhoPedidos, cofreDigitais, cofreChavesPessoa, cofreMembros, cofreGeracao, usuarios } from '@loginhub/schema';
import type { CofreAparelho, CofreAparelhoAcesso, CofreAparelhoPedido, CofreCompartilhado, CofreConta, CofreDigital, CofreDigitalEmbrulho, CofreEstado, CofreGiro, CofreKdf, CofreMembro, CofreMembroAjuste, CofreMembroNovo, CofrePapel, CofrePessoaPublica } from '@loginhub/schema';
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
/** db/022: cofre compartilhado. */
const MAX_MEMBROS = 20;
/** Tetos contra cofre compartilhado enorme (sem convite pendente por ora: o convite vale na hora): ver README. */
const MAX_COMPARTILHADOS_POR_MEMBRO = 50;
const MAX_ITENS_COMPARTILHADO = 1000;
const DONO_ID = /^[A-Za-z0-9:_-]{1,64}$/;
/** Papel de quem abre um cofre: o dono do registro ou um membro (`leitura` / `escrita`). */
type Papel = 'dono' | CofrePapel;
interface AcessoAoCofre {
    papel: Papel;
    /** Dono do cofre (quem criou). */
    dono: string;
    /** O selo que o membro tem hoje (só membro): a escrita precisa vir com ele, senão a chave já girou. */
    selo?: string;
    /** Geração da chave do cofre (db/023); `null` enquanto a coluna não existe. */
    geracao: number | null;
}

/** O que a escrita de item prova: o selo e a geração da chave que o navegador usou (máquina do CLI: nada). */
interface ProvaDeEscrita {
    selo?: unknown;
    geracao?: unknown;
}
export interface OpcoesDeEscrita extends ProvaDeEscrita {
    aparelho?: boolean;
    /** Mover item de outro cofre: o selo e a geração do cofre de ORIGEM. */
    origemSelo?: unknown;
    origemGeracao?: unknown;
}
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

function papel(valor: unknown): CofrePapel {
    if (valor !== 'leitura' && valor !== 'escrita') throw erro("papel inválido (use 'leitura' ou 'escrita').", 'VALIDATION');
    return valor;
}

function chavePublica(valor: unknown, campo = 'chave_publica'): string {
    if (typeof valor !== 'string' || !CHAVE_PUBLICA.test(valor)) throw erro(`${campo} inválida (32 bytes em base64).`, 'VALIDATION');
    return valor;
}

function prova(valor: unknown): string {
    if (typeof valor !== 'string' || !PROVA.test(valor)) throw erro('prova inválida (HMAC em base64).', 'VALIDATION');
    return valor;
}

function donoId(valor: unknown, campo = 'membro'): string {
    if (typeof valor !== 'string' || !DONO_ID.test(valor)) throw erro(`${campo} inválido.`, 'VALIDATION');
    return valor;
}

/** Mesma resposta para "não existe", "não tem cofre" e "a chave mudou": ninguém descobre quem tem conta. */
const convidadoNaoEncontrado = () => erro('Não encontramos esta conta com cofre. Confira o e-mail (ela precisa já ter aberto o cofre) e tente de novo.', 'NOT_FOUND');

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

/**
 * Antes de rodar `db/022_cofre_compartilhado.sql` as tabelas novas não existem (o código sobe antes do SQL, porque o
 * hot reload da API e a migração à mão não andam juntos): o cofre segue funcionando sem compartilhar — o estado sai sem
 * `pessoa`/`membros`/`compartilhados`, e a tela não oferece nada. Qualquer outro erro continua sendo erro.
 */
function semTabelaDeCompartilhamento(e: unknown): Record<string, never> {
    const code = (e as { code?: string; cause?: { code?: string } } | null);
    if (code?.code === '42P01' || code?.cause?.code === '42P01') {
        console.warn('[CofreService] db/022 ainda não aplicada: cofre sem compartilhamento.');
        return {};
    }
    throw e;
}

export class CofreService {
    public async estado(dono: string, aparelhoId?: string): Promise<CofreEstado> {
        const conta = await db.select().from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) return { dono, conta: null, cofres: [], itens: [] };
        const cofresSemGeracao = await db
            .select({ id: cofreCofres.id, dados: cofreCofres.dados, atualizado_em: cofreCofres.atualizadoEm })
            .from(cofreCofres)
            .where(eq(cofreCofres.dono, dono));
        const ids = cofresSemGeracao.map((c: { id: string }) => c.id);
        const geracoes = await this.geracoes(ids);
        const cofres = cofresSemGeracao.map((c: { id: string }) => (geracoes.has(c.id) ? { ...c, geracao: geracoes.get(c.id) as number } : c));
        const itens = ids.length
            ? await db
                  .select({ id: cofreItens.id, cofre_id: cofreItens.cofreId, dados: cofreItens.dados, atualizado_em: cofreItens.atualizadoEm })
                  .from(cofreItens)
                  .where(inArray(cofreItens.cofreId, ids))
            : [];
        const c = conta[0];
        // db/022: par X25519, membros e cofres compartilhados. A máquina do CLI não os recebe (não gerencia nem abre).
        const extras = aparelhoId ? {} : await this.extrasDeCompartilhamento(dono, ids).catch(semTabelaDeCompartilhamento);
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
            ...extras,
        };
    }

    // ------------------------------------------------------------ cofre compartilhado (db/022)

    /** E-mail para mostrar de cada dono ('master' ou 'p:<sha256 do e-mail>'); o que não resolver fica de fora. */
    private async nomesDeDonos(donos: string[]): Promise<Map<string, string>> {
        const nomes = new Map<string, string>();
        const hashes = new Map<string, string>();
        for (const d of new Set(donos)) {
            if (d === 'master') nomes.set(d, 'Conta master');
            else if (d.startsWith('p:')) hashes.set(d.slice(2), d);
        }
        if (hashes.size === 0) return nomes;
        try {
            const h = sql<string>`translate(rtrim(encode(sha256(convert_to(lower(btrim(${usuarios.email})), 'UTF8')), 'base64'), '='), '+/', '-_')`;
            const linhas = await db
                .select({ email: usuarios.email, h })
                .from(usuarios)
                .where(inArray(h, [...hashes.keys()]));
            for (const l of linhas as { email: string; h: string }[]) {
                const d = hashes.get(l.h);
                if (d && !nomes.has(d)) nomes.set(d, l.email.trim().toLowerCase());
            }
        } catch (e) {
            // Só para mostrar: sem nome, a tela mostra "outra conta".
            console.error('[CofreService] nomesDeDonos:', (e as Error).message);
        }
        return nomes;
    }

    private geracaoExiste = false;

    /** A coluna `geracao` (db/023) existe? Só vira `true` uma vez; antes da migração o serviço segue sem a checagem. */
    private async temGeracao(): Promise<boolean> {
        if (this.geracaoExiste) return true;
        const r = await db.execute(sql`select 1 from information_schema.columns where table_name = 'cofre_cofres' and column_name = 'geracao' limit 1`);
        this.geracaoExiste = (r.rows?.length ?? 0) > 0;
        return this.geracaoExiste;
    }

    private async geracoes(ids: string[]): Promise<Map<string, number>> {
        const m = new Map<string, number>();
        if (ids.length === 0 || !(await this.temGeracao())) return m;
        const r = await db.select({ id: cofreGeracao.id, geracao: cofreGeracao.geracao }).from(cofreGeracao).where(inArray(cofreGeracao.id, ids));
        for (const l of r as { id: string; geracao: number }[]) m.set(l.id, l.geracao);
        return m;
    }

    private async extrasDeCompartilhamento(dono: string, cofreIds: string[]): Promise<Pick<CofreEstado, 'pessoa' | 'membros' | 'compartilhados'>> {
        const p = await db.select().from(cofreChavesPessoa).where(eq(cofreChavesPessoa.dono, dono)).limit(1);
        const meus = cofreIds.length ? await db.select().from(cofreMembros).where(inArray(cofreMembros.cofreId, cofreIds)) : [];
        const deOutros = await db
            .select({
                id: cofreCofres.id,
                dono: cofreCofres.dono,
                dados: cofreCofres.dados,
                atualizado_em: cofreCofres.atualizadoEm,
                papel: cofreMembros.papel,
                chave_selada: cofreMembros.chaveSelada,
            })
            .from(cofreMembros)
            .innerJoin(cofreCofres, eq(cofreCofres.id, cofreMembros.cofreId))
            .where(eq(cofreMembros.membro, dono));
        const idsOutros = deOutros.map((c: { id: string }) => c.id);
        const itensOutros = idsOutros.length
            ? await db
                  .select({ id: cofreItens.id, cofre_id: cofreItens.cofreId, dados: cofreItens.dados, atualizado_em: cofreItens.atualizadoEm })
                  .from(cofreItens)
                  .where(inArray(cofreItens.cofreId, idsOutros))
            : [];
        const donosDeOutros: string[] = [...new Set<string>(deOutros.map((c: { dono: string }) => c.dono))];
        const chavesDosDonos = new Map<string, string>();
        if (donosDeOutros.length) {
            const r = await db.select({ dono: cofreChavesPessoa.dono, chave: cofreChavesPessoa.chavePublica }).from(cofreChavesPessoa).where(inArray(cofreChavesPessoa.dono, donosDeOutros));
            for (const l of r as { dono: string; chave: string }[]) chavesDosDonos.set(l.dono, l.chave);
        }
        const geracoes = await this.geracoes(idsOutros);
        const nomes = await this.nomesDeDonos([...meus.map((m: { membro: string }) => m.membro), ...deOutros.map((c: { dono: string }) => c.dono)]);
        const membros: CofreMembro[] = meus.map((m: typeof cofreMembros.$inferSelect) => ({
            cofre_id: m.cofreId,
            membro: m.membro,
            nome: nomes.get(m.membro) ?? null,
            papel: m.papel,
            chave_publica: m.chavePublica,
            prova: m.prova,
            criado_em: m.criadoEm,
        }));
        const compartilhados: CofreCompartilhado[] = deOutros.map((c: { id: string; dono: string; dados: string; atualizado_em: Date; papel: CofrePapel; chave_selada: string }) => ({
            ...c,
            ...(geracoes.has(c.id) ? { geracao: geracoes.get(c.id) as number } : {}),
            dono_nome: nomes.get(c.dono) ?? null,
            dono_chave_publica: chavesDosDonos.get(c.dono) ?? null,
            itens: itensOutros.filter((i: { cofre_id: string }) => i.cofre_id === c.id),
        }));
        return { pessoa: p[0] ? { chave_publica: p[0].chavePublica, chave_privada: p[0].chavePrivada } : null, membros, compartilhados };
    }

    /** O papel de `quem` no cofre: dono, membro (com o selo de hoje) ou nada. A máquina do CLI só alcança o que é do dono. */
    private async acessoAoCofre(quem: string, cofreId: string, viaAparelho = false): Promise<AcessoAoCofre | null> {
        const c = await db.select({ dono: cofreCofres.dono }).from(cofreCofres).where(eq(cofreCofres.id, cofreId)).limit(1);
        if (!c[0]) return null;
        if (c[0].dono === quem) return { papel: 'dono', dono: quem, geracao: null };
        if (viaAparelho) return null;
        const m = await db
            .select({ papel: cofreMembros.papel, selo: cofreMembros.chaveSelada })
            .from(cofreMembros)
            .where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, quem)))
            .limit(1);
        return m[0] ? { papel: m[0].papel, dono: c[0].dono, selo: m[0].selo, geracao: null } : null;
    }

    /**
     * Dentro de uma transação: trava a linha do cofre com FOR SHARE (o girar-chave pega FOR UPDATE nela, então escrita e
     * giro nunca se cruzam) e devolve o papel de `quem`, com o selo e a geração de hoje.
     */
    private async travarCofre(tx: any, quem: string, cofreId: string, aparelho: boolean, comGeracao: boolean): Promise<AcessoAoCofre | null> {
        const c: { dono: string; geracao?: number }[] = comGeracao
            ? await tx.select({ dono: cofreGeracao.dono, geracao: cofreGeracao.geracao }).from(cofreGeracao).where(eq(cofreGeracao.id, cofreId)).for('share')
            : await tx.select({ dono: cofreCofres.dono }).from(cofreCofres).where(eq(cofreCofres.id, cofreId)).for('share');
        if (!c[0]) return null;
        const geracao = comGeracao ? (c[0].geracao as number) : null;
        if (c[0].dono === quem) return { papel: 'dono', dono: quem, geracao };
        if (aparelho) return null;
        const m = await tx
            .select({ papel: cofreMembros.papel, selo: cofreMembros.chaveSelada })
            .from(cofreMembros)
            .where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, quem)))
            .limit(1);
        return m[0] ? { papel: m[0].papel, dono: c[0].dono, selo: m[0].selo, geracao } : null;
    }

    /**
     * Escrever pede dono ou `escrita`, e a prova de que a chave usada é a de hoje (senão o dono girou no meio):
     *  - membro `escrita`: o selo e a geração de hoje, sempre;
     *  - dono: a geração, e ela é obrigatória quando o cofre tem membros (bundle antigo sem geração só escreve em cofre sem ninguém);
     *  - máquina do CLI: nada (caminho antigo; ela só alcança cofre do próprio dono).
     */
    private async exigeEscrita(tx: any, a: AcessoAoCofre, cofreId: string, prova: ProvaDeEscrita, aparelho: boolean): Promise<void> {
        if (a.papel === 'leitura') throw erro('Você só pode ler este cofre.', 'SEM_PERMISSAO');
        if (aparelho) return;
        const velha = () => erro('A chave deste cofre mudou. Sincronize e tente de novo.', 'CHAVE_GIRADA');
        const g = typeof prova.geracao === 'number' ? prova.geracao : null;
        if (a.papel === 'escrita') {
            if (typeof prova.selo !== 'string' || prova.selo !== a.selo) throw velha();
            if (a.geracao !== null && g !== a.geracao) throw velha();
            return;
        }
        if (a.geracao === null) return;
        if (g !== null) {
            if (g !== a.geracao) throw velha();
            return;
        }
        const n = await tx.select({ n: sql<number>`count(*)` }).from(cofreMembros).where(eq(cofreMembros.cofreId, cofreId));
        if (Number(n[0]?.n ?? 0) > 0) throw velha();
    }

    /** Guarda o par X25519 da conta (uma vez). A privada já vem cifrada com a chave da conta. */
    public async registrarPessoa(dono: string, dados: Record<string, unknown>): Promise<void> {
        const publica = chavePublica(dados.chave_publica);
        const privada = envelope(dados.chave_privada, 'chave_privada');
        const conta = await db.select({ d: cofreContas.dono }).from(cofreContas).where(eq(cofreContas.dono, dono)).limit(1);
        if (!conta[0]) throw erro('Crie o cofre primeiro.', 'NOT_FOUND');
        const r = await db.insert(cofreChavesPessoa).values({ dono, chavePublica: publica, chavePrivada: privada }).onConflictDoNothing().returning({ dono: cofreChavesPessoa.dono });
        if (r.length > 0) return;
        // Já existe: só vale regravar a PRIVADA da mesma chave pública (o navegador recifra pares antigos com o dado
        // associado novo). Chave pública diferente é 409: o par de uma conta não troca.
        const mesma = await db
            .update(cofreChavesPessoa)
            .set({ chavePrivada: privada })
            .where(and(eq(cofreChavesPessoa.dono, dono), eq(cofreChavesPessoa.chavePublica, publica)))
            .returning({ dono: cofreChavesPessoa.dono });
        if (mesma.length === 0) throw erro('Esta conta já tem o par de chaves.', 'DUPLICATE_ENTRY');
    }

    /** A chave pública de uma conta, para selar um cofre para ela. Sem par (ou sem cofre): 404 igual ao de "não existe". */
    public async pessoaPublica(donoAlvo: string): Promise<CofrePessoaPublica> {
        const r = await db.select({ chave: cofreChavesPessoa.chavePublica }).from(cofreChavesPessoa).where(eq(cofreChavesPessoa.dono, donoAlvo)).limit(1);
        if (!r[0]) throw convidadoNaoEncontrado();
        return { dono: donoAlvo, chave_publica: r[0].chave };
    }

    private async exigeDono(dono: string, cofreId: string): Promise<void> {
        if (!(await this.cofreDoDono(dono, cofreId))) throw erro('Cofre não encontrado.', 'NOT_FOUND');
    }

    /** O dono põe alguém no cofre. A chave pública do selo tem de ser a ATUAL do convidado. */
    public async convidar(dono: string, cofreIdBruto: unknown, corpo: Partial<CofreMembroNovo>): Promise<void> {
        const cofreId = uuid(cofreIdBruto, 'id');
        await this.exigeDono(dono, cofreId);
        const membro = donoId(corpo.membro);
        const papelNovo = papel(corpo.papel);
        const publica = chavePublica(corpo.chave_publica);
        const selado = selo(corpo.chave_selada);
        const p = prova(corpo.prova);
        if (membro === dono) throw erro('Este cofre já é seu.', 'VALIDATION');
        const atual = await db.select({ chave: cofreChavesPessoa.chavePublica }).from(cofreChavesPessoa).where(eq(cofreChavesPessoa.dono, membro)).limit(1);
        if (!atual[0] || atual[0].chave !== publica) throw convidadoNaoEncontrado();
        const total = await db.select({ n: sql<number>`count(*)` }).from(cofreMembros).where(eq(cofreMembros.cofreId, cofreId));
        if (Number(total[0]?.n ?? 0) >= MAX_MEMBROS) throw erro('Limite de pessoas neste cofre atingido.', 'VALIDATION');
        // Sem convite pendente por ora: o cofre cai na conta do convidado na hora, então há tetos (README: "aceite do convite").
        const itensDoCofre = await db.select({ n: sql<number>`count(*)` }).from(cofreItens).where(eq(cofreItens.cofreId, cofreId));
        if (Number(itensDoCofre[0]?.n ?? 0) > MAX_ITENS_COMPARTILHADO) {
            throw erro(`Este cofre tem itens demais para compartilhar (máximo ${MAX_ITENS_COMPARTILHADO}). Divida em cofres menores.`, 'VALIDATION');
        }
        const dele = await db.select({ n: sql<number>`count(*)` }).from(cofreMembros).where(eq(cofreMembros.membro, membro));
        if (Number(dele[0]?.n ?? 0) >= MAX_COMPARTILHADOS_POR_MEMBRO) {
            throw erro(`Esta conta já participa de ${MAX_COMPARTILHADOS_POR_MEMBRO} cofres compartilhados e não aceita mais. Peça que ela saia de algum.`, 'VALIDATION');
        }
        try {
            await db.insert(cofreMembros).values({ cofreId, membro, chaveSelada: selado, papel: papelNovo, chavePublica: publica, prova: p, convidadoPor: dono });
        } catch (e) {
            if ((e as { code?: string }).code === '23505') throw erro('Esta pessoa já está no cofre: mude o papel dela.', 'DUPLICATE_ENTRY');
            throw e;
        }
    }

    /** Muda o papel de um membro e, se vier `chave_selada`, troca o selo (o dono renomeou o cofre, por exemplo). */
    public async ajustarMembro(dono: string, cofreIdBruto: unknown, membroBruto: unknown, corpo: Partial<CofreMembroAjuste>): Promise<void> {
        const cofreId = uuid(cofreIdBruto, 'id');
        const membro = donoId(membroBruto);
        await this.exigeDono(dono, cofreId);
        const novo: Partial<typeof cofreMembros.$inferInsert> = { papel: papel(corpo.papel) };
        if (corpo.chave_selada !== undefined) {
            const publica = chavePublica(corpo.chave_publica);
            novo.chaveSelada = selo(corpo.chave_selada);
            novo.prova = prova(corpo.prova);
            const atual = await db.select({ chave: cofreChavesPessoa.chavePublica }).from(cofreChavesPessoa).where(eq(cofreChavesPessoa.dono, membro)).limit(1);
            const linha = await db.select({ chave: cofreMembros.chavePublica }).from(cofreMembros).where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, membro))).limit(1);
            if (!linha[0]) throw erro('Esta pessoa não está no cofre.', 'NOT_FOUND');
            if (!atual[0] || atual[0].chave !== publica || linha[0].chave !== publica) throw erro('A chave desta pessoa mudou. Tire-a do cofre e convide de novo.', 'CHAVE_GIRADA');
        }
        const r = await db.update(cofreMembros).set(novo).where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, membro))).returning({ membro: cofreMembros.membro });
        if (r.length === 0) throw erro('Esta pessoa não está no cofre.', 'NOT_FOUND');
    }

    /**
     * O dono tira um membro SEM girar a chave: só corta o acesso daqui para frente (ele já viu a chave do cofre).
     * A tela do cofre não usa esta rota para tirar alguém: usa `girarChave` com `remover`.
     */
    public async removerMembro(dono: string, cofreIdBruto: unknown, membroBruto: unknown): Promise<void> {
        const cofreId = uuid(cofreIdBruto, 'id');
        const membro = donoId(membroBruto);
        await this.exigeDono(dono, cofreId);
        const r = await db.delete(cofreMembros).where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, membro))).returning({ membro: cofreMembros.membro });
        if (r.length === 0) throw erro('Esta pessoa não está no cofre.', 'NOT_FOUND');
    }

    /** O membro sai sozinho: perde só o próprio acesso (sem girar a chave). */
    public async sairDoCofre(quem: string, cofreIdBruto: unknown): Promise<void> {
        const cofreId = uuid(cofreIdBruto, 'id');
        const r = await db.delete(cofreMembros).where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, quem))).returning({ membro: cofreMembros.membro });
        if (r.length === 0) throw erro('Cofre não encontrado.', 'NOT_FOUND');
    }

    /**
     * Gira a chave do cofre (o navegador do dono já recifrou tudo), numa transação só: o registro do cofre, TODOS os
     * itens e o selo de cada membro que fica. Recusa se o conjunto de itens ou de membros não for exatamente o de agora
     * (alguém mexeu no meio): a tela sincroniza e tenta de novo.
     */
    public async girarChave(dono: string, cofreIdBruto: unknown, corpo: Partial<CofreGiro>): Promise<void> {
        const cofreId = uuid(cofreIdBruto, 'id');
        const dados = envelope(corpo.dados, 'dados');
        if (!Array.isArray(corpo.itens) || corpo.itens.length > MAX_ITENS) throw erro('itens inválidos.', 'VALIDATION');
        if (!Array.isArray(corpo.membros) || corpo.membros.length > MAX_MEMBROS) throw erro('membros inválidos.', 'VALIDATION');
        const remover = corpo.remover == null ? null : donoId(corpo.remover, 'remover');
        const itensNovos = new Map<string, { dados: string; base: number }>();
        for (const i of corpo.itens) {
            const id = uuid(i?.id, 'itens.id');
            const base = new Date(i.atualizado_em as string).getTime();
            if (itensNovos.has(id) || Number.isNaN(base)) throw erro('itens inválidos.', 'VALIDATION');
            itensNovos.set(id, { dados: envelope(i.dados, 'itens.dados'), base });
        }
        const membrosNovos = new Map<string, { selo: string; publica: string; prova: string }>();
        for (const m of corpo.membros) {
            const id = donoId(m?.membro);
            if (membrosNovos.has(id) || id === remover) throw erro('membros inválidos.', 'VALIDATION');
            membrosNovos.set(id, { selo: selo(m.chave_selada), publica: chavePublica(m.chave_publica), prova: prova(m.prova) });
        }
        const conflito = (msg: string) => erro(msg, 'CONFLITO');
        const comGeracao = await this.temGeracao();
        await db.transaction(async (tx: any) => {
            const cofre = await tx.select({ id: cofreCofres.id }).from(cofreCofres).where(and(eq(cofreCofres.id, cofreId), eq(cofreCofres.dono, dono))).for('update');
            if (!cofre[0]) throw erro('Cofre não encontrado.', 'NOT_FOUND');
            const itensAtuais: { id: string; atualizadoEm: Date }[] = await tx.select({ id: cofreItens.id, atualizadoEm: cofreItens.atualizadoEm }).from(cofreItens).where(eq(cofreItens.cofreId, cofreId)).for('update');
            if (itensAtuais.length !== itensNovos.size || itensAtuais.some((i) => itensNovos.get(i.id)?.base !== i.atualizadoEm.getTime())) {
                throw conflito('Os itens do cofre mudaram enquanto a chave girava. Sincronize e tente de novo.');
            }
            const membrosAtuais: { membro: string }[] = await tx.select({ membro: cofreMembros.membro }).from(cofreMembros).where(eq(cofreMembros.cofreId, cofreId));
            if (remover && !membrosAtuais.some((m) => m.membro === remover)) throw erro('Esta pessoa não está no cofre.', 'NOT_FOUND');
            const ficam = membrosAtuais.filter((m) => m.membro !== remover).map((m) => m.membro);
            if (ficam.length !== membrosNovos.size || ficam.some((m) => !membrosNovos.has(m))) {
                throw conflito('As pessoas do cofre mudaram enquanto a chave girava. Sincronize e tente de novo.');
            }
            for (const m of ficam) {
                const novo = membrosNovos.get(m)!;
                const atual = await tx.select({ chave: cofreChavesPessoa.chavePublica }).from(cofreChavesPessoa).where(eq(cofreChavesPessoa.dono, m)).limit(1);
                const linha = await tx.select({ chave: cofreMembros.chavePublica }).from(cofreMembros).where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, m))).limit(1);
                if (!atual[0] || atual[0].chave !== novo.publica || linha[0]?.chave !== novo.publica) throw conflito('A chave de uma das pessoas mudou. Tire-a do cofre e convide de novo.');
            }
            if (remover) await tx.delete(cofreMembros).where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, remover)));
            const agora = new Date();
            await tx.update(cofreCofres).set({ dados, atualizadoEm: agora }).where(eq(cofreCofres.id, cofreId));
            // Quem escreveu com a chave de antes (aba velha, membro sem sincronizar) leva 409 CHAVE_GIRADA.
            if (comGeracao) await tx.update(cofreGeracao).set({ geracao: sql`${cofreGeracao.geracao} + 1` }).where(eq(cofreGeracao.id, cofreId));
            for (const [id, i] of itensNovos) await tx.update(cofreItens).set({ dados: i.dados, atualizadoEm: agora }).where(and(eq(cofreItens.id, id), eq(cofreItens.cofreId, cofreId)));
            for (const [m, n] of membrosNovos) {
                await tx.update(cofreMembros).set({ chaveSelada: n.selo, prova: n.prova }).where(and(eq(cofreMembros.cofreId, cofreId), eq(cofreMembros.membro, m)));
            }
        });
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
            if (existente[0].dono !== dono) {
                // Membro vê o cofre mas não o renomeia (db/022); quem não tem nada com ele recebe 404.
                if (await this.acessoAoCofre(dono, id)) throw erro('Só o dono do cofre pode alterá-lo.', 'SEM_PERMISSAO');
                throw erro('Cofre não encontrado.', 'NOT_FOUND');
            }
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
        if (r.length === 0) {
            if (await this.acessoAoCofre(dono, id)) throw erro('Só o dono do cofre pode apagá-lo. Para sair dele, use "Sair do cofre".', 'SEM_PERMISSAO');
            throw erro('Cofre não encontrado.', 'NOT_FOUND');
        }
    }

    private async cofreDoDono(dono: string, cofreId: string): Promise<boolean> {
        const r = await db.select({ id: cofreCofres.id }).from(cofreCofres).where(and(eq(cofreCofres.id, cofreId), eq(cofreCofres.dono, dono))).limit(1);
        return !!r[0];
    }

    /**
     * `permitidos` (máquina com alcance por cofre): só grava em cofre liberado para ela.
     * db/022: membro `escrita` grava em cofre compartilhado; `leitura` não grava. A máquina do CLI (`aparelho`) só alcança
     * os cofres do próprio dono. A checagem de papel/selo/geração e a escrita (inclusive o INSERT) rodam NUMA transação
     * com FOR SHARE na linha do cofre: o girar-chave (FOR UPDATE) nunca passa no meio.
     */
    public async salvarItem(dono: string, idBruto: unknown, cofreIdBruto: unknown, dadosBrutos: unknown, permitidos?: string[] | null, opcoes: OpcoesDeEscrita = {}): Promise<void> {
        const id = uuid(idBruto, 'id');
        const cofreId = uuid(cofreIdBruto, 'cofre_id');
        const dados = envelope(dadosBrutos, 'dados');
        if (permitidos && !permitidos.includes(cofreId)) throw erro('Cofre não encontrado.', 'NOT_FOUND');
        const aparelho = !!opcoes.aparelho;
        const comGeracao = await this.temGeracao();
        await db.transaction(async (tx: any) => {
            const alvo = await this.travarCofre(tx, dono, cofreId, aparelho, comGeracao);
            if (!alvo) throw erro('Cofre não encontrado.', 'NOT_FOUND');
            await this.exigeEscrita(tx, alvo, cofreId, opcoes, aparelho);
            const existente = await tx.select({ cofreId: cofreItens.cofreId }).from(cofreItens).where(eq(cofreItens.id, id)).limit(1);
            if (existente[0]) {
                // Mudar de cofre exige recifrar com a chave do cofre novo: o navegador manda o item já recifrado.
                if (permitidos && !permitidos.includes(existente[0].cofreId)) throw erro('Item não encontrado.', 'NOT_FOUND');
                if (existente[0].cofreId !== cofreId) {
                    // Tirar o item de um cofre compartilhado é escrever nele: mesmo selo e mesma geração, na ORIGEM.
                    const origem = await this.travarCofre(tx, dono, existente[0].cofreId, aparelho, comGeracao);
                    if (!origem) throw erro('Item não encontrado.', 'NOT_FOUND');
                    await this.exigeEscrita(tx, origem, existente[0].cofreId, { selo: opcoes.origemSelo, geracao: opcoes.origemGeracao }, aparelho);
                }
                await tx.update(cofreItens).set({ cofreId, dados, atualizadoEm: new Date() }).where(eq(cofreItens.id, id));
                return;
            }
            const total = await tx
                .select({ n: sql<number>`count(*)` })
                .from(cofreItens)
                .innerJoin(cofreCofres, eq(cofreCofres.id, cofreItens.cofreId))
                .where(eq(cofreCofres.dono, alvo.dono));
            if (Number(total[0]?.n ?? 0) >= MAX_ITENS) throw erro('Limite de itens atingido.', 'VALIDATION');
            // Cofre com gente dentro tem teto de itens: todo membro o baixa inteiro a cada GET /cofre.
            const compartilhado = await tx.select({ n: sql<number>`count(*)` }).from(cofreMembros).where(eq(cofreMembros.cofreId, cofreId));
            if (Number(compartilhado[0]?.n ?? 0) > 0) {
                const doCofre = await tx.select({ n: sql<number>`count(*)` }).from(cofreItens).where(eq(cofreItens.cofreId, cofreId));
                if (Number(doCofre[0]?.n ?? 0) >= MAX_ITENS_COMPARTILHADO) throw erro(`Cofre compartilhado cheio (${MAX_ITENS_COMPARTILHADO} itens). Mova itens para outro cofre.`, 'VALIDATION');
            }
            await tx.insert(cofreItens).values({ id, cofreId, dados });
        });
    }

    public async apagarItem(dono: string, idBruto: unknown, permitidos?: string[] | null, opcoes: { aparelho?: boolean } = {}): Promise<void> {
        const id = uuid(idBruto, 'id');
        const item = await db.select({ cofreId: cofreItens.cofreId }).from(cofreItens).where(eq(cofreItens.id, id)).limit(1);
        const acesso = item[0] ? await this.acessoAoCofre(dono, item[0].cofreId, opcoes.aparelho) : null;
        if (!item[0] || !acesso) throw erro('Item não encontrado.', 'NOT_FOUND');
        if (permitidos && !permitidos.includes(item[0].cofreId)) throw erro('Item não encontrado.', 'NOT_FOUND');
        if (acesso.papel === 'leitura') throw erro('Você só pode ler este cofre.', 'SEM_PERMISSAO');
        await db.delete(cofreItens).where(eq(cofreItens.id, id));
    }
}

export const cofreService = new CofreService();
