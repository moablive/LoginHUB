import { pgTable, serial, varchar, integer, timestamp, text, bigint } from 'drizzle-orm/pg-core';
import { usuarios } from './index';

// ==========================================
// LOGIN POR BIOMETRIA — passkeys / WebAuthn (db/010_passkeys.sql)
// ==========================================
// O hub guarda só a chave pública de cada aparelho. A coluna
// `aplicativos.webauthn_rp_id` (no index) diz a que domínio as passkeys do app
// ficam presas; NULL = app sem biometria.

/** Uma passkey da conta, como o próprio dono (ou o master) a enxerga. */
export interface Passkey {
    id: number;
    nome: string;
    criado_em: string | Date | null;
    ultimo_uso: string | Date | null;
}

/**
 * Resposta de `.../opcoes`: as opções que o navegador entrega ao
 * `navigator.credentials` e o passe assinado que amarra o desafio à conferência.
 */
export interface PasskeyOpcoes {
    opcoes: Record<string, unknown>;
    challengeToken: string;
}

export const usuariosPasskeys = pgTable('usuarios_passkeys', {
    id: serial('id').primaryKey(),
    usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    rpId: varchar('rp_id', { length: 255 }).notNull(),
    // base64url, como o navegador manda.
    credentialId: varchar('credential_id', { length: 1024 }).notNull().unique(),
    // Chave pública COSE em base64url.
    publicKey: text('public_key').notNull(),
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: varchar('transports', { length: 255 }),
    nome: varchar('nome', { length: 120 }).notNull().default('Aparelho'),
    criadoEm: timestamp('criado_em').defaultNow(),
    ultimoUso: timestamp('ultimo_uso'),
    // Preenchido = a passkey não entra mais (revogada pelo dono ou pelo master).
    revogadaEm: timestamp('revogada_em'),
});
