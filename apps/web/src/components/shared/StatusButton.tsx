import { useState } from 'react';
import { StatusModal } from './StatusModal/StatusModal'; // Ajuste o import conforme onde salvou

interface StatusButtonProps {
  currentStatus: 'ativo' | 'inativo'; // ou o tipo que vem do seu banco
  entityName: string;
  onStatusChange: () => Promise<void>; // Função que chama a API
}

export const StatusButton = ({ currentStatus, entityName, onStatusChange }: StatusButtonProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const isActive = currentStatus === 'ativo';

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`
          group relative w-24 h-8 flex items-center justify-center rounded-full text-xs font-bold transition-all duration-300 overflow-hidden
          ${isActive 
            ? 'bg-green-500/10 text-green-500 hover:bg-red-500 hover:text-white hover:shadow-lg hover:shadow-red-500/30' 
            : 'bg-red-500/10 text-red-500 hover:bg-green-500 hover:text-white hover:shadow-lg hover:shadow-green-500/30'
          }
        `}
      >
        {/* Texto Normal (Ex: Ativo) - Some no hover */}
        <span className="absolute transition-transform duration-300 group-hover:-translate-y-8 group-hover:opacity-0 flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {isActive ? 'ATIVO' : 'INATIVO'}
        </span>

        {/* Texto Hover (Ex: Bloquear) - Aparece no hover */}
        <span className="absolute translate-y-8 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          {isActive ? 'BLOQUEAR' : 'ATIVAR'}
        </span>
      </button>

      <StatusModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={onStatusChange}
        isBlocking={isActive}
        entityName={entityName}
      />
    </>
  );
};