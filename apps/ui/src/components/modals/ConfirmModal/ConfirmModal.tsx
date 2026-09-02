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
    iconBg: "bg-danger/10",
    iconColor: "text-danger",
    ring: "ring-red-500",
    button: "bg-danger hover:bg-danger/90 focus:ring-red-500",
    highlightBg: "bg-danger/10",
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
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    ring: "ring-blue-500",
    button: "bg-primary hover:bg-primary/90 focus:ring-blue-500",
    highlightBg: "bg-primary/10",
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
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]" role="dialog" aria-modal="true">
      <div className="flex min-h-full items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center sm:items-center sm:p-0">
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={isLoading ? undefined : onClose}
          aria-hidden="true"
        />

        <div className="relative w-full transform overflow-hidden rounded-2xl bg-card text-card-foreground text-left shadow-xl transition-all sm:my-8 sm:max-w-md border border-border animate-fade-in-up">
          {/* Cabeçalho */}
          <div className="px-5 pt-5 pb-2 flex items-start gap-4">
            <div className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center ${styles.iconBg}`}>
              <span className={`${styles.iconColor}`}>{icon}</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            </div>
            <button
              type="button"
              className="rounded-md text-muted-foreground hover:text-muted-foreground disabled:opacity-50"
              onClick={onClose}
              disabled={isLoading}
              aria-label="Fechar"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Corpo */}
          <div className="px-5 pb-5 pl-20 -mt-1 space-y-3">
            <div className="text-sm text-muted-foreground leading-relaxed">{message}</div>
            {highlight && (
              <div
                className={`text-sm font-medium text-foreground ${styles.highlightBg} py-2 px-3 rounded-lg border ${styles.highlightBorder} inline-block`}
              >
                {highlight}
              </div>
            )}
          </div>

          {/* Rodapé */}
          <div className="bg-muted/50 px-5 py-3 flex flex-row-reverse gap-2 border-t border-border">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${styles.button}`}
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
              className="inline-flex items-center justify-center rounded-lg bg-card text-card-foreground px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
