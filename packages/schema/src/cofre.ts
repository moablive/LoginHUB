import { pgTable, varchar, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core';


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
