import axios, { type InternalAxiosRequestConfig, type AxiosRequestHeaders } from 'axios';

// Cria a instância do Axios
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL, 
  headers: {
    'Content-Type': 'application/json',
  },
});

// =================================================================
// 1. INTERCEPTOR DE REQUISIÇÃO (Envia Token ou Master Key)
// =================================================================
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Garante que headers existe
    if (!config.headers) {
      config.headers = {} as AxiosRequestHeaders;
    }

    const token = localStorage.getItem('awl_token');
    const masterKey = import.meta.env.VITE_MASTER_KEY;
    
    // LÓGICA DE AUTENTICAÇÃO:
    
    // 1. Cenário Padrão: Usuário logado
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    } 
    // 2. Cenário Bootstrap/Recuperação: Sem token, mas com Chave Mestra no .env
    // Removemos a verificação de '/admin' pois suas rotas agora são '/companies', '/users', etc.
    else if (masterKey) {
      config.headers['x-api-key'] = masterKey; 
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// =================================================================
// 2. INTERCEPTOR DE RESPOSTA (Trata Erros Globais)
// =================================================================
api.interceptors.response.use(
  (response) => response,
  (error) => {
    
    if (error.response) {
      const { status } = error.response;

      // 401: Token Expirado, Inválido ou Ausente
      if (status === 401) {
        // Evita loop infinito se já estiver na tela de login
        if (!window.location.pathname.includes('/login')) {
          console.warn('Sessão expirada. Redirecionando...');
          
          // EVITA DEPENDÊNCIA CIRCULAR:
          // Em vez de chamar authService.logout(), limpamos direto aqui.
          localStorage.removeItem('awl_token');
          localStorage.removeItem('awl_user');
          
          // Redirecionamento forçado via window
          window.location.href = '/login'; 
        }
      }

      // 403: Proibido (Logado, mas sem permissão)
      if (status === 403) {
        console.error('⛔ Acesso negado: Nível de permissão insuficiente.');
        // Opcional: Você pode disparar um Toast/Alert global aqui se tiver um EventBus
      }
      
      // 500: Erro de Servidor
      if (status >= 500) {
        console.error('🔥 Erro interno do servidor. Tente novamente mais tarde.');
      }
    } else {
      // Erro de conexão (Network Error)
      console.error('🚨 Erro de conexão: Verifique sua internet ou se o backend está online.');
    }
    
    return Promise.reject(error);
  }
);

export default api;