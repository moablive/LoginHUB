import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authApi } from '@loginhub/api-client';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { TwoFactorSetup } from '../features/twoFactor/TwoFactorSetup';
import { QrCode } from '../features/twoFactor/QrCode';
import { TwoFactorChallenge } from '../features/twoFactor/TwoFactorChallenge';

export function SetupPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // 2FA é exigido de toda conta, então a página emenda no enrolamento em vez de
  // mandar para o login. O QR é desenhado AQUI, no navegador — nunca no e-mail,
  // senão os dois fatores viajariam pelo mesmo canal.
  const [precisaEnrolar, setPrecisaEnrolar] = useState(false);
  // Reset de senha numa conta que JÁ tem 2FA: definir a senha não substitui o
  // segundo fator, então o backend devolve desafio em vez de sessão e a página
  // fecha o login aqui mesmo.
  const [desafio, setDesafio] = useState<string | null>(null);

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
      const r = await authApi.setupPassword(token, password);
      if (r.requires2FA && r.challengeToken) {
        setDesafio(r.challengeToken);
        return;
      }
      if (r.require2FASetup) {
        setPrecisaEnrolar(true);
        return;
      }
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
      <div className="min-h-screen min-h-dvh bg-background flex items-center justify-center p-4 py-8">
        <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 text-center border border-border">
          <div className="mx-auto w-16 h-16 bg-danger/20 rounded-full flex items-center justify-center mb-6">
            <ShieldCheckIcon className="w-8 h-8 text-danger" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Link Inválido</h2>
          <p className="text-muted-foreground mb-8">Não foi possível encontrar o token de acesso. O link pode estar quebrado ou já foi utilizado.</p>
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

  if (desafio) {
    return (
      <div className="min-h-screen min-h-dvh bg-background flex items-center justify-center p-4 py-8">
        <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 border border-border">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
              <ShieldCheckIcon className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Senha definida. Confirme quem é você.</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Esta conta já tem verificação em duas etapas. Informe o código do autenticador.
            </p>
          </div>
          <TwoFactorChallenge
            challengeToken={desafio}
            onAutenticado={() => {
              setDesafio(null);
              setSuccess(true);
              setTimeout(() => navigate('/login'), 3000);
            }}
          />
        </div>
      </div>
    );
  }

  if (precisaEnrolar) {
    return (
      <div className="min-h-screen min-h-dvh bg-background flex items-center justify-center p-4 py-8">
        <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 border border-border">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
              <ShieldCheckIcon className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Senha definida. Falta um passo.</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Este convite exige verificação em duas etapas. Tenha o celular à mão.
            </p>
          </div>
          <TwoFactorSetup autoIniciar renderQr={(uri) => <QrCode uri={uri} />} />
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen min-h-dvh bg-background flex items-center justify-center p-4 py-8">
        <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 text-center border border-border">
          <div className="mx-auto w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mb-6">
            <ShieldCheckIcon className="w-8 h-8 text-success" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Senha definida!</h2>
          <p className="text-muted-foreground mb-8">Sua senha foi configurada com sucesso. Você já pode acessar a plataforma.</p>
          <p className="text-sm text-muted-foreground">Redirecionando para o login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh bg-background flex items-center justify-center p-4 py-8">
      <div className="bg-card text-card-foreground rounded-2xl shadow-xl max-w-md w-full p-8 border border-border">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-6">
            <ShieldCheckIcon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Defina sua senha</h2>
          <p className="text-muted-foreground mt-2 text-sm">Crie uma senha segura para o seu primeiro acesso.</p>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger p-4 rounded-xl mb-6 text-sm border border-danger/30 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Nova Senha</label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full px-4 py-3 text-base bg-muted/40 border border-input rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-foreground placeholder-muted-foreground"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Confirme a Senha</label>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full px-4 py-3 text-base bg-muted/40 border border-input rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-foreground placeholder-muted-foreground"
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
