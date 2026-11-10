import { pgTable, serial, varchar, integer, timestamp, boolean, numeric } from 'drizzle-orm/pg-core';
import { aplicativos, usuarios } from './index';

// ==========================================
// VENDA DE APP POR ASSINATURA (db/009_assinaturas_afiliados.sql)
// ==========================================
// O hub é o dono da venda: preço, afiliados, assinantes e comissões. O dinheiro
// cai na conta do Mercado Pago da Astral Wave (MP_ACCESS_TOKEN), por cartão
// automático. As referências a `aplicativos`/`usuarios` são funções, então a
// importação circular com o index só é lida depois que os dois carregaram.

export type StatusAssinatura = 'iniciada' | 'ativa' | 'pausada' | 'cancelada';

/** Preço da mensalidade de um app e a comissão padrão dos afiliados. */
export interface PlanoApp {
    app_id: number;
    valor: number;
    comissao_padrao_pct: number;
    descricao: string;
    ativo: boolean;
    atualizado_em?: string | Date | null;
}

export interface SalvarPlanoDTO {
    valor: number | string;
    comissao_padrao_pct?: number | string;
    descricao?: string;
    ativo?: boolean;
}

/** O que a página de venda (pública) enxerga do plano. */
export interface PlanoPublico {
    app_id: number;
    app_nome: string;
    valor: number;
    descricao: string;
    /** Nome do afiliado quando o `?ref=` do link existe e está ativo. */
    afiliado?: string | null;
}

export interface Afiliado {
    id: number;
    app_id: number;
    nome: string;
    email: string | null;
    chave_pix: string | null;
    codigo: string;
    /** NULL = usa a comissão padrão do plano. */
    comissao_pct: number | null;
    /** Comissão que vale hoje (a própria ou a padrão). */
    comissao_efetiva_pct: number;
    ativo: boolean;
    criado_em?: string | Date | null;
    /** Link pronto para divulgar. */
    link: string;
    assinantes_ativos: number;
    /** Mensalidades pagas pelos indicados, no total. */
    total_vendido: number;
    comissao_a_pagar: number;
    comissao_paga: number;
}

export interface SalvarAfiliadoDTO {
    nome: string;
    email?: string | null;
    chave_pix?: string | null;
    codigo?: string;
    comissao_pct?: number | string | null;
    ativo?: boolean;
}

export interface Assinatura {
    id: number;
    app_id: number;
    usuario_id: number | null;
    nome: string;
    email: string;
    telefone: string | null;
    valor: number;
    status: StatusAssinatura;
    afiliado_id: number | null;
    afiliado_nome: string | null;
    criado_em?: string | Date | null;
    ativada_em?: string | Date | null;
    cancelada_em?: string | Date | null;
    proxima_cobranca?: string | Date | null;
    mensalidades_pagas: number;
    total_pago: number;
}

/** Números do topo da tela de vendas. */
export interface ResumoVendas {
    assinantes_ativos: number;
    receita_mensal: number;
    total_recebido: number;
    comissao_a_pagar: number;
    comissao_paga: number;
}

export interface IniciarAssinaturaDTO {
    nome: string;
    email: string;
    telefone?: string | null;
    /** Código do afiliado que veio no link. */
    ref?: string | null;
}

export interface IniciarAssinaturaResposta {
    /** Página do Mercado Pago onde a pessoa cadastra o cartão. */
    url: string;
    ref: string;
}

export interface ConfirmarAssinaturaResposta {
    status: StatusAssinatura;
    email: string;
    /** O e-mail com o link de senha, o PWA e o bot saiu nesta chamada ou antes. */
    acesso_liberado: boolean;
}

export const planosApp = pgTable('planos_app', {
    appId: integer('app_id').primaryKey().references(() => aplicativos.id, { onDelete: 'cascade' }),
    valor: numeric('valor', { precision: 10, scale: 2 }).notNull(),
    comissaoPadraoPct: numeric('comissao_padrao_pct', { precision: 5, scale: 2 }).notNull().default('5'),
    descricao: varchar('descricao', { length: 120 }).notNull().default('Assinatura mensal'),
    ativo: boolean('ativo').notNull().default(true),
    atualizadoEm: timestamp('atualizado_em').defaultNow(),
});

export const afiliados = pgTable('afiliados', {
    id: serial('id').primaryKey(),
    appId: integer('app_id').notNull().references(() => aplicativos.id, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }),
    chavePix: varchar('chave_pix', { length: 255 }),
    // Único por app sem diferença de caixa (índice afiliados_app_codigo_idx).
    codigo: varchar('codigo', { length: 40 }).notNull(),
    comissaoPct: numeric('comissao_pct', { precision: 5, scale: 2 }),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: timestamp('criado_em').defaultNow(),
});

export const assinaturas = pgTable('assinaturas', {
    id: serial('id').primaryKey(),
    appId: integer('app_id').notNull().references(() => aplicativos.id, { onDelete: 'cascade' }),
    usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
    afiliadoId: integer('afiliado_id').references(() => afiliados.id, { onDelete: 'set null' }),
    nome: varchar('nome', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    telefone: varchar('telefone', { length: 20 }),
    valor: numeric('valor', { precision: 10, scale: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('iniciada'),
    // external_reference no Mercado Pago.
    ref: varchar('ref', { length: 64 }).notNull().unique(),
    mpPreapprovalId: varchar('mp_preapproval_id', { length: 64 }).unique(),
    criadoEm: timestamp('criado_em').defaultNow(),
    ativadaEm: timestamp('ativada_em'),
    canceladaEm: timestamp('cancelada_em'),
    proximaCobranca: timestamp('proxima_cobranca'),
    // Última vez que o estado foi conferido no Mercado Pago.
    conferidaEm: timestamp('conferida_em'),
});

export const assinaturaPagamentos = pgTable('assinatura_pagamentos', {
    id: serial('id').primaryKey(),
    assinaturaId: integer('assinatura_id').notNull().references(() => assinaturas.id, { onDelete: 'cascade' }),
    mpPaymentId: varchar('mp_payment_id', { length: 64 }).notNull().unique(),
    valor: numeric('valor', { precision: 10, scale: 2 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    pagoEm: timestamp('pago_em'),
    afiliadoId: integer('afiliado_id').references(() => afiliados.id, { onDelete: 'set null' }),
    // Porcentagem do dia da cobrança: mudar a comissão depois não reescreve o que já se deve.
    comissaoPct: numeric('comissao_pct', { precision: 5, scale: 2 }),
    comissaoValor: numeric('comissao_valor', { precision: 10, scale: 2 }).notNull().default('0'),
    // NULL = ainda a pagar ao afiliado.
    comissaoPagaEm: timestamp('comissao_paga_em'),
    criadoEm: timestamp('criado_em').defaultNow(),
});
