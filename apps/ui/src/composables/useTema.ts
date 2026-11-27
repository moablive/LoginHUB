import { computed, ref, watch } from 'vue';

/**
 * Tema do hub (27/11/2026, pedido do dono): modo claro, escuro ou colorido, e a cor de destaque
 * (verde, amarelo, vermelho, azul, roxo ou uma personalizada). A escolha fica no localStorage:
 * `theme` = light | dark | color (sem escolha vale a do sistema) e `theme-cor` = id da cor fixa ou
 * `#rrggbb`. O script inline do index.html aplica a classe `dark` antes do primeiro desenho — sem
 * ele a tela piscava branca no escuro.
 *
 * O modo colorido é o escuro com o fundo tingido pela cor escolhida; nos outros modos a cor só muda
 * o destaque (`--acento`).
 */
export type ModoTema = 'claro' | 'escuro' | 'colorido';

export interface CorTema {
  id: string;
  nome: string;
  claro: string;
  escuro: string;
}

// `claro` é o tom sobre fundo branco (texto branco por cima precisa de contraste); `escuro` sobre preto.
export const CORES_TEMA: CorTema[] = [
  { id: 'azul', nome: 'Azul', claro: '#0071E3', escuro: '#0A84FF' },
  { id: 'verde', nome: 'Verde', claro: '#248A3D', escuro: '#30D158' },
  { id: 'amarelo', nome: 'Amarelo', claro: '#A16207', escuro: '#CA8A04' },
  { id: 'vermelho', nome: 'Vermelho', claro: '#D70015', escuro: '#FF453A' },
  { id: 'roxo', nome: 'Roxo', claro: '#7C3AED', escuro: '#A78BFA' },
];

const MODOS: Record<string, ModoTema> = { light: 'claro', dark: 'escuro', color: 'colorido' };
const GRAVA: Record<ModoTema, string> = { claro: 'light', escuro: 'dark', colorido: 'color' };
const HEX = /^#[0-9a-f]{6}$/i;

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null; // storage bloqueado: segue o sistema
  }
}
function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem storage a escolha vale só para esta aba */
  }
}

function modoInicial(): ModoTema {
  const salvo = ler('theme');
  if (salvo && MODOS[salvo]) return MODOS[salvo];
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}
function corInicial(): string {
  const salva = ler('theme-cor');
  if (salva && (HEX.test(salva) || CORES_TEMA.some((c) => c.id === salva))) return salva;
  return 'azul';
}

const modo = ref<ModoTema>(typeof window !== 'undefined' ? modoInicial() : 'claro');
const cor = ref<string>(typeof window !== 'undefined' ? corInicial() : 'azul');

const canais = (hex: string) => `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`;
const hexDe = (c: string, escuro: boolean) => {
  if (HEX.test(c)) return c;
  const p = CORES_TEMA.find((x) => x.id === c) ?? CORES_TEMA[0]!;
  return escuro ? p.escuro : p.claro;
};

function aplicar() {
  const raiz = document.documentElement;
  const escuro = modo.value !== 'claro';
  raiz.classList.toggle('dark', escuro);
  raiz.dataset.tema = modo.value;
  const hex = hexDe(cor.value, escuro);
  const padrao = cor.value === 'azul';
  const estilo = raiz.style;
  // Azul sem modo colorido = o desenho original, sem sobrescrever nada.
  if (padrao) estilo.removeProperty('--acento');
  else estilo.setProperty('--acento', canais(hex));
  const tinge = (pct: number) => `color-mix(in srgb, ${hex} ${pct}%, #000)`;
  for (const [v, pct] of [['--fundo-1', 14], ['--fundo-2', 22], ['--fundo-3', 30]] as const) {
    if (modo.value === 'colorido') estilo.setProperty(v, tinge(pct));
    else estilo.removeProperty(v);
  }
}

watch([modo, cor], () => {
  aplicar();
  gravar('theme', GRAVA[modo.value]);
  gravar('theme-cor', cor.value);
}, { flush: 'sync' });
if (typeof window !== 'undefined') aplicar();

export function useTema() {
  const escuro = computed({
    get: () => modo.value !== 'claro',
    set: (v: boolean) => {
      modo.value = v ? 'escuro' : 'claro';
    },
  });
  return {
    modo,
    cor,
    escuro,
    alternar: () => (escuro.value = !escuro.value),
    definirModo: (m: ModoTema) => (modo.value = m),
    definirCor: (c: string) => (cor.value = c),
  };
}
