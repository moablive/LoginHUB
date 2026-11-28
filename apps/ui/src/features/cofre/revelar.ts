/**
 * Revelar e copiar dado sensível do cofre (28/11/2026): número de cartão, CVV, PIN, número de documento e os arquivos.
 *
 * Regras (docs/plano-cartoes-documentos-cofre.md, F5):
 *  - mostrar ou copiar exige PRESENÇA: digital (passkey) ou palavra-passe, de novo, mesmo com o cofre aberto;
 *  - a presença vale 60 s e some ao trancar o cofre, ao esconder a aba ou ao sair da tela;
 *  - o valor mostrado se esconde sozinho em 20 s;
 *  - o que se copia é apagado da área de transferência em 30 s; o CVV e o PIN nunca vão para a área de transferência.
 *
 * Estado de módulo (um só por aba): a folha de presença (`PresencaSheet.vue`) e as telas de detalhe falam pelo mesmo lugar.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useCofre } from './useCofre';

export const PRESENCA_MS = 60_000;
export const REVELADO_MS = 20_000;
export const AREA_DE_TRANSFERENCIA_MS = 30_000;

const presencaAte = ref(0);
const pedido = ref<{ resolver: (ok: boolean) => void } | null>(null);
/** chave do campo → quando ele volta a ser escondido (ms). */
const reveladosAte = ref<Record<string, number>>({});
/** Relógio de 1 s só enquanto houver algo revelado (a barra de tempo e o auto-ocultar dependem dele). */
const agora = ref(Date.now());
let relogio: ReturnType<typeof setInterval> | undefined;
let limpeza: ReturnType<typeof setTimeout> | undefined;

const temPresenca = (): boolean => Date.now() < presencaAte.value;

function ligarRelogio(): void {
  if (relogio) return;
  relogio = setInterval(() => {
    agora.value = Date.now();
    const vivos = Object.entries(reveladosAte.value).filter(([, fim]) => fim > agora.value);
    if (vivos.length !== Object.keys(reveladosAte.value).length) reveladosAte.value = Object.fromEntries(vivos);
    if (!vivos.length && relogio) {
      clearInterval(relogio);
      relogio = undefined;
    }
  }, 1000);
}

/** A folha de presença está aberta esperando resposta? */
export const pedidoDePresenca = pedido;

/** Pede presença; resolve `true` se já vale ou se a pessoa confirmar, `false` se cancelar. */
export function exigirPresenca(): Promise<boolean> {
  if (temPresenca()) return Promise.resolve(true);
  // Dois toques seguidos não empilham folhas: o segundo pedido espera o primeiro.
  pedido.value?.resolver(false);
  return new Promise<boolean>((resolver) => {
    pedido.value = { resolver };
  });
}

export function presencaConfirmada(): void {
  presencaAte.value = Date.now() + PRESENCA_MS;
  const p = pedido.value;
  pedido.value = null;
  p?.resolver(true);
}

export function presencaCancelada(): void {
  const p = pedido.value;
  pedido.value = null;
  p?.resolver(false);
}

/** Esquece a presença e esconde tudo o que estava aberto (cofre trancado, aba escondida, tela fechada). */
export function esconderTudo(): void {
  presencaAte.value = 0;
  reveladosAte.value = {};
  presencaCancelada();
}

/** Esconde o que estava à mostra mas mantém a presença (trocar de item não pede a digital de novo dentro dos 60 s). */
export function esconderRevelados(): void {
  reveladosAte.value = {};
}

export const estaRevelado = (chave: string): boolean => (reveladosAte.value[chave] ?? 0) > agora.value;
/** Segundos que faltam para o campo se esconder (0 = escondido). */
export const segundosParaEsconder = (chave: string): number => Math.max(0, Math.ceil(((reveladosAte.value[chave] ?? 0) - agora.value) / 1000));

/** Mostra o campo por 20 s depois de confirmar a presença; se já está à mostra, esconde. */
export async function alternarRevelado(chave: string): Promise<boolean> {
  if (estaRevelado(chave)) {
    const { [chave]: _fim, ...resto } = reveladosAte.value;
    reveladosAte.value = resto;
    return false;
  }
  if (!(await exigirPresenca())) return false;
  agora.value = Date.now();
  reveladosAte.value = { ...reveladosAte.value, [chave]: Date.now() + REVELADO_MS };
  ligarRelogio();
  return true;
}

/**
 * Copia um valor sensível depois de confirmar a presença e o apaga da área de transferência em 30 s. Devolve se copiou.
 * (O navegador não deixa LER a área de transferência, então o apagamento escreve vazio: se a pessoa copiou outra coisa
 * nesse meio tempo, ela perde essa cópia. É o preço de não deixar o número de cartão lá.)
 */
export async function copiarSensivel(valor: string): Promise<boolean> {
  if (!(await exigirPresenca())) return false;
  await navigator.clipboard.writeText(valor);
  clearTimeout(limpeza);
  limpeza = setTimeout(() => void navigator.clipboard.writeText('').catch(() => undefined), AREA_DE_TRANSFERENCIA_MS);
  return true;
}

/**
 * Liga as defesas de tempo desta tela: esconde tudo quando o cofre tranca, quando a aba vai para segundo plano e quando a
 * tela de detalhe sai (esta só esconde, a presença segue valendo até acabar o tempo). Chame uma vez no `setup` de quem mostra dado sensível.
 */
export function protegerRevelacao(): void {
  const { aberto } = useCofre();
  const aoEsconderAba = (): void => {
    if (document.hidden) esconderTudo();
  };
  const parar = watch(aberto, (v) => {
    if (!v) esconderTudo();
  });
  onMounted(() => document.addEventListener('visibilitychange', aoEsconderAba));
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', aoEsconderAba);
    parar();
    esconderRevelados();
  });
}
