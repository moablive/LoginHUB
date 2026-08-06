import axios, { type InternalAxiosRequestConfig, type AxiosRequestHeaders } from 'axios';
import type {
  User,
  LoginResponse,
  App,
  CreateAppDTO,
  CreateAppResponse,
  UpdateAppDTO,
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

// ==========================================
// REFRESH TOKEN HELPER
// ==========================================
// Coordena refreshes concorrentes: se várias requests caem em 401 ao mesmo tempo,
// só dispara UM refresh — as outras aguardam o mesmo Promise.
let refreshInFlight: Promise<string | null> | null = null;

const performRefresh = async (): Promise<string | null> => {
  const currentToken = localStorage.getItem('awl_token');
  if (!currentToken) return null;

  try {
    // Usa axios direto (não a instância `api`) para não passar pelo interceptor
    const baseURL = (import.meta as any).env.VITE_API_URL;
    const { data } = await axios.post<LoginResponse>(
      `${baseURL}/auth/refresh`,
      {},
      { headers: { 'Authorization': `Bearer ${currentToken}` } },
    );

    localStorage.setItem('awl_token', data.token);
    if (data.usuario) localStorage.setItem('awl_user', JSON.stringify(data.usuario));
    if (data.app) localStorage.setItem('awl_app', JSON.stringify(data.app));
    return data.token;
  } catch {
    return null;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    // Tenta refresh automático em 401 (exceto se já tentou ou é o próprio /auth/refresh|/auth/login)
    const isAuthEndpoint = config?.url?.includes('/auth/refresh') || config?.url?.includes('/auth/login');
    if (status === 401 && config && !config._retry && !isAuthEndpoint) {
      config._retry = true;

      if (!refreshInFlight) {
        refreshInFlight = performRefresh().finally(() => {
          refreshInFlight = null;
        });
      }
      const newToken = await refreshInFlight;

      if (newToken) {
        if (!config.headers) config.headers = {} as AxiosRequestHeaders;
        config.headers['Authorization'] = `Bearer ${newToken}`;
        return api.request(config);
      }

      // Refresh falhou: limpa sessão e redireciona
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        console.warn('Sessão expirada. Redirecionando...');
        localStorage.removeItem('awl_token');
        localStorage.removeItem('awl_user');
        localStorage.removeItem('awl_app');
        window.location.href = '/login';
      }
    }

    if (error.response) {
      if (status === 403) {
        console.error('⛔ Acesso negado: Nível de permissão insuficiente.');
      }
      if (status && status >= 500) {
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
  /**
   * Login do usuário.
   * @param appId Opcional — quando o mesmo e-mail existe em apps diferentes,
   *              é necessário informar para desambiguar. Se omitido e o
   *              backend detectar ambiguidade, lança erro com `availableApps`
   *              em `error.response.data.availableApps`.
   */
  login: async (email: string, password: string, appId?: string): Promise<AuthResult> => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    sessionStorage.removeItem('is_super_admin');

    const masterKey = (import.meta as any).env.VITE_MASTER_KEY;

    if (masterKey && password === masterKey) {
      sessionStorage.setItem('is_super_admin', 'true');

      const adminUser: User = {
        id: 'master-root-id',
        nome: 'Super Administrator',
        email: email || 'root@infrastructure.local',
        role: 'master',
        app_id: null,
        status: 'ativo'
      };

      localStorage.setItem('awl_user', JSON.stringify(adminUser));
      return { redirect: '/apps' };
    }

    const reservedEmails = ['master@infra.local', 'root@system.local', 'admin@local'];
    if (reservedEmails.includes(email)) {
        throw new Error('Acesso Negado: Credenciais Mestra inválidas.');
    }

    const payload: { email: string; password: string; app_id?: string } = { email, password };
    if (appId) payload.app_id = appId;

    const { data } = await api.post<LoginResponse>('/auth/login', payload);

    localStorage.setItem('awl_token', data.token);
    localStorage.setItem('awl_user', JSON.stringify(data.usuario));

    if (data.app) {
        localStorage.setItem('awl_app', JSON.stringify(data.app));
    }

    return { redirect: '/dashboard' };
  },

  logout: () => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    sessionStorage.removeItem('is_super_admin');
    window.location.href = '/login';
  },

  changePassword: async (novaSenha: string): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>('/auth/change-password', { novaSenha });
    return data;
  },

  setupPassword: async (token: string, novaSenha: string): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>('/auth/setup-password', { token, novaSenha });
    return data;
  },

  /**
   * Renova o JWT atual. Aceita tokens válidos ou recém-expirados (grace de 7 dias).
   * Atualiza localStorage automaticamente em caso de sucesso.
   * Retorna `null` se o refresh falhou — chame `authApi.logout()` neste caso.
   */
  refresh: async (): Promise<LoginResponse | null> => {
    const newToken = await performRefresh();
    if (!newToken) return null;
    return {
      token: newToken,
      expiresIn: 86400,
      requirePasswordChange: false,
      usuario: JSON.parse(localStorage.getItem('awl_user') || 'null'),
      app: JSON.parse(localStorage.getItem('awl_app') || 'null'),
    };
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
// APP API
// ==========================================
const APPS_BASE_URL = '/admin/apps';

export const appApi = {
  getAll: async (): Promise<App[]> => {
    const { data } = await api.get<App[]>(APPS_BASE_URL);
    return data;
  },
  getById: async (id: string): Promise<App> => {
    const { data } = await api.get<App>(`${APPS_BASE_URL}/${id}`);
    return data;
  },
  create: async (payload: CreateAppDTO): Promise<CreateAppResponse> => {
    const { data } = await api.post<CreateAppResponse>(APPS_BASE_URL, payload);
    return data;
  },
  update: async (id: string, payload: UpdateAppDTO): Promise<App> => {
    const { data } = await api.put<App>(`${APPS_BASE_URL}/${id}`, payload);
    return data;
  },
  toggleStatus: async (id: string, status: 'ativo' | 'inativo'): Promise<App> => {
    const { data } = await api.patch<{ message: string; aplicativo: App }>(
      `${APPS_BASE_URL}/${id}/status`,
      { status }
    );
    return data.aplicativo;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`${APPS_BASE_URL}/${id}`);
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
  getByAppId: async (appId: string): Promise<User[]> => {
    const { data } = await api.get<User[]>(`/admin/apps/${appId}/users`);
    return data;
  },
  create: async (payload: CreateUserDTO): Promise<{ message: string; emailSent: boolean; magicLinkToken?: string }> => {
    const { data } = await api.post<{ message: string; emailSent: boolean; magicLinkToken?: string }>(USERS_BASE_URL, payload);
    return data;
  },
  update: async (id: string, payload: UpdateUserPayload): Promise<User> => {
    const { data } = await api.put<User>(`${USERS_BASE_URL}/${id}`, payload);
    return data;
  },
  toggleStatus: async (id: string, status: 'ativo' | 'inativo' | 'bloqueado'): Promise<User> => {
    const { data } = await api.patch<{ message: string; user: User }>(
      `${USERS_BASE_URL}/${id}/status`,
      { status }
    );
    return data.user;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`${USERS_BASE_URL}/${id}`);
  },
  resetPassword: async (id: string, emailHtml?: string): Promise<{ message: string; emailSent: boolean; magicLinkToken?: string }> => {
    const { data } = await api.post<{ message: string; emailSent: boolean; magicLinkToken?: string }>(`${USERS_BASE_URL}/${id}/reset-password`, { emailHtml });
    return data;
  }
};
