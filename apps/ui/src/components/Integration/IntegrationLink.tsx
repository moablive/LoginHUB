import {
  ArrowLongRightIcon,
  ArrowsRightLeftIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

import { directionLabel, getAppIntegration } from "../../config/integrations";

/**
 * Desenha o vínculo por inteiro: os dois lados que se conversam, o sentido das
 * chamadas e o que a integração faz. Versão longa do `IntegrationBadge`, para
 * onde sobra espaço (cabeçalho de página) — não use dentro de tabela.
 */
interface IntegrationLinkProps {
  /** Id do aplicativo no hub. Sem vínculo cadastrado, nada é desenhado. */
  appId?: string | undefined;
  /** Nome do app no hub, exibido ao lado do desenho. */
  appName?: string | undefined;
}

const nodeClass =
  "inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm";

export const IntegrationLink = ({ appId, appName }: IntegrationLinkProps) => {
  const integration = getAppIntegration(appId);
  if (!integration) return null;

  const DirectionIcon =
    integration.direction === "two-way" ? ArrowsRightLeftIcon : ArrowLongRightIcon;

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={nodeClass}>
          <ShieldCheckIcon className="h-4 w-4 text-violet-500" />
          LoginHUB
        </span>

        <span
          className="flex items-center gap-1 text-violet-500"
          title={directionLabel(integration.direction)}
        >
          <span className="h-px w-5 bg-violet-500/60 animate-pulse" />
          <DirectionIcon className="h-4 w-4" />
          <span className="h-px w-5 bg-violet-500/60 animate-pulse" />
        </span>

        <span className={nodeClass}>
          <ServerStackIcon className="h-4 w-4 text-violet-500" />
          <span className="flex flex-col leading-tight">
            {integration.apiName}
            <span className="font-mono text-[10px] font-normal text-muted-foreground">
              {integration.apiHost}
            </span>
          </span>
        </span>

        {appName && (
          <span className="text-xs text-muted-foreground">
            vínculo do aplicativo <strong className="text-foreground">{appName}</strong>
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{integration.summary}</p>

      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {integration.capabilities.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-violet-500">▸</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
};
