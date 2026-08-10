import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authApi } from '@loginhub/api-client';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

export function SetupPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Token inválido ou ausente.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authApi.setupPassword(token, password);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao definir a senha. O link pode ter expirado.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 text-center border border-slate-100">
          <div className="mx-auto w-16 h-16 bg-danger/20 rounded-full flex items-center justify-center mb-6">
            <ShieldCheckIcon className="w-8 h-8 text-danger" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Link Inválido</h2>
          <p className="text-slate-600 mb-8">Não foi possível encontrar o token de acesso. O link pode estar quebrado ou já foi utilizado.</p>
          <button
            onClick={() => navigate('/login')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 px-6 rounded-lg transition-colors w-full"
          >
            Ir para o Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 text-center border border-slate-100">
          <div className="mx-auto w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mb-6">
            <ShieldCheckIcon className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Senha definida!</h2>
          <p className="text-slate-600 mb-8">Sua senha foi configurada com sucesso. Você já pode acessar a plataforma.</p>
          <p className="text-sm text-slate-400">Redirecionando para o login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 border border-slate-100">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-6">
            <ShieldCheckIcon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Defina sua senha</h2>
          <p className="text-slate-500 mt-2 text-sm">Crie uma senha segura para o seu primeiro acesso.</p>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger p-4 rounded-xl mb-6 text-sm border border-red-100 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nova Senha</label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-700 placeholder-slate-400"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirme a Senha</label>
            <input
              type="password"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-slate-700 placeholder-slate-400"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Salvando...' : 'Salvar Senha e Acessar'}
          </button>
        </form>
      </div>
    </div>
  );
}
