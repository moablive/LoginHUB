import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { appApi } from '@loginhub/api-client';
import { masks } from '../../../utils/masks';
import type { App } from '@loginhub/schema';
import { LogoUpload } from '../../LogoUpload/LogoUpload';

interface EditAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  app: App | null;
}

export const EditAppModal = ({ isOpen, onClose, onSuccess, app }: EditAppModalProps) => {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    documento: '',
    telefone: '',
    bot_url: ''
  });
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (app) {
      setFormData({
        nome: app.nome,
        email: app.email,
        documento: app.documento,
        telefone: app.telefone || '',
        bot_url: app.bot_url || ''
      });
      setLogo(app.logo ?? null);
      setError(null);
    }
  }, [app]);

  if (!isOpen || !app) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanDocumento = formData.documento.replace(/\D/g, '');
      const cleanTelefone = formData.telefone.replace(/\D/g, '');

      await appApi.update(app.id, {
        nome: formData.nome,
        email: formData.email,
        documento: cleanDocumento,
        telefone: cleanTelefone || undefined,
        logo: logo ?? null,
        bot_url: formData.bot_url.trim() || null,
      });

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      setError('Não foi possível atualizar o aplicativo. Verifique se o CNPJ ou e-mail já estão em uso.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-900">Editar Aplicativo</h3>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Aplicativo</label>
            <input
              type="text"
              required
              value={formData.nome}
              onChange={e => setFormData({...formData, nome: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <LogoUpload value={logo} onChange={setLogo} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Documento (CNPJ)</label>
            <input
              type="text"
              required
              value={masks.cnpj(formData.documento)}
              onChange={e => setFormData({...formData, documento: e.target.value})}
              maxLength={18} // Limita tamanho com máscara
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Corporativo</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input
              type="text"
              value={masks.phone(formData.telefone)}
              onChange={e => setFormData({...formData, telefone: e.target.value})}
              maxLength={15}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL do Bot <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="url"
              value={formData.bot_url}
              onChange={e => setFormData({...formData, bot_url: e.target.value})}
              placeholder="https://t.me/seu_bot"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
            <p className="mt-1 text-xs text-gray-500">Enviada no e-mail de convite para o usuário acessar o bot.</p>
          </div>

          <div className="pt-2 flex gap-3 justify-end">
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium shadow-md disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};