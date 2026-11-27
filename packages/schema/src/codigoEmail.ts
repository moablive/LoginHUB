import { pgTable, uuid, varchar, integer, smallint, timestamp } from 'drizzle-orm/pg-core';

// ==========================================
// LOGIN POR CÓDIGO DE E-MAIL (db/024_login_codigo_email.sql)
// ==========================================

export const loginCodigosEmail = pgTable('login_codigos_email', {
    id: uuid('id').primaryKey(),
    emailHash: varchar('email_hash', { length: 64 }).notNull(),
    usuarioIds: integer('usuario_ids').array().notNull(),
    codigoHash: varchar('codigo_hash', { length: 64 }).notNull(),
    tentativas: smallint('tentativas').notNull().default(0),
    maxTentativas: smallint('max_tentativas').notNull().default(5),
    expiraEm: timestamp('expira_em').notNull(),
    consumidoEm: timestamp('consumido_em'),
    ipHash: varchar('ip_hash', { length: 64 }),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
});

/** Resposta de `POST /auth/email/start`: igual exista a conta ou não. */
export interface CodigoEmailIniciado {
    challengeId: string;
    /** Segundos de validade do código. */
    expiresIn: number;
    /** Segundos até poder pedir outro. */
    reenvioEm: number;
}
