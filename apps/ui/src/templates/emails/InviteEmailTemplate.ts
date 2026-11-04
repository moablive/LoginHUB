import { esc } from './html';

export interface InviteEmailProps {
  email: string;
  magicLinkToken?: string;
  appName: string;
  loginUrl?: string | null;
  botUrl?: string | null;
  appLogo?: string | null;
}

/** Convite padrão do hub. Devolve o HTML pronto para o `emailHtml` da API. */
export function InviteEmailTemplate({ email, magicLinkToken, appName, loginUrl, botUrl, appLogo }: InviteEmailProps): string {
  // `platform_url` com barra final produzia `//setup-password`, e o Vue Router
  // dos apps NAO casa esse caminho: o nginx devolve o SPA (200, parece certo),
  // nenhuma rota bate, o guard manda para /login e a pessoa ve a tela de login
  // em vez do formulario de senha. Metade dos apps tem a barra cadastrada.
  const base = (loginUrl || 'http://localhost:3006').replace(/\/+$/, '');
  const finalLoginUrl = magicLinkToken ? `${base}/setup-password?token=${magicLinkToken}` : loginUrl;

  return (
    '<div style="font-family:sans-serif;padding:20px;color:#333">' +
    '<div style="max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:8px;padding:20px;background-color:#fff">' +
    (appLogo
      ? '<div style="text-align:center;margin-bottom:20px">' +
        `<img src="${esc(appLogo)}" alt="${esc(`Logo ${appName}`)}" style="max-width:120px;max-height:120px;border-radius:8px"/>` +
        '</div>'
      : '') +
    `<h2 style="color:#0f172a;border-bottom:1px solid #eee;padding-bottom:10px">Bem-vindo(a) ao ${esc(appName)}!</h2>` +
    '<p style="font-size:16px;line-height:1.5">Seu acesso foi liberado com sucesso. Para acessar sua conta, clique no botão abaixo e defina sua senha:</p>' +
    '<div style="background-color:#f8fafc;padding:15px;border-radius:6px;margin:20px 0">' +
    `<p style="margin:0 0 10px 0"><strong>Login:</strong> ${esc(email)}</p>` +
    '</div>' +
    '<p style="font-size:14px;color:#64748b">Este link é seguro e só pode ser usado uma vez. Se você não solicitou este acesso, ignore este e-mail.</p>' +
    (finalLoginUrl
      ? '<div style="text-align:center;margin-top:30px">' +
        `<a href="${esc(finalLoginUrl)}" style="background-color:#3b82f6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block">Definir minha senha</a>` +
        '</div>'
      : '') +
    (botUrl
      ? '<div style="text-align:center;margin-top:12px">' +
        `<a href="${esc(botUrl)}" style="background-color:#0ea5e9;color:#fff;padding:10px 22px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;font-size:14px">Acessar Bot</a>` +
        '</div>'
      : '') +
    '</div>' +
    '</div>'
  );
}
