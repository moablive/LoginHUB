// Interface auxiliar para tratar erros do PostgreSQL
export interface DbError extends Error {
    code?: string;
}
