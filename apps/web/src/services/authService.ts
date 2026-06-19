import api from './api';
import type { User, LoginResponse } from '@loginhub/shared';
import type { AuthResult } from '../types';

export const authService = {
  /**
   * Realiza login (Super Admin via Env ou Usuário via API)
   */
  login: async (email: string, password: string): Promise<AuthResult> => {
    
    // 0. LIMPEZA PREVENTIVA
    localStorage.removeItem('awl_token');
    localStorage.removeItem('awl_user');
    localStorage.removeItem('awl_empresa');
    sessionStorage.removeItem('is_super_admin');

    // 1. VERIFICAÇÃO SUPER ADMIN (Local via .env)
    const masterKey = import.meta.env.VITE_MASTER_KEY;

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

    // 2. TRAVA DE SEGURANÇA LÓGICA
    const reservedEmails = ['master@infra.local', 'root@system.local', 'admin@local'];
    if (reservedEmails.includes(email)) {
        throw new Error('Acesso Negado: Credenciais Mestra inválidas.');
    }

    // 3. LOGIN USUÁRIO COMUM (Via API Backend)
    // O try/catch foi removido pois o erro será tratado por quem chamar essa função (ex: o formulário de login)
    const { data } = await api.post<LoginResponse>('/auth/login', { 
      email, 
      password 
    });
    
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
    const user = authService.getUser();
    return user?.role || null;
  }
};