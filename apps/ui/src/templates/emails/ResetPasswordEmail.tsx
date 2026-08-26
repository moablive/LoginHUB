import React from 'react';

interface ResetPasswordEmailProps {
  email: string;
  magicLinkToken?: string;
  appName: string;
  loginUrl?: string | null;
  appLogo?: string | null;
}

export const ResetPasswordEmail: React.FC<ResetPasswordEmailProps> = ({ email, magicLinkToken, appName, loginUrl, appLogo }) => {
  // Sem `platform_url` do app, o link aponta para o PRÓPRIO hub — que é a
  // origem onde este template está sendo renderizado e tem `/setup-password`
  // funcionando para qualquer tenant. O fallback anterior era
  // `http://localhost:3006`, endereço que não resolve na caixa de ninguém.
  // A barra final precisa cair: `platform_url` com `/` no fim gerava
  // `//setup-password`, caminho que o Vue Router dos apps nao casa — o SPA
  // carrega, nenhuma rota bate e o guard manda para /login.
  const base = (loginUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  const finalLoginUrl = magicLinkToken ? `${base}/setup-password?token=${magicLinkToken}` : loginUrl;

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', color: '#333' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', border: '1px solid #eee', borderRadius: '8px', padding: '20px', backgroundColor: '#fff' }}>
        {appLogo && (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <img src={appLogo} alt={`Logo ${appName}`} style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '8px' }} />
          </div>
        )}
        <h2 style={{ color: '#0f172a', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Redefinição de Senha - {appName}</h2>
        <p style={{ fontSize: '16px', lineHeight: '1.5' }}>
          Olá, sua senha foi redefinida por um administrador.
        </p>
        <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '6px', margin: '20px 0' }}>
          <p style={{ margin: '0 0 10px 0' }}><strong>Login:</strong> {email}</p>
        </div>
        <p style={{ fontSize: '14px', color: '#64748b' }}>
          Por favor, utilize o botão abaixo para definir sua nova senha e acessar o sistema. Este link é seguro e só pode ser usado uma vez.
        </p>
        {finalLoginUrl && (
          <div style={{ textAlign: 'center', marginTop: '30px' }}>
            <a href={finalLoginUrl} style={{ backgroundColor: '#3b82f6', color: '#fff', padding: '12px 24px', textDecoration: 'none', borderRadius: '6px', fontWeight: 'bold', display: 'inline-block' }}>
              Definir nova senha
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
