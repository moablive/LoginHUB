/**
 * Apps cuja API própria conversa com o LoginHUB máquina-a-máquina.
 *
 * Quase todo app aqui só usa o hub na hora do login: manda e-mail e senha,
 * recebe o JWT e segue a vida. Alguns vão além e mantêm um backend que fala
 * direto com a API do hub pela rede interna (header `x-api-key`) — criam
 * usuário por lá, listam os usuários do app, trocam papel, removem acesso.
 *
 * Esse vínculo não existe em nenhuma coluna de `aplicativos`: sem esta lista o
 * painel não teria como mostrar que os dois lados se conversam. É ela que
 * alimenta o selo de vínculo (`components/Integration`).
 *
 * Chave = id do aplicativo no LoginHUB, a mesma de `config/provisioning.ts`.
 */

export interface AppIntegration {
  /** Nome da API do outro lado do vínculo, como o admin a conhece. */
  apiName: string;
  /** Host da API, exibido nos detalhes do vínculo. */
  apiHost: string;
  /**
   * `two-way`  — o painel também chama a API do app (ver `config/provisioning.ts`).
   * `app-to-hub` — só o app chama o hub; daqui não sai nada para lá.
   */
  direction: "two-way" | "app-to-hub";
  /** Uma linha resumindo o vínculo. */
  summary: string;
  /** O que a integração faz, item a item. */
  capabilities: string[];
}

/** Chave = id do aplicativo no LoginHUB. */
export const APP_INTEGRATIONS: Record<string, AppIntegration> = {
  // Sul Alimentos — mão dupla: o convite parte daqui e volta como usuário.
  "2": {
    apiName: "Sul Alimentos API",
    apiHost: "sul-api.astralwavelabel.com",
    direction: "two-way",
    summary:
      "O convite de vendedor sai do painel direto para a API da Sul Alimentos, que cria o cadastro dela e o acesso aqui numa operação só.",
    capabilities: [
      "O painel chama POST /vendedor na API da Sul (ver config/provisioning.ts)",
      "A Sul cria o usuário aqui via x-api-key e dispara o Magic Link do hub",
      "O portal do vendedor entra com o JWT emitido pelo LoginHUB",
    ],
  },

  // Astral Wave Label — mão única: quem chama o hub é sempre o label.
  "8": {
    apiName: "Astral Wave Label API",
    apiHost: "api.astralwavelabel.com",
    direction: "app-to-hub",
    summary:
      "A API do label administra por aqui os usuários deste app e amarra cada um ao artista correspondente na base dela.",
    capabilities: [
      "Convida e remove usuário chamando /admin/users com x-api-key",
      "Lista os usuários deste app e troca o papel deles pelo painel do artista",
      "Guarda o id do usuário do hub no artista (loginhub_user_id)",
      "O painel do artista entra com o JWT emitido pelo LoginHUB",
    ],
  },
};

export const getAppIntegration = (appId?: string): AppIntegration | null =>
  (appId && APP_INTEGRATIONS[appId]) || null;

/** Frase que explica o sentido das chamadas, usada nos tooltips do selo. */
export const directionLabel = (direction: AppIntegration["direction"]) =>
  direction === "two-way"
    ? "Mão dupla: o painel chama a API do app e ela chama o hub de volta"
    : "Mão única: quem chama o hub é o app";

/**
 * Vinculo APP-A-APP: um app do ecossistema LE dados de outro pela rede interna
 * (chave de servico + identidade delegada), alem do simples login pelo hub.
 *
 * Diferente de `APP_INTEGRATIONS`, que descreve o vinculo app<->hub: aqui o hub
 * nem participa da chamada — os dois apps se conversam direto. A autorizacao
 * real, conta a conta, mora no banco do app PROVEDOR (no MoneyAPP e o
 * `user_settings.leitoresExternos`), fora do alcance do hub. Este mapa e o
 * retrato em nivel de aplicativo, e e o que alimenta o selo de vinculo.
 *
 * Cada aresta e direcionada: `fromId` (consumidor) LE o dado de `toId` (dono).
 * Chave = id do app no hub, a mesma de `aplicativos` e `config/provisioning.ts`.
 */
export interface AppDataFlow {
  /** Id (hub) do app CONSUMIDOR — quem le. */
  fromId: string;
  fromName: string;
  /** Id (hub) do app PROVEDOR — dono do dado. */
  toId: string;
  toName: string;
  /** O que atravessa o vinculo. */
  data: string;
  /** Uma linha resumindo o vinculo. */
  summary: string;
}

export const APP_DATA_FLOWS: AppDataFlow[] = [
  // TodoAPP le o calendario/comprovantes do MoneyAPP para mostrar os
  // lancamentos financeiros junto das tarefas. A leitura e pela rede interna,
  // com identidade delegada, e o MoneyAPP autoriza conta a conta.
  {
    fromId: "4",
    fromName: "TodoAPP",
    toId: "3",
    toName: "MoneyAPP",
    data: "calendario e comprovantes",
    summary:
      "O TodoAPP mostra os lancamentos do MoneyAPP no calendario: le pela rede interna com identidade delegada, e o MoneyAPP autoriza a leitura conta a conta.",
  },
];

/** Arestas em que ESTE app e o CONSUMIDOR (le outro app). */
export const getAppReads = (appId?: string): AppDataFlow[] =>
  appId ? APP_DATA_FLOWS.filter((f) => f.fromId === String(appId)) : [];

/** Arestas em que ESTE app e o PROVEDOR (e lido por outro app). */
export const getAppReadBy = (appId?: string): AppDataFlow[] =>
  appId ? APP_DATA_FLOWS.filter((f) => f.toId === String(appId)) : [];

/** Ha algum vinculo app-a-app tocando este app (como consumidor ou provedor)? */
export const hasAppLinks = (appId?: string): boolean =>
  getAppReads(appId).length > 0 || getAppReadBy(appId).length > 0;
