import React, { useEffect } from 'react';
import './LogoutModal.css';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm 
}) => {

  // Gerenciamento de acessibilidade e teclado
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      // Bloqueia o scroll do body quando a modal está aberta
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleEsc);
    }

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    /* Overlay: Clica fora para fechar */
    <div className="awl-logout-overlay" onClick={onClose} aria-modal="true" role="dialog">
      
      {/* Card: stopPropagation impede que clique dentro do card feche a modal */}
      <div className="awl-logout-card" onClick={(e) => e.stopPropagation()}>
        
        {/* Ícone de Saída com animação Shake do CSS */}
        <div className="logout-icon-container">
          <i className="bi bi-box-arrow-right"></i>
        </div>

        <h4 className="fw-bold text-dark mb-2">Sair do Sistema?</h4>
        
        <p className="text-muted small mb-4">
          Você terá que inserir a <strong>Master Key</strong> novamente para acessar o painel administrativo da Astral Wave.
        </p>

        <div className="logout-actions">
          {/* Botão Cancelar: 
            Usa apenas a classe do CSS customizado para evitar conflitos de padding 
          */}
          <button 
            type="button"
            className="btn-cancel"
            onClick={onClose}
          >
            Cancelar
          </button>
          
          {/* Botão Confirmar:
            Foco no contraste para ação crítica (Sair)
          */}
          <button 
            type="button"
            className="btn-confirm-logout"
            onClick={onConfirm}
          >
            Sim, Sair
          </button>
        </div>

      </div>
    </div>
  );
};