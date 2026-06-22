import type { ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

export type ConfirmVariant = "danger" | "warning" | "info";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  /** Texto opcional em destaque (ex: nome do item afetado) */
  highlight?: string;
  variant?: ConfirmVariant;
  /** Ícone do cabeçalho (heroicon ou qualquer ReactNode). Default por variant. */
  icon?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  loadingText?: string;
}

const VARIANT_STYLES: Record<
  ConfirmVariant,
  { iconBg: string; iconColor: string; ring: string; button: string; highlightBg: string; highlightBorder: string }
> = {
  danger: {
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    ring: "ring-red-500",
    button: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
    highlightBg: "bg-red-50",
    highlightBorder: "border-red-100",
  },
  warning: {
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    ring: "ring-amber-500",
    button: "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500",
    highlightBg: "bg-amber-50",
    highlightBorder: "border-amber-100",
  },
  info: {
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    ring: "ring-blue-500",
    button: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
    highlightBg: "bg-blue-50",
    highlightBorder: "border-blue-100",
  },
};

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  highlight,
  variant = "warning",
  icon,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isLoading = false,
  loadingText = "Processando...",
}: ConfirmModalProps) => {
  if (!isOpen) return null;

  const styles = VARIANT_STYLES[variant];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={isLoading ? undefined : onClose}
          aria-hidden="true"
        />

        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-gray-200 animate-fade-in-up">
          {/* Cabeçalho */}
          <div className="px-5 pt-5 pb-2 flex items-start gap-4">
            <div className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center ${styles.iconBg}`}>
              <span className={`${styles.iconColor}`}>{icon}</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            </div>
            <button
              type="button"
              className="rounded-md text-gray-400 hover:text-gray-500 disabled:opacity-50"
              onClick={onClose}
              disabled={isLoading}
              aria-label="Fechar"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo */}
          <div className="px-5 pb-5 pl-20 -mt-1 space-y-3">
            <div className="text-sm text-gray-600 leading-relaxed">{message}</div>
            {highlight && (
              <div
                className={`text-sm font-medium text-gray-900 ${styles.highlightBg} py-2 px-3 rounded-lg border ${styles.highlightBorder} inline-block`}
              >
                {highlight}
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div className="bg-gray-50 px-5 py-3 flex flex-row-reverse gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${styles.button}`}
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {loadingText}
                </>
              ) : (
                confirmText
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
