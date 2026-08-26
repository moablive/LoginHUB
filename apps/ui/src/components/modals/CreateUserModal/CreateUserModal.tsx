import { useState, useEffect, useMemo } from "react";
import { XMarkIcon, UserPlusIcon, EnvelopeIcon, ArrowLeftIcon, PaperAirplaneIcon, InformationCircleIcon, BriefcaseIcon } from "@heroicons/react/24/outline";
import { userApi } from "@loginhub/api-client";
import axios from "axios";
import ReactDOMServer from "react-dom/server";
import { InviteEmailTemplate, MoneyAppInviteEmail } from "../../../templates/emails";
import { getProvisionedApp } from "../../../config/provisioning";
import { masks } from "../../../utils/masks";
import type { UserRole } from "@loginhub/schema";

const ROLE_OPTIONS: { value: Exclude<UserRole, "master">; label: string; description: string }[] = [
  { value: "admin", label: "Administrador", description: "Pode gerenciar usuários e configurações do aplicativo." },
  { value: "user", label: "Usuário Padrão", description: "Acesso comum ao aplicativo." },
  { value: "suporte", label: "Suporte", description: "Acesso para atendimento e diagnóstico." },
];

export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: { email: string; emailSent: boolean; magicLinkToken?: string }) => void;
  appId: string;
  appName?: string;
  appBotUrl?: string | null;
  appPlatformUrl?: string | null;
  appLogo?: string | null;
}

type Step = "form" | "preview";

/** Valor sentinela do select quando o convite deve criar o cadastro no app. */
const PROVISION_ROLE = "__provision__";

const MAGIC_LINK_PLACEHOLDER = "__MAGIC_LINK__";
const PREVIEW_FAKE_TOKEN = "preview-token-xyz";

