import React from 'react';

interface ResetPasswordEmailProps {
  email: string;
  tempPassword?: string;
  appName: string;
  loginUrl: string;
}

export const ResetPasswordEmail: React.FC<ResetPasswordEmailProps> = ({ email, tempPassword, appName, loginUrl }) => {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', color: '#333' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', border: '1px solid #eee', borderRadius: '8px', padding: '20px', backgroundColor: '#fff' }}>
        <h2 style={{ color: '#0f172a', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Redefinição de Senha - {appName}</h2>
        <p style={{ fontSize: '16px', lineHeight: '1.5' }}>
          Olá, sua senha foi redefinida por um administrador.
        </p>
        <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
          <p style={{ margin: '0 0 10px 0' }}><strong>Login:</strong> {email}</p>
          {tempPassword && <p style={{ margin: '0' }}><strong>Nova Senha Temporária:</strong> {tempPassword}</p>}
        </div>
        <p style={{ fontSize: '14px', color: '#64748b' }}>
          Por favor, utilize esta senha temporária para acessar o sistema. Você deverá criar uma nova senha definitiva no primeiro acesso.
        </p>
        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <a href={loginUrl} style={{ backgroundColor: '#3b82f6', color: '#fff', padding: '12px 24px', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold', display: 'inline-block' }}>
            Acessar Sistema
          </a>
        </div>
      </div>
    </div>
  );
};
