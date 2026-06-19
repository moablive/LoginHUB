import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { companyApi } from '@loginhub/api-client';
import { masks } from '../../../utils/masks';
import type { Company } from '@loginhub/schema';

interface EditCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  company: Company | null;
}

export const EditCompanyModal = ({ isOpen, onClose, onSuccess, company }: EditCompanyModalProps) => {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    documento: '',
    telefone: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (company) {
      setFormData({
        nome: company.nome,
        email: company.email,
        documento: company.documento, 
        telefone: company.telefone || ''
      });
    }
  }, [company]);

  if (!isOpen || !company) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Limpa caracteres especiais antes de enviar (apenas números)
      const cleanDocumento = formData.documento.replace(/\D/g, '');
      const cleanTelefone = formData.telefone.replace(/\D/g, '');

      await companyApi.update(company.id, {
        nome: formData.nome,
        email: formData.email,
        documento: cleanDocumento,
        // Envia undefined se estiver vazio, ou o número limpo
        telefone: cleanTelefone || undefined
      });
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert('Erro ao atualizar empresa. Verifique se o CNPJ ou E-mail já existem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-bold text-gray-900">Editar Empresa</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Empresa</label>
            <input
              type="text"
              required
              value={formData.nome}
              onChange={e => setFormData({...formData, nome: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>

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