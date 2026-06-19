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
