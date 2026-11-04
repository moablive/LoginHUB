import { ref, watch } from 'vue';

/**
 * Tema claro/escuro. A escolha manual fica no localStorage (`theme`); sem
 * escolha vale a do sistema. O script inline do index.html aplica a classe
 * antes do primeiro desenho — sem ele a tela piscava branca no escuro.
 */
function inicial(): boolean {
  try {
    const salvo = localStorage.getItem('theme');
    if (salvo) return salvo === 'dark';
  } catch {
    /* storage bloqueado: segue o sistema */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const escuro = ref(typeof window !== 'undefined' ? inicial() : false);

watch(
  escuro,
  (v) => {
    document.documentElement.classList.toggle('dark', v);
    try {
      localStorage.setItem('theme', v ? 'dark' : 'light');
    } catch {
      /* sem storage a escolha vale só para esta aba */
    }
  },
  { flush: 'sync' },
);

export function useTema() {
  return { escuro, alternar: () => (escuro.value = !escuro.value) };
}
