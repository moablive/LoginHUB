/**
 * Apps que fazem o próprio provisionamento de usuário.
 *
 * Normalmente o convite nasce aqui: o LoginHUB cria o usuário e manda o Magic
 * Link. Alguns apps, porém, mantêm um cadastro próprio que o LoginHUB não
 * conhece — convidar só pelo hub deixaria a pessoa com login válido e sem
 * cadastro do lado do app.
 *
 * Para esses apps o fluxo inverte: o modal de convite chama o endpoint do
 * próprio app, e é ele quem cria o usuário no LoginHUB (via M2M) e a linha na
 * base dele, numa operação só. Assim não existe meio-caminho.
 *
 * Um app sem entrada aqui continua com o fluxo padrão do LoginHUB.
 */

export interface ProvisionField {
  /** Nome no payload enviado ao app. */
  name: string;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  type?: "text" | "number";
  /** Máscara aplicada na digitação (chave de `utils/masks`). */
  mask?: "cpf" | "phone";
  /** Valor inicial do campo. */
  defaultValue?: string;
  /** Sufixo exibido dentro do input (ex.: "%"). */
  suffix?: string;
}

export interface ProvisionedApp {
  /** Como o papel se chama dentro do app ("Vendedor", "Motorista"...). */
  roleLabel: string;
  roleDescription: string;
  /** Endpoint do app que cria o usuário no LoginHUB e na base dele. */
  endpoint: string;
  /** Campos exigidos pelo app além de nome e e-mail. */
  fields: ProvisionField[];
  /** Monta o corpo da requisição no formato que o app espera. */
  buildPayload: (
    base: { nome: string; email: string },
    extra: Record<string, string>,
  ) => Record<string, unknown>;
}

const SUL_ALIMENTOS_API =
  import.meta.env.VITE_SUL_ALIMENTOS_API_URL ||
  "https://sul-api.astralwavelabel.com/api";

/** Chave = id do aplicativo no LoginHUB. */
export const PROVISIONED_APPS: Record<string, ProvisionedApp> = {
  // Sul Alimentos — o convite cria o vendedor; ele completa os dados pelo link.
  "2": {
    roleLabel: "Vendedor",
    roleDescription:
      "Acessa o portal do vendedor da Sul Alimentos. CPF e telefone são informados pelo próprio vendedor ao abrir o convite.",
    endpoint: `${SUL_ALIMENTOS_API}/vendedor`,
    fields: [
      {
        name: "commissionRate",
        label: "Taxa de comissão",
        type: "number",
        defaultValue: "0",
        suffix: "%",
        required: true,
        help: "Definida por você. Os dados pessoais quem informa é o vendedor.",
      },
    ],
    // CPF e telefone não entram aqui: o vendedor preenche os próprios dados ao
    // abrir o Magic Link, na tela de definição de senha da Sul Alimentos.
    buildPayload: (base, extra) => ({
      name: base.nome,
      email: base.email,
      commissionRate: extra.commissionRate || "0",
    }),
  },
};

export const getProvisionedApp = (appId?: string): ProvisionedApp | null =>
  (appId && PROVISIONED_APPS[appId]) || null;
