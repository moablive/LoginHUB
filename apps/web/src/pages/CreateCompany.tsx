import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  BuildingOfficeIcon, 
  UserIcon, 
  ArrowLeftIcon, 
  EnvelopeIcon, 
  PhoneIcon,
  IdentificationIcon,
  LockClosedIcon,
  RocketLaunchIcon
} from '@heroicons/react/24/outline';
import { companyApi } from '@loginhub/api-client';
import { masks } from '../utils/masks';
import type { CreateCompanyDTO } from '@loginhub/schema';
import { SuccessModal } from '../components/modals/SuccessModal/SuccessModal';
import { AlertModal } from '../components/modals/AlertModal/AlertModal';

export const CreateCompany = () => {
  const navigate = useNavigate();
  const [showSuccess, setShowSuccess] = useState(false);
  
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
  } = useForm<CreateCompanyDTO>();

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' = 'error') => {
    setAlertState({ isOpen: true, title, message, variant });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue('documento', masks.cnpj(e.target.value));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'telefone' | 'admin_telefone') => {
    setValue(field, masks.phone(e.target.value));
  };

  const onSubmit = async (data: CreateCompanyDTO) => {
    try {
      await companyApi.create(data);
      setShowSuccess(true);
    } catch (error: unknown) {
      console.error(error);
      
      if (axios.isAxiosError(error)) {
        const msg = error.response?.data?.message || 'Falha ao criar empresa';
        showAlert('Erro no Provisionamento', msg, 'error');
      } else {
        showAlert('Erro Inesperado', 'Ocorreu um erro interno. Tente novamente.', 'error');
      }
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    navigate('/companies');
  };

  const inputClass = "block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors";
  const errorClass = "border-red-500 focus:ring-red-500 focus:border-red-500";

  return (
    <div className="min-h-screen bg-gray-50 p-6 animate-fade-in">
      
      <div className="max-w-5xl mx-auto mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <BuildingOfficeIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nova Empresa</h1>
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
          
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
            
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 flex items-center gap-2">
                <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                Dados Corporativos
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Empresa</label>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Documento (CNPJ)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <IdentificationIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    {...register('documento', { required: 'Documento é obrigatório' })}
                    onChange={handleDocumentChange}
                    className={`${inputClass} ${errors.documento ? errorClass : ''}`}
                    placeholder="00.000.000/0001-00"
                    maxLength={18}
                  />
                </div>
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
                    placeholder="contato@empresa.com" 
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
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-gray-400" />
                Administrador Inicial
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Responsável</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <UserIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    {...register('admin_nome', { required: true })} 
                    className={inputClass}
                    placeholder="Nome completo" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Login</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    type="email"
                    {...register('admin_email', { required: true })} 
                    className={inputClass}
                    placeholder="admin@empresa.com" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha Inicial</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <LockClosedIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    type="password"
                    {...register('password', { required: true, minLength: 6 })} 
                    className={inputClass}
                    placeholder="******" 
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">Mínimo de 6 caracteres.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone (Celular)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <PhoneIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input 
                    {...register('admin_telefone', { required: true })}
                    onChange={(e) => handlePhoneChange(e, 'admin_telefone')}
                    className={inputClass}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
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
        message="A empresa e o usuário administrador foram criados com sucesso."
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