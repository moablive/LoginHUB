export interface StatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isBlocking: boolean;
  entityName?: string; 
}