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
          group w-24 h-8 flex items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300 border
          ${isActive 
            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200' 
            : 'bg-red-50 text-red-700 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
          }
        `}
      >
        {/* Texto Normal (Ex: Ativo) - Some no hover */}
        <span className="flex items-center gap-1.5 group-hover:hidden">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
          {isActive ? 'ATIVO' : 'INATIVO'}
        </span>

        {/* Texto Hover (Ex: Bloquear) - Aparece no hover */}
        <span className="hidden items-center group-hover:flex">
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