import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

// ==========================================
// USER MODELS
// ==========================================
export type UserRole = 'master' | 'admin' | 'usuario';

export interface User {
    id: string;
    nome: string;
    email: string;
    role: UserRole | string;
    empresa_id?: string | null; 
    empresa_nome?: string;
    status?: 'ativo' | 'inativo' | 'bloqueado' | string;
    telefone?: string | null;   
    ultimo_login?: Date | string | null;
    last_login?: string | null;
    created_at?: Date;
    senha_hash?: string;
    nivel_acesso_id?: string;
}

export interface CreateUserDTO {
    empresa_id: string; 
    nome: string;
    email: string;
    password?: string; 
    role?: UserRole | string;    
    telefone?: string | null; 
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
}

export interface LoginResponse {
    token: string;
    expiresIn?: number;
    usuario: User;
    empresa?: {
        id: string;
        nome: string;
        status: string;
    };
}

export interface LoginResponseDTO {
    token: string;
    expiresIn: number;
    usuario: {
        id: string;
        nome: string;
        email: string;
        role: string;
    };
    empresa: {
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
    empresa_id: string;
    empresa_nome: string;
    empresa_status: string; 
    role_nome: string;
}

export interface JWTPayload {
    sub: string;
    email: string;
    empresa_id: string; 
    role: string;       
    iat?: number;
    exp?: number;
}

// ==========================================
// COMPANY MODELS
// ==========================================
export interface Company {
    id: string;
    nome: string;
    documento: string;
    email: string;
    telefone?: string;
    dominio?: string;
    status: 'ativo' | 'inativo' | 'bloqueado' | 'ativa' | 'inativa' | 'bloqueada';
    data_cadastro?: string | Date; 
    created_at?: Date;
    updated_at?: Date;
    total_usuarios?: number;
}

export interface CreateCompanyDTO {
    nome: string;
    documento: string;
    email: string;
    telefone?: string;
    password: string;
    admin_nome: string;
    admin_email: string;
    admin_telefone?: string;
}

export interface UpdateCompanyDTO {
    nome: string;
    email: string;
    documento: string;
    telefone?: string | undefined;
}

export interface CreateCompanyResponse {
    empresaId: string;
    nome?: string;
    documento?: string;
    email?: string;
    adminEmail?: string;
    message: string;
}

export interface EmpresaSummaryDTO {
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

export const empresas = pgTable('empresas', {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 255 }).notNull(),
    documento: varchar('documento', { length: 20 }),
    email: varchar('email', { length: 255 }),
    telefone: varchar('telefone', { length: 20 }),
    status: varchar('status', { length: 20 }).default('ativo'),
    dataCadastro: timestamp('data_cadastro').defaultNow(),
    dataAtualizacao: timestamp('data_atualizacao'),
});

export const usuarios = pgTable('usuarios', {
    id: serial('id').primaryKey(),
    empresaId: integer('empresa_id').references(() => empresas.id, { onDelete: 'cascade' }),
    nivelAcessoId: integer('nivel_acesso_id').references(() => niveisAcesso.id),
    nome: varchar('nome', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    senhaHash: varchar('senha_hash', { length: 255 }).notNull(),
    telefone: varchar('telefone', { length: 20 }),
    ultimoAcesso: timestamp('ultimo_acesso'),
    dataCadastro: timestamp('data_cadastro').defaultNow(),
    dataAtualizacao: timestamp('data_atualizacao'),
});
