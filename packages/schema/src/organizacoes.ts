import { pgTable, varchar, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { usuarios, categorias } from './index';

// ==========================================
// ADMINS DE ORGANIZAÇÃO (db/012_admins_organizacao.sql, 19/11/2026)
// ==========================================
// Organização = categoria do painel. O admin de organização é uma conta comum
// do app "LoginHUB · Painel" (`aplicativos.painel_do_hub`), com 2FA como todas.
// Cada linha daqui dá a ele o poder sobre UMA organização: ver os apps dela,
// gerir os usuários desses apps e convidar outros admins para ela.

export const adminsOrganizacao = pgTable('admins_organizacao', {
    usuarioId: integer('usuario_id').notNull().references(() => usuarios.id, { onDelete: 'cascade' }),
    categoriaId: integer('categoria_id').notNull().references(() => categorias.id, { onDelete: 'cascade' }),
    convidadoPor: varchar('convidado_por', { length: 255 }).notNull().default('master'),
    criadoEm: timestamp('criado_em').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.usuarioId, t.categoriaId] })]);

/**
 * Quem está usando o painel e o que pode. `master` = tudo; senão, só as
 * organizações listadas. O front usa para montar a tela; quem DECIDE é a API.
 */
export interface EscopoDoPainel {
    master: boolean;
    nome: string;
    email: string;
    organizacoes: Array<{ id: number; nome: string }>;
}

/** Um admin de organização, como a gaveta "Admins" o mostra. */
export interface AdminOrganizacao {
    usuario_id: number;
    nome: string;
    email: string;
    status: string | null;
    /** Já escaneou o QR do autenticador (convite concluído). */
    dois_fatores_ativo: boolean;
    convidado_por: string;
    criado_em: string | Date;
}

export interface ConvidarAdminDTO {
    nome: string;
    email: string;
}

export interface ConvidarAdminResposta {
    admin: AdminOrganizacao;
    /** false = a conta já existia no painel; ganhou só a organização nova. */
    contaNova: boolean;
    emailSent: boolean;
    /** Só quando o e-mail não saiu: o link para entregar à mão. */
    magicLinkToken?: string;
}
