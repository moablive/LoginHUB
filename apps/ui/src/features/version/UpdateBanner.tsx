import { useMemo, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useVersionCheck } from './useVersionCheck';

/**
 * Aviso de "nova versao disponivel".
 *
 * O hub nao tem precache: o service worker roda com `injectionPoint: undefined`
 * (ver vite.config.ts), justamente porque o painel ja ficou preso numa versao
 * antiga por causa dele. Sem precache, o `window.location.reload()` do
 * useVersionCheck busca o index.html do servidor de verdade — nao ha o que
 * conciliar com o SW.
 */
export function UpdateBanner() {
  const { versaoNova, atualizar } = useVersionCheck();

  // Dispensar vale so para a versao dispensada: se sair outro deploy depois, o
  // aviso volta. Dispensar de vez esconderia o proximo.
  const [dispensada, setDispensada] = useState<string | null>(null);

  const versaoAtual = import.meta.env.VITE_APP_VERSION || '';
  const visivel = Boolean(versaoNova) && dispensada !== versaoNova;

  // Rebuild sem bump muda so a data: citar o numero confundiria ("a v1.0.4 ja
  // esta no ar" para quem esta na v1.0.4).
  const descricao = useMemo(
    () =>
      versaoNova && versaoNova !== versaoAtual
        ? `A v${versaoNova} já está no ar. Atualize para carregar a versão mais recente.`
        : 'Um build mais recente está no ar. Atualize para carregá-lo.',
    [versaoNova, versaoAtual],
  );

  if (!visivel) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // bottom-24: o ThemeToggle mora no canto inferior direito (bottom-6,
      // z-50). z-[10000] passa por cima dele e do VersionBadge.
      className="fixed inset-x-2 bottom-24 z-[10000] rounded-lg border border-border
                 bg-card p-3 text-foreground shadow-xl
                 sm:left-auto sm:right-6 sm:w-80"
    >
      <div className="flex items-start gap-2">
        <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug">Nova versão disponível</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{descricao}</p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground
                     transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setDispensada(versaoNova)}
        >
          Depois
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5
                     text-xs font-semibold text-primary-foreground transition-opacity
                     hover:opacity-90"
          onClick={atualizar}
        >
          <ArrowPathIcon className="h-3.5 w-3.5" />
          Atualizar agora
        </button>
      </div>
    </div>
  );
}
