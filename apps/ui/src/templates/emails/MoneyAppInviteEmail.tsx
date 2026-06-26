import React from 'react';

interface MoneyAppInviteEmailProps {
  email: string;
  tempPassword?: string;
  loginUrl?: string | null;
  botUrl?: string | null;
  appLogo?: string | null;
}

export const MoneyAppInviteEmail: React.FC<MoneyAppInviteEmailProps> = ({ email, tempPassword, loginUrl, botUrl, appLogo }) => {
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
          Bem-vindo(a) ao MoneyAPP. Aqui estão suas credenciais para o primeiro acesso:
        </p>
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '20px', borderRadius: '8px', margin: '25px 0' }}>
          <p style={{ margin: '0 0 12px 0', fontSize: '15px' }}>
            <span style={{ color: '#94a3b8' }}>Login:</span> <strong>{email}</strong>
          </p>
          {tempPassword && (
            <p style={{ margin: '0', fontSize: '15px' }}>
              <span style={{ color: '#94a3b8' }}>Senha temporária:</span> <strong>{tempPassword}</strong>
            </p>
          )}
        </div>
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.5' }}>
          No seu primeiro acesso, o sistema exigirá a criação de uma senha definitiva.
          {botUrl ? ' Após criar sua nova senha, você poderá se conectar ao nosso assistente pelo link abaixo.' : ''}
        </p>
        {loginUrl && (
          <div style={{ textAlign: 'center', marginTop: '35px' }}>
            <a href={loginUrl} style={{ backgroundColor: '#10b981', color: '#ffffff', padding: '14px 28px', textDecoration: 'none', borderRadius: '8px', fontWeight: '600', display: 'inline-block', fontSize: '16px' }}>
              Acessar MoneyAPP
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
