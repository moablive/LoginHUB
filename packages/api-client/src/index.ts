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
  AuthResult,
  Categoria,
  CreateCategoriaDTO,
  UpdateCategoriaDTO,
  DirecaoMovimento,
  LoginBloqueio,
  AparelhosDoApp,
  PlanoApp,
  SalvarPlanoDTO,
  Afiliado,
  SalvarAfiliadoDTO,
  Assinatura,
  ResumoVendas,
  EscopoDoPainel,
  AdminOrganizacao,
  ConvidarAdminDTO,
  ConvidarAdminResposta,
  CofreEstado,
  CofreConta,
  CofreAparelho,
  CofreAparelhoAcesso,
  CofreAparelhoPedido,
  CofreDigital,
  CofreDigitalNova,
  CofreEntradaNova,
  CofreEntradaPedido
} from '@loginhub/schema';

// ==========================================
// API INSTANCE CONFIGURATION
// ==========================================
/**
 * Sem prazo, uma conexão morta (iOS volta do segundo plano com o socket velho, Wi-Fi para 4G) deixa a promise
 * pendurada para sempre e o painel "trava" até o F5. Com prazo, a chamada falha e a tela mostra o erro.
 */
const PRAZO_REQUISICAO_MS = 20_000;
const PRAZO_REFRESH_MS = 10_000;

export const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_URL,
  timeout: PRAZO_REQUISICAO_MS,
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

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // Só o Bearer. Aqui existia também `x-api-key: VITE_MASTER_KEY`, e essa
    // linha era o vazamento: o prefixo VITE_ é justamente o que manda o Vite
    // publicar a variável no bundle, então a chave mestra saía em todo módulo
    // servido — legível por qualquer visitante da página, sem autenticar.
    // O `adminMiddleware` passou a aceitar a sessão master, que é o que este
    // token é; o `x-api-key` continua valendo, mas só entre servidores.
    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================
// FLAG DE SUPER ADMIN
// ==========================================
/**
 * Marca que a sessão no `awl_token` é a do master.
 *
 * Mora no localStorage, e não no sessionStorage, porque o sessionStorage morre
 * junto com a aba: no celular o sistema descarta a aba em segundo plano, e ao
 * voltar o painel encontrava token válido sem a flag e mandava a pessoa para o
 * login. A flag não autoriza nada — quem decide é o `adminMiddleware` contra o
 * JWT —, ela só diz ao roteador qual árvore de telas montar.
 *
 * A leitura ainda aceita o sessionStorage para não deslogar quem estiver com o
 * painel aberto no momento do deploy.
 */
const CHAVE_SUPER_ADMIN = 'awl_is_super_admin';

const marcarSuperAdmin = (): void => {
  localStorage.setItem(CHAVE_SUPER_ADMIN, 'true');
};

/**
 * Marca que a sessão no `awl_token` é de um ADMIN DE ORGANIZAÇÃO (db/012,
 * 19/11/2026). Como a do master, não autoriza nada — só diz ao roteador que
 * pode montar as telas do painel; o que cada um enxerga vem de `/admin/eu`.
 */
const CHAVE_ADMIN_ORG = 'awl_is_admin_org';

const limparSuperAdmin = (): void => {
  localStorage.removeItem(CHAVE_SUPER_ADMIN);
  localStorage.removeItem(CHAVE_ADMIN_ORG);
  sessionStorage.removeItem('is_super_admin');
};

export const ehSuperAdmin = (): boolean =>
  localStorage.getItem(CHAVE_SUPER_ADMIN) === 'true' ||
  sessionStorage.getItem('is_super_admin') === 'true';

export const ehAdminDeOrganizacao = (): boolean => localStorage.getItem(CHAVE_ADMIN_ORG) === 'true';

/** Chame depois que o 2FA do admin de organização fechou o login. */
export const marcarAdminDeOrganizacao = (): void => {
  localStorage.setItem(CHAVE_ADMIN_ORG, 'true');
};

