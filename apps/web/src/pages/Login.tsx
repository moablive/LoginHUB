import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

import { authService } from '../services/authService';

// Tipagem local para o formulário (Só pedimos a senha na tela)
interface LoginFormInputs {
  password: string;
}

export function Login() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Hook do formulário tipado apenas com o que existe na tela
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginFormInputs>();

  const onSubmit = async (data: LoginFormInputs): Promise<void> => {
    setLoginError(null);
    try {
      // 1. Lógica Master Key:
      // O e-mail é injetado hardcoded pois o usuário só digita a chave mestra.
      const hiddenMasterEmail = 'master@infra.local';

      // 2. Chamada ao serviço
      // Passamos o email oculto + a senha digitada
      await authService.login(hiddenMasterEmail, data.password);

      // 3. Sucesso: Redireciona
      // O authService já salva o token, então apenas navegamos
      navigate('/dashboard'); 

    } catch (error: unknown) {
      console.error('Erro no login:', error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          setLoginError('Master Key inválida ou acesso negado.');
        } else if (error.code === 'ERR_NETWORK') {
          setLoginError('Sem conexão com o servidor (API Offline).');
        } else {
          setLoginError(`Erro do Servidor: ${error.message}`);
        }
      } else if (error instanceof Error) {
        setLoginError(error.message);
      } else {
        setLoginError('Ocorreu um erro inesperado. Tente novamente.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-200">

        {/* CABEÇALHO */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
            <ShieldCheckIcon className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 tracking-tight">
            LoginHub
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Acesso Administrativo (Master Key)
          </p>
        </div>

        {/* FORMULÁRIO */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div className="relative">
              <label htmlFor="password" className="sr-only">Master Key</label>
              
              {/* Ícone Cadeado */}
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LockClosedIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </div>
              
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="appearance-none rounded-lg relative block w-full pl-10 pr-10 px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Insira a Master Key"
                {...register('password', { required: true })}
              />
              
              {/* Botão Olho (Show/Hide) */}
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          {/* MENSAGEM DE ERRO */}
          {loginError && (
            <div className="rounded-md bg-red-50 p-4 border border-red-200 animate-pulse">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Falha na Autenticação</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{loginError}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BOTÃO ENTRAR */}
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 transition-all shadow-sm"
            >
              {isSubmitting ? 'Verificando...' : 'Acessar Painel'}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-gray-400 mt-4">
          &copy; 2026 LoginHub Infrastructure.
        </p>
      </div>
    </div>
  );
}
