import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Descobre que o build no ar deixou de ser o que esta aba carregou.
 *
 * O aviso é uma sugestão, não um reload automático: recarregar sozinho jogaria
 * fora um convite meio preenchido ou um enrolamento de 2FA no meio. Quem decide
 * é o usuário, no banner.
 *
 * Não usamos o cliente do @loginhub/api-client de propósito: o interceptor dele
 * derruba a sessão em qualquer 401, e uma checagem de fundo não pode ter esse
 * poder. `fetch` puro, sem header custom (header custom viraria preflight, e o
 * corsMiddleware da API só libera o conjunto padrão).
 */

const envUrl = import.meta.env.VITE_API_URL;
/** Em dev/produção o painel e a API dividem o hostname: /api cai no proxy. */
const HEALTH_URL = envUrl || '/api';

/** De quanto em quanto tempo perguntar, com a aba aberta e visível. */
const INTERVALO_MS = 5 * 60 * 1000;

/** Piso entre duas checagens — segura o vai-e-volta de foco no celular. */
const INTERVALO_MINIMO_MS = 60 * 1000;

/** API fora do ar não pode deixar a promise pendurada para sempre. */
const TIMEOUT_MS = 8000;

/**
 * Versão para a qual esta aba já recarregou. Se o reload não resolveu — deploy
 * parcial, com a api em uma versão e a ui em outra — o aviso não pode voltar a
 * cada checagem. `sessionStorage` porque a marca precisa sobreviver ao reload e
 * morrer com a aba. O prefixo `loginhub_` evita colisão com outro app do
 * mesmo domínio.
 */
const CHAVE_TENTATIVA = 'loginhub_update_recarregado_para';

interface Health {
  version?: string;
  buildDate?: string | null;
}

const versaoLocal = import.meta.env.VITE_APP_VERSION || '';
const buildDateLocal = import.meta.env.VITE_APP_BUILD_DATE || '';

/**
 * Sem versão injetada (dev na máquina, sem .env) a comparação só produziria
 * falso positivo contra a versão real da API — e ninguém confia em aviso que
 * aparece sempre.
 */
const temBaseline = Boolean(versaoLocal) && versaoLocal !== '0.0.0';

function ehDeployNovo(health: Health): boolean {
  if (health.version && health.version !== versaoLocal) return true;
  // Rebuild sem bump mantém a versão e muda a data. Só compara se os dois lados
  // tiverem data — senão um .env sem APP_BUILD_DATE acusaria sempre.
  if (buildDateLocal && health.buildDate && health.buildDate !== buildDateLocal) return true;
  return false;
}

// Navegador com storage bloqueado (aba privada, cookies negados) lança aqui.
// Perder a marca só custa um aviso repetido; quebrar a checagem custa mais.
function jaTentou(versao: string): boolean {
  try {
    return sessionStorage.getItem(CHAVE_TENTATIVA) === versao;
  } catch {
    return false;
  }
}

function marcarTentativa(versao: string) {
  try {
    sessionStorage.setItem(CHAVE_TENTATIVA, versao);
  } catch {
    /* segue sem a marca */
  }
}

export function useVersionCheck() {
  /** Versão que está no ar, preenchida só quando difere desta aba. */
  const versaoNova = ref<string | null>(null);
  let ultimaChecagem = 0;
  let vivo = true;
  let timer: ReturnType<typeof setInterval> | undefined;

  const checar = async () => {
    // Achou uma vez, achou: o banner já está na tela, parar de perguntar.
    if (!vivo || versaoNova.value !== null) return;
    if (document.visibilityState !== 'visible') return;

    const agora = Date.now();
    if (agora - ultimaChecagem < INTERVALO_MINIMO_MS) return;
    ultimaChecagem = agora;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return;

      const health = (await res.json()) as Health;
      if (!ehDeployNovo(health)) return;

      const versao = health.version || '';
      if (jaTentou(versao)) return;

      if (vivo) versaoNova.value = versao;
    } catch {
      // Offline, túnel caído, timeout: silêncio. Tenta de novo no próximo ciclo.
    } finally {
      clearTimeout(timeout);
    }
  };

  onMounted(() => {
    if (!temBaseline) return;
    void checar();
    timer = setInterval(() => void checar(), INTERVALO_MS);
    // Voltar para o painel é o momento mais provável de ter deploy novo
    // esperando — e é aí que o celular reativa a aba congelada.
    document.addEventListener('visibilitychange', checar);
  });

  onBeforeUnmount(() => {
    vivo = false;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', checar);
  });

  /** Reload de verdade: descarta o bundle antigo e busca o index.html novo. */
  function atualizar() {
    if (versaoNova.value) marcarTentativa(versaoNova.value);
    window.location.reload();
  }

  return { versaoNova, atualizar };
}
