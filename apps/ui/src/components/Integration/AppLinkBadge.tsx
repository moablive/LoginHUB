import { ArrowLongLeftIcon, ArrowLongRightIcon } from "@heroicons/react/24/outline";

import { getAppLinks, linkBadgeLabel, linkDirectionLabel } from "../../config/appLinks";

/**
 * Selo de vínculo entre dois apps clientes: diz que os dados de um aparecem
 * dentro do outro, e para que lado eles correm.
 *
 * Deliberadamente diferente do `IntegrationBadge` (violeta, ponto pulsando):
 * aquele é vínculo do app com o hub, ligado o tempo todo. Este é âmbar e o ponto
 * não pulsa porque o vínculo não vale para o aplicativo inteiro — vale para cada
 * pessoa que tenha conta dos dois lados, uma a uma. Confundir os dois faria o
 * painel prometer a usuário novo um vínculo que ele não tem.
 *
 * Os detalhes ficam no `title` pelo mesmo motivo do outro selo: a linha da
 * tabela vive dentro de um `overflow-x-auto` e cortaria um balão posicionado.
 */
interface AppLinkBadgeProps {
  /** Id do aplicativo no hub. Sem vínculo cadastrado, o selo não aparece. */
  appId?: string | undefined;
}

export const AppLinkBadge = ({ appId }: AppLinkBadgeProps) => {
  const views = getAppLinks(appId);
  if (!views.length) return null;

  return (
    <>
      {views.map((view) => {
        const DirectionIcon = view.side === "provider" ? ArrowLongRightIcon : ArrowLongLeftIcon;

        const tooltip = [
          `${view.link.providerName} → ${view.link.consumerName}`,
          linkDirectionLabel(view),
          "",
          view.link.summary,
          `Dados: ${view.link.data}`,
          "",
          `Vínculo por pessoa: ${view.link.optIn}`,
          `Onde fica: ${view.link.ledger}`,
          "",
          ...view.link.capabilities.map((item) => `• ${item}`),
        ].join("\n");

        return (
          <span
            key={`${view.link.providerId}-${view.link.consumerId}`}
            title={tooltip}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 cursor-help"
          >
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
            <DirectionIcon className="h-3 w-3" />
            {linkBadgeLabel(view)}
          </span>
        );
      })}
    </>
  );
};
