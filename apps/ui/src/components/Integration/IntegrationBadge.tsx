import { ArrowLongRightIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";

import { directionLabel, getAppIntegration } from "../../config/integrations";

/**
 * Selo de vínculo: marca, na lista de aplicativos, quais deles têm uma API
 * conversando com o LoginHUB por trás. O ponto pulsando é o vínculo vivo; a
 * seta diz para que lado as chamadas saem (⇄ mão dupla, → só o app chama o hub).
 *
 * Os detalhes ficam no `title` porque a linha da tabela vive dentro de um
 * `overflow-x-auto` — um balão posicionado seria cortado na borda. Onde há
 * espaço, use `IntegrationLink`.
 */
interface IntegrationBadgeProps {
  /** Id do aplicativo no hub. Sem vínculo cadastrado, o selo não aparece. */
  appId?: string | undefined;
}

export const IntegrationBadge = ({ appId }: IntegrationBadgeProps) => {
  const integration = getAppIntegration(appId);
  if (!integration) return null;

  const DirectionIcon =
    integration.direction === "two-way" ? ArrowsRightLeftIcon : ArrowLongRightIcon;

  const tooltip = [
    `${integration.apiName} (${integration.apiHost})`,
    directionLabel(integration.direction),
    "",
    integration.summary,
    "",
    ...integration.capabilities.map((item) => `• ${item}`),
  ].join("\n");

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 cursor-help"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
      </span>
      <DirectionIcon className="h-3 w-3" />
      API vinculada
    </span>
  );
};
