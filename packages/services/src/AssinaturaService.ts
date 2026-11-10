import crypto from 'crypto';
import { db } from '@loginhub/database';
import {
    aplicativos,
    usuarios,
    niveisAcesso,
    planosApp,
    afiliados,
    assinaturas,
    assinaturaPagamentos,
} from '@loginhub/schema';
import type {
    PlanoApp,
    PlanoPublico,
    SalvarPlanoDTO,
    Afiliado,
    SalvarAfiliadoDTO,
    Assinatura,
    ResumoVendas,
    IniciarAssinaturaDTO,
    IniciarAssinaturaResposta,
    ConfirmarAssinaturaResposta,
    StatusAssinatura,
} from '@loginhub/schema';
import { and, eq, ne, sql, inArray, isNull, isNotNull } from 'drizzle-orm';
import { buildAssinaturaEmail } from './templates/assinaturaEmail';
import { emailService } from './EmailService';

/**
 * Venda de app por assinatura mensal (db/009_assinaturas_afiliados.sql).
 *
 * O dinheiro cai na conta do Mercado Pago da Astral Wave (`MP_ACCESS_TOKEN`, a
 * mesma da loja de tracks), por cartão automático: uma assinatura SEM plano
 * associado, criada `pending`, cujo `init_point` é a página onde a pessoa
 * cadastra o cartão. A `external_reference` é o `ref` da nossa linha.
 *
 * O aviso do Mercado Pago nunca é fonte de verdade: ele só diz "olhe esta
 * assinatura", e o estado vem de consultar a API de lá pelo id (`sincronizar`).
 * A mesma função serve o aviso, a volta do checkout e a conferência periódica,
 * então um aviso perdido se resolve sozinho na conferência seguinte.
 */

const MP_API = 'https://api.mercadopago.com';
const PREFIXO_REF = 'LH';
/** Checkout aberto e nunca pago deixa de ser conferido depois disto. */
const DIAS_CHECKOUT_ABERTO = 3;
const INTERVALO_CONFERENCIA_MS = 30 * 60 * 1000;

const erro = (message: string, code: string) => Object.assign(new Error(message), { code });

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const centavos = (v: number): number => Math.round(v * 100) / 100;

/** "49,90", "49.90" ou 49.9 → 49.9. */
const lerDinheiro = (v: unknown, campo: string): number => {
    const texto = String(v ?? '').trim();
    // Com vírgula, o ponto é separador de milhar ("1.234,50").
    const n = typeof v === 'number' ? v : Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto || NaN);
    if (!Number.isFinite(n)) throw erro(`${campo}: valor inválido.`, 'VALIDATION');
    return centavos(n);
};