// ==========================================
// REFRESH TOKEN HELPER
// ==========================================
/** E-mail que o login master do backend exige (packages/services). */
const MASTER_LOGIN_EMAIL = 'master@infra.local';

// Coordena refreshes concorrentes: se várias requests caem em 401 ao mesmo tempo,
// só dispara UM refresh — as outras aguardam o mesmo Promise.
let refreshInFlight: Promise<ResultadoRefresh> | null = null;

/**
 * `recusada`: o servidor respondeu que esta sessão não renova (token inválido, expirado além da tolerância ou
 * revogada) — aí sim é caso de ir ao login. Qualquer outra falha (sem rede, prazo, 5xx) NÃO derruba a sessão: o
 * token continua bom, só não deu para renovar agora.
 */
type ResultadoRefresh = { token: string; recusada?: false } | { token: null; recusada: boolean };

const performRefresh = async (): Promise<ResultadoRefresh> => {
  const currentToken = localStorage.getItem('awl_token');
  if (!currentToken) return { token: null, recusada: true };

  try {
    // Usa axios direto (não a instância `api`) para não passar pelo interceptor
    const baseURL = (import.meta as any).env.VITE_API_URL;
    const { data } = await axios.post<LoginResponse>(
      `${baseURL}/auth/refresh`,
      {},
      { headers: { 'Authorization': `Bearer ${currentToken}` }, timeout: PRAZO_REFRESH_MS },
    );

    localStorage.setItem('awl_token', data.token);
    if (data.usuario) localStorage.setItem('awl_user', JSON.stringify(data.usuario));
    if (data.app) localStorage.setItem('awl_app', JSON.stringify(data.app));
    return { token: data.token };
  } catch (e) {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    return { token: null, recusada: status === 400 || status === 401 || status === 403 };
  }
};

