/**
 * Template padrão do convite, no backend.
 *
 * Antes o LoginHUB só enviava e-mail se quem chamava mandasse o `emailHtml`
 * pronto — os templates viviam na UI, como componentes React renderizados no
 * navegador. Consequência: integração server-to-server (a Sul Alimentos, por
 * exemplo) precisava carregar um template próprio, duplicando o assunto do
 * hub, e quem esquecesse criava usuário sem nunca enviar convite.
 *
 * Este é o padrão de quem não manda HTML. `emailHtml` continua vencendo quando
 * vem preenchido, então a UI segue usando os templates dela.
 *
 * O `__MAGIC_LINK__` é substituído pelo token real na hora do envio.
 */

const MAGIC_LINK_PLACEHOLDER = '__MAGIC_LINK__';

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export interface InviteEmailInput {
    /** Nome do aplicativo, como cadastrado em `aplicativos.nome`. */
    appName: string;
    /** Para onde o botão aponta — `aplicativos.platform_url`. */
    platformUrl: string;
    /** Logo do app (`aplicativos.logo`), quando houver. */
    appLogo?: string | null;
    /** Nome de quem está sendo convidado, para a saudação. */
    nome?: string | null;
}

export const buildInviteEmail = ({ appName, platformUrl, appLogo, nome }: InviteEmailInput): string => {
    const app = escapeHtml(appName);
    // Sem isto, uma platform_url com barra no fim vira ".../setup-password" duplicado.
    const base = platformUrl.replace(/\/+$/, '');
    const saudacao = nome ? `Olá, <strong>${escapeHtml(nome)}</strong>!` : 'Olá!';

    const logo = appLogo
        ? `<img src="${escapeHtml(appLogo)}" alt="${app}" style="max-height:44px;margin-bottom:8px;" />`
        : '';

    return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#2563eb;padding:24px;text-align:center;">
                ${logo}
                <h1 style="margin:0;color:#ffffff;font-size:20px;">${app}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;color:#334155;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">${saudacao}</p>
                <p style="margin:0 0 24px;">
                  Seu acesso ao <strong>${app}</strong> foi criado. Clique no botão
                  abaixo para definir sua senha e começar a usar o sistema.
                </p>
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${base}/setup-password?token=${MAGIC_LINK_PLACEHOLDER}"
                     style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;">
                    Definir minha senha
                  </a>
                </p>
                <p style="margin:0;color:#64748b;font-size:13px;">
                  Este link é de uso único e expira em 1 hora. Se você não esperava
                  este e-mail, pode ignorá-lo com segurança.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};