export const CreateUserModal = ({
  isOpen,
  onClose,
  onSuccess,
  appId,
  appName,
  appBotUrl,
  appPlatformUrl,
  appLogo,
}: CreateUserModalProps) => {
  // Apps com provisionamento próprio (ver config/provisioning.ts) invertem o
  // fluxo: quem cria o usuário aqui no hub é o endpoint do próprio app, junto
  // com o cadastro dele — sem isso a pessoa ficaria com login e sem cadastro.
  const provisioned = getProvisionedApp(appId);
  const defaultRole = provisioned ? PROVISION_ROLE : "user";

  const [step, setStep] = useState<Step>("form");
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    role: defaultRole,
  });
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Opções dos campos remote-select (ex.: lista de artistas do label), por nome do campo.
  const [remoteOptions, setRemoteOptions] = useState<Record<string, { value: string; label: string }[]>>({});

  const blankExtras = useMemo(
    () =>
      Object.fromEntries(
        (provisioned?.fields ?? []).map((f) => [f.name, f.defaultValue ?? ""]),
      ),
    [provisioned],
  );

  useEffect(() => {
    if (isOpen) {
      setFormData({ nome: "", email: "", role: defaultRole });
      setExtraData(blankExtras);
      setFieldErrors({});
      setStep("form");
      setError(null);
    }
  }, [isOpen, blankExtras, defaultRole]);

  // Carrega os campos remote-select quando o modal abre, com o Bearer master.
  // Filtra itens que já têm login e mapeia para { value, label }.
  useEffect(() => {
    if (!isOpen || !provisioned) return;
    const token = localStorage.getItem("awl_token");
    for (const field of provisioned.fields) {
      if (field.type !== "remote-select" || !field.source) continue;
      void (async () => {
        try {
          const { data } = await axios.get(field.source!, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            timeout: 20000,
          });
          const arr: Array<Record<string, unknown>> = Array.isArray(data)
            ? data
            : ((data?.artists ?? data?.data ?? []) as Array<Record<string, unknown>>);
          const opts = arr
            .filter((it) => !field.excludeWhenField || !it[field.excludeWhenField])
            .map((it) => ({
              value: String(it[field.optionValue || "id"] ?? ""),
              label: String(it[field.optionLabel || "name"] ?? it[field.optionValue || "id"] ?? ""),
            }));
          setRemoteOptions((prev) => ({ ...prev, [field.name]: opts }));
        } catch (err) {
          console.error("[CreateUserModal] falha ao carregar opções de", field.name, err);
          setRemoteOptions((prev) => ({ ...prev, [field.name]: [] }));
        }
      })();
    }
  }, [isOpen, provisioned]);

  // Só o papel provisionado passa pelo endpoint do app. Os demais níveis
  // (admin, suporte...) continuam no fluxo normal do LoginHUB — sem isso não
  // haveria como convidar um administrador para um app provisionado.
  const provisionMode = !!provisioned && formData.role === PROVISION_ROLE;

  const isMoneyApp = appName?.toLowerCase().includes("money");

  // HTML para o preview (com placeholder amigável)
  const previewHtml = useMemo(() => {
    if (!formData.email) return "";
    // Só inclui o botão "Acessar Sistema" se o app tem URL de plataforma cadastrada.
    const loginUrl = appPlatformUrl || undefined;
    return ReactDOMServer.renderToStaticMarkup(
      isMoneyApp ? (
        <MoneyAppInviteEmail
          email={formData.email}
          magicLinkToken={PREVIEW_FAKE_TOKEN}
          loginUrl={loginUrl}
          botUrl={appBotUrl}
          appLogo={appLogo}
        />
      ) : (
        <InviteEmailTemplate
          email={formData.email}
          appName={appName || "nossa plataforma"}
          magicLinkToken={PREVIEW_FAKE_TOKEN}
          loginUrl={loginUrl}
          botUrl={appBotUrl}
          appLogo={appLogo}
        />
      ),
    );
  }, [formData.email, appName, isMoneyApp, appBotUrl, appPlatformUrl, appLogo]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // O app responde os erros com o nome do campo dele ("name"), não "nome".
    const apiField = name === "nome" ? "name" : name;
    setFieldErrors((prev) => (prev[apiField] ? { ...prev, [apiField]: "" } : prev));
  };

  const handleExtraChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    mask?: "cpf" | "phone",
  ) => {
    const { name, value } = e.target;
    setExtraData((prev) => ({ ...prev, [name]: mask ? masks[mask](value) : value }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: "" } : prev));
  };

  const handleAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.email.trim()) {
      setError("Preencha nome e e-mail.");
      return;
    }

    if (provisionMode) {
      const missing = provisioned!.fields.filter((f) => {
        const visivel = !f.showWhen || extraData[f.showWhen.field] === f.showWhen.equals;
        return f.required && visivel && !String(extraData[f.name] ?? "").trim();
      });
      if (missing.length) {
        setFieldErrors(Object.fromEntries(missing.map((f) => [f.name, "Campo obrigatório"])));
        setError(`Preencha ${missing.map((f) => f.label).join(", ")}.`);
        return;
      }
      setError(null);
      // O e-mail é montado e enviado pelo próprio app, então não há o que
      // pré-visualizar aqui — o convite sai direto.
      void handleSendProvisioned();
      return;
    }

    setError(null);
    setStep("preview");
  };

  /**
   * Convite para app com provisionamento: um POST só no endpoint do app, que
   * cria o usuário aqui no LoginHUB (via M2M), grava o cadastro dele e dispara
   * o e-mail com o template do próprio app.
   */
  const handleSendProvisioned = async () => {
    if (!provisioned) return;
    setIsLoading(true);
    setError(null);

    try {
      // Só campos com máscara perdem a formatação. Passar o número da comissão
      // por `unmask` transformaria "7.5" em "75".
      const extras = Object.fromEntries(
        provisioned.fields.map((field) => {
          const raw = String(extraData[field.name] ?? "").trim();
          return [field.name, field.mask ? masks.unmask(raw) : raw];
        }),
      );

      const payload = provisioned.buildPayload(
        { nome: formData.nome.trim(), email: formData.email.trim() },
        extras,
      );

      const token = localStorage.getItem("awl_token");
      const { data } = await axios.post(provisioned.endpoint, payload, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 20000,
      });

      onSuccess({
        email: formData.email.trim(),
        emailSent: data?.invite?.emailSent ?? true,
        magicLinkToken: data?.invite?.magicLinkToken ?? undefined,
      });
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const response = axios.isAxiosError(err) ? err.response : undefined;
      const body = response?.data as { error?: string; fields?: Record<string, unknown> } | undefined;

      if (body?.fields) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(body.fields)
              .filter(([, v]) => v === true || (typeof v === "string" && v))
              .map(([k, v]) => [k, v === true ? "Já cadastrado" : String(v)]),
          ),
        );
      }

      if (body?.error) {
        setError(body.error);
      } else if (!response) {
        setError(
          `Não foi possível falar com ${appName || "o aplicativo"}. Verifique se o sistema está no ar e tente de novo.`,
        );
      } else if (response.status === 401 || response.status === 403) {
        // Sessão master aberta antes da correção do login não tem token no
        // localStorage; só um logout/login novo passa a guardá-lo.
        setError(
          `Sua sessão não foi aceita por ${appName || "este aplicativo"}. ` +
          `Saia e entre de novo no painel para renovar o acesso, e repita o convite.`,
        );
      } else {
        setError("Ocorreu um erro ao convidar o usuário.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Só inclui o botão "Acessar Sistema" se o app tem URL de plataforma cadastrada.
    const loginUrl = appPlatformUrl || undefined;
      // HTML real para envio: link trocado pelo placeholder que o backend substitui
      const emailHtml = ReactDOMServer.renderToStaticMarkup(
        isMoneyApp ? (
          <MoneyAppInviteEmail
            email={formData.email}
            magicLinkToken={MAGIC_LINK_PLACEHOLDER}
            loginUrl={loginUrl}
            botUrl={appBotUrl}
            appLogo={appLogo}
          />
        ) : (
          <InviteEmailTemplate
            email={formData.email}
            appName={appName || "nossa plataforma"}
            magicLinkToken={MAGIC_LINK_PLACEHOLDER}
            loginUrl={loginUrl}
            botUrl={appBotUrl}
            appLogo={appLogo}
          />
        ),
      );

      const res = await userApi.create({
        ...formData,
        app_id: appId,
        role: formData.role as UserRole,
        telefone: undefined,
        emailHtml,
      });

      onSuccess({ email: formData.email, emailSent: res.emailSent, magicLinkToken: res.magicLinkToken });
      onClose();
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) {
        // 409 = e-mail já cadastrado em outro aplicativo
        if (err.message.includes("409") || err.message.toLowerCase().includes("conflito") || err.message.toLowerCase().includes("já está em uso") || err.message.toLowerCase().includes("duplicate")) {
          setError(`O e-mail "${formData.email}" já está cadastrado em outro aplicativo do sistema. Cada e-mail só pode ser usado uma vez. Use um e-mail diferente.`);
        } else {
          setError(err.message);
        }
      } else {
        setError("Ocorreu um erro ao convidar o usuário.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = (field: string) =>
    `mt-1 block w-full rounded-lg shadow-sm sm:text-sm py-2 px-3 border ${
      fieldErrors[field]
        ? "border-red-400 focus:border-red-500 focus:ring-red-500"
        : "border-input focus:border-blue-500 focus:ring-blue-500"
    }`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={isLoading ? undefined : onClose}
          aria-hidden="true"
        />

        <div className={`relative transform overflow-hidden rounded-2xl bg-card text-card-foreground text-left shadow-xl transition-all sm:my-8 sm:w-full ${step === "preview" ? "sm:max-w-3xl" : "sm:max-w-lg"} border border-border animate-fade-in-up`}>
          {/* Cabeçalho */}
          <div className="bg-muted/50 px-4 py-3 sm:px-6 flex justify-between items-center border-b border-border">
            <h3 className="text-lg font-semibold leading-6 text-foreground flex items-center gap-2">
              {step === "form" ? (
                <>
                  {appLogo ? (
                    <img src={appLogo} alt={appName || "Logo"} className="h-6 w-6 rounded-sm object-contain" />
                  ) : (
                    <UserPlusIcon className="h-5 w-5 text-primary" />
                  )}
                  {provisionMode
                    ? `Convidar ${provisioned!.roleLabel}${appName ? ` — ${appName}` : ""}`
                    : "Convidar Usuário"}
                </>
              ) : (
                <>
                  <EnvelopeIcon className="h-5 w-5 text-primary" />
                  Pré-visualizar Convite
                </>
              )}
            </h3>
            <button
              type="button"
              className="rounded-md bg-transparent text-muted-foreground hover:text-muted-foreground focus:outline-none disabled:opacity-50"
              onClick={onClose}
              disabled={isLoading}
            >
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {/* Conteúdo */}
          {step === "form" ? (
            <form onSubmit={handleAdvance}>
              <div className="px-4 py-5 sm:p-6 space-y-4">
                {error && (
                  <div className="mb-4 bg-danger/10 border-l-4 border-red-500 p-4 rounded-md">
                    <p className="text-sm text-danger">{error}</p>
                  </div>
                )}

                {/* Deixa explícito, antes de qualquer campo, o que a pessoa vira no app. */}
                {provisionMode && (
                  <div className="flex items-start gap-2 rounded-md bg-primary/10 border border-blue-200 px-3 py-2">
                    <BriefcaseIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-primary leading-snug">
                      <strong>
                        Este convite cria um {provisioned!.roleLabel.toLowerCase()}
                        {appName ? ` da ${appName}` : ""}.
                      </strong>{" "}
                      {provisioned!.roleDescription} O cadastro no{" "}
                      {appName || "aplicativo"} e o acesso aqui no LoginHUB são criados de uma vez só,
                      e o e-mail de convite sai com o template do próprio {appName || "aplicativo"}.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
                  <input
                    type="text"
                    name="nome"
                    required
                    value={formData.nome}
                    onChange={handleChange}
                    className={inputClass("name")}
                    placeholder="Ex: João Silva"
                  />
                  {fieldErrors.name && (
                    <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">E-mail de Acesso</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className={inputClass("email")}
                    placeholder="usuario@aplicativo.com"
                  />
                  {fieldErrors.email && (
                    <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p>
                  )}
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-primary/10 border border-blue-200 px-3 py-2">
                    <InformationCircleIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-primary leading-snug">
                      <strong>E-mail único por aplicativo:</strong> o mesmo e-mail pode ser usado em aplicativos diferentes, mas não pode se repetir dentro deste aplicativo.
                    </p>
                  </div>
                </div>

                {/* Campos que o app exige além de nome/e-mail (comissão, artista, módulos...) */}
                {provisionMode && provisioned!.fields.map((field) => {
                  // Campo condicional: só aparece quando a condição bate.
                  if (field.showWhen && extraData[field.showWhen.field] !== field.showWhen.equals) return null;

                  const setExtra = (value: string) => {
                    setExtraData((prev) => ({ ...prev, [field.name]: value }));
                    setFieldErrors((prev) => (prev[field.name] ? { ...prev, [field.name]: "" } : prev));
                  };

                  const labelEl = (
                    <label className="block text-sm font-medium text-gray-700">
                      {field.label}
                      {!field.required && (
                        <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
                      )}
                    </label>
                  );
                  const helpEl = fieldErrors[field.name] ? (
                    <p className="mt-1 text-xs text-danger">{fieldErrors[field.name]}</p>
                  ) : field.help ? (
                    <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
                  ) : null;

                  if (field.type === "remote-select") {
                    const opts = remoteOptions[field.name] ?? [];
                    return (
                      <div key={field.name}>
                        {labelEl}
                        <select
                          name={field.name}
                          value={extraData[field.name] ?? ""}
                          onChange={(e) => setExtra(e.target.value)}
                          className={`${inputClass(field.name)} bg-card text-card-foreground`}
                        >
                          <option value="">Selecione…</option>
                          {opts.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                          {field.allowNew && (
                            <option value={field.newValue || "__new__"}>{field.newLabel || "Criar novo"}</option>
                          )}
                        </select>
                        {helpEl}
                      </div>
                    );
                  }

                  if (field.type === "checkbox-group") {
                    const selected = String(extraData[field.name] ?? "")
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean);
                    const toggle = (value: string) => {
                      const next = selected.includes(value)
                        ? selected.filter((v) => v !== value)
                        : [...selected, value];
                      setExtra(next.join(","));
                    };
                    return (
                      <div key={field.name}>
                        {labelEl}
                        <div className="mt-1 space-y-1.5 rounded-lg border border-input p-3">
                          {(field.options ?? []).map((o) => (
                            <label key={o.value} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selected.includes(o.value)}
                                onChange={() => toggle(o.value)}
                                className="rounded border-input"
                              />
                              {o.label}
                            </label>
                          ))}
                        </div>
                        {helpEl}
                      </div>
                    );
                  }

                  // text / number (padrão)
                  return (
                    <div key={field.name}>
                      {labelEl}
                      <div className="relative">
                        <input
                          type={field.type === "number" ? "number" : "text"}
                          name={field.name}
                          step={field.type === "number" ? "0.01" : undefined}
                          value={extraData[field.name] ?? ""}
                          onChange={(e) => handleExtraChange(e, field.mask)}
                          className={`${inputClass(field.name)}${field.suffix ? " pr-9" : ""}`}
                          placeholder={field.placeholder}
                        />
                        {field.suffix && (
                          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-muted-foreground">
                            {field.suffix}
                          </span>
                        )}
                      </div>
                      {helpEl}
                    </div>
                  );
                })}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nível de Acesso</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border-input shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border bg-card text-card-foreground"
                  >
                    {provisioned && (
                      <option value={PROVISION_ROLE}>
                        {provisioned.roleLabel}
                        {appName ? ` da ${appName}` : ""}
                      </option>
                    )}
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {provisionMode
                      ? provisioned!.roleDescription
                      : ROLE_OPTIONS.find((opt) => opt.value === formData.role)?.description}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium text-foreground">
                    Verificação em duas etapas
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Exigida em todas as contas. Ao abrir o convite, a pessoa define a senha
                    e escaneia o QR Code na mesma tela — então precisa estar com o celular
                    à mão. O QR aparece no navegador, nunca no e-mail.
                  </p>
                </div>
              </div>

              <div className="bg-muted/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex w-full justify-center items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  {provisionMode ? (
                    isLoading ? (
                      "Enviando..."
                    ) : (
                      <>
                        <PaperAirplaneIcon className="h-4 w-4" />
                        Enviar Convite
                      </>
                    )
                  ) : (
                    <>
                      Pré-visualizar
                      <EnvelopeIcon className="h-4 w-4" />
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  className="mt-3 inline-flex w-full justify-center rounded-lg bg-card text-card-foreground px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-muted/50 disabled:opacity-50 sm:mt-0 sm:w-auto transition-colors"
                  onClick={onClose}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div className="px-4 py-5 sm:p-6 space-y-4">
                {error && (
                  <div className="bg-danger/10 border-l-4 border-red-500 p-4 rounded-md">
                    <p className="text-sm text-danger">{error}</p>
                  </div>
                )}

                <div className="bg-primary/10 border border-blue-100 text-primary text-sm rounded-lg p-3 flex items-start gap-2">
                  <EnvelopeIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    Este e-mail será enviado para <strong>{formData.email}</strong>.
                    O link de acesso (Magic Link) é gerado automaticamente e inserido no template
                    no momento do envio.
                  </div>
                </div>

                <div className="border border-border rounded-lg overflow-hidden bg-muted/50">
                  <iframe
                    title="Pré-visualização do e-mail"
                    srcDoc={previewHtml}
                    className="w-full bg-card text-card-foreground"
                    style={{ height: "480px", border: 0 }}
                  />
                </div>
              </div>

              <div className="bg-muted/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isLoading}
                  className="inline-flex w-full justify-center items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  {isLoading ? (
                    "Enviando..."
                  ) : (
                    <>
                      <PaperAirplaneIcon className="h-4 w-4" />
                      Enviar Convite
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  disabled={isLoading}
                  className="mt-3 inline-flex w-full justify-center items-center gap-2 rounded-lg bg-card text-card-foreground px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-muted/50 disabled:opacity-50 sm:mt-0 sm:w-auto transition-colors"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
