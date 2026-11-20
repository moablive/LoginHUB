import { pgTable, varchar, text, timestamp, uuid, jsonb, integer } from 'drizzle-orm/pg-core';


// ==========================================
// COFRE DE SENHAS (db/013_cofre.sql, 19/11/2026)
// ==========================================
// O servidor só guarda e devolve texto cifrado. Quem cifra e decifra é o
// navegador (apps/ui/src/features/cofre/cripto.ts). Os campos `dados` e
// `chave_por_*` têm o formato "v1.<nonce base64>.<cifra base64>".

export const cofreContas = pgTable('cofre_contas', {
    dono: varchar('dono', { length: 64 }).primaryKey(),
    kdf: jsonb('kdf').notNull(),
    chavePorSenha: text('chave_por_senha').notNull(),
    chavePorKit: text('chave_por_kit').notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em').notNull().defaultNow(),
});

export const cofreCofres = pgTable('cofre_cofres', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    dados: text('dados').notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em').notNull().defaultNow(),
});

export const cofreItens = pgTable('cofre_itens', {
    id: uuid('id').primaryKey(),
    cofreId: uuid('cofre_id').notNull().references(() => cofreCofres.id, { onDelete: 'cascade' }),
    dados: text('dados').notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em').notNull().defaultNow(),
});

/**
 * Máquina aprovada para o CLI `hub-pass` (db/014). `chavePorAparelho` é a chave
 * da conta embrulhada pela chave que só a máquina tem; revogar zera o embrulho.
 */
export const cofreAparelhos = pgTable('cofre_aparelhos', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 120 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    chavePorAparelho: text('chave_por_aparelho'),
    ip: varchar('ip', { length: 64 }),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    ultimoUso: timestamp('ultimo_uso'),
    revogadoEm: timestamp('revogado_em'),
});

/**
 * Digital que abre o cofre (db/015): passkey com PRF. `chavePorDigital` é a chave
 * da conta embrulhada pela chave derivada do PRF, que só o aparelho produz.
 */
export const cofreDigitais = pgTable('cofre_digitais', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 120 }).notNull(),
    credencialId: varchar('credencial_id', { length: 1400 }).notNull(),
    prfSal: varchar('prf_sal', { length: 64 }).notNull(),
    chavePorDigital: text('chave_por_digital'),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    ultimoUso: timestamp('ultimo_uso'),
    revogadoEm: timestamp('revogado_em'),
});

/**
 * Entrada pelo cofre (db/016): chave pública Ed25519 de uma conta de app. A
 * privada mora cifrada num item do cofre do `dono`; o hub só confere assinaturas.
 */
export const cofreEntradas = pgTable('cofre_entradas', {
    id: uuid('id').primaryKey(),
    dono: varchar('dono', { length: 64 }).notNull().references(() => cofreContas.dono, { onDelete: 'cascade' }),
    // FK para usuarios(id) fica só no SQL (db/016): importar `usuarios` daqui faria um ciclo com o index.
    usuarioId: integer('usuario_id').notNull(),
    chavePublica: varchar('chave_publica', { length: 64 }).notNull(),
    nome: varchar('nome', { length: 120 }).notNull(),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
    ultimoUso: timestamp('ultimo_uso'),
    revogadaEm: timestamp('revogada_em'),
});

/** O que o cofre mostra antes de guardar ou de assinar uma entrada (POST /cofre/entradas/pedido). */
export interface CofreEntradaPedido {
    acao: 'cadastro' | 'entrar';
    app: { id: number; nome: string; origem: string };
    /** Só no cadastro: a conta do app que a chave vai abrir. */
    conta?: { id: number; nome: string | null; email: string };
}

/** POST /cofre/entradas */
export interface CofreEntradaNova {
    id: string;
    passe: string;
    nome: string;
    chave_publica: string;
    /** Assinatura Ed25519 (base64url) da mensagem de cadastro: prova que a privada existe. */
    assinatura: string;
}

/** Entrada na lista do app (sem a chave). */
export interface CofreEntrada {
    id: string;
    nome: string;
    criado_em: string | Date;
    ultimo_uso: string | Date | null;
}

/** Digital ativa, como vem no GET /cofre: o navegador precisa disto para abrir. */
export interface CofreDigitalEmbrulho {
    id: string;
    credencial_id: string;
    prf_sal: string;
    chave_por_digital: string;
}

/** Digital na lista da tela (sem embrulho). */
export interface CofreDigital {
    id: string;
    nome: string;
    criado_em: string | Date;
    ultimo_uso: string | Date | null;
}

/** POST /cofre/digitais */
export interface CofreDigitalNova {
    id: string;
    nome: string;
    credencial_id: string;
    prf_sal: string;
    chave_por_digital: string;
}

export interface CofreAparelho {
    id: string;
    nome: string;
    ip: string | null;
    criado_em: string | Date;
    ultimo_uso: string | Date | null;
    revogado: boolean;
}

/** Parâmetros do Argon2id da palavra-passe. Públicos: sem a palavra-passe não servem. */
export interface CofreKdf {
    alg: 'argon2id';
    /** Passadas. */
    t: number;
    /** Memória em KiB. */
    m: number;
    /** Paralelismo. */
    p: number;
    /** Sal em base64. */
    salt: string;
}

export interface CofreConta {
    kdf: CofreKdf;
    chave_por_senha: string;
    chave_por_kit: string;
}

export interface CofreRegistro {
    id: string;
    dados: string;
    atualizado_em: string | Date;
}

export interface CofreItemRegistro extends CofreRegistro {
    cofre_id: string;
}

/** Tudo o que o dono tem, cifrado. Pequeno o bastante para vir de uma vez. */
export interface CofreEstado {
    /** 'master' ou 'u:<id>': entra nos dados associados da cifra. */
    dono: string;
    conta: CofreConta | null;
    /** Só quando quem pede é um aparelho aprovado: a chave da conta embrulhada pela chave dele. */
    aparelho?: { id: string; chave_por_aparelho: string };
    /** Digitais ativas (db/015): abrem o cofre com Touch ID/Face ID neste ou noutro aparelho. */
    digitais?: CofreDigitalEmbrulho[];
    cofres: CofreRegistro[];
    itens: CofreItemRegistro[];
}
