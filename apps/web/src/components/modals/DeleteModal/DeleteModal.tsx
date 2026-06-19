import { ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';
import './DeleteModal.css';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemName?: string; // Nome do item sendo deletado (ex: nome da empresa)
  isLoading?: boolean;
}

export const DeleteModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Excluir Item", 
  itemName,
  isLoading = false 
}: DeleteModalProps) => {
  
  if (!isOpen) return null;

  return (
    <div className="awl-delete-overlay">
      <div className="awl-delete-card">
        
        {/* Ícone */}
        <div className="delete-icon-container">
          <ExclamationTriangleIcon className="h-10 w-10" />
        </div>

        {/* Textos */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {title}
        </h2>
        
        <p className="text-gray-500 mb-1">
          Você tem certeza que deseja realizar esta ação?
        </p>
        
        {itemName && (
          <p className="text-gray-800 font-medium bg-red-50 py-2 px-3 rounded-lg border border-red-100 mt-2 inline-block">
            "{itemName}"
          </p>
        )}

        <p className="text-red-500 text-xs mt-4 font-semibold uppercase tracking-wide">
          ⚠️ Esta ação é irreversível
        </p>

        {/* Botões */}
        <div className="delete-actions">
          <button 
            className="btn-delete-cancel" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancelar
          </button>
          
          <button 
            className="btn-delete-confirm" 
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Excluindo...
              </>
            ) : (
              <>
                <TrashIcon className="h-5 w-5" />
                Sim, Excluir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};