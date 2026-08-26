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
