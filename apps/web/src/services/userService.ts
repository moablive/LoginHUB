import api from './api';
import type { User, CreateUserDTO, UpdateUserDTO as UpdateUserPayload } from '@loginhub/shared';

// AJUSTE CRÍTICO: Adicionado o prefixo '/admin' conforme rotas do backend
const USERS_BASE_URL = '/admin/users';

export const userService = {
  /**
   * Lista TODOS os usuários do sistema (Visão Global do Super Admin)
   * Endpoint: GET /api/admin/users
   */
  getAllGlobal: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>(USERS_BASE_URL);
    return data;
  },

  /**
   * Lista usuários de uma empresa específica
   * Endpoint: GET /api/admin/companies/:id/users
   */
  getByCompanyId: async (companyId: string): Promise<User[]> => {
    // AJUSTE CRÍTICO: Rota corrigida para /admin/companies/...
    const { data } = await api.get<User[]>(`/admin/companies/${companyId}/users`);
    return data;
  },

  /**
   * Cria um novo usuário
   * Endpoint: POST /api/admin/users
   */
  create: async (payload: CreateUserDTO): Promise<User> => {
    const { data } = await api.post<User>(USERS_BASE_URL, payload);
    return data;
  },

  /**
   * Atualiza um usuário existente
   * Endpoint: PUT /api/admin/users/:id
   */
  update: async (id: string, payload: UpdateUserPayload): Promise<User> => {
    const { data } = await api.put<User>(`${USERS_BASE_URL}/${id}`, payload);
    return data;
  },

  /**
   * Remove um usuário
   * Endpoint: DELETE /api/admin/users/:id
   */
  delete: async (id: string): Promise<void> => {
    await api.delete(`${USERS_BASE_URL}/${id}`);
  }
};