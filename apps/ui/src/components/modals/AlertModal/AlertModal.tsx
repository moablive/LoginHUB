import { useEffect } from 'react';
import { 
  ExclamationTriangleIcon, 
  InformationCircleIcon, 
  XCircleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export type AlertVariant = 'warning' | 'error' | 'info' | 'success';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: AlertVariant; // Opcional, padrão 'warning'
  buttonText?: string;
}

export const AlertModal = ({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  variant = 'warning', 
  buttonText = 'Entendi' 
}: AlertModalProps) => {

  // Fecha ao pressionar ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Configurações visuais baseadas na variante
  const styles = {
    warning: {
      icon: <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600" />,
      bgIcon: 'bg-yellow-100',
      button: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
      titleColor: 'text-yellow-900' // Opcional, ou manter gray-900
    },
    error: {
      icon: <XCircleIcon className="h-6 w-6 text-red-600" />,
      bgIcon: 'bg-red-100',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
      titleColor: 'text-red-900'
    },
    info: {
      icon: <InformationCircleIcon className="h-6 w-6 text-blue-600" />,
      bgIcon: 'bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      titleColor: 'text-blue-900'
    },
    success: {
      icon: <CheckCircleIcon className="h-6 w-6 text-green-600" />,
      bgIcon: 'bg-green-100',
      button: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
      titleColor: 'text-green-900'
    }
  };

  const currentStyle = styles[variant];

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" role="dialog" aria-modal="true">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        
        {/* Backdrop (Fundo Escuro) */}
        <div 
          className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm transition-opacity animate-fade-in" 
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Modal Panel */}
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-sm border border-gray-100 animate-fade-in-up">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              
              {/* Ícone Dinâmico */}
              <div className={`mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${currentStyle.bgIcon} sm:mx-0 sm:h-10 sm:w-10 mb-4 sm:mb-0`}>
                {currentStyle.icon}
              </div>

              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <h3 className={`text-lg font-semibold leading-6 text-gray-900`} id="modal-title">
                  {title}
                </h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    {message}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Rodapé / Botão */}
          <div className="bg-gray-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <button
              type="button"
              className={`inline-flex w-full justify-center rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm sm:ml-3 sm:w-auto transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${currentStyle.button}`}
              onClick={onClose}
            >
              {buttonText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};