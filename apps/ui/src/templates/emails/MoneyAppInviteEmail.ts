import { esc } from './html';

export interface MoneyAppInviteEmailProps {
  email: string;
  magicLinkToken?: string;
  loginUrl?: string | null;
  botUrl?: string | null;
  appLogo?: string | null;
}

/**
 * Convite do MoneyAPP feito à mão pelo painel.
 *
 * Revisto em 10/11/2026 para ficar igual ao e-mail de quem assina
 * (`packages/services/src/templates/assinaturaEmail.ts`): fundo claro (cliente
 * de e-mail inverte tema escuro), tabela, logo com `height` em atributo, o
 * aviso do Google Authenticator (o 2FA é obrigatório e o texto antigo não
 * falava dele), o prazo de 24 horas do link, onde instalar o aplicativo e o
 * bot do Telegram.
 */
export function MoneyAppInviteEmail({ email, magicLinkToken, loginUrl, botUrl, appLogo }: MoneyAppInviteEmailProps): string {
  // `platform_url` com barra final produzia `//setup-password`, e o Vue Router
  // dos apps NAO casa esse caminho: o nginx devolve o SPA (200, parece certo),
  // nenhuma rota bate, o guard manda para /login e a pessoa ve a tela de login
  // em vez do formulario de senha. Metade dos apps tem a barra cadastrada.
  const base = (loginUrl || 'http://localhost:3006').replace(/\/+$/, '');
  const finalLoginUrl = magicLinkToken ? `${base}/setup-password?token=${magicLinkToken}` : loginUrl;
  const semProtocolo = (url: string) => url.replace(/^https?:\/\//, '');

  const passo = (numero: number, titulo: string, corpo: string) =>
    '<tr>' +
    '<td width="36" valign="top" style="padding:0 0 16px">' +
    `<div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:#111113;color:#c6f135;font-weight:bold;font-size:13px;text-align:center">${numero}</div>` +
    '</td>' +
    `<td valign="top" style="padding:2px 0 16px;color:#334155;font-size:14px;line-height:1.55"><strong style="color:#0f172a">${titulo}</strong><br/>${corpo}</td>` +
    '</tr>';

  return (
    '<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f3f4ee;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">' +
    '<tr><td style="background:#c6f135;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 24px 8px;text-align:center">' +
    (appLogo ? `<img src="${esc(appLogo)}" alt="MoneyAPP" height="80" style="height:80px;width:auto;display:block;margin:0 auto 12px;border:0"/>` : '') +
    '<h1 style="margin:0;color:#0f172a;font-size:22px">Seu acesso ao MoneyAPP foi liberado</h1>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 28px 28px;color:#334155;font-size:15px;line-height:1.6">' +
    '<p style="margin:0 0 24px">Sua conta no <strong>MoneyAPP</strong> está criada. Falta só definir a sua senha para começar.</p>' +
    (finalLoginUrl
      ? '<p style="margin:0 0 24px;text-align:center">' +
        `<a href="${esc(finalLoginUrl)}" style="display:inline-block;background:#111113;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold">Definir minha senha</a>` +
        '</p>'
      : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">' +
    passo(
      1,
      'Defina a senha',
      `Seu login é <strong>${esc(email)}</strong>. Depois da senha, a página mostra um QR Code para o Google Authenticator (verificação em duas etapas).`,
    ) +
    (loginUrl
      ? passo(
          2,
          'Instale o aplicativo',
          `Abra <a href="${esc(base)}/" style="color:#2563eb;font-weight:bold">${esc(semProtocolo(base))}</a> no celular ou no computador e toque em <strong>Instalar</strong>. No iPhone: Compartilhar → Adicionar à Tela de Início.`,
        )
      : '') +
    (botUrl
      ? passo(
          loginUrl ? 3 : 2,
          'Conecte o bot do Telegram',
          `Lance gastos por mensagem, áudio ou foto do comprovante: <a href="${esc(botUrl)}" style="color:#2563eb;font-weight:bold">${esc(semProtocolo(botUrl))}</a>. Para ligar o bot à sua conta, entre no aplicativo e abra Configurações → Telegram.`,
        )
      : '') +
    '</table>' +
    '<p style="margin:0 0 16px;padding:12px 16px;background:#eff6ff;border-left:3px solid #2563eb;color:#1e3a5f;font-size:13px;line-height:1.5">' +
    '<strong>Instale o Google Authenticator antes de começar.</strong><br/>' +
    '<a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" style="color:#2563eb;font-weight:bold">Baixar para Android</a>' +
    ' &nbsp;·&nbsp; ' +
    '<a href="https://apps.apple.com/app/google-authenticator/id388497605" style="color:#2563eb;font-weight:bold">Baixar para iPhone</a>' +
    '</p>' +
    '<p style="margin:0;color:#64748b;font-size:13px">O link da senha é de uso único e expira em 24 horas. Se você não esperava este e-mail, pode ignorá-lo com segurança.</p>' +
    '</td></tr></table>' +
    '</td></tr></table></body></html>'
  );
}