const lerPct = (v: unknown, campo: string): number => {
    const n = lerDinheiro(v, campo);
    if (n < 0 || n > 100) throw erro(`${campo}: use um valor entre 0 e 100.`, 'VALIDATION');
    return n;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const normalizarCodigo = (v: string): string =>
    v
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

interface MpPreapproval {
    id: string;
    status: 'pending' | 'authorized' | 'paused' | 'cancelled' | string;
    external_reference?: string | null;
    init_point?: string;
    next_payment_date?: string | null;
}

interface PagamentoMp {
    id: string;
    valor: number;
    pagoEm: Date | null;
}

async function mp<T>(metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown): Promise<T> {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw erro('Mercado Pago não configurado (MP_ACCESS_TOKEN).', 'MP_INDISPONIVEL');
    const resposta = await fetch(`${MP_API}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
    });
    const texto = await resposta.text();
    if (!resposta.ok) {
        console.error(`[AssinaturaService] Mercado Pago ${metodo} ${caminho.split('?')[0]} → ${resposta.status}: ${texto.slice(0, 500)}`);
        throw erro('O Mercado Pago recusou a operação. Tente de novo em instantes.', 'MP_ERRO');
    }
    return (texto ? JSON.parse(texto) : {}) as T;
}

export class AssinaturaService {
    // ---------------------------------------------------------------- plano

    private async app(appId: number) {
        const rows = await db
            .select({ id: aplicativos.id, nome: aplicativos.nome, logo: aplicativos.logo, platformUrl: aplicativos.platformUrl, botUrl: aplicativos.botUrl })
            .from(aplicativos)
            .where(eq(aplicativos.id, appId))
            .limit(1);
        if (rows.length === 0) throw erro('Aplicativo não encontrado.', 'NOT_FOUND');
        return rows[0];
    }

    public async plano(appId: string): Promise<PlanoApp | null> {
        const rows = await db.select().from(planosApp).where(eq(planosApp.appId, Number(appId))).limit(1);
        const p = rows[0];
        if (!p) return null;
        return {
            app_id: p.appId,
            valor: num(p.valor),
            comissao_padrao_pct: num(p.comissaoPadraoPct),
            descricao: p.descricao,
            ativo: p.ativo,
            atualizado_em: p.atualizadoEm,
        };
    }

    public async salvarPlano(appId: string, data: SalvarPlanoDTO): Promise<PlanoApp> {
        await this.app(Number(appId));
        const valor = lerDinheiro(data.valor, 'Preço');
        if (valor <= 0) throw erro('Preço: informe um valor maior que zero.', 'VALIDATION');
        const atual = await this.plano(appId);
        const comissao = data.comissao_padrao_pct === undefined || data.comissao_padrao_pct === ''
            ? atual?.comissao_padrao_pct ?? 5
            : lerPct(data.comissao_padrao_pct, 'Comissão padrão');
        const descricao = String(data.descricao ?? atual?.descricao ?? 'Assinatura mensal').trim().slice(0, 120) || 'Assinatura mensal';
        const ativo = data.ativo ?? atual?.ativo ?? true;

        const valores = { valor: valor.toFixed(2), comissaoPadraoPct: comissao.toFixed(2), descricao, ativo, atualizadoEm: new Date() };
        await db.insert(planosApp).values({ appId: Number(appId), ...valores }).onConflictDoUpdate({ target: planosApp.appId, set: valores });
        return (await this.plano(appId))!;
    }

    /** O que a página de venda mostra. Plano desligado ou inexistente = 404. */
    public async planoPublico(appId: string, ref?: string | null): Promise<PlanoPublico> {
        const plano = await this.plano(appId);
        if (!plano || !plano.ativo) throw erro('Este aplicativo não está à venda.', 'NOT_FOUND');
        const app = await this.app(Number(appId));
        const afiliado = ref ? await this.afiliadoPorCodigo(Number(appId), ref) : null;
        return { app_id: app.id, app_nome: app.nome, valor: plano.valor, descricao: plano.descricao, afiliado: afiliado?.nome ?? null };
    }

    // ------------------------------------------------------------ afiliados

    private async afiliadoPorCodigo(appId: number, codigo: string) {
        const limpo = normalizarCodigo(codigo);
        if (!limpo) return null;
        const rows = await db
            .select()
            .from(afiliados)
            .where(and(eq(afiliados.appId, appId), sql`lower(${afiliados.codigo}) = ${limpo}`, eq(afiliados.ativo, true)))
            .limit(1);
        return rows[0] ?? null;
    }

    public async listarAfiliados(appId: string): Promise<Afiliado[]> {
        const app = await this.app(Number(appId));
        const plano = await this.plano(appId);
        const padrao = plano?.comissao_padrao_pct ?? 5;
        const base = (app.platformUrl || '').replace(/\/+$/, '');

        const lista = await db.select().from(afiliados).where(eq(afiliados.appId, Number(appId))).orderBy(afiliados.nome);
        const ativos = await db
            .select({ afiliadoId: assinaturas.afiliadoId, total: sql<number>`count(*)` })
            .from(assinaturas)
            .where(and(eq(assinaturas.appId, Number(appId)), eq(assinaturas.status, 'ativa'), isNotNull(assinaturas.afiliadoId)))
            .groupBy(assinaturas.afiliadoId);
        const somas = await db
            .select({
                afiliadoId: assinaturaPagamentos.afiliadoId,
                vendido: sql<string>`coalesce(sum(${assinaturaPagamentos.valor}), 0)`,
                aPagar: sql<string>`coalesce(sum(${assinaturaPagamentos.comissaoValor}) filter (where ${assinaturaPagamentos.comissaoPagaEm} is null), 0)`,
                paga: sql<string>`coalesce(sum(${assinaturaPagamentos.comissaoValor}) filter (where ${assinaturaPagamentos.comissaoPagaEm} is not null), 0)`,
            })
            .from(assinaturaPagamentos)
            .where(and(isNotNull(assinaturaPagamentos.afiliadoId), eq(assinaturaPagamentos.status, 'approved')))
            .groupBy(assinaturaPagamentos.afiliadoId);

        const ativosDe = new Map<number | null, number>(ativos.map((a: typeof ativos[0]) => [a.afiliadoId, num(a.total)]));
        const somaDe = new Map<number | null, { vendido: string; aPagar: string; paga: string }>(somas.map((s: typeof somas[0]) => [s.afiliadoId, s]));

        return lista.map((a: typeof lista[0]) => {
            const s = somaDe.get(a.id);
            return {
                id: a.id,
                app_id: a.appId,
                nome: a.nome,
                email: a.email,
                chave_pix: a.chavePix,
                codigo: a.codigo,
                comissao_pct: a.comissaoPct === null ? null : num(a.comissaoPct),
                comissao_efetiva_pct: a.comissaoPct === null ? padrao : num(a.comissaoPct),
                ativo: a.ativo,
                criado_em: a.criadoEm,
                link: `${base}/assine?ref=${encodeURIComponent(a.codigo)}`,
                assinantes_ativos: ativosDe.get(a.id) ?? 0,
                total_vendido: num(s?.vendido),
                comissao_a_pagar: num(s?.aPagar),
                comissao_paga: num(s?.paga),
            };
        });
    }

    private lerAfiliado(data: SalvarAfiliadoDTO) {
        const nome = String(data.nome ?? '').trim();
        if (!nome) throw erro('Nome do afiliado é obrigatório.', 'VALIDATION');
        const email = String(data.email ?? '').trim().toLowerCase() || null;
        if (email && !EMAIL_RE.test(email)) throw erro('E-mail do afiliado inválido.', 'VALIDATION');
        const codigo = normalizarCodigo(String(data.codigo ?? '').trim() || nome);
        if (codigo.length < 2) throw erro('Código do link: use pelo menos 2 letras ou números.', 'VALIDATION');
        const pct = data.comissao_pct === null || data.comissao_pct === undefined || data.comissao_pct === ''
            ? null
            : lerPct(data.comissao_pct, 'Comissão').toFixed(2);
        return {
            nome: nome.slice(0, 255),
            email,
            chavePix: String(data.chave_pix ?? '').trim().slice(0, 255) || null,
            codigo,
            comissaoPct: pct,
            ativo: data.ativo ?? true,
        };
    }

    public async criarAfiliado(appId: string, data: SalvarAfiliadoDTO): Promise<void> {
        await this.app(Number(appId));
        try {
            await db.insert(afiliados).values({ appId: Number(appId), ...this.lerAfiliado(data) });
        } catch (e: any) {
            if (e.code === '23505') throw erro('Já existe um afiliado com esse código de link.', 'DUPLICATE_ENTRY');
            throw e;
        }
    }

    public async atualizarAfiliado(id: string, data: SalvarAfiliadoDTO): Promise<void> {
        try {
            const rows = await db.update(afiliados).set(this.lerAfiliado(data)).where(eq(afiliados.id, Number(id))).returning({ id: afiliados.id });
            if (rows.length === 0) throw erro('Afiliado não encontrado.', 'NOT_FOUND');
        } catch (e: any) {
            if (e.code === '23505') throw erro('Já existe um afiliado com esse código de link.', 'DUPLICATE_ENTRY');
            throw e;
        }
    }

    /**
     * Só apaga quem nunca vendeu. Com venda no histórico, apagar levaria junto a
     * conta do que se deve (a FK zera o afiliado do pagamento): desative.
     */
    public async apagarAfiliado(id: string): Promise<void> {
        const vendas = await db.select({ total: sql<number>`count(*)` }).from(assinaturas).where(eq(assinaturas.afiliadoId, Number(id)));
        if (num(vendas[0]?.total) > 0) {
            throw erro('Este afiliado já tem indicações. Desative em vez de apagar, para não perder o histórico de comissões.', 'VALIDATION');
        }
        const rows = await db.delete(afiliados).where(eq(afiliados.id, Number(id))).returning({ id: afiliados.id });
        if (rows.length === 0) throw erro('Afiliado não encontrado.', 'NOT_FOUND');
    }

    /** Marca como paga toda a comissão em aberto do afiliado. Devolve o total. */
    public async pagarComissoes(id: string): Promise<{ total: number; mensalidades: number }> {
        const rows = await db
            .update(assinaturaPagamentos)
            .set({ comissaoPagaEm: new Date() })
            .where(and(eq(assinaturaPagamentos.afiliadoId, Number(id)), eq(assinaturaPagamentos.status, 'approved'), isNull(assinaturaPagamentos.comissaoPagaEm)))
            .returning({ valor: assinaturaPagamentos.comissaoValor });
        return { total: centavos(rows.reduce((t: number, r: { valor: string }) => t + num(r.valor), 0)), mensalidades: rows.length };
    }

    // ----------------------------------------------------------- assinantes

    public async listarAssinaturas(appId: string): Promise<Assinatura[]> {
        const lista = await db
            .select({
                id: assinaturas.id,
                app_id: assinaturas.appId,
                usuario_id: assinaturas.usuarioId,
                nome: assinaturas.nome,
                email: assinaturas.email,
                telefone: assinaturas.telefone,
                valor: assinaturas.valor,
                status: assinaturas.status,
                afiliado_id: assinaturas.afiliadoId,
                afiliado_nome: afiliados.nome,
                criado_em: assinaturas.criadoEm,
                ativada_em: assinaturas.ativadaEm,
                cancelada_em: assinaturas.canceladaEm,
                proxima_cobranca: assinaturas.proximaCobranca,
            })
            .from(assinaturas)
            .leftJoin(afiliados, eq(afiliados.id, assinaturas.afiliadoId))
            // Checkout que a pessoa abriu e largou não é assinante: fica fora.
            .where(and(eq(assinaturas.appId, Number(appId)), ne(assinaturas.status, 'iniciada')))
            .orderBy(sql`${assinaturas.ativadaEm} desc nulls last`);
        const pagos = await db
            .select({
                assinaturaId: assinaturaPagamentos.assinaturaId,
                qtd: sql<number>`count(*)`,
                total: sql<string>`coalesce(sum(${assinaturaPagamentos.valor}), 0)`,
            })
            .from(assinaturaPagamentos)
            .where(eq(assinaturaPagamentos.status, 'approved'))
            .groupBy(assinaturaPagamentos.assinaturaId);
        const pagoDe = new Map<number, { qtd: number; total: string }>(pagos.map((p: typeof pagos[0]) => [p.assinaturaId, p]));
        return lista.map((a: typeof lista[0]) => ({
            ...a,
            valor: num(a.valor),
            status: a.status as StatusAssinatura,
            mensalidades_pagas: num(pagoDe.get(a.id)?.qtd),
            total_pago: num(pagoDe.get(a.id)?.total),
        }));
    }

    public async resumo(appId: string): Promise<ResumoVendas> {
        const ativas = await db
            .select({ qtd: sql<number>`count(*)`, mensal: sql<string>`coalesce(sum(${assinaturas.valor}), 0)` })
            .from(assinaturas)
            .where(and(eq(assinaturas.appId, Number(appId)), eq(assinaturas.status, 'ativa')));
        const pagos = await db
            .select({
                recebido: sql<string>`coalesce(sum(${assinaturaPagamentos.valor}), 0)`,
                aPagar: sql<string>`coalesce(sum(${assinaturaPagamentos.comissaoValor}) filter (where ${assinaturaPagamentos.comissaoPagaEm} is null), 0)`,
                paga: sql<string>`coalesce(sum(${assinaturaPagamentos.comissaoValor}) filter (where ${assinaturaPagamentos.comissaoPagaEm} is not null), 0)`,
            })
            .from(assinaturaPagamentos)
            .innerJoin(assinaturas, eq(assinaturas.id, assinaturaPagamentos.assinaturaId))
            .where(and(eq(assinaturas.appId, Number(appId)), eq(assinaturaPagamentos.status, 'approved')));
        return {
            assinantes_ativos: num(ativas[0]?.qtd),
            receita_mensal: num(ativas[0]?.mensal),
            total_recebido: num(pagos[0]?.recebido),
            comissao_a_pagar: num(pagos[0]?.aPagar),
            comissao_paga: num(pagos[0]?.paga),
        };
    }

    // ------------------------------------------------------------- checkout

    /**
     * Abre o checkout: grava a linha `iniciada` ANTES de falar com o Mercado
     * Pago (o aviso de lá precisa achar a quem pertence) e devolve a página
     * onde a pessoa cadastra o cartão.
     */
    public async iniciar(appId: string, data: IniciarAssinaturaDTO): Promise<IniciarAssinaturaResposta> {
        const plano = await this.plano(appId);
        if (!plano || !plano.ativo) throw erro('Este aplicativo não está à venda.', 'NOT_FOUND');
        const app = await this.app(Number(appId));
        if (!app.platformUrl) throw erro('Aplicativo sem endereço cadastrado.', 'VALIDATION');

        const nome = String(data.nome ?? '').trim().slice(0, 255);
        const email = String(data.email ?? '').trim().toLowerCase();
        const telefone = String(data.telefone ?? '').replace(/\D/g, '').slice(0, 20) || null;
        if (nome.length < 2) throw erro('Informe o seu nome.', 'VALIDATION');
        if (!EMAIL_RE.test(email) || email.length > 255) throw erro('Informe um e-mail válido.', 'VALIDATION');

        const jaAtiva = await db
            .select({ id: assinaturas.id })
            .from(assinaturas)
            .where(and(eq(assinaturas.appId, app.id), sql`lower(${assinaturas.email}) = ${email}`, inArray(assinaturas.status, ['ativa', 'pausada'])))
            .limit(1);
        if (jaAtiva.length > 0) throw erro('Este e-mail já tem uma assinatura. Entre no aplicativo com ele.', 'DUPLICATE_ENTRY');

        // Conta que existe sem nunca ter assinado foi criada à mão pelo admin:
        // não é o checkout que mexe nela.
        const conta = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.appId, app.id), sql`lower(${usuarios.email}) = ${email}`)).limit(1);
        if (conta.length > 0) {
            const jaAssinou = await db.select({ id: assinaturas.id }).from(assinaturas).where(and(eq(assinaturas.appId, app.id), eq(assinaturas.usuarioId, conta[0].id))).limit(1);
            if (jaAssinou.length === 0) throw erro('Este e-mail já tem conta no aplicativo. Entre com ele.', 'DUPLICATE_ENTRY');
        }

        const afiliado = data.ref ? await this.afiliadoPorCodigo(app.id, data.ref) : null;
        const ref = `${PREFIXO_REF}-${app.id}-${crypto.randomBytes(12).toString('hex')}`;
        const base = app.platformUrl.replace(/\/+$/, '');

        const criada = await db
            .insert(assinaturas)
            .values({ appId: app.id, afiliadoId: afiliado?.id ?? null, nome, email, telefone, valor: plano.valor.toFixed(2), ref })
            .returning({ id: assinaturas.id });

        const pre = await mp<MpPreapproval>('POST', '/preapproval', {
            reason: `${app.nome} — ${plano.descricao}`,
            external_reference: ref,
            payer_email: email,
            auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: plano.valor, currency_id: 'BRL' },
            back_url: `${base}/assine/obrigado?pedido=${ref}`,
            status: 'pending',
        });
        if (!pre.id || !pre.init_point) throw erro('O Mercado Pago não devolveu a página de pagamento.', 'MP_ERRO');

        await db.update(assinaturas).set({ mpPreapprovalId: String(pre.id) }).where(eq(assinaturas.id, criada[0].id));
        return { url: pre.init_point, ref };
    }

    /** Volta do checkout: a página de obrigado pergunta se o cartão já entrou. */
    public async confirmar(ref: string): Promise<ConfirmarAssinaturaResposta> {
        const linha = await db.select().from(assinaturas).where(eq(assinaturas.ref, String(ref ?? '').slice(0, 64))).limit(1);
        if (linha.length === 0) throw erro('Pedido não encontrado.', 'NOT_FOUND');
        if (linha[0].mpPreapprovalId && linha[0].status === 'iniciada') {
            await this.sincronizar(linha[0].mpPreapprovalId).catch((e) => console.error('[AssinaturaService] confirmar:', e));
        }
        const atual = await db.select({ status: assinaturas.status, email: assinaturas.email }).from(assinaturas).where(eq(assinaturas.id, linha[0].id)).limit(1);
        return { status: atual[0].status as StatusAssinatura, email: atual[0].email, acesso_liberado: atual[0].status === 'ativa' };
    }

    // -------------------------------------------------- estado (Mercado Pago)

    /** Aviso do Mercado Pago. Qualquer tipo termina em `sincronizar`. */
    public async webhook(tipo: string, id: string): Promise<void> {
        if (!id) return;
        if (tipo === 'subscription_preapproval') {
            await this.sincronizar(id);
        } else if (tipo === 'subscription_authorized_payment') {
            const fatura = await mp<{ preapproval_id?: string }>('GET', `/authorized_payments/${encodeURIComponent(id)}`);
            if (fatura.preapproval_id) await this.sincronizar(String(fatura.preapproval_id));
        } else if (tipo === 'payment') {
            const pagamento = await mp<{ external_reference?: string | null }>('GET', `/v1/payments/${encodeURIComponent(id)}`);
            const ref = String(pagamento.external_reference ?? '');
            if (!ref.startsWith(`${PREFIXO_REF}-`)) return;
            const linha = await db.select({ pre: assinaturas.mpPreapprovalId }).from(assinaturas).where(eq(assinaturas.ref, ref)).limit(1);
            if (linha[0]?.pre) await this.sincronizar(linha[0].pre);
        }
    }

    /**
     * Lê a assinatura no Mercado Pago e põe a nossa linha (e a conta do
     * usuário) no mesmo estado. Idempotente: pode rodar quantas vezes for.
     */
    public async sincronizar(preapprovalId: string): Promise<void> {
        const pre = await mp<MpPreapproval>('GET', `/preapproval/${encodeURIComponent(preapprovalId)}`);
        const linhas = await db
            .select()
            .from(assinaturas)
            .where(pre.external_reference
                ? sql`${assinaturas.mpPreapprovalId} = ${String(pre.id)} or ${assinaturas.ref} = ${String(pre.external_reference)}`
                : eq(assinaturas.mpPreapprovalId, String(pre.id)))
            .limit(1);
        const linha = linhas[0];
        // Assinatura de outro produto da mesma conta do Mercado Pago: não é nossa.
        if (!linha) return;

        const proxima = pre.next_payment_date ? new Date(pre.next_payment_date) : null;
        await db
            .update(assinaturas)
            .set({ mpPreapprovalId: String(pre.id), conferidaEm: new Date(), ...(proxima && !Number.isNaN(proxima.getTime()) ? { proximaCobranca: proxima } : {}) })
            .where(eq(assinaturas.id, linha.id));

        if (pre.status === 'authorized') await this.ativar(linha.id);
        else if (pre.status === 'paused') await this.suspender(linha.id, 'pausada');
        else if (pre.status === 'cancelled') await this.suspender(linha.id, 'cancelada');

        if (pre.status !== 'pending') await this.registrarPagamentos(linha.id, String(pre.id), linha.ref);
    }

    /**
     * Cartão autorizado: a conta do usuário nasce (ou volta a ficar ativa) e o
     * e-mail sai. O UPDATE condicional é o que garante UMA vez só — aviso
     * repetido do Mercado Pago encontra a linha já ativa e para aqui.
     */
    private async ativar(assinaturaId: number): Promise<void> {
        const mudou = await db
            .update(assinaturas)
            .set({ status: 'ativa', ativadaEm: new Date(), canceladaEm: null })
            .where(and(eq(assinaturas.id, assinaturaId), ne(assinaturas.status, 'ativa')))
            .returning();
        const a = mudou[0];
        if (!a) return;

        const app = await this.app(a.appId);
        const existente = await db
            .select({ id: usuarios.id })
            .from(usuarios)
            .where(and(eq(usuarios.appId, a.appId), sql`lower(${usuarios.email}) = ${a.email.toLowerCase()}`))
            .limit(1);

        const html = (reativada: boolean) =>
            buildAssinaturaEmail({
                appName: app.nome,
                platformUrl: app.platformUrl || process.env.UI_PUBLIC_URL || '',
                botUrl: app.botUrl,
                appLogo: app.logo,
                nome: a.nome,
                email: a.email,
                valor: num(a.valor),
                reativada,
            });

        if (existente.length > 0) {
            await db.update(usuarios).set({ status: 'ativo' }).where(eq(usuarios.id, existente[0].id));
            await db.update(assinaturas).set({ usuarioId: existente[0].id }).where(eq(assinaturas.id, a.id));
            const enviado = await emailService.sendEmail(a.email, `Sua assinatura do ${app.nome} está ativa de novo`, html(true), { appId: a.appId, appNome: app.nome });
            if (!enviado) console.error(`[AssinaturaService] E-mail de reativação NÃO saiu para ${a.email} (assinatura ${a.id}).`);
            return;
        }

        // Importação tardia: o index reexporta este arquivo, então no topo o
        // `UserService` ainda não existiria.
        const { UserService } = await import('./index');
        const criado = await new UserService().addUser({
            app_id: String(a.appId),
            nome: a.nome,
            email: a.email,
            role: 'user',
            telefone: a.telefone,
            emailHtml: html(false),
        });
        await db.update(assinaturas).set({ usuarioId: Number(criado.user.id) }).where(eq(assinaturas.id, a.id));
        if (!criado.emailSent) {
            console.error(`[AssinaturaService] E-mail de boas-vindas NÃO saiu para ${a.email} (assinatura ${a.id}). Use "Reenviar acesso" no painel.`);
        }
    }

    /**
     * Assinatura pausada ou cancelada: a conta para de entrar. Só mexe em conta
     * de nível `user` — um admin que também assina não perde o acesso por aqui.
     */
    private async suspender(assinaturaId: number, status: 'pausada' | 'cancelada'): Promise<void> {
        const mudou = await db
            .update(assinaturas)
            .set({ status, ...(status === 'cancelada' ? { canceladaEm: new Date() } : {}) })
            .where(and(eq(assinaturas.id, assinaturaId), ne(assinaturas.status, status)))
            .returning({ usuarioId: assinaturas.usuarioId });
        const usuarioId = mudou[0]?.usuarioId;
        if (!usuarioId) return;
        const nivelUser = await db.select({ id: niveisAcesso.id }).from(niveisAcesso).where(eq(niveisAcesso.nome, 'user')).limit(1);
        if (nivelUser.length === 0) return;
        await db.update(usuarios).set({ status: 'inativo' }).where(and(eq(usuarios.id, usuarioId), eq(usuarios.nivelAcessoId, nivelUser[0].id)));
    }

    /**
     * Mensalidades aprovadas → `assinatura_pagamentos`, com a comissão do dia.
     * Duas fontes no Mercado Pago (as faturas da assinatura e os pagamentos com
     * a nossa referência), as duas pela chave do PAGAMENTO, que é única aqui.
     */
    private async registrarPagamentos(assinaturaId: number, preapprovalId: string, ref: string): Promise<void> {
        const achados = new Map<string, PagamentoMp>();

        try {
            const faturas = await mp<{ results?: Array<{ transaction_amount?: number; payment?: { id?: number | string; status?: string }; debit_date?: string }> }>(
                'GET',
                `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`,
            );
            for (const f of faturas.results ?? []) {
                if (f.payment?.id && f.payment.status === 'approved') {
                    achados.set(String(f.payment.id), { id: String(f.payment.id), valor: num(f.transaction_amount), pagoEm: f.debit_date ? new Date(f.debit_date) : null });
                }
            }
        } catch (e) {
            console.warn('[AssinaturaService] faturas da assinatura indisponíveis; seguindo pelos pagamentos.');
        }

        try {
            const pagamentos = await mp<{ results?: Array<{ id: number | string; status?: string; transaction_amount?: number; date_approved?: string }> }>(
                'GET',
                `/v1/payments/search?external_reference=${encodeURIComponent(ref)}&limit=50`,
            );
            for (const p of pagamentos.results ?? []) {
                if (p.status === 'approved') {
                    achados.set(String(p.id), { id: String(p.id), valor: num(p.transaction_amount), pagoEm: p.date_approved ? new Date(p.date_approved) : null });
                }
            }
        } catch (e) {
            console.warn('[AssinaturaService] busca de pagamentos indisponível.');
        }

        if (achados.size === 0) return;

        const a = (await db.select().from(assinaturas).where(eq(assinaturas.id, assinaturaId)).limit(1))[0];
        if (!a) return;
        let pct = 0;
        let afiliadoId: number | null = null;
        if (a.afiliadoId) {
            const af = (await db.select().from(afiliados).where(eq(afiliados.id, a.afiliadoId)).limit(1))[0];
            // Afiliado desativado para de ganhar nas mensalidades seguintes.
            if (af?.ativo) {
                afiliadoId = af.id;
                pct = af.comissaoPct === null ? (await this.plano(String(a.appId)))?.comissao_padrao_pct ?? 0 : num(af.comissaoPct);
            }
        }

        for (const p of achados.values()) {
            const pagoEm = p.pagoEm && !Number.isNaN(p.pagoEm.getTime()) ? p.pagoEm : new Date();
            await db
                .insert(assinaturaPagamentos)
                .values({
                    assinaturaId,
                    mpPaymentId: p.id,
                    valor: p.valor.toFixed(2),
                    status: 'approved',
                    pagoEm,
                    afiliadoId,
                    comissaoPct: afiliadoId ? pct.toFixed(2) : null,
                    comissaoValor: (afiliadoId ? centavos((p.valor * pct) / 100) : 0).toFixed(2),
                })
                .onConflictDoNothing({ target: assinaturaPagamentos.mpPaymentId });
        }
    }

    // ------------------------------------------------------ ações do painel

    /** Cancela no Mercado Pago (para de cobrar) e desliga o acesso. */
    public async cancelar(id: string): Promise<void> {
        const a = (await db.select().from(assinaturas).where(eq(assinaturas.id, Number(id))).limit(1))[0];
        if (!a) throw erro('Assinatura não encontrada.', 'NOT_FOUND');
        if (!a.mpPreapprovalId) throw erro('Assinatura sem registro no Mercado Pago.', 'VALIDATION');
        await mp('PUT', `/preapproval/${encodeURIComponent(a.mpPreapprovalId)}`, { status: 'cancelled' });
        await this.sincronizar(a.mpPreapprovalId);
    }

    /** Manda de novo o e-mail de boas-vindas, com link de senha novo. */
    public async reenviarAcesso(id: string): Promise<{ emailSent: boolean }> {
        const a = (await db.select().from(assinaturas).where(eq(assinaturas.id, Number(id))).limit(1))[0];
        if (!a) throw erro('Assinatura não encontrada.', 'NOT_FOUND');
        if (a.status !== 'ativa' || !a.usuarioId) throw erro('Só dá para reenviar o acesso de uma assinatura ativa.', 'VALIDATION');
        const app = await this.app(a.appId);
        const { UserService } = await import('./index');
        const r = await new UserService().resetUserPassword(
            String(a.usuarioId),
            buildAssinaturaEmail({
                appName: app.nome,
                platformUrl: app.platformUrl || process.env.UI_PUBLIC_URL || '',
                botUrl: app.botUrl,
                appLogo: app.logo,
                nome: a.nome,
                email: a.email,
                valor: num(a.valor),
            }),
        );
        return { emailSent: r.emailSent };
    }

    /** Confere no Mercado Pago tudo o que pode ter mudado. */
    public async conferirTodas(): Promise<void> {
        const limite = new Date(Date.now() - DIAS_CHECKOUT_ABERTO * 24 * 60 * 60 * 1000);
        const lista = await db
            .select({ pre: assinaturas.mpPreapprovalId })
            .from(assinaturas)
            .where(and(
                isNotNull(assinaturas.mpPreapprovalId),
                sql`(${assinaturas.status} in ('ativa', 'pausada') or (${assinaturas.status} = 'iniciada' and ${assinaturas.criadoEm} > ${limite}))`,
            ));
        for (const a of lista) {
            try {
                await this.sincronizar(a.pre!);
            } catch (e) {
                console.error(`[AssinaturaService] conferência de ${a.pre} falhou:`, (e as Error).message);
            }
        }
    }
}

export const assinaturaService = new AssinaturaService();

let conferencia: NodeJS.Timeout | null = null;

/**
 * Rede de segurança dos avisos: a cada 30 minutos confere as assinaturas no
 * Mercado Pago. Sem `MP_ACCESS_TOKEN` não liga (hub sem venda configurada).
 */
export const iniciarConferenciaDeAssinaturas = (): void => {
    if (conferencia || !process.env.MP_ACCESS_TOKEN) return;
    conferencia = setInterval(() => void assinaturaService.conferirTodas().catch((e) => console.error('[AssinaturaService] conferência:', e)), INTERVALO_CONFERENCIA_MS);
    conferencia.unref();
};
