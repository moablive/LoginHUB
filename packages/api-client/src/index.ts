import axios, { type InternalAxiosRequestConfig, type AxiosRequestHeaders } from 'axios';
import type { 
  User, 
  LoginResponse,
  Company, 
  CreateCompanyDTO, 
  CreateCompanyResponse, 
  UpdateCompanyDTO,
  CreateUserDTO, 
  UpdateUserDTO as UpdateUserPayload,
  AuthResult
} from '@loginhub/schema';

// ==========================================
// API INSTANCE CONFIGURATION
// ==========================================
export const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_URL, 
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (!config.headers) {
      config.headers = {} as AxiosRequestHeaders;
    }

    const token = localStorage.getItem('awl_token');
    const masterKey = (import.meta as any).env.VITE_MASTER_KEY;
    
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    } else if (masterKey) {
      config.headers['x-api-key'] = masterKey; 
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status } = error.response;

      if (status === 401) {
        if (!window.location.pathname.includes('/login')) {
          console.warn('Sessão expirada. Redirecionando...');
          localStorage.removeItem('awl_token');
          localStorage.removeItem('awl_user');
          window.location.href = '/login'; 
        }
      }

      if (status === 403) {
        console.error('⛔ Acesso negado: Nível de permissão insuficiente.');
      }
      
      if (status >= 500) {
        console.error('🔥 Erro interno do servidor. Tente novamente mais tarde.');
      }
    } else {
      console.error('🚨 Erro de conexão: Verifique sua internet ou se o backend está online.');
    }
    
    return Promise.reject(error);
  }
);

// ==========================================
// AUTHENTICATION API
// ==========================================
export const authApi = {
  login: async (email: string, password: string): Promise<AuthResult> => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_empresa');
    sessionStorage.removeItem('is_super_admin');

    const masterKey = (import.meta as any).env.VITE_MASTER_KEY;

    if (masterKey && password === masterKey) {
      sessionStorage.setItem('is_super_admin', 'true');

      const adminUser: User = { 
        id: 'master-root-id', 
        nome: 'Super Administrator', 
        email: email || 'root@infrastructure.local', 
        role: 'master', 
        empresa_id: null,
        status: 'ativo'
      };
      
      localStorage.setItem('awl_user', JSON.stringify(adminUser));
      return { redirect: '/companies' }; 
    }

    const reservedEmails = ['master@infra.local', 'root@system.local', 'admin@local'];
    if (reservedEmails.includes(email)) {
        throw new Error('Acesso Negado: Credenciais Mestra inválidas.');
    }

    const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
    
    localStorage.setItem('awl_token', data.token);
    localStorage.setItem('awl_user', JSON.stringify(data.usuario));
    
    if (data.empresa) {
        localStorage.setItem('awl_empresa', JSON.stringify(data.empresa));
    }
    
    return { redirect: '/dashboard' }; 
  },

  logout: () => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_empresa');
    sessionStorage.removeItem('is_super_admin');
    window.location.href = '/login';
  },

  isAuthenticated: (): boolean => {
    const token = localStorage.getItem('awl_token');
    const isSuperAdmin = sessionStorage.getItem('is_super_admin') === 'true';
    return !!token || isSuperAdmin;
  },

  getUser: (): User | null => {
    const userStr = localStorage.getItem('awl_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  },

  getRole: (): string | null => {
    const user = authApi.getUser();
    return user?.role || null;
  }
};

// ==========================================
// COMPANY API
// ==========================================
const COMPANIES_BASE_URL = '/admin/companies';

export const companyApi = {
  getAll: async (): Promise<Company[]> => {
    const { data } = await api.get<Company[]>(COMPANIES_BASE_URL);
    return data;
  },
  getById: async (id: string): Promise<Company> => {
    const { data } = await api.get<Company>(`${COMPANIES_BASE_URL}/${id}`);
    return data;
  },
  create: async (payload: CreateCompanyDTO): Promise<CreateCompanyResponse> => {
    const { data } = await api.post<CreateCompanyResponse>(COMPANIES_BASE_URL, payload);
    return data;
  },
  update: async (id: string, payload: UpdateCompanyDTO): Promise<Company> => {
    const { data } = await api.put<Company>(`${COMPANIES_BASE_URL}/${id}`, payload);
    return data;
  },
  toggleStatus: async (id: string, status: 'ativo' | 'inativo'): Promise<Company> => {
    const { data } = await api.patch<{ message: string; empresa: Company }>(
      `${COMPANIES_BASE_URL}/${id}/status`,
      { status }
    );
    return data.empresa;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`${COMPANIES_BASE_URL}/${id}`);
  }
};

// ==========================================
// USER API
// ==========================================
const USERS_BASE_URL = '/admin/users';

export const userApi = {
  getAllGlobal: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>(USERS_BASE_URL);
    return data;
  },
  getByCompanyId: async (companyId: string): Promise<User[]> => {
    const { data } = await api.get<User[]>(`/admin/companies/${companyId}/users`);
    return data;
  },
  create: async (payload: CreateUserDTO): Promise<User> => {
    const { data } = await api.post<User>(USERS_BASE_URL, payload);
    return data;
  },
  update: async (id: string, payload: UpdateUserPayload): Promise<User> => {
    const { data } = await api.put<User>(`${USERS_BASE_URL}/${id}`, payload);
    return data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`${USERS_BASE_URL}/${id}`);
  }
};
