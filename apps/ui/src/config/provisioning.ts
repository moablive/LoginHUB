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

export interface ProvisionFieldOption {
  value: string;
  label: string;
}

export interface ProvisionField {
  /** Nome no payload enviado ao app. */
  name: string;
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  type?: "text" | "number" | "remote-select" | "checkbox-group";
  /** Máscara aplicada na digitação (chave de `utils/masks`). */
  mask?: "cpf" | "phone";
  /** Valor inicial do campo. */
  defaultValue?: string;
  /** Sufixo exibido dentro do input (ex.: "%"). */
  suffix?: string;
  // -- remote-select: opções vêm de um GET no app (Bearer master) --
  /** URL que devolve a lista de opções. */
  source?: string;
  /** Campo do item usado como value da opção (default "id"). */
  optionValue?: string;
  /** Campo do item usado como label da opção (default "name"). */
  optionLabel?: string;
  /** Exclui o item quando ESTE campo dele é truthy (ex.: já tem login). */
  excludeWhenField?: string;
  /** Adiciona a opção "criar novo". */
  allowNew?: boolean;
  /** Value da opção "criar novo" (default "__new__"). */
  newValue?: string;
  /** Label da opção "criar novo". */
  newLabel?: string;
  // -- checkbox-group --
  /** Opções fixas do grupo de checkboxes (value guardado como CSV em extraData). */
  options?: ProvisionFieldOption[];
  // -- campo condicional --
  /** Só renderiza/valida quando `extraData[field] === equals`. */
  showWhen?: { field: string; equals: string };
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

const ASTRALWAVE_API =
  import.meta.env.VITE_ASTRALWAVE_API_URL ||
  "https://api.astralwavelabel.com/api";

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

  // Astral Wave Label — convida DJ (novo ou existente) e amarra ao artista.
  // O endpoint do label cria o login no hub (M2M) e grava loginhub_user_id.
  "8": {
    roleLabel: "DJ / Artista",
    roleDescription:
      "Cria o login do DJ no LoginHUB e o amarra a um artista da Astral Wave Label, com os módulos liberados. Escolha um artista existente ainda sem login, ou crie um novo.",
    endpoint: `${ASTRALWAVE_API}/admin/artists/invite`,
    fields: [
      {
        name: "artist_id",
        label: "Artista",
        type: "remote-select",
        source: `${ASTRALWAVE_API}/admin/artists`,
        optionValue: "id",
        optionLabel: "name",
        excludeWhenField: "loginhub_user_id",
        allowNew: true,
        newValue: "__new__",
        newLabel: "+ Criar novo artista",
        required: true,
        help: "Só aparecem artistas ainda sem login. Ou crie um novo.",
      },
      {
        name: "new_artist_name",
        label: "Nome do novo artista",
        type: "text",
        placeholder: "Ex: ALFA",
        required: true,
        showWhen: { field: "artist_id", equals: "__new__" },
      },
      {
        name: "allowed_modules",
        label: "Módulos liberados",
        type: "checkbox-group",
        required: true,
        defaultValue: "artist",
        options: [
          { value: "artist", label: "Artista — ver e editar o perfil" },
          { value: "vendas", label: "Vendas — relatório de royalties" },
          { value: "store_catalogo", label: "Catálogo (Loja)" },
          { value: "store_emails", label: "E-mails (Loja)" },
          { value: "store_vendas", label: "Pedidos (Loja)" },
        ],
      },
    ],
    buildPayload: (base, extra) => {
      const isNew = extra.artist_id === "__new__";
      return {
        email: base.email,
        nome: base.nome,
        role: "user",
        ...(isNew
          ? { new_artist_name: (extra.new_artist_name || "").trim() }
          : { artist_id: extra.artist_id }),
        allowed_modules: String(extra.allowed_modules || "")
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      };
    },
  },
};

export const getProvisionedApp = (appId?: string): ProvisionedApp | null =>
  (appId && PROVISIONED_APPS[appId]) || null;
