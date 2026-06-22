import React from 'react';

interface InviteEmailProps {
  email: string;
  tempPassword?: string;
  appName: string;
  loginUrl: string;
  botUrl?: string | null;
}

export const InviteEmailTemplate: React.FC<InviteEmailProps> = ({ email, tempPassword, appName, loginUrl, botUrl }) => {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', color: '#333' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', border: '1px solid #eee', borderRadius: '8px', padding: '20px', backgroundColor: '#fff' }}>
        <h2 style={{ color: '#0f172a', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Bem-vindo(a) ao {appName}!</h2>
        <p style={{ fontSize: '16px', lineHeight: '1.5' }}>
          Seu acesso foi liberado com sucesso. Abaixo estão suas credenciais para o primeiro acesso:
        </p>
        <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
          <p style={{ margin: '0 0 10px 0' }}><strong>Login:</strong> {email}</p>
          {tempPassword && <p style={{ margin: '0' }}><strong>Senha temporária:</strong> {tempPassword}</p>}
        </div>
        <p style={{ fontSize: '14px', color: '#64748b' }}>
          No seu primeiro acesso, o sistema exigirá a criação de uma senha definitiva.
        </p>
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <a href={loginUrl} style={{ backgroundColor: '#3b82f6', color: '#fff', padding: '12px 24px', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold', display: 'inline-block' }}>
            Acessar Sistema
          </a>
        </div>
        {botUrl && (
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <a href={botUrl} style={{ backgroundColor: '#0ea5e9', color: '#fff', padding: '10px 22px', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold', display: 'inline-block', fontSize: '14px' }}>
              Acessar Bot
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
