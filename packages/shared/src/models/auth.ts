import { User } from './user';

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
