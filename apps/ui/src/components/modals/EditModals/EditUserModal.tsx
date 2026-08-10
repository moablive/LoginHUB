import { useState, useEffect } from 'react';
import { XMarkIcon, PhoneIcon } from '@heroicons/react/24/outline';
import { userApi } from '@loginhub/api-client';
import { masks } from '../../../utils/masks';
import type { User, UpdateUserDTO as UpdateUserPayload } from '@loginhub/schema';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user: User | null;
}

export const EditUserModal = ({ isOpen, onClose, onSuccess, user }: EditUserModalProps) => {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    role: 'user'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        nome: user.nome,
        email: user.email,
        telefone: user.telefone || '',
        role: user.role || 'user'
      });
      setError(null);
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanPhone = formData.telefone.replace(/\D/g, '');

      const payload: UpdateUserPayload = {
        nome: formData.nome,
        email: formData.email,
        telefone: cleanPhone || undefined,
        role: formData.role
      };

      await userApi.update(user.id, payload);
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError('Não foi possível atualizar o usuário. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-muted/50">
          <h3 className="text-lg font-bold text-foreground">Editar Usuário</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground transition">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {error && (
            <div className="bg-danger/10 border-l-4 border-red-500 p-3 rounded-md">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
            <input
              type="text"
              required
              value={formData.nome}
              onChange={e => setFormData({...formData, nome: e.target.value})}
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Acesso</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          {/* Nível de Acesso */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nível de Acesso</label>
            <select
              value={formData.role}
              onChange={e => setFormData({...formData, role: e.target.value})}
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-card text-card-foreground"
            >
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
              <option value="suporte">Suporte</option>
              {formData.role === 'master' && <option value="master">Master</option>}
            </select>
          </div>

          {/* ✅ Campo Telefone Adicionado */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
               <PhoneIcon className="h-4 w-4 text-muted-foreground" />
               Telefone / WhatsApp
            </label>
            <input
              type="text"
              value={masks.phone(formData.telefone)}
              onChange={e => setFormData({...formData, telefone: e.target.value})}
              maxLength={15}
              placeholder="(00) 00000-0000"
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>


          {/* Footer */}
          <div className="pt-4 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-card text-card-foreground border border-input rounded-lg hover:bg-muted/50 transition font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-success text-primary-foreground rounded-lg hover:bg-success/90 transition font-medium shadow-md disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};