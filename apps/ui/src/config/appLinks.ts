/**
 * Vínculos entre dois apps clientes — um lê os dados do outro.
 *
 * Não é o mesmo que `config/integrations.ts` descreve. Lá o vínculo é do app
 * com o HUB: a API do app apresenta a `x-api-key` e administra as contas por
 * aqui. Aqui os dois lados são apps clientes e o hub não entra na chamada — ele
 * só empresta o `id` do usuário, que é o que permite afirmar que a conta do
 * MoneyAPP e a do TodoAPP são da mesma pessoa. E não é detalhe: no hub a
 * unicidade é `(email, app_id)`, então a mesma pessoa tem uma conta (e um id)
 * por app, e nada obriga que o e-mail seja o mesmo nos dois lados.
 *
 * Por isso o vínculo aqui é POR PESSOA, nunca por app. Estar nesta lista quer
 * dizer que os dois sistemas sabem conversar — nunca que um usuário novo já
 * esteja ligado. Quem tem conta só de um lado não tem o que ver do outro, e o
 * convite do painel não cria vínculo nenhum: o casamento das duas contas é
 * cadastrado um a um, na tabela apontada em `ledger`.
 *
 * Sem esta lista o painel não teria como mostrar o vínculo — ele não aparece em
 * nenhuma coluna de `aplicativos` nem em nenhuma tabela do hub.
 *
 * Ids = `aplicativos.id`, os mesmos de `config/integrations.ts`.
 */

export interface CrossAppLink {
  /** App que serve os dados. */
  providerId: string;
  providerName: string;
  /** App que lê os dados do outro. */
  consumerId: string;
  consumerName: string;
  /** Uma linha resumindo o que a pessoa ganha com o vínculo. */
  summary: string;
  /** O que atravessa o vínculo, em expressão curta (ex.: "calendário e comprovantes"). */
  data: string;
  /** Onde mora a linha que casa as duas contas da mesma pessoa. */
  ledger: string;
  /** Como alguém passa a ter o vínculo — o que responde "o novo usuário já vem ligado?". */
  optIn: string;
  /** O que a integração faz, item a item. */
  capabilities: string[];
}

export const CROSS_APP_LINKS: CrossAppLink[] = [
  // MoneyAPP → TodoAPP: o calendário do TodoAPP é quem exibe; os lançamentos
  // continuam morando no MoneyAPP e são lidos na hora, sem cópia.
  {
    providerId: "3",
    providerName: "MoneyAPP",
    consumerId: "4",
    consumerName: "TodoAPP",
    summary:
      "O calendário do TodoAPP mostra, ao lado das tarefas, os lançamentos do MoneyAPP de quem tem conta nos dois — contas a pagar, a receber e os comprovantes.",
    data: "calendário e comprovantes",
    ledger:
      "user_integrations, no banco do TodoAPP: (loginhub_id, app_id=3) → app_user_id, o id da conta do MoneyAPP no hub",
    optIn:
      "Cadastrado à mão, uma pessoa por vez. Convidar alguém para o MoneyAPP ou para o TodoAPP não liga nada: sem a linha, cada app segue sozinho.",
    capabilities: [
      "O backend do TodoAPP chama GET /api/calendar e /receipt no MoneyAPP pela rede interna",
      "Autentica com x-api-key (BOT_SERVICE_KEY) e x-user-id = id da conta do MoneyAPP no hub",
      "Sem linha em user_integrations a resposta é lista vazia — quem só tem um dos apps não vê nada do outro",
      "Cada pessoa liga e desliga a camada no próprio TodoAPP (preferência showMoneyAppEvents)",
    ],
  },
];

/** O vínculo visto do lado de um app específico. */
export interface AppLinkView {
  link: CrossAppLink;
  /** `provider` — este app serve os dados; `consumer` — este app os lê. */
  side: "provider" | "consumer";
  /** Id do app do outro lado. */
  otherId: string;
  /** Nome do app do outro lado. */
  otherName: string;
}

/** Todos os vínculos que tocam este app, já orientados a partir dele. */
export const getAppLinks = (appId?: string): AppLinkView[] => {
  if (!appId) return [];

  // A API devolve `aplicativos.id` como NUMERO em runtime (o tipo App diz string,
  // mas o backend nao converte); sem coagir, "3" === 3 e falso e o selo some.
  const id = String(appId);

  return CROSS_APP_LINKS.flatMap<AppLinkView>((link) => {
    if (link.providerId === id) {
      return [{ link, side: "provider", otherId: link.consumerId, otherName: link.consumerName }];
    }
    if (link.consumerId === id) {
      return [{ link, side: "consumer", otherId: link.providerId, otherName: link.providerName }];
    }
    return [];
  });
};

/** Texto curto do selo, do ponto de vista do app consultado. */
export const linkBadgeLabel = ({ side, otherName }: AppLinkView) =>
  side === "provider" ? `Serve o ${otherName}` : `Lê o ${otherName}`;

/** Frase que explica o sentido dos dados, usada nos tooltips e no painel. */
export const linkDirectionLabel = ({ side, otherName }: AppLinkView) =>
  side === "provider"
    ? `Os dados saem daqui: quem lê é o ${otherName}`
    : `Os dados vêm de fora: quem serve é o ${otherName}`;
