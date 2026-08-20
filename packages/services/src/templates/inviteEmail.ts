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

    // `height` como ATRIBUTO, nao so em CSS: o Outlook usa o motor do Word e
    // ignora max-height, esticando a imagem no tamanho original. Largura fica
    // automatica porque o logo de cada app tem uma proporcao diferente.
    const logo = appLogo
        ? `<img src="${escapeHtml(appLogo)}" alt="${app}" height="80" style="height:80px;width:auto;display:block;margin:0 auto 12px;border:0;" />`
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
              <td style="background:#2563eb;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <!-- Cabecalho claro de proposito: o logo e de cada app e a maioria
                   e desenhada para fundo branco. Sobre uma faixa colorida fixa,
                   marca dourada/clara desaparece e transparencia fica suja. -->
              <td style="background:#ffffff;padding:28px 24px 8px;text-align:center;">
                ${logo}
                <h1 style="margin:0;color:#0f172a;font-size:20px;">${app}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 32px;color:#334155;font-size:15px;line-height:1.6;">
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
                <p style="margin:0 0 16px;padding:12px 16px;background:#eff6ff;border-left:3px solid #2563eb;color:#1e3a5f;font-size:13px;line-height:1.5;">
                  <strong>Tenha o celular à mão.</strong> Depois de criar a senha, esta conta
                  pede verificação em duas etapas: a própria página vai mostrar um QR Code
                  para você escanear com o app autenticador (Google Authenticator, Authy,
                  1Password ou Microsoft Authenticator). Leva menos de um minuto.
                </p>
                <p style="margin:0;color:#64748b;font-size:13px;">
                  Este link é de uso único e expira em 24 horas. Se você não esperava
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
