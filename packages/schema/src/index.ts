import { pgTable, serial, varchar, integer, timestamp, boolean, text, unique } from 'drizzle-orm/pg-core';

// ==========================================
// USER MODELS
// ==========================================
export type UserRole = 'master' | 'admin' | 'user' | 'suporte';

export interface User {
    id: string;
    nome: string;
    email: string;
    role: UserRole | string;
    app_id?: string | null; 
    app_nome?: string;
    status?: 'ativo' | 'inativo' | 'bloqueado' | string;
    telefone?: string | null;   
    ultimo_login?: Date | string | null;
    last_login?: string | null;
    created_at?: Date;
    senha_hash?: string;
    nivel_acesso_id?: string;
    senha_padrao?: boolean;
}

export interface CreateUserDTO {
    app_id: string; 
    nome: string;
    email: string;
    password?: string; 
    role?: UserRole | string;    
    telefone?: string | null; 
    emailHtml?: string;
}

export interface UpdateUserDTO {
    nome: string;
    email: string;
    telefone?: string | undefined;
    password?: string | undefined;
    role?: UserRole | string; 
    status?: 'ativo' | 'inativo' | 'bloqueado' | string;
}

// ==========================================
// AUTH MODELS
// ==========================================
export interface LoginInputDTO {
    email: string;
    password: string;
    /**
     * ID do aplicativo (tenant) ao qual o usuário pertence. Opcional.
     * - Se informado: o login busca apenas usuários daquele app específico.
     * - Se omitido E o e-mail existir em mais de um app: o backend responde
     *   com erro `AMBIGUOUS_EMAIL` + lista `availableApps` para o cliente
     *   escolher qual app está tentando logar.
     */
    app_id?: string | undefined;
}

export interface AvailableAppSummary {
    id: string;
    nome: string;
    logo?: string | null;
}

export interface AmbiguousLoginResponse {
    error: 'AMBIGUOUS_EMAIL';
    message: string;
    availableApps: AvailableAppSummary[];
}

export interface LoginResponse {
    token: string;
    expiresIn?: number;
    requirePasswordChange?: boolean;
    usuario: User;
    app?: {
        id: string;
        nome: string;
        status: string;
    };
}

export interface LoginResponseDTO {
    token: string;
    expiresIn: number;
    requirePasswordChange: boolean;
    usuario: {
        id: string;
        nome: string;
        email: string;
        role: string;
    };
    app: {
        id: string;
        nome: string;
        status: string;
    };
}

export interface UserLoginQueryResult {
    id: string;
    nome: string;
    email: string;
    senha_hash: string;
    app_id: string;
    app_nome: string;
    app_status: string; 
    role_nome: string;
    senha_padrao: boolean;
}

export interface JWTPayload {
    sub: string;
    email: string;
    app_id: string; 
    role: string;       
    iat?: number;
    exp?: number;
}

// ==========================================
// APP MODELS
// ==========================================
export interface App {
    id: string;
    nome: string;
    documento: string;
    email: string;
    telefone?: string;
    logo?: string | null;
    bot_url?: string | null;
    platform_url?: string | null;
    dominio?: string;
    status: 'ativo' | 'inativo' | 'bloqueado' | 'ativa' | 'inativa' | 'bloqueada';
    data_cadastro?: string | Date;
    created_at?: Date;
    updated_at?: Date;
    total_usuarios?: number;
}

export interface CreateAppDTO {
    nome: string;
    documento: string;
    email: string;
    telefone?: string;
    logo?: string;
    bot_url?: string;
    platform_url?: string;
    password?: string;
    admin_nome?: string;
    admin_email?: string;
    admin_telefone?: string;
    emailHtml?: string;
}

export interface UpdateAppDTO {
    nome: string;
    email: string;
    documento: string;
    telefone?: string | undefined;
    logo?: string | null | undefined;
    bot_url?: string | null | undefined;
    platform_url?: string | null | undefined;
}

export interface CreateAppResponse {
    appId: string;
    nome?: string;
    documento?: string;
    email?: string;
    adminEmail?: string;
    message: string;
}

export interface AppSummaryDTO {
    id: string;
    nome: string;
    documento: string;
    email: string;
    status: string;
    total_usuarios?: number;
}

// ==========================================
// UI MODELS
// ==========================================
export interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isBlocking: boolean;
  entityName?: string; 
}

// ==========================================
// ERROR MODELS
// ==========================================
export interface DbError extends Error {
    code?: string;
}

// ==========================================
// API CLIENT MODELS
// ==========================================
export interface ApiErrorResponse {
  error?: string;
  message?: string;
  statusCode?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface AuthResult {
  redirect: string;
}

export interface SuperAdminSession {
  isMaster: boolean;
  timestamp: number;
}

// ==========================================
// DATABASE SCHEMA (Drizzle)
// ==========================================
export const niveisAcesso = pgTable('niveis_acesso', {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 50 }).notNull().unique(),
});

export const aplicativos = pgTable('aplicativos', {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 255 }).notNull(),
    documento: varchar('documento', { length: 20 }),
    email: varchar('email', { length: 255 }),
    telefone: varchar('telefone', { length: 20 }),
    logo: text('logo'),
    botUrl: varchar('bot_url', { length: 500 }),
    platformUrl: varchar('platform_url', { length: 500 }),
    status: varchar('status', { length: 20 }).default('ativo'),
    dataCadastro: timestamp('data_cadastro').defaultNow(),
    dataAtualizacao: timestamp('data_atualizacao'),
});

export const usuarios = pgTable('usuarios', {
    id: serial('id').primaryKey(),
    appId: integer('app_id').references(() => aplicativos.id, { onDelete: 'cascade' }),
    nivelAcessoId: integer('nivel_acesso_id').references(() => niveisAcesso.id),
    nome: varchar('nome', { length: 255 }).notNull(),
    // E-mail é único por aplicativo, não global. O mesmo e-mail pode existir em apps diferentes.
    email: varchar('email', { length: 255 }).notNull(),
    senhaHash: varchar('senha_hash', { length: 255 }).notNull(),
    senhaPadrao: boolean('senha_padrao').default(true).notNull(),
    telefone: varchar('telefone', { length: 20 }),
    status: varchar('status', { length: 20 }).default('ativo'),
    ultimoAcesso: timestamp('ultimo_acesso'),
    dataCadastro: timestamp('data_cadastro').defaultNow(),
    dataAtualizacao: timestamp('data_atualizacao'),
}, (table) => ({
    emailAppIdUnique: unique('usuarios_email_app_id_unique').on(table.email, table.appId),
}));
