import { useState, useEffect } from "react";
import { XMarkIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import { userService } from "../../../services/userService";
export interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  companyId: string;
}

export const CreateUserModal = ({
  isOpen,
  onClose,
  onSuccess,
  companyId,
}: CreateUserModalProps) => {
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    password: "",
    role: "usuario",
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({ nome: "", email: "", password: "", role: "usuario" });
      setError(null);
    }
  }, [isOpen]);

  // Manipula mudanças nos inputs
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Envio do Formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await userService.create({
        ...formData,
        empresa_id: companyId,
        role: formData.role as "usuario" | "admin",
        telefone: undefined,
      });

      onSuccess(); // Recarrega a lista
      onClose(); // Fecha o modal
    } catch (err: unknown) {
      console.error(err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Ocorreu um erro desconhecido ao criar o usuário.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Se não estiver aberto, não renderiza nada
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Container Centralizado */}
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        {/* Backdrop Escuro */}
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Painel do Modal */}
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-gray-200 animate-fade-in-up">
          {/* Cabeçalho */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 flex justify-between items-center border-b border-gray-100">
            <h3 className="text-lg font-semibold leading-6 text-gray-900 flex items-center gap-2">
              <UserPlusIcon className="h-5 w-5 text-blue-600" />
              Novo Usuário
            </h3>
            <button
              type="button"
              className="rounded-md bg-transparent text-gray-400 hover:text-gray-500 focus:outline-none"
              onClick={onClose}
            >
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit}>
            <div className="px-4 py-5 sm:p-6 space-y-4">
              {/* Exibição de Erro */}
              {error && (
                <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                  <div className="flex">
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Nome Completo
                </label>
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

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  E-mail de Acesso
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border"
                  placeholder="usuario@empresa.com"
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Senha Provisória
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border"
                  placeholder="******"
                />
              </div>

              {/* Role / Nível de Acesso */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Nível de Acesso
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm py-2 px-3 border bg-white"
                >
                  <option value="usuario">Usuário Padrão</option>
                  <option value="admin">Administrador</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Admins podem gerenciar outros usuários desta empresa.
                </p>
              </div>
            </div>

            {/* Rodapé com Botões */}
            <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6 gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex w-full justify-center rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto transition-colors focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                {isLoading ? "Salvando..." : "Criar Usuário"}
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
        </div>
      </div>
    </div>
  );
};
