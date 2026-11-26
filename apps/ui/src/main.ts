import { createApp } from 'vue';
import { renovarSessaoSeVelha } from '@loginhub/api-client';

import './index.css';

import App from './App.vue';
import { router } from './router';

createApp(App).use(router).mount('#app');

// Sessão perto de vencer é renovada ao abrir e ao voltar do segundo plano, antes do primeiro toque (celular).
void renovarSessaoSeVelha();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void renovarSessaoSeVelha();
});
