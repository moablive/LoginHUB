import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  BuildingOfficeIcon,
  ArrowLeftIcon,
  EnvelopeIcon,
  PhoneIcon,
  IdentificationIcon,
  RocketLaunchIcon,
  LinkIcon
} from '@heroicons/react/24/outline';
import { appApi } from '@loginhub/api-client';
import { masks } from '../utils/masks';
import type { CreateAppDTO } from '@loginhub/schema';
import { SuccessModal } from '../components/modals/SuccessModal/SuccessModal';
import { AlertModal } from '../components/modals/AlertModal/AlertModal';
import { LogoUpload } from '../components/LogoUpload/LogoUpload';

export const CreateApp = () => {
  const navigate = useNavigate();
  const [showSuccess, setShowSuccess] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'error'
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<CreateAppDTO>();

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' = 'error') => {
    setAlertState({ isOpen: true, title, message, variant });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'telefone' | 'admin_telefone') => {
    setValue(field, masks.phone(e.target.value));
  };

  const onSubmit = async (data: CreateAppDTO) => {
    try {
      await appApi.create({ ...data, logo: logo || undefined });
      setShowSuccess(true);
    } catch (error: unknown) {
      console.error(error);
      
      if (axios.isAxiosError(error)) {
        const msg = error.response?.data?.message || 'Falha ao criar aplicativo';
        showAlert('Erro no Provisionamento', msg, 'error');
      } else {
        showAlert('Erro Inesperado', 'Ocorreu um erro interno. Tente novamente.', 'error');
      }
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    navigate('/apps');
  };

  const inputClass = "block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors";
  const errorClass = "border-red-500 focus:ring-red-500 focus:border-red-500";

  return (
    <div className="space-y-6 animate-fade-in">
      
      <div className="max-w-5xl mx-auto mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <BuildingOfficeIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Novo Aplicativo</h1>
            <p className="text-sm text-gray-500">Provisionamento de novo Tenant</p>
          </div>
        </div>
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-blue-600 transition font-medium text-sm bg-white border border-gray-300 px-4 py-2 rounded-lg shadow-sm"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Voltar
        </button>
      </div>

      <div className="max-w-5xl mx-auto">
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          
          <div className="p-8 max-w-2xl mx-auto">
            
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 flex items-center gap-2">
                <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                Dados Corporativos
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Aplicativo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    {...register('nome', { required: 'Nome é obrigatório' })}
                    className={`${inputClass} ${errors.nome ? errorClass : ''}`}
                    placeholder="Ex: Tech Solutions Ltda"
                  />
                </div>
                {errors.nome && <p className="mt-1 text-xs text-red-500">{errors.nome.message}</p>}
              </div>

              <LogoUpload value={logo} onChange={setLogo} />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Documento (CPF/CNPJ)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <IdentificationIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    {...register('documento', { required: 'Documento é obrigatório' })}
                    onChange={(e) => {
                      setValue('documento', masks.cpfCnpj(e.target.value));
                    }}
                    className={`${inputClass} ${errors.documento ? errorClass : ''}`}
                    placeholder="000.000.000-00 ou 00.000.000/0001-00"
                    maxLength={18}
                  />
                </div>
                {errors.documento && <p className="mt-1 text-xs text-red-500">{errors.documento.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Corporativo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    type="email"
                    {...register('email', { required: true })} 
                    className={inputClass}
                    placeholder="contato@aplicativo.com" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <PhoneIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    {...register('telefone', { required: true })}
                    onChange={(e) => handlePhoneChange(e, 'telefone')}
                    className={inputClass}
                    placeholder="(00) 0000-0000"
                    maxLength={15}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL do Bot <span className="text-gray-400 font-normal">(opcional)</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LinkIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="url"
                    {...register('bot_url', {
                      pattern: {
                        value: /^https?:\/\/.+/i,
                        message: 'URL deve começar com http:// ou https://'
                      }
                    })}
                    className={`${inputClass} ${errors.bot_url ? errorClass : ''}`}
                    placeholder="https://t.me/seu_bot"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Link enviado no e-mail de convite para os usuários acessarem o bot (Telegram, WhatsApp, etc).</p>
                {errors.bot_url && <p className="mt-1 text-xs text-red-500">{errors.bot_url.message}</p>}
              </div>
            </div>

          </div>

          <div className="px-8 py-5 bg-gray-50 border-t border-gray-200 flex justify-end">
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-blue-700 transition shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Provisionando...
                </>
              ) : (
                <>
                  <RocketLaunchIcon className="h-5 w-5" />
                  Provisionar Tenant
                </>
              )}
            </button>
          </div>

        </form>
      </div>

      <SuccessModal 
        isOpen={showSuccess}
        onClose={handleCloseSuccess}
        title="Tenant Provisionado!"
        message="A aplicativo e o usuário administrador foram criados com sucesso."
        buttonText="Voltar para Lista"
      />

      <AlertModal 
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
      />
    </div>
  );
};