import api from './api';
import type { 
  Company, 
  CreateCompanyDTO, 
  CreateCompanyResponse, 
  UpdateCompanyDTO 
} from '@loginhub/shared';

// AJUSTE CRÍTICO: Adicionado '/admin' para corresponder à rota do backend
const COMPANIES_BASE_URL = '/admin/companies';

export const companyService = {

  /**
   * Lista todas as empresas
   * Endpoint: GET /api/admin/companies
   */
  getAll: async (): Promise<Company[]> => {
    const { data } = await api.get<Company[]>(COMPANIES_BASE_URL);
    return data;
  },

  /**
   * Busca dados de uma empresa específica pelo ID
   * Endpoint: GET /api/admin/companies/:id
   */
  getById: async (id: string): Promise<Company> => {
    const { data } = await api.get<Company>(`${COMPANIES_BASE_URL}/${id}`);
    return data;
  },

  /**
   * Cria uma nova empresa (e seu admin inicial)
   * Endpoint: POST /api/admin/companies
   */
  create: async (payload: CreateCompanyDTO): Promise<CreateCompanyResponse> => {
    const { data } = await api.post<CreateCompanyResponse>(COMPANIES_BASE_URL, payload);
    return data;
  },

  /**
   * Atualiza dados cadastrais da empresa
   * Endpoint: PUT /api/admin/companies/:id
   */
  update: async (id: string, payload: UpdateCompanyDTO): Promise<Company> => {
    const { data } = await api.put<Company>(`${COMPANIES_BASE_URL}/${id}`, payload);
    return data;
  },

  /**
   * Alterna status (Ativo/Inativo)
   * Endpoint: PATCH /api/admin/companies/:id/status
   */
  toggleStatus: async (id: string, status: 'ativo' | 'inativo'): Promise<Company> => {
    const { data } = await api.patch<{ message: string; empresa: Company }>(
      `${COMPANIES_BASE_URL}/${id}/status`,
      { status }
    );
    return data.empresa;
  },

  /**
   * Remove uma empresa
   * Endpoint: DELETE /api/admin/companies/:id
   */
  delete: async (id: string): Promise<void> => {
    await api.delete(`${COMPANIES_BASE_URL}/${id}`);
  }
  
};