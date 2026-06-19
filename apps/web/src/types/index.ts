export * from '@loginhub/shared';

// ==========================================
// 2. TIPOS GERAIS DE API
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

// ==========================================
// 3. TIPOS DE AUTENTICAÇÃO
// ==========================================
export interface AuthResult {
  redirect: string;
}

export interface SuperAdminSession {
  isMaster: boolean;
  timestamp: number;
}