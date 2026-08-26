import React from 'react';

interface MoneyAppInviteEmailProps {
  email: string;
  magicLinkToken?: string;
  loginUrl?: string | null;
  botUrl?: string | null;
  appLogo?: string | null;
}

export const MoneyAppInviteEmail: React.FC<MoneyAppInviteEmailProps> = ({ email, magicLinkToken, loginUrl, botUrl, appLogo }) => {
  // `platform_url` com barra final produzia `//setup-password`, e o Vue Router
  // dos apps NAO casa esse caminho: o nginx devolve o SPA (200, parece certo),
  // nenhuma rota bate, o guard manda para /login e a pessoa ve a tela de login
  // em vez do formulario de senha. Metade dos apps tem a barra cadastrada.
  const base = (loginUrl || 'http://localhost:3006').replace(/\/+$/, '');
  const finalLoginUrl = magicLinkToken ? `${base}/setup-password?token=${magicLinkToken}` : loginUrl;

  return (
    <div style={{ fontFamily: '"Inter", sans-serif', padding: '20px', color: '#e2e8f0', backgroundColor: '#0f172a' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', border: '1px solid #334155', borderRadius: '12px', padding: '30px', backgroundColor: '#1e293b' }}>
        {appLogo && (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <img src={appLogo} alt="Logo MoneyAPP" style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '8px' }} />
          </div>
        )}
        <h2 style={{ color: '#10b981', borderBottom: '1px solid #334155', paddingBottom: '15px', marginTop: 0 }}>
          Seu acesso ao MoneyAPP foi liberado!
        </h2>
        <p style={{ fontSize: '16px', lineHeight: '1.6', color: '#cbd5e1' }}>
          Bem-vindo(a) ao MoneyAPP. Para acessar sua conta, clique no botão abaixo e defina sua senha:
        </p>
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '20px', borderRadius: '8px', margin: '25px 0' }}>
          <p style={{ margin: '0 0 12px 0', fontSize: '15px' }}>
            <span style={{ color: '#94a3b8' }}>Login:</span> <strong>{email}</strong>
          </p>
        </div>
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.5' }}>
          Este link é seguro e só pode ser usado uma vez. Se você não solicitou este acesso, ignore este e-mail.
          {botUrl ? ' Após criar sua nova senha, você poderá se conectar ao nosso assistente.' : ''}
        </p>
        {finalLoginUrl && (
          <div style={{ textAlign: 'center', marginTop: '35px' }}>
            <a href={finalLoginUrl} style={{ backgroundColor: '#10b981', color: '#ffffff', padding: '14px 28px', textDecoration: 'none', borderRadius: '8px', fontWeight: '600', display: 'inline-block', fontSize: '16px' }}>
              Definir minha senha
            </a>
          </div>
        )}
        {botUrl && (
          <div style={{ textAlign: 'center', marginTop: '15px' }}>
            <a href={botUrl} style={{ backgroundColor: '#0ea5e9', color: '#ffffff', padding: '12px 24px', textDecoration: 'none', borderRadius: '8px', fontWeight: '600', display: 'inline-block', fontSize: '15px' }}>
              Acessar Bot
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
