import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Trava a rolagem da página enquanto uma folha/alerta está aberta.
 *
 * Contador de módulo, não flag: um alerta aberto POR CIMA de uma folha (erro
 * dentro do formulário) não pode destravar a página ao fechar, com a folha
 * ainda na tela.
 */
let abertas = 0;

function aplicar() {
  document.body.style.overflow = abertas > 0 ? 'hidden' : '';
}

export function useTravaRolagem(aberto: Ref<boolean>) {
  let travou = false;

  const soltar = () => {
    if (!travou) return;
    travou = false;
    abertas = Math.max(0, abertas - 1);
    aplicar();
  };

  watch(
    aberto,
    (v) => {
      if (v && !travou) {
        travou = true;
        abertas += 1;
        aplicar();
      } else if (!v) {
        soltar();
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(soltar);
}
