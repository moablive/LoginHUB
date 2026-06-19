import React, { useEffect } from 'react';
import './SuccessModal.css';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  buttonText?: string;
  autoCloseDuration?: number; // Opcional: Fecha sozinho após X ms
}

export const SuccessModal: React.FC<SuccessModalProps> = ({ 
  isOpen, 
  onClose, 
  title = 'Sucesso!', 
  message,
  buttonText = 'Continuar',
  autoCloseDuration
}) => {
  
  // Efeito para fechar no ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Efeito para Auto-Close (opcional)
  useEffect(() => {
    if (isOpen && autoCloseDuration) {
      const timer = setTimeout(onClose, autoCloseDuration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseDuration, onClose]);

  if (!isOpen) return null;

  return (
    <div className="awl-modal-overlay" onClick={onClose}>
      {/* stopPropagation impede que clicar no card feche o modal */}
      <div className="awl-modal-card" onClick={(e) => e.stopPropagation()}>
        
        {/* Ícone Animado */}
        <div className="success-icon-container">
          <i className="bi bi-check-lg"></i>
        </div>

        {/* Textos */}
        <h3 className="fw-bold text-dark mb-2">{title}</h3>
        <p className="text-muted mb-4">{message}</p>

        {/* Botão Bonito */}
        <button 
          className="btn btn-success w-100 py-2 rounded-pill fw-bold shadow-sm"
          onClick={onClose}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
};