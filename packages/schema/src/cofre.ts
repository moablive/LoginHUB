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
    conta: CofreConta | null;
    cofres: CofreRegistro[];
    itens: CofreItemRegistro[];
}
