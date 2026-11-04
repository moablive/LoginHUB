import { esc } from './html';

export interface ResetPasswordEmailProps {
  email: string;
  magicLinkToken?: string;
  appName: string;
  loginUrl?: string | null;
  appLogo?: string | null;
}

/** E-mail do reset de senha feito pelo administrador. */
export function ResetPasswordEmail({ email, magicLinkToken, appName, loginUrl, appLogo }: ResetPasswordEmailProps): string {
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
    '<div style="font-family:sans-serif;padding:20px;color:#333">' +
    '<div style="max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:20px;background-color:#fff">' +
    (appLogo
      ? '<div style="text-align:center;margin-bottom:20px">' +
        `<img src="${esc(appLogo)}" alt="${esc(`Logo ${appName}`)}" style="max-width:120px;max-height:120px;border-radius:8px"/>` +
        '</div>'
      : '') +
    `<h2 style="color:#0f172a;border-bottom:1px solid #eee;padding-bottom:10px">Redefinição de Senha - ${esc(appName)}</h2>` +
    '<p style="font-size:16px;line-height:1.5">Olá, sua senha foi redefinida por um administrador.</p>' +
    '<div style="background-color:#f8fafc;padding:15px;border-radius:6px;margin:20px 0">' +
    `<p style="margin:0 0 10px 0"><strong>Login:</strong> ${esc(email)}</p>` +
    '</div>' +
    '<p style="font-size:14px;color:#64748b">Por favor, utilize o botão abaixo para definir sua nova senha e acessar o sistema. Este link é seguro e só pode ser usado uma vez.</p>' +
    (finalLoginUrl
      ? '<div style="text-align:center;margin-top:30px">' +
        `<a href="${esc(finalLoginUrl)}" style="background-color:#3b82f6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">Definir nova senha</a>` +
        '</div>'
      : '') +
    '</div>' +
    '</div>'
  );
}
