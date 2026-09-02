import { ExclamationTriangleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import type { StatusModalProps } from '@loginhub/schema';

export const StatusModal = ({ isOpen, onClose, onConfirm, isBlocking, entityName }: StatusModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      
      <div className="flex min-h-full items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center sm:items-center sm:p-0">
        
        <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
            aria-hidden="true"
            onClick={onClose}
        ></div>

        <div className="relative w-full transform overflow-hidden rounded-2xl bg-card text-card-foreground p-6 text-left shadow-xl transition-all sm:my-8 sm:max-w-md border border-border animate-fade-in-up">
          
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-full ${isBlocking ? 'bg-red-500/10 text-danger' : 'bg-green-500/10 text-green-500'}`}>
              {isBlocking ? (
                <ExclamationTriangleIcon className="h-6 w-6" />
              ) : (
                <ShieldCheckIcon className="h-6 w-6" />
              )}
            </div>
            <h3 className="text-lg font-bold leading-6 text-foreground" id="modal-title">
              {isBlocking ? 'Bloquear Acesso?' : 'Reativar Acesso?'}
            </h3>
          </div>

          <div className="mt-2">
            <p className="text-sm text-muted-foreground">
              Você está prestes a <strong>{isBlocking ? 'bloquear' : 'reativar'}</strong> o acesso de 
              <span className="text-foreground font-medium"> {entityName || 'este usuário'}</span>.
              <br/><br/>
              {isBlocking 
                ? 'Ele perderá acesso imediato à plataforma até ser reativado.' 
                : 'Ele poderá fazer login novamente imediatamente.'}
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
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