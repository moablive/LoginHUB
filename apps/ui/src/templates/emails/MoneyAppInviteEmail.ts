import { esc } from './html';

export interface MoneyAppInviteEmailProps {
  email: string;
  magicLinkToken?: string;
  loginUrl?: string | null;
  botUrl?: string | null;
  appLogo?: string | null;
}

/** Convite com a cara do MoneyAPP (tema escuro, verde). */
export function MoneyAppInviteEmail({ email, magicLinkToken, loginUrl, botUrl, appLogo }: MoneyAppInviteEmailProps): string {
  // `platform_url` com barra final produzia `//setup-password`, e o Vue Router
  // dos apps NAO casa esse caminho: o nginx devolve o SPA (200, parece certo),
  // nenhuma rota bate, o guard manda para /login e a pessoa ve a tela de login
  // em vez do formulario de senha. Metade dos apps tem a barra cadastrada.
  const base = (loginUrl || 'http://localhost:3006').replace(/\/+$/, '');
  const finalLoginUrl = magicLinkToken ? `${base}/setup-password?token=${magicLinkToken}` : loginUrl;

  return (
    '<div style="font-family:&quot;Inter&quot;, sans-serif;padding:20px;color:#e2e8f0;background-color:#0f172a">' +
    '<div style="max-width:600px;margin:0 auto;border:1px solid #334155;border-radius:12px;padding:30px;background-color:#1e293b">' +
    (appLogo
      ? '<div style="text-align:center;margin-bottom:20px">' +
        `<img src="${esc(appLogo)}" alt="Logo MoneyAPP" style="max-width:120px;max-height:120px;border-radius:8px"/>` +
        '</div>'
      : '') +
    '<h2 style="color:#10b981;border-bottom:1px solid #334155;padding-bottom:15px;margin-top:0">Seu acesso ao MoneyAPP foi liberado!</h2>' +
    '<p style="font-size:16px;line-height:1.6;color:#cbd5e1">Bem-vindo(a) ao MoneyAPP. Para acessar sua conta, clique no botão abaixo e defina sua senha:</p>' +
    '<div style="background-color:#0f172a;border:1px solid #334155;padding:20px;border-radius:8px;margin:25px 0">' +
    `<p style="margin:0 0 12px 0;font-size:15px"><span style="color:#94a3b8">Login:</span> <strong>${esc(email)}</strong></p>` +
    '</div>' +
    '<p style="font-size:14px;color:#94a3b8;line-height:1.5">Este link é seguro e só pode ser usado uma vez. Se você não solicitou este acesso, ignore este e-mail.' +
    (botUrl ? ' Após criar sua nova senha, você poderá se conectar ao nosso assistente.' : '') +
    '</p>' +
    (finalLoginUrl
      ? '<div style="text-align:center;margin-top:35px">' +
        `<a href="${esc(finalLoginUrl)}" style="background-color:#10b981;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;font-size:16px">Definir minha senha</a>` +
        '</div>'
      : '') +
    (botUrl
      ? '<div style="text-align:center;margin-top:15px">' +
        `<a href="${esc(botUrl)}" style="background-color:#0ea5e9;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;font-size:15px">Acessar Bot</a>` +
        '</div>'
      : '') +
    '</div>' +
    '</div>'
  );
}
