import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * ESC fecha só a camada de cima. Um alerta aberto por cima de uma folha (erro
 * dentro do formulário) é a camada de cima: com cada um escutando o `window`
 * por conta própria, um ESC fechava os dois e o formulário sumia junto.
 */
const pilha: symbol[] = [];

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || pilha.length === 0) return;
  const topo = pilha[pilha.length - 1];
  if (topo) acoes.get(topo)?.();
});

const acoes = new Map<symbol, () => void>();

export function useCamadaEsc(aberto: Ref<boolean>, fechar: () => void) {
  const id = Symbol('camada');
  acoes.set(id, fechar);

  const sair = () => {
    const i = pilha.indexOf(id);
    if (i >= 0) pilha.splice(i, 1);
  };

  watch(
    aberto,
    (v) => {
      if (v && !pilha.includes(id)) pilha.push(id);
      else if (!v) sair();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    sair();
    acoes.delete(id);
  });
}
