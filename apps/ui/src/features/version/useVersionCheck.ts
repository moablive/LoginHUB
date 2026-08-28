import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Descobre que o build no ar deixou de ser o que esta aba carregou.
 *
 * O aviso e uma sugestao, nao um reload automatico: recarregar sozinho jogaria
 * fora um convite meio preenchido ou um enrolamento de 2FA no meio. Quem decide
 * e o usuario, no banner.
 *
 * Nao usamos o cliente do @loginhub/api-client de proposito: o interceptor dele
 * derruba a sessao em qualquer 401, e uma checagem de fundo nao pode ter esse
 * poder. `fetch` puro, sem header custom (header custom viraria preflight, e o
 * corsMiddleware da API so libera o conjunto padrao).
 */

const envUrl = import.meta.env.VITE_API_URL;
/** Em dev/producao o painel e a API dividem o hostname: /api cai no proxy do vite. */
const HEALTH_URL = envUrl || '/api';

/** De quanto em quanto tempo perguntar, com a aba aberta e visivel. */
const INTERVALO_MS = 5 * 60 * 1000;

/** Piso entre duas checagens — segura o vai-e-volta de foco no celular. */
const INTERVALO_MINIMO_MS = 60 * 1000;

/** API fora do ar nao pode deixar a promise pendurada para sempre. */
const TIMEOUT_MS = 8000;

/**
 * Versao para a qual esta aba ja recarregou. Se o reload nao resolveu — deploy
 * parcial, com a api em uma versao e a ui em outra — o aviso nao pode voltar a
 * cada checagem. `sessionStorage` porque a marca precisa sobreviver ao reload e
 * morrer com a aba. O prefixo `loginhub_` evita colisao com outro app do
 * mesmo dominio.
 */
const CHAVE_TENTATIVA = 'loginhub_update_recarregado_para';

interface Health {
  version?: string;
  buildDate?: string | null;
}

const versaoLocal = import.meta.env.VITE_APP_VERSION || '';
const buildDateLocal = import.meta.env.VITE_APP_BUILD_DATE || '';

/**
 * Sem versao injetada (dev na maquina, sem .env) a comparacao so produziria
 * falso positivo contra a versao real da API — e ninguem confia em aviso que
 * aparece sempre.
 */
const temBaseline = Boolean(versaoLocal) && versaoLocal !== '0.0.0';

function ehDeployNovo(health: Health): boolean {
  if (health.version && health.version !== versaoLocal) return true;
  // Rebuild sem bump mantem a versao e muda a data. So compara se os dois lados
  // tiverem data — senao um .env sem APP_BUILD_DATE acusaria sempre.
  if (buildDateLocal && health.buildDate && health.buildDate !== buildDateLocal) return true;
  return false;
}

// Navegador com storage bloqueado (aba privada, cookies negados) lanca aqui.
// Perder a marca so custa um aviso repetido; quebrar a checagem custa mais.
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
  /** Versao que esta no ar, preenchida so quando difere desta aba. */
  const [versaoNova, setVersaoNova] = useState<string | null>(null);
  const ultimaChecagem = useRef(0);
  /** Ref, e nao o state: o efeito monta uma vez so e nao enxergaria o state novo. */
  const achou = useRef(false);

  useEffect(() => {
    if (!temBaseline) return;

    let vivo = true;

    const checar = async () => {
      // Achou uma vez, achou: o banner ja esta na tela, parar de perguntar.
      if (!vivo || achou.current) return;
      if (document.visibilityState !== 'visible') return;

      const agora = Date.now();
      if (agora - ultimaChecagem.current < INTERVALO_MINIMO_MS) return;
      ultimaChecagem.current = agora;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) return;

        const health = (await res.json()) as Health;
        if (!ehDeployNovo(health)) return;

        const versao = health.version || '';
        if (jaTentou(versao)) return;

        achou.current = true;
        if (vivo) setVersaoNova(versao);
      } catch {
        // Offline, tunel caido, timeout: silencio. Tenta de novo no proximo ciclo.
      } finally {
        clearTimeout(timeout);
      }
    };

    void checar();
    const timer = setInterval(() => void checar(), INTERVALO_MS);
    // Voltar para o painel e o momento mais provavel de ter deploy novo
    // esperando — e e ai que o celular reativa a aba congelada.
    document.addEventListener('visibilitychange', checar);

    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', checar);
    };
    // Sem dependencias: o efeito monta uma vez e se desliga sozinho no unmount.
  }, []);

  /** Reload de verdade: descarta o bundle antigo e busca o index.html novo. */
  const atualizar = useCallback(() => {
    if (versaoNova) marcarTentativa(versaoNova);
    window.location.reload();
  }, [versaoNova]);

  return { versaoNova, atualizar };
}
