import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import type { StatusModalProps } from '@loginhub/schema';

export const StatusModal = ({ isOpen, onClose, onConfirm, isBlocking, entityName }: StatusModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
            aria-hidden="true"
            onClick={onClose}
        ></div>

        <div className="relative transform overflow-hidden rounded-2xl bg-[#1f2937] p-6 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-gray-700 animate-fade-in-up">
          
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-full ${isBlocking ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
              {isBlocking ? (
                <ExclamationTriangleIcon className="h-6 w-6" />
              ) : (
                <ShieldCheckIcon className="h-6 w-6" />
              )}
            </div>
            <h3 className="text-lg font-bold leading-6 text-primary-foreground" id="modal-title">
              {isBlocking ? 'Bloquear Acesso?' : 'Reativar Acesso?'}
            </h3>
          </div>

          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              Você está prestes a <strong>{isBlocking ? 'bloquear' : 'reativar'}</strong> o acesso de 
              <span className="text-primary-foreground font-medium"> {entityName || 'este usuário'}</span>.
              <br/><br/>
              {isBlocking 
                ? 'Ele perderá acesso imediato à plataforma até ser reativado.' 
                : 'Ele poderá fazer login novamente imediatamente.'}
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground opacity-50 hover:bg-card text-card-foreground/5 transition-colors border border-gray-600"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded-lg text-sm font-medium text-primary-foreground transition-all shadow-lg ${
                isBlocking 
                  ? 'bg-danger hover:bg-danger/90 shadow-red-500/20' 
                  : 'bg-success hover:bg-success/90 shadow-green-500/20'
              }`}
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              Confirmar {isBlocking ? 'Bloqueio' : 'Ativação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};