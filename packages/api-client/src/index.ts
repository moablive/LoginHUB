import axios, { type InternalAxiosRequestConfig, type AxiosRequestHeaders } from 'axios';
import type {
  User,
  LoginResponse,
  TwoFactorChallengeResponse,
  TwoFactorSetupRequiredResponse,
  SetupPasswordResponse,
  TwoFactorSetupResponse,
  TwoFactorActivationResponse,
  TwoFactorStatus,
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
    const isSuperAdmin = sessionStorage.getItem('is_super_admin') === 'true';

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Os dois headers convivem de propósito: o `adminMiddleware` do LoginHUB
    // aceita SÓ `x-api-key`, enquanto integrações externas (ex.: o convite de
    // vendedor da Sul Alimentos) exigem um Bearer de verdade. Mandar apenas um
    // dos dois quebra metade das chamadas da sessão master.
    if (masterKey && (isSuperAdmin || !token)) {
      config.headers['x-api-key'] = masterKey;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================
// REFRESH TOKEN HELPER
// ==========================================
/** E-mail que o login master do backend exige (packages/services). */
const MASTER_LOGIN_EMAIL = 'master@infra.local';

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
      // A sessão master já foi puramente client-side: marcava a flag e não
      // guardava token nenhum. Quem só falava com o próprio hub não sentia
      // (o x-api-key resolvia), mas qualquer chamada a uma API externa saía
      // sem `Authorization` e voltava 401. O backend tem um login master que
      // devolve JWT de verdade (app_id "0", role admin) — é ele que usamos.
      const { data } = await api.post<LoginResponse>('/auth/login', {
        email: MASTER_LOGIN_EMAIL,
        password: masterKey,
      });

      sessionStorage.setItem('is_super_admin', 'true');
      localStorage.setItem('awl_token', data.token);

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

    const { data } = await api.post<LoginResponse | TwoFactorChallengeResponse | TwoFactorSetupRequiredResponse>('/auth/login', payload);

    // Convite exigiu 2FA e o enrolamento ficou pela metade. A sessão curta que
    // vem aqui só serve para concluí-lo.
    if ('require2FASetup' in data && data.require2FASetup) {
      localStorage.setItem('awl_token', data.setupToken);
      return { redirect: '/2fa/setup', require2FASetup: true };
    }

    // Conta com 2FA: a senha conferiu, mas a sessão ainda não existe. Nada é
    // gravado aqui — quem fecha o login é `twoFactorApi.verify`.
    if ('requires2FA' in data && data.requires2FA) {
      return {
        redirect: '/login/2fa',
        requires2FA: true,
        challengeToken: data.challengeToken,
        challengeExpiresIn: data.expiresIn,
        methods: data.methods,
      };
    }

    const sessao = data as LoginResponse;
    localStorage.setItem('awl_token', sessao.token);
    localStorage.setItem('awl_user', JSON.stringify(sessao.usuario));

    if (sessao.app) {
        localStorage.setItem('awl_app', JSON.stringify(sessao.app));
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

  /**
   * Define a senha pelo magic link.
   *
   * Devolve uma sessão junto: quando `require2FASetup` vem `true`, a página deve
   * emendar direto no enrolamento de 2FA (o convite exigiu) em vez de mandar o
   * usuário para o login. A sessão é salva aqui para as chamadas seguintes.
   */
  setupPassword: async (token: string, novaSenha: string): Promise<SetupPasswordResponse> => {
    const { data } = await api.post<SetupPasswordResponse>('/auth/setup-password', { token, novaSenha });
    if (data.token) localStorage.setItem('awl_token', data.token);
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
// 2FA API
// ==========================================
/** Grava a sessão devolvida pela segunda etapa. */
const salvarSessao = (data: LoginResponse): void => {
  localStorage.setItem('awl_token', data.token);
  localStorage.setItem('awl_user', JSON.stringify(data.usuario));
  if (data.app) localStorage.setItem('awl_app', JSON.stringify(data.app));
};

export const twoFactorApi = {
  /** Se a conta da sessão atual tem 2FA e quantos backup codes restam. */
  status: async (): Promise<TwoFactorStatus> => {
    const { data } = await api.get<TwoFactorStatus>('/auth/2fa/status');
    return data;
  },

  /**
   * Passo 1 do enrolamento. Devolve o secret e a URI `otpauth://` — renderize
   * o QR a partir dela no cliente (o servidor não manda imagem de propósito:
   * evita trafegar PNG em base64 e deixa o app escolher a biblioteca).
   */
  setup: async (): Promise<TwoFactorSetupResponse> => {
    const { data } = await api.post<TwoFactorSetupResponse>('/auth/2fa/setup', {});
    return data;
  },

  /**
   * Passo 2: confirma com um código do autenticador.
   *
   * ⚠️ Os `backupCodes` da resposta são a ÚNICA vez que eles aparecem em claro.
   * ⚠️ As demais sessões do usuário são encerradas aqui — inclusive outras abas.
   */
  verifySetup: async (codigo: string): Promise<TwoFactorActivationResponse> => {
    const { data } = await api.post<TwoFactorActivationResponse>('/auth/2fa/verify-setup', { codigo });
    return data;
  },

  /** Fecha o login com o código do autenticador. Salva a sessão em caso de sucesso. */
  verify: async (challengeToken: string, codigo: string): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/2fa/verify', { challengeToken, codigo });
    salvarSessao(data);
    return data;
  },

  /** Fecha o login com um código de recuperação (uso único). */
  verifyBackup: async (challengeToken: string, backupCode: string): Promise<LoginResponse> => {
    const { data } = await api.post<LoginResponse>('/auth/2fa/verify-backup', { challengeToken, backupCode });
    salvarSessao(data);
    return data;
  },

  /** Desativa o 2FA. Exige código do autenticador OU de recuperação. */
  disable: async (prova: { codigo?: string; backupCode?: string }): Promise<{ ativo: false }> => {
    const { data } = await api.post<{ ativo: false }>('/auth/2fa/disable', prova);
    return data;
  },

  /** Gera códigos de recuperação novos e invalida os anteriores. */
  regenerateBackupCodes: async (codigo: string): Promise<{ backupCodes: string[] }> => {
    // POST e não GET: no GET o código iria na query string, parando em log de
    // acesso e histórico do navegador. O servidor aceita os dois.
    const { data } = await api.post<{ backupCodes: string[] }>('/auth/2fa/backup-codes', { codigo });
    return data;
  },
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
