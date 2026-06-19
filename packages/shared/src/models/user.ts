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
