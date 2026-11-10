import { createRouter, createWebHistory } from 'vue-router';
import { authApi, ehSuperAdmin } from '@loginhub/api-client';

/**
 * Rotas do painel. As públicas (login, convite, enrolamento de 2FA) ficam fora
 * do layout; as do super admin passam pela guarda `superAdmin`.
 *
 * As páginas são carregadas sob demanda: quem só abre o link de convite no
 * celular não baixa a tabela de usuários junto.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // --- públicas ---
    { path: '/login', name: 'login', component: () => import('@/pages/LoginPage.vue') },
    { path: '/setup-password', name: 'setup-password', component: () => import('@/pages/SetupPasswordPage.vue') },
    // Enrolamento de 2FA compartilhado: os apps clientes mandam para cá com o
    // passe de 10 min que o login deles devolveu em `require2FASetup`. Uma
    // tela de QR só, em vez de oito divergindo.
    { path: '/enrolar-2fa', name: 'enrolar-2fa', component: () => import('@/pages/Enroll2FAPage.vue') },

    { path: '/', redirect: '/dashboard' },

    // --- área do super admin ---
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { superAdmin: true },
      children: [
        { path: 'dashboard', name: 'dashboard', component: () => import('@/pages/DashboardPage.vue') },
        // Alias antigo: /apps também leva ao dashboard.
        { path: 'apps', redirect: '/dashboard' },
        { path: 'apps/new', name: 'app-novo', component: () => import('@/pages/CreateAppPage.vue') },
        { path: 'apps/:id/users', name: 'app-usuarios', component: () => import('@/pages/AppUsersPage.vue'), props: true },
        // Venda por assinatura: preço, afiliados, assinantes e comissões (db/009).
        { path: 'apps/:id/vendas', name: 'app-vendas', component: () => import('@/pages/AppVendasPage.vue'), props: true },
      ],
    },

    // 404 → login
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
  scrollBehavior(_to, _from, salvo) {
    return salvo ?? { top: 0 };
  },
});

router.beforeEach((to) => {
  if (!to.matched.some((r) => r.meta.superAdmin)) return true;
  // `ehSuperAdmin` e não o sessionStorage direto: a marca migrou para o
  // localStorage porque o sessionStorage morre com a aba, e o celular descarta
  // a aba em segundo plano — ao voltar, o painel expulsava para o login com o
  // token ainda válido. Ver a nota em packages/api-client.
  if (authApi.isAuthenticated() && ehSuperAdmin()) return true;
  return { path: '/login', replace: true };
});
