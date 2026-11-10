/**
 * E-mail de quem acabou de ASSINAR um app (db/009_assinaturas_afiliados.sql).
 *
 * Mesmo esqueleto do convite padrão (`inviteEmail.ts`: tabela, cabeçalho claro,
 * logo com `height` em atributo por causa do Outlook), com o que o comprador
 * precisa além da senha: onde instalar o aplicativo (é PWA, instala pelo
 * navegador) e o bot do Telegram.
 *
 * Duas variantes:
 *   - conta nova: botão "Definir minha senha" com o `__MAGIC_LINK__`, que o
 *     `UserService` troca pelo token real na hora do envio;
 *   - assinatura reativada (a conta já existia): sem magic link, só "Entrar".
 */

const MAGIC_LINK_PLACEHOLDER = '__MAGIC_LINK__';

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export const dinheiroBr = (valor: number): string =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface AssinaturaEmailInput {
    appName: string;
    /** `aplicativos.platform_url`: onde se define a senha e se instala o PWA. */
    platformUrl: string;
    /** `aplicativos.bot_url`, quando o app tem bot. */
    botUrl?: string | null;
    appLogo?: string | null;
    nome?: string | null;
    email: string;
    valor: number;
    /** true = a conta já existia e só voltou a ficar ativa. */
    reativada?: boolean;
}

const botao = (href: string, texto: string, cor: string) => `
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${href}"
                     style="display:inline-block;background:${cor};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;">
                    ${texto}
                  </a>
                </p>`;

const passo = (numero: number, titulo: string, corpo: string) => `
                  <tr>
                    <td width="36" valign="top" style="padding:0 0 16px;">
                      <div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:#111113;color:#c6f135;font-weight:bold;font-size:13px;text-align:center;">${numero}</div>
                    </td>
                    <td valign="top" style="padding:2px 0 16px;color:#334155;font-size:14px;line-height:1.55;">
                      <strong style="color:#0f172a;">${titulo}</strong><br />${corpo}
                    </td>
                  </tr>`;

export const buildAssinaturaEmail = (input: AssinaturaEmailInput): string => {
    const app = escapeHtml(input.appName);
    // Sem isto, uma platform_url com barra no fim vira "//setup-password".
    const base = input.platformUrl.replace(/\/+$/, '');
    const bot = input.botUrl ? escapeHtml(input.botUrl) : '';
    const saudacao = input.nome ? `Olá, <strong>${escapeHtml(input.nome)}</strong>!` : 'Olá!';
    const logo = input.appLogo
        ? `<img src="${escapeHtml(input.appLogo)}" alt="${app}" height="80" style="height:80px;width:auto;display:block;margin:0 auto 12px;border:0;" />`
        : '';

    const abertura = input.reativada
        ? `Sua assinatura do <strong>${app}</strong> está ativa de novo. Sua conta é a mesma de antes, com a mesma senha.`
        : `Sua assinatura do <strong>${app}</strong> está ativa. Falta só definir a sua senha para começar.`;

    const acao = input.reativada
        ? botao(`${base}/login`, `Entrar no ${app}`, '#111113')
        : botao(`${base}/setup-password?token=${MAGIC_LINK_PLACEHOLDER}`, 'Definir minha senha', '#111113');

    const passos = [
        input.reativada
            ? passo(1, 'Entre com o seu e-mail', `Seu login é <strong>${escapeHtml(input.email)}</strong>. Esqueceu a senha? Responda este e-mail que enviamos um link novo.`)
            : passo(1, 'Defina a senha', `Seu login é <strong>${escapeHtml(input.email)}</strong>. O botão acima abre a página da senha; em seguida ela mostra um QR Code para o Google Authenticator (verificação em duas etapas).`),
        passo(
            2,
            'Instale o aplicativo',
            `Abra <a href="${base}/" style="color:#2563eb;font-weight:bold;">${base.replace(/^https?:\/\//, '')}</a> no celular ou no computador e toque em <strong>Instalar</strong>. No iPhone: Compartilhar → Adicionar à Tela de Início.`,
        ),
        ...(bot
            ? [
                  passo(
                      3,
                      'Conecte o bot do Telegram',
                      `Lance gastos por mensagem, áudio ou foto do comprovante: <a href="${bot}" style="color:#2563eb;font-weight:bold;">${bot.replace(/^https?:\/\//, '')}</a>. Para ligar o bot à sua conta, entre no aplicativo e abra Configurações → Telegram.`,
                  ),
              ]
            : []),
    ].join('');

    const autenticador = input.reativada
        ? ''
        : `
                <p style="margin:0 0 16px;padding:12px 16px;background:#eff6ff;border-left:3px solid #2563eb;color:#1e3a5f;font-size:13px;line-height:1.5;">
                  <strong>Instale o Google Authenticator antes de começar.</strong><br />
                  <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" style="color:#2563eb;font-weight:bold;">Baixar para Android</a>
                  &nbsp;·&nbsp;
                  <a href="https://apps.apple.com/app/google-authenticator/id388497605" style="color:#2563eb;font-weight:bold;">Baixar para iPhone</a>
                </p>`;

    const rodape = input.reativada
        ? 'Se você não reconhece esta assinatura, responda este e-mail.'
        : 'O link da senha é de uso único e expira em 24 horas. Se ele expirar, responda este e-mail que enviamos outro.';

    return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f3f4ee;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#c6f135;height:6px;line-height:6px;font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:28px 24px 8px;text-align:center;">
                ${logo}
                <h1 style="margin:0;color:#0f172a;font-size:22px;">${input.reativada ? 'Assinatura reativada' : `Bem-vindo(a) ao ${app}`}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px;color:#334155;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">${saudacao}</p>
                <p style="margin:0 0 24px;">${abertura}</p>
                ${acao}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                  ${passos}
                </table>
                ${autenticador}
                <p style="margin:0 0 16px;padding:12px 16px;background:#f8fafc;border-radius:8px;color:#475569;font-size:13px;line-height:1.5;">
                  <strong>Sua assinatura:</strong> ${dinheiroBr(input.valor)} por mês, cobrados
                  automaticamente no cartão pelo Mercado Pago. Para cancelar, responda este
                  e-mail ou cancele na sua conta do Mercado Pago, em Assinaturas.
                </p>
                <p style="margin:0;color:#64748b;font-size:13px;">${rodape}</p>
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
