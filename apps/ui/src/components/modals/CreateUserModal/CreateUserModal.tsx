import { useState, useEffect, useMemo } from "react";
import { XMarkIcon, UserPlusIcon, EnvelopeIcon, ArrowLeftIcon, PaperAirplaneIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { userApi } from "@loginhub/api-client";
import ReactDOMServer from "react-dom/server";
import { InviteEmailTemplate, MoneyAppInviteEmail } from "../../../templates/emails";
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
  const [step, setStep] = useState<Step>("form");
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    role: "user",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({ nome: "", email: "", role: "user" });
      setStep("form");
      setError(null);
    }
  }, [isOpen]);

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
  };

  const handleAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.email.trim()) {
      setError("Preencha nome e e-mail.");
      return;
    }
    setError(null);
    setStep("preview");
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
                  Convidar Usuário
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

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
                  <input
                    type="text"
                    name="nome"
                    required
                    value={formData.nome}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border-input shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border"
                    placeholder="Ex: João Silva"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">E-mail de Acesso</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border-input shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border"
                    placeholder="usuario@aplicativo.com"
                  />
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-primary/10 border border-blue-200 px-3 py-2">
                    <InformationCircleIcon className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-primary leading-snug">
                      <strong>E-mail único por aplicativo:</strong> o mesmo e-mail pode ser usado em aplicativos diferentes, mas não pode se repetir dentro deste aplicativo.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nível de Acesso</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border-input shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border bg-card text-card-foreground"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ROLE_OPTIONS.find((opt) => opt.value === formData.role)?.description}
                  </p>
                </div>
              </div>

              <div className="bg-muted/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
                <button
                  type="submit"
                  className="inline-flex w-full justify-center items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Pré-visualizar
                  <EnvelopeIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full justify-center rounded-lg bg-card text-card-foreground px-4 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-muted/50 sm:mt-0 sm:w-auto transition-colors"
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
