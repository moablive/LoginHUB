import { computed, ref } from 'vue';

/**
 * Oferta de instalação do PWA — o par do aviso de atualização: um cuida do app
 * que já está instalado, este do que ainda não está.
 *
 * São dois caminhos porque o navegador não oferece um só:
 *
 *   - Chrome e Edge, no Android e no desktop, disparam `beforeinstallprompt`.
 *     Guardamos o evento e `instalar()` abre o diálogo nativo: um clique.
 *   - No iOS esse evento não existe em navegador nenhum, **Chrome incluído**.
 *     Lá todos rodam sobre o WebKit, e adicionar à tela de início é ação de
 *     menu do navegador, que página nenhuma pode disparar. Nesse caso o banner
 *     deixa de ser botão e vira instrução — é o teto da plataforma, não uma
 *     limitação nossa.
 *
 * Os listeners são de módulo, não de componente: o `beforeinstallprompt`
 * dispara uma vez só, logo depois do load, e um `onMounted` chegaria tarde.
 */

/** Evento do Chromium, fora do padrão — o lib.dom do TS não o conhece. */
interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Quanto tempo um "agora não" vale antes de a oferta voltar. */
const CARENCIA_MS = 30 * 24 * 60 * 60 * 1000;

/** Por host: cada app da Astral Wave tem a sua dispensa, mesmo na mesma conta. */
const CHAVE = `aw:instalar-dispensado:${typeof location !== 'undefined' ? location.host : ''}`;

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

/**
 * iPadOS 13+ se anuncia como Mac; o desempate é o touch. Sem isto o iPad não
 * receberia a instrução e ficaria esperando um `beforeinstallprompt` que o
 * WebKit nunca dispara.
 */
const ehIOS =
  /iphone|ipad|ipod/i.test(ua) ||
  (typeof navigator !== 'undefined' &&
    navigator.platform === 'MacIntel' &&
    navigator.maxTouchPoints > 1);

/** Chrome no iOS se identifica por CriOS, e o menu dele não é o do Safari. */
const ehChromeIOS = /crios/i.test(ua);

function jaInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  // `standalone` é a única pista no iOS; `display-mode` cobre o resto.
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function dispensadoAinda(): boolean {
  try {
    const quando = Number(localStorage.getItem(CHAVE) ?? 0);
    return quando > 0 && Date.now() - quando < CARENCIA_MS;
  } catch {
    // Aba privada bloqueia o storage. Oferecer de novo incomoda menos do que
    // sumir com o banner para quem nunca o viu.
    return false;
  }
}

const evento = ref<EventoInstalacao | null>(null);
const instalado = ref(jaInstalado());
const dispensado = ref(dispensadoAinda());
const instalando = ref(false);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sem o preventDefault o Chrome mostra a própria barrinha e não nos entrega
    // o evento — o botão do banner ficaria sem nada para chamar.
    e.preventDefault();
    evento.value = e as EventoInstalacao;
  });

  window.addEventListener('appinstalled', () => {
    instalado.value = true;
    evento.value = null;
  });

  // Instalado com a aba aberta: o modo de exibição muda sem recarregar.
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', (e) => {
    if (e.matches) instalado.value = true;
  });
}

export function useInstalarPwa() {
  /**
   * 'prompt' = diálogo nativo em um clique. 'ios' = instrução, porque lá não há
   * API. 'nenhum' = já instalado, ou navegador que não oferece nem uma coisa
   * nem outra (Firefox no desktop, por exemplo).
   */
  const modo = computed<'prompt' | 'ios' | 'nenhum'>(() => {
    if (instalado.value) return 'nenhum';
    if (evento.value) return 'prompt';
    return ehIOS ? 'ios' : 'nenhum';
  });

  const podeInstalar = computed(() => modo.value !== 'nenhum' && !dispensado.value);

  /** O passo a passo do menu certo: o do Chrome não é o do Safari. */
  const passos = computed(() =>
    ehChromeIOS
      ? ['Toque no menu ⋯ do Chrome', 'Escolha "Adicionar à Tela de Início"', 'Confirme em "Adicionar"']
      : ['Toque em Compartilhar ⬆︎', 'Escolha "Adicionar à Tela de Início"', 'Confirme em "Adicionar"'],
  );

  const rotulo = computed(() => (ehChromeIOS ? 'Chrome' : 'Safari'));

  function dispensar() {
    dispensado.value = true;
    try {
      localStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      /* sem storage a dispensa vale só para esta aba, e está bom */
    }
  }

  async function instalar() {
    const e = evento.value;
    if (!e) return;
    instalando.value = true;
    // Zerado antes do await: o evento é de uso único e um segundo prompt()
    // estoura com InvalidStateError.
    evento.value = null;
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      // Recusa explícita também ganha carência. Reoferecer na carga seguinte é
      // o jeito mais rápido de ensinar o usuário a ignorar o banner.
      if (outcome === 'dismissed') dispensar();
    } catch (erro) {
      console.warn('[pwa] instalação não pôde ser oferecida:', erro);
    } finally {
      instalando.value = false;
    }
  }

  return { podeInstalar, modo, passos, rotulo, instalando, instalado, instalar, dispensar };
}
