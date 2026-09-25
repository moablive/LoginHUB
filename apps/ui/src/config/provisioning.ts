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
  /**
   * Ao escolher um item existente, copia campos dele para o nome e o e-mail do
   * convite, e trava os dois inputs.
   *
   * Existe para o app cujo vínculo exige o e-mail do cadastro (a Sul recusa
   * convite com e-mail diferente do vendedor, de propósito: é por ele que o
   * vendedor acha o próprio registro depois de entrar). Sem isto o admin tinha
   * de redigitar o e-mail exato do cadastro e só descobria o erro no 409.
   */
  fillsBase?: { nome?: string; email?: string };
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
  /**
   * Quais papéis PADRÃO do hub o app oferece além do provisionado.
   *
   * Omitir = todos. Existe porque um papel do hub pode não fazer sentido num
   * app: na Sul Alimentos, um `user` criado por aqui entra sem linha em
   * `sellers` e cai em "acesso não vinculado" — o vendedor é SEMPRE o
   * provisionado. A chave é o papel; o valor, a descrição no contexto do app.
   */
  hubRoles?: Partial<Record<"admin" | "operador" | "user" | "suporte", string>>;
}

/** Os papéis do hub que um app provisionado oferece, já com a descrição certa. */
export const hubRolesDoApp = (
  app: ProvisionedApp | null,
  todos: { value: string; label: string; description: string }[],
) =>
  !app?.hubRoles
    ? todos
    : todos
        .filter((o) => o.value in app.hubRoles!)
        .map((o) => ({ ...o, description: app.hubRoles![o.value as keyof typeof app.hubRoles] || o.description }));

// `sul-api.astralwavelabel.com` era a rota antiga, no túnel geral do servidor,
// e está NXDOMAIN desde que a Sul Alimentos ganhou túnel e domínio próprios.
// Enquanto apontou para lá, o select de vendedor abria vazio — o GET falhava no
// navegador e o modal seguia como se o app não tivesse ninguém sem login.
const SUL_ALIMENTOS_API =
  import.meta.env.VITE_SUL_ALIMENTOS_API_URL ||
  "https://api.sulalimentos.com/api";

const ASTRALWAVE_API =
  import.meta.env.VITE_ASTRALWAVE_API_URL ||
  "https://api.astralwavelabel.com/api";

/** Chave = id do aplicativo no LoginHUB. */
export const PROVISIONED_APPS: Record<string, ProvisionedApp> = {
  // Sul Alimentos — convida vendedor (novo ou já cadastrado) e amarra o login.
  // O admin da Sul passou a poder cadastrar o vendedor direto no app, sem
  // convite; quando isso acontece o registro existe e só falta o acesso, então
  // criar outro pelo convite geraria duplicata. O select resolve os dois casos.
  "2": {
    roleLabel: "Vendedor",
    roleDescription:
      "Acessa o portal do vendedor da Sul Alimentos. Escolha um vendedor já cadastrado que ainda não tem login, ou cadastre um novo — nesse caso CPF e telefone são informados pelo próprio vendedor ao abrir o convite.",
    endpoint: `${SUL_ALIMENTOS_API}/vendedor`,
    fields: [
      {
        name: "sellerId",
        label: "Vendedor",
        type: "remote-select",
        // `semLogin=1` devolve todos os vendedores sem login, e não os 20 mais
        // recentes da listagem padrão — com o teto, quem foi cadastrado há mais
        // tempo simplesmente não aparecia como opção.
        source: `${SUL_ALIMENTOS_API}/vendedor?semLogin=1`,
        optionValue: "id",
        // O e-mail vem no rótulo porque o convite exige o e-mail do cadastro:
        // é por ele que o vendedor acha o próprio registro depois de entrar.
        optionLabel: "label",
        allowNew: true,
        newValue: "__new__",
        newLabel: "+ Cadastrar novo vendedor",
        required: true,
        // O convite de quem já existe usa o e-mail do cadastro, não o do
        // formulário; preencher daqui evita o 409 por divergência.
        fillsBase: { nome: "name", email: "email" },
        help: "Só aparecem vendedores ainda sem login. Escolhendo um, o nome e o e-mail vêm do cadastro dele.",
      },
      {
        name: "commissionRate",
        label: "Taxa de comissão",
        type: "number",
        defaultValue: "0",
        suffix: "%",
        required: true,
        help: "Definida por você. Os dados pessoais quem informa é o vendedor.",
        // Só no cadastro novo. Vinculando alguém que já existe, a comissão é a
        // que está no cadastro dele — mandar o campo aqui a sobrescreveria com
        // o valor do formulário, que é 0 por padrão.
        showWhen: { field: "sellerId", equals: "__new__" },
      },
    ],
    // Os outros dois papéis da Sul entram pelo fluxo padrão do hub — não têm
    // cadastro local a criar. `user` e `suporte` ficam de fora: na Sul, quem
    // não é vendedor provisionado nem operador/admin não tem tela para entrar.
    hubRoles: {
      operador:
        "Opera o balcão da Sul Alimentos: estoque, tabelas de preço, pesagem, emissão de NF-e, pedidos e cadastro de vendedores. Não vê o financeiro.",
      admin:
        "Tudo o que o operador faz, mais o financeiro (títulos, calendário de vencimento, baixa) e a limpeza do mural.",
    },
    // CPF e telefone não entram aqui: o vendedor preenche os próprios dados ao
    // abrir o Magic Link, na tela de definição de senha da Sul Alimentos.
    buildPayload: (base, extra) => {
      const isNew = !extra.sellerId || extra.sellerId === "__new__";
      return {
        name: base.nome,
        email: base.email,
        ...(isNew
          ? { commissionRate: extra.commissionRate || "0" }
          : { sellerId: extra.sellerId }),
      };
    },
  },

  // Astral Wave Label — convida DJ (novo ou existente) e amarra ao artista.
  // O endpoint do label cria o login no hub (M2M) e grava loginhub_user_id.
  "8": {
    roleLabel: "DJ / Artista",
    roleDescription:
      "Cria o login do DJ no LoginHUB e o amarra a um artista da Astral Wave Label. Todo DJ entra com o painel completo e, no primeiro acesso, lê e aceita o contrato base antes de qualquer outra coisa (o convite já leva o PDF). Escolha um artista existente ainda sem login, ou crie um novo.",
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
      };
    },
  },
};

export const getProvisionedApp = (appId?: string): ProvisionedApp | null =>
  (appId && PROVISIONED_APPS[appId]) || null;
