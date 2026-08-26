import { ArrowLongRightIcon, ArrowLongLeftIcon } from "@heroicons/react/24/outline";

import { getAppReads, getAppReadBy, type AppDataFlow } from "../../config/integrations";

/**
 * Selo de vinculo ENTRE APPS: na lista de aplicativos, marca quais deles leem
 * dados de outro app do ecossistema (→ "le X") ou sao lidos por outro
 * (← "lido por Y").
 *
 * Diferente do `IntegrationBadge` (vinculo app<->hub, violeta): aqui o hub nem
 * entra na chamada — os apps se conversam direto pela rede interna —, por isso
 * a cor (teal) e o icone (seta longa direcional) sao outros, para o admin nao
 * confundir os dois tipos de vinculo.
 *
 * Detalhes no `title`: a linha da tabela vive num `overflow-x-auto` e um balao
 * posicionado seria cortado na borda.
 */
interface AppLinkBadgeProps {
  /** Id do aplicativo no hub. Sem vinculo app-a-app, nada e desenhado. */
  appId?: string | undefined;
}

const chipClass =
  "inline-flex items-center gap-1 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 cursor-help";

const tooltipDe = (f: AppDataFlow) =>
  [`${f.fromName} le ${f.toName}`, `Dado: ${f.data}`, "", f.summary].join("\n");

export const AppLinkBadge = ({ appId }: AppLinkBadgeProps) => {
  const reads = getAppReads(appId);
  const readBy = getAppReadBy(appId);
  if (reads.length === 0 && readBy.length === 0) return null;

  return (
    <>
      {reads.map((f) => (
        <span key={`r-${f.toId}`} title={tooltipDe(f)} className={chipClass}>
          <ArrowLongRightIcon className="h-3 w-3" />
          le {f.toName}
        </span>
      ))}
      {readBy.map((f) => (
        <span key={`b-${f.fromId}`} title={tooltipDe(f)} className={chipClass}>
          <ArrowLongLeftIcon className="h-3 w-3" />
          lido por {f.fromName}
        </span>
      ))}
    </>
  );
};
