import { ArrowLongRightIcon, CubeIcon, UserIcon } from "@heroicons/react/24/outline";

import { getAppLinks, linkDirectionLabel } from "../../config/appLinks";

/**
 * Desenha por inteiro o vínculo entre dois apps clientes: quem serve, quem lê e
 * o que a pessoa passa a enxergar. Versão longa do `AppLinkBadge`, para o
 * cabeçalho da página de usuários — não use dentro de tabela.
 *
 * Fica justamente na tela onde se convida gente, e por isso repete em destaque
 * o que mais confunde: o vínculo é por pessoa. Convidar alguém para um dos apps
 * não lhe dá o outro nem faz o outro aparecer na tela dele.
 */
interface AppLinkPanelProps {
  /** Id do aplicativo no hub. Sem vínculo cadastrado, nada é desenhado. */
  appId?: string | undefined;
}

const nodeClass =
  "inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm";

export const AppLinkPanel = ({ appId }: AppLinkPanelProps) => {
  const views = getAppLinks(appId);
  if (!views.length) return null;

  return (
    <div className="space-y-3">
      {views.map((view) => (
        <div
          key={`${view.link.providerId}-${view.link.consumerId}`}
          className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className={nodeClass}>
              <CubeIcon className="h-4 w-4 text-amber-500" />
              {view.link.providerName}
            </span>

            <span className="flex items-center gap-1 text-amber-500" title={linkDirectionLabel(view)}>
              <span className="h-px w-5 bg-amber-500/60" />
              <ArrowLongRightIcon className="h-4 w-4" />
              <span className="h-px w-5 bg-amber-500/60" />
            </span>

            <span className={nodeClass}>
              <CubeIcon className="h-4 w-4 text-amber-500" />
              {view.link.consumerName}
            </span>

            <span className="text-xs text-muted-foreground">
              vínculo entre aplicativos —{" "}
              <strong className="text-foreground">
                {view.side === "provider" ? "este serve os dados" : "este lê os dados"}
              </strong>
            </span>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">{view.link.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Dados:</span> {view.link.data}
          </p>

          {/* O aviso que evita a pergunta de sempre na hora de convidar. */}
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <UserIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-xs leading-snug text-amber-800 dark:text-amber-200">
              <strong>O vínculo é por pessoa, não pelo aplicativo.</strong> {view.link.optIn} Quem
              tem conta só de um lado não vê nada do outro.
            </p>
          </div>

          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {view.link.capabilities.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-amber-500">▸</span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-2 font-mono text-[10px] text-muted-foreground">{view.link.ledger}</p>
        </div>
      ))}
    </div>
  );
};
