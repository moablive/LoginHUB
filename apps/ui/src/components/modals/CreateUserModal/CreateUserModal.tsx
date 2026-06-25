import { useState, useEffect, useMemo } from "react";
import { XMarkIcon, UserPlusIcon, EnvelopeIcon, ArrowLeftIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
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
  onSuccess: (result: { email: string; emailSent: boolean; tempPassword?: string }) => void;
  appId: string;
  appName?: string;
  appBotUrl?: string | null;
  appLogo?: string | null;
}

type Step = "form" | "preview";

const TEMP_PASSWORD_PLACEHOLDER = "__TEMP_PASSWORD__";
const PREVIEW_FAKE_PASSWORD = "(gerada no envio)";

export const CreateUserModal = ({
  isOpen,
  onClose,
  onSuccess,
  appId,
  appName,
  appBotUrl,
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
    const loginUrl = window.location.origin;
    return ReactDOMServer.renderToStaticMarkup(
      isMoneyApp ? (
        <MoneyAppInviteEmail
          email={formData.email}
          tempPassword={PREVIEW_FAKE_PASSWORD}
          loginUrl={loginUrl}
          botUrl={appBotUrl}
          appLogo={appLogo}
        />
      ) : (
        <InviteEmailTemplate
          email={formData.email}
          appName={appName || "nossa plataforma"}
          tempPassword={PREVIEW_FAKE_PASSWORD}
          loginUrl={loginUrl}
          botUrl={appBotUrl}
          appLogo={appLogo}
        />
      ),
    );
  }, [formData.email, appName, isMoneyApp, appBotUrl]);

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
      const loginUrl = window.location.origin;
      // HTML real para envio: senha trocada pelo placeholder que o backend substitui
      const emailHtml = ReactDOMServer.renderToStaticMarkup(
        isMoneyApp ? (
          <MoneyAppInviteEmail
            email={formData.email}
            tempPassword={TEMP_PASSWORD_PLACEHOLDER}
            loginUrl={loginUrl}
            botUrl={appBotUrl}
            appLogo={appLogo}
          />
        ) : (
          <InviteEmailTemplate
            email={formData.email}
            appName={appName || "nossa plataforma"}
            tempPassword={TEMP_PASSWORD_PLACEHOLDER}
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

      onSuccess({ email: formData.email, emailSent: res.emailSent, tempPassword: res.tempPassword });
      onClose();
    } catch (err: unknown) {
      console.error(err);
      if (err instanceof Error) setError(err.message);
      else setError("Ocorreu um erro ao convidar o usuário.");
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

        <div className={`relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full ${step === "preview" ? "sm:max-w-3xl" : "sm:max-w-lg"} border border-gray-200 animate-fade-in-up`}>
          {/* Cabeçalho */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 flex justify-between items-center border-b border-gray-100">
            <h3 className="text-lg font-semibold leading-6 text-gray-900 flex items-center gap-2">
              {step === "form" ? (
                <>
                  {appLogo ? (
                    <img src={appLogo} alt={appName || "Logo"} className="h-6 w-6 rounded-sm object-contain" />
                  ) : (
                    <UserPlusIcon className="h-5 w-5 text-blue-600" />
                  )}
                  Convidar Usuário
                </>
              ) : (
                <>
                  <EnvelopeIcon className="h-5 w-5 text-blue-600" />
                  Pré-visualizar Convite
                </>
              )}
            </h3>
            <button
              type="button"
              className="rounded-md bg-transparent text-gray-400 hover:text-gray-500 focus:outline-none disabled:opacity-50"
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
                  <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                    <p className="text-sm text-red-700">{error}</p>
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
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border"
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
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border"
                    placeholder="usuario@aplicativo.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nível de Acesso</label>
                  <select
                    name="role"
                    value={formData.role}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border bg-white"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {ROLE_OPTIONS.find((opt) => opt.value === formData.role)?.description}
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
                <button
                  type="submit"
                  className="inline-flex w-full justify-center items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:w-auto transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Pré-visualizar
                  <EnvelopeIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="mt-3 inline-flex w-full justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors"
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
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-100 text-blue-700 text-sm rounded-lg p-3 flex items-start gap-2">
                  <EnvelopeIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    Este e-mail será enviado para <strong>{formData.email}</strong>.
                    A senha temporária é gerada automaticamente e inserida no lugar de
                    <span className="mx-1 font-mono bg-white px-1.5 py-0.5 rounded text-xs border border-blue-200">
                      {PREVIEW_FAKE_PASSWORD}
                    </span>
                    no momento do envio.
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <iframe
                    title="Pré-visualização do e-mail"
                    srcDoc={previewHtml}
                    className="w-full bg-white"
                    style={{ height: "480px", border: 0 }}
                  />
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isLoading}
                  className="inline-flex w-full justify-center items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
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
                  className="mt-3 inline-flex w-full justify-center items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 sm:mt-0 sm:w-auto transition-colors"
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
