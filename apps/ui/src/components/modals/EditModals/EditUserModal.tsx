import { useState, useEffect } from 'react';
import { XMarkIcon, KeyIcon, PhoneIcon } from '@heroicons/react/24/outline';
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
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        nome: user.nome,
        email: user.email,
        telefone: user.telefone || '',
        password: ''
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
        telefone: cleanPhone || undefined
      };

      if (formData.password.trim()) {
        payload.password = formData.password;
      }

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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-900">Editar Usuário</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          {/* ✅ Campo Telefone Adicionado */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
               <PhoneIcon className="h-4 w-4 text-gray-400" />
               Telefone / WhatsApp
            </label>
            <input
              type="text"
              value={masks.phone(formData.telefone)}
              onChange={e => setFormData({...formData, telefone: e.target.value})}
              maxLength={15}
              placeholder="(00) 00000-0000"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          {/* Senha */}
          <div className="pt-2 border-t border-gray-100 mt-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
              <KeyIcon className="h-4 w-4 text-gray-400" />
              Nova Senha (Opcional)
            </label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Deixe em branco para manter a atual"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition placeholder:text-gray-400 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Preencha apenas se desejar redefinir a senha deste usuário.</p>
          </div>

          {/* Footer */}
          <div className="pt-4 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium shadow-md disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};