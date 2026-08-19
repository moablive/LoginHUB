/**
 * Apps que fazem o próprio provisionamento de usuário.
 *
 * Normalmente o convite nasce aqui: o LoginHUB cria o usuário e manda o Magic
 * Link. Alguns apps, porém, guardam dados do usuário que o LoginHUB não conhece
 * (CPF, comissão, contrato...) — convidar só pelo hub deixaria a pessoa com
 * login válido e sem cadastro do lado do app.
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
  // Sul Alimentos — o convite vira um vendedor com CPF e comissão.
  "2": {
    roleLabel: "Vendedor",
    roleDescription:
      "Acessa o portal do vendedor da Sul Alimentos para registrar vendas.",
    endpoint: `${SUL_ALIMENTOS_API}/vendedor`,
    fields: [
      {
        name: "cpf",
        label: "CPF",
        placeholder: "000.000.000-00",
        required: true,
        mask: "cpf",
        help: "Usado no financeiro e no contrato do vendedor.",
      },
      {
        name: "phone",
        label: "Telefone",
        placeholder: "(00) 00000-0000",
        mask: "phone",
      },
      {
        name: "commissionRate",
        label: "Taxa de comissão",
        type: "number",
        defaultValue: "0",
        suffix: "%",
        required: true,
      },
    ],
    buildPayload: (base, extra) => ({
      name: base.nome,
      email: base.email,
      cpf: extra.cpf ?? "",
      phone: extra.phone || null,
      commissionRate: extra.commissionRate || "0",
      active: true,
    }),
  },
};

export const getProvisionedApp = (appId?: string): ProvisionedApp | null =>
  (appId && PROVISIONED_APPS[appId]) || null;
