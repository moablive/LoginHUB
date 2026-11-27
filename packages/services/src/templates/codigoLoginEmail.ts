/**
 * E-mail do código de login (db/024). O código vai no CORPO — nunca no assunto,
 * que aparece na tela bloqueada e em notificações — e o aviso de que ninguém
 * do suporte o pede fica acima do botão de ajuda.
 */

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export interface CodigoLoginEmailInput {
    appName: string;
    appLogo?: string | null;
    nome?: string | null;
    codigo: string;
    minutos: number;
}

export const buildCodigoLoginEmail = ({ appName, appLogo, nome, codigo, minutos }: CodigoLoginEmailInput): string => {
    const app = escapeHtml(appName);
    const saudacao = nome ? `Olá, <strong>${escapeHtml(nome)}</strong>!` : 'Olá!';
    const logo = appLogo
        ? `<img src="${escapeHtml(appLogo)}" alt="${app}" height="80" style="height:80px;width:auto;display:block;margin:0 auto 12px;border:0;" />`
        : '';
    // Espaço entre os grupos de 3 dígitos só para a leitura; o código é o mesmo.
    const legivel = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;

    return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#2563eb;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
            <tr>
              <td style="background:#ffffff;padding:28px 24px 8px;text-align:center;">
                ${logo}
                <h1 style="margin:0;color:#0f172a;font-size:20px;">${app}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 32px;color:#334155;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">${saudacao}</p>
                <p style="margin:0 0 20px;">Use este código para entrar no <strong>${app}</strong>:</p>
                <p style="margin:0 0 20px;text-align:center;font-size:34px;letter-spacing:6px;font-weight:bold;color:#0f172a;font-family:'Courier New',monospace;">${legivel}</p>
                <p style="margin:0 0 16px;color:#64748b;font-size:13px;">Vale por ${minutos} minutos e só pode ser usado uma vez.</p>
                <p style="margin:0;padding:12px 16px;background:#fef2f2;border-left:3px solid #dc2626;color:#7f1d1d;font-size:13px;line-height:1.5;">
                  <strong>Ninguém do suporte pede este código.</strong> Se você não tentou entrar,
                  ignore este e-mail: sua conta continua protegida.
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