const renovarUmaVez = (): Promise<ResultadoRefresh> => {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

/** Validade (ms desde 1970) do JWT guardado, ou null se não der para ler. */
const validadeDoToken = (): number | null => {
  try {
    const token = localStorage.getItem('awl_token');
    const carga = token?.split('.')[1];
    if (!carga) return null;
    const { exp } = JSON.parse(atob(carga.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
};

const RENOVAR_FALTANDO_MS = 6 * 60 * 60 * 1000;

/**
 * Renova a sessão em silêncio quando ela está perto de vencer (ou já venceu dentro da tolerância do servidor).
 * Chamada ao abrir o app e ao voltar do segundo plano: assim o primeiro toque depois de horas parado não depende
 * de uma sequência de 401 → refresh → repetição. Nunca desloga: se falhar, o interceptor decide na próxima chamada.
 */
export const renovarSessaoSeVelha = async (): Promise<void> => {
  const validade = validadeDoToken();
  if (validade === null || validade - Date.now() > RENOVAR_FALTANDO_MS) return;
  await renovarUmaVez();
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

      const renovado = await renovarUmaVez();

      if (renovado.token) {
        if (!config.headers) config.headers = {} as AxiosRequestHeaders;
        config.headers['Authorization'] = `Bearer ${renovado.token}`;
        return api.request(config);
      }

      // Sem rede ou servidor fora: a sessão continua valendo, só devolve o erro para a tela tratar.
      if (!renovado.recusada) return Promise.reject(error);

      // O servidor recusou a renovação: limpa sessão e redireciona
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        console.warn('Sessão expirada. Redirecionando...');
        localStorage.removeItem('awl_token');
        localStorage.removeItem('awl_user');
        localStorage.removeItem('awl_app');
        limparSuperAdmin();
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
   * Login do MASTER — a única credencial que o painel do hub usa.
   *
   * A chave digitada vai para o servidor e é ele quem compara com a
   * MASTER_API_KEY; o navegador nunca recebe a chave de volta, só a sessão. Era
   * o contrário até 29/08/2026: o cliente tinha a chave inteira (`VITE_MASTER_KEY`
   * publicada no bundle pelo Vite) e comparava aqui mesmo, o que a expunha a
   * quem apenas abrisse a página.
   *
   * Função separada de `login` de propósito: `master@infra.local` está na lista
   * de e-mails reservados que o login comum recusa, e essa recusa é o que
   * impede alguém de tentar o master pelo caminho de usuário.
   */
  loginMaster: async (masterKey: string): Promise<AuthResult> => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    limparSuperAdmin();

    const { data } = await api.post<LoginResponse>('/auth/login', {
      email: MASTER_LOGIN_EMAIL,
      password: masterKey,
    });

    marcarSuperAdmin();
    localStorage.setItem('awl_token', data.token);

    // Mantido igual ao que a sessão master sempre gravou: o painel lê `role`
    // daqui, e trocar para o payload do backend (`role: "admin"`) mudaria o
    // comportamento de tela sem necessidade.
    const adminUser: User = {
      id: 'master-root-id',
      nome: 'Super Administrator',
      email: 'root@infrastructure.local',
      role: 'master',
      app_id: null,
      status: 'ativo'
    };

    localStorage.setItem('awl_user', JSON.stringify(adminUser));
    return { redirect: '/apps' };
  },

  /**
   * Login do master pela DIGITAL (db/020). `resposta` é a assinatura do aparelho
   * já em JSON (apps/ui/src/features/masterDigital.ts); o hub confere e devolve a
   * mesma sessão master do login com a chave.
   */
  loginMasterPelaDigital: async (challengeToken: string, resposta: unknown): Promise<AuthResult> => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    limparSuperAdmin();

    const { data } = await api.post<LoginResponse>('/auth/master-passkey/login/verificar', { challengeToken, resposta });
    if (typeof data.token !== 'string' || !data.token) throw new Error('O servidor não devolveu a sessão.');

    marcarSuperAdmin();
    localStorage.setItem('awl_token', data.token);
    // O mesmo perfil que o login com a chave grava (ver `loginMaster`).
    const adminUser: User = {
      id: 'master-root-id',
      nome: 'Super Administrator',
      email: 'root@infrastructure.local',
      role: 'master',
      app_id: null,
      status: 'ativo'
    };
    localStorage.setItem('awl_user', JSON.stringify(adminUser));
    return { redirect: '/apps' };
  },

  /**
   * Login do usuário.
   * @param appId Opcional — quando o mesmo e-mail existe em apps diferentes,
   *              é necessário informar para desambiguar. Se omitido e o
   *              backend detectar ambiguidade, lança erro com `availableApps`
   *              em `error.response.data.availableApps`.
   */
  login: async (
    email: string,
    password: string,
    appId?: string,
    /** "Meu cofre" (db/019): o aparelho deste navegador e a marca que pede a vaga `cofre` à conta de CPF. */
    cofre?: { aparelho: { id: string; nome: string } },
  ): Promise<AuthResult> => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    limparSuperAdmin();

    const reservedEmails = ['master@infra.local', 'root@system.local', 'admin@local'];
    if (reservedEmails.includes(email)) {
        throw new Error('Acesso Negado: Credenciais Mestra inválidas.');
    }

    const payload: { email: string; password: string; app_id?: string; aparelho_id?: string; aparelho_nome?: string; aparelho_confianca?: string; cofre?: boolean } = { email, password };
    if (appId) payload.app_id = appId;
    if (cofre) {
      payload.aparelho_id = cofre.aparelho.id;
      payload.aparelho_nome = cofre.aparelho.nome;
      payload.cofre = true;
      // Aparelho já registrado (db/021): entra só com CPF + CPF.
      const confianca = confiancaGuardada();
      if (confianca) payload.aparelho_confianca = confianca;
    }

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
    guardarConfianca(sessao);
    localStorage.setItem('awl_token', sessao.token);
    localStorage.setItem('awl_user', JSON.stringify(sessao.usuario));

    if (sessao.app) {
        localStorage.setItem('awl_app', JSON.stringify(sessao.app));
    }

    return { redirect: '/dashboard' };
  },

  /**
   * Login do ADMIN DE ORGANIZAÇÃO no painel (db/012). Mesmo `/auth/login` dos
   * apps, com `painel: true`: o hub troca o tenant pelo app do painel. A conta
   * tem 2FA obrigatório, então o normal é voltar `requires2FA` — quem fecha é
   * `twoFactorApi.verify`, e depois `marcarAdminDeOrganizacao()`.
   */
  loginPainel: async (email: string, password: string): Promise<AuthResult> => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    limparSuperAdmin();

    const { data } = await api.post<LoginResponse | TwoFactorChallengeResponse | TwoFactorSetupRequiredResponse>('/auth/login', {
      email: email.trim().toLowerCase(),
      password,
      painel: true,
    });

    if ('require2FASetup' in data && data.require2FASetup) {
      return { redirect: `/enrolar-2fa?token=${encodeURIComponent(data.setupToken)}`, require2FASetup: true };
    }
    if ('requires2FA' in data && data.requires2FA) {
      return {
        redirect: '/login',
        requires2FA: true,
        challengeToken: data.challengeToken,
        challengeExpiresIn: data.expiresIn,
        methods: data.methods,
      };
    }
    // Conta do painel sem 2FA não existe (o convite marca obrigatório); se
    // vier sessão direta, o `adminMiddleware` recusa do mesmo jeito.
    const sessao = data as LoginResponse;
    guardarConfianca(sessao);
    localStorage.setItem('awl_token', sessao.token);
    localStorage.setItem('awl_user', JSON.stringify(sessao.usuario));
    marcarAdminDeOrganizacao();
    return { redirect: '/dashboard' };
  },

  logout: () => {
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_app');
    limparSuperAdmin();
    window.location.href = '/login';
  },

  /**
   * Define a senha pelo magic link. Três desfechos, nesta ordem de checagem:
   *
   *   `requires2FA`      → a conta já tem 2FA ativo (típico de reset de senha).
   *                        NÃO vem sessão: use `challengeToken` em
   *                        `twoFactorApi.verify`, como se viesse do login.
   *   `require2FASetup`  → falta enrolar. O `token` gravado abaixo é um passe
   *                        de 10 min que só abre as rotas de enrolamento —
   *                        emende direto no QR, não trate como sessão.
   *   nenhum dos dois    → sessão de 24h normal.
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
    const renovado = await renovarUmaVez();
    if (!renovado.token) return null;
    return {
      token: renovado.token,
      expiresIn: 86400,
      usuario: JSON.parse(localStorage.getItem('awl_user') || 'null'),
      app: JSON.parse(localStorage.getItem('awl_app') || 'null'),
    };
  },

  isAuthenticated: (): boolean => {
    const token = localStorage.getItem('awl_token');
    return !!token || ehSuperAdmin();
  },

  /** Quem está no painel e de quais organizações cuida (master = todas). */
  eu: async (): Promise<EscopoDoPainel> => {
    const { data } = await api.get<EscopoDoPainel>('/admin/eu');
    return data;
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
/**
 * Chave de aparelho confiável (db/021): o hub a entrega no login completo (com 2FA)
 * de conta de CPF de app com `aparelho_confiavel`; com ela, o próximo login deste
 * navegador no "Meu cofre" entra só com CPF + CPF. Fica no navegador, como o id do
 * aparelho (`hub_aparelho_id`), e sai junto quando os dados do site são limpos.
 */
const CHAVE_CONFIANCA = 'hub_aparelho_confianca';
const guardarConfianca = (data: { aparelho_confianca?: string }): void => {
  if (data.aparelho_confianca) {
    try { localStorage.setItem(CHAVE_CONFIANCA, data.aparelho_confianca); } catch { /* sem armazenamento: pede o código de novo */ }
  }
};
const confiancaGuardada = (): string | undefined => {
  try { return localStorage.getItem(CHAVE_CONFIANCA) || undefined; } catch { return undefined; }
};

const salvarSessao = (data: LoginResponse): void => {
  guardarConfianca(data);
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
    // A ativação carimba o piso de sessão e mata o token que fez ESTA chamada.
    // Sem gravar o que veio na resposta, a requisição seguinte cai em 401
    // SESSAO_REVOGADA e o /auth/refresh recusa junto — quem acabou de concluir
    // o convite seria deslogado no exato momento em que terminou.
    // Só o token: `usuario` e `app` no storage não mudam com o enrolamento.
    if (data.token) localStorage.setItem('awl_token', data.token);
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
  },
  /**
   * Sobe ou desce o app uma posição dentro da própria categoria. `moveu: false`
   * quando já estava na ponta — recarregue a lista de qualquer jeito.
   */
  mover: async (id: string, direcao: DirecaoMovimento): Promise<{ moveu: boolean }> => {
    const { data } = await api.patch<{ moveu: boolean }>(`${APPS_BASE_URL}/${id}/mover`, { direcao });
    return data;
  }
};

// ==========================================
// CATEGORIA API — grupos de apps do painel
// ==========================================
const CATEGORIAS_BASE_URL = '/admin/categorias';

export const categoriaApi = {
  getAll: async (): Promise<Categoria[]> => {
    const { data } = await api.get<Categoria[]>(CATEGORIAS_BASE_URL);
    return data;
  },
  create: async (payload: CreateCategoriaDTO): Promise<Categoria> => {
    const { data } = await api.post<Categoria>(CATEGORIAS_BASE_URL, payload);
    return data;
  },
  update: async (id: number, payload: UpdateCategoriaDTO): Promise<Categoria> => {
    const { data } = await api.put<Categoria>(`${CATEGORIAS_BASE_URL}/${id}`, payload);
    return data;
  },
  /** Os apps da categoria voltam para "Sem categoria"; nenhum app é apagado. */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${CATEGORIAS_BASE_URL}/${id}`);
  },
  mover: async (id: number, direcao: DirecaoMovimento): Promise<{ moveu: boolean }> => {
    const { data } = await api.patch<{ moveu: boolean }>(`${CATEGORIAS_BASE_URL}/${id}/mover`, { direcao });
    return data;
  }
};

// ==========================================
// VENDA API — assinatura mensal do app, afiliados e comissões (db/009)
// ==========================================
export interface PainelDeVendas {
  /** null = o app ainda não tem preço: não está à venda. */
  plano: PlanoApp | null;
  resumo: ResumoVendas;
  afiliados: Afiliado[];
  assinaturas: Assinatura[];
}

export const vendaApi = {
  painel: async (appId: string): Promise<PainelDeVendas> => {
    const { data } = await api.get<PainelDeVendas>(`/admin/apps/${appId}/vendas`);
    return data;
  },
  /** O preço novo vale para assinatura nova; quem já assina mantém o valor. */
  salvarPlano: async (appId: string, payload: SalvarPlanoDTO): Promise<PlanoApp> => {
    const { data } = await api.put<PlanoApp>(`/admin/apps/${appId}/plano`, payload);
    return data;
  },
  criarAfiliado: async (appId: string, payload: SalvarAfiliadoDTO): Promise<void> => {
    await api.post(`/admin/apps/${appId}/afiliados`, payload);
  },
  atualizarAfiliado: async (id: number, payload: SalvarAfiliadoDTO): Promise<void> => {
    await api.put(`/admin/afiliados/${id}`, payload);
  },
  /** Só apaga afiliado sem indicação; com histórico a API recusa (desative). */
  apagarAfiliado: async (id: number): Promise<void> => {
    await api.delete(`/admin/afiliados/${id}`);
  },
  /** Marca como paga toda a comissão em aberto do afiliado. */
  pagarComissoes: async (id: number): Promise<{ total: number; mensalidades: number }> => {
    const { data } = await api.post<{ total: number; mensalidades: number }>(`/admin/afiliados/${id}/pagar-comissoes`);
    return data;
  },
  /** Para de cobrar no Mercado Pago e desliga o acesso. */
  cancelarAssinatura: async (id: number): Promise<void> => {
    await api.post(`/admin/assinaturas/${id}/cancelar`);
  },
  reenviarAcesso: async (id: number): Promise<{ emailSent: boolean }> => {
    const { data } = await api.post<{ emailSent: boolean }>(`/admin/assinaturas/${id}/reenviar-acesso`);
    return data;
  },
  /** Confere agora, no Mercado Pago, o estado de todas as assinaturas. */
  conferir: async (): Promise<void> => {
    await api.post('/admin/assinaturas/conferir');
  },
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
  /**
   * Descarta o autenticador do usuário (perdeu o celular e os códigos).
   *
   * NÃO isenta ninguém de 2FA: a conta volta para "precisa enrolar" e escaneia
   * um QR novo no próximo login. As sessões em curso caem junto.
   */
  resetTwoFactor: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.post<{ message: string }>(`${USERS_BASE_URL}/${id}/reset-2fa`);
    return data;
  },
  resetPassword: async (id: string, emailHtml?: string): Promise<{ message: string; emailSent: boolean; magicLinkToken?: string }> => {
    const { data } = await api.post<{ message: string; emailSent: boolean; magicLinkToken?: string }>(`${USERS_BASE_URL}/${id}/reset-password`, { emailHtml });
    return data;
  }
};

// ==========================================
// LISTA NEGRA DO LOGIN (28/10/2026)
// ==========================================
/** Bloqueios por app: 5 falhas por IP, 10 por conta em 1 h; só sai por `liberar`. */
/**
 * Um aparelho por conta de CPF (04/11/2026): quem está preso a qual aparelho
 * (nome + IP) e o registro dos logins; `liberar` solta a conta do aparelho.
 */
export const aparelhoApi = {
  /** Com `usuarioId`: só a ficha dessa pessoa (aparelho preso + os últimos 200 eventos dela). */
  getByAppId: async (appId: string, usuarioId?: number | string): Promise<AparelhosDoApp> => {
    const { data } = await api.get<AparelhosDoApp>(`/admin/apps/${appId}/aparelhos`, {
      params: usuarioId !== undefined ? { usuario: usuarioId } : undefined,
    });
    return data;
  },
  /** `tipo`: solta só a vaga do celular ou do computador; sem ele, as duas. */
  liberar: async (usuarioId: number | string, por: string, appId?: string, tipo?: 'celular' | 'computador' | 'telegram' | 'cofre'): Promise<void> => {
    await api.post(`/admin/aparelhos/${usuarioId}/liberar`, {
      por,
      ...(appId ? { app_id: Number(appId) } : {}),
      ...(tipo ? { tipo } : {}),
    });
  },
};

export const bloqueioApi = {
  getByAppId: async (appId: string): Promise<LoginBloqueio[]> => {
    const { data } = await api.get<LoginBloqueio[]>(`/admin/apps/${appId}/bloqueios`);
    return data;
  },
  liberar: async (id: number, por: string, appId?: string): Promise<LoginBloqueio> => {
    const { data } = await api.post<LoginBloqueio>(`/admin/bloqueios/${id}/liberar`, {
      por,
      ...(appId ? { app_id: Number(appId) } : {}),
    });
    return data;
  },
  /** Apaga da lista uma linha já liberada (05/11/2026). */
  excluir: async (id: number, por: string, appId: string): Promise<void> => {
    await api.delete(`/admin/bloqueios/${id}`, { params: { app_id: Number(appId), por } });
  },
};

// ==========================================
// ADMINS DE ORGANIZAÇÃO (db/012, 19/11/2026) — o botão "Convidar admin"
// ==========================================
export const organizacaoApi = {
  admins: async (categoriaId: number): Promise<AdminOrganizacao[]> => {
    const { data } = await api.get<AdminOrganizacao[]>(`/admin/organizacoes/${categoriaId}/admins`);
    return data;
  },
  /** Pessoa nova recebe o convite por e-mail (senha + Google Authenticator). */
  convidar: async (categoriaId: number, payload: ConvidarAdminDTO): Promise<ConvidarAdminResposta> => {
    const { data } = await api.post<ConvidarAdminResposta>(`/admin/organizacoes/${categoriaId}/admins`, payload);
    return data;
  },
  /** Manda à pessoa o e-mail com o link para criar uma senha nova (o 2FA continua o mesmo). */
  resetarSenha: async (categoriaId: number, usuarioId: number): Promise<{ message: string; emailSent: boolean; magicLinkToken?: string }> => {
    const { data } = await api.post<{ message: string; emailSent: boolean; magicLinkToken?: string }>(
      `/admin/organizacoes/${categoriaId}/admins/${usuarioId}/reset-senha`,
    );
    return data;
  },
  /** Tira da organização; a conta fica (sem organização, o painel não abre nada). */
  remover: async (categoriaId: number, usuarioId: number): Promise<void> => {
    await api.delete(`/admin/organizacoes/${categoriaId}/admins/${usuarioId}`);
  },
};

// ==========================================
// DIGITAL DO MASTER (db/020, 24/11/2026)
// ==========================================
// O pedido da digital ao aparelho mora na UI (apps/ui/src/features/masterDigital.ts).
export interface OpcoesDaDigital {
  opcoes: Record<string, any>;
  challengeToken: string;
}
export interface DigitalDoMaster {
  id: number;
  nome: string;
  criado_em: string | null;
  ultimo_uso: string | null;
}
export const masterDigitalApi = {
  /** A tela de login mostra o botão da digital? (público) */
  disponivel: async (): Promise<boolean> => {
    const { data } = await api.get<{ disponivel: boolean }>('/auth/master-passkey/disponivel');
    return data.disponivel === true;
  },
  opcoesDeLogin: async (): Promise<OpcoesDaDigital> => {
    const { data } = await api.post<OpcoesDaDigital>('/auth/master-passkey/login/opcoes', {});
    return data;
  },
  opcoesDeRegistro: async (): Promise<OpcoesDaDigital> => {
    const { data } = await api.post<OpcoesDaDigital>('/admin/master-passkeys/registro/opcoes', {});
    return data;
  },
  registrar: async (challengeToken: string, resposta: unknown, nome: string): Promise<DigitalDoMaster> => {
    const { data } = await api.post<DigitalDoMaster>('/admin/master-passkeys/registro/verificar', { challengeToken, resposta, nome });
    return data;
  },
  listar: async (): Promise<DigitalDoMaster[]> => {
    const { data } = await api.get<DigitalDoMaster[]>('/admin/master-passkeys');
    return data;
  },
  tirar: async (id: number): Promise<void> => {
    await api.delete(`/admin/master-passkeys/${id}`);
  },
};

// ==========================================
// COFRE DE SENHAS (db/013 e db/014, 19/11/2026) — só texto cifrado viaja por aqui
// ==========================================
// A cifra e a decifra moram na UI (apps/ui/src/features/cofre/cripto.ts) e no
// CLI hub-pass. Rotas em /cofre: master, usuário de app com cofre liberado.
/** A conta do app no "Meu cofre" (db/021). `totp` é a URI otpauth:// do 2FA da própria conta. */
export interface ContaDoAppNoCofre {
  titulo: string;
  usuario: string;
  url: string | null;
  logo: string | null;
  totp: string;
}

export const cofreApi = {
  estado: async (): Promise<CofreEstado> => {
    const { data } = await api.get<CofreEstado>('/cofre');
    return data;
  },
  /**
   * A conta do app da própria pessoa (db/021): logo, CPF e o código 2FA ao vivo, para
   * o "Meu cofre" mostrar sem palavra-passe. `null` fora de app com `aparelho_confiavel`.
   */
  contaDoApp: async (): Promise<ContaDoAppNoCofre | null> => {
    const { data } = await api.get<{ conta: ContaDoAppNoCofre | null }>('/cofre/conta-do-app');
    return data.conta;
  },
  criarConta: async (conta: CofreConta): Promise<void> => {
    await api.post('/cofre/conta', conta);
  },
  trocarSenha: async (conta: Pick<CofreConta, 'kdf' | 'chave_por_senha'>): Promise<void> => {
    await api.put('/cofre/conta', conta);
  },
  salvarCofre: async (id: string, dados: string): Promise<void> => {
    await api.put(`/cofre/cofres/${id}`, { dados });
  },
  apagarCofre: async (id: string): Promise<void> => {
    await api.delete(`/cofre/cofres/${id}`);
  },
  salvarItem: async (id: string, cofreId: string, dados: string): Promise<void> => {
    await api.put(`/cofre/itens/${id}`, { cofre_id: cofreId, dados });
  },
  apagarItem: async (id: string): Promise<void> => {
    await api.delete(`/cofre/itens/${id}`);
  },
  /** Máquinas aprovadas do CLI hub-pass. */
  aparelhos: async (): Promise<CofreAparelho[]> => {
    const { data } = await api.get<CofreAparelho[]>('/cofre/aparelhos');
    return data;
  },
  revogarAparelho: async (id: string): Promise<void> => {
    await api.delete(`/cofre/aparelhos/${id}`);
  },
  /** Aprovação pelo navegador (db/017): o pedido que o `hub-pass login` deixou, pelo código. */
  pedidoDeAparelho: async (codigo: string): Promise<CofreAparelhoPedido> => {
    const { data } = await api.get<CofreAparelhoPedido>(`/cofre/aparelhos/pedidos/${encodeURIComponent(codigo)}`);
    return data;
  },
  aprovarPedido: async (id: string, acesso: CofreAparelhoAcesso): Promise<void> => {
    await api.post(`/cofre/aparelhos/pedidos/${id}/aprovar`, acesso);
  },
  alterarAcesso: async (id: string, acesso: CofreAparelhoAcesso): Promise<void> => {
    await api.put(`/cofre/aparelhos/${id}/acesso`, acesso);
  },
  /** Digitais que abrem o cofre (passkey com PRF, db/015). */
  digitais: async (): Promise<CofreDigital[]> => {
    const { data } = await api.get<CofreDigital[]>('/cofre/digitais');
    return data;
  },
  registrarDigital: async (digital: CofreDigitalNova): Promise<void> => {
    await api.post('/cofre/digitais', digital);
  },
  revogarDigital: async (id: string): Promise<void> => {
    await api.delete(`/cofre/digitais/${id}`);
  },
  usouDigital: async (id: string): Promise<void> => {
    await api.post(`/cofre/digitais/${id}/uso`, {});
  },
  /** Entrada pelo cofre (db/016): o que o app pediu (guardar a chave ou entrar). */
  pedidoDeEntrada: async (passe: string): Promise<CofreEntradaPedido> => {
    const { data } = await api.post<CofreEntradaPedido>('/cofre/entradas/pedido', { passe });
    return data;
  },
  registrarEntrada: async (entrada: CofreEntradaNova): Promise<void> => {
    await api.post('/cofre/entradas', entrada);
  },
  revogarEntrada: async (id: string): Promise<void> => {
    await api.delete(`/cofre/entradas/${id}`);
  },
};
